import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("sales document batch save", () => {
  it("updates all persisted lines and recalculates the document once in one RPC", () => {
    const migration = source("supabase/migrations/20260828110000_batch_save_sales_document.sql");

    expect(migration).toContain("create or replace function public.save_sales_document_batch");
    expect(migration).toContain("from jsonb_to_recordset(coalesce(p_lines");
    expect(migration).toContain("perform private.recalculate_quote_total(p_order_id)");
    expect(migration.match(/perform private\.recalculate_quote_total\(p_order_id\)/g)).toHaveLength(1);
    expect(migration).toContain("private.has_sales_document_manage(p_order_id)");
  });

  it("uses the batch RPC for the production full-save path", () => {
    const implementation = source("src/lib/quote-editor.ts");
    const page = source("src/components/QuoteEditorPage.tsx");

    expect(implementation).toContain('supabase.rpc("save_sales_document_batch"');
    expect(page).toContain("? saveSalesDocumentBatch");
    expect(page).toContain("await batchSaver({");
  });
});
