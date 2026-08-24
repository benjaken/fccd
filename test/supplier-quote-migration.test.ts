import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = [
  "supabase/migrations/20260822230000_improve_frozen_supplier_pdf_recognition.sql",
  "supabase/migrations/20260822231000_supplier_quote_profile_suggestions.sql",
  "supabase/migrations/20260823040000_create_supplier_from_quote_review.sql",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

const newItemMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260823230000_create_raw_meat_items_from_quote_review.sql",
);
const newItemSql = existsSync(newItemMigrationPath)
  ? readFileSync(newItemMigrationPath, "utf8")
  : "";

describe("supplier quote recognition migration contract", () => {
  it("adds backward-compatible parse runs, evidence fields, constraints and indexes", () => {
    expect(sql).toContain("create table if not exists public.supplier_quote_parse_runs");
    expect(sql).toContain("add column if not exists evidence jsonb not null default '[]'::jsonb");
    expect(sql).toContain("add column if not exists validation_errors jsonb not null default '[]'::jsonb");
    expect(sql).toContain("supplier_quote_lines_parse_run_idx");
    expect(sql).toContain("supplier_quote_documents_latest_parse_run_id_fkey");
  });

  it("protects private parse data and retry with page permissions", () => {
    expect(sql).toContain("alter table public.supplier_quote_parse_runs enable row level security");
    expect(sql).toContain("private.has_page_access('frozen.supplier_quotes')");
    expect(sql).toContain("private.has_page_access('frozen.supplier_quotes.upload')");
    expect(sql).toContain("revoke all on function public.request_supplier_quote_retry(uuid, text) from public, anon");
    expect(sql).toContain("Supplier quote settings review profile suggestions");
  });

  it("atomically replaces only unconfirmed candidates and validates the latest run", () => {
    expect(sql).toContain("latest_parse_run_id = p_run_id");
    expect(sql).toMatch(/delete from public\.supplier_quote_lines[\s\S]*selection_status <> 'confirmed'/);
    expect(sql).toContain("invalid_or_unmapped_supplier_quote_selection");
    expect(sql).toContain("jsonb_array_length(coalesce(line.validation_errors");
    expect(sql).toContain("capture_supplier_quote_profile_suggestion");
  });

  it("never mutates meat masters, stock movements or confirmed prices", () => {
    expect(sql).not.toMatch(/(?:update|insert into|delete from)\s+public\.raw_meat_items/i);
    expect(sql).not.toMatch(/(?:update|insert into|delete from)\s+public\.raw_meat_stock_movements/i);
    expect(sql).not.toMatch(/delete from public\.supplier_quote_lines[\s\S]{0,200}selection_status\s*=\s*'confirmed'/i);
  });

  it("creates reviewed suppliers safely and rejects placeholder names", () => {
    expect(sql).toContain("create_supplier_from_quote_review");
    expect(sql).toContain("private.has_page_access('frozen.supplier_quotes.review')");
    expect(sql).toContain("'na', 'n/a', 'unknown', 'unknownsupplier'");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("promotes reviewed new products into the meat master and supplier memory", () => {
    expect(newItemSql).toContain("create or replace function private.resolve_supplier_quote_new_items");
    expect(newItemSql).toMatch(/insert into public\.raw_meat_items/i);
    expect(newItemSql).toMatch(/insert into public\.raw_meat_item_suppliers/i);
    expect(newItemSql).toContain("selection_status = 'confirmed'");
    expect(newItemSql).toContain("perform private.resolve_supplier_quote_new_items");
    expect(newItemSql).toMatch(/insert into public\.supplier_quote_aliases/i);
  });
});
