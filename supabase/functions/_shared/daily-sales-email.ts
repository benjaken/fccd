export type DailySalesEmailLine = {
  name: string;
  value: number;
};

export type DailySalesEmailContent = {
  date: string;
  restaurantName: string;
  total: number;
  payments: DailySalesEmailLine[];
  departments: DailySalesEmailLine[];
  periods: DailySalesEmailLine[];
  products: DailySalesEmailLine[];
  workingHours: DailySalesEmailLine[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-HK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
  }).format(value).replace("HK$", "$");
}

function section(title: string, lines: DailySalesEmailLine[], format: (value: number) => string) {
  const items = lines.length
    ? lines.map((line) => `<li>${escapeHtml(line.name)}：${escapeHtml(format(line.value))}</li>`).join("")
    : "<li>沒有記錄</li>";
  return `<h3 style="margin:20px 0 6px;font-size:16px"><u>${escapeHtml(title)}</u></h3><ul style="margin:0;padding-left:22px">${items}</ul>`;
}

export function buildDailySalesEmail(content: DailySalesEmailContent) {
  const date = new Date(`${content.date}T12:00:00+08:00`);
  const formattedDate = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    weekday: "long",
  }).format(date);
  const subject = `${formattedDate} ${weekday} ${content.restaurantName}營業額`;
  const html = [
    `<div style="font-family:Arial,'Noto Sans HK',sans-serif;color:#17211b;line-height:1.55">`,
    `<h2 style="margin:0 0 16px">${escapeHtml(subject)}</h2>`,
    `<p><strong>總營業額：</strong>${escapeHtml(formatMoney(content.total))}</p>`,
    section("收款方式／外賣平台", content.payments, formatMoney),
    section("部門統計", content.departments, formatMoney),
    section("時段統計", content.periods, formatMoney),
    section("新品", content.products, formatNumber),
    section("各部門總工時", content.workingHours, (value) => `${formatNumber(value)} 小時`),
    "</div>",
  ].join("");
  return { subject, html };
}
