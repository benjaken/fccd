import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260825154000_fix_daily_sales_new_product_name.sql",
  ),
  "utf8",
);

describe("restaurant daily-sales new product correction", () => {
  it("retires the duplicate legacy product and adds a sync-safe replacement", () => {
    expect(sql).toContain("'[晚餐]清湯蘿蔔牛腩'");
    expect(sql).toContain("is_active = false");
    expect(sql).toContain("legacy_id = '1721187681817x829037214129455100'");
    expect(sql).toContain("'web-restaurant-new-product-dinner-clear-radish-beef-brisket'");
    expect(sql).toContain("on conflict (legacy_id) do update");
  });
});
