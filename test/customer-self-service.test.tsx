import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { CustomerSelfServicePage } from "@/components/CustomerSelfServicePage";
import type {
  CustomerSelfServiceOrderDetail,
  CustomerSelfServiceSession,
} from "@/lib/customer-self-service";

const session: CustomerSelfServiceSession = {
  token: "customer-session",
  expiresAt: "2099-01-01T00:00:00Z",
  maskedPhone: "****4127",
  maskedEmail: "v*****@example.com",
  orders: [{
    id: "order-1",
    orderNumber: "B-1247",
    orderDate: "2026-08-20T00:00:00Z",
    deliveryDate: "2026-08-30T00:00:00Z",
    grandTotal: 1720,
    currency: "HKD",
  }],
};

const detail: CustomerSelfServiceOrderDetail = {
  id: "order-1",
  orderNumber: "B-1247",
  orderDate: "2026-08-20T00:00:00Z",
  deliveryDate: "2026-08-30T00:00:00Z",
  deliveryTime: "11:30 - 12:00",
  customerName: "Vivian Ip",
  companyName: "Red Academy",
  phoneA: "60879987",
  phoneB: null,
  email: "vivian@example.com",
  maskedPhoneA: "****9987",
  maskedPhoneB: null,
  maskedEmail: "v*****@example.com",
  address: "柴灣青年廣場",
  shippingMethod: "車邊交收",
  deliveryStatus: "待取貨",
  factoryArranged: true,
  fleetArranged: true,
  currency: "HKD",
  shippingFee: 1120,
  grandTotal: 1720,
  outstanding: 0,
  paid: true,
  channelName: "HK Lunch Box",
  channelEmail: "sales@example.com",
  shopifyStoreDomain: null,
  lines: [{
    id: "line-1",
    name: "（雙格）椒鹽豬扒飯",
    content: null,
    quantity: 10,
    unitPrice: 60,
    totalPrice: 600,
    isAddon: false,
  }],
  payments: [{
    id: "payment-1",
    amount: 1720,
    paymentAt: "2026-08-22T00:00:00Z",
    method: "Credit card",
    receiptReference: "REC/B-124701",
  }],
};

describe("CustomerSelfServicePage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:receipt"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("verifies phone and email before showing matching orders", async () => {
    const login = vi.fn().mockResolvedValue(session);
    render(
      <MemoryRouter initialEntries={["/self_service_search"]}>
        <Routes><Route path="/self_service_search/:orderId?" element={<CustomerSelfServicePage
        restore={vi.fn().mockResolvedValue(null)}
        login={login}
        />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("電話號碼"), {
      target: { value: "51634127" },
    });
    fireEvent.change(screen.getByLabelText("電郵地址"), {
      target: { value: "vivian@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查詢訂單" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("51634127", "vivian@example.com"));
    expect(await screen.findByText("B-1247")).toBeInTheDocument();
    expect(screen.getByText("****4127")).toBeInTheDocument();
  });

  it("opens a read-only receipt preview and prints it through the order receipt workflow", async () => {
    const previousTitle = document.title;
    const print = vi.spyOn(window, "print").mockImplementation(() => {
      expect(document.title).toBe("收據REC-B-1247");
    });
    const loadDetail = vi.fn().mockResolvedValue({
      ...detail,
      shippingFee: 100,
      discount: 50,
      cashdollarRedeemed: 30,
      cashdollarPurchased: 20,
      grandTotal: 1024,
      lines: [{ ...detail.lines[0], quantity: 2, unitPrice: 552, totalPrice: 1004 }],
    });
    render(
      <MemoryRouter initialEntries={["/self_service_search"]}>
        <Routes><Route path="/self_service_search/:orderId?" element={<CustomerSelfServicePage
        restore={vi.fn().mockResolvedValue(session)}
        loadDetail={loadDetail}
        loadAddonOptions={vi.fn().mockResolvedValue({
          canAddOn: true,
          reason: null,
          cutoffAt: "2026-08-29T15:00:00+08:00",
          hasAddOn: false,
          items: [{ id: "setting-1", productId: "product-1", sku: "ADD-1", name: "唐揚炸雞塊（12件）", price: 128, minQuantity: 1, maxQuantity: 10 }],
        })}
        />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /B-1247/ }));
    expect(await screen.findByText("（雙格）椒鹽豬扒飯")).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledWith("customer-session", "order-1");
    expect(await screen.findByRole("button", { name: "加單" })).toBeInTheDocument();
    const totals = screen.getByText("食品小計").parentElement;
    expect(totals).toHaveTextContent("運費");
    expect(totals).toHaveTextContent("HK$100");
    expect(totals).toHaveTextContent("折扣");
    expect(totals).toHaveTextContent("-HK$50");

    fireEvent.click(screen.getByRole("button", { name: "預覽並下載收據" }));
    const dialog = await screen.findByRole("dialog", { name: "收據 B-1247" });
    expect(dialog).toBeInTheDocument();
    const receipt = within(dialog).getByLabelText("唯讀收據 PDF");
    expect(screen.getByTestId("self-service-receipt-print-root")).toBeInTheDocument();
    expect(receipt).toHaveTextContent("RECEIPT");
    expect(within(receipt).getByDisplayValue("REC/B-1247")).toBeInTheDocument();
    expect(receipt).toHaveTextContent("Description");
    expect(within(receipt).getByDisplayValue("（雙格）椒鹽豬扒飯")).toBeInTheDocument();
    expect(receipt).toHaveTextContent("Delivery Fee");
    expect(within(receipt).getByDisplayValue("100")).toBeInTheDocument();
    expect(receipt).toHaveTextContent("Discount:");
    expect(receipt).toHaveTextContent("-$50");
    expect(receipt).toHaveTextContent("扣除 Cashdollar:");
    expect(receipt).toHaveTextContent("-$30");
    expect(receipt).toHaveTextContent("購買 Cashdollar:");
    expect(receipt).toHaveTextContent("$20");
    expect(receipt).toHaveTextContent("$1,024");
    expect(receipt).toHaveTextContent("Payment information:");
    const receiptFields = Array.from(receipt.querySelectorAll("input, textarea"));
    expect(receiptFields.length).toBeGreaterThan(0);
    expect(receiptFields.every((field) => field.hasAttribute("readonly"))).toBe(true);
    expect(receiptFields.every((field) => field.getAttribute("tabindex") === "-1")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "下載收據" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.title).toBe(previousTitle);
  });

  it("restores the order detail directly from its URL after refresh", async () => {
    const loadDetail = vi.fn().mockResolvedValue(detail);
    render(
      <MemoryRouter initialEntries={["/self_service_search/order-1"]}>
        <Routes><Route path="/self_service_search/:orderId" element={<CustomerSelfServicePage
          restore={vi.fn().mockResolvedValue(session)}
          loadDetail={loadDetail}
          loadAddonOptions={vi.fn().mockResolvedValue({
            canAddOn: false,
            reason: "cutoff_passed",
            cutoffAt: null,
            hasAddOn: false,
            items: [],
          })}
        />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(detail.lines[0].name)).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledWith("customer-session", "order-1");
  });
});
