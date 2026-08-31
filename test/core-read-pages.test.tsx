import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { OrderDetailPage } from "@/components/OrderDetailPage";
import { PaymentsListPage } from "@/components/PaymentsListPage";

const detail = {
  order: {
    id: "order-1",
    documentType: "order" as const,
    orderNumber: "B-1513",
    customerName: "陳小姐",
    companyName: "香港女童軍總會",
    email: "customer@example.com",
    contactA: "91234567",
    contactB: null,
    address: "香港測試地址",
    districtName: "沙田",
    customerNote: "到達前致電客戶",
    internalNote: "只供內部查看",
    quoteStatus: null,
    quoteDescription: null,
    deliveryTerms: null,
    deliveryAt: "2026-08-13T02:00:00.000Z",
    shipOutTime: "10:00",
    deliveryStatus: "待取貨",
    isSentToFactory: null,
    factoryDate: null,
    factoryPackingNote: null,
    currency: "HKD",
    discount: 0,
    shippingFee: 0,
    grandTotal: 1610,
    outstanding: 1610,
    updatedAt: "2026-08-13T00:00:00.000Z",
    statuses: [],
  },
  lines: [
    {
      id: "line-1",
      sku: "SKU-1",
      productId: "product-1",
      packageId: null,
      productName: "測試套餐",
      content: null,
      quantity: 2,
      unitPrice: 805,
      totalPrice: 1610,
      isAddon: false,
      remarks: null,
    },
  ],
  deliveries: [],
  payments: [],
  timeline: [{
    id: "note-1",
    category: "customer note",
    comment: "Payment Deadline 4/10/2026",
    authorName: "Hailey",
    occurredAt: "2026-08-31T05:48:00.000Z",
  }],
  terms: [],
  paymentMethods: [],
  quoteFiles: [],
};

describe("Core read pages", () => {
  it("renders order detail with financial fields for a finance role", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                loadDetail={async () => detail}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "B-1513" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SKU-1" })).toHaveAttribute(
      "href",
      "/products/product-1",
    );
    expect(screen.getAllByText("香港女童軍總會")).toHaveLength(2);
    expect(screen.getByText("測試套餐")).toBeInTheDocument();
    expect(screen.getByText("沙田")).toBeInTheDocument();
    expect(screen.getByText("只供內部查看")).toBeInTheDocument();
    expect(screen.getByText("Payment Deadline 4/10/2026")).toBeInTheDocument();
    expect(screen.getByText(/Hailey/)).toBeInTheDocument();
    expect(screen.getAllByText("HK$1,610")).toHaveLength(3);
    expect(screen.getByText("待取貨")).toBeInTheDocument();
    expect(screen.getByText("未完成付款")).toBeInTheDocument();
  });

  it("shows a Shopify link beside the order number for linked orders", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                loadDetail={async () => ({
                  ...detail,
                  order: {
                    ...detail.order,
                    shopifyOrderId: 7808193593617,
                    shopifyStoreDomain: "hklunchbox.myshopify.com",
                  },
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "B-1513" }))
      .toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "在 Shopify 開啟訂單 B-1513" }),
    ).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/hklunchbox/orders/7808193593617",
    );
  });

  it("does not render editable factory settings on order details", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                canEdit
                loadDetail={async () => ({
                  ...detail,
                  order: {
                    ...detail.order,
                    isSentToFactory: true,
                    factoryPrintDate: "2026-08-20T02:00:00.000Z",
                    factoryReprintRequired: false,
                  },
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "B-1513" })).toBeInTheDocument();
    expect(screen.getByText(/Customer note \(Shown on delivery note\)|客戶備註.*送貨單顯示/)).toBeInTheDocument();
    expect(screen.getByText("到達前致電客戶")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "復製訂單" })).toHaveAttribute(
      "href",
      "/orders/new?copyFrom=order-1",
    );
    expect(screen.queryByRole("checkbox", { name: /不傳送到工場/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "儲存工場設定" })).not.toBeInTheDocument();
  });

  it("shows the unpaid tag on delivered orders that still have outstanding", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                loadDetail={async () => ({
                  ...detail,
                  order: {
                    ...detail.order,
                    orderNumber: "B-1516",
                    deliveryStatus: "己送達",
                    outstanding: 2450,
                    statuses: [
                      { name: "未完成付款", color: "#ff0000" },
                      { name: "廚房備註", color: "#979899" },
                    ],
                  },
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "B-1516" }))
      .toBeInTheDocument();
    expect(screen.getByText("已送達")).toBeInTheDocument();
    expect(screen.getByText("未完成付款")).toBeInTheDocument();
    expect(screen.getByText("廚房備註")).toBeInTheDocument();
  });

  it("hides payment data when finance access is absent", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance={false}
                loadDetail={async () => detail}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "B-1513" })).toBeInTheDocument();
    expect(screen.queryByText("無財務權限")).not.toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("returns to the order list when opened without an origin", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                loadDetail={async () => detail}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "返回列表" })).toHaveAttribute(
      "href",
      "/orders",
    );
  });

  it("returns to the page that opened the order", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/orders/order-1", state: { from: "/delivery" } },
        ]}
      >
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                loadDetail={async () => detail}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "返回列表" })).toHaveAttribute(
      "href",
      "/delivery",
    );
  });

  it("renders empty quote-detail values as a hyphen", async () => {
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route
            path="/quotes/:id"
            element={
              <OrderDetailPage
                documentType="quote"
                canViewFinance
                loadDetail={async () => ({
                  ...detail,
                  order: {
                    ...detail.order,
                    id: "quote-1",
                    documentType: "quote" as const,
                    orderNumber: "Q-1001",
                    companyName: null,
                    email: null,
                    contactA: null,
                    address: null,
                    deliveryAt: null,
                    shipOutTime: null,
                    factoryDate: null,
                    factoryPackingNote: null,
                    internalNote: null,
                    quoteDescription: null,
                  },
                  lines: [],
                  terms: [],
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Q-1001" })).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(5);
    expect(screen.queryByText("未設定")).not.toBeInTheDocument();
  });

  it("blocks payment list data loading without finance access", async () => {
    const loadPayments = async () => ({
      total: 1,
      items: [],
    });

    render(
      <MemoryRouter>
        <PaymentsListPage canViewFinance={false} loadPayments={loadPayments} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("此角色無法查看付款紀錄"),
    ).toBeInTheDocument();
  });
});
