import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928052000_complete_self_arranged_fleet_after_delivery_date.sql",
  ),
  "utf8",
);

describe("self-arranged fleet completes after the delivery date", () => {
  it("marks 自行叫車 and 自主叫車 delivered only after the Hong Kong date has passed", () => {
    expect(migration).toContain(
      "create or replace function public.assign_delivery_motorcade",
    );
    expect(migration).toContain("in ('自行叫車', '自主叫車')");
    expect(migration).toContain("at time zone 'Asia/Hong_Kong'");
    expect(migration).toContain("and v_delivery_passed");
    expect(migration).toContain("when v_auto_complete then '已送達'");
    expect(migration).toContain("else '待接單'");
    expect(migration).toContain(
      "public.complete_past_self_arranged_deliveries",
    );
    expect(migration).toContain("and delivery.fulfilled_at is null");
    expect(migration).toContain(
      "'fccd-complete-past-self-arranged-deliveries'",
    );
    expect(migration).toContain("'5 16 * * *'");
  });
});
