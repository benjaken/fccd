import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KitchenCalendarPage } from "@/components/KitchenCalendarPage";
import { OrderDetailPage } from "@/components/OrderDetailPage";
import i18n from "@/i18n";
import type { KitchenCalendarOrder } from "@/lib/kitchen-calendar";

const now = new Date("2026-08-17T04:00:00.000Z");

const orders: KitchenCalendarOrder[] = [
  {
    id: "order-blue",
    orderNumber: "B-1511",
    customerName: "Michelle Chung",
    companyName: "Chung Ltd",
    deliveryAt: "2026-08-16T02:00:00.000Z",
    factoryDate: "2026-08-15T16:00:00.000Z",
    deliveryStatus: "已送達",
    isSentToFactory: true,
    outstanding: 0,
    statuses: [],
  },
  {
    id: "order-amber",
    orderNumber: "#6917",
    customerName: "Philip Leung",
    companyName: null,
    deliveryAt: "2026-08-16T03:00:00.000Z",
    factoryDate: null,
    deliveryStatus: "未派車隊",
    isSentToFactory: false,
    outstanding: 0,
    statuses: [{ name: "未傳至工場", color: "#f39c12" }],
  },
  {
    id: "order-red",
    orderNumber: "P-1140",
    customerName: "Ada Wong",
    companyName: null,
    deliveryAt: "2026-08-16T04:00:00.000Z",
    factoryDate: null,
    deliveryStatus: "未派車隊",
    isSentToFactory: true,
    outstanding: 800,
    statuses: [
      { name: "未完成付款", color: "#ff0000" },
      { name: "廚房", color: "#832024" },
    ],
  },
  {
    id: "order-extra-1",
    orderNumber: "X-1",
    customerName: "One",
    companyName: null,
    deliveryAt: "2026-08-16T05:00:00.000Z",
    factoryDate: null,
    deliveryStatus: "已送達",
    isSentToFactory: true,
    outstanding: 0,
    statuses: [],
  },
  {
    id: "order-extra-2",
    orderNumber: "X-2",
    customerName: "Two",
    companyName: null,
    deliveryAt: "2026-08-16T06:00:00.000Z",
    factoryDate: null,
    deliveryStatus: "送貨途中",
    isSentToFactory: true,
    outstanding: 0,
    statuses: [{ name: "SP", color: "#832024" }],
  },
  {
    id: "order-delivered-stale",
    orderNumber: "B#1462UB",
    customerName: "Union Banquet",
    companyName: null,
    deliveryAt: "2026-08-17T04:00:00.000Z",
    factoryDate: null,
    deliveryStatus: "己送達",
    isSentToFactory: null,
    outstanding: 0,
    statuses: [{ name: "未傳至工場", color: "#f39c12" }],
  },
  {
    id: "order-delivered-unpaid",
    orderNumber: "B-1516",
    customerName: "Harbour Club",
    companyName: null,
    deliveryAt: "2026-08-17T05:00:00.000Z",
    factoryDate: null,
    deliveryStatus: "己送達",
    isSentToFactory: null,
    outstanding: 2450,
    statuses: [
      { name: "未完成付款", color: "#ff0000" },
      { name: "廚房備註", color: "#979899" },
    ],
  },
];

const orderDetail = {
  order: {
    id: "order-amber",
    documentType: "order" as const,
    orderNumber: "#6917",
    customerName: "Philip Leung",
    companyName: null,
    email: null,
    contactA: null,
    contactB: null,
    address: null,
    customerNote: null,
    quoteStatus: null,
    quoteDescription: null,
    deliveryTerms: null,
    deliveryAt: "2026-08-16T03:00:00.000Z",
    shipOutTime: null,
    deliveryStatus: null,
    isSentToFactory: false,
    factoryDate: null,
    factoryPackingNote: null,
    currency: "HKD",
    discount: 0,
    shippingFee: 0,
    grandTotal: 0,
    outstanding: 0,
    updatedAt: "2026-08-16T00:00:00.000Z",
  },
  lines: [],
  deliveries: [],
  payments: [],
  timeline: [],
  terms: [],
  paymentMethods: [],
  quoteFiles: [],
  statuses: [{ name: "未傳至工場", color: "#f39c12" }],
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

function renderCalendar(
  loadOrders = vi.fn().mockResolvedValue(orders),
  initialEntries = ["/kitchen/calendar"],
) {
  return {
    loadOrders,
    ...render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/kitchen/calendar"
            element={
              <KitchenCalendarPage loadOrders={loadOrders} now={now} />
            }
          />
          <Route path="/orders/:id" element={<CurrentLocation />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>,
    ),
  };
}

describe("Kitchen calendar page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("loads the visible month range and links orders to their detail pages", async () => {
    const { loadOrders } = renderCalendar();

    await waitFor(() =>
      expect(loadOrders).toHaveBeenCalledWith({
        start: "2026-07-25T16:00:00.000Z",
        end: "2026-09-05T16:00:00.000Z",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "出餐日曆" }),
    ).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "訂單狀態" });
    expect(within(legend).getByText("未傳至工場")).toBeInTheDocument();
    expect(within(legend).getByText("未完成付款")).toBeInTheDocument();
    expect(within(legend).queryByText("廚房")).not.toBeInTheDocument();
    expect(within(legend).queryByText("SP")).not.toBeInTheDocument();

    const philip = await screen.findByRole("link", {
      name: /開啟訂單 #6917 - Philip Leung/,
    });
    expect(philip).toHaveAttribute(
      "href",
      "/orders/order-amber?from=calendar&month=2026-08",
    );
    expect(philip).toHaveTextContent("#6917 - Philip Leung");
    expect(philip).not.toHaveTextContent("未傳至工場");
    expect(philip).not.toHaveTextContent("待司機接單");
    expect(screen.getByRole("link", { name: /開啟訂單 B-1511 - Michelle Chung/ }))
      .toHaveAttribute("href", "/orders/order-blue?from=calendar&month=2026-08");
    expect(
      screen.getByRole("link", { name: /開啟訂單 B-1511 - Michelle Chung/ }),
    ).not.toHaveTextContent("已送達");
    const ada = screen.getByRole("link", { name: /開啟訂單 P-1140 - Ada Wong/ });
    expect(ada).toHaveAttribute(
      "href",
      "/orders/order-red?from=calendar&month=2026-08",
    );
    expect(ada).toHaveTextContent("P-1140 - Ada Wong");
    expect(ada).not.toHaveTextContent("未完成付款");
    expect(ada).not.toHaveTextContent("廚房");
    const delivered = screen.getByRole("link", {
      name: /開啟訂單 B#1462UB - Union Banquet/,
    });
    expect(delivered).toHaveTextContent("B#1462UB - Union Banquet");
    expect(delivered).not.toHaveTextContent("未傳至工場");
    expect(delivered).toHaveAccessibleName(/已送達/);
    const deliveredUnpaid = screen.getByRole("link", {
      name: /開啟訂單 B-1516 - Harbour Club/,
    });
    expect(deliveredUnpaid).toHaveAccessibleName(/已送達/);
    expect(deliveredUnpaid).not.toHaveTextContent("未完成付款");
    expect(deliveredUnpaid.querySelector(".kitchen-calendar-dot")).not.toHaveClass(
      "red",
    );
  });

  it("opens an order from the calendar", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(
      await screen.findByRole("link", {
        name: /開啟訂單 #6917 - Philip Leung/,
      }),
    );

    expect(screen.getAllByTestId("location")[0]).toHaveTextContent(
      "/orders/order-amber",
    );
  });

  it("returns to the serving calendar from order details", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/kitchen/calendar"]}>
        <Routes>
          <Route
            path="/kitchen/calendar"
            element={
              <KitchenCalendarPage
                loadOrders={vi.fn().mockResolvedValue(orders)}
                now={now}
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
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("link", {
        name: /開啟訂單 #6917 - Philip Leung/,
      }),
    );
    const back = await screen.findByRole("link", { name: "返回出餐日曆" });
    expect(back).toHaveAttribute("href", "/kitchen/calendar?month=2026-08");
    await user.click(back);
    expect(
      await screen.findByRole("heading", { name: "出餐日曆" }),
    ).toBeInTheDocument();
  });

  it("shows overflow orders in the day panel", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(await screen.findByRole("button", { name: "+1 項" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("X-2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /開啟訂單 X-2 - Two/ }),
    ).toHaveAttribute(
      "href",
      "/orders/order-extra-2?from=calendar&month=2026-08",
    );
    expect(within(dialog).queryByText("SP")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("未傳至工場")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("待司機接單")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("已送達")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("已安排")).not.toBeInTheDocument();
  });

  it("navigates months with today, previous and next controls", async () => {
    const user = userEvent.setup();
    const { loadOrders } = renderCalendar();

    await screen.findByRole("heading", { name: "出餐日曆" });
    await user.click(screen.getByRole("button", { name: "下一個月" }));

    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith({
        start: "2026-08-29T16:00:00.000Z",
        end: "2026-10-10T16:00:00.000Z",
      }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("month=2026-09");

    await user.click(screen.getByRole("button", { name: "今日" }));
    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith({
        start: "2026-07-25T16:00:00.000Z",
        end: "2026-09-05T16:00:00.000Z",
      }),
    );
  });

  it("keeps the serving calendar under Kitchen and off the Orders menu", () => {
    const app = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    const access = readFileSync(
      path.resolve(process.cwd(), "src/auth/use-page-access.ts"),
      "utf8",
    );
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817061000_restore_kitchen_serving_calendar.sql",
      ),
      "utf8",
    );

    expect(app).toContain('to: "/kitchen/calendar"');
    expect(app).not.toContain('to: "/orders/production"');
    expect(app).toContain('path="/kitchen/calendar"');
    expect(app).toContain('Navigate to="/kitchen/calendar"');
    expect(access).toContain('pageKey: "kitchen.calendar"');
    expect(access).not.toContain('pageKey: "orders.production"');
    expect(migration).toContain("delete from public.app_pages");
    expect(migration).toContain("orders.production");
    expect(migration).toContain("kitchen.calendar");
    expect(migration).toContain("出餐日曆");
  });
});
