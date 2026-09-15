import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("2026 Mid-Autumn order-intake configuration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260915145000_mid_autumn_catalog_rules.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("uses product-database links instead of manually configured recommendation URLs", () => {
    expect(sql).toContain("create or replace function public.search_order_intake_catalog");
    expect(sql).toContain("public.shopify_catalog_drafts");
    expect(sql).toContain("public.shopify_stores");
    expect(sql).toContain("grant execute on function public.search_order_intake_catalog");
  });

  it("configures both busy date ranges for Mid-Autumn packages and individual items", () => {
    expect(sql).toContain("'2026-09-19'::date, '2026-09-20'::date");
    expect(sql).toContain("'2026-09-25'::date, '2026-09-27'::date");
    expect(sql).toContain("array['中秋套餐', '中秋單點']::text[]");
    expect(sql).toContain("start_time = null");
    expect(sql).toContain("      null\n    from unnest(v_channel_ids)");
    expect(sql).toContain("coalesce(cardinality(v_channel_ids), 0) <> 2");
  });
});
