import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { KitchenMaterialUsagePage } from "@/components/KitchenMaterialUsagePage";
import {
  buildKitchenMaterialUsageReport,
  hongKongDateBounds,
} from "@/lib/kitchen-material-usage";
import { pageAccessKey } from "@/auth/use-page-access";
import { secondaryNav } from "@/lib/nav";
import i18n from "@/i18n";

describe("kitchen material usage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("uses HK day boundaries and aggregates calculated/fallback BOM usage", () => {
    expect(hongKongDateBounds("2026-08-20")).toEqual({
      start: "2026-08-20T00:00:00+08:00",
      end: "2026-08-21T00:00:00+08:00",
    });

    const report = buildKitchenMaterialUsageReport({
      ingredients: [{ id: "ingredient-1", name: "番茄", sku: "TOM", stocktake_unit: "kg" }],
      products: [{ id: "product-1", name: "沙律", sku: "SAL" }],
      stocktakes: [{ ingredient_id: "ingredient-1", quantity: "12" }],
      bomLines: [
        {
          id: "bom-calculated",
          ingredient_id: "ingredient-1",
          product_id: "product-1",
          order_id: "order-1",
          delivery_at: "2026-08-19T16:00:00Z",
          calculated_quantity: "3.5",
          ingredient_quantity: "9",
          product_quantity: "9",
        },
        {
          id: "bom-fallback",
          ingredient_id: "ingredient-1",
          product_id: "product-1",
          order_id: "order-2",
          delivery_at: "2026-08-20T03:00:00Z",
          calculated_quantity: null,
          ingredient_quantity: "2",
          product_quantity: "4",
        },
      ],
    }, {
      stocktakeDate: "2026-08-20",
      usageStartDate: "2026-08-20",
      usageEndDate: "2026-08-20",
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      stocktakeQuantity: 12,
      estimatedUsage: 11.5,
      difference: 0.5,
    });
    expect(report.rows[0].details).toHaveLength(2);
  });

  it("keeps the first BOM material order instead of sorting by name", () => {
    const report = buildKitchenMaterialUsageReport({
      ingredients: [
        { id: "ingredient-a", name: "A", sku: "A", stocktake_unit: "kg" },
        { id: "ingredient-b", name: "B", sku: "B", stocktake_unit: "kg" },
      ],
      products: [],
      stocktakes: [
        { ingredient_id: "ingredient-a", quantity: 1 },
        { ingredient_id: "ingredient-b", quantity: 1 },
      ],
      bomLines: [
        {
          id: "bom-b",
          ingredient_id: "ingredient-b",
          product_id: null,
          order_id: null,
          delivery_at: "2026-08-20T00:00:00Z",
          calculated_quantity: 1,
          ingredient_quantity: null,
          product_quantity: null,
        },
        {
          id: "bom-a",
          ingredient_id: "ingredient-a",
          product_id: null,
          order_id: null,
          delivery_at: "2026-08-20T00:00:00Z",
          calculated_quantity: 1,
          ingredient_quantity: null,
          product_quantity: null,
        },
      ],
    }, {
      stocktakeDate: "2026-08-20",
      usageStartDate: "2026-08-20",
      usageEndDate: "2026-08-20",
    });

    expect(report.rows.map((row) => row.ingredientId)).toEqual([
      "ingredient-b",
      "ingredient-a",
    ]);
  });

  it("registers the material usage permission route and central-kitchen navigation item", () => {
    expect(pageAccessKey("/kitchen/material-usage")).toBe("kitchen.material_usage");
    expect(secondaryNav.kitchen).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "kitchenMaterialUsage",
        to: "/kitchen/material-usage",
        permissionKey: "kitchen.material_usage",
      }),
    ]));
  });

  it("keeps stocktake events with null quantities and only calculates numeric differences", () => {
    const report = buildKitchenMaterialUsageReport({
      ingredients: [
        { id: "ingredient-null", name: "未輸入材料", sku: "NULL", stocktake_unit: "個" },
        { id: "ingredient-zero", name: "零數量材料", sku: "ZERO", stocktake_unit: "個" },
      ],
      products: [],
      stocktakes: [
        { ingredient_id: "ingredient-null", quantity: null },
        { ingredient_id: "ingredient-zero", quantity: 0 },
      ],
      bomLines: [{
        id: "bom-null-stocktake",
        ingredient_id: "ingredient-null",
        product_id: null,
        order_id: null,
        delivery_at: "2026-08-20T00:00:00Z",
        calculated_quantity: 4,
        ingredient_quantity: null,
        product_quantity: null,
      }],
    }, {
      stocktakeDate: "2026-08-20",
      usageStartDate: "2026-08-20",
      usageEndDate: "2026-08-20",
    });

    expect(report.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredientId: "ingredient-null", stocktakeQuantity: null, difference: null }),
      expect.objectContaining({ ingredientId: "ingredient-zero", stocktakeQuantity: 0, difference: 0 }),
    ]));
  });

  it("renders material values and reveals per-product BOM details from an injected loader", async () => {
    const user = userEvent.setup();
    let loadReportCalls = 0;
    render(
      <KitchenMaterialUsagePage
        loadStocktakeDates={async () => [{ date: "2026-08-20", updatedAt: "2026-08-20T00:00:00Z" }]}
        loadReport={async (selection) => {
          loadReportCalls += 1;
          return {
          ...selection,
          rows: [{
            ingredientId: "ingredient-1",
            ingredientName: "番茄",
            ingredientSku: "TOM",
            unit: "kg",
            stocktakeQuantity: 12,
            estimatedUsage: 11.5,
            difference: 0.5,
            details: [{
              id: "bom-1",
              productName: "沙律",
              productSku: "SAL",
              orderId: "order-1",
              deliveryAt: "2026-08-19T16:00:00Z",
              productQuantity: 9,
              quantity: 11.5,
            }, {
              id: "bom-2",
              productName: "Second product",
              productSku: "SAL-2",
              orderId: "order-2",
              deliveryAt: "2026-08-20T16:00:00Z",
              productQuantity: 2,
              quantity: 2,
            }],
          }, {
            ingredientId: "ingredient-null",
            ingredientName: "未輸入材料",
            ingredientSku: "NULL",
            unit: "個",
            stocktakeQuantity: null,
            estimatedUsage: 4,
            difference: null,
            details: [],
          }],
          };
        }}
      />,
    );

    const stocktakeSelect = screen.getAllByRole("combobox")[0];
    await waitFor(() => expect(stocktakeSelect).toBeEnabled());
    expect(stocktakeSelect).toHaveValue("");
    expect(loadReportCalls).toBe(0);
    expect(screen.queryByText("番茄")).not.toBeInTheDocument();

    const usageDate = screen.getByLabelText("預計用量日期");
    expect(usageDate).toHaveValue("");
    await user.selectOptions(stocktakeSelect, "2026-08-20");
    fireEvent.change(usageDate, { target: { value: "2026-08-20" } });
    await waitFor(() => expect(screen.getByText("番茄")).toBeInTheDocument());
    expect(stocktakeSelect).toHaveValue("2026-08-20");
    const usageMode = screen.getAllByRole("combobox")[1];
    expect(usageMode).toHaveValue("single");
    expect(screen.getByText("12 kg")).toBeInTheDocument();
    expect(screen.getAllByText("11.5 kg")).toHaveLength(1);
    expect(screen.queryByText("Second product")).not.toBeInTheDocument();
    const showMoreButton = document.querySelector(".kitchen-material-usage-more");
    expect(showMoreButton).toBeInTheDocument();
    await user.click(showMoreButton!);
    expect(screen.getByText("Second product")).toBeInTheDocument();
    expect(screen.getAllByText("11.5 kg")).toHaveLength(2);
    expect(screen.queryByText("未輸入材料")).not.toBeInTheDocument();
    expect(screen.queryAllByText("—")).toHaveLength(0);
    expect(screen.getByText(/沙律/)).toBeInTheDocument();
    expect(screen.getByText(/訂單：order-1/)).toBeInTheDocument();

    await user.selectOptions(usageMode, "range");
    expect(screen.getByLabelText("預計用量開始日")).toBeInTheDocument();
    expect(screen.getByLabelText("預計用量結束日")).toBeInTheDocument();
    await user.selectOptions(usageMode, "single");
    expect(screen.getByLabelText("預計用量日期")).toBeInTheDocument();

  });
});
