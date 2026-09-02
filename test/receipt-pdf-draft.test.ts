import { describe, expect, it } from "vitest";

import {
  splitPdfProductLines,
} from "@/lib/receipt-pdf-draft";

describe("splitPdfProductLines", () => {
  it("keeps all rows on one sheet when no measured break is reported", () => {
    expect(splitPdfProductLines(ids(10), [])).toEqual([ids(10)]);
  });

  it("splits at the row index reported by the layout observer", () => {
    expect(splitPdfProductLines(ids(18), [10])).toEqual([
      ids(10),
      ids(18).slice(10),
    ]);
  });

  it("supports multiple measured breaks and ignores invalid indexes", () => {
    const pages = splitPdfProductLines(ids(12), [8, 3, 8, 0, 12, -1]);
    expect(pages.map((page) => page.length)).toEqual([
      3,
      5,
      4,
    ]);
  });
});

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}
