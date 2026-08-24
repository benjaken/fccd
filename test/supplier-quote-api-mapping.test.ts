import { describe, expect, it } from "vitest";
import { mapSupplierQuoteIngestResult } from "@/lib/supplier-quote-api";

const line = {
  id: "l1", supplier_item_code: null, product_name: "Chicken", product_name_zh: null,
  origin: null, size_text: null, packing_text: null, quoted_price: 42,
  availability: "quoted" as const, source_page: 1, source_text: "Chicken $42",
  match_confidence: 0.5, match_reason: null, raw_meat_item_id: null,
};

describe("supplier quote ingest API mapping", () => {
  it("keeps legacy payloads readable and supplies safe empty evidence fields", () => {
    const result = mapSupplierQuoteIngestResult({ duplicate: false,
      document: { id: "d1", supplier_id: null, quote_date: null, effective_date: null, status: "review", original_filename: "legacy.pdf" },
      lines: [line], detectedSupplier: null, detectedDates: ["2026-08-01"] });
    expect(result.detectedDates).toEqual([expect.objectContaining({ value: "2026-08-01", confidence: 0.5 })]);
    expect(result.lines[0]).toMatchObject({ evidence: [], raw_fields: {}, validation_errors: [], validation_warnings: [], price_unit: null });
  });

  it("preserves source candidates, evidence and validation from the new payload", () => {
    const source = { value: "2026-08-05", sourceType: "content", sourcePage: 2, sourceText: "有效 2026-08-05", confidence: 0.9 };
    const result = mapSupplierQuoteIngestResult({ duplicate: false,
      document: { id: "d2", supplier_id: "s1", quote_date: null, effective_date: null, status: "review", original_filename: "new.pdf", detected_dates: [source], detected_suppliers: [] },
      lines: [{ ...line, evidence: [{ page: 1, blockId: "b1", cellIds: ["c1"], field: "record", text: "Chicken $42" }],
        raw_fields: { price: "$42" }, validation_errors: [], validation_warnings: ["price_unit_requires_review"], price_unit: null,
        normalized_spec_fingerprint: "chicken|42" }], detectedSupplier: null });
    expect(result.detectedDates).toEqual([source]);
    expect(result.lines[0].validation_warnings).toEqual(["price_unit_requires_review"]);
    expect(result.lines[0].raw_fields).toEqual({ price: "$42" });
  });

  it("preserves a proposed supplier name that is not in the database", () => {
    const proposed = { value: "New Frozen Foods Ltd", sourceType: "content" as const, sourcePage: 1,
      sourceText: "Supplier: New Frozen Foods Ltd", confidence: 0.82, isNew: true };
    const result = mapSupplierQuoteIngestResult({ duplicate: false,
      document: { id: "d3", supplier_id: null, quote_date: null, effective_date: null, status: "review",
        original_filename: "new-supplier.pdf", detected_suppliers: [proposed] },
      lines: [line], detectedSupplier: null });
    expect(result.document.detected_suppliers).toEqual([proposed]);
  });
});
