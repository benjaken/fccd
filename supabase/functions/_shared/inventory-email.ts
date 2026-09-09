export type InventoryForecastLine = {
  sku?: string | null;
  itemName: string;
  unit: string;
  warehouse: string;
  currentStock?: number | null;
  requiredStock: number;
  shortageQuantity: number;
  stockStatus: string;
};

export type MinimumStockAlert = {
  sku?: string | null;
  name: string;
  unit: string;
  warehouse: string;
  currentStock: number;
  minimumStock: number;
};

export type UnmappedOrderLine = {
  orderNumber: string;
  itemName: string;
  deliveryDate: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function quantity(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "未盤點";
  return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 3 }).format(value);
}

const shell = (title: string, intro: string, content: string) => `<!doctype html>
<html lang="zh-HK"><body style="margin:0;background:#f4f7f5;font-family:Arial,'Microsoft JhengHei',sans-serif;color:#183027">
<div style="max-width:760px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #dce7e0;border-radius:16px;overflow:hidden">
<div style="background:#166534;color:#fff;padding:22px 24px"><div style="font-size:13px;opacity:.8">FCCD 庫存通知</div><h1 style="font-size:22px;margin:6px 0 0">${escapeHtml(title)}</h1></div>
<div style="padding:22px 24px"><p style="margin:0 0 18px;line-height:1.65">${escapeHtml(intro)}</p>${content}</div>
</div><p style="font-size:12px;color:#64748b;text-align:center">此郵件由 FCCD 庫存通知系統自動發出。</p></div></body></html>`;

export function buildInventoryForecastEmail(input: {
  startDate: string;
  days: number;
  lines: InventoryForecastLine[];
  unmappedLines?: UnmappedOrderLine[];
}) {
  const end = new Date(`${input.startDate}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + input.days - 1);
  const endDate = end.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
  const unmappedLines = input.unmappedLines ?? [];
  const subject = input.lines.length || unmappedLines.length
    ? `【庫存不足】未來 ${input.days} 天有 ${input.lines.length} 項貨品不足${unmappedLines.length ? `、${unmappedLines.length} 項未設定用料` : ""}`
    : `【庫存檢查】未來 ${input.days} 天暫無不足`;
  const intro = `檢查期間：${input.startDate} 至 ${endDate}。${input.lines.length ? "以下貨品的現有庫存不足以應付現有訂單。" : "已設定用料的訂單目前沒有發現庫存不足。"}`;
  const table = input.lines.length ? `<table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="background:#ecfdf5;text-align:left"><th style="padding:10px">貨品</th><th style="padding:10px">現存</th><th style="padding:10px">14 日需要</th><th style="padding:10px">不足</th></tr></thead><tbody>${input.lines.map((line) => `<tr><td style="padding:10px;border-top:1px solid #e2e8f0"><strong>${escapeHtml(line.itemName)}</strong><br><span style="color:#64748b">${escapeHtml(line.sku || "無 SKU")} · ${escapeHtml(line.warehouse)}</span></td><td style="padding:10px;border-top:1px solid #e2e8f0">${quantity(line.currentStock)} ${escapeHtml(line.unit)}</td><td style="padding:10px;border-top:1px solid #e2e8f0">${quantity(line.requiredStock)} ${escapeHtml(line.unit)}</td><td style="padding:10px;border-top:1px solid #e2e8f0;color:#b91c1c;font-weight:700">${quantity(line.shortageQuantity)} ${escapeHtml(line.unit)}</td></tr>`).join("")}</tbody></table>` : `<div style="padding:14px;border-radius:10px;background:#ecfdf5;color:#166534;font-weight:700">✓ 暫時沒有庫存不足項目</div>`;
  const unmapped = unmappedLines.length ? `<h2 style="font-size:16px;margin:22px 0 10px;color:#9a3412">尚未設定食材／包裝</h2><p style="font-size:14px;line-height:1.6;color:#7c2d12">以下訂單項目沒有可用 BOM，系統不能假設其用料為零，請先補回產品或套餐的食材／包裝設定。</p><ul style="font-size:14px;line-height:1.7">${unmappedLines.map((line) => `<li>${escapeHtml(line.deliveryDate)} · ${escapeHtml(line.orderNumber)} · ${escapeHtml(line.itemName)}</li>`).join("")}</ul>` : "";
  return { subject, html: shell(subject, intro, table + unmapped) };
}

export function buildMinimumStockEmail(alert: MinimumStockAlert) {
  const subject = `【最低庫存】${alert.name} 已達庫存門檻`;
  const content = `<div style="border-left:4px solid #dc2626;background:#fef2f2;padding:14px 16px;line-height:1.7"><strong>${escapeHtml(alert.name)}</strong><br>SKU：${escapeHtml(alert.sku || "無 SKU")}<br>倉別：${escapeHtml(alert.warehouse)}<br>目前庫存：<strong>${quantity(alert.currentStock)} ${escapeHtml(alert.unit)}</strong><br>最低庫存：${quantity(alert.minimumStock)} ${escapeHtml(alert.unit)}</div>`;
  return { subject, html: shell(subject, "此貨品的目前庫存已等於或低於設定的最低庫存。", content) };
}
