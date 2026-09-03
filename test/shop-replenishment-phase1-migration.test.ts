import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903120000_shop_replenishment_phase1.sql"),
  "utf8",
);

describe("shop replenishment phase 1 migration", () => {
  it("creates shop order tables and restaurant workspace pages", () => {
    expect(sql).toContain("create table if not exists public.shop_catalog_items");
    expect(sql).toContain("create table if not exists public.shop_order_requests");
    expect(sql).toContain("('workspace.restaurant'");
    expect(sql).toContain("restaurant.ordering.review.send_factory");
  });

  it("does not grant shop managers factory send", () => {
    expect(sql).toMatch(/role = 'Shop manager'[\s\S]*restaurant.ordering.review.send_factory/);
  });

  it("seeds the restaurant supplier catalog", () => {
    expect(sql).toContain("FC_凍肉");
    expect(sql).toContain("FC_乾貨");
    expect(sql).toContain("鳳香園麵飽有限公司");
  });
});
