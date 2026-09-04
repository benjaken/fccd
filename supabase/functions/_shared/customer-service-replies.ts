export const CUSTOMER_SERVICE_REPLY_VERSION = "zh-HK.v1";

const PROFANITY = /閪|屌|冚家|屄|操你|傻逼|幹你|冚家鏟|撚|鳩/;

export const REPLIES = {
  refuse:
    "唔好意思，我哋呢度只可以幫你查訂單、到會查詢，或者公司已公布嘅政策。如果需要其他協助，請等同事上線。",
  handoff:
    "唔好意思，呢單要同事跟進。我已經幫你交俾同事，稍後會有人回覆你。",
  collectPrompt:
    "你好。未搵到用呢個 WhatsApp 號碼嘅正式訂單。如果你想查到會，請話我知活動日期或者人數，同事會跟進。",
  collectMore:
    "收到。麻煩再提供活動日期或者人數其中一項，我就可以交俾同事跟進。",
  collectDone:
    "已經幫你記低，同事會跟進。唔使再喺 WhatsApp 補電郵。",
  noFaq:
    "唔好意思，呢條我未搵到已公布嘅答案。你可以問運費、查訂單，或者話我知到會日期／人數。",
  help:
    "你好，我可以幫你查訂單、記低到會查詢，或者答公司已公布嘅問題（例如運費）。直接講你想問咩就得。",
  fallback:
    "唔好意思，系統暫時未能完成呢則回覆。同事會跟進。",
  pickOrder:
    "已經幫你查到多過一張訂單。請回覆其中一個訂單號，我再同你講嗰單嘅狀況。",
} as const;

export function containsProfanity(value: string) {
  return PROFANITY.test(value);
}

export function sanitizeOutboundReply(value: string) {
  const text = value.trim();
  if (!text || containsProfanity(text)) return REPLIES.fallback;
  return text;
}

export function lookupSummaryReply(order: {
  order_number: string | null;
  delivery_at: string | null;
  delivery_status: string | null;
  addon_url: string | null;
}) {
  const when = order.delivery_at
    ? new Date(order.delivery_at).toLocaleString("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "待確認";
  const status = order.delivery_status?.trim() || "待更新";
  const addon = order.addon_url
    ? `\n如需加單或下載收據，可用呢條自助連結：${order.addon_url}`
    : "";
  return sanitizeOutboundReply(
    `你好，已經幫你查到呢單 ${order.order_number || "（未有單號）"}。送貨／自取時間：${when}。而家狀態：${status}。${addon}`,
  );
}

export function lookupListReply(
  orders: Array<{ order_number: string | null; delivery_at: string | null }>,
) {
  const lines = orders.map((order) => {
    const when = order.delivery_at
      ? new Date(order.delivery_at).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })
      : "日期待確認";
    return `${order.order_number || "（未有單號）"}（${when}）`;
  });
  return sanitizeOutboundReply(`${REPLIES.pickOrder}\n${lines.join("\n")}`);
}

export function faqReply(answer: string) {
  const text = answer.trim();
  return sanitizeOutboundReply(/^你好[。！!，,\s]/.test(text) ? text : `你好。${text}`);
}
