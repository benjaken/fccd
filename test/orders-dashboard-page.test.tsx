import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersDashboardPage } from "@/components/OrdersDashboardPage";
import i18n from "@/i18n";
import type { OrdersDashboardData } from "@/lib/orders-dashboard";

const dashboardData: OrdersDashboardData = {
  shopifyPending: 4,
  unpaid: 12,
  notSentToFactory: 7,
  pendingQuotes: 3,
  upcomingQuotes: 5,
  latestPendingOrders: [
    {
      id: "order-pending-1",
      kind: "order",
      orderNumber: "S-1001",
      customerName: "李先生",
      companyName: null,
      quoteStatus: null,
      deliveryAt: "2026-08-24T10:00:00+08:00",
      createdAt: "2026-08-18T02:00:00.000Z",
      sourceSystem: "shopify",
      outstanding: null,
      currency: "HKD",
    },
  ],
  latestUnpaidOrders: [
    {
      id: "order-unpaid-1",
      kind: "order",
      orderNumber: "O-1002",
      customerName: "王小姐",
      companyName: null,
      quoteStatus: null,
      deliveryAt: "2026-08-23T10:00:00+08:00",
      createdAt: "2026-08-18T01:30:00.000Z",
      sourceSystem: null,
      outstanding: 1200,
      currency: "HKD",
    },
  ],
  latestPendingQuotes: [
    {
      id: "inquiry-1",
      kind: "quote",
      orderNumber: null,
      customerName: "陳小姐",
      companyName: null,
      quoteStatus: null,
      deliveryAt: "2026-08-25T10:00:00+08:00",
      createdAt: "2026-08-18T01:00:00.000Z",
      sourceSystem: "emailmeform",
      outstanding: null,
      currency: "HKD",
    },
  ],
  soonestUpcomingQuotes: [
    {
      id: "quote-1",
      kind: "quote",
      orderNumber: "Q-260818-001",
      customerName: "香港女童軍總會",
      companyName: null,
      quoteStatus: "High Chance",
      deliveryAt: "2026-08-19T04:00:00.000Z",
      createdAt: "2026-08-12T01:00:00.000Z",
      sourceSystem: null,
      outstanding: null,
      currency: "HKD",
    },
  ],
};

const loadDashboard = vi.fn().mockResolvedValue(dashboardData);

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <OrdersDashboardPage loadDashboard={loadDashboard} />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

describe("Orders dashboard page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
    loadDashboard.mockClear();
    loadDashboard.mockResolvedValue(dashboardData);
  });

  it("renders every order and quote queue card with its count", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("heading", { name: "跟進總覽" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Shopify 待入單\s*4.*開啟列表/ }),
    ).toHaveAttribute("href", "/orders/shopify-pending");
    expect(
      screen.getByRole("link", { name: /待收款訂單\s*12.*開啟列表/ }),
    ).toHaveAttribute("href", "/orders/unpaid");
    expect(
      screen.getByRole("link", { name: /未傳工場訂單\s*7/ }),
    ).toHaveAttribute("href", "/orders/not-sent-factory");
    expect(
      screen.getByRole("link", { name: /待報價\s*3.*開啟列表/ }),
    ).toHaveAttribute("href", "/quotes/pending");
    expect(
      screen.getByRole("link", { name: /即將到期報價\s*5.*開啟列表/ }),
    ).toHaveAttribute("href", "/quotes/upcoming");
  });

  it("lists the latest pending inquiries and soonest upcoming quotes", async () => {
    renderDashboard();

    expect(await screen.findByText("陳小姐")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Q-260818-001/ }),
    ).toHaveAttribute("href", "/quotes/quote-1");
    expect(screen.getByRole("heading", { name: "待報價・前五筆" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "即將到期・前五筆" }),
    ).toBeInTheDocument();
    expect(screen.getByText("香港女童軍總會")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /S-1001/ })).toHaveAttribute(
      "href",
      "/orders/order-pending-1",
    );
    expect(screen.getByRole("link", { name: /O-1002/ })).toHaveAttribute(
      "href",
      "/orders/order-unpaid-1",
    );
    expect(screen.getByText(/1,200/)).toBeInTheDocument();
  });

  it("opens the corresponding table when a card is clicked", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole("link", { name: /未傳工場訂單\s*7/ }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/orders/not-sent-factory",
    );
  });

  it("offers a retry after the dashboard query fails", async () => {
    const user = userEvent.setup();
    loadDashboard
      .mockRejectedValueOnce({ code: "orders_dashboard_failed" })
      .mockResolvedValueOnce(dashboardData);

    renderDashboard();

    expect(
      await screen.findByText("暫時無法載入訂單儀表板"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("link", { name: /Shopify 待入單\s*4.*開啟列表/ }),
    ).toBeInTheDocument();
  });
});
