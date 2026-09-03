import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903080000_activate_taoda_and_create_shop_catalog_suppliers.sql",
  ),
  "utf8",
);

describe("shop catalog supplier master migration", () => {
  it("reactivates 淘大 without inserting a duplicate", () => {
    expect(sql).toMatch(/update public\.suppliers[\s\S]*is_active = true[\s\S]*company_name = '淘大'/);
    expect(sql).not.toMatch(/insert into public\.suppliers[\s\S]*'淘大'/);
  });

  it("creates 浚峰 and 益力多 only when missing", () => {
    expect(sql).toContain("'浚峰企業有限公司'");
    expect(sql).toContain("'益力多公司'");
    expect(sql).toContain("web-supplier-shop-catalog-junfeng");
    expect(sql).toContain("web-supplier-shop-catalog-yakult");
    expect(sql).toContain("where not exists");
  });
});
