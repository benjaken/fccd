import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260901150000_keep_order_outstanding_in_sync.sql",
  ),
  "utf8",
);

describe("order outstanding payment invariant", () => {
  it("recalculates after active payment ledger changes", () => {
    expect(migration).toContain("sync_order_outstanding_after_payment");
    expect(migration).toMatch(
      /after insert or delete or update of order_id, amount, voided_at\s+on public\.payments/i,
    );
    expect(migration).toContain("payments.voided_at is null");
  });

  it("prevents a later order refresh from restoring a stale balance", () => {
    expect(migration).toContain("guard_order_outstanding_from_payments");
    expect(migration).toMatch(
      /before update of grand_total, outstanding, document_type\s+on public\.orders/i,
    );
    expect(migration).toContain("new.outstanding > v_calculated");
    expect(migration).toContain("new.outstanding := v_calculated");
    expect(migration).toContain("'paid'");
    expect(migration).toContain("'refunded'");
  });

  it("only lowers existing balances during the historical backfill", () => {
    expect(migration).toContain(
      "orders.outstanding > private.order_outstanding_from_payments",
    );
    expect(migration).toContain(
      "this backfill must never turn a source-confirmed zero balance",
    );
  });
});
