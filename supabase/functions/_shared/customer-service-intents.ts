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

export const CUSTOMER_SERVICE_ORDER_FIELDS = [
  "summary",
  "delivery_date",
  "status",
  "items",
  "address",
  "receipt",
] as const;

export type CustomerServiceOrderField =
  (typeof CUSTOMER_SERVICE_ORDER_FIELDS)[number];

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
  requestedFields?: CustomerServiceOrderField[];
  missingFields?: string[];
  requiresHuman?: boolean;
  model?: string;
  dialogAction?:
    | "new_request"
    | "continue_current"
    | "add_information"
    | "select_option"
    | "confirm"
    | "deny"
    | "correct_previous"
    | "cancel_current"
    | "switch_task"
    | "resume_previous";
  needsClarification?: boolean;
  clarificationQuestion?: string;
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

const LOOKUP = /查單|訂單|單號|送貨狀態|送貨日期|送餐日期|自取日期|幾時送|幾時到|何時送|何時到|什麼時候送|什麼時候到|什么时候送|什么时候到|幾點送|幾點到|几点送|几点到|我的單|我嘅單|order ?status|delivery date|加單/i;

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

function parseChineseCalendarNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  const [tens, ones] = value.split("十");
  if (value.includes("十")) return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  return digits[value] ?? Number.NaN;
}

function validatedCalendarDate(year: number, month: number, day: number) {
  if (![year, month, day].every(Number.isInteger)) return "";
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() + 1 !== month ||
    value.getUTCDate() !== day
  ) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSlashCalendarDate(match: RegExpMatchArray) {
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3] || hongKongCalendarDate().slice(0, 4));
  // Hong Kong commonly uses D/M. When only the second value can be a day,
  // accept the equally common M/D input (for example 9/26).
  const [month, day] = second > 12 && first <= 12
    ? [first, second]
    : [second, first];
  return validatedCalendarDate(year, month, day);
}

export function extractInquirySlots(text: string): InquirySlots {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const md = text.match(/\b(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號|号)/);
  const chineseMd = text.match(/([一二兩两三四五六七八九十]{1,3})\s*月\s*([零一二兩两三四五六七八九十\d]{1,3})\s*(?:日|號|号)/);
  const rawDmy = text.match(
    /(?:^|\D)(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(20\d{2}))?(?!\d)/,
  );
  const dmyEnd = rawDmy ? (rawDmy.index ?? 0) + rawDmy[0].length : 0;
  const dmy = rawDmy &&
      !/^(?:\s*(?:萬|千|百|人|位|頭|折|倍|元|蚊|%))/u.test(text.slice(dmyEnd)) &&
      !/(?:預算|budget)[^，。；;\n]{0,16}$/iu.test(text.slice(0, dmyEnd))
    ? rawDmy
    : null;
  const headcount = text.match(/(\d{1,4})\s*(人|位|頭)/);
  const budget = text.match(/(?:預算|budget)\s*[為是:：]?\s*\$?\s*(\d{2,6})/i)
    || text.match(/\$\s*(\d{2,6})/);
  const currentYear = Number(hongKongCalendarDate().slice(0, 4));
  const requestedYear = Number(text.match(/\b(20\d{2})\s*年/)?.[1] ?? currentYear);
  return {
    eventDate: iso
      ? validatedCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
      : md
        ? validatedCalendarDate(requestedYear, Number(md[1]), Number(md[2]))
        : chineseMd
          ? validatedCalendarDate(
            requestedYear,
            parseChineseCalendarNumber(chineseMd[1]),
            parseChineseCalendarNumber(chineseMd[2]),
          )
        : dmy
          ? parseSlashCalendarDate(dmy)
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

export function shouldBypassCustomerServiceAi(classified: ClassifiedMessage) {
  // Only a prompt attack is a hard deterministic intent. Business meaning,
  // including apparently off-topic wording, remains AI-first so context can
  // distinguish e.g. weather chatter from a delivery-impact question.
  return classified.intent === "prompt_injection";
}

export function explicitCustomerServiceOrderNumber(
  text: string,
  fallbackOrderNumber: string,
  modelOrderNumber: string,
) {
  if (fallbackOrderNumber) return fallbackOrderNumber;
  const candidate = normalizeCustomerServiceOrderNumber(modelOrderNumber);
  if (candidate.length < 4) return "";
  const normalizedText = normalizeCustomerServiceOrderNumber(text);
  return normalizedText.includes(candidate) ? modelOrderNumber.trim() : "";
}

/** A general brand greeting can arrive as search_faq from the model. */
export function isBrandIntroductionRequest(value: string) {
  const text = value.trim();
  if (!/(?:hk\s*lunch\s*box|lunch\s*box|飯盒|便當|hk\s*party\s*food|food\s*channels?\s*(?:catering|express|kitchen|cuisine)|fc\s*(?:catering|express|kitchen|cuisine))/i.test(text)) return false;
  // Specific policy/order questions must keep their own retrieval intent.
  if (/幾多|多少|幾點|何時|幾時|運費|最低|最少|提前|取消|退款|投訴|訂單|訂單號|素食|過敏|遲到|遲咗|送唔送|可以|可唔可以|\d/.test(text)) return false;
  return /(?:想問|想了解|查詢|詢問|介紹|了解).{0,60}(?:問題|服務|飯盒|餐牌|餐飲)|(?:品牌|飯盒|送餐).{0,20}(?:介紹|問題|服務)/i.test(text);
}

/** Only standalone ordering instructions; mixed complaints and booking requests retain their intent. */
export function isOrderingInstructionsRequest(value: string) {
  const text = value.trim().replace(/[\s，。！？,.!?]/g, "");
  return /^(?:(?:你好|請問|想問|我想問|咁|甘|唔該))*(?:點(?:樣)?|如何|怎樣|怎么|怎麼)(?:喺|在)?(?:網站|網上)?(?:落單|下單|下单|訂購|订购|訂餐|订餐)(?:呢|呀|啊|嗎|吗|㗎|架)?$/i.test(text) ||
    /^(?:howtoorder|howdoiorder|howcan(?:i|we)(?:placeanorder|order))\??$/i.test(text);
}

export function isMenuInformationRequest(value: string) {
  const text = value.trim();
  const asksToBrowse = /(?:有冇|有無|有沒有|有吗|有嗎|睇|看|看看|提供|發|发|send|想問|想问|詢問|询问|索取|想訂|想订|訂購|订购|落單|下单)/i.test(text);
  if (/(?:餐牌|菜單|菜单|menu)/i.test(text) && asksToBrowse) return true;
  if (
    /(?:food\s*channels?\s*(?:catering|express|kitchen|cuisine)|fc\s*(?:catering|express|kitchen|cuisine)|桂花[‧·・．.]?八月|福滿樓|福满楼|hk\s*(?:lunch\s*box|party\s*food))/i.test(text) &&
    asksToBrowse
  ) return true;
  return /(?:飯盒|便當|便当|餐盒|meal\s*box|lunch\s*box|lunchbox|派對小食|派对小食|party\s*food)/i.test(text) && asksToBrowse;
}

/** Resolve delivery-day wording against Hong Kong's calendar, not the server timezone. */
export function resolveCustomerServiceDeliveryDate(text: string, now = new Date()) {
  const explicit = extractInquirySlots(text).eventDate;
  if (explicit) return explicit;
  // A malformed explicit date or recurring schedule is not a single relative day.
  if (/(?:\d{1,2}\s*月\s*\d|20\d{2}[-/.]\d)|(?:每|逢)(?:個|个)?(?:星期|禮拜|礼拜|週|周)|\bevery\b/i.test(text)) return "";
  const today = new Date(`${hongKongCalendarDate(now)}T00:00:00Z`);
  const relativeDays = [...text.matchAll(/今日|今天|聽日|听日|明天|明日|後天|后天|後日|后日|\btoday\b|\btomorrow\b/gi)];
  const weekdays = [...text.matchAll(/(?:(下下|上上|下|上|今|本|這|这|呢)(?:個|个)?)?(?:星期|禮拜|礼拜|週|周)\s*([一二三四五六日天1-7])/g)];
  const englishDays = [...text.matchAll(/\b(?:(this|next|last)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi)];
  if (relativeDays.length + weekdays.length + englishDays.length !== 1) return "";
  let offset: number;
  if (relativeDays.length) {
    const word = relativeDays[0][0].toLowerCase();
    offset = /今日|今天|today/.test(word) ? 0 : /後|后/.test(word) ? 2 : 1;
  } else {
    const match = weekdays[0] ?? englishDays[0];
    const prefix = (match[1] ?? "").toLowerCase();
    const day = weekdays.length
      ? ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 0 } as Record<string, number>)[match[2]]
      : ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(match[2].toLowerCase());
    const currentDay = today.getUTCDay();
    if (!prefix) offset = (day - currentDay + 7) % 7;
    else {
      const weekOffset = ["下", "next"].includes(prefix) ? 7 : prefix === "下下" ? 14
        : ["上", "last"].includes(prefix) ? -7 : prefix === "上上" ? -14 : 0;
      offset = (day + 6) % 7 - (currentDay + 6) % 7 + weekOffset;
    }
  }
  today.setUTCDate(today.getUTCDate() + offset);
  return today.toISOString().slice(0, 10);
}

/** Extract a customer-supplied wall-clock time without assigning business intent. */
export function extractCustomerServiceClockTime(text: string) {
  const match = text.trim().match(
    /(?<!\d)(?:(上午|早上|中午|午夜|下午|晚上|夜晚)\s*)?([01]?\d|2[0-4])\s*(?:[:：點点時时])\s*(?:(\d{1,2})\s*分?|半)?(?!\d)/,
  );
  if (!match) return "";
  let hour = Number(match[2]);
  const minute = match[3]
    ? Number(match[3])
    : /半/.test(match[0])
      ? 30
      : 0;
  if (minute > 59) return "";
  if (hour === 24) return minute === 0 ? "00:00" : "";
  if (/午夜/.test(match[1] ?? "") && hour === 12) hour = 0;
  if (/中午/.test(match[1] ?? "") && hour < 11) hour += 12;
  if (/(?:下午|晚上|夜晚)/.test(match[1] ?? "") && hour < 12) {
    hour += 12;
  }
  if (/(?:上午|早上)/.test(match[1] ?? "") && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const CUSTOMER_SERVICE_BRAND_IDENTITIES = [
  {
    name: "HK Lunch Box",
    pattern: /(?:hk\s*lunch\s*box|hklunchbox)/i,
  },
  {
    name: "HK Party Food",
    pattern: /(?:hk\s*party\s*food|hkpartyfood)/i,
  },
  {
    name: "Food Channels Express",
    pattern: /(?:food\s*channels?\s*express|fc\s*express)/i,
  },
  {
    name: "Food Channels Kitchen",
    pattern:
      /(?:food\s*channels?\s*kitchen|fc\s*kitchen|桂花[‧·・．.]?八月)/i,
  },
  {
    name: "Food Channels Cuisine",
    pattern: /(?:food\s*channels?\s*cuisine|fc\s*cuisine|福滿樓|福满楼)/i,
  },
  {
    name: "Food Channels Catering",
    pattern: /(?:food\s*channels?\s*catering|fc\s*catering|\bfcc\b)/i,
  },
] as const;

export function customerServiceBrandIdentityName(value: string) {
  const text = value.trim();
  const asksForIdentity =
    /(?:請問|请问).{0,8}(?:係咪|係唔係|是否|是不是|是)|(?:你哋|你地|你們|你们|呢度|這裡|这里|這邊|这边).{0,8}(?:係咪|係唔係|係|是否|是不是|是)|(?:係咪|係唔係|是否|是不是)|\b(?:is\s+(?:this|it)|are\s+you)\b/i
      .test(text);
  if (!asksForIdentity) return null;
  return CUSTOMER_SERVICE_BRAND_IDENTITIES.find(({ pattern }) =>
    pattern.test(text)
  )?.name ?? null;
}

export function isDeliveryAvailabilityQuestion(text: string) {
  const body = text.trim();
  if (!body || !resolveCustomerServiceDeliveryDate(body)) return false;
  const slots = extractInquirySlots(body);
  const delivery = /送貨|送餐|配送|交收|訂餐|订餐|訂貨|订货|訂購|订购|預訂|预订|到會|到会|落單|落单/i.test(body);
  const availability =
    /可唔可以|可以(?:送)?(?:嗎|吗|呀|啊)?|能否|能不能|得唔得|送唔送|有冇得送|有沒有得送|是否(?:可以)?|會唔會送|会不会送/i
      .test(body);
  const datedBooking = /(?:預訂|预订|預定|预定|訂|订|落單|落单).{0,8}(?:到會|到会|餐)|(?:到會|到会).{0,8}(?:預訂|预订|預定|预定|訂|订)/i.test(body);
  const isDetailedOrder = Boolean(slots.headcount || slots.budget || slots.dietary || slots.cuisine) ||
    /(?:幫我|替我|直接)(?:訂|订|落單|落单)/i.test(body);
  return delivery && (availability || (datedBooking && !isDetailedOrder) || /係咪|系咪|是不是/.test(body));
}

/**
 * "為何 9 月 20 日沒得送貨？" style questions ask for the block-date reason.
 * They must route to the intake check so the rule's own message can explain why,
 * even when the AI classifier is in use.
 */
export function isBlockedDateReasonQuestion(text: string) {
  const body = text.trim();
  if (!body) return false;
  const asksWhy = /(?:為何|为什么|為什麼|點解|点解|因何|why)/i.test(body);
  const unavailable =
    /(?:沒得送|没得送|冇得送|無得送|无得送|唔送|不送|停送|暫停|暂停|不能送|唔可以送|唔可以|停單|停单|封鎖|封锁|block)/i
      .test(body);
  return asksWhy && unavailable && Boolean(resolveCustomerServiceDeliveryDate(body));
}

export function customerServiceMenuFaqQuery(value: string) {
  const text = value.trim();
  // Explicit brand names must win over generic category wording. Otherwise an
  // image/message that names a brand but also mentions packaging (for example a
  // Catering menu that shows 飯盒) would be answered with the wrong brand.
  if (/(?:food\s*channels?\s*catering|fc\s*catering|\bfcc\b)/i.test(text)) {
    return "Food Channels Catering 有冇餐牌可以睇？";
  }
  if (/(?:food\s*channels?\s*express|fc\s*express)/i.test(text)) {
    return "Food Channels Express 有冇餐牌可以睇？";
  }
  if (/(?:food\s*channels?\s*kitchen|fc\s*kitchen|桂花[‧·・．.]?八月)/i.test(text)) {
    return "Food Channels Kitchen 有冇餐牌可以睇？";
  }
  if (/(?:food\s*channels?\s*cuisine|fc\s*cuisine|福滿樓|福满楼)/i.test(text)) {
    return "Food Channels Cuisine 有冇餐牌可以睇？";
  }
  if (/(?:hk\s*party\s*food|hkpartyfood)/i.test(text)) {
    return "HK Party Food 有冇餐牌可以睇？";
  }
  if (/(?:hk\s*lunch\s*box|hklunchbox)/i.test(text)) {
    return "HK Lunch Box 有冇餐牌可以睇？";
  }
  if (/(?:飯盒|便當|便当|餐盒|meal\s*box|lunch\s*box|lunchbox)/i.test(text)) {
    return "HK Lunch Box 有冇餐牌可以睇？";
  }
  if (/(?:party\s*food|派對小食|派对小食|派對套餐|派对套餐|一口小食|canap[eé])/i.test(text)) {
    return "HK Party Food 有冇餐牌可以睇？";
  }
  if (/(?:即日到會|即日到会)/i.test(text)) {
    return "Food Channels Express 有冇餐牌可以睇？";
  }
  if (/(?:高級中菜|高级中菜)/i.test(text)) {
    return "Food Channels Kitchen 有冇餐牌可以睇？";
  }
  if (/(?:養生中菜|养生中菜)/i.test(text)) {
    return "Food Channels Cuisine 有冇餐牌可以睇？";
  }
  if (/(?:到會|到会|自助餐)/i.test(text)) {
    return "Food Channels Catering 有冇餐牌可以睇？";
  }
  return "有冇餐牌可以睇？";
}

export function extractRequestedOrderFields(text: string) {
  const fields: CustomerServiceOrderField[] = [];
  if (/(?:送貨|送餐|自取|交收).{0,8}(?:日期|時間|幾時|何時|什麼時候|什么时候|幾點|几点)|(?:幾時|何時|什麼時候|什么时候|幾點|几点).{0,8}(?:送|到)|(?:送|到)貨?.{0,5}(?:日期|時間|幾時|何時|什麼時候|什么时候|幾點|几点)|delivery\s*(?:date|time)/i.test(text)) {
    fields.push("delivery_date");
  }
  if (/(?:狀態|進度|而家點|依家點|處理成點|status)/i.test(text)) {
    fields.push("status");
  }
  if (/(?:訂|叫|買).{0,8}(?:咩|乜|什麼|什么|菜|餸|餐)|(?:菜式|餸菜|餐點|訂單內容|订单内容|order\s*(?:items|details)|what.*order)/i.test(text)) {
    fields.push("items");
  }
  if (/(?:送貨|送餐|交收).{0,8}(?:地址|地點|邊度|哪里|哪裏)|(?:地址|delivery\s*address)/i.test(text)) {
    fields.push("address");
  }
  if (/(?:收據|收据|發票|发票|invoice|receipt)/i.test(text)) {
    fields.push("receipt");
  }
  return [...new Set(fields)];
}

export function isCustomerServiceGreeting(text: string) {
  return GREETING.test(text.trim());
}

export function customerServiceSeasonalMenuFaqQuery(value: string) {
  const text = value.trim();
  if (!/(?:中秋|mid[\s-]*autumn)/i.test(text)) return null;
  if (/(?:food\s*channels?\s*kitchen|fc\s*kitchen|fck|桂花[‧·・．.]?八月)/i.test(text)) {
    return "Food Channels Kitchen 2026中秋餐牌";
  }
  if (/(?:food\s*channels?\s*catering|fc\s*catering|fcc)/i.test(text)) {
    return "Food Channels Catering 2026中秋餐牌";
  }
  return null;
}

export function isCustomerServiceEmojiAcknowledgement(text: string) {
  const body = text.trim();
  return body !== "" && /^(?:[👍🙏👌😊🙂🙌👏❤️❤✨]+|(?:ok|okay)[!！.]*)$/iu.test(body);
}

export function isCustomerServiceThanks(text: string) {
  return /^(?:多謝|唔該晒|謝謝|谢谢|thanks?|thank\s+you)[!！。.🙏😊]*$/iu.test(text.trim());
}

export function isTakeawayPackagingRequest(text: string) {
  const body = text.trim();
  return /(?:外賣盒|外卖盒|餐盒|食物盒|膠盒|胶盒|打包盒|包裝盒|包装盒|餐具|筷子)/iu.test(body) &&
    /(?:想要|需要|可唔可以|可以提供|請提供|提供多|加(?:多|入|購|购)|補|补)/iu.test(body);
}

export function isProductQualityComplaint(text: string) {
  return /(?:發霉|发霉|霉菌|異物|异物|變壞|变坏|酸餿|酸馊|包裝破損|包装破损)/iu.test(text.trim());
}

/** Hong Kong calendar date YYYY-MM-DD for a given instant. */
export function hongKongCalendarDate(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isHongKongCalendarDateToday(
  value: string | null | undefined,
  now: Date = new Date(),
) {
  const date = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date === hongKongCalendarDate(now);
}

/**
 * Clear same-day / urgent catering order demand (not a pure how-to FAQ).
 * Used to bypass Express FAQ preflight and trigger immediate staff WATI.
 */
export function isSameDayOrderDemand(text: string) {
  const body = text.trim();
  if (!body) return false;
  const sameDay =
    /即日|今日|今天|急單|same\s*day|today/i.test(body);
  if (!sameDay) return false;
  const demand =
    /急單|(?:即日|今日|今天).{0,12}(?:訂|落單|叫|要餐|要送|到會)|(?:想|要|幫我|可以|可唔可以|做唔做(?:到)?|得唔得).{0,16}(?:即日|今日|今天|急)|(?:訂|落|叫).{0,10}(?:即日|今日|今天)|(?:今日|今天|即日)(?:想|要)?(?:訂餐|訂到會|到會)/i
      .test(body);
  if (!demand) return false;
  // Pure how-to / menu browse stays on FAQ unless the guest also asks us to place/confirm an urgent order.
  const pureHowto =
    /(?:點(?:樣)?(?:喺|在)?(?:網站)?落單|點樣訂|how\s*to\s*order|有冇餐牌|餐牌可以睇|運費)/i
      .test(body) &&
    !/(?:急單|幫我訂|幫我落|想即日訂|今日想訂|今天想訂|即日想訂|做唔做到|得唔得)/i
      .test(body);
  return !pureHowto;
}

/** WATI order-confirmation template quick-reply; no bot reply or handoff needed. */
export function isOrderConfirmationAcknowledgement(text: string) {
  const normalized = text.trim().replace(/[!！.。?？\s]/g, "");
  return normalized === "確定訂單" || normalized === "确认订单";
}

export function classifyCustomerServiceMessage(text: string): ClassifiedMessage {
  const body = text.trim();
  const slots = extractInquirySlots(body);
  const orderNumber = extractOrderNumber(body);
  const requestedFields = extractRequestedOrderFields(body);
  if (INJECTION.test(body)) {
    return { intent: "prompt_injection", slots, orderNumber, requestedFields, usedModel: false };
  }
  if (OFF_TOPIC.test(body)) {
    return { intent: "out_of_scope", slots, orderNumber, requestedFields, usedModel: false };
  }
  if (ORDER_HANDOFF.test(body)) {
    return { intent: "handoff_order", slots, orderNumber, requestedFields, usedModel: false };
  }
  if (HANDOFF.test(body)) {
    return { intent: "handoff", slots, orderNumber, requestedFields, usedModel: false };
  }
  if (orderNumber || LOOKUP.test(body)) {
    return { intent: "lookup_order", slots, orderNumber, requestedFields: requestedFields.length ? requestedFields : ["summary"], usedModel: false };
  }
  if (isDeliveryAvailabilityQuestion(body)) {
    return {
      intent: "search_faq",
      slots: { ...slots, eventDate: resolveCustomerServiceDeliveryDate(body) },
      orderNumber,
      requestedFields,
      usedModel: false,
      configuredIntentKey: "delivery_availability",
      toolKey: "check_delivery_date",
    };
  }
  if (isMenuInformationRequest(body)) {
    return {
      intent: "search_faq",
      slots,
      orderNumber,
      requestedFields,
      usedModel: false,
      configuredIntentKey: "browse_menu",
      toolKey: "search_faqs",
    };
  }
  if (FAQ.test(body)) {
    return { intent: "search_faq", slots, orderNumber, requestedFields, usedModel: false };
  }
  if (COLLECT.test(body) || hasCollectableSlots(slots)) {
    return { intent: "collect_inquiry", slots, orderNumber, requestedFields, usedModel: false };
  }
  if (!body) {
    return { intent: "out_of_scope", slots, orderNumber, requestedFields, usedModel: false };
  }
  return { intent: "search_faq", slots, orderNumber, requestedFields, usedModel: false };
}
