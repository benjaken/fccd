import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("shared modal layout", () => {
  it("keeps long dialog content inside a shrinkable scrolling track", () => {
    const css = readAppStyles();
    const rule = css.match(/\.modal-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(rule).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(rule).toContain("overflow: hidden");
  });

  it("gives supplier quote review one fixed workspace instead of a nested panel scrollbar", () => {
    const css = readAppStyles();
    const bodyRule = css.match(/\.supplier-quote-review-panel\s*>\s*\.side-panel-body\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const workspaceRule = css.match(/\.supplier-quote-review-workspace\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(bodyRule).toContain("overflow: hidden");
    expect(workspaceRule).toContain("height: 100%");
    expect(workspaceRule).toContain("min-height: 0");
  });

  it("keeps fleet-fee pagination visible while only the table rows scroll", () => {
    const css = readAppStyles();
    const source = readFileSync(
      resolve(process.cwd(), "src/components/DeliveryFleetsPage.tsx"),
      "utf8",
    );
    const bodyRule = css.match(/\.side-panel-body:has\(\.delivery-fleet-fee-panel\)\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const panelRule = css.match(/\.delivery-fleet-fee-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(source).toContain('className="delivery-fleet-fee-panel"');
    expect(bodyRule).toContain("overflow: hidden");
    expect(panelRule).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(panelRule).toContain("height: 100%");
  });

  it("keeps the fleet-fee search and desktop filters on one toolbar row", () => {
    const css = readAppStyles();
    const source = readFileSync(
      resolve(process.cwd(), "src/components/DeliveryFleetsPage.tsx"),
      "utf8",
    );
    const toolbarRule = css.match(/\.delivery-fleet-fee-search\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(source).toContain('className="delivery-fleet-fee-search"');
    expect(toolbarRule).toContain("display: grid");
    expect(toolbarRule).toContain("grid-template-columns: minmax(18rem, 1fr) auto");
  });

  it("shows fleet-fee editors as bordered white inputs on a white panel", () => {
    const css = readAppStyles();
    const inputRule = css.match(/\.delivery-fleet-fee-input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const fieldRule = css.match(/\.delivery-fleet-fee-input input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const panelRule = css.match(/\.delivery-fleet-fee-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(inputRule).toContain("border: 1px solid var(--border)");
    expect(inputRule).toContain("background: #fff");
    expect(fieldRule).toContain("background: #fff");
    expect(panelRule).toContain("background: #fff");
  });

  it("renders fleet and district filters as fields with spacing below", () => {
    const css = readAppStyles();
    const toolbarRule = css.match(/\.delivery-fleet-fee-toolbar\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const selectRule = css.match(/\.delivery-fleet-fee-filters select\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const filtersRule = css.match(/\.delivery-fleet-fee-filters\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(toolbarRule).toContain("padding: 18px");
    expect(filtersRule).toContain("grid-template-columns: 14rem 18rem");
    expect(filtersRule).toContain("justify-content: end");
    expect(selectRule).toContain("height: 40px");
    expect(selectRule).toContain("border: 1px solid var(--border)");
    expect(selectRule).toContain("background: #fff");
  });
});
