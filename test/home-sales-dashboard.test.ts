import { describe, expect, it } from "vitest";

import {
  buildHomeSalesDashboard,
  cateringChannelAbbreviation,
  homeSalesPeriods,
  tkoPlatformBucket,
} from "@/lib/home-sales-dashboard";

describe("home sales dashboard aggregation", () => {
  it("builds the four requested calendar months across a year boundary", () => {
    expect(homeSalesPeriods(new Date(2026, 0, 15))).toEqual([
      { key: "previousYearPreviousMonth", year: 2024, month: 12, startDate: "2024-12-01", endDate: "2024-12-31" },
      { key: "previousYearCurrentMonth", year: 2025, month: 1, startDate: "2025-01-01", endDate: "2025-01-31" },
      { key: "previousMonth", year: 2025, month: 12, startDate: "2025-12-01", endDate: "2025-12-31" },
      { key: "currentMonth", year: 2026, month: 1, startDate: "2026-01-01", endDate: "2026-01-31" },
    ]);
  });

  it("abbreviates catering brands to the screenshot codes", () => {
    expect(cateringChannelAbbreviation("Catering")).toBe("FCC");
    expect(cateringChannelAbbreviation("HK lunch box")).toBe("FCB");
    expect(cateringChannelAbbreviation("Kitchen")).toBe("FCK");
    expect(cateringChannelAbbreviation("Express")).toBe("FCE");
    expect(cateringChannelAbbreviation("HK Party Food")).toBe("FCP");
    expect(cateringChannelAbbreviation("Cuisine")).toBe("FCL");
    expect(cateringChannelAbbreviation("Delivery")).toBe("FCD");
    expect(cateringChannelAbbreviation("Residential")).toBe("FCR");
  });

  it("groups TKO platforms into Food Panda, Keeta, Openrice, and others", () => {
    expect(tkoPlatformBucket("foodpanda", "Foodpanda")).toEqual({
      id: "foodpanda",
      name: "Food Panda",
    });
    expect(tkoPlatformBucket("keeta", "Keeta")).toEqual({
      id: "keeta",
      name: "Keeta",
    });
    expect(tkoPlatformBucket("openrice", "Openrice")).toEqual({
      id: "openrice",
      name: "Openrice",
    });
    expect(tkoPlatformBucket("shop_sales", "店舖銷售")).toEqual({
      id: "other",
      name: "其他",
    });
  });

  it("aggregates catering abbreviations and keeps only TKO restaurant channels", () => {
    const data = buildHomeSalesDashboard(
      [
        { year: 2025, month: 8, channel: "Catering", amount: 80 },
        { year: 2025, month: 9, channel: "Catering", amount: 90 },
        { year: 2026, month: 8, channel: "Catering", amount: 100 },
        { year: 2026, month: 9, channel: "Catering", amount: 120 },
        { year: 2026, month: 9, channel: "Cuisine", amount: 15 },
      ],
      [
        { bucketStart: "2026-08-01", restaurantId: "tko", restaurantName: "TKO 桂花小幸 將軍澳", restaurantOrder: 0, categoryKey: "foodpanda", categoryName: "Foodpanda", categoryOrder: 0, amount: 50 },
        { bucketStart: "2026-09-01", restaurantId: "tko", restaurantName: "TKO 桂花小幸 將軍澳", restaurantOrder: 0, categoryKey: "foodpanda", categoryName: "Foodpanda", categoryOrder: 0, amount: 55 },
        { bucketStart: "2026-09-01", restaurantId: "tko", restaurantName: "TKO 桂花小幸 將軍澳", restaurantOrder: 0, categoryKey: "shop_sales", categoryName: "店舖銷售", categoryOrder: -1000, amount: 20 },
        { bucketStart: "2026-09-01", restaurantId: "ylp", restaurantName: "YLP 桂花小幸 元朗", restaurantOrder: 1, categoryKey: "foodpanda", categoryName: "Foodpanda", categoryOrder: 0, amount: 999 },
        { bucketStart: "2026-09-01", restaurantId: "tko", restaurantName: "TKO 桂花小幸 將軍澳", restaurantOrder: 0, categoryKey: "__total__", categoryName: "總營業額", categoryOrder: -1, amount: 9999 },
      ],
      new Date(2026, 8, 1),
    );

    expect(data.cateringChannels.map((row) => row.name)).toEqual([
      "FCC",
      "FCB",
      "FCK",
      "FCE",
      "FCP",
      "FCL",
    ]);
    expect(data.cateringChannels[0].values).toEqual({
      previousYearPreviousMonth: 80,
      previousYearCurrentMonth: 90,
      previousMonth: 100,
      currentMonth: 120,
    });
    expect(data.tkoChannels.map((row) => row.name)).toEqual([
      "Food Panda",
      "Keeta",
      "Openrice",
      "其他",
    ]);
    expect(data.tkoChannels[0].values.previousMonth).toBe(50);
    expect(data.tkoChannels[0].values.currentMonth).toBe(55);
    expect(data.tkoChannels[3].values.currentMonth).toBe(20);
  });
});
