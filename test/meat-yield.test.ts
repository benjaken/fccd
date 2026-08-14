import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  YIELD_ERROR_THRESHOLD_RATIO,
  YIELD_FORMULA_VERSION,
  estimatePreparedMeatYield,
  shouldRecordMeatYieldError,
} from "@/lib/meat-yield";

describe("prepared meat 預算收成", () => {
  it("matches Bubble: historical packs/kg × current kg, ceiling", () => {
    const estimate = estimatePreparedMeatYield({
      rawInputKg: 13.91,
      historicalPacks: 575,
      historicalRawKg: 260.147,
      kgPerPackage: 0.5,
    });

    expect(estimate.packsPerKg).toBeCloseTo(2.210289, 6);
    expect(estimate.expectedPacks).toBe(31);
    expect(estimate.formulaVersion).toBe(YIELD_FORMULA_VERSION);
  });

  it("matches 燜牛筋 150.181 kg → 56 packs, not the theoretical 87", () => {
    const estimate = estimatePreparedMeatYield({
      rawInputKg: 150.181,
      historicalPacks: 5436,
      historicalRawKg: 14662.314,
      kgPerPackage: 2,
    });

    expect(estimate.expectedPacks).toBe(56);
    expect(shouldRecordMeatYieldError(55, estimate.expectedPacks).isError).toBe(
      false,
    );
  });

  it("does not estimate when there is no historical raw kg", () => {
    const estimate = estimatePreparedMeatYield({
      rawInputKg: 13.91,
      historicalPacks: 575,
      historicalRawKg: 0,
    });
    expect(estimate.expectedPacks).toBeNull();
  });

  it("records 收成錯誤 when actual packs miss 預算收成 by more than 15%", () => {
    expect(YIELD_ERROR_THRESHOLD_RATIO).toBe(0.15);
    expect(shouldRecordMeatYieldError(80, 31).isError).toBe(true);
    expect(shouldRecordMeatYieldError(80, 31).direction).toBe("over");
    expect(shouldRecordMeatYieldError(8, 31).isError).toBe(true);
    expect(shouldRecordMeatYieldError(8, 31).direction).toBe("under");
    expect(shouldRecordMeatYieldError(26, 31).isError).toBe(true);
    expect(shouldRecordMeatYieldError(36, 31).isError).toBe(true);
  });

  it("does not record when the miss is within 15%", () => {
    expect(shouldRecordMeatYieldError(27, 31).isError).toBe(false);
    expect(shouldRecordMeatYieldError(28, 31).isError).toBe(false);
    expect(shouldRecordMeatYieldError(31, 31).isError).toBe(false);
    expect(shouldRecordMeatYieldError(34, 31).isError).toBe(false);
    expect(shouldRecordMeatYieldError(35, 31).isError).toBe(false);
  });

  it("does not record when 預算收成 cannot be computed", () => {
    expect(shouldRecordMeatYieldError(80, null).isError).toBe(false);
    expect(shouldRecordMeatYieldError(80, 0).isError).toBe(false);
  });
});

describe("meat yield error migration", () => {
  it("creates the 收成錯誤 table and 10% recording function", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814200000_create_meat_yield_errors.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create table public.meat_yield_errors");
    expect(migration).toContain("threshold_ratio numeric(12, 6) not null default 0.10");
    expect(migration).toContain("estimate_prepared_meat_yield");
    expect(migration).toContain("record_meat_yield_error_if_needed");
    expect(migration).toContain("abs(v_deviation_ratio) <= v_threshold");
    expect(migration).toContain("Production reads meat yield errors");
    expect(migration).toContain("'Super Admin', 'Admin', 'Accounting', 'Factory'");
    expect(migration).toContain("enable row level security");
  });
});

describe("meat yield error page permissions", () => {
  it("registers 收成錯誤 under Frozen Goods for production roles", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814210000_frozen_yield_errors_page_permissions.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("'frozen.yield_errors'");
    expect(migration).toContain("'/frozen/yield-errors'");
    expect(migration).toContain("sort_order");
    expect(migration).toContain("62");
    expect(migration).toContain(
      "roles.role in ('Admin', 'Factory', 'Accounting')",
    );
  });
});

describe("meat yield error historical backfill", () => {
  it("upserts 收成錯誤 from prepared inbound that miss 預算收成 by 10%", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814220000_backfill_meat_yield_errors.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("private.backfill_meat_yield_errors");
    expect(migration).toContain("prepared_meat_stock_movements");
    expect(migration).toContain("inbound_packages");
    expect(migration).toContain("estimate_prepared_meat_yield");
    expect(migration).toContain("/ estimate.expected_packs > 0.10");
    expect(migration).toContain("on conflict (prepared_stock_movement_id)");
    expect(migration).toContain("select private.backfill_meat_yield_errors()");
  });

  it("switches 預算收成 to Bubble historical packs-per-kg ceiling", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814230000_budget_yield_historical_rate.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("historical_packs_per_kg_ceiling_v1");
    expect(migration).toContain("ceil(v_hist_packs / v_hist_raw_kg * p_raw_input_kg)");
    expect(migration).toContain("p_exclude_prepared_stock_movement_id");
    expect(migration).toContain("delete from public.meat_yield_errors");
  });

  it("widens the recording threshold from 10% to 15%", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814240000_meat_yield_error_threshold_15.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("alter column threshold_ratio set default 0.15");
    expect(migration).toContain("v_threshold numeric := 0.15");
    expect(migration).toContain("/ estimate.expected_packs > 0.15");
    expect(migration).toContain("delete from public.meat_yield_errors");
    expect(migration).toContain("select private.backfill_meat_yield_errors()");
  });
});
