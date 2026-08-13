import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "@/App";
import i18n from "@/i18n";
import type { DashboardData } from "@/lib/dashboard";

const dashboardData: DashboardData = {
  metrics: {
    ordersToday: 42,
    ordersChange: 12,
    revenueToday: 128450,
    revenueChange: 8.6,
    pendingDeliveries: 9,
    lowStock: 16,
  },
  queues: {
    highChanceQuotes: 8,
    largeQuotes: 3,
    unpaidOrders: 12,
    unassignedDrivers: 5,
    deliveredUnpaid: 4,
  },
  progress: {
    confirmed: 18,
    preparing: 12,
    ready: 7,
    shipping: 5,
    completed: 9,
  },
  jobs: [
    {
      id: "order-1",
      orderNumber: "FC-260811-018",
      customerName: "One Harbour Square",
      deliveryAt: "2026-08-12T03:30:00.000Z",
      shipOutTime: "11:30",
      deliveryStatus: null,
      isSentToFactory: true,
      amount: 12680,
      currency: "HKD",
    },
  ],
};

const loadDashboard = () => Promise.resolve(dashboardData);

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
      <Dashboard loadDashboard={loadDashboard} />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

describe("Dashboard navigation", () => {
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

  it.each([
    ["匯出今日清單", "/reports/daily"],
    ["建立新訂單", "/orders/new"],
    ["查看全部", "/kitchen"],
    ["今日訂單", "/orders"],
    ["今日營業額", "/reports?view=revenue"],
    ["待配送", "/delivery"],
    ["低庫存項目", "/inventory/low-stock"],
    ["高機會報價", "/quotes/high-chance"],
    ["大單報價", "/quotes/large"],
    ["未付款訂單", "/orders/unpaid"],
    ["未安排司機", "/delivery/unassigned"],
    ["已送貨未付款", "/orders/delivered-unpaid"],
  ])("links %s to %s", async (name, target) => {
    renderDashboard();

    const matchingLink = (await screen.findAllByRole("link", {
      name: new RegExp(name),
    }))
      .find((link) => link.getAttribute("href") === target);

    expect(matchingLink).toBeDefined();
  });

  it("opens the selected order detail page", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("link", { name: "FC-260811-018" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/orders/order-1");
  });

  it("opens the selected order status view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("link", { name: /已確認\s*18/ }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/orders?status=confirmed",
    );
  });

  it("colors each order-progress status distinctly", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("link", { name: /已確認\s*18/ }),
    ).toHaveClass("tone-indigo");
    expect(screen.getByRole("link", { name: /製作中\s*12/ })).toHaveClass(
      "tone-amber",
    );
    expect(screen.getByRole("link", { name: /待出貨\s*7/ })).toHaveClass(
      "tone-violet",
    );
    expect(screen.getByRole("link", { name: /配送中\s*5/ })).toHaveClass(
      "tone-cyan",
    );
    expect(screen.getByRole("link", { name: /已完成\s*9/ })).toHaveClass(
      "tone-green",
    );
  });

  it("keeps white label classes on the primary create-order action", async () => {
    renderDashboard();

    const createOrder = await screen.findByRole("link", {
      name: /建立新訂單/,
    });

    expect(createOrder).toHaveClass("bg-primary");
    expect(createOrder).toHaveClass("text-primary-foreground");
  });

  it("uses a green brand primary and explicit green active nav wash", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );

    expect(stylesheet).toMatch(/--primary:\s*oklch\(0\.52 0\.14 150\)/);
    expect(stylesheet).toMatch(/--primary:\s*oklch\(0\.58 0\.13 150\)/);
    expect(stylesheet).toMatch(/--nav-active-bg:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(/--nav-active-fg:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(
      /\.sidebar-link\.active\s*\{[^}]*var\(--nav-active-bg\)/s,
    );
    expect(stylesheet).toMatch(
      /\.workspace-soft-link\.active\s*\{[^}]*var\(--nav-active-bg\)/s,
    );
    expect(stylesheet).not.toMatch(/--primary:\s*oklch\([^)]*250\)/);
  });

  it("uses explicit green selection washes instead of primary color-mix", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );

    expect(stylesheet).toMatch(/--selection-bg:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(/--selection-bg-strong:\s*oklch\([^)]*150\)/);
    expect(stylesheet).toMatch(
      /\.report-tabs button\.active[\s\S]*?background:\s*var\(--selection-bg-strong\)/,
    );
    expect(stylesheet).toMatch(
      /\.meat-price-product-list > button\.selected[\s\S]*?background:\s*var\(--selection-bg\)/,
    );
    expect(stylesheet).not.toMatch(
      /background:\s*color-mix\(in oklch,\s*var\(--primary\)\s+\d+%\,\s*var\(--card\)\)/,
    );
  });
});
