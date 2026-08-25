import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeliveryFleetsPage } from "@/components/DeliveryFleetsPage";
import i18n from "@/i18n";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  fetchFees: vi.fn(),
  updateFee: vi.fn(),
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

vi.mock("@/auth/use-page-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/use-page-access")>()),
  useCurrentPageAccess: () => ({
    loading: false,
    error: null,
    canAccess: () => true,
    canManage: () => true,
    canAccessSection: () => true,
  }),
}));

vi.mock("@/lib/delivery-fleets", () => ({
  fetchDeliveryFleets: api.fetch,
  createDeliveryFleet: api.create,
  updateDeliveryFleet: api.update,
  fetchDeliveryFleetFees: api.fetchFees,
  updateDeliveryFleetFee: api.updateFee,
}));

const fleet = {
  id: "fleet-1",
  name: "迅達車隊",
  shortName: "迅達",
  contactPerson: "陳先生",
  contactNumber: "9123 4567",
  bankAccount: "HSBC 123-456789-001",
  status: "active",
  isActive: true,
  hasLoginCode: true,
  createdAt: "2026-08-22T00:00:00.000Z",
};

describe("Delivery fleet management", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
    api.fetch.mockReset().mockResolvedValue([fleet]);
    api.create.mockReset();
    api.update.mockReset();
    api.fetchFees.mockReset().mockResolvedValue([{
      districtId: "district-1",
      fleetId: "fleet-1",
      fleetName: fleet.name,
      districtName: "荃灣",
      fee: 120,
    }]);
    api.updateFee.mockReset();
  });

  it("shows whether a login code is configured without revealing it", async () => {
    render(<MemoryRouter><DeliveryFleetsPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "車隊管理" })).toBeInTheDocument();
    expect(screen.getByText("迅達車隊")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "付款方式" })).toBeInTheDocument();
    expect(screen.getByText("HSBC 123-456789-001")).toBeInTheDocument();
    expect(screen.getByText("已設定")).toBeInTheDocument();
    expect(screen.queryByText(/login-secret/i)).not.toBeInTheDocument();
  });

  it("changes a fleet login code from the edit panel", async () => {
    const user = userEvent.setup();
    api.update.mockResolvedValue({ ...fleet, hasLoginCode: true });
    render(<MemoryRouter><DeliveryFleetsPage /></MemoryRouter>);

    await screen.findByText("迅達車隊");
    await user.click(screen.getByRole("button", { name: "編輯 迅達車隊" }));
    expect(screen.getByLabelText("付款方式")).toHaveValue("HSBC 123-456789-001");
    const codeInput = screen.getByLabelText(/^修改 Login Code/);
    expect(codeInput).toHaveAttribute("type", "password");
    await user.type(codeInput, "new-login-code");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith("fleet-1", {
      name: "迅達車隊",
      shortName: "迅達",
      contactPerson: "陳先生",
      contactNumber: "9123 4567",
      bankAccount: "HSBC 123-456789-001",
      isActive: true,
      loginCode: "new-login-code",
    }));
  });

  it("opens an 80% fee-management table and saves a district fee when input finishes", async () => {
    const user = userEvent.setup();
    api.updateFee.mockResolvedValue({
      districtId: "district-1",
      fleetId: "fleet-1",
      fleetName: fleet.name,
      districtName: "荃灣",
      fee: 135,
    });
    render(<MemoryRouter><DeliveryFleetsPage /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "運費管理" }));
    expect(await screen.findByRole("heading", { name: `${fleet.name}－運費管理` })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "荃灣" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveClass("side-panel-majority");
    expect(api.fetchFees).toHaveBeenCalledWith(null);
    expect(screen.getByRole("searchbox", { name: "搜尋運費" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "司機／車隊" })).toBeInTheDocument();
    const districtFilter = screen.getByRole("combobox", { name: "地區" });
    expect(districtFilter).toBeInTheDocument();
    await user.click(districtFilter);
    expect(screen.getByRole("searchbox", { name: "搜尋" })).toBeInTheDocument();

    const feeInput = screen.getByRole("spinbutton", { name: "荃灣 運費" });
    await user.clear(feeInput);
    await user.type(feeInput, "135");
    expect(screen.queryByRole("button", { name: "儲存 荃灣 運費" })).not.toBeInTheDocument();
    await user.tab();

    await waitFor(() => expect(api.updateFee).toHaveBeenCalledWith("district-1", 135));
  });

  it("paginates and searches fleet fees", async () => {
    const user = userEvent.setup();
    api.fetchFees.mockResolvedValue(Array.from({ length: 16 }, (_, index) => ({
      districtId: `district-${index + 1}`,
      fleetId: "fleet-1",
      fleetName: fleet.name,
      districtName: `地區 ${String(index + 1).padStart(2, "0")}`,
      fee: 100 + index,
    })));
    render(<MemoryRouter><DeliveryFleetsPage /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "運費管理" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("顯示 1–15，共 16 筆")).toBeInTheDocument();
    expect(within(dialog).queryByRole("cell", { name: "地區 16" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "下一頁運費" }));
    expect(within(dialog).getByRole("cell", { name: "地區 16" })).toBeInTheDocument();

    await user.type(within(dialog).getByRole("searchbox", { name: "搜尋運費" }), "地區 05");
    await user.click(within(dialog).getByRole("button", { name: "搜尋" }));
    expect(within(dialog).getByRole("cell", { name: "地區 05" })).toBeInTheDocument();
    expect(within(dialog).getByText("顯示 1–1，共 1 筆")).toBeInTheDocument();
  });
});
