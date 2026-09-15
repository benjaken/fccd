import {
  classifyCustomerServiceMessage,
  customerServiceBrandIdentityName,
  customerServiceMenuFaqQuery,
  customerServiceSeasonalMenuFaqQuery,
  isBrandIntroductionRequest,
  isOrderingInstructionsRequest,
  extractCustomerServiceClockTime,
  extractInquirySlots,
  extractOrderNumber,
  extractRequestedOrderFields,
  hasCollectableSlots,
  hongKongCalendarDate,
  isCustomerServiceGreeting,
  isCustomerServiceEmojiAcknowledgement,
  isCustomerServiceThanks,
  isDeliveryAvailabilityQuestion,
  isHongKongCalendarDateToday,
  isMenuInformationRequest,
  isOrderConfirmationAcknowledgement,
  isProductQualityComplaint,
  isSameDayOrderDemand,
  isTakeawayPackagingRequest,
  normalizeCustomerServiceOrderNumber,
  resolveCustomerServiceDeliveryDate,
  type ClassifiedMessage,
  type InquirySlots,
} from "./customer-service-intents.ts";
import {
  faqReply,
  handoffNoOpenOrderReply,
  handoffOrderListReply,
  handoffOrderSelectedReply,
  lookupListReply,
  lookupNoOrdersReply,
  lookupNotFoundReply,
  lookupRequestedOrderReply,
  REPLIES,
  sanitizeOutboundReply,
} from "./customer-service-replies.ts";
import { findOrderIntakeRecommendation } from "./customer-service-order-intake.ts";
import {
  decideCustomerServicePilotAction,
  inferCustomerServicePilotGoal,
  type CustomerServicePilotGoal,
} from "./customer-service-pilot-graph.ts";
import type { CustomerServiceRecentMessage } from "./customer-service-context.ts";
import {
  customerServiceCatalogQuery,
  customerServiceCatalogReply,
  type CustomerServiceCatalogHit,
} from "./customer-service-catalog.ts";

export type CustomerServiceTaskSnapshot = {
  goal: CustomerServicePilotGoal;
  state: CustomerServiceConversation["state"];
  selectedOrderId: string | null;
  handoffAt: string | null;
  pendingRequest: string | null;
  workflowSlots: Record<string, unknown>;
  handoffKind?: CustomerServiceHandoffKind | null;
  handoffUrgent?: boolean;
  handoffQuoteId?: string | null;
};

export type CustomerServiceHandoffKind =
  | "same_day_catering"
  | "future_catering"
  | "order_change"
  | "general";

export type CustomerServiceOrder = {
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  delivery_at: string | null;
  delivery_status: string | null;
  masked_email: string | null;
  masked_address: string | null;
  addon_url: string | null;
};

export type CustomerServiceOrderItem = {
  order_line_id: string;
  package_name: string | null;
  item_kind?: "package" | "package_item" | "utensil" | "item";
  item_name: string;
  item_content: string | null;
  quantity: number | null;
  quantity_text: string | null;
  remarks: string[];
};

export type CustomerServiceConversation = {
  phone_normalized: string;
  state:
    | "identifying"
    | "verifying_order"
    | "picking_order"
    | "picking_handoff_order"
    | "collecting"
    | "awaiting_human"
    | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
  pending_request: string | null;
  active_goal?: CustomerServicePilotGoal | null;
  handoff_kind?: CustomerServiceHandoffKind | null;
  handoff_urgent?: boolean;
  handoff_quote_id?: string | null;
  workflow_slots?: Record<string, unknown>;
  workflow_version?: number;
  suspended_goals?: CustomerServiceTaskSnapshot[];
  recent_messages?: CustomerServiceRecentMessage[];
  identity_verified_at?: string | null;
  identity_verification_method?: string | null;
  identity_verification_order_id?: string | null;
  identity_verification_attempts?: number;
};

export type CustomerServiceFaqHit = {
  id: string;
  category?: string;
  question: string;
  answer: string;
};

export type RelatedFaqSuggestion = {
  id: string;
  question: string;
};

export function selectRelatedFaqs(
  hits: CustomerServiceFaqHit[],
  excludeIds: Iterable<string>,
  limit = 3,
): RelatedFaqSuggestion[] {
  const excluded = new Set(
    [...excludeIds].map((id) => id.trim()).filter(Boolean),
  );
  const selected: RelatedFaqSuggestion[] = [];
  for (const hit of hits) {
    if (!hit.id || excluded.has(hit.id)) continue;
    const question = hit.question?.trim();
    if (!question) continue;
    selected.push({ id: hit.id, question });
    excluded.add(hit.id);
    if (selected.length >= limit) break;
  }
  return selected;
}

export type CustomerServiceInquiryWrite = {
  quote_id: string;
  order_number: string | null;
  created: boolean;
};

export type CustomerServiceDeliveryAvailability =
  | "not_blocked"
  | "blocked"
  | "unknown";

export type CustomerServiceOrderIntakeAvailability = {
  status: "available" | "manual_review" | "unknown";
  message?: string | null;
  recommendations?: Array<{ name: string; url: string | null }>;
  unavailableChannelName?: string | null;
  requiresTime?: boolean;
  selectedRecommendation?: { name: string; url: string | null } | null;
  recognizedChannelName?: string | null;
  allowedProductTerms?: string[];
  allowedProductTermGroups?: string[][];
  needsProductSelection?: boolean;
};

export type CustomerServiceBotDeps = {
  workflowAutoResume?: Partial<Record<CustomerServicePilotGoal, boolean>>;
  replyTemplates?: Partial<
    Record<
      | "help"
      | "handoff"
      | "same_day_urgent"
      | "collect_prompt"
      | "collect_more"
      | "collect_done"
      | "no_faq"
      | "refuse"
      | "acknowledgement"
      | "thanks"
      | "complaint_handoff"
      | "packaging_request",
      string
    >
  >;
  lookupOrders: (phone: string) => Promise<CustomerServiceOrder[]>;
  lookupOrderItems: (
    phone: string,
    orderId: string,
  ) => Promise<CustomerServiceOrderItem[]>;
  verifyOrderIdentity: (
    phone: string,
    orderId: string,
    answer: string,
  ) => Promise<boolean>;
  writeInquiry: (
    phone: string,
    slots: InquirySlots,
    anotherEvent: boolean,
  ) => Promise<CustomerServiceInquiryWrite>;
  searchFaqs: (query: string) => Promise<CustomerServiceFaqHit[]>;
  searchCatalog?: (query: string) => Promise<CustomerServiceCatalogHit[]>;
  checkDeliveryDateAvailability?: (
    date: string,
  ) => Promise<CustomerServiceDeliveryAvailability>;
  checkOrderIntakeAvailability?: (
    date: string,
    text: string,
    context?: { deliveryTime?: string | null },
  ) => Promise<CustomerServiceOrderIntakeAvailability>;
  answerFaqWithModel?: (
    query: string,
    candidates: CustomerServiceFaqHit[],
  ) => Promise<
    string | { answer: string; sourceIds: string[]; model: string } | null
  >;
  answerWithoutFaqWithModel?: (input: {
    query: string;
    intentKey: string;
    confidence?: number;
    missingFields: string[];
    recentMessages: CustomerServiceRecentMessage[];
  }) => Promise<string | { answer: string; model: string } | null>;
  queueHandoff: (input: {
    phone: string;
    quoteId: string | null;
    orderNumber: string | null;
    summary: string;
    kind?: "inquiry" | "order_handoff";
    /** Same-day / urgent catering: notify staff via WATI immediately. */
    urgent?: boolean;
  }) => Promise<void>;
  cancelHandoff: (phone: string) => Promise<boolean>;
};

export type BotTurn = {
  reply: string | null;
  imageUrl?: string | null;
  conversation: CustomerServiceConversation;
  wroteInquiry: boolean;
  notified: boolean;
  queuedHandoff?: boolean;
  usedModel: boolean;
  intentKey?: string;
  confidence?: number;
  toolKeys?: string[];
  failureReason?: string | null;
  faqSourceIds?: string[];
  relatedFaqs?: RelatedFaqSuggestion[];
  model?: string | null;
  dialogAction?: ClassifiedMessage["dialogAction"];
};

function configuredReply(
  deps: CustomerServiceBotDeps,
  key: keyof NonNullable<CustomerServiceBotDeps["replyTemplates"]>,
  fallback: string,
) {
  return sanitizeOutboundReply(deps.replyTemplates?.[key]?.trim() || fallback);
}

function deliveryDateLabel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "該日";
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) return "該日";
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  return `${day}/${month}（${weekdays[value.getUTCDay()]}）`;
}

function deliveryAvailabilityReply(
  date: string,
  availability: CustomerServiceDeliveryAvailability,
) {
  const label = deliveryDateLabel(date);
  if (availability === "blocked") {
    return `${label} 暫停接受送貨預訂。你可以選擇其他日期，或者提供送貨地區俾我哋再跟進。`;
  }
  const opening = availability === "not_blocked"
    ? `${label}可以安排送貨，目前未有停單記錄。`
    : `${label}一般可以安排送貨。`;
  return `${opening}實際可選時段及當日配額以網站結帳頁顯示為準，建議盡快落單。如果你提供送貨地區，我可以再幫你查運費同交收方式。`;
}

function nextConversation(
  current: CustomerServiceConversation,
  patch: Partial<CustomerServiceConversation>,
): CustomerServiceConversation {
  return { ...current, ...patch };
}

function isUndeliveredOrder(order: CustomerServiceOrder) {
  const status = order.delivery_status?.trim() ?? "";
  return !/已送達|己送達|已經送達|delivered|已取消|己取消|取消|cancelled/i.test(
    status,
  );
}

function normalizedFaqText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s，。！？、,.!?：:；;（）()「」『』"']/g, "")
    .replace(/^(請問|想問|我想問|可唔可以問)/, "");
}

function orderIntakeAvailabilityReply(
  date: string,
  availability: CustomerServiceOrderIntakeAvailability,
  deliveryTime?: string | null,
) {
  const label = deliveryDateLabel(date);
  const recommendations = (availability.recommendations ?? [])
    .map((item) => item.url ? `${item.name}：${item.url}` : item.name)
    .join("\n");
  const generalAvailabilityMessage = availability.message?.includes("XXX")
    ? null
    : availability.message;
  if (availability.status === "manual_review") {
    const unavailableChannel = availability.unavailableChannelName?.trim();
    const availabilityMessage = unavailableChannel
      ? availability.message?.replaceAll("XXX", unavailableChannel)
      : generalAvailabilityMessage;
    const recognizedChannel = availability.recognizedChannelName?.trim();
    const allowedTerms = [...new Set((availability.allowedProductTerms ?? [])
      .map((term) => term.trim()).filter(Boolean))];
    const termGroups = (availability.allowedProductTermGroups ?? [])
      .map((terms) => [...new Set(terms.map((term) => term.trim()).filter(Boolean))])
      .filter((terms) => terms.length > 0);
    if (unavailableChannel && availabilityMessage) return availabilityMessage;
    if (availabilityMessage?.includes("https://www.emailmeform.com/builder/form/")) {
      return availabilityMessage;
    }
    if (!unavailableChannel && availability.needsProductSelection && recognizedChannel && (allowedTerms.length || termGroups.length)) {
      const formatChoices = (terms: string[]) => terms.length === 1
        ? terms[0]
        : `${terms.slice(0, -1).join("、")}或${terms.at(-1)}`;
      const productPrompt = allowedTerms.length
        ? `${label}只提供${formatChoices(allowedTerms)}，請問想選哪一類？`
        : `${label}產品需要同時符合以下條件：${termGroups.map(formatChoices).join("；")}。請問想選哪一類？`;
      return [
        `已了解你想預訂 ${customerFacingOrderIntakeChannelName(recognizedChannel)}。`,
        productPrompt,
        availability.requiresTime && !deliveryTime
          ? "另外請提供希望送達時間，我會一併核對接單安排。"
          : null,
      ].filter(Boolean).join("\n");
    }
    return [
      availabilityMessage || `${label}有特別接單安排。`,
      recommendations ? `你亦可以考慮以下可接選擇：\n${recommendations}` : null,
      deliveryTime
        ? `已收到希望 ${deliveryTime}送達。如你想查詢其他品牌或產品，請留下地區、人數及預算；同事會按訂單金額及實際情況再確認。`
        : "如你想查詢其他品牌或產品，請留下希望送達時間、地區、人數及預算；同事會按訂單金額及實際情況再確認。",
    ].filter(Boolean).join("\n");
  }
  if (availability.status === "available") {
    return [
      availability.requiresTime ? `${label}有指定時段限制，需要先核對送達時間。` : `${label}目前可以落單。`,
      generalAvailabilityMessage,
      recommendations || null,
      deliveryTime && !availability.requiresTime
        ? `已收到希望 ${deliveryTime}送達；實際可選時段及配額以網站結帳頁顯示為準。`
        : "請問希望幾點送到？我可以再按你提供嘅時間核對接單安排。",
    ].filter(Boolean).join("\n");
  }
  return deliveryTime
    ? `${label} ${deliveryTime}嘅接單安排暫時未能確認，請稍後再試，或回覆「請客服跟進」。`
    : `${label}嘅接單安排暫時未能自動確認。請先提供希望送達時間，我再幫你核對下一步。`;
}

function customerFacingOrderIntakeChannelName(value: string) {
  const key = value.toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "catering") return "Food Channels Catering";
  if (key === "kitchen") return "桂花‧八月（Food Channels Kitchen）";
  if (key === "express") return "Food Channels Express";
  if (key === "cuisine") return "Food Channels Cuisine";
  if (key === "lunchbox" || key === "hklunchbox") return "HK Lunch Box";
  if (key === "partyfood" || key === "hkpartyfood") return "HK Party Food";
  return value;
}

const AVAILABILITY_DELIVERY_TIME_PENDING = "availability:delivery_time";

function isStandaloneDeliveryTime(text: string) {
  const remainder = text
    .replace(/(?<!\d)(?:(?:上午|早上|中午|午夜|下午|晚上|夜晚)\s*)?(?:[01]?\d|2[0-4])\s*[:：點点時时]\s*(?:\d{1,2}\s*分?|半)?(?!\d)/, "")
    .replace(/希望|我想|想|大約|大概|差不多|左右|送到|送達|時間|改為|改到|收到|可以嗎|可以|得唔得|唔該|謝謝|多謝|約|點|時/g, "")
    .replace(/[\s，。！？,.!?:：]/g, "");
  return remainder.length === 0;
}

async function replyAvailabilityTimeFollowUp(
  deps: CustomerServiceBotDeps,
  conversation: CustomerServiceConversation,
  text: string,
): Promise<BotTurn | null> {
  const pending = conversation.pending_request;
  if (pending !== AVAILABILITY_DELIVERY_TIME_PENDING) return null;

  const time = extractCustomerServiceClockTime(text);
  if (!time) {
    if (!/(?:點|点|時|时|時間|时间|大約|大约|差不多)/.test(text)) {
      return null;
    }
    return {
      reply: "我未能確認個時間，請用例如「19:00」或者「晚上7點」再講一次。",
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "delivery_availability",
      toolKeys: [],
      failureReason: "availability_time_invalid",
    };
  }

  const saved = conversation.workflow_slots ?? {};
  const eventDate = resolveCustomerServiceDeliveryDate(text) || String(saved.eventDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return {
      reply: "我搵唔返頭先查詢嘅日期，請再提供一次日期，我會重新幫你查接單安排。",
      conversation: nextConversation(conversation, {
        pending_request: null,
        workflow_slots: {},
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "delivery_availability",
      toolKeys: [],
      failureReason: "availability_context_missing",
    };
  }

  const label = deliveryDateLabel(eventDate);
  let intake: CustomerServiceOrderIntakeAvailability = { status: "unknown" };
  if (deps.checkOrderIntakeAvailability) {
    try {
      intake = await deps.checkOrderIntakeAvailability(
        eventDate,
        `${String(saved.availabilityQuestion ?? "")} 送達時間 ${time}`.trim(),
        { deliveryTime: time },
      );
    } catch (error) {
      console.error(
        "customer-service follow-up intake check failed",
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
  }
  if (intake.status === "manual_review") {
    return {
      reply: orderIntakeAvailabilityReply(eventDate, intake, time),
      conversation: nextConversation(conversation, {
        state: "collecting",
        active_goal: "catering_inquiry",
        pending_request: "特別接單安排人工覆核",
        workflow_slots: {
          ...saved,
          eventDate,
          deliveryTime: time,
          availabilityQuestion: String(saved.availabilityQuestion ?? ""),
          orderIntakeRecommendations: intake.recommendations ?? [],
          note: `送達時間 ${time}；接單規則需人工覆核`.slice(0, 2_000),
        },
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "delivery_availability",
      toolKeys: ["check_order_intake"],
    };
  }
  if (intake.status === "unknown") {
    return {
      reply: `${label} ${time}嘅接單安排暫時未能確認，請稍後再試，或回覆「請客服跟進」。`,
      conversation: nextConversation(conversation, {
        workflow_slots: { ...saved, eventDate, deliveryTime: time },
      }),
      wroteInquiry: false, notified: false, usedModel: false,
      intentKey: "delivery_availability", toolKeys: ["check_order_intake"],
      failureReason: "order_intake_unknown",
    };
  }
  return {
    reply: `收到，你希望 ${label} 約 ${time}送到。該日目前可以落單；實際可選時段及配額以網站結帳頁顯示為準。`,
    conversation: nextConversation(conversation, {
      pending_request: null,
      workflow_slots: {},
    }),
    wroteInquiry: false,
    notified: false,
    usedModel: false,
    intentKey: "delivery_availability",
    toolKeys: deps.checkOrderIntakeAvailability ? ["check_order_intake"] : [],
    failureReason: null,
  };
}

function isSelectedOrderItemFollowUp(text: string) {
  return /(?:這|这|呢|嗰)(?:個|个|款)?(?:菜式|餸菜|餐點|餐点).{0,8}(?:係|系|是|叫|咩|乜|甚麼|什麼|什么|邊款|哪款)/i
    .test(text.trim());
}

const FAQ_DIRECT_MATCH_RULES: Array<{
  question: string;
  aliases: RegExp[];
  excluded?: RegExp;
}> = [
  {
    question: "運費幾多",
    aliases: [/運費(?:幾多|點計|收費)/, /送貨費(?:幾多|點計|收費)/, /免運(?:門檻|條件)/, /deliveryfee/],
    excluded: /(?:我|張|訂單|order).{0,8}(?:幾時送|送貨狀態|付款狀態)/,
  },
  {
    question: "接受咩付款方式",
    aliases: [/付款方式/, /付款有咩(?:選擇|方法)/, /點(?:樣)?俾錢/, /支付方式/, /paymentmethod/, /接受(?:咩|什麼|哪些)(?:付款|支付)/],
    excluded: /已付款|未入帳|沒入帳|扣款|付款失敗|重複付款/,
  },
  {
    question: "網上付款支援咩方式",
    aliases: [/網上付款(?:方式|支援)/, /(?:visa|mastercard|alipay|wechatpay).{0,8}(?:支援|接受|可以)/],
    excluded: /已付款|未入帳|沒入帳|扣款|付款失敗|重複付款/,
  },
  {
    question: "可唔可以貨到付款",
    aliases: [/貨到付款/, /收貨(?:先|時)?付款/, /cashondelivery/, /^cod$/],
  },
  {
    question: "點攞收據或者發票",
    aliases: [/(?:收據|發票|invoice|receipt).{0,8}(?:點攞|下載|索取|邊度|哪裏)/, /(?:下載|索取).{0,8}(?:收據|發票|invoice|receipt)/],
  },
  {
    question: "點樣喺網站落單",
    aliases: [/(?:網站|網上).{0,8}(?:點樣|如何|點|怎樣)?(?:落單|訂購|下單)/, /(?:點樣|如何|howto)(?:喺|在)?(?:網站|網上)?(?:落單|訂購|order)/],
    excluded: /即日|今日|今天|急單/,
  },
  {
    question: "可唔可以經whatsapp落單",
    aliases: [/whatsapp.{0,8}(?:落單|訂餐|訂購)/, /(?:落單|訂餐|訂購).{0,8}whatsapp/],
    excluded: /即日|今日|今天|急單/,
  },
  {
    question: "可唔可以提早預訂",
    aliases: [/(?:提早|幾早|預早|提前).{0,8}(?:預訂|落單|訂餐)/],
    excluded: /截單|最後落單|deadline/,
  },
  {
    question: "網站落單同foodpanda有咩分別",
    aliases: [/foodpanda.{0,12}(?:網站|官網|分別|款式)/, /(?:網站|官網).{0,12}foodpanda/],
  },
  {
    question: "可唔可以度身訂造餐單",
    aliases: [/(?:度身訂造|客製|訂製|自訂).{0,8}(?:餐單|餐牌|套餐)/],
    excluded: /即日|今日|今天|急單|廚房確認/,
  },
  {
    question: "想要報價要提供咩資料",
    aliases: [/(?:報價|詢價|quotation).{0,8}(?:資料|提供|需要什麼|要咩)/],
  },
  {
    question: "可以喺訂單加備註嗎",
    aliases: [/(?:備註|補充資料).{0,8}(?:訂單|落單)/, /(?:訂單|落單).{0,8}(?:備註|補充資料)/],
    excluded: /已落單|落咗單|完成落單|改(?:單|內容)/,
  },
  {
    question: "可唔可以荃灣自取",
    aliases: [/(?:荃灣.{0,6}自取|自取.{0,6}荃灣)/, /自取(?:地址|地點|邊度|哪裏)/],
    excluded: /(?:改|轉|更改).{0,8}自取|(?:我|張|訂單).{0,8}自取/,
  },
  {
    question: "地面交收係咩意思",
    aliases: [/地面交收(?:係咩|意思|點樣|是什麼)/, /groundcollection/],
  },
  {
    question: "有冇送貨上門服務",
    aliases: [/(?:有冇|可以|可否).{0,8}(?:送貨上門|送上樓|homedelivery)/, /(?:送貨上門|送上樓).{0,8}(?:服務|得唔得|可以)/],
    excluded: /(?:改|轉|更改).{0,8}(?:送貨|上門)|(?:我|張|訂單).{0,8}(?:送貨|上門)/,
  },
  {
    question: "有冇餐牌可以睇",
    aliases: [/(?:有冇|想睇|提供|send).{0,8}(?:餐牌|菜單|menu)/, /(?:餐牌|菜單|menu).{0,8}(?:有冇|睇|看|提供|send)/],
    excluded: /即日|今日|今天|急單/,
  },
  {
    question: "foodchannels有邊啲到會品牌",
    aliases: [/(?:foodchannels|你哋|公司|旗下).{0,8}(?:品牌|邊幾間)/, /到會品牌/],
  },
  {
    question: "幾個到會品牌有咩分別",
    aliases: [/(?:品牌|fcc|express|kitchen|cuisine|lunchbox|partyfood).{0,12}(?:分別|主打|適合|比較)/],
  },
  {
    question: "你哋餐牌有咩種類",
    aliases: [/(?:餐牌|菜式|食物).{0,8}(?:種類|類型|有咩)/],
  },
  {
    question: "有冇食物相片參考",
    aliases: [/(?:食物|菜式|餐點).{0,8}(?:相片|圖片|photo)/, /(?:相片|圖片|photo).{0,8}(?:食物|菜式|餐點)/],
  },
  {
    question: "有冇早餐",
    aliases: [/早餐|breakfast/],
  },
  {
    question: "食物係即食定要加熱",
    aliases: [/(?:食物|菜式|到會).{0,8}(?:即食|加熱|翻熱)/, /(?:即食|加熱|翻熱).{0,8}(?:食物|菜式|到會)/],
  },
  {
    question: "餐具有啲咩",
    aliases: [/(?:餐具|刀叉|筷子).{0,8}(?:有啲咩|包括|包唔包|有冇|提供)/, /(?:包括|包唔包|有冇).{0,8}(?:餐具|刀叉|筷子)/],
  },
  {
    question: "餐具份量點樣計",
    aliases: [/(?:餐具|餐具包).{0,8}(?:幾人|幾位|數量|份量|夠)/],
  },
  {
    question: "素食或者走蔥蒜得唔得",
    aliases: [/素食|走蔥|走蒜|vegetarian/],
    excluded: /敏感|過敏|保證|即日|今日|今天|急單/,
  },
  {
    question: "植物肉係用咩整",
    aliases: [/(?:植物肉|omni|素肉).{0,8}(?:成分|材料|用咩整|大豆)/],
    excluded: /敏感|過敏|保證/,
  },
  {
    question: "高級飯盒便當可以做素食嗎",
    aliases: [/(?:飯盒|便當).{0,8}(?:素食|走肉|vegetarian)/, /(?:素食|vegetarian).{0,8}(?:飯盒|便當)/],
    excluded: /敏感|過敏|即日|今日|今天|急單/,
  },
  {
    question: "有冇廚師上門",
    aliases: [/廚師上門|上門煮|chef(?:service)?/],
  },
  {
    question: "有冇侍應或者擺盤",
    aliases: [/侍應|擺盤|waiter|plating/],
  },
  {
    question: "食物係咪由你哋工場製作",
    aliases: [/(?:工場|廚房|食物來源).{0,8}(?:自家|你哋|製作|邊度)/, /(?:自家|你哋).{0,8}(?:工場|廚房).{0,8}(?:製作|整)/],
  },
  {
    question: "餐盒會唔會標示菜式名稱",
    aliases: [/(?:餐盒|盒蓋|包裝).{0,8}(?:菜名|標籤|貼紙|核對)/],
  },
  {
    question: "食物用咩包裝送到",
    aliases: [/(?:食物|到會).{0,8}(?:包裝|鋁盒|保溫)/, /(?:包裝|鋁盒|保溫).{0,8}(?:食物|到會)/],
  },
  {
    question: "食物大約幾多盒一箱",
    aliases: [/(?:箱|紙箱).{0,8}(?:幾多盒|多少盒|箱數)/, /一箱.{0,6}(?:幾多|多少)盒/],
    excluded: /(?:我|張|訂單|order)/,
  },
  {
    question: "有冇軟餐或者碎餐",
    aliases: [/軟餐|碎餐|院舍餐|切細件/],
  },
  {
    question: "乳豬係原隻送到嗎",
    aliases: [/乳豬.{0,8}(?:原隻|切|膠刀|手套)/],
  },
  {
    question: "甜薯絲網卷係用咩整",
    aliases: [/甜薯絲網卷.{0,8}(?:成分|材料|用咩整|米網)/],
    excluded: /敏感|過敏|保證/,
  },
  {
    question: "因宗教原因唔食牛套餐可以更換嗎",
    aliases: [/(?:牛|牛肉).{0,8}(?:宗教|唔食|更換|轉菜)/, /(?:宗教|唔食).{0,8}(?:牛|牛肉)/],
  },
  {
    question: "一斤叉燒大約有幾多片",
    aliases: [/叉燒.{0,8}(?:一斤|幾多片|份量)/, /一斤.{0,6}叉燒/],
  },
  {
    question: "啫喱糖兩磅大約夠幾多人",
    aliases: [/啫喱糖.{0,10}(?:兩磅|2磅|幾多人|份量)/],
  },
  {
    question: "泰式菠蘿炒飯辣唔辣",
    aliases: [/(?:泰式菠蘿炒飯|菠蘿炒飯).{0,8}(?:辣|唔辣)/],
  },
  {
    question: "豬手同牛肋骨會切開嗎",
    aliases: [/(?:豬手|牛肋骨).{0,8}(?:切開|幾人|份量)/],
  },
  {
    question: "壽桃包有幾大",
    aliases: [/壽桃包.{0,8}(?:幾大|尺寸|拳頭)/],
  },
  {
    question: "壽桃包可以點樣保存",
    aliases: [/壽桃包.{0,8}(?:保存|急凍|蒸熱)/],
  },
  {
    question: "pizza會切幾多件",
    aliases: [/(?:pizza|薄餅).{0,8}(?:幾件|切法|方形|長條)/],
  },
  {
    question: "地面交收同送貨上門有咩分別",
    aliases: [/地面交收.{0,12}(?:送貨上門|上樓).{0,8}(?:分別|不同)/, /(?:分別|不同).{0,12}地面交收.{0,12}(?:送貨上門|上樓)/],
  },
  {
    question: "地面交收會唔會送入屋或者課室",
    aliases: [/地面交收.{0,10}(?:入屋|上樓|課室|搬運)/],
  },
  {
    question: "收貨時仲使唔使畀運費司機",
    aliases: [/(?:司機|收貨).{0,8}(?:運費|再畀|再付款)/, /(?:運費|再畀).{0,8}(?:司機|收貨)/],
    excluded: /未入帳|沒入帳|扣款|付款失敗|重複付款/,
  },
  {
    question: "打風落雨會唔會送",
    aliases: [/(?:打風|8號|八號|黑雨|惡劣天氣).{0,10}(?:送貨|安排|改期)/],
  },
  {
    question: "cashdollar有效期幾耐",
    aliases: [/(?:cashdollar|積分).{0,8}(?:有效期|到期|幾耐)/],
  },
  {
    question: "冇登記會員有冇生日甜品",
    aliases: [/(?:非會員|冇登記|未註冊).{0,8}(?:生日甜品|生日禮遇)/],
  },
  {
    question: "會員註冊網址係咩",
    aliases: [/(?:註冊|登記|register).{0,8}(?:會員|帳戶|網址|連結)/, /(?:會員|帳戶).{0,8}(?:註冊|登記|register)/],
  },
  {
    question: "忘記會員密碼點算",
    aliases: [/忘記密碼|重設密碼|resetpassword/],
  },
  {
    question: "點樣修改會員個人資料",
    aliases: [/(?:會員|帳戶).{0,8}(?:修改資料|改資料|個人資料)/, /(?:修改|更改).{0,8}(?:會員|帳戶).{0,8}資料/],
    excluded: /(?:訂單|落單).{0,8}(?:地址|資料)|(?:改|更改).{0,8}(?:送貨地址|訂單)/,
  },
  {
    question: "最新優惠可以喺邊度睇",
    aliases: [/最新優惠|promotion|優惠頁/],
    excluded: /優惠碼.{0,8}(?:有效|用唔用得|失效)/,
  },
];

// Very broad queries are unsafe for semantic fallback because almost any
// retrieved FAQ could appear relevant without enough customer context.
const FAQ_MODEL_FALLBACK_GENERIC_QUERIES = new Set([
  "付款", "送貨", "餐牌", "地址", "網站", "訂餐",
  "payment", "delivery", "address", "website",
]);

function strongPublishedFaqMatch(query: string, hit: CustomerServiceFaqHit) {
  const left = normalizedFaqText(query);
  const right = normalizedFaqText(hit.question);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 5 &&
    Math.abs(left.length - right.length) <= 5 &&
    (left.includes(right) || right.includes(left))) return true;
  const rule = FAQ_DIRECT_MATCH_RULES.find(
    (candidate) => normalizedFaqText(candidate.question) === right ||
      candidate.aliases.some((alias) => alias.test(right)),
  );
  if (!rule || rule.excluded?.test(left)) return false;
  return rule.aliases.some((alias) => alias.test(left));
}

function resetPilotConversation(conversation: CustomerServiceConversation) {
  return nextConversation(conversation, {
    state: "identifying",
    selected_order_id: null,
    handoff_at: null,
    pending_request: null,
    active_goal: null,
    handoff_kind: null,
    handoff_urgent: false,
    handoff_quote_id: null,
    workflow_slots: {},
    workflow_version: 1,
    suspended_goals: [],
  });
}

function suspendPilotConversation(
  conversation: CustomerServiceConversation,
  goal: CustomerServicePilotGoal,
) {
  const snapshot: CustomerServiceTaskSnapshot = {
    goal,
    state: conversation.state,
    selectedOrderId: conversation.selected_order_id,
    handoffAt: conversation.handoff_at,
    pendingRequest: conversation.pending_request,
    workflowSlots: conversation.workflow_slots ?? {},
    handoffKind: conversation.handoff_kind ?? null,
    handoffUrgent: Boolean(conversation.handoff_urgent),
    handoffQuoteId: conversation.handoff_quote_id ?? null,
  };
  return nextConversation(resetPilotConversation(conversation), {
    suspended_goals: [...(conversation.suspended_goals ?? []), snapshot].slice(-3),
  });
}

function restoreSuspendedConversation(conversation: CustomerServiceConversation) {
  const stack = [...(conversation.suspended_goals ?? [])];
  const snapshot = stack.pop();
  if (!snapshot) return null;
  return nextConversation(conversation, {
    state: snapshot.state,
    selected_order_id: snapshot.selectedOrderId,
    handoff_at: snapshot.handoffAt,
    pending_request: snapshot.pendingRequest,
    active_goal: snapshot.goal,
    workflow_slots: snapshot.workflowSlots,
    handoff_kind: snapshot.handoffKind,
    handoff_urgent: snapshot.handoffUrgent,
    handoff_quote_id: snapshot.handoffQuoteId,
    suspended_goals: stack,
  });
}

function normalizedDialogControl(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？、,.!?]/g, "");
}

function latestBurstMessage(value: string) {
  const latest = value.trim().split(/\r?\n/).at(-1) || value;
  return latest.replace(/^\[訊息\s+\d+\]\s*/, "").trim();
}

function isCancelCurrentTaskMessage(value: string) {
  const latest = latestBurstMessage(value);
  if (latest !== value.trim() && isCancelCurrentTaskMessage(latest)) return true;
  const text = normalizedDialogControl(value);
  if (!text) return false;
  if (/^(取消|撤回|算了|算啦|當我冇講|当我没说)$/.test(text)) return true;
  if (/(?:取消|撤回|停止).*(?:訂餐|订餐|落單|下单|查單|查单|查詢|查询|報價|报价|到會|到会|修改|更改|改期|申請|申请|請求|请求|要求|操作|流程)/.test(text)) return true;
  if (/(?:訂餐|订餐|落單|下单|查單|查单|查詢|查询|報價|报价|到會|到会|修改|更改|改期|申請|申请).*(?:取消|撤回|停止|唔使|不用|不要)/.test(text)) return true;
  return /(?:唔使|不用|不要)(?:再)?(?:訂|订|落單|下单|查|查單|查单|報價|报价|改|修改|更改|改期|取消|處理|处理)(?:啦|了)?$/.test(text);
}

function isExplicitPreviousHandoffCancellation(value: string) {
  const latest = latestBurstMessage(value);
  if (latest !== value.trim() && isExplicitPreviousHandoffCancellation(latest)) return true;
  const text = value.trim().replace(/[\s，。！？、,.!?]/g, "");
  return /(?:取消|撤回).*(?:之前|先前|上次|頭先|刚才|剛才).*(?:訂單|订单)?(?:修改|更改|改期|申請|申请)/.test(text);
}

/** When false, WhatsApp bot skips asking for order email before lookup/handoff. */
const ORDER_EMAIL_IDENTITY_VERIFICATION_ENABLED = false;

function identityChallengeReply(order: CustomerServiceOrder) {
  return sanitizeOutboundReply(
    `為保障訂單私隱，請輸入訂單 ${order.order_number || ""} 落單時使用的完整電郵地址作核實。`,
  );
}

function identityFailedReply(attempts: number) {
  return sanitizeOutboundReply(
    attempts >= 3
      ? "核實未成功，請重新提供訂單號碼再試；如仍有問題，可以要求真人協助。"
      : "電郵資料未能核實，請確認後重新輸入落單時使用的完整電郵地址。",
  );
}

function hasVerifiedIdentity(conversation: CustomerServiceConversation) {
  if (!ORDER_EMAIL_IDENTITY_VERIFICATION_ENABLED) return true;
  if (!conversation.identity_verified_at) return false;
  return Date.now() - new Date(conversation.identity_verified_at).getTime() < 30 * 60 * 1_000;
}

function parseLookupPendingRequest(pendingRequest: string | null) {
  if (!pendingRequest?.startsWith("lookup:")) return ["summary"];
  const allowed = new Set([
    "summary",
    "delivery_date",
    "status",
    "items",
    "address",
    "receipt",
  ]);
  const fields = pendingRequest.slice("lookup:".length)
    .split(",")
    .map((field) => field.trim())
    .filter((field) => allowed.has(field));
  return fields.length ? fields : ["summary"];
}

async function lookupVerifiedOrderReply(
  deps: CustomerServiceBotDeps,
  phone: string,
  order: CustomerServiceOrder,
  requestedFields: string[],
) {
  let items: CustomerServiceOrderItem[] = [];
  let itemLookupFailed = false;
  if (requestedFields.includes("items")) {
    try {
      items = await deps.lookupOrderItems(phone, order.order_id);
    } catch (error) {
      itemLookupFailed = true;
      console.error("customer service order item lookup failed", error);
    }
  }
  return {
    reply: lookupRequestedOrderReply(order, items, {
      requestedFields,
      itemLookupFailed,
    }),
    failureReason: itemLookupFailed ? "order_items_lookup_failed" : undefined,
  };
}

function beginOrderVerification(
  order: CustomerServiceOrder,
  conversation: CustomerServiceConversation,
  pendingRequest: string,
  usedModel: boolean,
): BotTurn {
  return {
    reply: identityChallengeReply(order),
    conversation: nextConversation(conversation, {
      state: "verifying_order",
      selected_order_id: order.order_id,
      pending_request: pendingRequest,
      identity_verification_order_id: order.order_id,
      identity_verification_attempts: 0,
      active_goal: pendingRequest.startsWith("handoff:") ? "order_change" : null,
    }),
    wroteInquiry: false,
    notified: false,
    usedModel,
  };
}

async function finishOrderHandoff(
  deps: CustomerServiceBotDeps,
  phone: string,
  order: CustomerServiceOrder,
  request: string,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  await deps.queueHandoff({
    phone,
    quoteId: order.order_id,
    orderNumber: order.order_number,
    summary: `客戶要求人工處理：${request || "更改訂單"}`,
    kind: "order_handoff",
  });
  return {
    reply: handoffOrderSelectedReply(order.order_number || "（未有單號）"),
    conversation: nextConversation(conversation, {
      state: "awaiting_human",
      selected_order_id: order.order_id,
      handoff_at: new Date().toISOString(),
      pending_request: null,
      active_goal: "order_change",
      handoff_kind: "order_change",
      handoff_urgent: false,
      handoff_quote_id: null,
    }),
    wroteInquiry: false,
    notified: false,
    queuedHandoff: true,
    usedModel: false,
  };
}

async function replyOrderHandoff(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
  request: string,
): Promise<BotTurn> {
  const orders = (await deps.lookupOrders(phone)).filter(isUndeliveredOrder);
  const pendingRequest = conversation.pending_request?.trim() || request.trim();
  if (classified.orderNumber) {
    const requested = normalizeCustomerServiceOrderNumber(
      classified.orderNumber,
    );
    const selected = orders.find(
      (order) =>
        normalizeCustomerServiceOrderNumber(order.order_number) === requested,
    );
    if (selected && !hasVerifiedIdentity(conversation))
      return beginOrderVerification(
        selected,
        conversation,
        `handoff:${pendingRequest}`,
        classified.usedModel,
      );
    if (selected)
      return finishOrderHandoff(
        deps,
        phone,
        selected,
        pendingRequest,
        conversation,
      );
  }
  if (orders.length) {
    return {
      reply: handoffOrderListReply(pendingRequest, orders),
      conversation: nextConversation(conversation, {
        state: "picking_handoff_order",
        selected_order_id: null,
        pending_request: pendingRequest,
        active_goal: "order_change",
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }
  await deps.queueHandoff({
    phone,
    quoteId: null,
    orderNumber: null,
    summary: `客戶要求人工處理，但未找到未送貨訂單：${pendingRequest || "更改訂單"}`,
    kind: "order_handoff",
  });
  return {
    reply: handoffNoOpenOrderReply(),
    conversation: nextConversation(conversation, {
      state: "awaiting_human",
      selected_order_id: null,
      handoff_at: new Date().toISOString(),
      pending_request: null,
      active_goal: "order_change",
      handoff_kind: "order_change",
      handoff_urgent: false,
      handoff_quote_id: null,
    }),
    wroteInquiry: false,
    notified: false,
    queuedHandoff: true,
    usedModel: false,
  };
}

async function replyLookup(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  const orders = await deps.lookupOrders(phone);
  const requestedFields = conversation.pending_request?.startsWith("lookup:")
    ? parseLookupPendingRequest(conversation.pending_request)
    : classified.requestedFields?.length
      ? classified.requestedFields
      : ["summary"];
  if (classified.orderNumber) {
    const requestedOrderNumber = normalizeCustomerServiceOrderNumber(
      classified.orderNumber,
    );
    const selected = orders.find(
      (order) =>
        normalizeCustomerServiceOrderNumber(order.order_number) ===
        requestedOrderNumber,
    );
    if (selected) {
      if (!hasVerifiedIdentity(conversation)) {
        return beginOrderVerification(
          selected,
          conversation,
          `lookup:${requestedFields.join(",")}`,
          classified.usedModel,
        );
      }
      const result = await lookupVerifiedOrderReply(
        deps,
        phone,
        selected,
        requestedFields,
      );
      return {
        reply: result.reply,
        conversation: nextConversation(conversation, {
          state: "identifying",
          selected_order_id: selected.order_id,
          pending_request: null,
        }),
        wroteInquiry: false,
        notified: false,
        usedModel: classified.usedModel,
        failureReason: result.failureReason,
      };
    }
    return {
      reply: lookupNotFoundReply(classified.orderNumber),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  const selectedOrder = conversation.selected_order_id
    ? orders.find((order) => order.order_id === conversation.selected_order_id)
    : null;
  if (selectedOrder && hasVerifiedIdentity(conversation)) {
    const result = await lookupVerifiedOrderReply(
      deps,
      phone,
      selectedOrder,
      requestedFields,
    );
    return {
      reply: result.reply,
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: selectedOrder.order_id,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      failureReason: result.failureReason,
    };
  }
  if (orders.length === 1) {
    if (!hasVerifiedIdentity(conversation)) {
      return beginOrderVerification(
        orders[0],
        conversation,
        `lookup:${requestedFields.join(",")}`,
        classified.usedModel,
      );
    }
    const result = await lookupVerifiedOrderReply(
      deps,
      phone,
      orders[0],
      requestedFields,
    );
    return {
      reply: result.reply,
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: orders[0].order_id,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      failureReason: result.failureReason,
    };
  }
  if (orders.length > 1) {
    return {
      reply: lookupListReply(orders),
      conversation: nextConversation(conversation, {
        state: "picking_order",
        selected_order_id: null,
        pending_request: `lookup:${requestedFields.join(",")}`,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  return {
    reply: lookupNoOrdersReply(classified.orderNumber || ""),
    conversation: nextConversation(conversation, {
      state: "identifying",
      selected_order_id: null,
      pending_request: null,
      active_goal: null,
    }),
    wroteInquiry: false,
    notified: false,
    usedModel: classified.usedModel,
  };
}

async function replyOrderVerification(
  deps: CustomerServiceBotDeps,
  phone: string,
  text: string,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  const orderId = conversation.identity_verification_order_id || conversation.selected_order_id;
  if (!orderId) {
    return {
      reply: identityFailedReply(3),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
        pending_request: null,
        identity_verification_attempts: 0,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verification_context_missing",
    };
  }
  const verified = await deps.verifyOrderIdentity(phone, orderId, text.trim());
  if (!verified) {
    const attempts = (conversation.identity_verification_attempts ?? 0) + 1;
    return {
      reply: identityFailedReply(attempts),
      conversation: nextConversation(conversation, {
        state: attempts >= 3 ? "identifying" : "verifying_order",
        selected_order_id: attempts >= 3 ? null : orderId,
        pending_request: attempts >= 3 ? null : conversation.pending_request,
        identity_verification_order_id: attempts >= 3 ? null : orderId,
        identity_verification_attempts: attempts,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verification_failed",
    };
  }
  const orders = await deps.lookupOrders(phone);
  const selected = orders.find((order) => order.order_id === orderId);
  if (!selected) {
    return {
      reply: identityFailedReply(3),
      conversation: nextConversation(conversation, { state: "identifying", selected_order_id: null }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verified_order_missing",
    };
  }
  const verifiedConversation = nextConversation(conversation, {
    state: "identifying",
    selected_order_id: orderId,
    identity_verified_at: new Date().toISOString(),
    identity_verification_method: "order_email",
    identity_verification_order_id: orderId,
    identity_verification_attempts: 0,
  });
  const pending = conversation.pending_request || "lookup";
  if (pending.startsWith("handoff:")) {
    return finishOrderHandoff(
      deps,
      phone,
      selected,
      pending.slice("handoff:".length),
      verifiedConversation,
    );
  }
  const result = await lookupVerifiedOrderReply(
    deps,
    phone,
    selected,
    parseLookupPendingRequest(pending),
  );
  return {
    reply: result.reply,
    conversation: nextConversation(verifiedConversation, { pending_request: null }),
    wroteInquiry: false,
    notified: false,
    usedModel: false,
    failureReason: result.failureReason,
  };
}

async function replyCollect(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
  text: string,
): Promise<BotTurn> {
  const awaitingConfirmation =
    conversation.pending_request === "confirm:catering_inquiry";
  const normalizedControl = latestBurstMessage(text)
    .toLowerCase()
    .replace(/[\s，。！？、,.!?「」'\"]/g, "");
  const confirmationDenied = awaitingConfirmation && (
    classified.dialogAction === "deny" ||
    /^(?:唔確認|不確認|否|唔好|不用|不要|no|取消|算了|算啦)$/.test(
      normalizedControl,
    )
  );
  const confirmationGranted = awaitingConfirmation && !confirmationDenied && (
    classified.dialogAction === "confirm" ||
    /^(?:確認|確定|係|是|好|可以|ok|okay|yes|確認建立|確認記錄|確定建立|確定記錄)$/.test(
      normalizedControl,
    )
  );

  if (confirmationDenied) {
    const queued = conversation.state === "awaiting_human";
    if (queued) await deps.cancelHandoff(phone);
    const restored = restoreSuspendedConversation(conversation);
    return {
      reply: `${queued ? REPLIES.handoffCancelled : REPLIES.currentTaskCancelled}${
        restored ? " 已返回上一個未完成事項。" : ""
      }`,
      conversation: restored ?? resetPilotConversation(conversation),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: false,
      usedModel: classified.usedModel,
    };
  }

  const saved = conversation.workflow_slots ?? {};
  const previousNote = String(saved.note ?? "").trim();
  const incomingNote = confirmationGranted
    ? ""
    : (classified.slots.note || text).trim();
  const slots: InquirySlots = {
    eventDate: classified.slots.eventDate || String(saved.eventDate ?? ""),
    headcount: classified.slots.headcount || String(saved.headcount ?? ""),
    budget: classified.slots.budget || String(saved.budget ?? ""),
    dietary: classified.slots.dietary || String(saved.dietary ?? ""),
    cuisine: classified.slots.cuisine || String(saved.cuisine ?? ""),
    note: [previousNote, incomingNote]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join("\n")
      .slice(0, 2_000),
    anotherEvent: classified.slots.anotherEvent || Boolean(saved.anotherEvent),
  };
  if (!hasCollectableSlots(slots)) {
    return {
      reply:
        conversation.state === "collecting"
          ? configuredReply(deps, "collect_more", REPLIES.collectMore)
          : configuredReply(deps, "collect_prompt", REPLIES.collectPrompt),
      conversation: nextConversation(conversation, {
        state: "collecting",
        active_goal: "catering_inquiry",
        pending_request: null,
        workflow_slots: slots,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  if (!confirmationGranted) {
    const summary = [
      slots.eventDate && `活動日期：${slots.eventDate}`,
      slots.headcount && `人數：${slots.headcount}人`,
      slots.budget && `預算：${slots.budget}`,
      slots.dietary && `飲食要求：${slots.dietary}`,
      slots.cuisine && `餐飲偏好：${slots.cuisine}`,
    ].filter(Boolean).join("；");
    return {
      reply: `我已整理以下到會資料：${summary}。如果你想我建立查詢並通知客服，請回覆「確認」；未確認前系統唔會記錄或通知同事。`,
      conversation: nextConversation(conversation, {
        state: conversation.state === "awaiting_human"
          ? "awaiting_human"
          : "collecting",
        active_goal: "catering_inquiry",
        pending_request: "confirm:catering_inquiry",
        workflow_slots: slots,
      }),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: false,
      toolKeys: [],
      usedModel: classified.usedModel,
    };
  }
  const sameDayDemand = isSameDayOrderDemand(text);
  if (!slots.eventDate && sameDayDemand) {
    slots.eventDate = hongKongCalendarDate();
  }
  const written = await deps.writeInquiry(
    phone,
    slots,
    slots.anotherEvent,
  );
  const summary = [
    slots.eventDate && `日期 ${slots.eventDate}`,
    slots.headcount && `人數 ${slots.headcount}`,
    slots.budget,
    slots.dietary,
    slots.cuisine,
  ]
    .filter(Boolean)
    .join("，");
  const urgent = sameDayDemand || isHongKongCalendarDateToday(slots.eventDate);
  await deps.queueHandoff({
    phone,
    quoteId: written.quote_id,
    orderNumber: written.order_number,
    summary: urgent ? `【緊急即日】${summary}` : summary,
    kind: "inquiry",
    urgent,
  });
  const restored = deps.workflowAutoResume?.catering_inquiry === false
    ? null
    : restoreSuspendedConversation(conversation);
  const next = urgent
    ? nextConversation(conversation, {
        state: "awaiting_human",
        selected_order_id: null,
        handoff_at: conversation.handoff_at ?? new Date().toISOString(),
        pending_request: null,
        active_goal: "catering_inquiry",
        workflow_slots: slots,
        handoff_kind: "same_day_catering",
        handoff_urgent: true,
        handoff_quote_id: written.quote_id,
      })
    : restored ?? resetPilotConversation(conversation);
  const isSameDaySupplement = conversation.state === "awaiting_human" &&
    conversation.handoff_kind === "same_day_catering";
  return {
    reply: `${
      urgent
        ? isSameDaySupplement
          ? REPLIES.handoffQueuedUrgent
          : configuredReply(deps, "same_day_urgent", REPLIES.sameDayUrgent)
        : configuredReply(deps, "collect_done", REPLIES.collectDone)
    }${
      restored ? " 已返回上一個未完成事項。" : ""
    }`,
    conversation: next,
    wroteInquiry: true,
    notified: urgent,
    queuedHandoff: true,
    toolKeys: ["write_inquiry"],
    usedModel: classified.usedModel,
  };
}

async function replyFaq(
  deps: CustomerServiceBotDeps,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
  query: string,
): Promise<BotTurn> {
  const hits = await deps.searchFaqs(query);
  const approvedHits = hits.filter((hit) => strongPublishedFaqMatch(query, hit));
  // Text rules remain a fast path, not an allow-list for newly published knowledge.
  // Weak candidates may only produce a cited model answer, never a raw fallback.
  const normalizedQuery = normalizedFaqText(query);
  const genericQuery = FAQ_MODEL_FALLBACK_GENERIC_QUERIES.has(normalizedQuery.toLowerCase());
  const modelCandidates = approvedHits.length ? approvedHits : genericQuery ? [] : hits.filter((hit) => {
    const question = normalizedFaqText(hit.question);
    return !FAQ_DIRECT_MATCH_RULES.some((rule) =>
      (normalizedFaqText(rule.question) === question || rule.aliases.some((alias) => alias.test(question))) &&
      rule.excluded?.test(normalizedQuery)
    );
  });
  if (deps.answerFaqWithModel && modelCandidates.length) {
    try {
      const modelAnswer = await deps.answerFaqWithModel(query, modelCandidates);
      const answer =
        typeof modelAnswer === "string" ? modelAnswer : modelAnswer?.answer;
      const returnedSourceIds = typeof modelAnswer === "object" && modelAnswer ? modelAnswer.sourceIds : [];
      const citedIds = returnedSourceIds.filter((id) => modelCandidates.some((hit) => hit.id === id));
      const validFallbackSources = citedIds.length > 0 && citedIds.length === returnedSourceIds.length;
      if (answer && (approvedHits.length > 0 || validFallbackSources)) {
        const excludeIds = citedIds.length
          ? citedIds
            : approvedHits[0]?.id
            ? [approvedHits[0].id]
            : [];
        return {
          reply: faqReply(answer),
          conversation,
          wroteInquiry: false,
          notified: false,
          usedModel: true,
          faqSourceIds: citedIds,
          relatedFaqs: selectRelatedFaqs(modelCandidates, excludeIds),
          model:
            typeof modelAnswer === "string"
              ? null
              : (modelAnswer?.model ?? null),
        };
      }
    } catch (error) {
      console.error(
        "customer-service AI answer failed",
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
  }
  const deterministicHit = approvedHits[0];
  if (deterministicHit?.answer) {
    return {
      reply: faqReply(deterministicHit.answer),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      faqSourceIds: [deterministicHit.id],
      relatedFaqs: selectRelatedFaqs(approvedHits, [deterministicHit.id]),
    };
  }
  return {
    reply: configuredReply(deps, "no_faq", REPLIES.noFaq),
    conversation,
    wroteInquiry: false,
    notified: false,
    usedModel: classified.usedModel,
    failureReason: "faq_not_found",
  };
}

export async function handleCustomerServiceTurn({
  phone,
  text,
  conversation,
  deps,
  classify = classifyCustomerServiceMessage,
}: {
  phone: string;
  text: string;
  conversation: CustomerServiceConversation;
  deps: CustomerServiceBotDeps;
  classify?: (text: string) => ClassifiedMessage | Promise<ClassifiedMessage>;
}): Promise<BotTurn> {
  if (conversation.state === "human_owned") {
    return {
      reply: null,
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }

  // Delivery-confirmation template button (e.g. 「確定訂單」): acknowledge silently.
  // Must run before awaiting_human supplement / LOOKUP("訂單") so we neither reply nor re-queue.
  if (isOrderConfirmationAcknowledgement(text)) {
    return {
      reply: null,
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }

  const hasActiveTask = conversation.state !== "identifying" ||
    Boolean(conversation.pending_request);
  const explicitPreviousCancellation = isExplicitPreviousHandoffCancellation(text);
  if (
    (hasActiveTask && isCancelCurrentTaskMessage(text))
    || explicitPreviousCancellation
  ) {
    const isQueuedHandoff = conversation.state === "awaiting_human" || explicitPreviousCancellation;
    if (isQueuedHandoff) {
      const cancelled = await deps.cancelHandoff(phone);
      if (!cancelled && conversation.state !== "awaiting_human") {
        return {
          reply: REPLIES.noPendingHandoff,
          conversation,
          wroteInquiry: false,
          notified: false,
          queuedHandoff: false,
          usedModel: false,
        };
      }
    }
    return {
      reply: isQueuedHandoff ? REPLIES.handoffCancelled : REPLIES.currentTaskCancelled,
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
        handoff_at: null,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: false,
      usedModel: false,
    };
  }

  if (
    conversation.state !== "awaiting_human" &&
    conversation.pending_request !== "confirm:catering_inquiry" &&
    deps.replyTemplates?.acknowledgement &&
    isCustomerServiceEmojiAcknowledgement(text)
  ) {
    return {
      reply: configuredReply(deps, "acknowledgement", "收到，多謝你。"),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "acknowledgement",
      toolKeys: [],
    };
  }

  if (
    conversation.pending_request === "confirm:catering_inquiry" &&
    /^(?:確認|確定|係|是|好|可以|ok|okay|yes|唔確認|不確認|否|唔好|不用|不要|no|取消|算了|算啦)[!！。.？?\s]*$/iu.test(text.trim())
  ) {
    return await replyCollect(deps, phone, await classify(text), conversation, text);
  }

  if (
    conversation.state !== "awaiting_human" &&
    deps.replyTemplates?.thanks &&
    isCustomerServiceThanks(text)
  ) {
    return {
      reply: configuredReply(deps, "thanks", "唔使客氣，多謝你。"),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "thanks",
      toolKeys: [],
    };
  }

  if (
    conversation.state !== "awaiting_human" &&
    deps.replyTemplates?.packaging_request &&
    isTakeawayPackagingRequest(text) &&
    !extractOrderNumber(text)
  ) {
    return {
      reply: configuredReply(
        deps,
        "packaging_request",
        "請提供需要嘅外賣盒／餐具種類同數量。",
      ),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "search_faq",
      toolKeys: [],
    };
  }

  if (
    conversation.state !== "awaiting_human" &&
    deps.replyTemplates?.complaint_handoff &&
    isProductQualityComplaint(text)
  ) {
    await deps.queueHandoff({
      phone,
      quoteId: null,
      orderNumber: extractOrderNumber(text) || null,
      summary: `產品質素投訴：${text.trim().slice(0, 500)}`,
      kind: "order_handoff",
      urgent: false,
    });
    return {
      reply: configuredReply(
        deps,
        "complaint_handoff",
        "唔好意思出現呢個情況。請傳送照片及訂單編號，客服同事會跟進。",
      ),
      conversation: nextConversation(conversation, {
        state: "awaiting_human",
        handoff_at: new Date().toISOString(),
        handoff_kind: "general",
        handoff_urgent: false,
      }),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: true,
      usedModel: false,
      intentKey: "complaint_refund",
      toolKeys: ["notify_internal"],
    };
  }

  if (conversation.state === "verifying_order") {
    if (ORDER_EMAIL_IDENTITY_VERIFICATION_ENABLED) {
      return await replyOrderVerification(deps, phone, text, conversation);
    }
    // Challenge disabled: clear stuck verification and resume pending request.
    const orderId =
      conversation.identity_verification_order_id || conversation.selected_order_id;
    const orders = await deps.lookupOrders(phone);
    const selected = orderId
      ? orders.find((order) => order.order_id === orderId)
      : null;
    if (selected) {
      const resumed = nextConversation(conversation, {
        state: "identifying",
        selected_order_id: selected.order_id,
        identity_verified_at: new Date().toISOString(),
        identity_verification_method: null,
        identity_verification_order_id: null,
        identity_verification_attempts: 0,
      });
      const pending = conversation.pending_request || "lookup";
      if (pending.startsWith("handoff:")) {
        return finishOrderHandoff(
          deps,
          phone,
          selected,
          pending.slice("handoff:".length),
          resumed,
        );
      }
      const result = await lookupVerifiedOrderReply(
        deps,
        phone,
        selected,
        parseLookupPendingRequest(pending),
      );
      return {
        reply: result.reply,
        conversation: nextConversation(resumed, { pending_request: null }),
        wroteInquiry: false,
        notified: false,
        usedModel: false,
        failureReason: result.failureReason,
      };
    }
    return {
      reply: lookupNoOrdersReply(""),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
        identity_verification_order_id: null,
        identity_verification_attempts: 0,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verification_context_missing",
    };
  }

  if (
    conversation.state === "awaiting_human" &&
    (conversation.handoff_kind === "general" ||
      (!conversation.handoff_kind && !conversation.active_goal &&
        !conversation.selected_order_id))
  ) {
    return {
      reply: null,
      conversation,
      wroteInquiry: false,
      notified: false,
      queuedHandoff: true,
      usedModel: false,
    };
  }

  if (isCustomerServiceGreeting(text)) {
    return {
      reply: configuredReply(deps, "help", REPLIES.help),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }

  const brandIdentityName = customerServiceBrandIdentityName(text);
  if (brandIdentityName) {
    return {
      reply: `你好，係呀，我哋係 ${brandIdentityName}，請問有咩可以幫到你？`,
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      intentKey: "brand_identity",
      toolKeys: [],
      failureReason: null,
    };
  }

  // Same-day / urgent order demand must not be swallowed by Express FAQ and
  // must notify staff immediately (not deferred to the 09:00 HKT digest).
  // If date/headcount are already present, continue into collect so a quote is written.
  if (
    isSameDayOrderDemand(text) &&
    !hasCollectableSlots(extractInquirySlots(text))
  ) {
    await deps.queueHandoff({
      phone,
      quoteId: null,
      orderNumber: null,
      summary: `【緊急即日】客戶即日訂餐需求：${text.trim().slice(0, 500)}`,
      kind: "inquiry",
      urgent: true,
    });
    return {
      reply: configuredReply(deps, "same_day_urgent", REPLIES.sameDayUrgent),
      conversation: nextConversation(conversation, {
        state: "awaiting_human",
        handoff_at: new Date().toISOString(),
        active_goal: "catering_inquiry",
        workflow_slots: {
          ...(conversation.workflow_slots ?? {}),
          eventDate: hongKongCalendarDate(),
          note: text.trim().slice(0, 2_000),
        },
        handoff_kind: "same_day_catering",
        handoff_urgent: true,
        handoff_quote_id: null,
      }),
      wroteInquiry: false,
      notified: true,
      queuedHandoff: true,
      usedModel: false,
      intentKey: "kitchen_confirmation",
      toolKeys: ["notify_internal"],
      failureReason: null,
    };
  }

  const faqSearchCache = new Map<string, Promise<CustomerServiceFaqHit[]>>();
  const searchFaqsOnce = (query: string) => {
    const key = normalizedFaqText(query);
    const existing = faqSearchCache.get(key);
    if (existing) return existing;
    const pending = deps.searchFaqs(query).catch((error) => {
      faqSearchCache.delete(key);
      throw error;
    });
    faqSearchCache.set(key, pending);
    return pending;
  };
  const cachedDeps: CustomerServiceBotDeps = {
    ...deps,
    searchFaqs: searchFaqsOnce,
  };

  const rawClassified = await classify(text);
  const asksHowToOrder = isOrderingInstructionsRequest(text) &&
    ["search_faq", "collect_inquiry"].includes(rawClassified.intent) &&
    !rawClassified.requiresHuman;
  // A direct how-to follow-up must not inherit the previous availability task.
  const modelClassified: ClassifiedMessage = asksHowToOrder
    ? { ...rawClassified, intent: "search_faq", configuredIntentKey: "search_faq",
      toolKey: "search_faqs", needsClarification: false, clarificationQuestion: undefined }
    : rawClassified;
  // The current utterance is authoritative for the requested order fields.
  // This prevents recent context (for example, a previous dish lookup) from
  // making the model repeat the old field for a new delivery-time follow-up.
  const explicitRequestedFields = extractRequestedOrderFields(text);
  const selectedOrderItemFollowUp = Boolean(
    conversation.selected_order_id &&
      explicitRequestedFields.includes("items") &&
      isSelectedOrderItemFollowUp(text),
  );
  const classified: ClassifiedMessage = selectedOrderItemFollowUp
    ? {
        ...modelClassified,
        intent: "lookup_order" as const,
        configuredIntentKey: "lookup_order",
        toolKey: "lookup_orders",
        requestedFields: ["items"],
        requiresHuman: false,
        needsClarification: false,
        clarificationQuestion: undefined,
      }
    : explicitRequestedFields.length
      ? { ...modelClassified, requestedFields: explicitRequestedFields }
      : modelClassified;
  const annotate = (turn: BotTurn): BotTurn => {
    const defaultTool = turn.failureReason === "availability_date_missing" ? null : classified.configuredIntentKey === "delivery_availability"
      ? "check_order_intake"
      : classified.intent === "lookup_order" ||
        classified.intent === "handoff_order"
      ? "lookup_orders"
      : classified.intent === "search_faq"
        ? "search_faqs"
        : null;
    return {
      ...turn,
      intentKey:
        turn.intentKey ?? classified.configuredIntentKey ?? classified.intent,
      confidence: classified.confidence,
      toolKeys: [...new Set([
        ...(turn.toolKeys ?? []),
        defaultTool,
      ].filter((tool): tool is string => Boolean(tool)))],
      failureReason: turn.failureReason ?? null,
      model: turn.model ?? classified.model ?? null,
      dialogAction: classified.dialogAction,
    };
  };

  // Interpret the whole message before consuming a time or a product selection.
  // Complaints, order changes and unrelated tasks must keep their normal routing.
  const canContinueAvailability =
    (classified.intent === "search_faq" || classified.intent === "collect_inquiry") &&
    !classified.requiresHuman && !classified.needsClarification &&
    classified.dialogAction !== "switch_task" && classified.dialogAction !== "resume_previous" &&
    (!classified.configuredIntentKey || ["delivery_availability", "collect_inquiry"].includes(classified.configuredIntentKey));
  const isTimeFollowUp = isStandaloneDeliveryTime(text) ||
    classified.configuredIntentKey === "delivery_availability" ||
    Boolean(resolveCustomerServiceDeliveryDate(text)) ||
    ["add_information", "continue_current", "correct_previous"].includes(classified.dialogAction ?? "");
  if (canContinueAvailability && isTimeFollowUp) {
    const availabilityFollowUp = await replyAvailabilityTimeFollowUp(deps, conversation, text);
    if (availabilityFollowUp) return annotate({ ...availabilityFollowUp, usedModel: classified.usedModel });
  }

  const activeGoal = inferCustomerServicePilotGoal({
    activeGoal: conversation.active_goal,
    state: conversation.state,
    pendingRequest: conversation.pending_request,
    selectedOrderId: conversation.selected_order_id,
  });
  const pilotAction = await decideCustomerServicePilotAction({
    activeGoal,
    conversationState: conversation.state,
    classified,
  });
  const storedRecommendations = Array.isArray(
      conversation.workflow_slots?.orderIntakeRecommendations,
    )
    ? conversation.workflow_slots.orderIntakeRecommendations.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return typeof record.name === "string"
        ? [{
          name: record.name,
          url: typeof record.url === "string" ? record.url : null,
        }]
        : [];
    })
    : [];
  const storedSelection = findOrderIntakeRecommendation(text, storedRecommendations);
  const storedAllowedTerms = Array.isArray(conversation.workflow_slots?.orderIntakeAllowedProductTerms)
    ? conversation.workflow_slots.orderIntakeAllowedProductTerms.filter((value): value is string => typeof value === "string")
    : [];
  const storedProductTerm = storedAllowedTerms.find((term) => normalizedFaqText(text).includes(normalizedFaqText(term)));
  const storedChannelName = typeof conversation.workflow_slots?.orderIntakeRecognizedChannelName === "string"
    ? conversation.workflow_slots.orderIntakeRecognizedChannelName
    : "";
  const restrictedDate = resolveCustomerServiceDeliveryDate(text) || String(conversation.workflow_slots?.eventDate ?? "");
  if (
    canContinueAvailability && conversation.state === "collecting" &&
    conversation.pending_request === "特別接單安排人工覆核" &&
    (storedSelection || storedProductTerm) && restrictedDate && deps.checkOrderIntakeAvailability
  ) {
    let intake: CustomerServiceOrderIntakeAvailability = { status: "unknown" };
    try {
      intake = await deps.checkOrderIntakeAvailability(
        restrictedDate,
        [storedChannelName, text].filter(Boolean).join(" "),
        { deliveryTime: extractCustomerServiceClockTime(text) || String(conversation.workflow_slots?.deliveryTime ?? "") || null },
      );
    } catch (error) {
      console.error(
        "customer-service restricted catalog selection check failed",
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
    const selected = intake.selectedRecommendation ?? findOrderIntakeRecommendation(
      text,
      intake.recommendations ?? [],
    );
    if (!selected && storedProductTerm && intake.recommendations?.length) {
      return annotate({
        reply: orderIntakeAvailabilityReply(restrictedDate, intake, extractCustomerServiceClockTime(text)),
        conversation: nextConversation(conversation, {
          workflow_slots: { ...conversation.workflow_slots, orderIntakeRecommendations: intake.recommendations },
        }),
        wroteInquiry: false, notified: false, usedModel: classified.usedModel,
        intentKey: "delivery_availability", toolKeys: ["check_order_intake"],
      });
    }
    if (intake.status === "available" && selected) {
      if (intake.requiresTime) {
        return annotate({
          reply: `${selected.name}符合產品條件，但當日有時段限制。請問希望幾點送到？`,
          conversation: nextConversation(conversation, {
            pending_request: AVAILABILITY_DELIVERY_TIME_PENDING,
            workflow_slots: { ...conversation.workflow_slots, eventDate: restrictedDate,
              availabilityQuestion: text, deliveryTime: null, orderIntakeRecommendations: intake.recommendations ?? [] },
          }),
          wroteInquiry: false, notified: false, usedModel: classified.usedModel,
          intentKey: "delivery_availability", toolKeys: ["check_order_intake"],
        });
      }
      return annotate({
        reply: [
          `${selected.name} 可以落單。`,
          selected.url ? `訂購連結：${selected.url}` : null,
          intake.message,
        ].filter(Boolean).join("\n"),
        conversation: resetPilotConversation(conversation),
        wroteInquiry: false,
        notified: false,
        queuedHandoff: false,
        usedModel: classified.usedModel,
        intentKey: "delivery_availability",
        toolKeys: ["check_order_intake"],
      });
    }
    if (intake.status === "manual_review") {
      return annotate({
        reply: orderIntakeAvailabilityReply(restrictedDate, intake),
        conversation: nextConversation(conversation, {
          workflow_slots: { ...conversation.workflow_slots, eventDate: restrictedDate,
            deliveryTime: extractCustomerServiceClockTime(text) || conversation.workflow_slots?.deliveryTime,
            orderIntakeRecommendations: intake.recommendations ?? [] },
        }),
        wroteInquiry: false,
        notified: false,
        queuedHandoff: false,
        usedModel: classified.usedModel,
        intentKey: "delivery_availability",
        toolKeys: ["check_order_intake"],
      });
    }
    return annotate({
      reply: `${deliveryDateLabel(restrictedDate)}嘅產品及接單安排暫時未能確認，請稍後再試，或回覆「請客服跟進」。`,
      conversation, wroteInquiry: false, notified: false, usedModel: classified.usedModel,
      intentKey: "delivery_availability", toolKeys: ["check_order_intake"], failureReason: "order_intake_unknown",
    });
  }
  const continuesRestrictedDateInquiry =
    conversation.state === "collecting" &&
    activeGoal === "catering_inquiry" &&
    pilotAction === "continue_catering" &&
    classified.configuredIntentKey === "delivery_availability";
  if (continuesRestrictedDateInquiry) {
    return annotate(
      await replyCollect(deps, phone, classified, conversation, text),
    );
  }

  if (
    classified.configuredIntentKey === "delivery_availability" ||
    (!classified.usedModel && isDeliveryAvailabilityQuestion(text)) ||
    (conversation.pending_request === "availability:date" && canContinueAvailability && Boolean(resolveCustomerServiceDeliveryDate(text)))
  ) {
    const requestedDate = resolveCustomerServiceDeliveryDate(text);
    if (!requestedDate) {
      return annotate({
        reply: "請問想查詢邊一日送貨？你可以提供日期，或者講「星期日」、「下星期日」。",
        conversation: nextConversation(conversation, { pending_request: "availability:date" }),
        wroteInquiry: false, notified: false, usedModel: classified.usedModel,
        intentKey: "delivery_availability", toolKeys: [], failureReason: "availability_date_missing",
      });
    }
    if (deps.checkOrderIntakeAvailability) {
      let intake: CustomerServiceOrderIntakeAvailability = { status: "unknown" };
      try {
        const deliveryTime = extractCustomerServiceClockTime(text);
        intake = deliveryTime
          ? await deps.checkOrderIntakeAvailability(requestedDate, text, { deliveryTime })
          : await deps.checkOrderIntakeAvailability(requestedDate, text);
      } catch (error) {
        console.error("customer-service order intake check failed", error instanceof Error ? error.message.slice(0, 200) : String(error));
      }
      const intakeConversation = intake.status === "manual_review"
        ? nextConversation(conversation, {
            state: "collecting",
            active_goal: "catering_inquiry",
            pending_request: "特別接單安排人工覆核",
            workflow_slots: {
              ...(conversation.workflow_slots ?? {}),
              eventDate: requestedDate,
              deliveryTime: extractCustomerServiceClockTime(text) || null,
              availabilityQuestion: text.trim().slice(0, 1_000),
              orderIntakeRecommendations: intake.recommendations ?? [],
              orderIntakeAllowedProductTerms: intake.allowedProductTerms ?? [],
              orderIntakeRecognizedChannelName: intake.recognizedChannelName ?? null,
              note: `接單規則需人工覆核：${text}`.slice(0, 1_000),
            },
          })
        : nextConversation(conversation, {
            pending_request: extractCustomerServiceClockTime(text) && !intake.requiresTime ? null : AVAILABILITY_DELIVERY_TIME_PENDING,
            workflow_slots: {
              ...(conversation.workflow_slots ?? {}),
              eventDate: requestedDate,
              deliveryTime: extractCustomerServiceClockTime(text) || null,
              availabilityQuestion: text.trim().slice(0, 1_000),
            },
          });
      return annotate({
        reply: orderIntakeAvailabilityReply(requestedDate, intake, extractCustomerServiceClockTime(text)), conversation: intakeConversation,
        wroteInquiry: false, notified: false, usedModel: classified.usedModel,
        intentKey: "delivery_availability", toolKeys: ["check_order_intake"],
        failureReason: intake.status === "unknown" ? "order_intake_unknown" : null,
      });
    }
    let availability: CustomerServiceDeliveryAvailability = "unknown";
    if (deps.checkDeliveryDateAvailability) {
      try {
        availability = await deps.checkDeliveryDateAvailability(requestedDate);
      } catch (error) {
        console.error(
          "customer-service delivery availability check failed",
          error instanceof Error ? error.message.slice(0, 200) : String(error),
        );
      }
    }
    return annotate({
      reply: deliveryAvailabilityReply(requestedDate, availability),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      intentKey: "delivery_availability",
      toolKeys: deps.checkDeliveryDateAvailability
        ? ["check_delivery_date"]
        : [],
      failureReason: availability === "unknown"
        ? "delivery_availability_unknown"
        : null,
    });
  }

  if (classified.needsClarification) {
    return annotate({
      reply: sanitizeOutboundReply(
        classified.clarificationQuestion ||
          "我想確認清楚：你係想繼續目前事項、取消目前事項，定係提出另一個要求？",
      ),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  if (pilotAction === "resume_previous") {
    const restored = restoreSuspendedConversation(conversation);
    return annotate({
      reply: restored
        ? "好，已返回上一個未完成事項，你可以繼續補充資料。"
        : "目前沒有暫停中的事項。你可以直接告訴我想查詢或處理甚麼。",
      conversation: restored ?? conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  if (pilotAction === "cancel_current") {
    const queued = conversation.state === "awaiting_human";
    if (queued) await deps.cancelHandoff(phone);
    const restored = restoreSuspendedConversation(conversation);
    return annotate({
      reply: `${queued ? REPLIES.handoffCancelled : REPLIES.currentTaskCancelled}${
        restored ? " 已返回上一個未完成事項。" : ""
      }`,
      conversation: restored ?? resetPilotConversation(conversation),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: false,
      usedModel: classified.usedModel,
    });
  }
  if (
    conversation.state === "awaiting_human" &&
    conversation.handoff_kind === "same_day_catering" &&
    pilotAction === "continue_catering"
  ) {
    return annotate(
      await replyCollect(deps, phone, classified, conversation, text),
    );
  }
  if (
    conversation.state === "awaiting_human" &&
    pilotAction === "continue_order_change"
  ) {
    await deps.queueHandoff({
      phone,
      quoteId: conversation.selected_order_id,
      orderNumber: null,
      summary: `客戶補充資料：${text.trim().slice(0, 500)}`,
      kind: "order_handoff",
    });
    return annotate({
      reply: REPLIES.handoffQueued,
      conversation,
      wroteInquiry: false,
      notified: false,
      queuedHandoff: true,
      usedModel: classified.usedModel,
    });
  }
  const routedConversation = activeGoal && (
      pilotAction === "start_order_change" ||
      pilotAction === "start_catering"
    )
    ? suspendPilotConversation(conversation, activeGoal)
    : conversation;
  if (
    conversation.state === "picking_handoff_order" &&
    pilotAction === "continue_order_change"
  ) {
    return annotate(
      await replyOrderHandoff(deps, phone, classified, conversation, text),
    );
  }
  if (conversation.state === "picking_order" && classified.orderNumber) {
    return annotate(await replyLookup(deps, phone, classified, conversation));
  }
  const highRiskIntent = classified.intent === "lookup_order" ||
    classified.intent === "handoff_order" ||
    classified.intent === "out_of_scope" ||
    classified.intent === "prompt_injection";
  const asksForMenu = classified.configuredIntentKey === "browse_menu" ||
    (classified.intent === "search_faq" && isBrandIntroductionRequest(text)) ||
    (!classified.usedModel && isMenuInformationRequest(text));
  if (
    !highRiskIntent &&
    !isSameDayOrderDemand(text) &&
    classified.intent === "search_faq"
  ) {
    const seasonalMenuQuery = asksForMenu
      ? customerServiceSeasonalMenuFaqQuery(text)
      : null;
    const catalogQuery = deps.searchCatalog &&
        asksForMenu && !seasonalMenuQuery
      ? customerServiceCatalogQuery(text, conversation.recent_messages)
      : "";
    if (catalogQuery) {
      try {
        const catalogHits = await deps.searchCatalog?.(catalogQuery);
        if (catalogHits?.[0]) {
          return annotate({
            reply: sanitizeOutboundReply(
              customerServiceCatalogReply(catalogHits[0]),
            ),
            imageUrl: catalogHits[0].imageUrl,
            conversation: routedConversation,
            wroteInquiry: false,
            notified: false,
            usedModel: classified.usedModel,
            intentKey: "browse_menu",
            toolKeys: ["search_catalog"],
            failureReason: null,
          });
        }
      } catch (error) {
        console.error(
          "customer-service catalog search failed",
          error instanceof Error ? error.message.slice(0, 200) : String(error),
        );
      }
    }

    try {
      const menuQuery = asksForMenu
        ? seasonalMenuQuery || customerServiceMenuFaqQuery(text)
        : "";
      const faqQuery = asksHowToOrder ? "點樣喺網站落單？" : asksForMenu ? menuQuery : text;
      const faqHits = await searchFaqsOnce(faqQuery);
      const preferredFaq = faqHits.find((hit) =>
        strongPublishedFaqMatch(faqQuery, hit)
      );
      if (preferredFaq) {
        return annotate({
          reply: seasonalMenuQuery
            ? sanitizeOutboundReply(preferredFaq.answer)
            : faqReply(preferredFaq.answer),
          conversation: routedConversation,
          wroteInquiry: false,
          notified: false,
          usedModel: classified.usedModel,
          intentKey: asksForMenu ? "browse_menu" : "search_faq",
          toolKeys: ["search_faqs"],
          faqSourceIds: [preferredFaq.id],
          relatedFaqs: selectRelatedFaqs(faqHits, [preferredFaq.id]),
          failureReason: null,
        });
      }
    } catch (error) {
      console.error(
        "customer-service FAQ lookup failed",
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
  }
  if (
    classified.intent === "prompt_injection" ||
    classified.intent === "out_of_scope"
  ) {
    return annotate({
      reply: configuredReply(deps, "refuse", REPLIES.refuse),
      conversation: routedConversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  if (classified.intent === "handoff") {
    const urgent = isSameDayOrderDemand(text) ||
      (classified.configuredIntentKey === "kitchen_confirmation" &&
        /即日|今日|今天|急單|same\s*day|today/i.test(text));
    await deps.queueHandoff({
      phone,
      quoteId: null,
      orderNumber: null,
      summary: `${urgent ? "【緊急即日】" : ""}客戶要求人工協助：${text.trim().slice(0, 500)}`,
      kind: urgent ? "inquiry" : "order_handoff",
      urgent,
    });
    return annotate({
      reply: urgent
        ? configuredReply(deps, "same_day_urgent", REPLIES.sameDayUrgent)
        : configuredReply(deps, "handoff", REPLIES.handoff),
      conversation: nextConversation(routedConversation, {
        state: "awaiting_human",
        handoff_at: new Date().toISOString(),
        active_goal: urgent ? "catering_inquiry" : null,
        handoff_kind: urgent ? "same_day_catering" : "general",
        handoff_urgent: urgent,
        handoff_quote_id: null,
      }),
      wroteInquiry: false,
      notified: urgent,
      queuedHandoff: true,
      usedModel: classified.usedModel,
    });
  }
  if (classified.intent === "handoff_order") {
    return annotate(
      await replyOrderHandoff(deps, phone, classified, routedConversation, text),
    );
  }
  if (classified.intent === "lookup_order") {
    return annotate(await replyLookup(deps, phone, classified, routedConversation));
  }
  if (
    classified.intent === "collect_inquiry" ||
    pilotAction === "continue_catering"
  ) {
    return annotate(await replyCollect(deps, phone, classified, routedConversation, text));
  }
  const faqQuery = asksHowToOrder ? "點樣喺網站落單？" : asksForMenu
    ? customerServiceMenuFaqQuery(text)
    : text;
  return annotate(await replyFaq(cachedDeps, classified, routedConversation, faqQuery));
}
