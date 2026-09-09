import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903140000_shop_warehouse_phase1.sql"),
  "utf8",
);
const moveSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260907110000_move_warehouse_to_restaurant_ordering.sql"),
  "utf8",
);
const automationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260907120000_auto_ship_and_material_stocktakes.sql"),
  "utf8",
);
const dryGoodsReceiptSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908190000_restrict_shop_receipts_to_dry_goods.sql"),
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

  it("moves warehouse navigation under restaurant ordering without changing capability keys", () => {
    expect(moveSql).toContain("/restaurant/ordering/inventory");
    expect(moveSql).toContain("parent_page_key = 'restaurant.ordering'");
    expect(moveSql).toContain("workspace.factory.warehouse");
  });

  it("ships immediately when an approved request is sent to the factory", () => {
    expect(automationSql).toContain("perform public.ship_shop_order_request(p_request_id, v_lines)");
    expect(automationSql).toContain("where page_key = 'workspace.factory.warehouse.pending'");
  });

  it("creates idempotent ingredient or packing snapshots from dry movements", () => {
    expect(automationSql).toContain("after insert on public.shop_dry_stock_movements");
    expect(automationSql).toContain("insert into public.ingredient_stocktake_events");
    expect(automationSql).toContain("insert into public.packing_stocktake_events");
    expect(automationSql).toContain("'shop-auto-' || v_catalog.stocktake_kind || '-stocktake:'");
    expect(automationSql).toContain("on conflict (legacy_id) do nothing");
    expect(automationSql).toContain("stocktake_kind = 'ingredient'");
    expect(automationSql).toContain("stocktake_kind = 'packing'");
    expect(automationSql).toContain("v_catalog.channel <> 'fc_internal'");
  });

  it("keeps manual warehouse receipts limited to purchased dry goods", () => {
    expect(dryGoodsReceiptSql).toContain("new.warehouse <> 'dry'");
    expect(dryGoodsReceiptSql).toContain("prepared meat must be produced from frozen raw meat");
    expect(dryGoodsReceiptSql).toContain("before insert or update of warehouse");
  });
});
