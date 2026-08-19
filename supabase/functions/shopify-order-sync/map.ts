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

function joinAddress(address: ShopifyRestAddress | null | undefined): string | null {
  if (!address) return null;
  const parts = [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
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

export function shopifyShippingLineLegacyId(
  shopDomain: string,
  orderId: number,
  lineId: number,
): string {
  const shop = shopDomain.replace(/\.myshopify\.com$/, "");
  return `shopify:${shop}:${orderId}:shipping:${lineId}`;
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
  remark: string | null;
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
  const delivery = extractDeliveryFields(input.order);
  const remarkDelivery = extractDeliveryFromRemark(remark);
  const shippingFee = (input.order.shipping_lines ?? []).reduce(
    (sum, line) => sum + money(line.price),
    0,
  );
  const legacyId = shopifyLegacyId(input.shopDomain, orderId);
  const currency = String(input.order.currency ?? "HKD").slice(0, 3).toUpperCase();

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
    contact_number_a_snapshot: input.order.phone?.trim() ||
      input.order.shipping_address?.phone?.trim() ||
      input.order.customer?.phone?.trim() ||
      null,
    shipping_address_snapshot: joinAddress(input.order.shipping_address) ??
      joinAddress(input.order.billing_address),
    customer_note_snapshot: input.order.note?.trim() || null,
    currency,
    discount_amount: money(input.order.total_discounts),
    shipping_fee: shippingFee,
    grand_total: money(input.order.total_price),
    delivery_at: delivery.deliveryAt ?? remarkDelivery.deliveryAt,
    delivery_time: delivery.deliveryTime ?? remarkDelivery.deliveryTime,
    remarks: remark?.trim() || (input.order.cancelled_at
      ? `Shopify cancelled_at=${input.order.cancelled_at}`
      : null),
    is_shopify_order: true,
    bubble_created_at: input.order.created_at ?? null,
    bubble_modified_at: input.order.updated_at ?? null,
  };

  const productLines = (input.order.line_items ?? []).flatMap((item, index) => {
    const lineId = numericId(item.id);
    if (!lineId) return [];
    const sku = item.sku?.trim() || null;
    const quantity = money(item.quantity ?? 0);
    const grossTotal = money(item.price) * quantity;
    const allocatedDiscount = (item.discount_allocations ?? []).reduce(
      (total, allocation) => total + money(allocation.amount),
      0,
    );
    const discount = allocatedDiscount || money(item.total_discount);
    const netTotal = Math.max(0, grossTotal - discount);
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
        unit_price: quantity ? netTotal / quantity : money(item.price),
        total_price: netTotal,
        item_order: index + 1,
        is_addon: false,
        is_void: false,
        bubble_created_at: input.order.created_at ?? null,
        bubble_modified_at: input.order.updated_at ?? null,
      },
    }];
  });

  const shippingLines = (input.order.shipping_lines ?? []).flatMap((line, index) => {
    const lineId = numericId(line.id);
    const name = String(line.title ?? line.code ?? "運費").trim();
    if (!lineId || !name) return [];
    const allocatedDiscount = (line.discount_allocations ?? []).reduce(
      (total, allocation) => total + money(allocation.amount),
      0,
    );
    const price = line.discounted_price === null || line.discounted_price === undefined
      ? Math.max(0, money(line.price) - allocatedDiscount)
      : money(line.discounted_price);
    return [{
      lineId,
      sku: null,
      properties: [],
      variantTitle: null,
      row: {
        legacy_id: shopifyShippingLineLegacyId(input.shopDomain, orderId, lineId),
        order_legacy_id: legacyId,
        shopify_line_id: null,
        sku_snapshot: null,
        product_name_snapshot: name,
        quantity: 1,
        unit_price: price,
        total_price: price,
        item_order: productLines.length + index + 1,
        is_addon: true,
        is_void: false,
        bubble_created_at: input.order.created_at ?? null,
        bubble_modified_at: input.order.updated_at ?? null,
      },
    }];
  });

  const lines = [...productLines, ...shippingLines];

  return {
    orderId,
    orderNumber,
    needsPayments: orderNeedsTransactionSync(input.order),
    remark,
    orderRow,
    lines,
  };
}

/**
 * Collects the free-form remark text attached to an order. The catering store
 * keeps the selected menu options (and delivery date/time) inside the order
 * note and its note_attributes, so both are merged here.
 */
export function collectRemarkText(order: ShopifyRestOrder): string | null {
  const parts: string[] = [];
  if (order.note?.trim()) parts.push(order.note.trim());
  for (const attr of order.note_attributes ?? []) {
    const value = String(attr.value ?? "").trim();
    if (value) parts.push(value);
  }
  const merged = parts.join("\n").trim();
  return merged || null;
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
};

function splitMenuOptionQuantity(value: string): MenuOption | null {
  const item = value.replace(/\s+/g, " ").trim();
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
  return name && Number.isFinite(quantity) && quantity > 0
    ? { name, quantity }
    : null;
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

  // Only treat a remark as a menu when it has a menu title line such as
  // "沙律 必選:" or "分享小食 7選3:". Free-form notes (delivery/pickup
  // blocks, customer notes) yield no options.
  const titleMatch = remark.match(
    /^(?:[^\n:：]*?\s)?(?:必選|選\d+|\d+選\d+)\s*[:：]\s*$/m,
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

/** Rebuilds menu sections when Shopify stores the heading in a property name
 * and the comma-separated selections in its value. */
export function collectLineMenuRemarkText(
  properties: Array<{ name?: string; value?: string | null }>,
): string | null {
  const blocks: string[] = [];
  for (const property of properties) {
    const name = String(property.name ?? "").replace(/^_+/, "").trim();
    const value = String(property.value ?? "").trim();
    if (!value) continue;
    if (parseMenuRemark(value).length) {
      blocks.push(value);
    } else if (/(?:必選|選\s*\d+|\d+\s*選\s*\d+)/.test(name)) {
      blocks.push(`${name.replace(/[:：]\s*$/, "")}:\n${value}`);
    }
  }
  return blocks.join("\n\n") || null;
}

export function normalizeNameForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/[，,]/g, ",")
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

/**
 * Loose display names used on Shopify lines that the catalog stores under a
 * different SKU prefix. Returns a canonical SKU prefix to try, or null.
 */
export function resolveAliasSku(name: string | null | undefined): string | null {
  const normalized = normalizeNameForMatch(name);
  if (!normalized) return null;
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
