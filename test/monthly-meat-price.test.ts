import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  averageMonthlyMeatPrices,
  computeMonthlyMeatUnitPrices,
} from "@/lib/monthly-meat-price";

describe("monthly meat price automation formula", () => {
  it("matches 豬肉粒 × 2026-07 shop/room averages", () => {
    const july3 = computeMonthlyMeatUnitPrices({
      outboundKg: 30.248,
      inboundUnitPrice: 33.06,
      seasoningPerKg: 29.0332,
      yieldKg: 104,
      variationRate: 0.05,
      markupRate: 0.15,
    });
    const july21 = computeMonthlyMeatUnitPrices({
      outboundKg: 30.248,
      inboundUnitPrice: 33.06,
      seasoningPerKg: 29.3139,
      yieldKg: 104,
      variationRate: 0.05,
      markupRate: 0.15,
    });

    expect(july3).not.toBeNull();
    expect(july21).not.toBeNull();

    const averaged = averageMonthlyMeatPrices([july3!, july21!]);
    expect(averaged).toEqual({
      roomPrice: 19.0054,
      shopPrice: 21.8562,
    });
  });

  it("averages production days equally, not by kilograms", () => {
    const small = computeMonthlyMeatUnitPrices({
      outboundKg: 10,
      inboundUnitPrice: 20,
      seasoningPerKg: 0,
      yieldKg: 10,
      variationRate: 0.05,
      markupRate: 0.15,
    });
    const large = computeMonthlyMeatUnitPrices({
      outboundKg: 100,
      inboundUnitPrice: 40,
      seasoningPerKg: 0,
      yieldKg: 100,
      variationRate: 0.05,
      markupRate: 0.15,
    });

    const averaged = averageMonthlyMeatPrices([small!, large!]);
    const equalMeanRoom = ((10 * 20 * 1.05) / 10 + (100 * 40 * 1.05) / 100) / 2;

    expect(averaged?.roomPrice).toBeCloseTo(equalMeanRoom, 4);
    expect(averaged?.roomPrice).not.toBeCloseTo(
      ((10 * 20 + 100 * 40) * 1.05) / 110,
      2,
    );
  });

  it("skips rows that cannot be priced", () => {
    expect(
      computeMonthlyMeatUnitPrices({
        outboundKg: 0,
        inboundUnitPrice: 33,
        seasoningPerKg: 29,
        yieldKg: 104,
        variationRate: 0.05,
        markupRate: 0.15,
      }),
    ).toBeNull();
    expect(averageMonthlyMeatPrices([])).toBeNull();
  });

  it("replaces outbound auto-refresh with a month-scoped push RPC", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817010000_selling_price_cost_push_permission.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("drop trigger if exists refresh_monthly_meat_prices_raw_stock");
    expect(migration).toContain("drop trigger if exists refresh_monthly_meat_prices_prepared_source");
    expect(migration).toContain("drop trigger if exists refresh_monthly_meat_prices_prepared_inbound");
    expect(migration).toContain("create or replace function public.push_monthly_meat_prices");
    expect(migration).toContain("private.has_page_access('frozen.selling_price_cost.push')");
    expect(migration).toContain("p_year_month");
  });
});
