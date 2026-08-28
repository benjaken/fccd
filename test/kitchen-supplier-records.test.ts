import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260827100000_kitchen_supplier_purchase_multiple_records.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const entryFilterMigration = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260827110000_kitchen_supplier_entry_category_filter.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("central kitchen supplier purchase records", () => {
  it("keeps multiple submissions for the same supplier and day", () => {
    expect(migration).toContain("add column if not exists purchase_record_id uuid;");
    expect(migration).toContain("record_group_id uuid := gen_random_uuid();");
    expect(migration).toContain("record_group_id,\n      supplier_row.id");
    expect(migration).not.toContain(
      "where supplier_id = p_supplier_id\n    and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_record_date",
    );
  });

  it("backfills a group id for legacy supplier purchase records", () => {
    expect(migration).toContain("gen_random_uuid() as purchase_record_id");
    expect(migration).toContain("purchase.purchase_record_id is null");
    expect(migration).toContain("is not distinct from legacy_groups.record_date");
  });

  it("does not persist or expose zero-valued expense rows", () => {
    expect(migration).toContain("if amount_value <= 0 then");
    expect(migration).toContain("coalesce(purchase.amount, 0) > 0");
    expect(migration).toContain("delete from public.supplier_purchases where id = p_id;");
  });

  it("filters expense entries by supplier and category in PostgreSQL", () => {
    expect(entryFilterMigration).toContain("p_supplier_ids uuid[] default null");
    expect(entryFilterMigration).toContain("p_purchase_type_ids uuid[] default null");
    expect(entryFilterMigration).toContain("purchase.purchase_type_id = any(p_purchase_type_ids)");
  });
});
