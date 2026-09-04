export const CUSTOMER_SERVICE_INTENTS = [
  "lookup_order",
  "collect_inquiry",
  "search_faq",
  "handoff_order",
  "handoff",
  "out_of_scope",
  "prompt_injection",
] as const;

export type CustomerServiceIntent = (typeof CUSTOMER_SERVICE_INTENTS)[number];

export type InquirySlots = {
  eventDate: string;
  headcount: string;
  budget: string;
  dietary: string;
  cuisine: string;
  note: string;
  anotherEvent: boolean;
};

export type ClassifiedMessage = {
  intent: CustomerServiceIntent;
  slots: InquirySlots;
  orderNumber: string;
  usedModel: boolean;
  confidence?: number;
  configuredIntentKey?: string;
  toolKey?: string | null;
  requestedDate?: string;
  missingFields?: string[];
  requiresHuman?: boolean;
};

const EMPTY_SLOTS: InquirySlots = {
  eventDate: "",
  headcount: "",
  budget: "",
  dietary: "",
  cuisine: "",
  note: "",
  anotherEvent: false,
};

const INJECTION =
  /忽略(以上|之前|先前|所有)?(指示|指令|規則)|ignore (all|previous|above|prior) (instructions|prompts)|you are now|扮演|假裝你係|列出(你的)?工具|你是(什麼|甚么)模型|你係(乜|咩)模型|chatgpt|gpt-4|system prompt|越獄|jailbreak/i;

const OFF_TOPIC =
  /翻譯(呢|這|以下)|幫我寫(作文|電郵|email|功課)|寫程式|javascript|python 作業|講笑話|今日新聞|股票|天氣點(呀|啊)(?!.*送)/i;

const ORDER_HANDOFF =
  /改期|改地址|改時間|取消|退款|已(經)?(付|俾)款|付咗|入唔到帳|沒入帳|未入帳|收款爭議|(?:改|更改|轉|改為).{0,18}(?:送貨|送餐|自取|日期|時間|地址)|(?:送貨|送餐|自取).{0,18}(?:改|更改|轉)/;

const HANDOFF = /投訴|服務差|議價|平啲|減價|便宜/;

const LOOKUP = /查單|訂單|單號|送貨狀態|送貨日期|送餐日期|自取日期|幾時送|幾時到|我的單|我嘅單|order ?status|delivery date|加單/i;

const COLLECT = /到會|報價|訂餐|宴會|活動|幾多人|人數|另一場|新活動|另外一場/;

const GREETING = /^(test+|hi+|hello+|hey+|哈囉|你好|在嗎|ping|ok)$/i;

const FAQ =
  /運費|送貨費|免運|自取|荃灣|地面交收|上門|餐具|早餐|積分|生日|註冊|付款|轉數快|收據|發票|打風|8\s*號|黑雨|落單|加熱|即食|廚師上門|侍應|擺盤|素食|走蒜|走蔥/;

// Current and legacy customer-facing references include:
// B/P/K/E/L/D/R-1234, B-1550C, FC-prefixed web references,
// R/202608/88 (or its spaced-hyphen form), and legacy #6918 numbers.
// Keep the patterns structured so dates, phone numbers and headcounts are not
// picked out of normal sentences as order references.
const ORDER_NUMBER_PATTERNS = [
  /\bR\s*(?:\/|-)\s*\d{6}\s*(?:\/|-)\s*\d+\b/i,
  /\bFC[A-Z]{0,4}\d{6,}[A-Z0-9]*\b/i,
  /\b[BPKELDR]\s*-?\s*\d+[A-Z]*\b/i,
  /#\s*\d{3,10}\b/,
] as const;

export function normalizeCustomerServiceOrderNumber(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^(?:#\s*)+/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function emptyInquirySlots(): InquirySlots {
  return { ...EMPTY_SLOTS };
}

export function extractInquirySlots(text: string): InquirySlots {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const md = text.match(/\b(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const headcount = text.match(/(\d{1,4})\s*(人|位|頭)/);
  const budget = text.match(/(?:預算|budget)\s*[為是:：]?\s*\$?\s*(\d{2,6})/i)
    || text.match(/\$\s*(\d{2,6})/);
  return {
    eventDate: iso
      ? `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
      : md
        ? `${new Date().getFullYear()}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`
        : "",
    headcount: headcount?.[1] ?? "",
    budget: budget?.[1] ? `HK$${budget[1]}` : "",
    dietary: /素|走蒜|走蔥|忌口/.test(text) ? text.match(/[^\n。.]{0,20}(素|走蒜|走蔥|忌口)[^\n。.]{0,20}/)?.[0] ?? "" : "",
    cuisine: /中菜|西餐|到會套餐|乳豬|盒飯/.test(text)
      ? text.match(/中菜|西餐|到會套餐|乳豬|盒飯/)?.[0] ?? ""
      : "",
    note: "",
    anotherEvent: /另一場|新活動|另外一場|另一個活動/.test(text),
  };
}

export function extractOrderNumber(text: string) {
  for (const pattern of ORDER_NUMBER_PATTERNS) {
    const match = text.match(pattern)?.[0];
    if (match) return match.trim().replace(/^#\s*/, "").toUpperCase();
  }

  // A bare legacy Catering number is only accepted when it is the whole
  // message. This supports replying "6918" after the bot lists orders without
  // mistaking a date, phone number or headcount inside a sentence for an order.
  const legacyNumber = text.trim().match(/^#?(\d{4,10})$/)?.[1];
  return legacyNumber ?? "";
}

export function hasCollectableSlots(slots: InquirySlots) {
  return Boolean(slots.eventDate || slots.headcount);
}

export function isCustomerServiceGreeting(text: string) {
  return GREETING.test(text.trim());
}

export function classifyCustomerServiceMessage(text: string): ClassifiedMessage {
  const body = text.trim();
  const slots = extractInquirySlots(body);
  const orderNumber = extractOrderNumber(body);
  if (INJECTION.test(body)) {
    return { intent: "prompt_injection", slots, orderNumber, usedModel: false };
  }
  if (OFF_TOPIC.test(body)) {
    return { intent: "out_of_scope", slots, orderNumber, usedModel: false };
  }
  if (ORDER_HANDOFF.test(body)) {
    return { intent: "handoff_order", slots, orderNumber, usedModel: false };
  }
  if (HANDOFF.test(body)) {
    return { intent: "handoff", slots, orderNumber, usedModel: false };
  }
  if (orderNumber || LOOKUP.test(body)) {
    return { intent: "lookup_order", slots, orderNumber, usedModel: false };
  }
  if (FAQ.test(body)) {
    return { intent: "search_faq", slots, orderNumber, usedModel: false };
  }
  if (COLLECT.test(body) || hasCollectableSlots(slots)) {
    return { intent: "collect_inquiry", slots, orderNumber, usedModel: false };
  }
  if (!body) {
    return { intent: "out_of_scope", slots, orderNumber, usedModel: false };
  }
  return { intent: "search_faq", slots, orderNumber, usedModel: false };
}
