import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("permanent driver delivery sessions migration", () => {
  it("makes new and existing driver sessions non-expiring", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20260901210000_make_driver_delivery_sessions_permanent.sql"),
      "utf8",
    );

    expect(migration).toContain("alter column expires_at set default 'infinity'::timestamptz");
    expect(migration).toContain("set expires_at = 'infinity'::timestamptz");
  });
});
