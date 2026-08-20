import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import i18n from "@/i18n";

vi.mock("@/lib/qz-tray", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/qz-tray")>();
  return {
    ...actual,
    useQzTray: () => ({
      state: "idle",
      printers: [],
      statuses: [],
      error: null,
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      printLabels: vi.fn(async () => {}),
    }),
  };
});

vi.mock("@/lib/factory-board", async () => {
  const actual = await vi.importActual<typeof import("@/lib/factory-board")>(
    "@/lib/factory-board",
  );
  return {
    ...actual,
    fetchFactoryBoard: vi.fn(async () => ({
      dates: ["2026-08-17", "2026-08-18", "2026-08-19"],
      items: [],
      portionsByOrderId: {},
    })),
    fetchFactoryFleets: vi.fn(async () => []),
    fetchFactoryBrands: vi.fn(async () => [
      { id: "brand-catering", name: "Catering" },
    ]),
    fetchFactoryMenuRows: vi.fn(async () => []),
    fetchFactoryMultiDayMenu: vi.fn(async () => [
      {
        brandId: "brand-catering",
        orderId: "order-1",
        orderNumber: "B-1522",
        deliveryDate: "2026-08-18",
        deliveryTime: "10:00",
        label: "拿破崙肉丸意粉",
        quantity: 8,
      },
    ]),
    fetchFactoryOrderJob: vi.fn(async () => ({
      packingNote: null,
      dispatchTime: "10:00",
      arrivalWindow: null,
      lines: [],
    })),
  };
});

vi.mock("@/lib/deliveries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deliveries")>(
    "@/lib/deliveries",
  );
  return {
    ...actual,
    fetchDeliveryById: vi.fn(async () => ({
      id: "job-1",
      orderId: "order-1",
      orderNumber: "B-1522",
      customerName: "Eric Yim",
      customerPhone: "66817198",
      address: "大埔",
      deliveryAt: "2026-08-18T02:00:00.000Z",
      deliveryTime: "10:00",
      districtName: "大尾督",
      motorcadeId: null,
      motorcadeName: null,
      shippingMethodId: null,
      shippingMethodName: null,
      basicFee: null,
      totalFee: null,
      surchargeAmount: null,
      surcharges: [],
      grandTotal: null,
      deliveryStatus: null,
      takenAt: null,
      fulfilledAt: null,
      imageReferences: [],
    })),
  };
});

const auth = vi.hoisted(() => ({
  session: null as null | { user: { email: string } },
  loading: false,
  profileLoading: false,
}));

vi.mock("@/auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    session: auth.session,
    loading: auth.loading,
    profileLoading: auth.profileLoading,
    signIn: vi.fn(),
    resetPassword: vi.fn(),
    configured: true,
  }),
}));

function renderPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("Standalone workspace pages", () => {
  beforeEach(async () => {
    auth.session = null;
    auth.loading = false;
    auth.profileLoading = false;
    await i18n.changeLanguage("zh-HK");
  });

  it("requires sign-in before showing the factory page", () => {
    renderPath("/factory");

    expect(
      screen.getByRole("heading", { name: "歡迎回來" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "工場版面" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspaces" }),
    ).not.toBeInTheDocument();
  });

  it("shows the factory page without the ops nav after sign-in", () => {
    auth.session = { user: { email: "ops@foodchannels.com" } };
    renderPath("/factory");

    expect(screen.getAllByRole("button", { name: "出車表" }).length).toBe(3);
    expect(screen.queryByRole("heading", { name: "歡迎回來" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspaces" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });

  it("shows a factory order on its own route", async () => {
    auth.session = { user: { email: "ops@foodchannels.com" } };
    renderPath("/factory/order/job-1");

    expect(
      await screen.findByRole("heading", { name: "B-1522" }),
    ).toBeInTheDocument();
    expect(screen.getByText("工場訂單")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "出車表" })).not.toBeInTheDocument();
  });

  it("shows the multi-day menu on its own two-column report route", async () => {
    auth.session = { user: { email: "ops@foodchannels.com" } };
    renderPath("/factory/multi-day-menu?start=2026-08-17&end=2026-08-20");

    expect(
      await screen.findByRole("heading", { name: /備料及出車時間一覽表/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("菜式")).toHaveLength(2);
    expect(screen.getByText("拿破崙肉丸意粉")).toBeInTheDocument();
    expect(document.querySelector(".factory-multi-day-table.is-two-column"))
      .toBeInTheDocument();
  });

  it("shows the driver page as a standalone screen without the ops nav", () => {
    renderPath("/driver-delivery");

    expect(screen.getByRole("heading", { name: "司機送貨平台" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "歡迎回來" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspaces" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });
});
