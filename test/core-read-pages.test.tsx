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
    customerNote: null,
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
  timeline: [],
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
    expect(screen.getByText("只供內部查看")).toBeInTheDocument();
    expect(screen.getAllByText("HK$1,610")).toHaveLength(3);
    expect(screen.getByText("待取貨")).toBeInTheDocument();
    expect(screen.getByText("未完成付款")).toBeInTheDocument();
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
