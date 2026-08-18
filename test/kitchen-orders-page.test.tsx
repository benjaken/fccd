import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KitchenOrdersPage } from "@/components/KitchenOrdersPage";
import { OrderDetailPage } from "@/components/OrderDetailPage";
import i18n from "@/i18n";
import { kitchenOperationalStatus } from "@/lib/kitchen-orders";
import {
  operationalOrderStatus,
  type OrderListItem,
  type OrderListResult,
} from "@/lib/orders";

function listItem(
  overrides: Partial<OrderListItem> = {},
): OrderListItem {
  return {
    id: "order-1",
    orderNumber: "B#1462UB",
    customerName: "陳小姐",
    companyName: "香港女童軍總會",
    deliveryAt: "2026-08-12T00:00:00+08:00",
    factoryDate: "2026-08-11T16:00:00.000Z",
    shipOutTime: "11:30",
    deliveryStatus: "己送達",
    isSentToFactory: true,
    grandTotal: null,
    outstanding: null,
    currency: "HKD",
    createdAt: "2026-08-12T01:00:00.000Z",
    statuses: [{ name: "未傳至工場", color: "#f39c12" }],
    shopifyOrderId: null,
    shopifyStoreDomain: null,
    ...overrides,
  };
}

const orderResult: OrderListResult = {
  total: 1,
  items: [listItem()],
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
    statuses: [],
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

  it("prefers 己送達 over leftover 未傳至工場 tags", () => {
    expect(
      operationalOrderStatus({
        deliveryStatus: "己送達",
        isSentToFactory: null,
      }),
    ).toBe("completed");
  });

  it("treats factory-sent 未派車隊 as 製作中, not 已確認", () => {
    expect(
      kitchenOperationalStatus({
        deliveryStatus: "未派車隊",
        isSentToFactory: true,
      }),
    ).toBe("preparing");
    expect(
      kitchenOperationalStatus({
        deliveryStatus: "已取",
        isSentToFactory: true,
      }),
    ).toBe("pickedUp");
    expect(
      kitchenOperationalStatus({
        deliveryStatus: "待接單",
        isSentToFactory: true,
      }),
    ).toBe("awaitingDriver");
  });

  it("lists kitchen orders with live delivery status, not leftover tags", async () => {
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
    expect(await screen.findByText("B#1462UB")).toHaveAttribute(
      "href",
      "/orders/order-1?from=kitchen",
    );
    const table = within(screen.getByRole("table"));
    expect(table.getByText("香港女童軍總會")).toBeInTheDocument();
    expect(table.getByText("陳小姐")).toBeInTheDocument();
    expect(table.getByText("已送達")).toBeInTheDocument();
    expect(table.queryByText("未傳至工場")).not.toBeInTheDocument();
    expect(loadOrders).toHaveBeenCalledWith({
      page: 1,
      search: "",
      status: "",
      preset: "kitchen",
      canViewFinance: false,
    });
    const statusFilter = screen.getByLabelText("營運狀態");
    expect(statusFilter).toHaveDisplayValue("全部狀態");
    for (const option of [
      "製作中",
      "待取貨",
      "已取貨",
      "待接單",
      "送貨途中",
      "已送達",
    ]) {
      expect(
        within(statusFilter).getByRole("option", { name: option }),
      ).toBeInTheDocument();
    }
    expect(
      within(statusFilter).queryByRole("option", { name: "已確認" }),
    ).not.toBeInTheDocument();
  });

  it("shows 製作中 for factory-sent orders that are not yet in later delivery stages", async () => {
    const loadOrders = vi.fn().mockResolvedValue({
      total: 1,
      items: [
        listItem({
          orderNumber: "B-2001",
          deliveryStatus: "未派車隊",
          statuses: [],
        }),
      ],
    });

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

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("製作中")).toBeInTheDocument();
    expect(table.queryByText("已確認")).not.toBeInTheDocument();
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
        expect.objectContaining({ status: "preparing", preset: "kitchen" }),
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

    await user.click(await screen.findByText("B#1462UB"));
    const back = await screen.findByRole("link", { name: "返回中央廚房" });
    expect(back).toHaveAttribute("href", "/kitchen");
    await user.click(back);
    expect(
      await screen.findByRole("heading", { name: "廚房訂單" }),
    ).toBeInTheDocument();
  });
});
