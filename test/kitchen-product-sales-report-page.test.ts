import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("central kitchen product sales report page", () => {
  it("keeps its fixed-height loading shell in a column flow", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.kitchen-product-sales-page\.kitchen-sales-cost-report-page\s*{[^}]*display:\s*flex;/s,
    );
  });
});
