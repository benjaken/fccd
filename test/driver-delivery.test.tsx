import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { DriverDeliveryPage } from "@/components/DriverDeliveryPage";

const api = vi.hoisted(() => ({
  login: vi.fn(),
  fetchOrders: vi.fn(),
  fetchAcceptedOrders: vi.fn(),
  fetchSurchargeTypes: vi.fn(),
  deleteSurcharge: vi.fn(),
  fetchFleetSummary: vi.fn(),
  fetchIncomeSummary: vi.fn(),
  fetchDrivers: vi.fn(),
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
  assignAcceptedOrderDriver: api.assignDriver,
  logoutDriverDelivery: api.logout,
}));

describe("DriverDeliveryPage", () => {
  beforeEach(() => {
    api.login.mockReset();
    api.fetchOrders.mockReset();
    api.fetchAcceptedOrders.mockReset();
    api.fetchSurchargeTypes.mockReset();
    api.deleteSurcharge.mockReset();
    api.fetchFleetSummary.mockReset();
    api.fetchIncomeSummary.mockReset();
    api.fetchDrivers.mockReset();
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
});
