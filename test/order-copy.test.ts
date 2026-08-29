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

  it("assigns copied web orders a locked historical brand sequence", () => {
    const migration = readFileSync(
      "supabase/migrations/20260829140000_fix_hk_lunch_box_order_numbers.sql",
      "utf8",
    );

    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("new.legacy_id not like 'web-order-%'");
    expect(migration).toContain("when 'catering' then '#'");
    expect(migration).toContain("when 'hk lunch box' then 'B-'");
    expect(migration).toContain("when 'kitchen' then 'K-'");
    expect(migration).toContain("when 'express' then 'E-'");
    expect(migration).toContain("when 'cuisine' then 'L-'");
    expect(migration).toContain("when 'delivery' then 'D-'");
    expect(migration).toContain("when 'residential' then 'R-'");
    expect(migration).toContain("when 'hk party food' then 'P-'");
    expect(migration).toContain("new.order_number := v_prefix || v_sequence::text");
    expect(migration).toContain("v_quote.channel_id, null, 'order'");
    expect(migration).toContain("returning inserted.order_number into v_order_number");
  });
});
