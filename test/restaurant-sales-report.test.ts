import { describe, expect, it } from "vitest";

import {
  buildRestaurantSalesMatrix,
  defaultRestaurantSalesDates,
  monthDateRange,
  weekDateRange,
  type RestaurantSalesReportRow,
} from "@/lib/restaurant-sales-report";

const rows: RestaurantSalesReportRow[] = [
  {
    bucketStart: "2026-01-01",
    restaurantId: "ylp",
    restaurantName: "YLP 桂花小幸 元朗",
    restaurantOrder: 1,
    categoryKey: "shop_sales",
    categoryName: "店舖銷售",
    categoryOrder: -1000,
    amount: 800,
  },
  {
    bucketStart: "2026-01-01",
    restaurantId: "ylp",
    restaurantName: "YLP 桂花小幸 元朗",
    restaurantOrder: 1,
    categoryKey: "foodpanda",
    categoryName: "Foodpanda",
    categoryOrder: 1,
    amount: 200,
  },
  {
    bucketStart: "2026-01-01",
    restaurantId: "tko",
    restaurantName: "TKO 桂花小幸 將軍澳",
    restaurantOrder: 2,
    categoryKey: "foodpanda",
    categoryName: "Foodpanda",
    categoryOrder: 1,
    amount: 300,
  },
];

describe("restaurant sales report", () => {
  it("defaults monthly reporting from January through the current month", () => {
    expect(defaultRestaurantSalesDates(new Date(2026, 7, 20))).toEqual({
      monthStart: "2026-01",
      monthEnd: "2026-08",
      dayStart: "2026-08-01",
      dayEnd: "2026-08-20",
      weekDate: "2026-08-20",
    });
    expect(monthDateRange("2026-01", "2026-08")).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-08-31",
    });
  });

  it("treats any selected day as its Monday-to-Sunday week", () => {
    expect(weekDateRange("2026-08-20")).toEqual({
      startDate: "2026-08-17",
      endDate: "2026-08-23",
    });
    expect(weekDateRange("2026-08-23")).toEqual({
      startDate: "2026-08-17",
      endDate: "2026-08-23",
    });
  });

  it("builds shop, category, and total values for the wide report table", () => {
    const matrix = buildRestaurantSalesMatrix(rows);
    expect(matrix.restaurants.map((item) => item.id)).toEqual(["ylp", "tko"]);
    expect(matrix.categories.map((item) => item.name)).toEqual([
      "店舖銷售",
      "Foodpanda",
    ]);
    expect(matrix.buckets[0].totals).toEqual({ ylp: 1000, tko: 300 });
    expect(matrix.buckets[0].values.ylp.foodpanda).toBe(200);
  });

  it("uses the control total without displaying it as a category", () => {
    const matrix = buildRestaurantSalesMatrix([
      ...rows,
      {
        ...rows[0],
        categoryKey: "__total__",
        categoryName: "總營業額",
        categoryOrder: -10000,
        amount: 950,
      },
    ]);

    expect(matrix.categories.map((item) => item.key)).not.toContain("__total__");
    expect(matrix.buckets[0].totals.ylp).toBe(950);
  });
});
