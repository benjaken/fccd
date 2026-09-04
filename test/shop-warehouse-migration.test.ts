import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903140000_shop_warehouse_phase1.sql"),
  "utf8",
);

describe("shop warehouse phase 1 migration", () => {
  it("creates receipts, shipments, and a dry movement ledger", () => {
    expect(sql).toContain("create table if not exists public.shop_warehouse_receipts");
    expect(sql).toContain("create table if not exists public.shop_shipments");
    expect(sql).toContain("create table if not exists public.shop_dry_stock_movements");
    expect(sql).toContain("request_id uuid not null unique");
    expect(sql).toContain("unique (source_type, source_id)");
    expect(sql).toContain("idempotency_key text unique");
  });

  it("does not write shop warehouse stock into stocktake snapshots", () => {
    expect(sql).not.toMatch(/insert into public\.ingredient_stocktake_events/i);
    expect(sql).not.toMatch(/update public\.ingredient_stocktake_events/i);
    expect(sql).not.toMatch(/insert into public\.packing_stocktake_events/i);
  });

  it("reuses meat movements for mapped frozen SKUs and still ships with warnings", () => {
    expect(sql).toContain("insert into public.raw_meat_stock_movements");
    expect(sql).toContain("insert into public.prepared_meat_stock_movements");
    expect(sql).toContain("shop_write_frozen_movement");
    expect(sql).toContain("'low'");
    expect(sql).toContain("'missing'");
    expect(sql).toContain("'unmapped'");
  });

  it("grants warehouse pages to factory and admin only", () => {
    expect(sql).toContain("workspace.factory.warehouse.pending");
    expect(sql).toContain("workspace.factory.warehouse.outbound");
    expect(sql).toContain("workspace.factory.warehouse.inbound");
    expect(sql).toContain("('Super Admin'), ('Admin'), ('Factory')");
    expect(sql).not.toMatch(/Shop manager[\s\S]*workspace\.factory\.warehouse/);
  });
});
