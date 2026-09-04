import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903150000_shop_receive_phase1.sql"),
  "utf8",
);

describe("shop receive migration", () => {
  it("creates one receive per shipment and an exception ledger", () => {
    expect(sql).toContain("create table if not exists public.shop_receives");
    expect(sql).toContain("shipment_id uuid not null unique");
    expect(sql).toContain("create table if not exists public.shop_receive_exceptions");
    expect(sql).toContain("receive_shop_shipment");
    expect(sql).toContain("idempotency_key text unique");
  });

  it("lets the restaurant workspace confirm receive", () => {
    expect(sql).toContain("workspace.restaurant.receive");
    expect(sql).toContain("確認收貨");
    expect(sql).toContain("Shop manager");
  });
});
