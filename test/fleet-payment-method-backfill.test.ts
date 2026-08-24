import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("fleet payment-method backfill", () => {
  it("matches mixed-case Sun-Line names before stripping punctuation", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260824034000_backfill_fleet_payment_methods.sql",
    ), "utf8");

    expect(migration).toContain("regexp_replace(lower(name)");
    expect(migration).toContain("coalesce(btrim(bank_account), '') = ''");
  });

  it("requires an administrator confirmation and copies Bubble payment text", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/bubble-backfill-fleet-payment-methods/index.ts",
    ), "utf8");

    expect(source).toContain('"BACKFILL_DELIVERY_TEAM_PAYMENT_METHODS"');
    expect(source).toContain('["Super Admin", "Admin"]');
    expect(source).toContain('record["payment method(text)"]');
    expect(source).toContain(".eq(\"legacy_id\", legacyId)");
    expect(source).toContain('String(existing.bank_account ?? "").trim()');
  });
});
