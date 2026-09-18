import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260918120000_reject_duplicate_order_numbers.sql",
  ),
  "utf8",
).replaceAll("\r\n", "\n");

describe("duplicate order-number guard", () => {
  it("rejects an order number that another document already uses", () => {
    expect(sql).toContain("raise exception 'order_number_exists' using errcode = '23505'");
    expect(sql).toContain("existing.order_number = new.order_number");
    expect(sql).toContain("existing.id is distinct from new.id");
  });

  it("only compares active documents so re-imports of archived rows still work", () => {
    expect(sql).toContain("or new.archived_at is not null then");
    expect(sql).toContain("where existing.archived_at is null");
  });

  it("runs after the canonical order-number standardization", () => {
    expect(sql).toContain("create trigger zzz_reject_duplicate_order_number");
    expect(sql).toContain("before insert or update of order_number on public.orders");
    expect("zzz_reject_duplicate_order_number".localeCompare("zz_standardize_order_number")).toBeGreaterThan(0);
  });

  it("exposes a permission-safe lookup for the editor", () => {
    expect(sql).toContain("create or replace function public.order_number_exists(");
    expect(sql).toContain("private.standardize_order_number(");
    expect(sql).toContain(
      "grant execute on function public.order_number_exists(text, uuid) to authenticated;",
    );
  });
});
