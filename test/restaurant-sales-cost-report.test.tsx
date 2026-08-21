import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RestaurantSalesCostReport } from "@/components/RestaurantSalesCostReport";
import i18n from "@/i18n";
import {
  buildRestaurantSalesCostReport,
  defaultRestaurantSalesCostMonths,
  findDefaultSalesCostRestaurant,
  type RestaurantSalesCostRow,
} from "@/lib/restaurant-sales-cost-report";

const restaurants = [
  { id: "ylp", name: "YLP 桂花小幸 元朗" },
  { id: "tko", name: "TKO 桂花小幸 將軍澳" },
];

const row: RestaurantSalesCostRow = {
  monthStart: "2026-01-01",
  restaurantId: "tko",
  restaurantName: restaurants[1].name,
  salesRestaurant: 1_143_146.3,
  salesWaterBar: 81_565,
  salesMisc: 0,
  openingRestaurant: 0,
  openingWaterBar: 18_745.19,
  openingMisc: 0,
  purchasesRestaurant: 0,
  purchasesWaterBar: 0,
  purchasesMisc: 10_722.4,
  closingRestaurant: 0,
  closingWaterBar: 16_930.42,
  closingMisc: 0,
  suppliers: [
    {
      supplierId: "ci",
      supplierName: "長明國際 (CI)",
      restaurant: 7_777,
      waterBar: 0,
      misc: 0,
      total: 7_777,
    },
    {
      supplierId: "sfm",
      supplierName: "新豐凍肉 (SFFM)",
      restaurant: 28_104.4,
      waterBar: 0,
      misc: 0,
      total: 28_104.4,
    },
  ],
};

const februaryRow: RestaurantSalesCostRow = {
  ...row,
  monthStart: "2026-02-01",
  salesRestaurant: 81_948.6,
  salesWaterBar: 6_729.3,
  openingRestaurant: 38_907.18,
  openingWaterBar: 16_930.42,
  purchasesRestaurant: 307_464.68,
  purchasesWaterBar: 35_936.15,
  purchasesMisc: 7_291.17,
  closingRestaurant: 37_430.68,
  closingWaterBar: 21_257.04,
  suppliers: [
    {
      supplierId: "ci",
      supplierName: "長明國際 (CI)",
      restaurant: 5_604,
      waterBar: 0,
      misc: 0,
      total: 5_604,
    },
  ],
};

describe("Restaurant sales cost report", () => {
  it("defaults to January through the current month and TKO", () => {
    expect(defaultRestaurantSalesCostMonths(new Date(2026, 7, 21))).toEqual({
      startMonth: "2026-01",
      endMonth: "2026-08",
    });
    expect(findDefaultSalesCostRestaurant(restaurants)?.id).toBe("tko");
  });

  it("calculates department and report COS and gross profit", () => {
    const month = buildRestaurantSalesCostReport([row])[0];
    expect(month.sales.total).toBeCloseTo(1_224_711.3);
    expect(month.costOfSales.waterBar).toBeCloseTo(1_814.77);
    expect(month.costOfSales.total).toBeCloseTo(12_537.17);
    expect(month.grossProfit.total).toBeCloseTo(1_212_174.13);
  });

  it("keeps every supplier and summary row aligned across months", () => {
    const months = buildRestaurantSalesCostReport([row, februaryRow]);
    expect(months[0].suppliers).toHaveLength(2);
    expect(months[1].suppliers).toHaveLength(2);
    expect(months[1].suppliers[1]).toMatchObject({
      supplierId: "sfm",
      supplierName: "新豐凍肉 (SFFM)",
      restaurant: 0,
      waterBar: 0,
      misc: 0,
      total: 0,
    });
  });

  it("renders the screenshot fields and loads TKO by default", async () => {
    await i18n.changeLanguage("zh-HK");
    const loadReport = vi.fn().mockResolvedValue([row, februaryRow]);
    render(
      <RestaurantSalesCostReport
        loadRestaurants={vi.fn().mockResolvedValue(restaurants)}
        loadReport={loadReport}
      />,
    );

    expect((await screen.findAllByText("$1,224,711.30")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Total COS")).toHaveLength(2);
    expect(screen.getAllByText("COS/sales")).toHaveLength(2);
    expect(screen.getAllByText("GP%")).toHaveLength(2);
    expect(screen.getAllByText("長明國際 (CI)")).toHaveLength(2);
    expect(screen.getAllByText("新豐凍肉 (SFFM)")).toHaveLength(2);
    expect(screen.getAllByText("供應商：")).toHaveLength(2);
    expect(screen.getByLabelText("下降 92.76%")).toBeInTheDocument();
    expect(screen.getByLabelText("下降 27.94%")).toHaveClass("positive");
    expect(screen.getByRole("button", { name: restaurants[1].name })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("報告開始月份")).toHaveValue(`${new Date().getFullYear()}-01`);
    await waitFor(() => expect(loadReport).toHaveBeenCalledWith(expect.objectContaining({
      startMonth: `${new Date().getFullYear()}-01`,
      restaurantId: "tko",
    })));
  });
});
