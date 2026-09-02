import { describe, expect, it } from "vitest";

import { splitPdfModuleIndexes } from "@/lib/pdf-auto-pagination";

describe("PDF auto pagination", () => {
  it("allows the first trailing module to move to a continuation page", () => {
    expect(splitPdfModuleIndexes(3, [0, 2])).toEqual([[], [0, 1], [2]]);
  });
});
