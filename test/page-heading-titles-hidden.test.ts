import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readAppStyles();
const ordersListSource = readFileSync(
  resolve(process.cwd(), "src/components/OrdersListPage.tsx"),
  "utf8",
);

describe("page heading titles", () => {
  it("visually removes every shared page title while keeping it accessible", () => {
    expect(styles).toMatch(
      /\.page-heading h1,\s*\.placeholder-page h1\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0, 0, 0, 0\);/s,
    );
  });

  it("does not render a title placeholder while pages are loading", () => {
    expect(styles).toMatch(
      /\.page-heading \.content-skeleton-title,\s*\.page-heading \.detail-skeleton-title\s*\{[^}]*display:\s*none;/s,
    );
  });

  it("hides page notes and descriptions while retaining only the order-list description", () => {
    expect(styles).toMatch(
      /\.page-heading \.eyebrow,\s*\.page-heading p,\s*\.placeholder-page \.eyebrow,\s*\.placeholder-page p\s*\{[^}]*display:\s*none;/s,
    );
    expect(styles).not.toMatch(
      /\.orders-page > \.page-heading p\s*\{[^}]*display:\s*block;/s,
    );
    expect(ordersListSource).toContain(
      '<p className="orders-toolbar-note">{description}</p>',
    );
    expect(styles).not.toMatch(/\.orders-page > \.page-heading \.eyebrow[^\{]*\{/s);
  });

  it("does not show note placeholders on loading page headings", () => {
    expect(styles).toMatch(
      /\.page-heading \.content-skeleton-eyebrow,\s*\.page-heading \.detail-skeleton-eyebrow,\s*\.page-heading \.detail-skeleton-subtitle\s*\{[^}]*display:\s*none;/s,
    );
  });

  it("collapses text-only headings without hiding heading actions", () => {
    expect(styles).toMatch(
      /\.page-heading:not\(:has\(button, a, input, select, textarea, \[role="button"\]\)\)\s*\{[^}]*display:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.page-transition\s*>\s*:has\(> \.page-heading\):not\(:has\(> \.page-heading button\)\)[^{]+\{[^}]*gap:\s*0;[^}]*grid-template-rows:\s*minmax\(0, 1fr\);/s,
    );
    expect(styles).toMatch(
      /\.page-transition[^{]+:not\(:has\(\.page-skeleton-bone\)\)\s*\{[^}]*gap:\s*0;/s,
    );
  });
});
