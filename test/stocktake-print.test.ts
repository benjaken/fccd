import { buildStocktakePrintHtml, writeStocktakePrintWindow } from "@/lib/stocktake-print";
import { describe, expect, it } from "vitest";
import type { PackingStocktakeItem } from "@/lib/packing-stocktakes";

describe("stocktake print page size", () => {
  it("assigns the longest wrapped group first to balance page height", () => {
    const base: PackingStocktakeItem = {
      id: "item", ingredientId: null, stocktakeAt: null, sku: null,
      ingredientType: null, name: "短名稱", quantity: null,
      currentQuantity: null, currentStocktakeAt: null, unit: "包",
      supplierPhone: "12345678",
    };
    const rows = [
      ...Array.from({ length: 3 }, (_, index) => ({ ...base, id: `short-${index}`, supplierName: "短貨品供應商" })),
      { ...base, id: "long", supplierName: "長貨品供應商", name: "長".repeat(120) },
    ];
    const printDocument = document.implementation.createHTMLDocument();
    printDocument.documentElement.innerHTML = buildStocktakePrintHtml(rows, "盤點紙", "列印");
    const columns = printDocument.querySelectorAll(".column");
    expect(columns[0]?.querySelector(".supplier-name")?.textContent).toBe("長貨品供應商");
    expect(columns[1]?.querySelector(".supplier-name")?.textContent).toBe("短貨品供應商");
    expect(printDocument.querySelectorAll(".count-input")).toHaveLength(4);
  });

  it("keeps long supplier details together and leaves the count field blank", () => {
    const row: PackingStocktakeItem = {
      id: "item-1", ingredientId: null, stocktakeAt: null, sku: null,
      ingredientType: null, name: "急凍魚柳 400-500g 24袋/箱",
      quantity: 10, currentQuantity: null, currentStocktakeAt: null, unit: "包",
      supplierName: "壽桃牌（新順福食品有限公司）", supplierPhone: "2345 6789",
    };
    const printDocument = document.implementation.createHTMLDocument();
    printDocument.documentElement.innerHTML = buildStocktakePrintHtml([row], "盤點紙", "列印");
    const header = printDocument.querySelector("thead th");
    expect(header?.getAttribute("colspan")).toBe("2");
    expect(header?.querySelector(".supplier-name")?.textContent).toBe(row.supplierName);
    expect(header?.querySelector(".supplier-phone")?.textContent).toBe(row.supplierPhone);
    expect(printDocument.querySelector(".count-input")?.getAttribute("aria-label")).toBe(`${row.name}盤點數量`);
    expect(printDocument.querySelector<HTMLInputElement>(".count-input")?.value).toBe("");
    expect(printDocument.querySelectorAll(".column")).toHaveLength(4);
  });

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
