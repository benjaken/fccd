import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeasoningRecipesPage } from "@/components/SeasoningRecipesPage";
import i18n from "@/i18n";
import {
  calculateSeasoningLineCost,
  calculateSeasoningPerKg,
  filterSeasoningRecipeProducts,
  filterSeasoningRecipes,
  groupSeasoningRecipes,
  nextCopiedVersionCode,
  parseVersionCode,
  type SeasoningRecipeProduct,
  type SeasoningRecipeRow,
  type SeasoningRecipeSpice,
} from "@/lib/seasoning-recipes";

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

const products: SeasoningRecipeProduct[] = [
  {
    id: "p-1",
    name: "綠豆沙 (1.2kg/包)",
    sortOrder: 1,
    rawMeatItemId: null,
    rawMeatName: null,
  },
  {
    id: "p-2",
    name: "醃雞扒",
    sortOrder: 2,
    rawMeatItemId: "r-1",
    rawMeatName: "雞扒",
  },
];

const spices: SeasoningRecipeSpice[] = [
  { id: "s-1", name: "片糖", costPerGram: 0.013833, sortOrder: 1 },
  { id: "s-2", name: "砂糖", costPerGram: 0.013233, sortOrder: 2 },
  { id: "s-3", name: "綠豆", costPerGram: 0.021667, sortOrder: 3 },
];

const recipes: SeasoningRecipeRow[] = [
  {
    key: "p-1:20260716",
    preparedMeatItemId: "p-1",
    preparedMeatName: "綠豆沙 (1.2kg/包)",
    preparedSortOrder: 1,
    rawMeatItemId: null,
    rawMeatName: null,
    versionCode: 20260716,
    productionRawMeatKg: 13.2,
    totalCost: 115.54,
    seasoningPerKg: 8.753,
    isApplied: true,
    lines: [
      {
        id: "l-1",
        seasoningId: "s-1",
        seasoningName: "片糖",
        quantityGrams: 1200,
        totalCost: 16.6,
        unitCost: 0.013833,
        sort: 1,
      },
      {
        id: "l-2",
        seasoningId: "s-2",
        seasoningName: "砂糖",
        quantityGrams: 600,
        totalCost: 7.94,
        unitCost: 0.013233,
        sort: 2,
      },
      {
        id: "l-3",
        seasoningId: "s-3",
        seasoningName: "綠豆",
        quantityGrams: 4200,
        totalCost: 91,
        unitCost: 0.021667,
        sort: 3,
      },
    ],
  },
  {
    key: "p-2:20260901",
    preparedMeatItemId: "p-2",
    preparedMeatName: "醃雞扒",
    preparedSortOrder: 2,
    rawMeatItemId: "r-1",
    rawMeatName: "雞扒",
    versionCode: 20260901,
    productionRawMeatKg: 10,
    totalCost: 20,
    seasoningPerKg: 2,
    isApplied: false,
    lines: [
      {
        id: "l-4",
        seasoningId: "s-1",
        seasoningName: "片糖",
        quantityGrams: 500,
        totalCost: 20,
        unitCost: 0.04,
        sort: 1,
      },
    ],
  },
];

describe("seasoning recipe helpers", () => {
  it("groups version lines into recipes and totals cost", () => {
    const grouped = groupSeasoningRecipes([
      {
        id: "l-1",
        prepared_meat_item_id: "p-1",
        raw_meat_item_id: null,
        seasoning_id: "s-1",
        production_raw_meat_kg: 13.2,
        seasoning_quantity_grams: 1200,
        total_cost: 16.6,
        unit_cost: 0.013833,
        version_code: 20260716,
        seasoning_sort: 1,
        is_applied: true,
        prepared_meat_items: { id: "p-1", name: "綠豆沙 (1.2kg/包)", sort_order: 1, raw_meat_item_id: null },
        raw_meat_items: null,
        seasonings: { id: "s-1", name: "片糖", cost_per_gram: 0.013833 },
      },
      {
        id: "l-2",
        prepared_meat_item_id: "p-1",
        raw_meat_item_id: null,
        seasoning_id: "s-2",
        production_raw_meat_kg: 13.2,
        seasoning_quantity_grams: 600,
        total_cost: 7.94,
        unit_cost: 0.013233,
        version_code: 20260716,
        seasoning_sort: 2,
        is_applied: true,
        prepared_meat_items: { id: "p-1", name: "綠豆沙 (1.2kg/包)", sort_order: 1, raw_meat_item_id: null },
        raw_meat_items: null,
        seasonings: { id: "s-2", name: "砂糖", cost_per_gram: 0.013233 },
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.totalCost).toBeCloseTo(24.54, 2);
    expect(grouped[0]?.seasoningPerKg).toBeCloseTo(1.859, 3);
    expect(grouped[0]?.lines.map((line) => line.seasoningName)).toEqual([
      "片糖",
      "砂糖",
    ]);
  });

  it("calculates spice cost from grams and filters products", () => {
    expect(calculateSeasoningLineCost(1200, 0.013833)).toBeCloseTo(16.5996, 4);
    expect(calculateSeasoningPerKg(115.54, 13.2)).toBeCloseTo(8.753, 3);
    expect(parseVersionCode("20260904")).toBe(20260904);
    expect(parseVersionCode("20261301")).toBeNull();
    expect(nextCopiedVersionCode([20260904, 20260905], 20260904)).toBe(20260906);
    expect(
      filterSeasoningRecipeProducts(products, "雞").map((item) => item.id),
    ).toEqual(["p-2"]);
    expect(
      filterSeasoningRecipes(recipes, "p-1", "片糖").map((item) => item.key),
    ).toEqual(["p-1:20260716"]);
  });
});

describe("Seasoning recipes page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists products on the left and shows recipes for the selected product", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SeasoningRecipesPage
          loadProducts={async () => structuredClone(products)}
          loadRecipes={async () => structuredClone(recipes)}
          loadSpices={async () => structuredClone(spices)}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "固定香料成本" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部產品" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "綠豆沙 (1.2kg/包)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("20260716")).toBeInTheDocument();
    expect(screen.getByText("20260901")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "醃雞扒" }));
    expect(screen.queryByText("20260716")).not.toBeInTheDocument();
    expect(screen.getByText("20260901")).toBeInTheDocument();
    expect(screen.getByText("目前顯示：醃雞扒")).toBeInTheDocument();
  });

  it("adds a recipe and spices from one side panel and calculates cost", async () => {
    const user = userEvent.setup();
    const saveRecipe = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SeasoningRecipesPage
          loadProducts={async () => structuredClone(products)}
          loadRecipes={async () => []}
          loadSpices={async () => structuredClone(spices)}
          saveRecipe={saveRecipe}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "添加香料配方" }));
    const dialog = await screen.findByRole("dialog", { name: "添加香料配方" });

    await user.click(within(dialog).getByRole("combobox", { name: "產品" }));
    await user.click(await screen.findByRole("option", { name: "醃雞扒" }));

    const code = within(dialog).getByPlaceholderText("例如 20260904");
    await user.clear(code);
    await user.type(code, "20260904");
    await user.type(within(dialog).getByPlaceholderText("例如 13.2"), "10");

    await user.click(within(dialog).getByRole("combobox", { name: "香料" }));
    await user.click(await screen.findByRole("option", { name: "片糖" }));
    await user.type(within(dialog).getByPlaceholderText("例如 1200"), "1200");
    expect(within(dialog).getByDisplayValue("$16.60")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "加入香料" }));
    expect(within(dialog).getByText("片糖")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(saveRecipe).toHaveBeenCalledWith({
        preparedMeatItemId: "p-2",
        versionCode: 20260904,
        productionRawMeatKg: 10,
        lines: [{ seasoningId: "s-1", quantityGrams: 1200 }],
        previousVersionCode: null,
      });
    });
  });

  it("edits, deletes, and toggles a recipe from the table", async () => {
    const user = userEvent.setup();
    const saveRecipe = vi.fn().mockResolvedValue(undefined);
    const deleteRecipe = vi.fn().mockResolvedValue(undefined);
    const setRecipeApplied = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter>
        <SeasoningRecipesPage
          loadProducts={async () => structuredClone(products)}
          loadRecipes={async () => structuredClone(recipes)}
          loadSpices={async () => structuredClone(spices)}
          saveRecipe={saveRecipe}
          deleteRecipe={deleteRecipe}
          setRecipeApplied={setRecipeApplied}
        />
      </MemoryRouter>,
    );

    await screen.findByText("20260716");
    const firstRow = screen.getAllByRole("row")[1]!;
    await user.click(within(firstRow).getByRole("switch"));
    await waitFor(() => {
      expect(setRecipeApplied).toHaveBeenCalledWith("p-1", 20260716, false);
    });

    await user.click(within(firstRow).getByRole("button", { name: "編輯" }));
    const dialog = await screen.findByRole("dialog", { name: "編輯香料配方" });
    expect(within(dialog).getByText("片糖")).toBeInTheDocument();
    expect(within(dialog).getByText("砂糖")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(saveRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          preparedMeatItemId: "p-1",
          versionCode: 20260716,
          previousVersionCode: 20260716,
        }),
      );
    });

    await user.click(within(firstRow).getByRole("button", { name: "刪除" }));
    await waitFor(() => {
      expect(deleteRecipe).toHaveBeenCalledWith("p-1", 20260716);
    });
  });
});
