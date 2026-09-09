import { readAppStyles } from "./read-app-styles";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("quote PDF print stylesheet", () => {
  it("overrides the global hidden print content and keeps the quote visible", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-editor,\s*\.quote-pdf-editor \*\s*\{\s*visibility:\s*visible !important/,
    );
    expect(css).toMatch(
      /\.quote-pdf-editor\s*\{\s*position:\s*static !important;\s*inset:\s*auto !important;\s*width:\s*100% !important;\s*height:\s*auto !important/,
    );
  });

  it("does not lock html overflow with a window-scroll helper", () => {
    expect(existsSync(join(process.cwd(), "src/lib/document-editor-window-scroll.ts"))).toBe(false);
  });

  it("uses fixed A4 sheets in the editing view", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /\.quote-pdf-sheet\s*\{[^}]*width:\s*min\(100%,\s*210mm\);[^}]*height:\s*297mm;[^}]*overflow:\s*hidden;/s,
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
    expect(css).toMatch(/\.quote-pdf-page-footer\s*\{[^}]*pointer-events:\s*none;/);
    expect(css).toMatch(
      /\.quote-pdf-sheet > :not\(\.quote-pdf-page-footer\):not\(\.receipt-pdf-page-footer\)\s*\{[^}]*z-index:\s*1;/,
    );
    expect(css).not.toContain("quote-pdf-print-footer-spacer");
    expect(css).toMatch(
      /\.quote-pdf-sheet\s*\{[^}]*padding:\s*10mm 10mm 24mm;/,
    );
    expect(css).toMatch(
      /\.quote-pdf-print-only\s*\{\s*display:\s*block !important;\s*width:\s*fit-content;\s*margin-left:\s*auto;\s*padding:\s*0;\s*text-align:\s*right;/,
    );
  });

  it("keeps the self-service receipt footer inside the A4 preview and print safe area", () => {
    const css = readAppStyles();
    const selfServiceCss = readFileSync(
      join(process.cwd(), "src/components/customer-self-service.css"),
      "utf8",
    );
    expect(selfServiceCss).toMatch(
      /\.quote-pdf-sheet\.receipt-pdf-sheet\.self-service-receipt-document\s*\{[^}]*position:\s*relative;[^}]*padding-bottom:\s*16mm;/s,
    );
    expect(selfServiceCss).toMatch(
      /\.self-service-receipt-document\s*>\s*\.receipt-pdf-page-footer\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*6mm;/s,
    );
    expect(selfServiceCss).toMatch(
      /\.self-service-receipt-document\s+\.receipt-pdf-signature\s*\{[^}]*margin-top:\s*0;/s,
    );
    expect(selfServiceCss).toMatch(
      /@media print[\s\S]*?\.self-service-receipt-print-root\s*>\s*\.self-service-receipt-document\s*\{[^}]*padding:\s*10mm 10mm 16mm !important;/s,
    );
    expect(css).toMatch(
      /\.receipt-pdf-page-footer\s*\{[^}]*flex:\s*0 0 auto;/s,
    );
  });

  it("keeps extra quote PDF sheets reachable by scrolling the document editor", () => {
    const css = readAppStyles();
    expect(css).toMatch(
      /@media screen\s*\{[\s\S]*html:has\(\.quote-pdf-editor\),\s*html:has\(\.document-editor-shell\)\s*\{[^}]*height:\s*auto !important;[^}]*overflow-y:\s*auto !important;/,
    );
    expect(css).toMatch(
      /@media screen\s*\{[\s\S]*body:has\(\.quote-pdf-editor\) \.quote-pdf-editor,\s*\.document-editor-shell \.quote-pdf-editor\s*\{[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/,
    );
    expect(css).toMatch(/@media screen\s*\{[\s\S]*\.quote-pdf-sheet\s*\{\s*overflow:\s*clip;/);
    expect(css).toMatch(
      /@media print\s*\{[\s\S]*html:has\(\.quote-pdf-editor\),[\s\S]*height:\s*auto !important;[\s\S]*overflow:\s*visible !important;/,
    );
    expect(css).toMatch(
      /@media print\s*\{[\s\S]*\.quote-pdf-sheet\s*\{[^}]*height:\s*297mm !important;[^}]*overflow:\s*hidden !important;/,
    );
    expect(css).toMatch(
      /body:has\(\.quote-pdf-editor\) \.main-content,\s*\.document-editor-shell \.main-content,[\s\S]*?overflow:\s*visible !important;/,
    );
    expect(css).not.toMatch(
      /body:has\(\.quote-pdf-editor\) \.main-content,\s*\.document-editor-shell \.main-content\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*auto;/s,
    );
    expect(css).toMatch(
      /html:not\(:has\(\.quote-pdf-editor\)\):not\(:has\(\.document-editor-shell\)\),\s*body:not\(:has\(\.quote-pdf-editor\)\):not\(:has\(\.document-editor-shell\)\),\s*html:not\(:has\(\.quote-pdf-editor\)\):not\(:has\(\.document-editor-shell\)\) #root\s*\{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;/s,
    );
  });
});
