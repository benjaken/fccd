import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  RestaurantDailyPurchasesPage,
  type RestaurantDailyPurchaseServices,
} from "@/components/RestaurantDailyPurchasesPage";
import i18n from "@/i18n";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

const restaurants = [{ id: "tko", legacyId: "tko-legacy", name: "TKO 桂花小幸 將軍澳" }];
const suppliers = [{ id: "supplier-1", legacyId: "supplier-legacy", name: "長明國際 (CI)" }];
const purchaseTypes = [
  { id: "kitchen", legacyId: "kitchen-legacy", name: "廚房用料" },
  { id: "bar", legacyId: "bar-legacy", name: "水吧用料" },
  { id: "sundries", legacyId: "sundries-legacy", name: "清潔/SUNDRIES" },
];

function makeServices(overrides: Partial<RestaurantDailyPurchaseServices> = {}): RestaurantDailyPurchaseServices {
  return {
    loadRestaurants: vi.fn(async () => restaurants),
    loadSuppliers: vi.fn(async () => suppliers),
    loadPurchaseTypes: vi.fn(async () => purchaseTypes),
    loadRecords: vi.fn(async () => ({
      items: [{
        date: null,
        restaurantId: "tko",
        restaurantName: "TKO 桂花小幸 將軍澳",
        supplierId: "supplier-1",
        supplierName: "長明國際 (CI)",
        categories: [
          { ...purchaseTypes[0], amount: 147891 },
          { ...purchaseTypes[1], amount: 0 },
          { ...purchaseTypes[2], amount: 0 },
        ],
        total: 147891,
      }],
      total: 1,
    })),
    saveRecord: vi.fn(async () => undefined),
    loadEntries: vi.fn(async () => ({ items: [], total: 0 })),
    updateEntry: vi.fn(async () => undefined),
    deleteEntry: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("restaurant daily purchase input", () => {
  it("shows restaurant, supplier, category totals, and edit actions", async () => {
    await i18n.changeLanguage("zh-HK");
    render(<RestaurantDailyPurchasesPage canEdit services={makeServices()} />);

    expect(await screen.findByRole("heading", { name: "每日採購單輸入" })).toBeInTheDocument();
    expect(await screen.findByText("TKO 桂花小幸 將軍澳")).toBeInTheDocument();
    expect(screen.getByText("長明國際 (CI)")).toBeInTheDocument();
    expect(screen.getByText("廚房用料")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新增採購記錄/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /編輯採購記錄/ })).toBeInTheDocument();
  });

  it("saves one categorized purchase group for a date, restaurant, and supplier", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const saveRecord = vi.fn(async () => undefined);
    render(<RestaurantDailyPurchasesPage canEdit services={makeServices({ saveRecord })} />);

    await user.click(await screen.findByRole("button", { name: /新增採購記錄/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("日期"), "2026-08-22");
    await user.selectOptions(within(dialog).getByLabelText("餐廳"), "tko");
    await user.selectOptions(within(dialog).getByLabelText("供應商"), "supplier-1");
    await user.clear(within(dialog).getByLabelText("廚房用料金額"));
    await user.type(within(dialog).getByLabelText("廚房用料金額"), "1280.5");
    await user.click(within(dialog).getByRole("button", { name: "確定" }));

    await waitFor(() => expect(saveRecord).toHaveBeenCalledWith({
      date: "2026-08-22",
      restaurantId: "tko",
      supplierId: "supplier-1",
      amounts: [
        { purchaseTypeId: "kitchen", amount: 1280.5 },
        { purchaseTypeId: "bar", amount: 0 },
        { purchaseTypeId: "sundries", amount: 0 },
      ],
    }));
  });

  it("keeps write controls hidden for read-only roles", async () => {
    await i18n.changeLanguage("zh-HK");
    render(<RestaurantDailyPurchasesPage canEdit={false} services={makeServices()} />);

    await screen.findByRole("heading", { name: "每日採購單輸入" });
    expect(screen.queryByRole("button", { name: /新增採購記錄/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /編輯採購記錄/ })).not.toBeInTheDocument();
  });
});
