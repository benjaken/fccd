import { buildStocktakePrintHtml, writeStocktakePrintWindow } from "@/lib/stocktake-print";
import { describe, expect, it } from "vitest";

describe("stocktake print page size", () => {
  it("declares A4 landscape on the sheet", () => {
    const html = buildStocktakePrintHtml([], "盤點紙", "列印");
    expect(html).toContain("@page{size:A4 landscape;margin:5mm}");
  });

  it("keeps landscape after the app portrait page rule is copied in", () => {
    const portrait = document.createElement("style");
    portrait.textContent = "@page{size:A4 portrait;margin:0}";
    document.head.appendChild(portrait);
    const printDocument = document.implementation.createHTMLDocument();
    const printWindow = { document: printDocument } as unknown as Window;
    try {
      writeStocktakePrintWindow(printWindow, [], "盤點紙", "列印");
      const styles = [...printDocument.querySelectorAll("style")];
      expect(styles.some((node) => node.textContent?.includes("A4 portrait"))).toBe(true);
      expect(styles.at(-1)?.dataset.stocktakePage).toBe("landscape");
      expect(styles.at(-1)?.textContent).toBe("@page{size:A4 landscape;margin:5mm}");
    } finally {
      portrait.remove();
    }
  });
});
