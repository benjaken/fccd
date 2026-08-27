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
  | "order_cancelled";

export type OrderNotificationValues = {
  name: string;
  order_number: string;
  date: string;
  time: string;
  address: string;
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

const SELF_SERVICE_URL = "https://www.foodchannels-delivery.com/self_service_search";
const PICKUP_ADDRESS = "荃灣青山公路459-469號華力工業中心5樓R室";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function content(subject: string, lines: Array<string | false | null | undefined>): NotificationContent {
  const text = lines.filter((line): line is string => typeof line === "string").join("\n");
  return {
    subject,
    text,
    html: text.split("\n\n").map((paragraph) =>
      `<p>${paragraph.split("\n").map(escapeHtml).join("<br>")}</p>`
    ).join(""),
  };
}

export function buildOrderNotificationContent(
  event: OrderNotificationEvent,
  value: OrderNotificationValues,
): NotificationContent {
  const hello = `Hello ${value.name},`;
  const signature = value.shop_name;
  const order = value.order_number;

  switch (event) {
    case "delivery_order_confirmed":
      return content(`到會訂單確認 ${order}`, [
        hello, "", `收到你的到會訂單 ${order}, 謝謝！`, "",
        "你訂購的到會套餐將會在以下時間送到，司機到達前會致電給你。",
        `日期：${value.date}`, `時間：${value.time}`, `地址：${value.address}`, "",
        "如送貨當天有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        "謝謝你的支持，願你有一個愉快的聚餐時光🥳", "",
        value.ao_link && `限時加單推介（請在${value.ao_deadline}下午3點前加單）：`,
        value.ao_link || false, "", signature,
      ]);
    case "pickup_order_confirmed":
      return content(`到會自取訂單確認 ${order}`, [
        hello, "", `收到你的到會訂單 ${order}, 謝謝！`, "",
        "你訂購的到會套餐將會在以下時間準備好，請安排取餐。",
        `取餐日期：${value.date}`, `取餐時間：${value.time}`, `取餐地址：${PICKUP_ADDRESS}`,
        "*請留意食品數量可能比較多，建議多找一位朋友幫手取餐。", "",
        "如取餐當天有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        "謝謝你的支持，願你有一個愉快的聚餐時光🥳", "", signature,
      ]);
    case "delivery_tomorrow_reminder":
      return content(`明日送貨提醒 ${order}`, [
        hello, "", `溫馨提示，你的到會訂單 ${order} 將於明日送到：`, "",
        `日期：${value.date}`, `時間：${value.time}`, `地址：${value.address}`, "",
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
        `日期：${value.date}`, `時間：${value.time}`, `地址：${value.address}`, "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容或下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "", signature,
      ]);
    case "pickup_today_reminder":
      return content(`今日取餐提醒 ${order}`, [
        hello, "", `你的到會訂單 ${order} 將於今日備妥，請在已預約的時間內到達取貨。`, "",
        `取餐日期：${value.date}`, `取餐時間：${value.time}`, `取餐地址：${PICKUP_ADDRESS}`,
        "*請留意食品數量如果比較多，建議多找一位朋友幫手取餐。", "",
        "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容或下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "", signature,
      ]);
    case "order_details_updated":
      return content(`訂單資料更新確認 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已成功更新，最新安排如下：`, "",
        `日期：${value.date}`, `時間：${value.time}`, `方式：${value.delivery_method}`,
        `地址：${value.address}`, "", "請確認以上資料是否正確。如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
        `查看訂單內容或下載收據：${SELF_SERVICE_URL}`, "",
        "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "", signature,
      ]);
    case "delivery_dispatched":
      return content(`訂單已出車 ${order}`, [
        hello, "", `你的到會訂單 ${order} 已安排出車，正在送往以下地址：`, "",
        `送貨時間：${value.time}`, `送貨地址：${value.address}`, "",
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
  }
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
