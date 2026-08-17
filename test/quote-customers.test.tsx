import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteCustomersPage } from "@/components/QuoteCustomersPage";
import i18n from "@/i18n";
import {
  formatLabeledValue,
  groupQuoteCustomerMessages,
  mapQuoteCustomerRow,
  messageTabFromCategory,
  summarizeCompanies,
  type QuoteCustomerHistory,
  type QuoteCustomerListResult,
  type QuoteCustomerMessages,
} from "@/lib/quote-customers";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin", user_name: "Mandy", email: "mandy@example.com" },
  }),
}));

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
  total: 31,
  remarks: [],
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
    {
      id: "quote-1100",
      orderNumber: "P-1100",
      documentType: "quote",
      customerName: "Ada",
      companyName: "611教會",
      grandTotal: 4200,
      currency: "HKD",
      customerNote: null,
      createdAt: "2026-07-02T04:00:00.000Z",
    },
  ],
};

const messages: QuoteCustomerMessages = {
  complaint: [
    {
      id: "complaint-1",
      tab: "complaint",
      body: "20/12: 少左兩份沙律，退款 $516",
      authorName: "Candice",
      orderNumber: "#4680",
      orderId: "order-4680",
      documentType: "order",
      createdAt: "2024-04-12T06:28:00.000Z",
    },
  ],
  like: [],
  note: [
    {
      id: "note-1",
      tab: "note",
      body: "payment deadline 1/6",
      authorName: "Mandy",
      orderNumber: "B-1178",
      orderId: "order-1178",
      documentType: "order",
      createdAt: "2025-05-27T02:26:00.000Z",
    },
  ],
};

describe("formatLabeledValue", () => {
  it("joins a label and tag the way the customer list displays them", () => {
    expect(formatLabeledValue("Ada", "P-1143")).toBe("Ada : P-1143");
    expect(formatLabeledValue(null, "#4455")).toBe("— : #4455");
  });
});

describe("summarizeCompanies", () => {
  it("keeps a single company name and counts extras for multi-company rows", () => {
    expect(
      summarizeCompanies([
        {
          companyName: "K&K property",
          tag: "B-1274",
          orderId: "order-1",
          documentType: "order",
        },
      ]),
    ).toMatchObject({ primaryName: "K&K property", extraCount: 0, total: 1 });
    expect(
      summarizeCompanies(customerResult.items[0].companies),
    ).toMatchObject({ primaryName: "K&K property", extraCount: 1, total: 2 });
  });

  it("ignores blank company snapshots instead of treating them as a company", () => {
    expect(
      summarizeCompanies([
        {
          companyName: null,
          tag: "P-1143",
          orderId: "order-1143",
          documentType: "order",
        },
        {
          companyName: "K&K Property",
          tag: "B-1538",
          orderId: "order-1538",
          documentType: "order",
        },
        {
          companyName: "   ",
          tag: "P-1100",
          orderId: "order-1100",
          documentType: "quote",
        },
      ]),
    ).toMatchObject({
      primaryName: "K&K Property",
      extraCount: 0,
      total: 1,
    });
  });
});

describe("customer message grouping", () => {
  it("maps Bubble comment categories onto the three message tabs", () => {
    expect(messageTabFromCategory("orderdislike")).toBe("complaint");
    expect(messageTabFromCategory("orderlike")).toBe("like");
    expect(messageTabFromCategory("customer note")).toBe("note");
    expect(messageTabFromCategory("other")).toBeNull();
  });

  it("groups messages chronologically by tab", () => {
    expect(
      groupQuoteCustomerMessages([
        messages.note[0],
        messages.complaint[0],
      ]),
    ).toMatchObject({
      complaint: [{ id: "complaint-1" }],
      like: [],
      note: [{ id: "note-1" }],
    });
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
            companyName: null,
            tag: "P-1143",
            orderId: "order-1",
            documentType: "order",
          },
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
      companies: [
        {
          companyName: "K&K property",
          tag: "B-1274",
          orderId: "order-2",
          documentType: "order",
        },
      ],
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
    expect(screen.getByText("共 2 間公司")).toBeInTheDocument();
    expect(screen.queryByText("611教會")).not.toBeInTheDocument();
    expect(screen.getByText("Wine Passions")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "#4455" })[0]).toHaveAttribute(
      "href",
      "/orders/order-4455",
    );
    expect(screen.getByText("312")).toBeInTheDocument();
    expect(screen.getByText("HK$940,852.40")).toBeInTheDocument();
    expect(screen.getByText("HK$190,098.65")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "留言 sales@foodchannels-catering.com",
      }),
    ).toBeInTheDocument();
  });

  it("shows the latest named company instead of a blank snapshot", async () => {
    const loadCustomers = vi.fn().mockResolvedValue({
      total: 1,
      items: [
        {
          ...customerResult.items[0],
          companies: [
            {
              companyName: null,
              tag: "P-1143",
              orderId: "order-1143",
              documentType: "order",
            },
            {
              companyName: "K&K Property",
              tag: "B-1538",
              orderId: "order-1538",
              documentType: "order",
            },
          ],
        },
      ],
    });

    render(
      <MemoryRouter>
        <QuoteCustomersPage loadCustomers={loadCustomers} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("K&K Property")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B-1538" })).toHaveAttribute(
      "href",
      "/orders/order-1538",
    );
    expect(screen.queryByText("共 1 間公司")).not.toBeInTheDocument();
    expect(screen.queryByText("共 2 間公司")).not.toBeInTheDocument();
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
    expect(screen.getByRole("columnheader", { name: "訂單總額" }))
      .toHaveAttribute("aria-sort", "descending");
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
    expect(screen.getByRole("columnheader", { name: "訂單總額" }))
      .toHaveAttribute("aria-sort", "ascending");
  });

  it("opens the customer order table from the customer name", async () => {
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
      screen.getByRole("button", { name: "查看訂單 Ada" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "公司與訂單",
    });
    expect(dialog).toHaveClass("side-panel-majority");
    await waitFor(() =>
      expect(loadHistory).toHaveBeenCalledWith({
        email: "sales@foodchannels-catering.com",
        page: 1,
        search: "",
      }),
    );
    expect(dialog.querySelector(".quotes-toolbar")).toBeInTheDocument();
    const detailTable = within(dialog).getByRole("table");
    expect(detailTable.closest(".quotes-table-wrap")).toHaveClass(
      "operational-table-wrap",
    );
    expect(dialog.querySelector(".quotes-panel")).toBeInTheDocument();
    expect(within(detailTable).getByText("公司")).toBeInTheDocument();
    expect(within(detailTable).getByText("訂單號碼")).toBeInTheDocument();
    expect(within(detailTable).getByText("K&K property")).toBeInTheDocument();
    expect(within(detailTable).getByRole("link", { name: "P-1143" }))
      .toHaveAttribute("href", "/orders/order-1143");
    expect(within(detailTable).getByText("611教會")).toBeInTheDocument();
    expect(within(detailTable).getByRole("link", { name: "P-1100" }))
      .toHaveAttribute("href", "/quotes/quote-1100");
    expect(within(detailTable).getByText("HK$12,880.00")).toBeInTheDocument();
    expect(within(detailTable).getByText("HK$4,200.00")).toBeInTheDocument();
  });

  it("opens a company-order table in the side panel from a multi-company row", async () => {
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
        name: "查看公司與訂單 sales@foodchannels-catering.com",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "公司與訂單",
    });
    await waitFor(() => expect(loadHistory).toHaveBeenCalledWith({
      email: "sales@foodchannels-catering.com",
      page: 1,
      search: "",
    }));
    const detailTable = within(dialog).getByRole("table");
    expect(within(detailTable).getByText("公司")).toBeInTheDocument();
    expect(within(detailTable).getByText("訂單號碼")).toBeInTheDocument();
    expect(within(detailTable).getByText("K&K property")).toBeInTheDocument();
    expect(within(detailTable).getByRole("link", { name: "P-1143" }))
      .toHaveAttribute("href", "/orders/order-1143");
    expect(within(detailTable).getByText("611教會")).toBeInTheDocument();
    expect(within(detailTable).getByRole("link", { name: "P-1100" }))
      .toHaveAttribute("href", "/quotes/quote-1100");
  });

  it("searches and paginates the customer order table", async () => {
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
      screen.getByRole("button", { name: "查看訂單 Ada" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "公司與訂單",
    });
    expect(within(dialog).getByText("顯示 1–15，共 31 筆")).toBeInTheDocument();
    await user.type(
      within(dialog).getByPlaceholderText("搜尋公司或訂單號碼"),
      "611",
    );
    await user.click(within(dialog).getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadHistory).toHaveBeenLastCalledWith({
        email: "sales@foodchannels-catering.com",
        page: 1,
        search: "611",
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "下一頁" }));
    await waitFor(() =>
      expect(loadHistory).toHaveBeenLastCalledWith({
        email: "sales@foodchannels-catering.com",
        page: 2,
        search: "611",
      }),
    );
  });

  it("opens a chat-style messages panel from the row action", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(customerResult);
    const loadMessages = vi.fn().mockResolvedValue(messages);
    const createNote = vi.fn().mockResolvedValue({
      id: "note-2",
      tab: "note",
      body: "已出月結",
      authorName: "Mandy",
      orderNumber: null,
      orderId: null,
      documentType: null,
      createdAt: "2026-08-17T06:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <QuoteCustomersPage
          loadCustomers={loadCustomers}
          loadMessages={loadMessages}
          createNote={createNote}
        />
      </MemoryRouter>,
    );

    await screen.findByText("sales@foodchannels-catering.com");
    await user.click(
      screen.getByRole("button", {
        name: "留言 sales@foodchannels-catering.com",
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "留言" });
    expect(dialog).toHaveClass("side-panel-messages");
    await waitFor(() =>
      expect(loadMessages).toHaveBeenCalledWith(
        "sales@foodchannels-catering.com",
      ),
    );
    expect(within(dialog).getByRole("tab", { name: "訂單投訴 (1)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "訂單讚好 (0)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "客戶備註 (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(dialog).getByText("Mandy")).toBeInTheDocument();
    expect(within(dialog).getByText("payment deadline 1/6")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "B-1178" })).toHaveAttribute(
      "href",
      "/orders/order-1178",
    );

    await user.click(within(dialog).getByRole("tab", { name: "訂單投訴 (1)" }));
    expect(within(dialog).getByText("Candice")).toBeInTheDocument();
    expect(within(dialog).getByText("20/12: 少左兩份沙律，退款 $516")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "#4680" })).toHaveAttribute(
      "href",
      "/orders/order-4680",
    );

    await user.click(within(dialog).getByRole("tab", { name: "客戶備註 (1)" }));
    await user.type(within(dialog).getByPlaceholderText("在此輸入…"), "已出月結");
    await user.click(within(dialog).getByRole("button", { name: "送出留言" }));

    await waitFor(() =>
      expect(createNote).toHaveBeenCalledWith({
        email: "sales@foodchannels-catering.com",
        body: "已出月結",
        authorName: "Mandy",
        orderId: null,
      }),
    );
    expect(await within(dialog).findByText("已出月結")).toBeInTheDocument();
  });

  it("replies to a customer note on the same order", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(customerResult);
    const loadMessages = vi.fn().mockResolvedValue(messages);
    const createNote = vi.fn().mockResolvedValue({
      id: "note-reply",
      tab: "note",
      body: "已追數",
      authorName: "Mandy",
      orderNumber: "B-1178",
      orderId: "order-1178",
      documentType: "order",
      createdAt: "2026-08-17T06:10:00.000Z",
    });

    render(
      <MemoryRouter>
        <QuoteCustomersPage
          loadCustomers={loadCustomers}
          loadMessages={loadMessages}
          createNote={createNote}
        />
      </MemoryRouter>,
    );

    await screen.findByText("sales@foodchannels-catering.com");
    await user.click(
      screen.getByRole("button", {
        name: "留言 sales@foodchannels-catering.com",
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "留言" });
    await within(dialog).findByText("payment deadline 1/6");
    await user.click(within(dialog).getByRole("button", { name: "回復" }));
    expect(within(dialog).getByText(/回復 B-1178/)).toBeInTheDocument();
    await user.type(within(dialog).getByPlaceholderText("在此輸入…"), "已追數");
    await user.click(within(dialog).getByRole("button", { name: "送出留言" }));

    await waitFor(() =>
      expect(createNote).toHaveBeenCalledWith({
        email: "sales@foodchannels-catering.com",
        body: "已追數",
        authorName: "Mandy",
        orderId: "order-1178",
      }),
    );
    expect(await within(dialog).findByText("已追數")).toBeInTheDocument();
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
