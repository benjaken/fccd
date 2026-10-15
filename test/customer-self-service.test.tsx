import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { CustomerSelfServicePage, DetailView } from "@/components/CustomerSelfServicePage";
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
  it("keeps the personal order detail skeleton visible until the detail request finishes", async () => {
    let resolveDetail!: (value: CustomerSelfServiceOrderDetail) => void;
    const loadDetail = vi.fn(() => new Promise<CustomerSelfServiceOrderDetail>(resolve => { resolveDetail = resolve; }));
    const { container } = render(<MemoryRouter initialEntries={["/customer/personal/order-1"]}><Routes><Route path="/customer/personal/:orderId" element={<CustomerSelfServicePage embedded otpOnly routeBase="/customer/personal" restore={vi.fn().mockResolvedValue(session)} loadDetail={loadDetail} loadAddonOptions={vi.fn().mockResolvedValue({ canAddOn: false, items: [] })} />} /></Routes></MemoryRouter>);
    expect(container.querySelector('[data-skeleton="order-detail"]')).toBeInTheDocument();
    await waitFor(() => expect(loadDetail).toHaveBeenCalledWith(session.token, "order-1"));
    expect(container.querySelector('[data-skeleton="order-detail"]')).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("B-1247")).not.toBeInTheDocument();
    await act(async () => resolveDetail(detail));
    expect(await screen.findByRole("heading", { name: "B-1247" })).toBeInTheDocument();
    expect(container.querySelector('[data-skeleton="order-detail"]')).not.toBeInTheDocument();
  });
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

it("renders the redesigned personal detail with expandable items, masked contact and payment facts", async () => {
  const order = { ...detail, lines: Array.from({length: 4}, (_, i) => ({...detail.lines[0], id: String(i), name: "食品" + i})) };
  render(<DetailView embedded session={session} order={order} onBack={vi.fn()} onLogout={vi.fn()} printReceipt={vi.fn()} loadAddonOptions={vi.fn().mockResolvedValue({canAddOn:false, reason:"cutoff_passed", items:[]})} />);
  expect(screen.getByRole("heading", {name:"收貨人資料"})).toBeInTheDocument();
  expect(screen.getByRole("heading", {name:"付款資料"})).toBeInTheDocument();
  expect(screen.getByText("Credit card")).toBeInTheDocument();
  expect(screen.getByText("****9987")).toBeInTheDocument();
  expect(screen.queryByText("60879987")).not.toBeInTheDocument();
  expect(screen.getByRole("link", {name:"查看地圖"})).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(detail.address!));
  expect(screen.queryByText("食品2")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"查看全部 4 項食品"}));
  expect(screen.getByText("食品3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"收起食品"}));
  expect(screen.queryByText("食品2")).not.toBeInTheDocument();
  expect(await screen.findByText(/加單時限已過/)).toBeInTheDocument();
});

it.each(["no_products", "order_unavailable", "delivery_date_missing", "order_closed"])("hides non-actionable add-on notice for %s", async reason => {
  const loadAddonOptions = vi.fn().mockResolvedValue({canAddOn:false, reason, items:[]});
  const {container} = render(<DetailView embedded session={session} order={detail} onBack={vi.fn()} onLogout={vi.fn()} printReceipt={vi.fn()} loadAddonOptions={loadAddonOptions} />);
  await waitFor(() => expect(loadAddonOptions).toHaveBeenCalled());
  await act(async () => {});
  expect(container.querySelector(".self-service-addon-note")).toBeNull();
  expect(screen.queryByRole("button", {name:"加單", exact:true})).not.toBeInTheDocument();
});

it("selects add-on products without exposing SKUs and updates quantities and total", async () => {
  render(<DetailView embedded session={session} order={detail} onBack={vi.fn()} onLogout={vi.fn()} printReceipt={vi.fn()} loadAddonOptions={vi.fn().mockResolvedValue({canAddOn:true, items:[{id:"addon", productId:"product", name:"測試飯盒", sku:"INTERNAL-SKU", price:60, minQuantity:1, maxQuantity:20}]})} />);
  fireEvent.click(await screen.findByRole("button", {name:"加單", exact:true}));
  const panel=within(screen.getByRole("dialog"));
  expect(panel.queryByText("INTERNAL-SKU")).not.toBeInTheDocument();
  const select=panel.getByRole("button", {name:/測試飯盒.*HK/});
  fireEvent.click(select);
  expect(select).toHaveAttribute("aria-pressed","true");
  fireEvent.click(panel.getByRole("button", {name:"增加 測試飯盒"}));
  expect(panel.getByRole("spinbutton", {name:"測試飯盒 數量"})).toHaveValue(2);
  expect(panel.getAllByText("HK$120")).toHaveLength(2);
  fireEvent.click(panel.getByRole("button", {name:"減少 測試飯盒"}));
  expect(panel.getByRole("spinbutton", {name:"測試飯盒 數量"})).toHaveValue(1);
});
