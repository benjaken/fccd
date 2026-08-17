import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KitchenOrdersPage } from "@/components/KitchenOrdersPage";
import { OrderDetailPage } from "@/components/OrderDetailPage";
import i18n from "@/i18n";
import type { OrderListResult } from "@/lib/orders";

const orderResult: OrderListResult = {
  total: 1,
  items: [
    {
      id: "order-1",
      orderNumber: "B-1513",
      customerName: "陳小姐",
      companyName: "香港女童軍總會",
      deliveryAt: "2026-08-12T00:00:00+08:00",
      factoryDate: "2026-08-11T16:00:00.000Z",
      shipOutTime: "11:30",
      deliveryStatus: "待取貨",
      isSentToFactory: true,
      grandTotal: null,
      outstanding: null,
      currency: "HKD",
      createdAt: "2026-08-12T01:00:00.000Z",
      statuses: [{ name: "未傳至工場", color: "#f39c12" }],
    },
  ],
};

const orderDetail = {
  order: {
    id: "order-1",
    documentType: "order" as const,
    orderNumber: "B-1513",
    customerName: "陳小姐",
    companyName: "香港女童軍總會",
    email: null,
    contactA: null,
    contactB: null,
    address: null,
    customerNote: null,
    quoteStatus: null,
    quoteDescription: null,
    deliveryTerms: null,
    deliveryAt: "2026-08-12T00:00:00+08:00",
    shipOutTime: "11:30",
    deliveryStatus: null,
    isSentToFactory: true,
    factoryDate: "2026-08-11T16:00:00.000Z",
    factoryPackingNote: null,
    currency: "HKD",
    discount: 0,
    shippingFee: 0,
    grandTotal: 0,
    outstanding: 0,
    updatedAt: "2026-08-12T00:00:00.000Z",
  },
  lines: [],
  deliveries: [],
  payments: [],
  timeline: [],
  terms: [],
  paymentMethods: [],
  quoteFiles: [],
};

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe("Kitchen orders page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists kitchen orders with configured 訂單狀態 names", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter initialEntries={["/kitchen"]}>
        <Routes>
          <Route
            path="/kitchen"
            element={<KitchenOrdersPage loadOrders={loadOrders} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "廚房訂單" }),
    ).toBeInTheDocument();
    expect(screen.getByText("中央廚房")).toBeInTheDocument();
    expect(await screen.findByText("B-1513")).toHaveAttribute(
      "href",
      "/orders/order-1?from=kitchen",
    );
    const table = within(screen.getByRole("table"));
    expect(table.getByText("香港女童軍總會")).toBeInTheDocument();
    expect(table.getByText("陳小姐")).toBeInTheDocument();
    expect(table.getByText("未傳至工場")).toBeInTheDocument();
    expect(table.queryByText("待取貨")).not.toBeInTheDocument();
    expect(loadOrders).toHaveBeenCalledWith({
      page: 1,
      search: "",
      status: "",
      preset: "all",
      canViewFinance: false,
    });
  });

  it("keeps dashboard preparing/ready query filters", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter initialEntries={["/kitchen?status=preparing"]}>
        <Routes>
          <Route
            path="/kitchen"
            element={<KitchenOrdersPage loadOrders={loadOrders} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(loadOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: "preparing", preset: "all" }),
      ),
    );
  });

  it("returns to the kitchen list from order details", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/kitchen"]}>
        <Routes>
          <Route
            path="/kitchen"
            element={
              <KitchenOrdersPage
                loadOrders={vi.fn().mockResolvedValue(orderResult)}
              />
            }
          />
          <Route
            path="/orders/:id"
            element={
              <OrderDetailPage
                documentType="order"
                canViewFinance
                loadDetail={async () => orderDetail}
              />
            }
          />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>,
    );

    await user.click(await screen.findByText("B-1513"));
    const back = await screen.findByRole("link", { name: "返回中央廚房" });
    expect(back).toHaveAttribute("href", "/kitchen");
    await user.click(back);
    expect(
      await screen.findByRole("heading", { name: "廚房訂單" }),
    ).toBeInTheDocument();
  });
});
