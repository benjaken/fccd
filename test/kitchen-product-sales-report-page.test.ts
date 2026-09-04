import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("central kitchen product sales report page", () => {
  it("keeps its fixed-height loading shell in a column flow", () => {
    const stylesheet = readAppStyles();

    expect(stylesheet).toMatch(
      /\.kitchen-product-sales-page\.kitchen-sales-cost-report-page\s*{[^}]*display:\s*flex;/s,
    );
  });
});
