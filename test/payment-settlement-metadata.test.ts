import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("payment settlement metadata migration", () => {
  const migration = readFileSync(
    "supabase/migrations/20260908223000_allow_incomplete_payment_settlement_metadata.sql",
    "utf8",
  );

  it("allows reconciliation without brand or payment method metadata", () => {
    expect(migration).toContain(
      "create or replace function public.reconcile_payment_settlement_permission_impl",
    );
    expect(migration).not.toContain(
      "every payment must have a channel and payment method",
    );
  });

  it("keeps invoice and receipt fields optional for later editing", () => {
    const updateMigration = readFileSync(
      "supabase/migrations/20260825050000_permission_driven_operational_writes.sql",
      "utf8",
    );

    expect(updateMigration).toContain("invoice_number = nullif(trim(p_invoice_number), '')");
    expect(updateMigration).toContain("receipt_number = nullif(trim(p_receipt_number), '')");
  });
});
