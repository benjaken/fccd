import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/components/customer-self-service.css"),
  "utf8",
);

describe("customer self-service receipt layout", () => {
  it("leaves enough line height for Chinese product names in generated PDFs", () => {
    const rule = css.match(/\.self-service-receipt-document \.receipt-pdf-table tbody td\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toContain("height: 23px");
    expect(rule).toContain("min-height: 24px");
    expect(rule).toContain("line-height: 1.45");
    expect(rule).toContain("vertical-align: middle");
  });
});
