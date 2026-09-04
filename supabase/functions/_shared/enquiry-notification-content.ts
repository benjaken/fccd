const EMAIL_BRAND = {
  name: "Food Channels Catering",
  logoUrl: "https://www.foodchannels-delivery.com/assets/fc-catering-logo-email.png",
  websiteLabel: "foodchannels-catering.com",
  websiteUrl: "https://www.foodchannels-catering.com",
  phoneLabel: "(+852) 2185 7373",
  whatsappLabel: "WhatsApp (+852) 5396 4335",
  whatsappUrl: "https://wa.me/85253964335",
  email: "sales@foodchannels-catering.com",
} as const;

export type EnquiryNotificationContent = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function renderEmailLine(line: string) {
  let html = "";
  let cursor = 0;
  for (const match of line.matchAll(/https?:\/\/[^\s<]+/g)) {
    const index = match.index ?? 0;
    const url = match[0];
    html += escapeHtml(line.slice(cursor, index));
    html += `<a href="${escapeHtml(url)}" style="color:#16794b;font-weight:700;text-decoration:underline;word-break:break-all">${escapeHtml(url)}</a>`;
    cursor = index + url.length;
  }
  return html + escapeHtml(line.slice(cursor));
}

function renderEmailHtml(subject: string, text: string) {
  const paragraphs = text.split("\n\n").map((paragraph) =>
    `<p style="margin:0 0 18px;color:#26352e;font-size:16px;line-height:1.7">${
      paragraph.split("\n").map(renderEmailLine).join("<br>")
    }</p>`
  ).join("");
  const contactLinkStyle = "color:#165f3d;font-size:14px;font-weight:700;text-decoration:none";

  return `<!doctype html>
<html lang="zh-HK">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="format-detection" content="telephone=no">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f6f3;font-family:Arial,'PingFang HK','Microsoft JhengHei',sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(subject)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f6f3">
    <tr>
      <td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(21,92,59,.10)">
          <tr><td style="height:7px;background:#1fa463;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:26px 34px 18px;border-bottom:1px solid #e3ece7">
              <img src="${EMAIL_BRAND.logoUrl}" width="190" alt="${EMAIL_BRAND.name}" style="display:block;width:190px;max-width:100%;height:auto;border:0">
            </td>
          </tr>
          <tr>
            <td style="padding:30px 34px 10px">
              <h1 style="margin:0;color:#123c2a;font-size:25px;line-height:1.35;font-weight:800">${escapeHtml(subject)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 34px 20px">
              <div style="padding:24px 24px 6px;background:#f8fbf9;border:1px solid #dfeae4;border-radius:14px">
                ${paragraphs}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 34px 30px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eaf7ef;border-radius:14px">
                <tr>
                  <td style="padding:20px 22px" x-apple-data-detectors="false">
                    <p style="margin:0 0 12px;color:#123c2a;font-size:15px;font-weight:800">聯絡 Food Channels Catering</p>
                    <p style="margin:0 0 8px;line-height:1.6"><a href="${EMAIL_BRAND.whatsappUrl}" style="${contactLinkStyle}">${EMAIL_BRAND.whatsappLabel}</a></p>
                    <p style="margin:0 0 8px;line-height:1.6;color:#165f3d;font-size:14px;font-weight:700">${EMAIL_BRAND.phoneLabel}</p>
                    <p style="margin:0 0 8px;line-height:1.6"><a href="mailto:${EMAIL_BRAND.email}" style="${contactLinkStyle}">${EMAIL_BRAND.email}</a></p>
                    <p style="margin:0;line-height:1.6"><a href="${EMAIL_BRAND.websiteUrl}" style="${contactLinkStyle}">${EMAIL_BRAND.websiteLabel}</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function content(subject: string, lines: Array<string | false | null | undefined>): EnquiryNotificationContent {
  const text = lines.filter((line): line is string => typeof line === "string").join("\n");
  return {
    subject,
    text,
    html: renderEmailHtml(subject, text),
  };
}

export const DEFAULT_ENQUIRY_ACK_SUBJECT = "我們已收到你的查詢";
export const DEFAULT_ENQUIRY_ACK_BODY = [
  "您好{姓名}{稱謂}：",
  "",
  "多謝你填寫「{表單標題}」。我們已收到你的資料，稍後會有專人回覆你。",
  "",
  "如資料有誤或想補充，請回覆本電郵或致電與我們聯絡。",
].join("\n");
export const DEFAULT_ENQUIRY_APP_URL = "https://www.foodchannels-delivery.com";

export function enquiryCustomerDisplayName(
  customerName?: string | null,
  salutation?: string | null,
) {
  return `${(customerName || "").trim()}${(salutation || "").trim()}`.trim();
}

export function enquiryPendingDetailUrl(
  appUrl: string | null | undefined,
  submissionId: string,
) {
  const base = (appUrl || "").trim().replace(/\/$/, "") || DEFAULT_ENQUIRY_APP_URL;
  return `${base}/quotes/pending/${submissionId}`;
}

export function fillEnquiryEmailTemplate(
  template: string,
  values: { salutation?: string; name?: string; title?: string },
) {
  return template
    .replaceAll("{稱謂}", values.salutation?.trim() || "")
    .replaceAll("{姓名}", values.name?.trim() || "")
    .replaceAll("{表單標題}", values.title?.trim() || "");
}

export function buildEnquiryAckContent(input: {
  salutation?: string;
  name?: string;
  title: string;
  subject?: string;
  body?: string;
}) {
  const subject = fillEnquiryEmailTemplate(
    input.subject?.trim() || DEFAULT_ENQUIRY_ACK_SUBJECT,
    input,
  );
  const body = fillEnquiryEmailTemplate(
    input.body?.trim() || DEFAULT_ENQUIRY_ACK_BODY,
    input,
  );
  return content(subject, body.split("\n"));
}

export const ENQUIRY_INTERNAL_WATI_TEMPLATE = "fccd_enquiry_internal_v1";

function enquiryWatiParameterValue(value?: string | null) {
  return (value || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim() || "-";
}

export type EnquiryInternalNotificationInput = {
  formTitle: string;
  referenceCode: string;
  customerName?: string;
  salutation?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  deliveryDate?: string;
  headcount?: string;
  quoteDescription?: string;
  detailUrl?: string;
};

export function buildEnquiryInternalContent(input: EnquiryInternalNotificationInput) {
  const displayName = enquiryCustomerDisplayName(input.customerName, input.salutation);
  return content(`新查詢：${input.formTitle} ${input.referenceCode}`, [
    "公開查詢表單剛收到一筆新提交。",
    "",
    `表單：${input.formTitle}`,
    `參考編號：${input.referenceCode}`,
    displayName && `姓名：${displayName}`,
    input.companyName && `公司：${input.companyName}`,
    input.phone && `電話：${input.phone}`,
    input.email && `電郵：${input.email}`,
    input.address && `地址：${input.address}`,
    input.deliveryDate && `日期：${input.deliveryDate}`,
    input.headcount && `人數：${input.headcount}`,
    input.quoteDescription && `描述：${input.quoteDescription}`,
    input.detailUrl && "",
    input.detailUrl && `查看待報價：${input.detailUrl}`,
  ]);
}

export function buildEnquiryInternalWatiParameters(input: EnquiryInternalNotificationInput) {
  const displayName = enquiryCustomerDisplayName(input.customerName, input.salutation);
  // fccd_enquiry_internal_v1 uses WhatsApp numbered placeholders {{1}}..{{11}}
  // in this order: form, ENQ, name, company, phone, email, address, date, headcount, description, pending URL.
  const values = [
    input.formTitle,
    input.referenceCode,
    displayName,
    input.companyName,
    input.phone,
    input.email,
    input.address,
    input.deliveryDate,
    input.headcount,
    input.quoteDescription,
    input.detailUrl,
  ];
  return values.map((value, index) => ({
    name: String(index + 1),
    value: enquiryWatiParameterValue(value),
  }));
}
