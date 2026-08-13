import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "@/App";
import i18n from "@/i18n";
import type { DashboardData } from "@/lib/dashboard";

const liveData: DashboardData = {
  metrics: {
    ordersToday: 3,
    ordersChange: 50,
    revenueToday: 2470,
    revenueChange: null,
    pendingDeliveries: 2,
    lowStock: 9,
  },
  queues: {
    highChanceQuotes: 0,
    largeQuotes: 64,
    unpaidOrders: 35,
    unassignedDrivers: 11,
    deliveredUnpaid: 0,
  },
  progress: {
    confirmed: 0,
    preparing: 0,
    ready: 2,
    shipping: 0,
    completed: 1,
  },
  jobs: [
    {
      id: "order-live",
      orderNumber: "B-1513",
      customerName: "香港女童軍總會",
      deliveryAt: "2026-08-12T00:00:00+08:00",
      shipOutTime: null,
      deliveryStatus: "待取貨",
      isSentToFactory: null,
      amount: 1610,
      currency: "HKD",
    },
  ],
};

describe("Live dashboard data", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("replaces loading values with the Supabase result", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(liveData);

    render(
      <MemoryRouter>
        <Dashboard loadDashboard={loadDashboard} role="Super Admin" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "正在載入最新營運數據",
    );
    expect(
      await screen.findByRole("link", { name: /今日訂單\s*3 張/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /今日營業額\s*HK\$2,470/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /低庫存項目\s*9 項/ }))
      .toBeInTheDocument();
    expect(screen.getByText("香港女童軍總會")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("待出貨"))
      .toBeInTheDocument();
    expect(loadDashboard).toHaveBeenCalledWith("Super Admin");
  });

  it("offers a retry after a dashboard query fails", async () => {
    const user = userEvent.setup();
    const loadDashboard = vi
      .fn()
      .mockRejectedValueOnce({ code: "dashboard_failed" })
      .mockResolvedValueOnce(liveData);

    render(
      <MemoryRouter>
        <Dashboard loadDashboard={loadDashboard} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("暫時無法載入首頁數據"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重試" }));

    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("link", { name: /今日訂單\s*3 張/ }),
    ).toBeInTheDocument();
  });
});
