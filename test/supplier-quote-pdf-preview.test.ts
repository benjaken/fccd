import { describe, expect, it } from "vitest";

import { findSupplierQuoteEvidenceBox } from "@/components/SupplierQuotePdfPreview";

describe("SupplierQuotePdfPreview", () => {
  it("converts the recognized source row into a PDF highlight box", () => {
    const box = findSupplierQuoteEvidenceBox({
      version: "extraction/1",
      pages: [{
        page: 2,
        width: 100,
        height: 200,
        items: [
          { id: "a", page: 2, text: "Raw Beef Skewers", bbox: { x: 10, y: 150, width: 32, height: 10 }, direction: "ltr", readingOrder: 1 },
          { id: "b", page: 2, text: "$66.00 /pack", bbox: { x: 70, y: 150, width: 20, height: 10 }, direction: "ltr", readingOrder: 2 },
          { id: "c", page: 2, text: "Unrelated", bbox: { x: 10, y: 80, width: 20, height: 10 }, direction: "ltr", readingOrder: 3 },
        ],
      }],
    }, {
      productName: "Raw Beef Skewers",
      productNameZh: "牛肉串",
      sourcePage: 2,
      sourceText: "Raw Beef Skewers $66.00 /pack",
      evidence: [{ page: 2, blockId: "b1", cellIds: ["c1", "c2"], field: "record", text: "Raw Beef Skewers $66.00 /pack" }],
    });

    expect(box).not.toBeNull();
    expect(box!.x).toBeCloseTo(0.06);
    expect(box!.y).toBeCloseTo(0.185);
    expect(box!.width).toBeCloseTo(0.88);
  });
});
