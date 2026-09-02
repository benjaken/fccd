import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902050000_restore_factory_dispatch_time_update.sql",
  ),
  "utf8",
);

describe("factory dispatch-time migration", () => {
  it("restores the authenticated RPC and keeps order and delivery times aligned", () => {
    expect(migration).toContain(
      "create or replace function public.update_factory_order_dispatch_time",
    );
    expect(migration).toContain("private.jwt_app_role()");
    expect(migration).toContain("update public.orders");
    expect(migration).toContain("update public.deliveries");
    expect(migration).toContain("to authenticated");
  });
});
