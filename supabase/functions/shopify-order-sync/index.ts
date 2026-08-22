import { createClient } from "npm:@supabase/supabase-js@2";
import {
  collectLineMenuRemarkText,
  extractOptionRemark,
  filterLegacyPaymentDuplicates,
  mapShopifyOrder,
  mapShopifyTransaction,
  normalizeNameForMatch,
  normalizeShopDomain,
  orderNumberKey,
  parseMenuRemark,
  pickCatalogMatchByName,
  resolveAliasSku,
  shopifyMenuOptionLegacyId,
  stripSkuSuffix,
  type ShopifyRestOrder,
  type ShopifyRestTransaction,
} from "./map.ts";

const API_VERSION = "2025-07";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;
const BACKFILL_PAGE_SIZE = 250;
const MAX_BACKFILL_ORDERS = 50000;
const PAYMENT_INSERT_CHUNK = 200;
const PAYMENT_LOOKUP_CHUNK = 500;
const MAX_TRANSACTION_FETCHES_PER_RUN = 200;

type AdminClient = ReturnType<typeof createClient<any>>;

function catalogQuery(
  client: AdminClient,
  table: "products" | "packages",
  channelId: string,
  skus: string[],
) {
  const query = client.from(table).select("id, sku, name, channel_id");
  const candidates = [...new Set(skus.flatMap((sku) =>
    [sku.trim(), stripSkuSuffix(sku)].filter((value): value is string => Boolean(value))
  ))].filter((sku) => /^[A-Za-z0-9_-]+$/.test(sku));
  return candidates.length
    ? query.or(`channel_id.eq.${channelId},sku.in.(${candidates.join(",")})`)
    : query.eq("channel_id", channelId);
}
type StoreRow = {
  id: string;
  shop_domain: string;
  channel_id: string;
  secret_prefix: string;
};

type ProcessedOrder = {
  orderId: number;
  supabaseOrderId: string;
  orderLegacyId: string;
  orderNumber: string;
  currency: string;
  needsTransactions: boolean;
};

type StoreSyncResult = {
  store: string | null;
  secretPrefix: string;
  ok: boolean;
  error?: string;
  fetched: number;
  inserted: number;
  linkedExisting: number;
  updatedShopify: number;
  unmatchedSkuLines: number;
  menuOptionsInserted: number;
  paymentsInserted: number;
  paymentsPending: number;
  issueCount: number;
};

type IssueRow = {
  store_id: string;
  shopify_order_id: number | null;
  sku: string | null;
  issue: string;
};

type FetchResult =
  | { orders: ShopifyRestOrder[] }
  | { error: string; status: number };

type TxnFetchResult =
  | { transactions: ShopifyRestTransaction[] }
  | { error: string; status: number };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function constantTimeEqual(
  supplied: string | null,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = (supplied ?? "").length ^ expected.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authenticateCron(
  request: Request,
  client: AdminClient,
): Promise<boolean> {
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const { data, error } = await client
    .from("bubble_incremental_cron_auth")
    .select("secret_sha256")
    .eq("singleton", true)
    .single();
  if (error || !data?.secret_sha256) return false;
  return constantTimeEqual(await sha256Hex(supplied), String(data.secret_sha256));
}

type UserAuthResult = {
  ok: boolean;
  error?: string;
};

/**
 * Accepts a logged-in operations user's JWT so the Shopify pending page can
 * trigger a sync from the browser. Super Admins and Admins always pass;
 * other roles must hold the orders.shopify_pending page permission.
 */
async function authenticateUser(
  request: Request,
  client: AdminClient,
): Promise<UserAuthResult> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false };
  }
  const token = authorization.slice("Bearer ".length);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) return { ok: false, error: "invalid_authorization" };

  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : null;
  if (!role) return { ok: false, error: "page_access_required" };
  if (role === "Super Admin" || role === "Admin") return { ok: true };

  const { data: permission, error: permissionError } = await client
    .from("role_page_permissions")
    .select("can_access")
    .eq("role", role)
    .eq("page_key", "orders.shopify_pending")
    .maybeSingle();
  if (permissionError) {
    return { ok: false, error: "permission_check_failed" };
  }
  if (!permission?.can_access) {
    return { ok: false, error: "page_access_required" };
  }
  return { ok: true };
}

async function hmacSha256Base64(
  secret: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function verifyShopifyWebhook(
  request: Request,
  storeRow: StoreRow,
  rawBody: string,
): Promise<boolean> {
  const supplied = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!supplied) return false;
  // For custom apps Shopify signs webhooks with the app's client secret. A
  // dedicated WEBHOOK_SECRET env var, when set, takes precedence.
  const secret = envFor(storeRow.secret_prefix, "WEBHOOK_SECRET") ??
    envFor(storeRow.secret_prefix, "CLIENT_SECRET");
  if (!secret) return false;
  const computed = await hmacSha256Base64(secret, rawBody);
  return constantTimeEqual(supplied, computed);
}

function envFor(prefix: string, suffix: string): string | null {
  return Deno.env.get(`${prefix}_${suffix}`)?.trim() || null;
}

async function shopifyAccessToken(input: {
  shop: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ token: string } | { error: string; status: number }> {
  const response = await fetch(`https://${input.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
  });
  if (!response.ok) {
    return { error: "shopify_auth_failed", status: 502 };
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) return { error: "shopify_auth_failed", status: 502 };
  return { token: payload.access_token };
}

async function fetchRecentOrders(input: {
  shop: string;
  token: string;
  limit: number;
}): Promise<FetchResult> {
  const url =
    `https://${input.shop}/admin/api/${API_VERSION}/orders.json?status=any&limit=${input.limit}`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": input.token,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    return { error: "shopify_orders_failed", status: 502 };
  }
  const payload = await response.json() as { orders?: ShopifyRestOrder[] };
  return { orders: payload.orders ?? [] };
}

async function fetchOrdersPaginated(input: {
  shop: string;
  token: string;
  pageSize: number;
  created_at_min?: string | null;
  created_at_max?: string | null;
  backfill: boolean;
}): Promise<FetchResult> {
  const { shop, token, backfill } = input;
  if (!backfill) {
    return fetchRecentOrders({ shop, token, limit: input.pageSize });
  }

  const orders: ShopifyRestOrder[] = [];
  const baseUrl = `https://${shop}/admin/api/${API_VERSION}/orders.json`;
  let pageInfo: string | null = null;
  let firstPage = true;

  while (firstPage || pageInfo) {
    const params = new URLSearchParams();
    if (pageInfo) {
      params.set("page_info", pageInfo);
      params.set("limit", String(input.pageSize));
    } else {
      params.set("status", "any");
      params.set("limit", String(input.pageSize));
      if (input.created_at_min) params.set("created_at_min", input.created_at_min);
      if (input.created_at_max) params.set("created_at_max", input.created_at_max);
    }

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      return { error: "shopify_orders_failed", status: 502 };
    }
    const payload = await response.json() as { orders?: ShopifyRestOrder[] };
    orders.push(...(payload.orders ?? []));

    if (orders.length >= MAX_BACKFILL_ORDERS) break;

    const linkHeader = response.headers.get("Link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    pageInfo = nextMatch
      ? new URL(nextMatch[1]).searchParams.get("page_info")
      : null;
    firstPage = false;
  }

  return { orders };
}

async function fetchOrderById(input: {
  shop: string;
  token: string;
  orderId: number;
}): Promise<{ order: ShopifyRestOrder } | { error: string; status: number }> {
  const url =
    `https://${input.shop}/admin/api/${API_VERSION}/orders/${input.orderId}.json`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": input.token,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    return { error: "shopify_order_failed", status: response.status };
  }
  const payload = await response.json() as { order?: ShopifyRestOrder };
  if (!payload.order) return { error: "shopify_order_empty", status: 502 };
  return { order: payload.order };
}

async function fetchOrderTransactions(input: {
  shop: string;
  token: string;
  orderId: number;
}): Promise<TxnFetchResult> {
  const url =
    `https://${input.shop}/admin/api/${API_VERSION}/orders/${input.orderId}/transactions.json`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": input.token,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    return { error: "shopify_transactions_failed", status: response.status };
  }
  const payload = await response.json() as {
    transactions?: ShopifyRestTransaction[];
  };
  return { transactions: payload.transactions ?? [] };
}

function paymentMethodForGateway(
  gateway: string,
  methodsByName: Map<string, { id: string; legacy_id: string }>,
): { payment_method_id: string | null; payment_method_legacy_id: string | null } {
  const g = gateway.toLowerCase();
  let target: string | null = null;
  if (g.includes("paypal")) target = "Paypal";
  else if (
    g.includes("shopify_payments") || g.includes("visa") ||
    g.includes("mastercard") || g.includes("amex") || g.includes("credit")
  ) target = "Credit card";
  else if (g.includes("bank") || g.includes("deposit")) target = "Bank Transfer";
  else if (g.includes("fps")) target = "FPS";
  else if (g.includes("payme")) target = "PayMe";
  else if (g.includes("octopus")) target = "Octopus";
  else if (
    g.includes("alipay") || g.includes("wechat") || g.includes("qfpay")
  ) target = "QFpay (Alipay / Wechat Pay)";
  else if (g.includes("cash")) target = "Cash";
  else if (g.includes("cheque") || g.includes("check")) target = "Cheque";

  const row = target ? methodsByName.get(target.toLowerCase()) : null;
  return {
    payment_method_id: row?.id ?? null,
    payment_method_legacy_id: row?.legacy_id ?? null,
  };
}

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type CatalogItem = {
  id: string;
  sku: string | null;
  name: string;
  channel_id: string | null;
  kind: "product" | "package";
};

type MenuRemarkSource = { lineId: number; text: string };

function menuRemarkSources(item: MappedOrder): MenuRemarkSource[] {
  const sources: MenuRemarkSource[] = [];
  if (item.remark?.trim()) sources.push({ lineId: 0, text: item.remark });
  for (const line of item.lines) {
    const text = collectLineMenuRemarkText(line.properties);
    if (text) sources.push({ lineId: line.lineId, text });
  }
  return sources;
}

function drinkUnit(name: string): string {
  const explicit = name.match(/(?:\d+\s*)?(罐|包|盒|樽|支|杯|份)\s*$/)?.[1];
  if (explicit) return explicit;
  if (/(?:可樂|汽水|soda|coke)/i.test(name)) return "罐";
  if (/(?:水|果汁|juice)/i.test(name) && !/(?:茶|奶)/.test(name)) return "樽";
  return "包";
}

function cleanDrinkName(value: string): string {
  return value
    .replace(/^(?:飲品|drink|beverage)\s*[:：-]?\s*/i, "")
    .replace(/\s*(?:(?:[xX×*]\s*)?\d+(?:\.\d+)?\s*(?:罐|包|盒|樽|支|杯|份))\s*$/, "")
    .trim();
}

/**
 * Loads the products and packages whose names appear in the parsed menu
 * remark, keyed by the normalized name so remark options can be resolved to
 * their catalog SKU.
 */
async function fetchCatalogByName(
  client: AdminClient,
  names: string[],
): Promise<Map<string, CatalogItem>> {
  const result = new Map<string, CatalogItem>();
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return result;

  const nameCandidates = [...new Set(unique.flatMap((name) => [
    name,
    name.replace(/^\s*[（(]素[）)]\s*/, ""),
  ]))];
  const aliases = [...new Set(
    unique.map(resolveAliasSku).filter((sku): sku is string => Boolean(sku)),
  )];

  const [{ data: products }, { data: packages }, { data: aliasProducts }, { data: aliasPackages }] = await Promise.all([
    client
      .from("products")
      .select("id, sku, name, channel_id")
      .in("name", nameCandidates),
    client
      .from("packages")
      .select("id, sku, name, channel_id")
      .in("name", nameCandidates),
    aliases.length
      ? client.from("products").select("id, sku, name, channel_id").in("sku", aliases)
      : Promise.resolve({ data: [] }),
    aliases.length
      ? client.from("packages").select("id, sku, name, channel_id").in("sku", aliases)
      : Promise.resolve({ data: [] }),
  ]);

  for (const row of (products ?? []) as unknown as CatalogItem[]) {
    const key = normalizeNameForMatch(row.name);
    if (key && !result.has(key)) result.set(key, { ...row, kind: "product" });
  }
  for (const row of (packages ?? []) as unknown as CatalogItem[]) {
    const key = normalizeNameForMatch(row.name);
    if (key && !result.has(key)) result.set(key, { ...row, kind: "package" });
  }
  const aliasRows = [
    ...(aliasProducts ?? []).map((row) => ({ ...row, kind: "product" as const })),
    ...(aliasPackages ?? []).map((row) => ({ ...row, kind: "package" as const })),
  ];
  for (const row of aliasRows) {
    for (const name of unique) {
      if (resolveAliasSku(name)?.toLowerCase() === String(row.sku ?? "").toLowerCase()) {
        result.set(normalizeNameForMatch(name), row as CatalogItem);
      }
    }
  }
  return result;
}

/**
 * Builds the extra order_lines rows for the menu options parsed out of an
 * order's remark. Each option becomes its own line under the package order
 * with the resolved catalog SKU and its own quantity. Unknown option names are
 * logged as issues.
 */
async function buildMenuOptionLines(input: {
  storeRow: StoreRow;
  orderId: number;
  orderLegacyId: string;
  orderSupabaseId: string;
  remarks: MenuRemarkSource[];
  catalogByName: Map<string, CatalogItem>;
  issues: IssueRow[];
}): Promise<Record<string, unknown>[]> {
  const { storeRow, orderId, orderLegacyId, orderSupabaseId, remarks, catalogByName, issues } = input;
  const lines: Record<string, unknown>[] = [];
  let itemOrder = 1000;
  for (const source of remarks) {
    let optionIndex = 0;
    for (const option of parseMenuRemark(source.text)) {
      const match = catalogByName.get(normalizeNameForMatch(option.name));
      if (!match) {
        issues.push({ store_id: storeRow.id, shopify_order_id: orderId, sku: null, issue: "unmatched_remark_option" });
        optionIndex += 1;
        continue;
      }
      lines.push({
        legacy_id: shopifyMenuOptionLegacyId(storeRow.shop_domain, orderId, source.lineId, optionIndex),
        order_id: orderSupabaseId,
        order_legacy_id: orderLegacyId,
        product_id: match.kind === "product" ? match.id : null,
        package_id: match.kind === "package" ? match.id : null,
        product_legacy_id: null,
        package_legacy_id: null,
        sku_snapshot: match.sku,
        product_name_snapshot: option.name,
        quantity: option.quantity,
        unit_price: null,
        total_price: null,
        item_order: itemOrder++,
        is_addon: false,
        is_void: false,
      });
      optionIndex += 1;
    }
  }
  return lines;
}

async function syncPaymentsForOrders(input: {
  client: AdminClient;
  storeRow: StoreRow;
  shop: string;
  token: string;
  processedOrders: ProcessedOrder[];
  methodsByName: Map<string, { id: string; legacy_id: string }>;
  resyncPaid: boolean;
  issues: IssueRow[];
}): Promise<{ inserted: number; pending: number }> {
  const { client, storeRow, shop, token, methodsByName, resyncPaid, issues } = input;
  const payable = input.processedOrders.filter(
    (order) => order.needsTransactions,
  );
  if (!payable.length) return { inserted: 0, pending: 0 };

  const ordersWithPayments = new Set<string>();
  const existingLegacyPayments: Array<{
    legacy_id: string;
    order_id: string;
    amount: number;
    currency: string;
    payment_at: string | null;
  }> = [];
  for (let index = 0; index < payable.length; index += PAYMENT_LOOKUP_CHUNK) {
    const chunk = payable.slice(index, index + PAYMENT_LOOKUP_CHUNK);
    const { data, error } = await client
      .from("payments")
      .select("legacy_id,order_id,amount,currency,payment_at")
      .in("order_id", chunk.map((order) => order.supabaseOrderId))
      .is("voided_at", null);
    if (error) {
      issues.push({
        store_id: storeRow.id,
        shopify_order_id: null,
        sku: null,
        issue: "payments_lookup_failed",
      });
      return { inserted: 0, pending: payable.length };
    }
    for (const row of data ?? []) {
      if (String(row.legacy_id).startsWith("shopify:")) {
        ordersWithPayments.add(row.order_id as string);
      } else {
        existingLegacyPayments.push(row as typeof existingLegacyPayments[number]);
      }
    }
  }

  // Backfill drains orders with no Shopify payment first. Cron re-fetches every
  // paid order so a later capture or installment is picked up; browser-triggered
  // refreshes skip that so they return quickly. Upserts are idempotent.
  const backlog = payable.filter(
    (order) => !ordersWithPayments.has(order.supabaseOrderId),
  );
  const resync = resyncPaid
    ? payable.filter((order) => ordersWithPayments.has(order.supabaseOrderId))
    : [];
  const ordered = [...backlog, ...resync];
  const pending = Math.max(0, ordered.length - MAX_TRANSACTION_FETCHES_PER_RUN);
  const toFetch = ordered.slice(0, MAX_TRANSACTION_FETCHES_PER_RUN);
  if (!toFetch.length) return { inserted: 0, pending };

  const paymentRows: Record<string, unknown>[] = [];
  for (const po of toFetch) {
    const txnResult = await fetchOrderTransactions({
      shop,
      token,
      orderId: po.orderId,
    });
    if ("error" in txnResult) {
      if (txnResult.status !== 404) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: po.orderId,
          sku: null,
          issue: `transactions_failed_${txnResult.status}`,
        });
      }
      continue;
    }
    for (const txn of txnResult.transactions) {
      const row = mapShopifyTransaction({
        transaction: txn,
        shopDomain: shop,
        orderId: po.orderId,
        orderSupabaseId: po.supabaseOrderId,
        orderLegacyId: po.orderLegacyId,
        channelId: storeRow.channel_id,
        orderNumber: po.orderNumber,
        orderCurrency: po.currency,
      });
      if (!row) continue;
      const pm = paymentMethodForGateway(String(txn.gateway ?? ""), methodsByName);
      row.payment_method_id = pm.payment_method_id;
      row.payment_method_legacy_id = pm.payment_method_legacy_id;
      paymentRows.push(row);
    }
  }

  const uniquePaymentRows = filterLegacyPaymentDuplicates(
    paymentRows,
    existingLegacyPayments,
  );
  let paymentsInserted = 0;
  for (let index = 0; index < uniquePaymentRows.length; index += PAYMENT_INSERT_CHUNK) {
    const chunk = uniquePaymentRows.slice(index, index + PAYMENT_INSERT_CHUNK);
    const { data, error } = await client
      .from("payments")
      .upsert(chunk, { onConflict: "legacy_id", ignoreDuplicates: true })
      .select("legacy_id");
    if (error) {
      issues.push({
        store_id: storeRow.id,
        shopify_order_id: null,
        sku: null,
        issue: "payments_upsert_failed",
      });
      continue;
    }
    paymentsInserted += data?.length ?? 0;
  }
  return { inserted: paymentsInserted, pending };
}

type MappedOrder = NonNullable<ReturnType<typeof mapShopifyOrder>>;

function shopifyPaymentStatusPatch(item: MappedOrder): Record<string, unknown> {
  return {
    payment_status_source: "shopify",
    shopify_financial_status: item.financialStatus,
    shopify_financial_status_synced_at: new Date().toISOString(),
    ...(item.outstanding === null ? {} : { outstanding: item.outstanding }),
    updated_at: new Date().toISOString(),
  };
}

type OrderProcessingContext = {
  client: AdminClient;
  storeRow: StoreRow;
  shop: string;
  products: Array<{
    id: string;
    sku: string | null;
    name: string | null;
    channel_id: string | null;
  }>;
  packages: Array<{
    id: string;
    sku: string | null;
    name: string | null;
    channel_id: string | null;
  }>;
  methodsByName: Map<string, { id: string; legacy_id: string }>;
};

type OrderProcessingCounters = {
  inserted: number;
  linkedExisting: number;
  unmatchedSkuLines: number;
  menuOptionsInserted: number;
};

type OrderProcessingResult = {
  processedOrders: ProcessedOrder[];
  issues: IssueRow[];
  counters: OrderProcessingCounters;
};

/**
 * Writes a batch of mapped Shopify orders. Operational order data, lines, and
 * payments remain immutable, while Shopify-owned payment status is refreshed
 * for orders that are already linked to Shopify.
 */
async function processMappedOrders(
  context: OrderProcessingContext,
  mapped: MappedOrder[],
  existingShopify: Array<{
    id: string;
    legacy_id: string;
    source_system: string | null;
  }>,
  existingNumbers: Array<{
    id: string;
    legacy_id: string;
    order_number: string | null;
    channel_id: string | null;
    is_shopify_order: boolean | null;
    shopify_order_id: number | null;
  }>,
): Promise<OrderProcessingResult> {
  const { client, storeRow, products, packages, methodsByName } = context;

  const shopifyIdToOrder = new Map(
    existingShopify.map((row) => [Number(row.shopify_order_id), row]),
  );
  const numberRows = existingNumbers;

  const remarkNames = [
    ...new Set(
      mapped.flatMap((item) => menuRemarkSources(item).flatMap((source) =>
        parseMenuRemark(source.text).map((option) => option.name)
      )),
    ),
  ];
  const catalogByName = await fetchCatalogByName(client, remarkNames);

  const processedOrders: ProcessedOrder[] = [];
  const issues: IssueRow[] = [];
  const counters: OrderProcessingCounters = {
    inserted: 0,
    linkedExisting: 0,
    unmatchedSkuLines: 0,
    menuOptionsInserted: 0,
  };

  for (const item of mapped) {
    const already = shopifyIdToOrder.get(item.orderId);
    let targetId: string | null = already?.id ?? null;
    let mode: "insert" | "link" | "skip" = already
      ? already.source_system === "shopify" ? "skip" : "link"
      : "insert";

    if (!targetId) {
      const matches = numberRows.filter((row) => {
        const sameNumber = orderNumberKey(row.order_number) ===
          orderNumberKey(item.orderNumber);
        if (!sameNumber) return false;
        if (row.channel_id === storeRow.channel_id) return true;
        return Boolean(row.is_shopify_order);
      });
      if (matches.length === 1) {
        targetId = matches[0].id;
        mode = matches[0].shopify_order_id ? "skip" : "link";
      } else if (matches.length > 1) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: null,
          issue: "ambiguous_order_number",
        });
        continue;
      }
    }

    const currency = String(item.orderRow.currency ?? "HKD");
    const orderLegacyIdForPayments = mode === "insert"
      ? String(item.orderRow.legacy_id ?? "")
      : shopifyIdToOrder.get(item.orderId)?.legacy_id ??
        numberRows.find((row) => row.id === targetId)?.legacy_id ?? "";

    if (mode === "skip" && targetId) {
      const { error } = await client.from("orders")
        .update(shopifyPaymentStatusPatch(item))
        .eq("id", targetId);
      if (error) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: null,
          issue: "payment_status_update_failed",
        });
      }
      // All non-payment order fields stay immutable. Transactions can still be
      // picked up on later runs.
      processedOrders.push({
        orderId: item.orderId,
        supabaseOrderId: targetId,
        orderLegacyId: orderLegacyIdForPayments,
        orderNumber: item.orderNumber,
        currency,
        needsTransactions: item.needsPayments,
      });
      continue;
    }

    if (mode === "link" && targetId) {
      const { error } = await client.from("orders").update({
        shopify_store_id: storeRow.id,
        shopify_order_id: item.orderId,
        is_shopify_order: true,
        ...shopifyPaymentStatusPatch(item),
      }).eq("id", targetId);
      if (error) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: null,
          issue: "link_failed",
        });
        continue;
      }
      counters.linkedExisting += 1;
      processedOrders.push({
        orderId: item.orderId,
        supabaseOrderId: targetId,
        orderLegacyId: orderLegacyIdForPayments,
        orderNumber: item.orderNumber,
        currency,
        needsTransactions: item.needsPayments,
      });
      continue;
    }

    const { data: insertedOrder, error: insertError } = await client
      .from("orders")
      .insert(item.orderRow)
      .select("id")
      .single();
    if (insertError || !insertedOrder) {
      issues.push({
        store_id: storeRow.id,
        shopify_order_id: item.orderId,
        sku: null,
        issue: "insert_failed",
      });
      continue;
    }
    counters.inserted += 1;

    const lineRows = item.lines.map((line) => {
      const rawName = (line.row.product_name_snapshot as string | null) ?? null;
      const optionRemark = extractOptionRemark(rawName);
      const propertyRemark = line.properties
        .map((property) => ({ name: String(property.name ?? ""), value: String(property.value ?? "").trim() }))
        .filter((property) => property.value && !/^_/.test(property.name) &&
          !/(?:飲品|drink|beverage|pickup|delivery|送貨|日期|時間)/i.test(property.name))
        .map((property) => property.value)
        .join("\n") || null;
      const variantParts = (line.variantTitle ?? "")
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
      const variantRemark = storeRow.secret_prefix === "SHOPIFY_HK_LUNCH_BOX"
        ? variantParts.slice(0, -1).join("\n") || null
        : null;
      // Match against the base name without the "配 ..." option text so the
      // package/product still resolves (Bubble encoded options in the name).
      const baseName = optionRemark
        ? rawName!.replace(/(?:配|（配|\(配)\s*.+$/, "").trim() || null
        : rawName;
      const match = pickCatalogMatchByName(
        line.sku,
        baseName,
        (products ?? []) as Array<{
          id: string;
          sku: string | null;
          name: string | null;
          channel_id: string | null;
        }>,
        (packages ?? []) as Array<{
          id: string;
          sku: string | null;
          name: string | null;
          channel_id: string | null;
        }>,
        storeRow.channel_id,
      );
      if (
        (line.sku || baseName) &&
        !Boolean(line.row.is_addon) &&
        !match.productId &&
        !match.packageId
      ) {
        counters.unmatchedSkuLines += 1;
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: line.sku,
          issue: "unmatched_sku",
        });
      }
      return {
        ...line.row,
        order_id: insertedOrder.id,
        product_id: match.productId,
        package_id: match.packageId,
        // Keep the option selection like the legacy Bubble system did.
        sku_snapshot: storeRow.secret_prefix === "SHOPIFY_HK_LUNCH_BOX"
          ? stripSkuSuffix(line.sku)
          : line.row.sku_snapshot,
        remarks_1: [optionRemark, propertyRemark, variantRemark, line.row.remarks_1]
          .filter((value): value is string =>
            typeof value === "string" && Boolean(value.trim())
          )
          .filter((value, index, values) => values.indexOf(value) === index)
          .join("\n") || null,
      };
    });

    const generatedLines: Record<string, unknown>[] = [];
    if (storeRow.secret_prefix === "SHOPIFY_HK_LUNCH_BOX") {
      let generatedIndex = 0;
      const beverageTotals = new Map<string, { quantity: number; unit: string }>();
      for (const line of item.lines) {
        const selections = new Set<string>();
        const variantParts = (line.variantTitle ?? "").split("/").map((value) => value.trim()).filter(Boolean);
        if (variantParts.length) selections.add(variantParts.at(-1)!);
        for (const property of line.properties) {
          if (!/(?:飲品|drink|beverage)/i.test(String(property.name ?? ""))) continue;
          for (const value of String(property.value ?? "").split(/[,，/]/).map((part) => part.trim()).filter(Boolean)) selections.add(value);
        }
        for (const selection of selections) {
          const name = cleanDrinkName(selection);
          if (!name) continue;
          const current = beverageTotals.get(name);
          beverageTotals.set(name, { quantity: (current?.quantity ?? 0) + Number(line.row.quantity ?? 0), unit: current?.unit ?? drinkUnit(selection) });
        }
      }
      for (const [beverage, details] of beverageTotals) {
        generatedIndex += 1;
        generatedLines.push({ legacy_id: `shopify:${storeRow.shop_domain.replace(/\.myshopify\.com$/, "")}:${item.orderId}:drink:${generatedIndex}`, order_id: insertedOrder.id, order_legacy_id: item.orderRow.legacy_id, product_name_snapshot: `${beverage} ${details.quantity}${details.unit}`, quantity: 1, unit_price: 0, total_price: 0, item_order: 10000 + generatedIndex, is_addon: false, is_void: false });
      }
      const boxCount = item.lines.reduce((total, line) => total + (/^CBE/i.test(line.sku ?? "") ? Number(line.row.quantity ?? 0) : 0), 0);
      if (boxCount) generatedLines.push({ legacy_id: `shopify:${storeRow.shop_domain.replace(/\.myshopify\.com$/, "")}:${item.orderId}:utensils`, order_id: insertedOrder.id, order_legacy_id: item.orderRow.legacy_id, product_name_snapshot: `飯盒餐具包 ${boxCount}份`, quantity: 1, unit_price: 0, total_price: 0, item_order: 10999, is_addon: false, is_void: false });
    }

    const mergedLineRows = storeRow.secret_prefix === "SHOPIFY_HK_LUNCH_BOX"
      ? [...lineRows.reduce((rows, row) => {
          const key = [row.sku_snapshot, row.product_id, row.package_id, row.remarks_1, row.unit_price].join("|");
          const existing = rows.get(key);
          if (existing) {
            existing.quantity = Number(existing.quantity ?? 0) + Number(row.quantity ?? 0);
            existing.total_price = Number(existing.total_price ?? 0) + Number(row.total_price ?? 0);
          } else rows.set(key, { ...row });
          return rows;
        }, new Map<string, Record<string, unknown>>()).values()]
      : lineRows;

    const menuOptionLines = await buildMenuOptionLines({
      storeRow,
      orderId: item.orderId,
      orderLegacyId: String(item.orderRow.legacy_id ?? ""),
      orderSupabaseId: insertedOrder.id,
      remarks: menuRemarkSources(item),
      catalogByName,
      issues,
    });

    const allLineRows = [...mergedLineRows, ...generatedLines, ...menuOptionLines];
    if (allLineRows.length) {
      const { data: insertedLines, error: lineError } = await client
        .from("order_lines")
        .upsert(allLineRows, {
          onConflict: "legacy_id",
          ignoreDuplicates: true,
        })
        .select("legacy_id");
      if (lineError) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: null,
          issue: "lines_insert_failed",
        });
      } else {
        const insertedIds = new Set(
          (insertedLines ?? []).map((row) => row.legacy_id as string),
        );
        counters.menuOptionsInserted += menuOptionLines.filter((row) =>
          insertedIds.has(row.legacy_id as string)
        ).length;
      }
    }

    processedOrders.push({
      orderId: item.orderId,
      supabaseOrderId: insertedOrder.id,
      orderLegacyId: orderLegacyIdForPayments,
      orderNumber: item.orderNumber,
      currency,
      needsTransactions: item.needsPayments,
    });
  }

  return { processedOrders, issues, counters };
}

async function syncStore(input: {
  client: AdminClient;
  storeRow: StoreRow;
  limit: number;
  dryRun: boolean;
  backfill: boolean;
  resyncPaid: boolean;
  created_at_min?: string | null;
  created_at_max?: string | null;
}): Promise<StoreSyncResult> {
  const { client, storeRow, limit, dryRun, backfill, resyncPaid, created_at_min, created_at_max } = input;
  const empty: StoreSyncResult = {
    store: storeRow.shop_domain,
    secretPrefix: storeRow.secret_prefix,
    ok: false,
    fetched: 0,
    inserted: 0,
    linkedExisting: 0,
    updatedShopify: 0,
    unmatchedSkuLines: 0,
    menuOptionsInserted: 0,
    paymentsInserted: 0,
    paymentsPending: 0,
    issueCount: 0,
  };

  const fail = async (error: string): Promise<StoreSyncResult> => {
    await client.from("shopify_stores").update({
      last_error: error,
      updated_at: new Date().toISOString(),
    }).eq("id", storeRow.id);
    return { ...empty, error };
  };

  const shopFromEnv = normalizeShopDomain(envFor(storeRow.secret_prefix, "SHOP"));
  const shop = shopFromEnv ?? normalizeShopDomain(storeRow.shop_domain);
  if (!shop || shop !== normalizeShopDomain(storeRow.shop_domain)) {
    return fail("shop_not_permitted");
  }
  const clientId = envFor(storeRow.secret_prefix, "CLIENT_ID");
  const clientSecret = envFor(storeRow.secret_prefix, "CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return fail("shopify_token_missing");
  }

  const tokenResult = await shopifyAccessToken({ shop, clientId, clientSecret });
  if ("error" in tokenResult) return fail(tokenResult.error);

  const fetched = await fetchOrdersPaginated({
    shop,
    token: tokenResult.token,
    pageSize: backfill ? BACKFILL_PAGE_SIZE : limit,
    created_at_min,
    created_at_max,
    backfill,
  });
  if ("error" in fetched) return fail(fetched.error);

  const mapped = fetched.orders
    .map((order) =>
      mapShopifyOrder({
        order,
        shopDomain: shop,
        storeId: storeRow.id,
        channelId: storeRow.channel_id,
      })
    )
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (dryRun || !mapped.length) {
    await client.from("shopify_stores").update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", storeRow.id);
    return { ...empty, ok: true, fetched: mapped.length };
  }

  const skus = [
    ...new Set(
      mapped.flatMap((row) =>
        row.lines.map((line) => line.sku).filter((sku): sku is string => Boolean(sku))
      ),
    ),
  ];
  const lineNames = [
    ...new Set(
      mapped.flatMap((row) =>
        row.lines
          .map((line) => (line.row.product_name_snapshot as string | null) ?? null)
          .filter((name): name is string => Boolean(name))
      ),
    ),
  ];

  // The store's catalog is small (hundreds of products); fetch it in full for
  // this channel and match by SKU or name in memory. PostgREST `or()` filters
  // mishandle full-width parentheses in names, so avoid them here.
  const needsCatalog = skus.length > 0 || lineNames.length > 0;

  const [{ data: products }, { data: packages }, { data: existingShopify }, {
    data: existingNumbers,
  }, { data: paymentMethods }] = await Promise.all([
    needsCatalog
      ? catalogQuery(client, "products", storeRow.channel_id, skus)
      : Promise.resolve({ data: [] as Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }> }),
    needsCatalog
      ? catalogQuery(client, "packages", storeRow.channel_id, skus)
      : Promise.resolve({ data: [] as Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }> }),
    client
      .from("orders")
      .select("id, legacy_id, shopify_order_id, source_system")
      .eq("shopify_store_id", storeRow.id)
      .in("shopify_order_id", mapped.map((row) => row.orderId)),
    client
      .from("orders")
      .select(
        "id, legacy_id, order_number, channel_id, is_shopify_order, shopify_order_id",
      )
      .in(
        "order_number",
        [
          ...mapped.map((row) => row.orderNumber),
          ...mapped.map((row) => row.orderNumber.replace(/^#/, "")),
        ],
      ),
    client.from("payment_methods").select("id, legacy_id, name"),
  ]);

  const methodsByName = new Map(
    (paymentMethods ?? []).map((method) => [
      String(method.name ?? "").trim().toLowerCase(),
      { id: method.id, legacy_id: method.legacy_id },
    ]),
  );

  const result = await processMappedOrders(
    {
      client,
      storeRow,
      shop,
      products: (products ?? []) as Array<{
        id: string;
        sku: string | null;
        name: string | null;
        channel_id: string | null;
      }>,
      packages: (packages ?? []) as Array<{
        id: string;
        sku: string | null;
        name: string | null;
        channel_id: string | null;
      }>,
      methodsByName,
    },
    mapped,
    (existingShopify ?? []) as Array<{
      id: string;
      legacy_id: string;
      source_system: string | null;
    }>,
    (existingNumbers ?? []) as Array<{
      id: string;
      legacy_id: string;
      order_number: string | null;
      channel_id: string | null;
      is_shopify_order: boolean | null;
      shopify_order_id: number | null;
    }>,
  );

  const payments = await syncPaymentsForOrders({
    client,
    storeRow,
    shop,
    token: tokenResult.token,
    processedOrders: result.processedOrders,
    methodsByName,
    resyncPaid,
    issues: result.issues,
  });

  if (result.issues.length) {
    await client.from("shopify_sync_issues").insert(result.issues);
  }
  await client.from("shopify_stores").update({
    last_synced_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", storeRow.id);

  return {
    ...empty,
    ok: true,
    fetched: mapped.length,
    inserted: result.counters.inserted,
    linkedExisting: result.counters.linkedExisting,
    updatedShopify: 0,
    unmatchedSkuLines: result.counters.unmatchedSkuLines,
    menuOptionsInserted: result.counters.menuOptionsInserted,
    paymentsInserted: payments.inserted,
    paymentsPending: payments.pending,
    issueCount: result.issues.length,
  };
}

async function syncSingleOrder(input: {
  client: AdminClient;
  storeRow: StoreRow;
  orderId: number;
  resyncPaid: boolean;
}): Promise<StoreSyncResult> {
  const { client, storeRow, orderId, resyncPaid } = input;
  const empty: StoreSyncResult = {
    store: storeRow.shop_domain,
    secretPrefix: storeRow.secret_prefix,
    ok: false,
    fetched: 0,
    inserted: 0,
    linkedExisting: 0,
    updatedShopify: 0,
    unmatchedSkuLines: 0,
    menuOptionsInserted: 0,
    paymentsInserted: 0,
    paymentsPending: 0,
    issueCount: 0,
  };

  const fail = async (error: string): Promise<StoreSyncResult> => {
    await client.from("shopify_stores").update({
      last_error: error,
      updated_at: new Date().toISOString(),
    }).eq("id", storeRow.id);
    return { ...empty, error };
  };

  const shopFromEnv = normalizeShopDomain(envFor(storeRow.secret_prefix, "SHOP"));
  const shop = shopFromEnv ?? normalizeShopDomain(storeRow.shop_domain);
  if (!shop || shop !== normalizeShopDomain(storeRow.shop_domain)) {
    return fail("shop_not_permitted");
  }
  const clientId = envFor(storeRow.secret_prefix, "CLIENT_ID");
  const clientSecret = envFor(storeRow.secret_prefix, "CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return fail("shopify_token_missing");
  }

  const tokenResult = await shopifyAccessToken({ shop, clientId, clientSecret });
  if ("error" in tokenResult) return fail(tokenResult.error);

  const fetched = await fetchOrderById({
    shop,
    token: tokenResult.token,
    orderId,
  });
  if ("error" in fetched) return fail(fetched.error);

  const mappedOrder = mapShopifyOrder({
    order: fetched.order,
    shopDomain: shop,
    storeId: storeRow.id,
    channelId: storeRow.channel_id,
  });
  if (!mappedOrder) return fail("order_map_failed");
  const mapped = [mappedOrder];

  const skus = [
    ...new Set(
      mapped.flatMap((row) =>
        row.lines.map((line) => line.sku).filter((sku): sku is string => Boolean(sku))
      ),
    ),
  ];
  const lineNames = [
    ...new Set(
      mapped.flatMap((row) =>
        row.lines
          .map((line) => (line.row.product_name_snapshot as string | null) ?? null)
          .filter((name): name is string => Boolean(name))
      ),
    ),
  ];

  // The store's catalog is small (hundreds of products); fetch it in full for
  // this channel and match by SKU or name in memory. PostgREST `or()` filters
  // mishandle full-width parentheses in names, so avoid them here.
  const needsCatalog = skus.length > 0 || lineNames.length > 0;

  const [{ data: products }, { data: packages }, { data: existingShopify }, {
    data: existingNumbers,
  }, { data: paymentMethods }] = await Promise.all([
    needsCatalog
      ? catalogQuery(client, "products", storeRow.channel_id, skus)
      : Promise.resolve({ data: [] as Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }> }),
    needsCatalog
      ? catalogQuery(client, "packages", storeRow.channel_id, skus)
      : Promise.resolve({ data: [] as Array<{ id: string; sku: string | null; name: string | null; channel_id: string | null }> }),
    client
      .from("orders")
      .select("id, legacy_id, shopify_order_id, source_system")
      .eq("shopify_store_id", storeRow.id)
      .in("shopify_order_id", mapped.map((row) => row.orderId)),
    client
      .from("orders")
      .select(
        "id, legacy_id, order_number, channel_id, is_shopify_order, shopify_order_id",
      )
      .in(
        "order_number",
        [
          ...mapped.map((row) => row.orderNumber),
          ...mapped.map((row) => row.orderNumber.replace(/^#/, "")),
        ],
      ),
    client.from("payment_methods").select("id, legacy_id, name"),
  ]);

  const methodsByName = new Map(
    (paymentMethods ?? []).map((method) => [
      String(method.name ?? "").trim().toLowerCase(),
      { id: method.id, legacy_id: method.legacy_id },
    ]),
  );

  const result = await processMappedOrders(
    {
      client,
      storeRow,
      shop,
      products: (products ?? []) as Array<{
        id: string;
        sku: string | null;
        name: string | null;
        channel_id: string | null;
      }>,
      packages: (packages ?? []) as Array<{
        id: string;
        sku: string | null;
        name: string | null;
        channel_id: string | null;
      }>,
      methodsByName,
    },
    mapped,
    (existingShopify ?? []) as Array<{
      id: string;
      legacy_id: string;
      source_system: string | null;
    }>,
    (existingNumbers ?? []) as Array<{
      id: string;
      legacy_id: string;
      order_number: string | null;
      channel_id: string | null;
      is_shopify_order: boolean | null;
      shopify_order_id: number | null;
    }>,
  );

  const payments = await syncPaymentsForOrders({
    client,
    storeRow,
    shop,
    token: tokenResult.token,
    processedOrders: result.processedOrders,
    methodsByName,
    resyncPaid,
    issues: result.issues,
  });

  if (result.issues.length) {
    await client.from("shopify_sync_issues").insert(result.issues);
  }
  await client.from("shopify_stores").update({
    last_synced_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", storeRow.id);

  return {
    ...empty,
    ok: true,
    fetched: mapped.length,
    inserted: result.counters.inserted,
    linkedExisting: result.counters.linkedExisting,
    updatedShopify: 0,
    unmatchedSkuLines: result.counters.unmatchedSkuLines,
    menuOptionsInserted: result.counters.menuOptionsInserted,
    paymentsInserted: payments.inserted,
    paymentsPending: payments.pending,
    issueCount: result.issues.length,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const client = createAdminClient();

  // Shopify order-created webhooks carry X-Shopify-Topic. Verify the HMAC
  // against the store's webhook secret and sync only the order just created.
  const webhookTopic = request.headers.get("X-Shopify-Topic");
  if (webhookTopic) {
    const rawBody = await request.text();
    if (!rawBody) return jsonResponse({ error: "empty_body" }, 400);

    let payload: { id?: number | string; shop_domain?: string };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }
    const orderId = typeof payload.id === "number" ||
        typeof payload.id === "string" && /^\d+$/.test(payload.id)
      ? Number(payload.id)
      : null;
    if (!orderId) return jsonResponse({ error: "missing_order_id" }, 400);

    // Shopify always sends X-Shopify-Shop-Domain on webhook requests; test
    // notifications do not include shop_domain in the body, so prefer the
    // header and fall back to the payload field.
    const shopDomain = normalizeShopDomain(
      request.headers.get("X-Shopify-Shop-Domain") ?? payload.shop_domain,
    );
    const { data: stores, error: storesError } = await client
      .from("shopify_stores")
      .select("id, shop_domain, channel_id, secret_prefix")
      .eq("is_active", true);
    if (storesError) {
      return jsonResponse({ error: "store_lookup_failed" }, 500);
    }
    const storeRow = (stores ?? []).find((store) =>
      normalizeShopDomain(store.shop_domain) === shopDomain
    ) as StoreRow | undefined;
    if (!storeRow) return jsonResponse({ error: "store_not_found" }, 404);
    if (!(await verifyShopifyWebhook(request, storeRow, rawBody))) {
      return jsonResponse({ error: "invalid_webhook_signature" }, 401);
    }

    const result = await syncSingleOrder({
      client,
      storeRow,
      orderId,
      resyncPaid: false,
    });
    return jsonResponse({
      ok: result.ok,
      error: result.error,
      orderId,
      store: result.store,
      fetched: result.fetched,
      inserted: result.inserted,
      linkedExisting: result.linkedExisting,
      unmatchedSkuLines: result.unmatchedSkuLines,
      menuOptionsInserted: result.menuOptionsInserted,
      paymentsInserted: result.paymentsInserted,
      issueCount: result.issueCount,
    }, result.ok ? 200 : 502);
  }

  const cronOk = await authenticateCron(request, client);
  const userAuth = await authenticateUser(request, client);
  if (!cronOk && !userAuth.ok) {
    return jsonResponse({ error: userAuth.error ?? "unauthorized" }, 401);
  }
  // Browser-triggered syncs are a lightweight refresh only. Cron retains
  // access to dry-run, backfill, and created-at windows.
  const fromCron = cronOk;
  let dryRun = false;
  let limit = DEFAULT_LIMIT;
  let onlyPrefix: string | null = null;
  let backfill = false;
  let createdMin: string | null = null;
  let createdMax: string | null = null;
  try {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json() as {
        dryRun?: boolean;
        limit?: number;
        store?: string;
        mode?: string;
        created_at_min?: string;
        created_at_max?: string;
      }
      : {};
    dryRun = fromCron && body.dryRun === true;
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(body.limit)));
    }
    if (typeof body.store === "string" && body.store.trim()) {
      onlyPrefix = body.store.trim();
    }
    backfill = fromCron && body.mode === "backfill";
    createdMin = fromCron && typeof body.created_at_min === "string" && body.created_at_min.trim()
      ? body.created_at_min.trim()
      : null;
    createdMax = fromCron && typeof body.created_at_max === "string" && body.created_at_max.trim()
      ? body.created_at_max.trim()
      : null;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  let query = client
    .from("shopify_stores")
    .select("id, shop_domain, channel_id, secret_prefix")
    .eq("is_active", true);
  if (onlyPrefix) {
    query = query.eq("secret_prefix", onlyPrefix);
  }
  const { data: stores, error: storesError } = await query;
  if (storesError) {
    return jsonResponse({ error: "store_lookup_failed" }, 500);
  }
  if (!stores?.length) {
    return jsonResponse({ error: "store_not_configured" }, 500);
  }

  const results: StoreSyncResult[] = [];
  for (const store of stores) {
    results.push(
      await syncStore({
        client,
        storeRow: store as StoreRow,
        limit,
        dryRun,
        backfill,
        resyncPaid: fromCron,
        created_at_min: createdMin,
        created_at_max: createdMax,
      }),
    );
  }

  const totals = {
    fetched: 0,
    inserted: 0,
    linkedExisting: 0,
    updatedShopify: 0,
    unmatchedSkuLines: 0,
    menuOptionsInserted: 0,
    paymentsInserted: 0,
    paymentsPending: 0,
    issueCount: 0,
  };
  for (const result of results) {
    totals.fetched += result.fetched;
    totals.inserted += result.inserted;
    totals.linkedExisting += result.linkedExisting;
    totals.updatedShopify += result.updatedShopify;
    totals.unmatchedSkuLines += result.unmatchedSkuLines;
    totals.menuOptionsInserted += result.menuOptionsInserted;
    totals.paymentsInserted += result.paymentsInserted;
    totals.paymentsPending += result.paymentsPending;
    totals.issueCount += result.issueCount;
  }

  return jsonResponse({
    ok: results.every((result) => result.ok),
    dryRun,
    backfill,
    storeCount: results.length,
    ...totals,
    stores: results,
  });
});
