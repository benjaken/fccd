import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/components/customer-self-service.css"),
  "utf8",
);

describe("customer self-service receipt layout", () => {
  it("uses the order receipt field metrics without stretching product rows", () => {
    const rule = css.match(/\.self-service-receipt-document \.receipt-pdf-table tbody td\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toContain("height: 23px");
    expect(rule).not.toContain("min-height");
    expect(rule).not.toContain("line-height");
    expect(rule).not.toContain("vertical-align");

    expect(css).toContain("body:has(.self-service-receipt-print-root) > * { display: none !important; }");
    expect(css).toContain(".self-service-receipt-print-root * { visibility: visible !important; }");
    expect(css).toContain("page-break-after: auto !important");
    expect(css).toContain("padding-bottom: 20px");
    expect(css).toContain("transform: none !important");
  });
});
