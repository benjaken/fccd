import type { PackingStocktakeItem } from "@/lib/packing-stocktakes";

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildStocktakePrintHtml(rows: PackingStocktakeItem[], title: string, printLabel: string) {
  const groups = new Map<string, { name: string; phone: string; rows: PackingStocktakeItem[] }>();
  rows.forEach((row) => {
    const name = row.supplierName?.trim() || "NA";
    const phone = row.supplierPhone?.trim() || "N/A";
    const key = `${name}\u0000${phone}`;
    const group = groups.get(key) ?? { name, phone, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  });

  const columns = Array.from({ length: 4 }, () => ({ weight: 0, html: "" }));
  [...groups.values()].sort((a, b) => b.rows.length - a.rows.length).forEach((group) => {
    const column = columns.reduce((best, candidate) => candidate.weight < best.weight ? candidate : best);
    const body = group.rows
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "zh-HK"))
      .map((row) => `<tr><td class="item" colspan="2">${escapeHtml(row.name || row.sku || "—")}</td><td class="count"><input class="count-input" type="text" inputmode="decimal" aria-label="${escapeHtml(`${row.name || row.sku || "貨品"}盤點數量`)}"></td><td class="unit">${escapeHtml(row.unit || "—")}</td></tr>`)
      .join("");
    column.html += `<section class="supplier"><table><colgroup><col class="supplier-column"><col class="phone-column"><col class="count-column"><col class="unit-column"></colgroup><thead><tr><th>${escapeHtml(group.name)}</th><th>${escapeHtml(group.phone)}</th><th>盤點</th><th></th></tr></thead><tbody>${body}</tbody></table></section>`;
    column.weight += group.rows.length + 1;
  });

  return `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font-family:Arial,"Noto Sans TC",sans-serif;font-size:14px}.sheet{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;align-items:start}.column{min-width:0}.supplier{margin:0 0 3px;break-inside:avoid}.supplier table{width:100%;border-collapse:collapse;table-layout:fixed}.supplier-column{width:35%}.phone-column{width:35%}.count-column{width:20%}.unit-column{width:10%}.supplier th,.supplier td{border:1px solid #d5d9dd;padding:2px 4px;height:18px;text-align:left;vertical-align:middle}.supplier th{background:#d7d7d7;font-weight:700}.supplier th:nth-child(3),.supplier th:last-child,.unit{text-align:center}.count{padding:0!important}.count-input{display:block;width:100%;height:100%;min-height:17px;border:0;background:#fff;padding:1px 3px;text-align:center;font:inherit;outline:none}.count-input:focus{box-shadow:inset 0 0 0 2px #0f4c5c}.print-action{position:fixed;right:24px;bottom:24px}.print-action>button{min-width:120px}@media print{@page{size:A4 landscape;margin:5mm}.print-action{display:none}html,body{font-size:14px}.supplier th,.supplier td{height:14px;padding:1px 3px}.count-input{min-height:13px;padding:0 2px}}
</style></head><body><main class="sheet">${columns.map((column) => `<div class="column">${column.html}</div>`).join("")}</main><div id="stocktake-print-action" class="print-action" data-label="${escapeHtml(printLabel)}"></div></body></html>`;
}

export function writeStocktakePrintWindow(printWindow: Window, rows: PackingStocktakeItem[], title: string, printLabel: string) {
  printWindow.document.open();
  printWindow.document.write(buildStocktakePrintHtml(rows, title, printLabel));
  printWindow.document.close();
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    printWindow.document.head.appendChild(node.cloneNode(true));
  });
}
