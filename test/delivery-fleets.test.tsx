import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeliveryFleetsPage } from "@/components/DeliveryFleetsPage";
import i18n from "@/i18n";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

vi.mock("@/lib/delivery-fleets", () => ({
  fetchDeliveryFleets: api.fetch,
  createDeliveryFleet: api.create,
  updateDeliveryFleet: api.update,
}));

const fleet = {
  id: "fleet-1",
  name: "迅達車隊",
  shortName: "迅達",
  contactPerson: "陳先生",
  contactNumber: "9123 4567",
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
  });

  it("shows whether a login code is configured without revealing it", async () => {
    render(<MemoryRouter><DeliveryFleetsPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "車隊管理" })).toBeInTheDocument();
    expect(screen.getByText("迅達車隊")).toBeInTheDocument();
    expect(screen.getByText("已設定")).toBeInTheDocument();
    expect(screen.queryByText(/login-secret/i)).not.toBeInTheDocument();
  });

  it("changes a fleet login code from the edit panel", async () => {
    const user = userEvent.setup();
    api.update.mockResolvedValue({ ...fleet, hasLoginCode: true });
    render(<MemoryRouter><DeliveryFleetsPage /></MemoryRouter>);

    await screen.findByText("迅達車隊");
    await user.click(screen.getByRole("button", { name: "編輯 迅達車隊" }));
    const codeInput = screen.getByLabelText(/^修改 Login Code/);
    expect(codeInput).toHaveAttribute("type", "password");
    await user.type(codeInput, "new-login-code");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith("fleet-1", {
      name: "迅達車隊",
      shortName: "迅達",
      contactPerson: "陳先生",
      contactNumber: "9123 4567",
      isActive: true,
      loginCode: "new-login-code",
    }));
  });
});
