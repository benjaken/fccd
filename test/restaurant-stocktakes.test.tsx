import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RestaurantStocktakesPage } from "@/components/RestaurantStocktakesPage";
import i18n from "@/i18n";
import type { RestaurantStocktakeItem, RestaurantStocktakeRecord } from "@/lib/restaurant-stocktakes";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { app_metadata: { role: "Super Admin" } }, profile: { role: "Super Admin" } }),
}));

const record: RestaurantStocktakeRecord = {
  month: "2026-07",
  restaurantId: "restaurant-1",
  restaurantName: "TKO 桂花小幸",
  departmentName: "餐廳",
  updatedAt: "2026-08-04T07:55:00Z",
};

const item: RestaurantStocktakeItem = {
  id: "stocktake-1",
  supplierName: "鴻發號糧油食品有限公司",
  name: "小白糖包 7.5g x 500/包",
  unit: "包",
  unitCost: 69,
  quantity: 1.5,
  totalCost: 103.5,
};

function services(overrides: Record<string, unknown> = {}) {
  return {
    loadMasters: vi.fn().mockResolvedValue({
      restaurants: [{ id: "restaurant-1", name: "TKO 桂花小幸" }],
      departments: [{ id: "department-restaurant", name: "餐廳" }, { id: "department-bar", name: "水吧" }],
    }),
    loadRecords: vi.fn().mockResolvedValue([record]),
    loadItems: vi.fn().mockResolvedValue({ items: [item], total: 1, inventoryValue: 103.5 }),
    createRecord: vi.fn().mockResolvedValue(1),
    saveQuantity: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("restaurant stocktake records", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage("zh-HK");
  });

  it("uses the existing master-detail layout and saves edited quantities", async () => {
    const user = userEvent.setup();
    const api = services();
    render(<MemoryRouter><RestaurantStocktakesPage services={api} canEdit canDelete /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "盤點記錄" })).toBeInTheDocument();
    expect(await screen.findByText("小白糖包 7.5g x 500/包")).toBeInTheDocument();
    expect(screen.getByText("存貨總價值：HK$103.50")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "編輯" }));
    const quantity = screen.getByRole("spinbutton", { name: "修改「小白糖包 7.5g x 500/包」的盤點數量" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    expect(screen.getByText("HK$138.00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(api.saveQuantity).toHaveBeenCalledWith("stocktake-1", 2));
  });

  it("enables save immediately in edit mode and exits when nothing changed", async () => {
    const user = userEvent.setup();
    const api = services();
    render(<MemoryRouter><RestaurantStocktakesPage services={api} canEdit canDelete /></MemoryRouter>);
    await screen.findByText("小白糖包 7.5g x 500/包");

    await user.click(screen.getByRole("button", { name: "編輯" }));
    const save = screen.getByRole("button", { name: "儲存" });
    expect(save).toBeEnabled();
    await user.click(save);

    expect(api.saveQuantity).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "編輯" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
  });

  it("shows all loaded rows without table pagination controls", async () => {
    const api = services();
    render(<MemoryRouter><RestaurantStocktakesPage services={api} canEdit canDelete /></MemoryRouter>);
    await screen.findByText("小白糖包 7.5g x 500/包");

    expect(screen.queryByRole("button", { name: "上一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "跳至頁面" })).not.toBeInTheDocument();
  });

  it("disables an existing month, restaurant, and department combination", async () => {
    const user = userEvent.setup();
    const api = services();
    render(<MemoryRouter><RestaurantStocktakesPage services={api} canEdit canDelete /></MemoryRouter>);
    await screen.findByText("小白糖包 7.5g x 500/包");

    await user.click(screen.getByRole("button", { name: "新增盤點記錄" }));
    const dialog = screen.getByRole("dialog", { name: "新增盤點記錄" });
    const restaurant = within(dialog).getByRole("option", { name: "餐廳（已有記錄）" });
    const bar = within(dialog).getByRole("option", { name: "水吧" });
    expect(restaurant).toBeDisabled();
    expect(bar).not.toBeDisabled();

    await user.selectOptions(within(dialog).getByLabelText("部門"), "水吧");
    await user.click(within(dialog).getByRole("button", { name: "建立記錄" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalledWith("2026-07", "restaurant-1", "水吧"));
  });
});
