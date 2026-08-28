import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  grandTotal: 1720,
  outstanding: 0,
  paid: true,
  channelName: "HK Lunch Box",
  channelEmail: "sales@example.com",
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
      <CustomerSelfServicePage
        restore={vi.fn().mockResolvedValue(null)}
        login={login}
      />,
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

  it("shows order details and opens a receipt preview that starts a PDF download", async () => {
    const createPdf = vi.fn().mockResolvedValue({
      blob: new Blob(["receipt"], { type: "application/pdf" }),
      filename: "收據-B-1247.pdf",
    });
    const loadDetail = vi.fn().mockResolvedValue(detail);
    render(
      <CustomerSelfServicePage
        restore={vi.fn().mockResolvedValue(session)}
        loadDetail={loadDetail}
        loadAddonOptions={vi.fn().mockResolvedValue({
          canAddOn: true,
          reason: null,
          cutoffAt: "2026-08-29T15:00:00+08:00",
          hasAddOn: false,
          items: [{ id: "setting-1", productId: "product-1", sku: "ADD-1", name: "唐揚炸雞塊（12件）", price: 128, minQuantity: 1, maxQuantity: 10 }],
        })}
        createPdf={createPdf}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /B-1247/ }));
    expect(await screen.findByText("（雙格）椒鹽豬扒飯")).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledWith("customer-session", "order-1");
    expect(await screen.findByRole("button", { name: "加單" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "預覽並下載收據" }));
    expect(await screen.findByRole("dialog", { name: "收據 B-1247" })).toBeInTheDocument();
    await waitFor(() => expect(createPdf).toHaveBeenCalledWith(expect.any(HTMLDivElement), "B-1247"));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
