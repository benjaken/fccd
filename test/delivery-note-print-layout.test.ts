import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readAppStyles();

describe("delivery-note print layouts", () => {
  it("keeps the factory and order-list delivery notes inside an A4 safe area", () => {
    expect(stylesheet).toMatch(
      /@page factory-delivery-note\s*\{[^}]*size:\s*A4 portrait[^}]*margin:\s*0/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-print,\s*\.order-delivery-note-sheet\s*\{[^}]*width:\s*210mm[^}]*height:\s*297mm[^}]*padding:\s*12mm 12mm 22mm[^}]*page:\s*factory-delivery-note/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-print > footer,\s*\.order-delivery-note-sheet > footer\s*\{[^}]*right:\s*12mm[^}]*bottom:\s*10mm[^}]*left:\s*12mm/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-print,\s*\.order-delivery-note-sheet\s*\{[^}]*font-size:\s*16pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-lines\s*\{[^}]*font-size:\s*17pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-print,\s*\.factory-delivery-note-print \*,\s*\.order-delivery-note-sheet,\s*\.order-delivery-note-sheet \*\s*\{[^}]*color:\s*#000000 !important[^}]*font-weight:\s*700 !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-cartons\s*\{[^}]*font-size:\s*18pt[^}]*font-weight:\s*800 !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-delivery-note-lines th:last-child\s*\{[^}]*font-size:\s*19pt[^}]*font-weight:\s*800 !important/s,
    );

    const orderListPrintRule = [...stylesheet.matchAll(
      /\.order-delivery-note-sheet\s*\{([^}]*)\}/g,
    )]
      .map((match) => match[1] ?? "")
      .find((rule) => rule.includes("width: 210mm") && rule.includes("page: factory-delivery-note"));

    expect(orderListPrintRule).toContain("height: 297mm");
    expect(orderListPrintRule).toContain("padding: 12mm 12mm 22mm");
  });

  it("keeps the meat delivery note inside a deterministic 10mm safe area", () => {
    expect(stylesheet).toMatch(
      /@page factory-meat-delivery-note\s*\{[^}]*size:\s*A4 portrait[^}]*margin:\s*0/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-page\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*210mm[^}]*padding:\s*10mm[^}]*page:\s*factory-meat-delivery-note/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-sheet\s*\{[^}]*width:\s*100%[^}]*margin:\s*0[^}]*padding:\s*0[^}]*page:\s*factory-meat-delivery-note/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-sheet\s*\{[^}]*page:\s*factory-meat-delivery-note[^}]*font-size:\s*14pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-details h2,\s*\.factory-meat-note-lines th,\s*\.factory-meat-note-lines td\s*\{[^}]*color:\s*#000000 !important[^}]*font-size:\s*15\.5pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-page,\s*\.factory-meat-note-page \*\s*\{[^}]*color:\s*#000000 !important[^}]*font-weight:\s*700 !important/s,
    );
  });

  it("uses enlarged type for the factory menu and multi-day PDFs", () => {
    expect(stylesheet).toMatch(
      /\.factory-menu-print-table\s*\{[^}]*color:\s*#000000 !important[^}]*font-size:\s*17pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-print-table th\s*\{[^}]*font-size:\s*18pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-table\s*\{[^}]*color:\s*#000000 !important[^}]*font-size:\s*12\.5pt/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-menu-print-root,\s*\.factory-menu-print-root \*\s*\{[^}]*color:\s*#000000 !important[^}]*font-weight:\s*700 !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-multi-day-report,\s*\.factory-multi-day-report \*\s*\{[^}]*color:\s*#000000 !important[^}]*font-weight:\s*700 !important/s,
    );
  });
});
