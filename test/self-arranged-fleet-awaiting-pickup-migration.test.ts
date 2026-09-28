import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928140000_self_arranged_fleet_awaiting_pickup.sql",
  ),
  "utf8",
);

describe("self-arranged fleet awaiting pickup", () => {
  it("assigns 自行叫車 to 待取貨 before the meal window, not 待接單", () => {
    expect(migration).toContain(
      "create or replace function public.assign_delivery_motorcade",
    );
    expect(migration).toContain("v_self_arranged boolean");
    expect(migration).toContain("in ('自行叫車', '自主叫車')");
    expect(migration).toContain("when v_self_arranged then '待取貨'");
    expect(migration).toContain("when v_auto_complete then '已送達'");
    expect(migration).toContain("else '待接單'");
    expect(migration).toContain(
      "when v_auto_complete or v_self_arranged then coalesce(delivery.accepted_at, now())",
    );
  });

  it("backfills open self-arranged rows from 待接單 to 待取貨", () => {
    expect(migration).toContain("delivery_status = '待取貨'");
    expect(migration).toContain("driver_confirmation_status = 'accepted'");
    expect(migration).toContain("and delivery.fulfilled_at is null");
    expect(migration).toContain("and delivery.taken_at is null");
  });
});
