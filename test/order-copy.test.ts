import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("order copying", () => {
  it("creates a new draft without the source number, payments, delivery id, or print state", () => {
    const source = readFileSync("src/lib/order-editor.ts", "utf8").replaceAll(
      "\r\n",
      "\n",
    );

    expect(source).toContain('id: copy ? null : row.id');
    expect(source).toContain('orderNumber: copy ? "" : row.order_number ?? ""');
    expect(source).toContain("payments: copy\n      ? []");
    expect(source).toContain("deliveryId: copy ? null");
    expect(source).toContain("factoryPrintDate: copy ? null");
  });

  it("assigns copied web orders a locked brand-specific monthly sequence", () => {
    const migration = readFileSync(
      "supabase/migrations/20260821024000_assign_web_order_numbers.sql",
      "utf8",
    );

    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("new.legacy_id not like 'web-order-%'");
    expect(migration).toContain("when 'catering' then 'FCCO'");
    expect(migration).toContain("new.order_number := v_prefix || v_month");
  });
});
