import { formatNotificationDeliveryAddress } from "./delivery-address.ts";

export type OrderNotificationEvent =
  | "delivery_order_confirmed"
  | "pickup_order_confirmed"
  | "delivery_tomorrow_reminder"
  | "pickup_tomorrow_reminder"
  | "delivery_today_reminder"
  | "pickup_today_reminder"
  | "order_details_updated"
  | "delivery_dispatched"
  | "pickup_ready"
  | "order_completed"
  | "order_cancelled"
  | "driver_assigned"
  | "bad_weather_notice"
  | "holiday_service_notice"
  | "second_contact_requested"
  | "payment_instructions_sent"
  | "payment_confirmed"
  | "delivery_delayed"
  | "order_issue_reported";

export type OrderEmailNotificationEvent = OrderNotificationEvent;

const ORDER_EMAIL_NOTIFICATION_EVENTS = new Set<OrderEmailNotificationEvent>([
  "delivery_order_confirmed",
  "pickup_order_confirmed",
  "delivery_tomorrow_reminder",
  "pickup_tomorrow_reminder",
  "delivery_today_reminder",
  "pickup_today_reminder",
  "order_details_updated",
  "delivery_dispatched",
  "pickup_ready",
  "order_completed",
  "order_cancelled",
  "driver_assigned",
  "bad_weather_notice",
  "holiday_service_notice",
  "second_contact_requested",
  "payment_instructions_sent",
  "payment_confirmed",
  "delivery_delayed",
  "order_issue_reported",
]);

export function supportsOrderEmailNotification(
  event: OrderNotificationEvent,
): event is OrderEmailNotificationEvent {
  return ORDER_EMAIL_NOTIFICATION_EVENTS.has(event as OrderEmailNotificationEvent);
}

export type OrderNotificationValues = {
  name: string;
  order_number: string;
  date: string;
  time: string;
  address: string;
  phone: string;
  delivery_method: string;
  ao_deadline: string;
  ao_link: string;
  shop_name: string;
};

export type NotificationContent = {
  subject: string;
  text: string;
  html: string;
};

export function resolveOrderNotificationShopName(
  channelName: string | null | undefined,
  fallback = "Food Channels Catering",
) {
  const name = channelName?.trim();
  if (!name) return fallback.trim() || "Food Channels Catering";

  switch (name.toLowerCase().replace(/\s+/g, " ")) {
    case "catering":
      return "Food Channels Catering";
    case "hk lunch box":
      return "HK Lunch Box";
    case "kitchen":
      return "Food Channel Kitchen";
    case "hk party food":
      return "HK Party Food";
    case "cuisine":
      return "FC Cuisine";
    default:
      return name;
  }
}

export type InternalOrderNotificationValues = {
  recipient_name: string;
  order_number: string;
  customer_name: string;
  delivery_date: string;
  delivery_time: string;
  address: string;
  order_link: string;
};

export type UnassignedDriverReminderOrder = {
  order_number: string;
  customer_name: string;
  delivery_time: string;
  order_link: string;
};

const SELF_SERVICE_URL = "https://www.foodchannels-delivery.com/self_service_search";
const PICKUP_ADDRESS = "荃灣青山公路459-469號華力工業中心5樓R室";
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

function content(subject: string, lines: Array<string | false | null | undefined>): NotificationContent {
  const text = lines.filter((line): line is string => typeof line === "string").join("\n");
  return {
    subject,
    text,
    html: renderEmailHtml(subject, text),
  };
}

export function buildOrderNotificationContent(
  event: OrderEmailNotificationEvent,
  value: OrderNotificationValues,
): NotificationContent;
export function buildOrderNotificationContent(
  event: OrderNotificationEvent,
  value: OrderNotificationValues,
): NotificationContent {
  const address = formatNotificationDeliveryAddress(value.address, value.delivery_method);
  const hello = `Hello ${value.name},`;
  const signature = value.shop_name;
  const customerServiceSignature = `${value.shop_name} 客戶服務團隊`;
  const order = value.order_number;

  switch (event) {
    case "delivery_order_confirmed":
      return content(`到會訂單確認 ${order}`, [
        hello, "", `收到你的到會訂單 ${order}, 謝謝！`, "",
        "你訂購的到會套餐將會在以下時間送到，司機到達前會致電給你。",
        `日期：${value.date}`, `時間：${value.time}`, `地址：${address}`, "",
        "如送貨當天有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        "謝謝你的支持，願你有一個愉快的聚餐時光🥳", "",
        value.ao_link && "-----------------------", value.ao_link && "",
        value.ao_link && `限時加單推介 (請在${value.ao_deadline}下午3點前加單)：`,
        value.ao_link || false, "", signature,
      ]);
    case "pickup_order_confirmed":
      return content(`到會自取訂單確認 ${order}`, [
        hello, "", `收到你的到會訂單 ${order}, 謝謝！`, "",
        "你訂購的到會套餐將會在以下時間準備好，請安排取餐。",
        `取餐日期：${value.date}`, `取餐時間：${value.time}`, `取餐地址：${PICKUP_ADDRESS}`,
        "*請留意食品數量可能比較多，建議多找一位朋友幫手取餐。", "",
        "如取餐當天有任何查詢，請Whatsapp此電話聯絡我們。", "",
        "謝謝你的支持，願你有一個愉快的聚餐時光🥳",
      ]);
    case "delivery_tomorrow_reminder":
      return content(`明日送貨提醒 ${order}`, [
        hello, "", `溫馨提示，你的到會訂單 ${order} 將於明日送到：`, "",
        `日期：${value.date}`, `時間：${value.time}`, `地址：${address}`, "",
        "司機到達前會致電給你，請保持聯絡電話暢通。", "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容或下載收據：${SELF_SERVICE_URL}`, "",
        "期待為你的聚餐送上美食🥳", "", signature,
      ]);
    case "pickup_tomorrow_reminder":
      return content(`明日取餐提醒 ${order}`, [
        hello, "", `溫馨提示，你的到會訂單 ${order} 將於明日備妥，請按預約時間前來取餐。`, "",
        `取餐日期：${value.date}`, `取餐時間：${value.time}`, `取餐地址：${PICKUP_ADDRESS}`,
        "*如食品數量較多，建議安排多一位朋友協助取餐。", "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容或下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持🥳", "", signature,
      ]);
    case "delivery_today_reminder":
      return content(`今日送貨提醒 ${order}`, [
        hello, "", `你的到會訂單 ${order} 將會在今日送貨，司機會在到達前致電給你，請保持聯絡電話暢通。`, "",
        `日期：${value.date}`, `時間：${value.time}`, `地址：${address}`, "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容 或 下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "", customerServiceSignature,
      ]);
    case "pickup_today_reminder":
      return content(`今日取餐提醒 ${order}`, [
        hello, "", `你的到會訂單 ${order} 將於今日備妥，請在已預約的時間內到達取貨。`, "",
        `取餐日期：${value.date}`, `取餐時間：${value.time}`, `取餐地址：${PICKUP_ADDRESS}`,
        "*請留意食品數量如果比較多，建議多找一位朋友幫手取餐。", "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容 或 下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "", customerServiceSignature,
      ]);
    case "order_details_updated":
      return content(`訂單資料更新確認 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已成功更新，最新安排如下：`, "",
        `日期：${value.date}`, `時間：${value.time}`, `方式：${value.delivery_method}`,
        `地址：${address}`, "", "請確認以上資料是否正確。如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容或下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "", signature,
      ]);
    case "delivery_dispatched":
      return content(`訂單已出車 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已安排出車，正在送往以下地址：`, "",
        `送貨時間：${value.time}`, `送貨地址：${address}`, "",
        "司機到達前會致電給你，請保持聯絡電話暢通。", "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        "謝謝你的耐心等候，很快就可以享用美食啦🥳", "", signature,
      ]);
    case "pickup_ready":
      return content(`訂單已備妥 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已經準備好，可以按預約時間前來取餐。`, "",
        `取餐日期：${value.date}`, `取餐時間：${value.time}`, `取餐地址：${PICKUP_ADDRESS}`,
        "*如食品數量較多，建議安排多一位朋友協助取餐。", "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        "期待你享用我們準備的美食❤️", "", signature,
      ]);
    case "order_completed":
      return content(`訂單完成確認 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已完成送貨／取餐，謝謝你的支持！`, "",
        "希望你和親友喜歡今次的到會美食，並有一個愉快的聚餐時光❤️", "",
        "如對訂單有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        "期待下次再為你服務🥳", "", signature,
      ]);
    case "order_cancelled":
      return content(`訂單取消確認 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已經取消。`, "",
        `原定日期：${value.date}`, `原定時間：${value.time}`, "",
        "如涉及退款，我們會按照付款方式安排處理，實際到帳時間可能因銀行或付款平台而異。", "",
        "如你並未要求取消，或對退款安排有任何查詢，請立即在此 WhatsApp 聯絡我們。", "",
        signature,
      ]);
    case "driver_assigned":
      return content(`訂單司機安排 ${order}`, [
        hello, "", `訂單 ${order} 已安排司機。`, "",
        `日期：${value.date}`, `時間：${value.time}`, `地址：${address}`, "",
        "司機到達前會致電給你，請保持聯絡電話暢通。", "", signature,
      ]);
    case "bad_weather_notice":
      return content(`惡劣天氣安排通知 ${order}`, [
        "你好，", "",
        "天文台報告未來幾天有機會出現惡劣天氣 (八號或以上風球/黑雨警告)☔ 惡劣天氣下我們可作以下特別安排：", "",
        "👉🏻【更改送貨日期】",
        "客人可以在24小時前聯絡我們更改送貨日期，已付費用可保留60天內使用，逾期作廢。訂單一經改期將不能重新安排在原定日期送貨。請盡量在24小時前通知我們更改送貨日期，否則有機會未能安排。", "",
        "👉🏻【繼續在原定日期送貨】",
        "當天文台宣佈懸掛八號或以上風球/黑雨警告，我們將停止送餐，送餐服務會在警報除下的2小時後恢復正常，在前一日選擇照常送貨的客人，我們會按原定送貨時間送貨。如在預定送餐時間內惡劣天氣依然持續，訂單將安排改期，已付費用可保留60天內使用，逾期作廢。", "",
        "以上安排有機會按實際情況更改，一切以客服回覆作準。請大家密切留意我們的Whatsapp通知最新安排🔥 同時希望天氣放晴，讓大家享受聚會的歡樂時光！",
      ]);
    case "holiday_service_notice":
      return content(`假期服務安排 ${order}`, [
        "尊貴的客戶，你好，", "",
        "節日期間交通情況較難預測，交通可能會提早或延遲，但出餐時間我們盡量力求準時，司機定必在安全情況下將食物送到大家手中！🙏🏻", "",
        "出車時司機會先打電話跟你聯絡，如果選擇地面交收的訂餐，請留意份量，可能需要多個朋友幫忙領取🥰", "",
        "溫馨提示⭐我們所有送到的食品都會以保溫袋及暖水袋減慢溫度流失，如果需要再加熱，我們的加厚餐盒可以直接放進微波爐、電陶爐或明火上直接加熱🔥", "",
        "祝你有一個愉快的用餐體驗，節日快樂！",
      ]);
    case "second_contact_requested":
      return content(`訂單後備聯絡人 ${order}`, [
        `你好，${order} 會在 ${value.date} 送餐。`, "",
        `由於運輸繁忙，除了 ${value.phone} 之外，請提供第二收貨聯絡人電話，以便收貨當日順利進行。`,
      ]);
    case "payment_instructions_sent":
      return content(`訂單付款資料 ${order}`, [
        hello, "", `訂單 ${order} 的付款資料已準備好。`, "",
        "請按照我們提供的付款方式完成付款；如已付款，請把付款證明傳送到此 WhatsApp。", "",
        signature,
      ]);
    case "payment_confirmed":
      return content(`訂單收款確認 ${order}`, [
        hello, "", `我們已確認收到訂單 ${order} 的款項，謝謝。`, "",
        `日期：${value.date}`, `時間：${value.time}`, "", signature,
      ]);
    case "delivery_delayed":
      return content(`訂單送貨延誤 ${order}`, [
        `剛已聯絡司機，由於路面狀況稍有阻滯，訂單會延誤 ${value.time} 分鐘，司機正盡力在安全的情況下全速前進，請見諒🙇‍♀️`,
      ]);
    case "order_issue_reported":
      return content(`訂單問題跟進 ${order}`, [
        hello, "", `我們已收到你就訂單 ${order} 提交的問題。`, "",
        "團隊會盡快核實並透過此 WhatsApp 跟進。", "", signature,
      ]);
  }
}

export function buildUnassignedDriverReminderContent(input: {
  date: string;
  orders: UnassignedDriverReminderOrder[];
}): NotificationContent {
  const count = input.orders.length;
  return content(`今日未派司機訂單提醒（${count} 張）`, [
    `今日 ${input.date} 有 ${count} 張送貨訂單尚未安排司機。`,
    "",
    ...input.orders.flatMap((order, index) => [
      `${index + 1}. ${order.order_number}｜${order.customer_name}｜${order.delivery_time}`,
      order.order_link,
      index === input.orders.length - 1 ? null : "",
    ]),
  ]);
}

export function buildFactoryUnsentReminderContent(
  value: InternalOrderNotificationValues,
): NotificationContent {
  return content(`送工場逾期提醒 ${value.order_number}`, [
    `${value.recipient_name}：`,
    "",
    `訂單 ${value.order_number} 距離送餐時間不足 12 小時，仍未發送到工場。`,
    `客戶：${value.customer_name}`,
    `送餐日期：${value.delivery_date}`,
    `送餐時間：${value.delivery_time}`,
    value.address !== "-" && `地址：${value.address}`,
    "",
    value.order_link && `查看訂單：${value.order_link}`,
  ]);
}

export function buildQuoteConfirmationContent(input: {
  name: string;
  quoteNumber: string;
  pdfUrl: string;
}) {
  return content(`報價單確認 ${input.quoteNumber}`, [
    `Hello ${input.name},`, "",
    `你的到會報價單 ${input.quoteNumber} 已經準備好。`, "",
    `查看報價單或下載 PDF：${input.pdfUrl}`, "",
    "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
    "謝謝你的支持。",
  ]);
}

export {
  DEFAULT_ENQUIRY_ACK_BODY,
  DEFAULT_ENQUIRY_ACK_SUBJECT,
  buildEnquiryAckContent,
  buildEnquiryInternalContent,
  fillEnquiryEmailTemplate,
} from "./enquiry-notification-content.ts";
