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
  sku?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  price?: string | number | null;
  properties?: Array<{ name?: string; value?: string | null }>;
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
  shipping_lines?: Array<{ price?: string | number | null }>;
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
  const parsed = Date.parse(value);
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

  const lines = (input.order.line_items ?? []).flatMap((item, index) => {
    const lineId = numericId(item.id);
    if (!lineId) return [];
    const sku = item.sku?.trim() || null;
    return [{
      lineId,
      sku,
      row: {
        legacy_id: shopifyLineLegacyId(input.shopDomain, orderId, lineId),
        order_legacy_id: legacyId,
        shopify_line_id: lineId,
        sku_snapshot: sku,
        product_name_snapshot: (item.title || item.name || "").trim() || null,
        quantity: money(item.quantity ?? 0),
        unit_price: money(item.price),
        total_price: money(item.price) * money(item.quantity ?? 0),
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

/**
 * Splits a menu-remark block into its option lines. The FCCD catering remark
 * is grouped into paragraphs whose first line is a title such as
 * "沙律 必選:" or "分享小食 7選3:"; every later line is a comma-separated
 * option list. A trailing "x N" on an option is its quantity.
 */
export function parseMenuRemark(remark: string | null | undefined): MenuOption[] {
  if (!remark?.trim()) return [];

  const options: MenuOption[] = [];
  const paragraphs = remark
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trim());
    const bodyStart = lines.findIndex((line) => /[:：]\s*$/.test(line));

    // Keep the whole paragraph body; title lines like "沙律 必選:" are dropped.
    const body = (bodyStart >= 0 ? lines.slice(bodyStart + 1) : lines)
      .join(" ")
      .trim();
    if (!body) continue;

    // Split options on commas, but keep commas inside parentheses intact.
    const items: string[] = [];
    let current = "";
    let depth = 0;
    for (const char of body) {
      if (char === "(" || char === "（") depth += 1;
      if (char === ")" || char === "）") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        items.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) items.push(current.trim());

    for (const raw of items) {
      const item = raw.replace(/\s+/g, " ").trim();
      if (!item) continue;

      const quantityMatch = item.match(/^(.*?)\s*x\s*(\d+(?:\.\d+)?)\s*$/);
      const name = quantityMatch
        ? quantityMatch[1].trim()
        : item;
      const quantity = quantityMatch ? Number(quantityMatch[2]) : 1;

      if (!name) continue;
      options.push({ name, quantity });
    }
  }
  return options;
}

export function normalizeNameForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/[，,]/g, ",")
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
 * Searches a free-form remark for a delivery date or time line, e.g.
 * "送貨日期: 2026-08-20" or "送貨時間: 05:00 PM - 06:00 PM". The catering
 * store keeps these inside the same remark text as the menu options.
 */
export function extractDeliveryFromRemark(remark: string | null | undefined): {
  deliveryAt: string | null;
  deliveryTime: string | null;
} {
  if (!remark) return { deliveryAt: null, deliveryTime: null };

  let deliveryAt: string | null = null;
  let deliveryTime: string | null = null;

  for (const line of remark.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const dateMatch = trimmed.match(
      /^(?:送貨日期|送貨日|delivery\s*date|日期)[:：]\s*(.+)$/i,
    );
    if (dateMatch) {
      deliveryAt = parseDeliveryAt(dateMatch[1].trim()) ?? deliveryAt;
      continue;
    }

    const timeMatch = trimmed.match(
      /^(?:送貨時間|delivery\s*time|time\s*slot|時間)[:：]\s*(.+)$/i,
    );
    if (timeMatch) {
      deliveryTime = timeMatch[1].trim() || deliveryTime;
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

  return { productId: null, packageId: null };
}
