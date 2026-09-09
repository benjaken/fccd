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

    const captureRule = css.match(/\.self-service-receipt-document\.is-pdf-capture \.self-service-receipt-capture-text\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(captureRule).toContain("transform: translateY(-4px)");
  });
});
