import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  path.resolve(process.cwd(), "src/index.css"),
  "utf8",
);

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
  });
});
