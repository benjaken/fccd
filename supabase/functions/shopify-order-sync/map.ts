export type ShopifyMoneySet = {
  shopMoney?: { amount?: string; currencyCode?: string };
};

export type ShopifyRestAddress = {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
};

export type ShopifyRestLineItem = {
  id?: number | string;
  product_id?: number | string | null;
  variant_id?: number | string | null;
  variant_title?: string | null;
  sku?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  price?: string | number | null;
  total_discount?: string | number | null;
  discount_allocations?: Array<{ amount?: string | number | null }>;
  properties?: Array<{ name?: string; value?: string | null }>;
};

export type ShopifyRestShippingLine = {
  id?: number | string;
  title?: string | null;
  code?: string | null;
  price?: string | number | null;
  discounted_price?: string | number | null;
  discount_allocations?: Array<{ amount?: string | number | null }>;
};

export type ShopifyRestTransaction = {
  id?: number | string;
  order_id?: number | string;
  kind?: string | null;
  status?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  gateway?: string | null;
  authorization?: string | null;
  created_at?: string | null;
  payment_details?: {
    credit_card_company?: string | null;
    gift_card?: boolean;
  } | null;
  source_name?: string | null;
};

export type ShopifyRestOrder = {
  id?: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  currency?: string | null;
  financial_status?: string | null;
  total_price?: string | number | null;
  current_total_price?: string | number | null;
  total_outstanding?: string | number | null;
  total_discounts?: string | number | null;
  created_at?: string | null;
  updated_at?: string | null;
  cancelled_at?: string | null;
  note_attributes?: Array<{ name?: string; value?: string | null }>;
  shipping_address?: ShopifyRestAddress | null;
  billing_address?: ShopifyRestAddress | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  shipping_lines?: ShopifyRestShippingLine[];
  line_items?: ShopifyRestLineItem[];
};

const DELIVERY_DATE_KEYS = [
  "delivery date",
  "delivery_date",
  "deliverydate",
  "送貨日期",
  "送貨日",
  "date",
];

const DELIVERY_TIME_KEYS = [
  "delivery time",
  "delivery_time",
  "送貨時間",
  "time slot",
  "timeslot",
];

export function numericId(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const gid = trimmed.match(/\/(\d+)\s*$/);
  if (gid) return Number(gid[1]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

export function orderNumberKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s*\(void\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeShopDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!trimmed.endsWith(".myshopify.com")) return null;
  return trimmed;
}

export function shopDomainMatches(
  candidate: string | null | undefined,
  configuredDomains: Array<string | null | undefined>,
): boolean {
  const normalizedCandidate = normalizeShopDomain(candidate);
  if (!normalizedCandidate) return false;
  return configuredDomains.some((domain) =>
    normalizeShopDomain(domain) === normalizedCandidate
  );
}

function attrMap(
  attrs: Array<{ name?: string; value?: string | null }> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const attr of attrs ?? []) {
    const key = String(attr.name ?? "").trim().toLowerCase();
    const value = String(attr.value ?? "").trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

function firstAttr(
  map: Map<string, string>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = map.get(key);
    if (value) return value;
  }
  return null;
}

export function parseDeliveryAt(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // Pure date (no time component): treat as UTC midnight so the date does not
  // shift by the deployment region's timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/");
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`,
    ).toISOString();
  }
  const namedMonth = trimmed.match(
    /^(\w+),\s*(\d{1,2})\s+(\w+)\s+(\d{4})$/i,
  );
  if (namedMonth) {
    const [, , day, month, year] = namedMonth;
    const parsed = new Date(`${month} ${day}, ${year} 00:00:00 UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function shopifyClock24(hourText: string, minuteText: string, meridiem?: string) {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const period = meridiem?.toUpperCase();
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === "AM") hour = hour === 12 ? 0 : hour;
    if (period === "PM") hour = hour === 12 ? 12 : hour + 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeShopifyDeliveryTime(value: string | null | undefined): string | null {
  const source = String(value ?? "")
    .trim()
    .replaceAll("：", ":")
    .replace(/[–—~至到]/g, "-")
    .replace(/\s+/g, " ");
  if (!source) return null;
  const match = source.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?$/i,
  );
  if (!match) return source;
  const start = shopifyClock24(match[1], match[2], match[3] || match[6]);
  const end = shopifyClock24(match[4], match[5], match[6] || match[3]);
  return start && end ? `${start} - ${end}` : source;
}

export function extractDeliveryFields(order: ShopifyRestOrder): {
  deliveryAt: string | null;
  deliveryTime: string | null;
} {
  const notes = attrMap(order.note_attributes);
  const lineProps = attrMap(
    (order.line_items ?? []).flatMap((item) => item.properties ?? []),
  );
  const merged = new Map([...lineProps, ...notes]);
  return {
    deliveryAt: parseDeliveryAt(firstAttr(merged, DELIVERY_DATE_KEYS)),
    deliveryTime: firstAttr(merged, DELIVERY_TIME_KEYS),
  };
}

function money(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function shopifyFinancialStatus(
  order: ShopifyRestOrder,
): string | null {
  const status = String(order.financial_status ?? "").trim().toLowerCase();
  return status || null;
}

/** Shopify's balance is authoritative only for an order linked to Shopify. */
export function shopifyOutstanding(order: ShopifyRestOrder): number | null {
  if (
    order.total_outstanding !== null &&
    order.total_outstanding !== undefined &&
    String(order.total_outstanding).trim() !== ""
  ) {
    return Math.max(0, money(order.total_outstanding));
  }

  const status = shopifyFinancialStatus(order);
  if (["paid", "partially_refunded", "refunded", "voided"].includes(status ?? "")) {
    return 0;
  }
  if (["pending", "authorized"].includes(status ?? "")) {
    const total = order.current_total_price ?? order.total_price;
    return total === null || total === undefined || String(total).trim() === ""
      ? null
      : Math.max(0, money(total));
  }
  return null;
}

function joinAddress(address: ShopifyRestAddress | null | undefined): string | null {
  if (!address) return null;
  const street = String(address.address1 ?? "").trim();
  const city = mappedShopifyCityName(address.city);
  if (city && street && !street.includes(city)) return `${city}${street}`;
  return street || city || null;
}

export function shopifyShippingMethodTitle(
  order: ShopifyRestOrder,
): string | null {
  for (const line of order.shipping_lines ?? []) {
    const title = String(line.title ?? line.code ?? "").trim();
    if (title) return title;
  }
  return null;
}

export function resolveShopifyShippingMethodId(
  title: string | null | undefined,
  methods: Array<{
    id: string;
    name: string | null;
    display_name?: string | null;
  }>,
): string | null {
  const normalize = (value: string | null | undefined) => String(value ?? "")
    .replace(/[\s()[\]{}（）【】<>《》\-–—_:：/\\]+/g, "")
    .toLowerCase();
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;
  const candidates = methods.flatMap((method) =>
    [method.display_name, method.name]
      .map((name) => String(name ?? "").trim())
      .filter(Boolean)
      .map((name) => ({ id: method.id, name }))
  ).sort((left, right) => right.name.length - left.name.length);
  return candidates.find((candidate) =>
    normalizedTitle.includes(normalize(candidate.name))
  )?.id ?? null;
}

const GENERIC_SHOPIFY_CITIES = new Set([
  "hong kong",
  "hongkong",
  "hk",
  "香港",
  "china",
  "中國",
  "prc",
]);

const GENERIC_DISTRICT_NAMES = new Set(["新界", "九龍", "香港", "TBC", "按要求"]);

/** English city labels used by Shopify Hong Kong checkouts. */
const SHOPIFY_CITY_ALIASES: Record<string, string> = {
  "aberdeen": "香港仔",
  "admiralty": "金鐘",
  "anderson": "安達臣",
  "ap lei chau": "鴨脷洲",
  "austin": "柯士甸",
  "braemar hill": "寶馬山",
  "causeway bay": "銅鑼灣",
  "central": "中環",
  "central mid levels": "中半山",
  "chai wan": "柴灣",
  "chek lap kok": "赤鱲角",
  "cheung sha wan": "長沙灣",
  "clear water bay": "清水灣",
  "cyberport": "數碼港",
  "diamond hill": "鑽石山",
  "discovery bay": "愉景灣",
  "east mid levels": "東半山",
  "fanling": "粉嶺",
  "fo tan": "火炭",
  "fortress hill": "炮台山",
  "hang hau": "坑口",
  "happy valley": "跑馬地",
  "ho man tin": "何文田",
  "hung hom": "紅磡",
  "jardines lookout": "渣甸山",
  "jordan": "佐敦",
  "kai tak": "啟德",
  "kennedy town": "堅尼地城",
  "kowloon bay": "九龍灣",
  "kowloon city": "九龍城",
  "kowloon tong": "九龍塘",
  "kwai fong": "葵芳",
  "kwai hing": "葵興",
  "kwai chung": "葵涌",
  "kwun tong": "觀塘",
  "lai chi kok": "荔枝角",
  "lam tin": "藍田",
  "lau fau shan": "流浮山",
  "lei yue mun": "鯉魚門",
  "lohas park": "將軍澳",
  "lok fu": "樂富",
  "lok ma chau": "落馬洲",
  "ma on shan": "馬鞍山",
  "ma tau wai": "馬頭圍",
  "ma wan": "馬灣",
  "mei foo": "美孚",
  "mid levels": "半山",
  "mong kok": "旺角",
  "ngau chi wan": "牛池灣",
  "ngau tau kok": "牛頭角",
  "north point": "北角",
  "pak shek kok": "白石角",
  "pok fu lam": "薄扶林",
  "prince edward": "太子",
  "quarry bay": "鰂魚涌",
  "repulse bay": "淺水灣",
  "sai kung": "西貢",
  "sai wan ho": "西灣河",
  "sai ying pun": "西營盤",
  "science park": "科學園",
  "sha tin": "沙田",
  "shatin": "沙田",
  "sham shui po": "深水埗",
  "shau kei wan": "筲箕灣",
  "shek kip mei": "石硤尾",
  "shek mun": "石門",
  "sheung shui": "上水",
  "sheung wan": "上環",
  "siu sai wan": "小西灣",
  "stanley": "赤柱",
  "tai hang": "大坑",
  "tai kok tsui": "大角咀",
  "tai po": "大埔",
  "tai tam": "大潭",
  "tai wai": "大圍",
  "tai wo hau": "大窩口",
  "tin shui wai": "天水圍",
  "tsim sha tsui": "尖沙咀",
  "tsing yi": "青衣",
  "tsueng kwan o": "將軍澳",
  "tseung kwan o": "將軍澳",
  "tsuen wan": "荃灣",
  "tuen mun": "屯門",
  "tung chung": "東涌",
  "wan chai": "灣仔",
  "west kowloon": "西九龍",
  "whampoa": "黃埔",
  "wong chuk hang": "黃竹坑",
  "wong tai sin": "黃大仙",
  "wu kai sha": "烏溪沙",
  "yau ma tei": "油麻地",
  "yau tong": "油塘",
  "yuen long": "元朗",
  "日出康城": "將軍澳",
};

const SHOPIFY_DISTRICT_ALIAS_ENTRIES = Object.entries(SHOPIFY_CITY_ALIASES)
  .map(([alias, district]) => [normalizeDistrictLabel(alias), district] as const)
  .sort(([left], [right]) => right.length - left.length);

export type ShopifyDistrictSources = {
  city: string | null;
  province: string | null;
  address1: string | null;
  address2: string | null;
  noteDistrict: string | null;
};

export function extractShopifyDistrictSources(
  order: ShopifyRestOrder,
): ShopifyDistrictSources {
  const notes = attrMap(order.note_attributes);
  return {
    city: order.shipping_address?.city?.trim() || null,
    province: order.shipping_address?.province?.trim() || null,
    address1: order.shipping_address?.address1?.trim() || null,
    address2: order.shipping_address?.address2?.trim() || null,
    noteDistrict: firstAttr(notes, [
      "district",
      "delivery district",
      "delivery_district",
      "地區",
      "送貨地區",
    ]),
  };
}

function normalizeDistrictLabel(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/,?\s*(hong kong|香港)$/i, "")
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-HK");
}

function isGenericShopifyCity(value: string | null | undefined) {
  const normalized = normalizeDistrictLabel(value);
  return !normalized || GENERIC_SHOPIFY_CITIES.has(normalized);
}

export function mappedShopifyCityName(value: string | null | undefined) {
  const normalized = normalizeDistrictLabel(value);
  if (!normalized || isGenericShopifyCity(normalized)) return null;
  const compact = normalized.replace(/[\s_-]+/g, "");
  const alias = SHOPIFY_DISTRICT_ALIAS_ENTRIES.find(([candidate]) =>
    candidate === normalized || candidate.replace(/[\s_-]+/g, "") === compact
  );
  return alias?.[1] ?? value?.trim() ?? null;
}

function mappedShopifyDistrictPrefix(value: string | null | undefined) {
  const normalized = normalizeDistrictLabel(value).replace(/[-_]+/g, " ");
  if (!normalized) return null;
  const match = SHOPIFY_DISTRICT_ALIAS_ENTRIES.find(([alias]) =>
    normalized === alias || normalized.startsWith(`${alias} `) ||
    normalized.startsWith(`${alias},`) ||
    (/\p{Script=Han}/u.test(alias) && normalized.startsWith(alias))
  );
  return match?.[1] ?? null;
}

function stripDistrictPrefix(value: string, prefix: string) {
  if (value.length <= prefix.length || !value.startsWith(prefix)) return value;
  const rest = value.slice(prefix.length).replace(/^[\s,，]+/, "").trim();
  return rest || value;
}

function longestDistrictPrefix(
  text: string,
  names: readonly string[],
  allowGeneric: boolean,
) {
  let matched: string | null = null;
  for (const name of names) {
    const district = name.trim();
    if (!district || !text.startsWith(district)) continue;
    if (!allowGeneric && GENERIC_DISTRICT_NAMES.has(district)) continue;
    if (!matched || district.length > matched.length) matched = district;
  }
  return matched;
}

export function matchShopifyDistrictName(
  sources: ShopifyDistrictSources,
  districtNames: readonly string[],
): string | null {
  const names = districtNames.map((name) => name.trim()).filter(Boolean);
  if (!names.length) return null;

  const city = mappedShopifyCityName(sources.city);
  const texts = [
    sources.noteDistrict,
    city,
    sources.address1,
    city && sources.address1 && !sources.address1.includes(city)
      ? `${city}${sources.address1}`
      : null,
    sources.address2,
  ].flatMap((value) => {
    const text = String(value ?? "").trim();
    return text ? [text] : [];
  });

  for (const text of texts) {
    const aliased = mappedShopifyDistrictPrefix(text);
    const aliasMatch = aliased && names.find((name) =>
      normalizeDistrictLabel(name) === normalizeDistrictLabel(aliased)
    );
    if (aliasMatch && !GENERIC_DISTRICT_NAMES.has(aliasMatch)) return aliasMatch;

    const exact = names.find((name) =>
      normalizeDistrictLabel(name) === normalizeDistrictLabel(text)
    );
    if (exact && !GENERIC_DISTRICT_NAMES.has(exact)) return exact;
  }

  let best: string | null = null;
  for (const text of texts) {
    const attempts = [...new Set([
      text,
      stripDistrictPrefix(text, "香港新界"),
      stripDistrictPrefix(text, "香港"),
      stripDistrictPrefix(text, "新界"),
      stripDistrictPrefix(text, "九龍"),
    ])];
    for (const attempt of attempts) {
      const specific = longestDistrictPrefix(attempt, names, false);
      if (specific && (!best || specific.length > best.length)) best = specific;
    }
  }
  if (best) return best;

  for (const text of texts) {
    const generic = longestDistrictPrefix(text, names, true);
    if (generic && (!best || generic.length > best.length)) best = generic;
  }
  return best;
}

export function resolveShopifyDistrictId(
  sources: ShopifyDistrictSources,
  districts: Array<{
    id: string;
    name: string | null;
    driver_team_id?: string | null;
    created_at?: string | null;
  }>,
): string | null {
  const matchedName = matchShopifyDistrictName(
    sources,
    districts.map((district) => district.name ?? ""),
  );
  const needle = normalizeDistrictLabel(matchedName ?? "TBC");
  return districts
    .filter((district) => normalizeDistrictLabel(district.name) === needle)
    .sort((left, right) => {
      const leftTeam = left.driver_team_id ? 1 : 0;
      const rightTeam = right.driver_team_id ? 1 : 0;
      if (leftTeam !== rightTeam) return leftTeam - rightTeam;
      return String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) ||
        left.id.localeCompare(right.id);
    })[0]?.id ?? null;
}

/** Keep Hong Kong Shopify phone numbers local in the operational snapshot. */
export function normalizeShopifyPhone(
  value: string | null | undefined,
): string | null {
  const phone = String(value ?? "").trim();
  if (!phone) return null;
  return phone.replace(/^\+852(?:[\s-]*)/, "").trim() || null;
}

function customerName(order: ShopifyRestOrder): string | null {
  const shipping = String(order.shipping_address?.name ?? "").trim();
  if (shipping) return shipping;
  const parts = [
    order.customer?.first_name,
    order.customer?.last_name,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function shopifyLegacyId(shopDomain: string, orderId: number): string {
  const shop = shopDomain.replace(/\.myshopify\.com$/, "");
  return `shopify:${shop}:${orderId}`;
}

export function shopifyLineLegacyId(
  shopDomain: string,
  orderId: number,
  lineId: number,
): string {
  const shop = shopDomain.replace(/\.myshopify\.com$/, "");
  return `shopify:${shop}:${orderId}:${lineId}`;
}

export function shopifyTransactionLegacyId(
  shopDomain: string,
  orderId: number,
  transactionId: number,
): string {
  const shop = shopDomain.replace(/\.myshopify\.com$/, "");
  return `shopify:${shop}:${orderId}:txn:${transactionId}`;
}

export function mapShopifyOrder(input: {
  order: ShopifyRestOrder;
  shopDomain: string;
  storeId: string;
  channelId: string;
}): {
  orderId: number;
  orderNumber: string;
  needsPayments: boolean;
  financialStatus: string | null;
  outstanding: number | null;
  remark: string | null;
  shippingMethodTitle: string | null;
  districtSources: ShopifyDistrictSources;
  hasDistrictHint: boolean;
  orderRow: Record<string, unknown>;
  lines: Array<{
    lineId: number;
    sku: string | null;
    properties: Array<{ name?: string; value?: string | null }>;
    variantTitle: string | null;
    row: Record<string, unknown>;
  }>;
} | null {
  const orderId = numericId(input.order.id);
  if (!orderId) return null;
  const orderNumber = String(input.order.name ?? `#${orderId}`).trim();
  const remark = collectRemarkText(input.order);
  const freeDrinkRemark = collectFreeDrinkRemarkText(input.order);
  const delivery = extractDeliveryFields(input.order);
  const remarkDelivery = extractDeliveryFromRemark(remark);
  const districtSources = extractShopifyDistrictSources(input.order);
  const shippingFee = (input.order.shipping_lines ?? []).reduce(
    (sum, line) => sum + money(line.price),
    0,
  );
  const legacyId = shopifyLegacyId(input.shopDomain, orderId);
  const currency = String(input.order.currency ?? "HKD").slice(0, 3).toUpperCase();
  const financialStatus = shopifyFinancialStatus(input.order);
  const outstanding = shopifyOutstanding(input.order);

  const orderRow = {
    legacy_id: legacyId,
    customer_id: null,
    channel_id: input.channelId,
    order_number: orderNumber,
    document_type: "order",
    source_system: "shopify",
    shopify_store_id: input.storeId,
    shopify_order_id: orderId,
    customer_name_snapshot: customerName(input.order),
    company_name_snapshot: input.order.shipping_address?.company?.trim() || null,
    email_snapshot: input.order.email?.trim() ||
      input.order.customer?.email?.trim() ||
      null,
    contact_number_a_snapshot: normalizeShopifyPhone(
      input.order.phone ||
        input.order.shipping_address?.phone ||
        input.order.customer?.phone,
    ),
    shipping_address_snapshot: joinAddress(input.order.shipping_address),
    customer_note_snapshot: stripShopifyCustomProductRemark(input.order.note),
    currency,
    discount_amount: money(input.order.total_discounts),
    shipping_fee: shippingFee,
    grand_total: money(input.order.total_price),
    ...(outstanding === null ? {} : { outstanding }),
    payment_status_source: "shopify",
    shopify_financial_status: financialStatus,
    shopify_financial_status_synced_at: new Date().toISOString(),
    delivery_at: delivery.deliveryAt ?? remarkDelivery.deliveryAt,
    delivery_time: normalizeShopifyDeliveryTime(
      delivery.deliveryTime ?? remarkDelivery.deliveryTime,
    ),
    // Shopify notes are customer-facing source data, not internal remarks.
    remarks: null,
    is_shopify_order: true,
    bubble_created_at: input.order.created_at ?? null,
    bubble_modified_at: input.order.updated_at ?? null,
  };

  const lines = (input.order.line_items ?? []).flatMap((item, index) => {
    const lineId = numericId(item.id);
    if (!lineId) return [];
    const sku = item.sku?.trim() || null;
    const quantity = money(item.quantity ?? 0);
    const grossTotal = money(item.price) * quantity;
    return [{
      lineId,
      sku,
      properties: item.properties ?? [],
      variantTitle: item.variant_title?.trim() || null,
      row: {
        legacy_id: shopifyLineLegacyId(input.shopDomain, orderId, lineId),
        order_legacy_id: legacyId,
        shopify_line_id: lineId,
        sku_snapshot: sku,
        product_name_snapshot: (item.title || item.name || "").trim() || null,
        quantity,
        unit_price: money(item.price),
        total_price: grossTotal,
        item_order: index + 1,
        is_addon: false,
        is_void: false,
        bubble_created_at: input.order.created_at ?? null,
        bubble_modified_at: input.order.updated_at ?? null,
      },
    }];
  });

  return {
    orderId,
    orderNumber,
    needsPayments: orderNeedsTransactionSync(input.order),
    financialStatus,
    outstanding,
    remark,
    freeDrinkRemark,
    shippingMethodTitle: shopifyShippingMethodTitle(input.order),
    districtSources,
    hasDistrictHint: Boolean(
      districtSources.noteDistrict ||
        districtSources.city ||
        districtSources.address1,
    ),
    orderRow,
    lines,
  };
}

const SHOPIFY_CUSTOM_PRODUCT_LABEL =
  /^\s*custom\s+product(?:\s*[:：].*)?\s*$/i;

export function isShopifyCustomProductProperty(
  property: { name?: string; value?: string | null },
): boolean {
  const name = String(property.name ?? "").replace(/^_+/, "").trim();
  return SHOPIFY_CUSTOM_PRODUCT_LABEL.test(name);
}

export function stripShopifyCustomProductRemark(
  value: string | null | undefined,
): string | null {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !SHOPIFY_CUSTOM_PRODUCT_LABEL.test(line));
  return lines.join("\n") || null;
}

/**
 * Collects the free-form remark text attached to an order. The catering store
 * keeps the selected menu options (and delivery date/time) inside the order
 * note and its note_attributes, so both are merged here. Shopify's
 * "Custom Product: <id>" metadata is an internal option-app marker, not a
 * customer remark.
 */
export function collectRemarkText(order: ShopifyRestOrder): string | null {
  const parts: string[] = [];
  const note = stripShopifyCustomProductRemark(order.note);
  if (note) parts.push(note);
  for (const attr of order.note_attributes ?? []) {
    if (isShopifyCustomProductProperty(attr)) continue;
    const value = stripShopifyCustomProductRemark(attr.value);
    if (value) parts.push(value);
  }
  const merged = parts.join("\n").trim();
  return merged || null;
}

export function collectFreeDrinkRemarkText(
  order: ShopifyRestOrder,
): string | null {
  const parts: string[] = [];
  const note = stripShopifyCustomProductRemark(order.note);
  if (note) parts.push(note);
  for (const attr of order.note_attributes ?? []) {
    if (isShopifyCustomProductProperty(attr)) continue;
    const value = stripShopifyCustomProductRemark(attr.value);
    if (!value) continue;
    parts.push(`${String(attr.name ?? "").replace(/^_+/, "").trim()}: ${value}`);
  }
  return parts.join("\n").trim() || null;
}

export type ShopifyFreeDrink = {
  name: string;
  quantity: number;
  unit: string;
};

export function isShopifyBeverageName(value: string | null | undefined): boolean {
  return /(?:茶|可樂|汽水|果汁|咖啡|water|tea|coke|coffee|juice)/i.test(String(value ?? ""));
}

/** Keeps lunch-box variant choices as operational remarks while excluding the
 * trailing drink choice, which is rebuilt as its own generated line. */
export function shopifyLunchBoxVariantRemark(
  variantTitle: string | null | undefined,
): string | null {
  const parts = String(variantTitle ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length && isShopifyBeverageName(parts.at(-1))) parts.pop();
  return parts.join("\n") || null;
}

export function shopifyDrinkSelectionQuantity(
  selection: string,
  fallbackQuantity: number,
): number {
  const explicit = selection.match(
    /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:包|盒|罐|樽|支|杯|份|packs?|boxes?|cans?|bottles?)\s*$/i,
  );
  const quantity = explicit ? Number(explicit[1]) : fallbackQuantity;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

/** Extracts tea manifests from Shopify order notes. A catalog/SKU match is not
 * required, but an explicit numeric quantity is, so unmatched tea bags are
 * retained without turning a casual mention of tea into an order line. */
export function parseShopifyFreeDrinks(
  remark: string | null | undefined,
): ShopifyFreeDrink[] {
  const text = String(remark ?? "").trim();
  if (!text) return [];

  const totals = new Map<string, ShopifyFreeDrink>();
  const pattern = /([^\n,，;；:：]{1,40}?(?:茶|tea))\s*(?:[xX×*]\s*)?(\d+(?:\.\d+)?)\s*(包|盒|罐|樽|支|杯|份|packs?|boxes?|cans?|bottles?)?/gi;
  for (const match of text.matchAll(pattern)) {
    const name = match[1]
      .replace(/^(?:免費(?:的)?(?:飲品|茶)?|(?:free|complimentary)\s*(?:drink|tea|beverage)?)[\s:：-]*/i, "")
      .trim();
    const quantity = Number(match[2]);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
    const rawUnit = String(match[3] ?? "").toLowerCase();
    const unit = /^(?:box|boxes)$/.test(rawUnit)
      ? "盒"
      : /^(?:can|cans)$/.test(rawUnit)
      ? "罐"
      : /^(?:bottle|bottles)$/.test(rawUnit)
      ? "樽"
      : /^(?:pack|packs)$/.test(rawUnit)
      ? "包"
      : rawUnit || "包";
    const key = normalizeNameForMatch(name);
    const current = totals.get(key);
    totals.set(key, {
      name: current?.name ?? name,
      quantity: (current?.quantity ?? 0) + quantity,
      unit: current?.unit ?? unit,
    });
  }
  return [...totals.values()];
}

/** A complimentary tea manifest in the note is authoritative. Remove only
 * zero-price tea source rows; paid beverages and unrelated free items remain. */
export function replaceShopifyFreeDrinkSourceLines(
  lines: Array<Record<string, unknown>>,
  replacements: ShopifyFreeDrink[],
): Array<Record<string, unknown>> {
  if (!replacements.length) return lines;
  return lines.filter((line) => {
    const name = String(line.product_name_snapshot ?? "");
    const unitPrice = Number(line.unit_price ?? 0);
    return unitPrice !== 0 || !isShopifyBeverageName(name);
  });
}

const PAYMENT_KINDS = new Set(["sale", "capture"]);

const UNPAID_FINANCIAL_STATUSES = new Set(["pending"]);

export function orderNeedsTransactionSync(order: ShopifyRestOrder): boolean {
  const status = String(order.financial_status ?? "").toLowerCase();
  return !UNPAID_FINANCIAL_STATUSES.has(status);
}

export type MenuOption = {
  name: string;
  quantity: number;
  surcharge?: number | null;
};

export type ShopifyMenuRemarkSource = {
  lineId: number;
  parentItemOrder: number | null;
  parentPackageId?: string | null;
  text: string;
};

export type ShopifyOptionAddonCandidate = {
  legacyId: string;
  itemOrder: number;
  sku: string | null;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type PlannedShopifyMenuOption = MenuOption & {
  lineId: number;
  optionIndex: number;
  itemOrder: number;
  parentPackageId: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
};

/**
 * Combines duplicate lunch-box rows emitted by Shopify's option app.
 *
 * Unmatched rows have no SKU or catalog ids, so the customer-facing name must
 * participate in the key. Otherwise two different meals with the same price
 * and remarks collapse into the first meal and its quantity is overstated.
 */
export function mergeShopifyLunchBoxLines(
  lines: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return [...lines.reduce((rows, row) => {
    const key = [
      row.sku_snapshot,
      row.product_id,
      row.package_id,
      normalizeNameForMatch(String(row.product_name_snapshot ?? "")),
      row.remarks_1,
      row.unit_price,
    ].join("|");
    const existing = rows.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity ?? 0) + Number(row.quantity ?? 0);
      existing.total_price = Number(existing.total_price ?? 0) + Number(row.total_price ?? 0);
    } else {
      rows.set(key, { ...row });
    }
    return rows;
  }, new Map<string, Record<string, unknown>>()).values()];
}

export function replaceShopifyLunchBoxAggregate(input: {
  baseLines: Array<Record<string, unknown>>;
  menuLines: Array<Record<string, unknown>>;
}): {
  baseLines: Array<Record<string, unknown>>;
  menuLines: Array<Record<string, unknown>>;
} {
  if (input.menuLines.length < 2) return input;
  const aggregateIndex = input.baseLines.findIndex((line) =>
    normalizeNameForMatch(String(line.product_name_snapshot ?? "")) ===
      normalizeNameForMatch("雙格飯盒")
  );
  if (aggregateIndex < 0) return input;

  const aggregate = input.baseLines[aggregateIndex];
  const unitPrice = Number(aggregate.unit_price ?? 0);
  const parentOrder = Number(aggregate.item_order ?? 1);
  return {
    baseLines: input.baseLines.filter((_, index) => index !== aggregateIndex),
    menuLines: input.menuLines.map((line, index) => {
      const quantity = Number(line.quantity ?? 0);
      return {
        ...line,
        unit_price: line.unit_price ?? unitPrice,
        total_price: line.total_price ?? unitPrice * quantity,
        item_order: Number((parentOrder + index / 1000).toFixed(3)),
      };
    }),
  };
}

function splitMenuOptionSurcharge(value: string): {
  text: string;
  surcharge: number | null;
} {
  const match = value.match(/^(.*?)\s*\[\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\]\s*$/);
  if (!match) return { text: value.trim(), surcharge: null };
  const amount = Number(match[2].replace(/,/g, ""));
  return {
    text: match[1].trim(),
    surcharge: Number.isFinite(amount) ? amount : null,
  };
}

function splitMenuOptionQuantity(value: string): MenuOption | null {
  const { text, surcharge } = splitMenuOptionSurcharge(value);
  const item = text.replace(/\s+/g, " ").trim();
  if (!item) return null;

  // Shopify option apps are not consistent: the multiplier may be written as
  // "x 2", "×2", "2套", "2件", "2份", etc.  A unit inside parentheses is
  // part of the catalog name, so only a trailing, non-parenthesised suffix is
  // consumed here.
  const quantityMatch = item.match(
    /^(.*?)\s*(?:(?:[xX×*]\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:套|件|份|包|罐|盒|樽|支|條))\s*$/,
  );
  const name = quantityMatch ? quantityMatch[1].trim() : item;
  const quantity = quantityMatch
    ? Number(quantityMatch[2] ?? quantityMatch[3])
    : 1;
  if (!name || !Number.isFinite(quantity) || quantity <= 0) return null;
  return surcharge == null ? { name, quantity } : { name, quantity, surcharge };
}

/** Shopify's option app emits a SKU-less "Customization Cost for {package}"
 * heading whose properties are the real dish choices. */
export function shopifyCustomizationCostParentName(
  title: string | null | undefined,
): string | null {
  const match = String(title ?? "").trim().match(/^Customization Cost for\s+(.+)$/i);
  const parent = match?.[1].trim() || null;
  return parent || null;
}

/**
 * Splits a menu-remark block into its option lines. The FCCD catering remark
 * is grouped into paragraphs whose first line is a title such as
 * "沙律 必選:" or "分享小食 7選3:"; every later line is a comma-separated
 * option list. A trailing "x N" on an option is its quantity.
 *
 * Only remarks that actually contain a menu title (必選 / N選M) are treated as
 * menu remarks; other free-form notes (delivery/pickup blocks, customer notes)
 * yield no options.
 */
export function parseMenuRemark(remark: string | null | undefined): MenuOption[] {
  if (!remark?.trim()) return [];

  // Lunch-box orders use the Shopify note as a compact manifest without a
  // "required / choose N" heading. Require at least two compartment-prefixed
  // rows with explicit quantities so ordinary free-form notes remain ignored.
  const lunchBoxOptions = remark
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /^[（(](?:單格|雙格|三格|四格|五格|六格)[）)]/.test(line) &&
      /(?:[xX×*]\s*\d+|\d+\s*(?:盒|個|份))\s*$/.test(line)
    )
    .map(splitMenuOptionQuantity)
    .filter((option): option is MenuOption => Boolean(option));
  if (lunchBoxOptions.length >= 2) {
    const declaredTotal = remark.match(/共\s*(\d+)\s*(?:盒|個|份)/)?.[1];
    const parsedTotal = lunchBoxOptions.reduce((sum, option) => sum + option.quantity, 0);
    if (!declaredTotal || Number(declaredTotal) === parsedTotal) {
      return lunchBoxOptions;
    }
  }

  // Only treat a remark as a menu when it has a menu title line such as
  // "沙律 必選:" or "分享小食 7選3:". Free-form notes (delivery/pickup
  // blocks, customer notes) yield no options.
  const titleMatch = remark.match(
    /^[^\n:：]*?(?:必選(?:\s*\d+\s*道菜)?|選\d+|\d+選\d+)\s*[:：]\s*$/m,
  );
  if (!titleMatch) return [];

  const options: MenuOption[] = [];
  const paragraphs = remark
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trim());
    const bodyStart = lines.findIndex((line) => /[:：]\s*$/.test(line));

    const body = (bodyStart >= 0 ? lines.slice(bodyStart + 1) : lines)
      .join(" ")
      .trim();
    if (!body) continue;

    const items: string[] = [];
    let current = "";
    let depth = 0;
    for (const char of body) {
      if (char === "(" || char === "（") depth += 1;
      if (char === ")" || char === "）") depth = Math.max(0, depth - 1);
      if ((char === "," || char === "，") && depth === 0) {
        items.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) items.push(current.trim());

    for (const raw of items) {
      const option = splitMenuOptionQuantity(raw);
      if (option) options.push(option);
    }
  }
  return options;
}

/**
 * Plans package child rows before catalog resolution. Shopify's product-option
 * app emits priced choices as separate, SKU-less lines whose variant title is
 * the real dish name. Those lines are folded back into the matching package
 * option and their legacy ids are returned so callers can omit the duplicate
 * heading rows.
 */
export function planShopifyMenuOptions(input: {
  sources: ShopifyMenuRemarkSource[];
  addonCandidates: ShopifyOptionAddonCandidate[];
}): {
  options: PlannedShopifyMenuOption[];
  consumedAddonLegacyIds: string[];
} {
  const options: PlannedShopifyMenuOption[] = [];
  const consumed = new Set<string>();
  let detachedOrder = 1000;

  for (const source of input.sources) {
    const parsed = parseMenuRemark(source.text);
    for (let optionIndex = 0; optionIndex < parsed.length; optionIndex += 1) {
      const option = parsed[optionIndex];
      const candidates = input.addonCandidates
        .filter((candidate) =>
          !consumed.has(candidate.legacyId) &&
          !candidate.sku &&
          candidate.totalPrice > 0 &&
          normalizeNameForMatch(candidate.variantTitle) === normalizeNameForMatch(option.name)
        )
        .sort((left, right) => {
          if (source.parentItemOrder === null) return left.itemOrder - right.itemOrder;
          const leftAfterParent = left.itemOrder > source.parentItemOrder ? 0 : 1;
          const rightAfterParent = right.itemOrder > source.parentItemOrder ? 0 : 1;
          return leftAfterParent - rightAfterParent ||
            Math.abs(left.itemOrder - source.parentItemOrder) -
              Math.abs(right.itemOrder - source.parentItemOrder);
        });
      const addon = candidates[0] ?? null;
      if (addon) consumed.add(addon.legacyId);

      const itemOrder = source.parentItemOrder === null
        ? detachedOrder++
        : Number((source.parentItemOrder + (optionIndex + 1) / 1000).toFixed(3));
      const surchargeTotal = option.surcharge == null
        ? null
        : option.surcharge * option.quantity;
      const totalPrice = addon?.totalPrice ?? surchargeTotal;
      options.push({
        ...option,
        lineId: source.lineId,
        optionIndex,
        itemOrder,
        parentPackageId: source.parentPackageId ?? null,
        unitPrice: totalPrice === null ? null : totalPrice / option.quantity,
        totalPrice,
      });
    }
  }

  return {
    options,
    consumedAddonLegacyIds: [...consumed],
  };
}

/** Returns the number of free six-person utensil packs implied by catering
 * package capacity labels such as "(8-10人)". Ad-hoc/manual overrides are data
 * concerns and can safely replace the generated row because its id is stable. */
export function shopifyCateringUtensilPacks(
  lines: Array<{ packageId: string | null; name: string | null; quantity: number }>,
): number {
  return lines.reduce((total, line) => {
    if (!line.packageId || !line.name || line.quantity <= 0) return total;
    const range = line.name.match(/(\d+)\s*[-–至]\s*(\d+)\s*(?:人|位)/);
    const single = line.name.match(/(\d+)\s*(?:人|位)/);
    const capacity = range ? Number(range[2]) : single ? Number(single[1]) : 0;
    if (!capacity) return total;
    return total + Math.ceil(capacity / 6) * line.quantity;
  }, 0);
}

/** Every dish whose customer-facing name contains "便當" receives one
 * disposable utensil set per ordered serving, regardless of Shopify store. */
export function shopifyBentoUtensilCount(
  lines: Array<{ name: string | null; sku?: string | null; quantity: number }>,
): number {
  return lines.reduce((total, line) =>
    (line.name?.includes("便當") || /^CBE/i.test(line.sku ?? "")) &&
      line.quantity > 0
      ? total + line.quantity
      : total, 0);
}

/** Rebuilds menu sections when Shopify stores the heading in a property name
 * and the comma-separated selections in its value. */
function parseShopifyCheckboxMenuValue(value: string): MenuOption[] {
  const options = parseMenuRemark(`必選:\n${value}`);
  return options.length > 0 && options.every((option) => /[)）]\s*$/.test(option.name))
    ? options
    : [];
}

/** In the dedicated lunch-box store every paid, non-beverage base product is
 * a meal requiring utensils, including new titles such as "野餐盒" that have
 * no SKU/catalog match yet. */
export function shopifyLunchBoxUtensilCount(
  lines: Array<{ name: string | null; quantity: number; unitPrice: number }>,
): number {
  return lines.reduce((total, line) =>
    line.unitPrice > 0 && line.quantity > 0 && !isShopifyBeverageName(line.name)
      ? total + line.quantity
      : total, 0);
}

function generatedLineBaseName(value: string): string {
  return value
    .replace(/\s+\d+(?:\.\d+)?\s*(?:包|盒|罐|樽|支|杯|份)\s*$/i, "")
    .trim();
}

/** Identifies only zero-price web rows superseded by regenerated Shopify
 * drinks/utensils. Other manual custom products remain untouched. */
export function staleGeneratedCustomLineIds(input: {
  existing: Array<{ id: string; name: string | null; unitPrice: number }>;
  generatedNames: string[];
}): string[] {
  const generated = new Set(input.generatedNames.map((name) =>
    normalizeNameForMatch(generatedLineBaseName(name))
  ).filter(Boolean));
  return input.existing.flatMap((row) => {
    if (row.unitPrice !== 0) return [];
    const key = normalizeNameForMatch(generatedLineBaseName(row.name ?? ""));
    return key && generated.has(key) ? [row.id] : [];
  });
}

function looksLikeShopifyMenuCheckboxValue(value: string): boolean {
  return /[（(]\s*\d+(?:\.\d+)?\s*(?:磅|件|串|份|盒|包|位|人)\s*[）)]/.test(value);
}

export function isShopifyMenuSelectionProperty(
  property: { name?: string; value?: string | null },
): boolean {
  const name = String(property.name ?? "").replace(/^_+/, "").trim();
  const value = String(property.value ?? "").trim();
  if (!value) return false;
  if (parseMenuRemark(value).length) return true;
  // The Shopify checkbox app emits generic property names ("checkbox-1",
  // "checkbox-2", ...) instead of a package section heading. Rebuild a menu
  // heading before parsing it. Keeping the property-name match exact prevents
  // arbitrary line properties from being treated as dish choices; an unusual
  // checkbox value can then be interpreted by the guarded AI fallback.
  if (/^checkbox-\d+$/i.test(name)) {
    return parseShopifyCheckboxMenuValue(value).length > 0 ||
      looksLikeShopifyMenuCheckboxValue(value);
  }
  if (/(?:必選|選\s*\d+|\d+\s*選\s*\d+)/.test(name)) {
    return parseMenuRemark(`${name.replace(/[:：]\s*$/, "")}:\n${value}`).length > 0;
  }
  return false;
}

export function collectLineMenuRemarkText(
  properties: Array<{ name?: string; value?: string | null }>,
): string | null {
  const blocks: string[] = [];
  for (const property of properties) {
    if (!isShopifyMenuSelectionProperty(property)) continue;
    const name = String(property.name ?? "").replace(/^_+/, "").trim();
    const value = String(property.value ?? "").trim();
    if (parseMenuRemark(value).length) blocks.push(value);
    else if (/^checkbox-\d+$/i.test(name)) {
      blocks.push(`必選:\n${value}`);
    }
    else blocks.push(`${name.replace(/[:：]\s*$/, "")}:\n${value}`);
  }
  return blocks.join("\n\n") || null;
}

const IGNORED_LINE_PROPERTY_NAME =
  /(?:飲品|drink|beverage|pickup|delivery|送貨|日期|時間|internal_id)/i;

/** Line remarks assembled from Shopify product properties. Parsed menu
 * selections stay in remarks as source evidence even after child product rows
 * are generated, so staff can still see the customer's original choices. */
export function shopifyLineRemarksSnapshot(input: {
  properties: Array<{ name?: string; value?: string | null }>;
  optionRemark?: string | null;
  variantRemark?: string | null;
  existing?: unknown;
  omitMenuSelections?: boolean;
}): string | null {
  const propertyRemark = input.properties
    .map((property) => ({
      name: String(property.name ?? ""),
      value: stripShopifyCustomProductRemark(property.value),
    }))
    .filter((property) =>
      Boolean(property.value) &&
      !/^_/.test(property.name) &&
      !isShopifyCustomProductProperty(property) &&
      !IGNORED_LINE_PROPERTY_NAME.test(property.name) &&
      (!input.omitMenuSelections || !isShopifyMenuSelectionProperty(property))
    )
    .map((property) => property.value)
    .join("\n") || null;
  return [
    input.omitMenuSelections ? null : input.optionRemark,
    propertyRemark,
    input.variantRemark ?? null,
    typeof input.existing === "string" ? input.existing : null,
  ]
    .map((value) => stripShopifyCustomProductRemark(value))
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("\n") || null;
}

export function stripParsedMenuRemarksFromLines(input: {
  lines: Array<Record<string, unknown>>;
  parsedSourceLineIds: Iterable<number>;
  mappedLines: Array<{
    lineId: number;
    properties: Array<{ name?: string; value?: string | null }>;
    variantTitle: string | null;
    row: Record<string, unknown>;
  }>;
  lunchBox: boolean;
}): Array<Record<string, unknown>> {
  const parsed = new Set([...input.parsedSourceLineIds].filter((lineId) => lineId > 0));
  if (!parsed.size) return input.lines;
  const sourceByLineId = new Map(input.mappedLines.map((line) => {
    const rawName = (line.row.product_name_snapshot as string | null) ?? null;
    return [line.lineId, {
      properties: line.properties,
      optionRemark: extractOptionRemark(rawName),
      variantRemark: input.lunchBox
        ? shopifyLunchBoxVariantRemark(line.variantTitle)
        : null,
    }] as const;
  }));
  return input.lines.map((row) => {
    const lineId = numericId(row.shopify_line_id as number | string | null);
    if (!lineId || !parsed.has(lineId)) return row;
    const source = sourceByLineId.get(lineId);
    return {
      ...row,
      remarks_1: shopifyLineRemarksSnapshot({
        properties: source?.properties ?? [],
        optionRemark: source?.optionRemark ?? null,
        variantRemark: source?.variantRemark ?? null,
        existing: null,
        // Keep Shopify's original option text as an operational remark. The
        // generated child/content rows are structured data, while this is the
        // source wording staff use to verify the import.
        omitMenuSelections: false,
      }),
    };
  });
}

export function normalizeNameForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/[，,]/g, ",")
    .replace(/乾/g, "干")
    .replace(/^\(素\)/, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("zh-HK");
}

export function shopifyMenuOptionLegacyId(
  shopDomain: string,
  orderId: number,
  lineId: number,
  optionIndex: number,
): string {
  const shop = shopDomain.replace(/\.myshopify\.com$/, "");
  return `shopify:${shop}:${orderId}:${lineId}:opt:${optionIndex}`;
}

/**
 * Searches a free-form remark for a delivery date or time. Handles both
 * labelled lines ("送貨日期: 2026-08-20") and bare values found in Shopify's
 * pickup/delivery note blocks, e.g. "21/08/2026", "Fri, 21 Aug 2026",
 * "05:00 PM - 06:00 PM", "11:00 AM - 12:00 PM". Values duplicated across the
 * note (Shopify repeats the slot) are tolerated.
 */
export function extractDeliveryFromRemark(remark: string | null | undefined): {
  deliveryAt: string | null;
  deliveryTime: string | null;
} {
  if (!remark) return { deliveryAt: null, deliveryTime: null };

  let deliveryAt: string | null = null;
  let deliveryTime: string | null = null;

  const lines = remark.split("\n").map((line) => line.trim()).filter(Boolean);

  // Pass 1: labelled lines take precedence.
  for (const line of lines) {
    const dateMatch = line.match(
      /^(?:送貨日期|送貨日|delivery\s*date|日期)[:：]\s*(.+)$/i,
    );
    if (dateMatch) {
      deliveryAt = parseDeliveryAt(dateMatch[1].trim()) ?? deliveryAt;
      continue;
    }
    const timeMatch = line.match(
      /^(?:送貨時間|delivery\s*time|time\s*slot|時間)[:：]\s*(.+)$/i,
    );
    if (timeMatch) {
      deliveryTime = timeMatch[1].trim() || deliveryTime;
    }
  }

  // Pass 2: bare values. Skip obviously non-delivery lines (section headers,
  // notes, ids). The first parseable date/time wins.
  for (const line of lines) {
    if (/^(?:pickup|delivery|shipping|送貨|需要|星期五|週五|friday|dd\/mm|\.\.\.)/i.test(line)) {
      continue;
    }
    if (deliveryAt === null) {
      // Normalize d/m/yyyy (Shopify Hong Kong uses day/month/year) to ISO.
      const slashMatch = line.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
      const normalized = slashMatch
        ? `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`
        : line;
      const parsed = parseDeliveryAt(normalized);
      if (
        parsed &&
        (/^\d{4}-\d{2}-\d{2}/.test(normalized) ||
          /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月)\b/i.test(normalized))
      ) {
        deliveryAt = parsed;
      }
    }
    if (deliveryTime === null) {
      const timeMatch = line.match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM|上午|下午)?\s*[-–—~到至]\s*\d{1,2}:\d{2}\s*(?:AM|PM|上午|下午)?\b/i,
      );
      if (timeMatch) deliveryTime = timeMatch[0].trim();
    }
  }

  return { deliveryAt, deliveryTime };
}

export function mapShopifyTransaction(input: {
  transaction: ShopifyRestTransaction;
  shopDomain: string;
  orderId: number;
  orderSupabaseId: string;
  orderLegacyId: string;
  channelId: string;
  orderNumber: string;
  orderCurrency: string;
}): Record<string, unknown> | null {
  const txnId = numericId(input.transaction.id);
  if (!txnId) return null;

  const kind = String(input.transaction.kind ?? "").toLowerCase();
  const status = String(input.transaction.status ?? "").toLowerCase();
  if (!PAYMENT_KINDS.has(kind) || status !== "success") return null;

  const amount = money(input.transaction.amount);
  if (amount <= 0) return null;

  const gateway = String(input.transaction.gateway ?? "").trim();
  const authorization = String(input.transaction.authorization ?? "").trim() || null;
  const rawCurrency = String(
    input.transaction.currency ?? input.orderCurrency ?? "HKD",
  ).trim().slice(0, 3).toUpperCase();
  const currency = rawCurrency || "HKD";

  return {
    legacy_id: shopifyTransactionLegacyId(input.shopDomain, input.orderId, txnId),
    order_id: input.orderSupabaseId,
    order_legacy_id: input.orderLegacyId,
    channel_id: input.channelId,
    channel_legacy_id: null,
    payment_method_id: null,
    payment_method_legacy_id: null,
    order_number_snapshot: input.orderNumber,
    currency,
    amount,
    payment_at: input.transaction.created_at ?? null,
    payout_at: null,
    paypal_reference: gateway.toLowerCase().includes("paypal") ? authorization : null,
    receipt_reference: authorization ?? String(txnId),
    bubble_created_at: input.transaction.created_at ?? null,
    bubble_modified_at: input.transaction.created_at ?? null,
    voided_at: null,
  };
}

export type ComparablePayment = {
  legacy_id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  payment_at?: unknown;
};

export type OperationalOrderCandidate = {
  id: string;
  order_number: string | null;
  channel_id: string | null;
  source_system: string | null;
  shopify_order_id: number | null;
};

export type OperationalOrderMatch =
  | { status: "none" }
  | { status: "ambiguous" }
  | { status: "unique"; orderId: string };

function normalizedOrderNumber(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Finds an operational order that arrived after its Shopify shadow. Automatic
 * reconciliation is deliberately limited to one unlinked non-Shopify record;
 * the database RPC performs the final customer/amount validation atomically.
 */
export function resolveOperationalOrderMatch(input: {
  currentOrderId: string;
  orderNumber: string;
  channelId: string;
  candidates: OperationalOrderCandidate[];
}): OperationalOrderMatch {
  const key = normalizedOrderNumber(input.orderNumber);
  const matches = input.candidates.filter((candidate) =>
    candidate.id !== input.currentOrderId &&
    candidate.source_system !== "shopify" &&
    candidate.shopify_order_id == null &&
    normalizedOrderNumber(candidate.order_number) === key &&
    candidate.channel_id === input.channelId
  );
  if (!matches.length) return { status: "none" };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "unique", orderId: matches[0].id };
}

function hongKongDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = valueOf("year");
  const month = valueOf("month");
  const day = valueOf("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/** Identifies one receipt across Bubble's date-only value and Shopify time. */
export function paymentDuplicateKey(row: ComparablePayment): string | null {
  const orderId = typeof row.order_id === "string" ? row.order_id.trim() : "";
  const amount = Number(row.amount);
  const currency = String(row.currency ?? "HKD").trim().toUpperCase();
  const paymentDate = hongKongDate(row.payment_at);
  if (!orderId || !Number.isFinite(amount) || !currency || !paymentDate) return null;
  return `${orderId}|${amount.toFixed(2)}|${currency}|${paymentDate}`;
}

/**
 * Removes one Shopify row per matching legacy receipt. One-to-one consumption
 * preserves legitimate same-day instalments with equal amounts.
 */
export function filterLegacyPaymentDuplicates<T extends ComparablePayment>(
  shopifyRows: T[],
  existingRows: ComparablePayment[],
): T[] {
  const legacyCounts = new Map<string, number>();
  for (const row of existingRows) {
    if (String(row.legacy_id ?? "").startsWith("shopify:")) continue;
    const key = paymentDuplicateKey(row);
    if (key) legacyCounts.set(key, (legacyCounts.get(key) ?? 0) + 1);
  }

  return shopifyRows.filter((row) => {
    const key = paymentDuplicateKey(row);
    if (!key) return true;
    const matches = legacyCounts.get(key) ?? 0;
    if (matches <= 0) return true;
    legacyCounts.set(key, matches - 1);
    return false;
  });
}

export function pickCatalogMatch(
  sku: string,
  products: Array<{ id: string; sku: string | null; channel_id: string | null }>,
  packages: Array<{ id: string; sku: string | null; channel_id: string | null }>,
  channelId: string,
): { productId: string | null; packageId: string | null } {
  const needle = sku.trim().toLowerCase();
  if (!needle) return { productId: null, packageId: null };

  const productExact = products.filter((row) =>
    (row.sku ?? "").trim().toLowerCase() === needle && row.channel_id === channelId
  );
  if (productExact.length === 1) {
    return { productId: productExact[0].id, packageId: null };
  }

  const packageExact = packages.filter((row) =>
    (row.sku ?? "").trim().toLowerCase() === needle && row.channel_id === channelId
  );
  if (packageExact.length === 1) {
    return { productId: null, packageId: packageExact[0].id };
  }

  const productAny = products.filter((row) =>
    (row.sku ?? "").trim().toLowerCase() === needle
  );
  if (productAny.length === 1) {
    return { productId: productAny[0].id, packageId: null };
  }

  const packageAny = packages.filter((row) =>
    (row.sku ?? "").trim().toLowerCase() === needle
  );
  if (packageAny.length === 1) {
    return { productId: null, packageId: packageAny[0].id };
  }

  return { productId: null, packageId: null };
}

/**
 * Resolves a Shopify line item to a catalog product/package, matching first by
 * SKU then by the item's name/title. Shopify lines sometimes omit the SKU, but
 * the title often equals the catalog product name (e.g. "(雙格) 拿破崙雞扒意粉").
 * Shopify SKUs also carry a numeric suffix ("CBESE06-51") that the catalog
 * stores without it ("CBESE06"), so the suffix is stripped before matching.
 */
export function pickCatalogMatchByName(
  sku: string | null,
  name: string | null,
  products: Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }>,
  packages: Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }>,
  channelId: string,
): { productId: string | null; packageId: string | null } {
  const candidates = [
    sku?.trim() || null,
    sku ? stripSkuSuffix(sku) : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of [...new Set(candidates)]) {
    const bySku = pickCatalogMatch(
      candidate,
      products.map(({ id, sku: s, channel_id: c }) => ({ id, sku: s, channel_id: c })),
      packages.map(({ id, sku: s, channel_id: c }) => ({ id, sku: s, channel_id: c })),
      channelId,
    );
    if (bySku.productId || bySku.packageId) return bySku;
  }

  // Known loose names that appear on Shopify lines but not as catalog names.
  const alias = resolveAliasSku(name);
  if (alias) {
    const byAlias = pickCatalogMatch(
      alias,
      products.map(({ id, sku: s, channel_id: c }) => ({ id, sku: s, channel_id: c })),
      packages.map(({ id, sku: s, channel_id: c }) => ({ id, sku: s, channel_id: c })),
      channelId,
    );
    if (byAlias.productId || byAlias.packageId) return byAlias;
  }

  const needle = normalizeNameForMatch(name);
  if (!needle) return { productId: null, packageId: null };

  const productByName = products.filter(
    (row) => normalizeNameForMatch(row.name) === needle &&
      row.channel_id === channelId,
  );
  if (productByName.length === 1) {
    return { productId: productByName[0].id, packageId: null };
  }

  const packageByName = packages.filter(
    (row) => normalizeNameForMatch(row.name) === needle &&
      row.channel_id === channelId,
  );
  if (packageByName.length === 1) {
    return { productId: null, packageId: packageByName[0].id };
  }

  return { productId: null, packageId: null };
}

/**
 * Strips a trailing "-<digits>" (or "<digits>") suffix from a Shopify SKU so it
 * matches the catalog SKU. "CBESE06-51" -> "CBESE06", "CBA003-18" -> "CBA003".
 */
export function stripSkuSuffix(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const trimmed = sku.trim();
  const base = trimmed.replace(/-\d+$/, "").trim();
  return base || null;
}

/** Keeps the Shopify SKU when present and otherwise snapshots the SKU from
 * the catalog row that name matching already resolved. */
export function resolveShopifySkuSnapshot(input: {
  shopifySku: string | null;
  productId: string | null;
  packageId: string | null;
  products: Array<{ id: string; sku: string | null; channel_id: string | null }>;
  packages: Array<{ id: string; sku: string | null; channel_id: string | null }>;
  stripSuffix: boolean;
}): string | null {
  const catalogSku = input.productId
    ? input.products.find((row) => row.id === input.productId)?.sku ?? null
    : input.packageId
    ? input.packages.find((row) => row.id === input.packageId)?.sku ?? null
    : null;
  const resolved = input.shopifySku?.trim() || catalogSku?.trim() || null;
  return input.stripSuffix ? stripSkuSuffix(resolved) : resolved;
}

/** Fills snapshots that a linked Bubble order left blank without replacing
 * non-blank historical values. Shopify remains the source for the current
 * display title and gross line amount. */
export function linkedOrderLineSnapshotPatch(input: {
  existing: {
    productName: string | null;
    unitPrice: number | null;
    totalPrice: number | null;
  };
  shopify: {
    productName: string | null;
    unitPrice: number | null;
    totalPrice: number | null;
  };
}): Record<string, string | number> | null {
  const patch: Record<string, string | number> = {};
  const title = input.shopify.productName?.trim();
  if (!input.existing.productName?.trim() && title) {
    patch.product_name_snapshot = title;
  }
  if (input.existing.unitPrice === null && input.shopify.unitPrice !== null) {
    patch.unit_price = input.shopify.unitPrice;
  }
  if (input.existing.totalPrice === null && input.shopify.totalPrice !== null) {
    patch.total_price = input.shopify.totalPrice;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Loose display names used on Shopify lines that the catalog stores under a
 * different SKU prefix. Returns a canonical SKU prefix to try, or null.
 */
export function resolveAliasSku(name: string | null | undefined): string | null {
  const normalized = normalizeNameForMatch(name);
  if (!normalized) return null;
  if (/^\(便當\)咕嚕雞球飯(?:\([^)]*\))?$/.test(normalized)) {
    // Shopify uses a generic "便當" label and appends the selected side
    // dishes, while the approved HK Lunch Box catalog stores this meal as
    // "(雙格) 咕嚕雞球飯".
    return "CBE022";
  }
  if (/^\(便當\)粟米魚塊飯(?:\([^)]*\))?$/.test(normalized)) {
    return "CBE083";
  }
  if (/^(?:\(凍\))?(?:可口可樂|可樂)/.test(normalized)) {
    // The catalog stores Coke under the CDR001-* / EDR001-* prefix.
    const match = normalized.match(/可樂[^)]*?(\d+)\s*(罐|包|份)?/);
    if (match) {
      return `CDR001-${match[1]}`;
    }
    return "CDR001";
  }
  if (normalized === "川式涼拌青瓜魚片(1磅)") return "CCO024-1";
  return null;
}

/**
 * Extracts the "配 ..." option text from a line item title, mirroring how the
 * legacy Bubble system encoded selections (e.g. "(三格) 肉醬意粉盒 配瑞士雞翼 2隻").
 * Returns the option text or null when there is no option section.
 */
export function extractOptionRemark(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  const match = trimmed.match(
    /(?:配|（配|\(配)\s*(.+?)\s*$/,
  );
  if (!match) return null;
  const option = match[1].trim();
  return option || null;
}
