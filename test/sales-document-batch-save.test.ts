import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("sales document batch save", () => {
  it("accepts negative payment amounts for refund records while rejecting zero", () => {
    const migration = source("supabase/migrations/20260908230000_allow_refund_payment_amounts.sql");

    expect(migration).toContain("or payment.amount = 0");
    expect(migration).not.toContain("or payment.amount <= 0");
    expect(migration).toContain("save_sales_document_batch");
  });

  it("updates all persisted lines and recalculates the document once in one RPC", () => {
    const migration = source("supabase/migrations/20260828110000_batch_save_sales_document.sql");

    expect(migration).toContain("create or replace function public.save_sales_document_batch");
    expect(migration).toContain("from jsonb_to_recordset(coalesce(p_lines");
    expect(migration).toContain("perform private.recalculate_quote_total(p_order_id)");
    expect(migration.match(/perform private\.recalculate_quote_total\(p_order_id\)/g)).toHaveLength(1);
    expect(migration).toContain("private.has_sales_document_manage(p_order_id)");
  });

  it("persists one remark per print label while keeping the two legacy remark columns", () => {
    const migration = source("supabase/migrations/20260904194000_extend_order_line_label_remarks.sql");
    const implementation = source("src/lib/quote-editor.ts");

    expect(migration).toContain("add column if not exists label_remarks text[]");
    expect(migration).toContain("jsonb_array_elements_text(item.label_remarks)");
    expect(migration).toContain("remarks_1 = nullif");
    expect(migration).toContain("remarks_2 = nullif");
    expect(migration).toContain("sync_order_line_label_remarks");
    expect(migration).toContain("source.label_remarks");
    expect(migration).toContain("label_remarks, delivery_at");
    expect(migration).toContain("'label_remarks'");
    expect(implementation).toContain("label_remarks: line.labelRemarks ?? [line.remarks ?? \"\"]");
    expect(implementation).toContain("remarks_1,remarks_2,label_remarks");
  });

  it("uses the batch RPC for the production full-save path", () => {
    const implementation = source("src/lib/quote-editor.ts");
    const page = source("src/components/QuoteEditorPage.tsx");

    expect(implementation).toContain('supabase.rpc("save_sales_document_batch"');
    expect(page).toContain("? saveSalesDocumentBatch");
    expect(page).toContain("await batchSaver({");
  });

  it("persists one remark per print label and remains compatible with legacy remarks", () => {
    const migration = source("supabase/migrations/20260904190000_order_line_label_remarks.sql");
    const implementation = source("src/lib/quote-editor.ts");

    expect(migration).toContain("add column if not exists label_remarks text[]");
    expect(migration).toContain("sync_order_line_label_remarks");
    expect(migration).toContain("save_order_line_label_remarks_batch");
    expect(migration).toContain("source.label_remarks");
    expect(migration).toContain("label_remarks, delivery_at");
    expect(implementation).toContain('supabase.rpc("save_order_line_label_remarks_batch"');
    expect(implementation).toContain("label_remarks: line.labelRemarks ?? [line.remarks ?? \"\"]");
  });
});
