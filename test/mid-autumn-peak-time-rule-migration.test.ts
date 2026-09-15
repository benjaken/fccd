import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("2026 Mid-Autumn peak-time order-intake rule", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260915150000_mid_autumn_peak_time_rule.sql"),
    "utf8",
  );

  it("routes 17:00-19:00 on both configured busy date ranges to manual review", () => {
    expect(sql).toContain("'2026-09-19'::date, '2026-09-20'::date");
    expect(sql).toContain("'2026-09-25'::date, '2026-09-27'::date");
    expect(sql).toContain("'17:00', '19:00'");
    expect(sql).toContain("'manual_review', 'manual_review'");
    expect(sql).toContain("17:00（含）至 19:00（不含）");
  });

  it("states the allowed brands and products without hard-rejecting the inquiry", () => {
    expect(sql).toContain("Food Channels Catering（FCC）");
    expect(sql).toContain("Food Channels Kitchen（FCK）");
    expect(sql).toContain("中秋套餐及中秋單點");
    expect(sql).toContain("不直接拒絕客人");
  });
});
