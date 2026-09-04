import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("quote PDF print stylesheet", () => {
  it("overrides the global hidden print content and keeps the quote visible", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-editor,\s*\.quote-pdf-editor \*\s*\{\s*visibility:\s*visible !important/,
    );
    expect(css).toMatch(
      /\.quote-pdf-editor\s*\{\s*position:\s*absolute !important;\s*inset:\s*0 auto auto 0 !important/,
    );
  });

  it("uses fixed A4 sheets in the editing view", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-sheet\s*\{[^}]*width:\s*min\(100%,\s*210mm\);[^}]*height:\s*297mm;[^}]*overflow:\s*visible;/s,
    );
    expect(css).toMatch(
      /@media print[\s\S]*?\.quote-pdf-sheet\s*\{[^}]*width:\s*100%;[^}]*height:\s*297mm;[^}]*overflow:\s*hidden;/s,
    );
  });

  it("removes the hidden additional-information action space from PDF output", () => {
    const css = readAppStyles();
    expect(css).toMatch(/\.quote-pdf-additional\.is-empty\s*\{\s*display:\s*none !important;/);
    expect(css).toMatch(
      /\.quote-pdf-additional li textarea\s*\{\s*width:\s*100% !important;\s*padding-right:\s*0 !important/,
    );
    expect(css).toMatch(/\.quote-pdf-editor textarea\s*\{\s*resize:\s*none;/);
    expect(css).toMatch(/@media print[\s\S]*?resize:\s*none !important;/);
  });

  it("hides empty activity items from generated PDF output", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-activity\.is-empty\s*\{\s*margin-top:\s*0;/,
    );
    expect(css).toMatch(
      /@media print[\s\S]*?\.quote-pdf-activity\.is-empty\s*\{\s*display:\s*none !important;/,
    );
  });

  it("hides quantity columns from generated PDF output when none were entered", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-table\.has-no-quantities td\.quote-pdf-qty-col \{ display: none;/,
    );
    expect(css).toMatch(
      /@media print[\s\S]*?\.quote-pdf-table\.has-no-quantities td\.quote-pdf-qty-col\s*\{\s*display:\s*none !important;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-price-prefix\s*\{\s*flex:\s*0 0 auto;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-table \.quote-pdf-sequence-input\s*\{\s*padding:\s*0\.2rem 0;\s*text-align:\s*center;/,
    );
  });

  it("prints each configured cover or back image as a full A4 page", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /@media print\s*\{[\s\S]*?\.quote-pdf-insert-page\s*\{\s*display:\s*block;\s*width:\s*210mm;\s*height:\s*297mm;[^}]*break-after:\s*page;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-editor > \.is-final-document-page\s*\{\s*break-after:\s*auto;\s*page-break-after:\s*auto;/,
    );
  });

  it("hides configured cover and back pages while editing", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-insert-page\s*\{\s*display:\s*none;/,
    );
  });

  it("right-aligns the shipping selector and reserves space above the fixed footer", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-table \.quote-pdf-summary-rows td\s*\{\s*text-align:\s*right;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-table tbody td\.quote-pdf-summary-label\s*\{\s*text-align:\s*right;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-summary-rows select\s*\{[^}]*margin-left:\s*auto;[^}]*text-align:\s*right;[^}]*text-align-last:\s*right;/,
    );
    expect(css).not.toContain("quote-pdf-print-footer-spacer");
    expect(css).toMatch(
      /\.quote-pdf-sheet\s*\{[^}]*padding:\s*10mm 10mm 24mm;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-print-only\s*\{\s*display:\s*block !important;\s*width:\s*fit-content;\s*margin-left:\s*auto;\s*padding:\s*0;\s*text-align:\s*right;/,
    );
  });
});
