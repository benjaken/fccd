import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  compareDriverOrdersByShipOutTime,
  DriverDeliveryPage,
} from "@/components/DriverDeliveryPage";

const api = vi.hoisted(() => ({
  login: vi.fn(),
  fetchOrders: vi.fn(),
  fetchAcceptedOrders: vi.fn(),
  fetchSurchargeTypes: vi.fn(),
  deleteSurcharge: vi.fn(),
  fetchFleetSummary: vi.fn(),
  fetchIncomeSummary: vi.fn(),
  fetchDrivers: vi.fn(),
  fetchDistrictFees: vi.fn(),
  assignDriver: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/driver-delivery", () => ({
  restoreDriverDeliverySession: () => null,
  loginDriverDelivery: api.login,
  fetchDriverAvailableOrders: api.fetchOrders,
  fetchDriverAcceptedOrders: api.fetchAcceptedOrders,
  fetchDriverSurchargeTypes: api.fetchSurchargeTypes,
  deleteDriverSurcharge: api.deleteSurcharge,
  fetchDriverFleetSummary: api.fetchFleetSummary,
  fetchDriverIncomeSummary: api.fetchIncomeSummary,
  fetchDriverFleetDrivers: api.fetchDrivers,
  fetchDriverDistrictFees: api.fetchDistrictFees,
  assignAcceptedOrderDriver: api.assignDriver,
  logoutDriverDelivery: api.logout,
}));

describe("DriverDeliveryPage", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    api.login.mockReset();
    api.fetchOrders.mockReset();
    api.fetchAcceptedOrders.mockReset();
    api.fetchSurchargeTypes.mockReset();
    api.deleteSurcharge.mockReset();
    api.fetchFleetSummary.mockReset();
    api.fetchIncomeSummary.mockReset();
    api.fetchDrivers.mockReset();
    api.fetchDistrictFees.mockReset();
    api.assignDriver.mockReset();
    api.logout.mockReset();
    api.login.mockResolvedValue({
      token: "session-token",
      teamId: "team-1",
      teamName: "Sun-Line",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    api.fetchOrders.mockResolvedValue([
      {
        deliveryId: "delivery-1",
        orderNumber: "B-1522",
        shipOutTime: "10:00",
        deliveryTime: "11:00 - 12:00",
        address: "大埔汀角道船灣香港青年協會大美督戶外活動中心",
        districtName: "大埔區",
        shippingMethod: "車邊",
      },
    ]);
    api.fetchAcceptedOrders.mockResolvedValue([
      {
        deliveryId: "delivery-1",
        orderNumber: "B-1522",
        shipOutTime: "10:00",
        deliveryTime: "11:00 - 12:00",
        address: "澶у煍姹€瑙掗亾",
        districtName: "澶у煍鍗€",
        shippingMethod: "杌婇倞",
        customerName: "Driver Test",
        customerPhone: "91234567",
        basicFee: 50,
        totalFee: 50,
        takenAt: null,
        fulfilledAt: null,
        driverId: null,
        driverName: null,
        surcharges: [],
        images: [],
      },
    ]);
    api.fetchDrivers.mockResolvedValue([]);
    api.fetchDistrictFees.mockResolvedValue([]);
    api.assignDriver.mockResolvedValue(undefined);
    api.fetchSurchargeTypes.mockResolvedValue([]);
    api.deleteSurcharge.mockResolvedValue(undefined);
    api.fetchFleetSummary.mockResolvedValue([]);
    api.fetchIncomeSummary.mockResolvedValue([]);
  });

  function renderDriverPortal(initialEntry = "/driver-delivery/available") {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <DriverDeliveryPage />
      </MemoryRouter>,
    );
  }

  it("logs in with only the login code and shows available orders", async () => {
    renderDriverPortal();

    fireEvent.change(screen.getByLabelText("登入密碼"), {
      target: { value: "driver-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("driver-code"));
    expect(await screen.findByText("B-1522")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "可接訂單 (1)" })).toBeInTheDocument();
  });

  it("opens the driver navigation drawer", async () => {
    renderDriverPortal();
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    fireEvent.click(await screen.findByRole("button", { name: "開啟選單" }));
    expect(screen.getByRole("navigation")).toHaveTextContent("合共收入");
    expect(screen.getByRole("navigation")).toHaveTextContent("分區運費");
  });

  it("restores the accepted-orders page from its URL", async () => {
    renderDriverPortal("/driver-delivery/accepted");
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByRole("heading", { name: "已接訂單 (1)" })).toBeInTheDocument();
    expect(api.fetchAcceptedOrders).toHaveBeenCalled();
  });

  it.each([
    ["available", () => api.fetchOrders],
    ["accepted", () => api.fetchAcceptedOrders],
  ] as const)("sorts %s orders by ship-out time", async (page, getFetchMock) => {
    getFetchMock().mockResolvedValueOnce([
      { deliveryId: "late", orderNumber: "B-30", shipOutTime: "13:00", deliveryTime: "14:00", address: "Late", districtName: null, shippingMethod: null },
      { deliveryId: "unset", orderNumber: "B-40", shipOutTime: null, deliveryTime: "15:00", address: "Unset", districtName: null, shippingMethod: null },
      { deliveryId: "early", orderNumber: "B-10", shipOutTime: "9:05", deliveryTime: "10:00", address: "Early", districtName: null, shippingMethod: null },
    ]);

    renderDriverPortal(`/driver-delivery/${page}`);
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    await screen.findByText("B-10");
    expect(Array.from(document.querySelectorAll(".driver-order-card")).map((card) => card.textContent)).toEqual([
      expect.stringContaining("B-10"),
      expect.stringContaining("B-30"),
      expect.stringContaining("B-40"),
    ]);
  });

  it("uses the order number as a stable tie-breaker", () => {
    const orders = [
      { deliveryId: "2", orderNumber: "B-10", shipOutTime: "10:00" },
      { deliveryId: "1", orderNumber: "B-2", shipOutTime: "10:00" },
    ];

    expect(orders.sort(compareDriverOrdersByShipOutTime).map((order) => order.orderNumber)).toEqual(["B-2", "B-10"]);
  });

  it("allows a completed accepted order's surcharge to be deleted", async () => {
    api.fetchAcceptedOrders.mockResolvedValueOnce([
      {
        deliveryId: "delivery-1", orderNumber: "B-1522", shipOutTime: "10:00", deliveryTime: "11:00 - 12:00",
        address: "測試地址", districtName: "測試地區", shippingMethod: "送貨上門", customerName: "Driver Test",
        customerPhone: "91234567", basicFee: 50, totalFee: 70, takenAt: "2026-08-19T01:00:00Z",
        fulfilledAt: "2026-08-19T02:00:00Z", driverId: null, driverName: null,
        surcharges: [{ id: "surcharge-1", name: "隧道費", amount: 20 }], images: [],
      },
    ]);
    renderDriverPortal("/driver-delivery/accepted");
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    fireEvent.click(await screen.findByText(/更多/));
    fireEvent.click(await screen.findByRole("button", { name: "刪除 隧道費" }));
    await waitFor(() => expect(api.deleteSurcharge).toHaveBeenCalledWith("session-token", "surcharge-1"));
  });

  it("filters fleet orders by the selected date range", async () => {
    renderDriverPortal("/driver-delivery/fleet");
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    fireEvent.change(await screen.findByLabelText("開始日期"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("結束日期"), { target: { value: "2026-08-15" } });
    await waitFor(() => expect(api.fetchFleetSummary).toHaveBeenLastCalledWith("session-token", "", "2026-08-01", "2026-08-15"));
  });

  it("lists the team's district fees on the districts page", async () => {
    api.fetchDistrictFees.mockResolvedValue([
      { id: "d-1", name: "大埔區", fee: 80 },
      { id: "d-2", name: "沙田區", fee: 70 },
    ]);
    renderDriverPortal("/driver-delivery/districts");
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByText("大埔區")).toBeInTheDocument();
    expect(screen.getByText("沙田區")).toBeInTheDocument();
    expect(screen.getByText(new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(80))).toBeInTheDocument();
    expect(api.fetchDistrictFees).toHaveBeenCalledWith("session-token", "");

    fireEvent.change(screen.getByLabelText("搜尋地區"), { target: { value: "大埔" } });
    await waitFor(() => expect(api.fetchDistrictFees).toHaveBeenCalledWith("session-token", "大埔"));
  });

  it("shows an empty state when the team has no district fees", async () => {
    renderDriverPortal("/driver-delivery/districts");
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByText("暫時沒有分區運費。")).toBeInTheDocument();
  });

  it("refetches available orders when the phone returns to the screen", async () => {
    renderDriverPortal();
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));
    expect(await screen.findByText("B-1522")).toBeInTheDocument();
    expect(api.fetchOrders).toHaveBeenCalledTimes(1);

    api.fetchOrders.mockResolvedValueOnce([
      {
        deliveryId: "delivery-2",
        orderNumber: "B-2000",
        shipOutTime: "14:00",
        deliveryTime: "15:00",
        address: "新派訂單地址",
        districtName: "沙田區",
        shippingMethod: "車邊",
      },
    ]);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByText("B-2000")).toBeInTheDocument();
    expect(screen.queryByText("B-1522")).not.toBeInTheDocument();
    expect(api.fetchOrders).toHaveBeenCalledTimes(2);
  });

  it("refetches available orders when pulled to refresh on mobile", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderDriverPortal();
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));
    expect(await screen.findByText("B-1522")).toBeInTheDocument();

    const scroller = document.querySelector(".driver-order-refresh");
    expect(scroller).not.toBeNull();
    await waitFor(() => expect(scroller).not.toHaveClass("is-refreshing"));
    const callsBeforePull = api.fetchOrders.mock.calls.length;
    fireEvent.touchStart(scroller!, { touches: [{ clientY: 40 }] });
    fireEvent.touchMove(scroller!, { touches: [{ clientY: 240 }] });
    fireEvent.touchEnd(scroller!);

    await waitFor(() => expect(api.fetchOrders).toHaveBeenCalledTimes(callsBeforePull + 1));
  });

  it("refetches fleet summary when returning to the screen", async () => {
    renderDriverPortal("/driver-delivery/fleet");
    fireEvent.change(screen.getByLabelText("登入密碼"), { target: { value: "driver-code" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));
    await waitFor(() => expect(api.fetchFleetSummary).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(api.fetchFleetSummary).toHaveBeenCalledTimes(2));
  });
});
