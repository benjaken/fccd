import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("order PDF drafts migration", () => {
  const migration = source(
    "supabase/migrations/20260917120000_order_pdf_drafts.sql",
  );

  it("stores one draft per order and document kind", () => {
    expect(migration).toContain("create table if not exists public.order_pdf_drafts");
    expect(migration).toContain("order_id uuid not null references public.orders(id) on delete cascade");
    expect(migration).toContain("check (document_kind in ('receipt', 'invoice'))");
    expect(migration).toContain("unique (order_id, document_kind)");
  });

  it("reuses the sales document permission and stamps updated_at", () => {
    expect(migration).toContain("private.has_sales_document_manage(order_id)");
    expect(migration).toContain("set_order_pdf_drafts_updated_at");
    expect(migration).toContain("alter table public.order_pdf_drafts enable row level security");
    expect(migration).toContain(
      "grant select, insert, update on table public.order_pdf_drafts to authenticated",
    );
  });
});
