import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("dedupe payment settlement payment links migration", () => {
  const migration = readFileSync(
    "supabase/migrations/20260911110000_dedupe_payment_settlement_payment_links.sql",
    "utf8",
  );

  it("removes extra settlement links for the same payment", () => {
    expect(migration).toContain("partition by link.payment_id");
    expect(migration).toContain("keep_rank > 1");
    expect(migration).toContain(
      "payment_settlement_payments_payment_id_uidx",
    );
    expect(migration).toContain(
      "payment_settlement_payments_payment_legacy_id_uidx",
    );
  });

  it("prefers settlements that already have INV and REC numbers", () => {
    expect(migration).toContain("invoice_number");
    expect(migration).toContain("receipt_number");
  });
});
