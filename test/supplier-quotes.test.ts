import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUOTE_THRESHOLD,
  buildQuoteSpecFingerprint,
  buildSupplierQuoteCsv,
  buildSupplierQuoteCsvRows,
  compareQuoteLines,
  demoSupplierQuoteDocuments,
  demoSupplierQuoteLines,
  evaluateQuoteAlert,
  evaluateQuoteCondition,
  quoteStatusLabel,
  resolveQuoteThreshold,
} from "@/lib/supplier-quotes";

describe("supplier quote domain", () => {
  it("ships demo data for three suppliers and all document/availability states", () => {
    expect(new Set(demoSupplierQuoteDocuments.map((document) => document.supplierId)).size).toBe(
      3,
    );
    expect(new Set(demoSupplierQuoteDocuments.map((document) => document.status))).toEqual(
      new Set(["confirmed", "draft", "parse_failed"]),
    );
    expect(new Set(demoSupplierQuoteLines.map((line) => line.availability))).toEqual(
      new Set(["quoted", "tba", "unavailable"]),
    );
    expect(
      demoSupplierQuoteLines.some(
        (line) =>
          line.actualInboundPrice !== null && line.actualInboundPrice !== undefined,
      ),
    ).toBe(true);
    expect(DEFAULT_QUOTE_THRESHOLD.upPercent).toBe(10);
    expect(DEFAULT_QUOTE_THRESHOLD.downPercent).toBe(10);
  });

  it("compares baseline/previous/latest and preserves non-comparable states", () => {
    const comparisons = compareQuoteLines(demoSupplierQuoteLines);
    const chicken = comparisons.find(
      (comparison) =>
        comparison.supplierId === "supplier-a-mart" &&
        comparison.rawMeatItemId === "raw-chicken-thigh",
    );
    const euroChicken = comparisons.find(
      (comparison) =>
        comparison.supplierId === "supplier-euro-foodstuff" &&
        comparison.rawMeatItemId === "raw-chicken-thigh",
    );
    const tba = comparisons.find((comparison) => comparison.comparisonState === "tba");
    const newItem = comparisons.find((comparison) => comparison.comparisonState === "new_item");
    const specChanged = comparisons.find(
      (comparison) => comparison.comparisonState === "spec_changed",
    );

    expect(chicken).toMatchObject({
      baselinePrice: 42,
      previousPrice: 44,
      latestPrice: 50,
      priceDelta: 6,
      changeRate: expect.closeTo((6 / 44) * 100),
      isComparable: true,
    });
    expect(euroChicken).toMatchObject({
      previousPrice: 40,
      latestPrice: 34,
      priceDelta: -6,
      isComparable: true,
    });
    expect(tba).toMatchObject({
      comparisonState: "tba",
      latestPrice: null,
      isComparable: false,
    });
    expect(newItem).toMatchObject({ comparisonState: "new_item", previous: null });
    expect(specChanged).toMatchObject({
      comparisonState: "spec_changed",
      specChanged: true,
      isComparable: false,
      priceDelta: null,
    });
  });

  it("evaluates configurable percentage and amount thresholds", () => {
    const comparison = compareQuoteLines(demoSupplierQuoteLines).find(
      (item) =>
        item.supplierId === "supplier-a-mart" &&
        item.rawMeatItemId === "raw-chicken-thigh",
    );
    if (!comparison) throw new Error("demo chicken comparison missing");

    const increase = evaluateQuoteAlert(comparison, { upPercent: 10, downPercent: 10 });
    expect(increase).toMatchObject({ state: "increase", triggered: true });

    const quiet = evaluateQuoteAlert(comparison, { upPercent: 20, downPercent: 20 });
    expect(quiet).toMatchObject({ state: "normal", triggered: false });

    const amount = evaluateQuoteAlert(
      { previousPrice: 100, latestPrice: 104, comparisonState: "comparable" },
      { upPercent: 20, downPercent: 20, upAmount: 3 },
    );
    expect(amount).toMatchObject({ state: "increase", triggered: true, amountExceeded: true });

    const tba = evaluateQuoteAlert(
      { comparisonState: "tba", availability: "tba", latestPrice: null },
      { includeTba: true },
    );
    expect(tba).toMatchObject({ state: "tba", triggered: true, changeRate: null });

    expect(resolveQuoteThreshold({ increasePercent: 12 }).upPercent).toBe(12);
  });

  it("judges conditions, creates CSV rows, and keeps quoted/inbound prices separate", () => {
    const rows = buildSupplierQuoteCsvRows(demoSupplierQuoteLines);
    const chicken = rows.find(
      (row) =>
        row.supplierId === "supplier-a-mart" && row.rawMeatItemId === "raw-chicken-thigh",
    );
    expect(chicken).toBeDefined();
    expect(chicken?.pdfQuotedPrice).toBe("50");
    expect(chicken?.actualInboundPrice).toBe("48.5");
    expect(chicken?.latestPrice).toBe("50");
    expect(chicken?.comparisonState).toBe("comparable");

    const tba = rows.find((row) => row.availability === "tba");
    expect(tba?.pdfQuotedPrice).toBe("");
    expect(tba?.alertState).toBe("tba");

    const pendingCondition = evaluateQuoteCondition({
      rawText: "待確認到貨日",
      confirmed: false,
    });
    expect(pendingCondition).toMatchObject({
      state: "pending",
      requiresReview: true,
      isResolved: false,
    });
    expect(
      buildQuoteSpecFingerprint({ productName: "  Chicken  Thigh ", origin: "Thailand" }),
    ).toContain("productName=chicken thigh");
    expect(quoteStatusLabel("parse_failed")).toBe("解析失敗");

    const csv = buildSupplierQuoteCsv(demoSupplierQuoteLines, { includeBom: true });
    expect(csv.startsWith("\uFEFF\"supplierId\"")) .toBe(true);
    expect(csv).toContain('"actualInboundPrice"');
    expect(csv).toContain('"48.5"');
    expect(csv).toContain('"TBA"');
  });
});
