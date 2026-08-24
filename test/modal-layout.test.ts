import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("shared modal layout", () => {
  it("keeps long dialog content inside a shrinkable scrolling track", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const rule = css.match(/\.modal-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(rule).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(rule).toContain("overflow: hidden");
  });

  it("gives supplier quote review one fixed workspace instead of a nested panel scrollbar", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const bodyRule = css.match(/\.supplier-quote-review-panel\s*>\s*\.side-panel-body\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const workspaceRule = css.match(/\.supplier-quote-review-workspace\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(bodyRule).toContain("overflow: hidden");
    expect(workspaceRule).toContain("height: 100%");
    expect(workspaceRule).toContain("min-height: 0");
  });
});
