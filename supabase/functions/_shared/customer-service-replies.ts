export const CUSTOMER_SERVICE_REPLY_VERSION = "zh-HK.v1";

const PROFANITY = /閪|屌|冚家|屄|操你|傻逼|幹你|冚家鏟|撚|鳩/;

export const REPLIES = {
  refuse:
    "唔好意思，我哋呢度只可以幫你查訂單、到會查詢，或者公司已公布嘅政策。如果需要其他協助，請等同事上線。",
  handoff:
    "唔好意思，呢個問題需要同事處理。我已經幫你記錄，客服會喺上午 9 點後跟進；你可以繼續補充資料。",
  sameDayUrgent:
    "你好。已收到你嘅即日／急單訂餐需求，我已經即時通知同事跟進。你亦可先喺對應品牌網站查看供應同落單：\n• FC Express（即日到會）：https://www.foodchannels-express.com/\n• Food Channels Catering（中西式到會）：https://foodchannels-catering.com/\n• HK Lunch Box（飯盒及便當）：https://hklunchbox.com/\n• HK Party Food（派對套餐及一口小食）：https://www.hkpartyfood.com/\n未收到同事回覆前，系統唔可以保證當日一定做到；你可以繼續補充人數、時間、地址或想訂邊個品牌。",
  handoffQueued:
    "收到，我已經將補充資料加入同一個跟進事項，客服會喺上午 9 點後回覆你。",
  handoffCancelled:
    "收到，已取消今次修改申請，客服唔需要再跟進。原訂單唔會因為今次申請而更改；你可以繼續問其他問題。",
  noPendingHandoff:
    "目前冇待處理嘅訂單修改申請，所以唔需要再取消。原訂單資料維持不變；你可以繼續問其他問題。",
  currentTaskCancelled:
    "收到，已取消今次操作，之前提供嘅資料唔會再繼續處理。你可以直接講另一個需要。",
  collectPrompt:
    "你好。未搵到用呢個 WhatsApp 號碼嘅正式訂單。如果你想查到會，請話我知活動日期或者人數，同事會跟進。",
  collectMore:
    "收到。麻煩再提供活動日期或者人數其中一項，我就可以交俾同事跟進。",
  collectDone: "已經幫你記低，同事會跟進。唔使再喺 WhatsApp 補電郵。",
  noFaq:
    "唔好意思，呢條我未搵到已公布嘅答案。你可以問運費、查訂單，或者話我知到會日期／人數。",
  help: "你好，我可以幫你查訂單、記低到會查詢，或者答公司已公布嘅問題（例如運費）。直接講你想問咩就得。",
  fallback: "唔好意思，系統暫時未能完成呢則回覆。同事會跟進。",
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

/** Visible marker so develop-branch WhatsApp replies are distinguishable from production. */
export const DEVELOP_OUTBOUND_MARKER = "【develop】";

export function withEnvironmentOutboundMarker(
  text: string,
  environment: string,
) {
  if (environment !== "develop") return text;
  if (text.startsWith(DEVELOP_OUTBOUND_MARKER)) return text;
  return `${DEVELOP_OUTBOUND_MARKER}${text}`;
}

export function lookupSummaryReply(order: {
  order_number: string | null;
  delivery_at: string | null;
  delivery_status: string | null;
  addon_url: string | null;
}, items: Array<{
  item_name: string;
  item_content: string | null;
  quantity: number | null;
  quantity_text: string | null;
  remarks: string[];
}> = []) {
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
  const visibleItems = items.slice(0, 30);
  const itemLines = visibleItems.map((item) => {
    const numericQuantity = Number(item.quantity);
    const quantity = item.quantity_text?.trim() || (
      Number.isFinite(numericQuantity)
        ? String(Number.isInteger(numericQuantity) ? numericQuantity : Number(numericQuantity.toFixed(3)))
        : ""
    );
    const content = item.item_content?.trim() && item.item_content.trim() !== item.item_name.trim()
      ? `（${item.item_content.trim()}）`
      : "";
    const remarks = item.remarks.map((remark) => remark.trim()).filter(Boolean);
    return `• ${item.item_name}${content}${quantity ? ` × ${quantity}` : ""}${remarks.length ? `｜備註：${remarks.join("；")}` : ""}`;
  });
  const itemDetails = itemLines.length
    ? `\n\n訂單內容：\n${itemLines.join("\n")}${items.length > visibleItems.length ? `\n• 另外仲有 ${items.length - visibleItems.length} 項，完整內容可用自助連結查看。` : ""}`
    : "";
  const selfServiceLink = order.addon_url
    ? `\n如需加單或下載收據，可用呢條自助連結：${order.addon_url}`
    : "";
  const addon = `${itemDetails}${selfServiceLink}`;
  return sanitizeOutboundReply(
    `你好，已經幫你查到呢單 ${order.order_number || "（未有單號）"}。送貨／自取時間：${when}。而家狀態：${status}。${addon}`,
  );
}

export function lookupRequestedOrderReply(
  order: {
    order_number: string | null;
    delivery_at: string | null;
    delivery_status: string | null;
    masked_address: string | null;
    addon_url: string | null;
  },
  items: Array<{
    package_name: string | null;
    item_kind?: "package" | "package_item" | "utensil" | "item";
    item_name: string;
    item_content: string | null;
    quantity: number | null;
    quantity_text: string | null;
    remarks: string[];
  }>,
  options: {
    requestedFields?: string[];
    itemLookupFailed?: boolean;
  } = {},
) {
  const requested = new Set(options.requestedFields?.length
    ? options.requestedFields
    : ["summary"]);
  const includeSummary = requested.has("summary");
  const parts = [`你好，已經幫你查到訂單 ${order.order_number || "（未有單號）"}。`];

  if (includeSummary || requested.has("delivery_date")) {
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
    parts.push(`送貨／自取時間：${when}。`);
  }
  if (includeSummary || requested.has("status")) {
    parts.push(`目前狀態：${order.delivery_status?.trim() || "待更新"}。`);
  }
  if (requested.has("address")) {
    parts.push(`送貨地址：${order.masked_address?.trim() || "暫時未有可顯示地址"}。`);
  }

  if (requested.has("items")) {
    if (options.itemLookupFailed) {
      parts.push("暫時未能載入菜式明細，你仍可使用下方自助連結查看完整訂單。");
    } else if (!items.length) {
      parts.push("訂單暫時未有可顯示的菜式明細。");
    } else {
      const deduped = new Map<string, typeof items[number]>();
      for (const item of items) {
        const remarks = item.remarks.map((remark) => remark.trim()).filter(Boolean);
        const key = [item.package_name, item.item_kind, item.item_name, item.item_content, item.quantity_text, remarks.join("|")]
          .map((value) => value?.trim().toLowerCase() || "")
          .join("::");
        const current = deduped.get(key);
        if (current && !item.quantity_text && !current.quantity_text) {
          current.quantity = Number(current.quantity || 0) + Number(item.quantity || 0);
        } else if (!current) {
          deduped.set(key, { ...item, remarks });
        }
      }
      const groups = new Map<string, Array<typeof items[number]>>();
      for (const item of deduped.values()) {
        const group = item.item_kind === "utensil"
          ? "餐具"
          : item.package_name?.trim() || "單點菜式";
        groups.set(group, [...(groups.get(group) ?? []), item]);
      }
      const lines: string[] = ["訂單內容："];
      let shown = 0;
      for (const [group, groupItems] of groups) {
        if (groups.size > 1 || group !== "單點菜式") lines.push(`【${group}】`);
        const visibleGroupItems = groupItems.filter((item) => !(
          item.item_kind === "package" &&
          groupItems.length > 1 &&
          normalizedReplyItemName(item.item_name) === normalizedReplyItemName(group)
        ));
        for (const item of visibleGroupItems.length ? visibleGroupItems : groupItems) {
          if (shown >= 30) break;
          const numericQuantity = Number(item.quantity);
          const quantity = item.quantity_text?.trim() || (
            Number.isFinite(numericQuantity)
              ? String(Number.isInteger(numericQuantity) ? numericQuantity : Number(numericQuantity.toFixed(3)))
              : ""
          );
          const content = item.item_content?.trim() && item.item_content.trim() !== item.item_name.trim()
            ? `（${item.item_content.trim()}）`
            : "";
          const remarks = item.remarks.map((remark) => remark.trim()).filter(Boolean);
          lines.push(`• ${item.item_name}${content}${quantity ? ` × ${quantity}` : ""}${remarks.length ? `｜備註：${remarks.join("；")}` : ""}`);
          shown += 1;
        }
        if (shown >= 30) break;
      }
      if (deduped.size > shown) {
        lines.push(`• 另外仲有 ${deduped.size - shown} 項，完整內容可用自助連結查看。`);
      }
      parts.push(lines.join("\n"));
    }
  }

  if (requested.has("receipt") || options.itemLookupFailed || requested.has("items")) {
    parts.push(order.addon_url
      ? `自助查詢／下載收據：${order.addon_url}`
      : "暫時未有自助查詢連結。");
  }
  return sanitizeOutboundReply(parts.join("\n"));
}

function normalizedReplyItemName(value: string) {
  return value.toLowerCase().replace(/[\s，。！？、,.!?：:；;（）()「」『』"']/g, "");
}

export function lookupNoOrdersReply(orderNumber = "") {
  return sanitizeOutboundReply(orderNumber.trim()
    ? `唔好意思，用呢個 WhatsApp 號碼搵唔到訂單 ${orderNumber.trim()}。請確認訂單號碼，或者使用落單時的電話號碼再查詢。`
    : "唔好意思，用呢個 WhatsApp 號碼暫時搵唔到正式訂單。請提供訂單號碼，或者使用落單時的電話號碼再查詢。");
}

export function lookupListReply(
  orders: Array<{ order_number: string | null; delivery_at: string | null }>,
) {
  const lines = orders.map((order) => {
    const when = order.delivery_at
      ? new Date(order.delivery_at).toLocaleDateString("zh-HK", {
          timeZone: "Asia/Hong_Kong",
        })
      : "日期待確認";
    return `${order.order_number || "（未有單號）"}（${when}）`;
  });
  return sanitizeOutboundReply(`${REPLIES.pickOrder}\n${lines.join("\n")}`);
}

export function lookupNotFoundReply(orderNumber: string) {
  return sanitizeOutboundReply(
    `唔好意思，用呢個 WhatsApp 號碼搵唔到訂單 ${orderNumber}。請確認訂單號碼，或者用落單時嘅電話號碼再試。`,
  );
}

export function handoffOrderListReply(
  request: string,
  orders: Array<{ order_number: string | null; delivery_at: string | null }>,
) {
  const confirming = request.trim()
    ? `收到，你想處理「${request.trim()}」。`
    : "收到，你想更改訂單。";
  const lines = orders.map((order) => {
    const when = order.delivery_at
      ? new Date(order.delivery_at).toLocaleString("zh-HK", {
          timeZone: "Asia/Hong_Kong",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "日期待確認";
    return `${order.order_number || "（未有單號）"}（${when}）`;
  });
  return sanitizeOutboundReply(
    `${confirming}請先回覆要處理嘅未送貨訂單號：\n${lines.join("\n")}`,
  );
}

export function handoffOrderSelectedReply(orderNumber: string) {
  return sanitizeOutboundReply(
    `已選擇訂單 ${orderNumber}。我已經記錄你嘅要求，客服會喺上午 9 點後跟進；你可以繼續補充資料。`,
  );
}

export function handoffNoOpenOrderReply() {
  return sanitizeOutboundReply(
    "用呢個 WhatsApp 號碼暫時搵唔到未送貨訂單。我已經記錄呢個情況，客服會喺上午 9 點後跟進。",
  );
}

export function faqReply(answer: string) {
  const text = answer.trim();
  return sanitizeOutboundReply(
    /^(?:你好[。！!，,\s]|hello\b)/i.test(text) ? text : `你好。${text}`,
  );
}
