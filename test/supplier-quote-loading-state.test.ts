import { describe, expect, it } from "vitest";

import { initialSupplierQuoteDashboard, preferredSupplierQuoteTab } from "@/components/SupplierQuotePage";

describe("supplier quote initial loading state", () => {
  it("does not render demo rows before the production database request finishes", () => {
    const initial = initialSupplierQuoteDashboard("production");
    expect(initial.documents).toEqual([]);
    expect(initial.lines).toEqual([]);
  });

  it("keeps deterministic demo rows available to component tests", () => {
    const initial = initialSupplierQuoteDashboard("test");
    expect(initial.documents.length).toBeGreaterThan(0);
    expect(initial.lines.length).toBeGreaterThan(0);
  });

  it("opens PDF versions when documents exist but no quotes have been confirmed", () => {
    const testData = initialSupplierQuoteDashboard("test");
    expect(preferredSupplierQuoteTab({ documents: testData.documents, lines: [] })).toBe("documents");
    expect(preferredSupplierQuoteTab(testData)).toBe("comparison");
  });
});
