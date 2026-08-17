import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteCustomersPage } from "@/components/QuoteCustomersPage";
import i18n from "@/i18n";
import {
  formatLabeledValue,
  mapQuoteCustomerRow,
  type QuoteCustomerHistory,
  type QuoteCustomerListResult,
} from "@/lib/quote-customers";

const customerResult: QuoteCustomerListResult = {
  total: 31,
  items: [
    {
      email: "sales@foodchannels-catering.com",
      customerName: "Ada",
      latestOrderNumber: "P-1143",
      latestOrderId: "order-1143",
      latestDocumentType: "order",
      companies: [
        {
          companyName: "K&K property",
          tag: "B-1274",
          orderId: "order-1274",
          documentType: "order",
        },
        {
          companyName: "611教會",
          tag: "P-1100",
          orderId: "quote-1100",
          documentType: "quote",
        },
      ],
      orderCount: 312,
      orderTotal: 940852.4,
      currency: "HKD",
      hasRemarks: true,
    },
    {
      email: "sales@winepassions.com",
      customerName: "Franco Lee",
      latestOrderNumber: "#4455",
      latestOrderId: "order-4455",
      latestDocumentType: "order",
      companies: [
        {
          companyName: "Wine Passions",
          tag: "#4455",
          orderId: "order-4455",
          documentType: "order",
        },
      ],
      orderCount: 144,
      orderTotal: 190098.65,
      currency: "HKD",
      hasRemarks: false,
    },
  ],
};

const history: QuoteCustomerHistory = {
  orders: [
    {
      id: "order-1143",
      orderNumber: "P-1143",
      documentType: "order",
      customerName: "Ada",
      companyName: "K&K property",
      grandTotal: 12880,
      currency: "HKD",
      customerNote: "需要素食選項",
      createdAt: "2026-08-12T01:00:00.000Z",
    },
  ],
  remarks: [
    {
      id: "note-order-1143",
      body: "需要素食選項",
      orderNumber: "P-1143",
      createdAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

describe("formatLabeledValue", () => {
  it("joins a label and tag the way the customer list displays them", () => {
    expect(formatLabeledValue("Ada", "P-1143")).toBe("Ada : P-1143");
    expect(formatLabeledValue(null, "#4455")).toBe("— : #4455");
  });
});

describe("mapQuoteCustomerRow", () => {
  it("maps aggregated customer rows from the RPC payload", () => {
    expect(
      mapQuoteCustomerRow({
        email: "ada@example.com",
        customer_name: "Ada",
        latest_order_number: "P-1143",
        latest_order_id: "order-1",
        latest_document_type: "order",
        companies: [
          {
            companyName: "K&K property",
            tag: "B-1274",
            orderId: "order-2",
            documentType: "order",
          },
        ],
        order_count: "312",
        order_total: "940852.40",
        currency: "HKD",
        has_remarks: true,
        total_count: "2814",
      }),
    ).toMatchObject({
      email: "ada@example.com",
      customerName: "Ada",
      orderCount: 312,
      orderTotal: 940852.4,
      hasRemarks: true,
    });
  });
});

describe("Quote customers list", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders email-grouped customer fields in the shared list layout", async () => {
    const loadCustomers = vi.fn().mockResolvedValue(customerResult);

    render(
      <MemoryRouter>
        <QuoteCustomersPage loadCustomers={loadCustomers} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "客戶列表" }),
    ).toBeInTheDocument();
    expect(screen.getByText("顯示 1–15，共 31 位")).toBeInTheDocument();
    expect(screen.getByText("sales@foodchannels-catering.com")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "P-1143" })).toHaveAttribute(
      "href",
      "/orders/order-1143",
    );
    expect(screen.getByText("K&K property")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B-1274" })).toHaveAttribute(
      "href",
      "/orders/order-1274",
    );
    expect(screen.getByText("611教會")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "P-1100" })).toHaveAttribute(
      "href",
      "/quotes/quote-1100",
    );
    expect(screen.getByText("312")).toBeInTheDocument();
    expect(screen.getByText("HK$940,852")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "過往訂單 / 客戶備註 sales@foodchannels-catering.com",
      }),
    ).toBeInTheDocument();
  });

  it("submits a server-side search and resets to the first page", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(customerResult);

    render(
      <MemoryRouter>
        <QuoteCustomersPage loadCustomers={loadCustomers} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadCustomers).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByPlaceholderText("搜尋客戶 (以客戶資料)"),
      "Ada",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadCustomers).toHaveBeenLastCalledWith({
        page: 1,
        search: "Ada",
        sort: "order_total",
        ascending: false,
      }),
    );
  });

  it("paginates customers in groups of fifteen and can sort by total", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(customerResult);

    render(
      <MemoryRouter>
        <QuoteCustomersPage loadCustomers={loadCustomers} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("spinbutton", { name: "跳至頁碼" }),
    ).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "下一頁" }));

    await waitFor(() =>
      expect(loadCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, ascending: false }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "按訂單總額排序" }));

    await waitFor(() =>
      expect(loadCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, ascending: true }),
      ),
    );
  });

  it("opens past orders and customer remarks in a side panel", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(customerResult);
    const loadHistory = vi.fn().mockResolvedValue(history);

    render(
      <MemoryRouter>
        <QuoteCustomersPage
          loadCustomers={loadCustomers}
          loadHistory={loadHistory}
        />
      </MemoryRouter>,
    );

    await screen.findByText("sales@foodchannels-catering.com");
    await user.click(
      screen.getByRole("button", {
        name: "過往訂單 / 客戶備註 sales@foodchannels-catering.com",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "過往訂單 / 客戶備註",
    });
    await waitFor(() => expect(loadHistory).toHaveBeenCalledWith(
      "sales@foodchannels-catering.com",
    ));
    expect(within(dialog).getByText("過往訂單")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "P-1143" }))
      .toHaveAttribute("href", "/orders/order-1143");
    expect(within(dialog).getByText("K&K property")).toBeInTheDocument();
    expect(within(dialog).getByText("需要素食選項")).toBeInTheDocument();
  });

  it("shows a clear migration state when the aggregation function is missing", async () => {
    const loadCustomers = vi.fn().mockRejectedValue({ code: "42883" });

    render(
      <MemoryRouter>
        <QuoteCustomersPage loadCustomers={loadCustomers} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("客戶資料彙總尚未完成遷移"),
    ).toBeInTheDocument();
  });
});
