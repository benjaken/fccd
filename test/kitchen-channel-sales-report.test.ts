import { describe, expect, it } from "vitest";

import {
  buildKitchenChannelSalesYearSummary,
  defaultKitchenChannelSalesYears,
  kitchenChannelSalesChannels,
  kitchenChannelSalesYears,
  type KitchenChannelSalesReportRow,
} from "@/lib/kitchen-channel-sales-report";

const rows: KitchenChannelSalesReportRow[] = [
  { year: 2025, month: 1, channel: "Catering", amount: 1000 },
  { year: 2025, month: 1, channel: "Kitchen", amount: 250 },
  { year: 2025, month: 2, channel: "Catering", amount: 800 },
  { year: 2026, month: 1, channel: "Catering", amount: 1200 },
];

describe("central kitchen channel sales report", () => {
  it("derives available years and keeps the screenshot channel order", () => {
    expect(kitchenChannelSalesYears(rows)).toEqual([2025, 2026]);
    expect(defaultKitchenChannelSalesYears([2027, 2026, 2025])).toEqual([
      2025,
      2026,
    ]);
    expect(kitchenChannelSalesChannels(rows).slice(0, 2)).toEqual([
      "Catering",
      "Kitchen",
    ]);
  });

  it("builds monthly and annual channel totals", () => {
    const channels = kitchenChannelSalesChannels(rows);
    const summary = buildKitchenChannelSalesYearSummary(rows, 2025, channels);

    expect(summary.sales.Catering[0]).toBe(1000);
    expect(summary.sales.Catering[1]).toBe(800);
    expect(summary.channelTotals.Kitchen).toBe(250);
    expect(summary.monthlyTotals.slice(0, 2)).toEqual([1250, 800]);
    expect(summary.totalSales).toBe(2050);
  });
});
