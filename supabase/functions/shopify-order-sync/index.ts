import { createClient } from "npm:@supabase/supabase-js@2";
import {
  mapShopifyOrder,
  mapShopifyTransaction,
  normalizeShopDomain,
  orderNumberKey,
  pickCatalogMatch,
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
  paymentsInserted: number;
  paymentsPending: number;
  issueCount: number;
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

async function syncPaymentsForOrders(input: {
  client: AdminClient;
  storeRow: StoreRow;
  shop: string;
  token: string;
  processedOrders: ProcessedOrder[];
  methodsByName: Map<string, { id: string; legacy_id: string }>;
  issues: Array<{
    store_id: string;
    shopify_order_id: number | null;
    sku: string | null;
    issue: string;
  }>;
}): Promise<{ inserted: number; pending: number }> {
  const { client, storeRow, shop, token, methodsByName, issues } = input;
  const payable = input.processedOrders.filter(
    (order) => order.needsTransactions,
  );
  if (!payable.length) return { inserted: 0, pending: 0 };

  const ordersWithPayments = new Set<string>();
  for (let index = 0; index < payable.length; index += PAYMENT_LOOKUP_CHUNK) {
    const chunk = payable.slice(index, index + PAYMENT_LOOKUP_CHUNK);
    const { data, error } = await client
      .from("payments")
      .select("order_id")
      .in("order_id", chunk.map((order) => order.supabaseOrderId))
      .like("legacy_id", "shopify:%");
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
      ordersWithPayments.add(row.order_id as string);
    }
  }

  const remaining = payable.filter(
    (order) => !ordersWithPayments.has(order.supabaseOrderId),
  );
  const pending = Math.max(0, remaining.length - MAX_TRANSACTION_FETCHES_PER_RUN);
  const toFetch = remaining.slice(0, MAX_TRANSACTION_FETCHES_PER_RUN);
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

  let paymentsInserted = 0;
  for (let index = 0; index < paymentRows.length; index += PAYMENT_INSERT_CHUNK) {
    const chunk = paymentRows.slice(index, index + PAYMENT_INSERT_CHUNK);
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

async function syncStore(input: {
  client: AdminClient;
  storeRow: StoreRow;
  limit: number;
  dryRun: boolean;
  backfill: boolean;
  created_at_min?: string | null;
  created_at_max?: string | null;
}): Promise<StoreSyncResult> {
  const { client, storeRow, limit, dryRun, backfill, created_at_min, created_at_max } = input;
  const empty: StoreSyncResult = {
    store: storeRow.shop_domain,
    secretPrefix: storeRow.secret_prefix,
    ok: false,
    fetched: 0,
    inserted: 0,
    linkedExisting: 0,
    updatedShopify: 0,
    unmatchedSkuLines: 0,
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

  const [{ data: products }, { data: packages }, { data: existingShopify }, {
    data: existingNumbers,
  }, { data: paymentMethods }] = await Promise.all([
    skus.length
      ? client.from("products").select("id, sku, channel_id").in("sku", skus)
      : Promise.resolve({ data: [] as Array<{ id: string; sku: string | null; channel_id: string | null }> }),
    skus.length
      ? client.from("packages").select("id, sku, channel_id").in("sku", skus)
      : Promise.resolve({ data: [] as Array<{ id: string; sku: string | null; channel_id: string | null }> }),
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

  const shopifyIdToOrder = new Map(
    (existingShopify ?? []).map((row) => [
      Number(row.shopify_order_id),
      row as { id: string; legacy_id: string; source_system: string | null },
    ]),
  );
  const numberRows = (existingNumbers ?? []) as Array<{
    id: string;
    legacy_id: string;
    order_number: string | null;
    channel_id: string | null;
    is_shopify_order: boolean | null;
    shopify_order_id: number | null;
  }>;

  let inserted = 0;
  let linkedExisting = 0;
  let updatedShopify = 0;
  let unmatchedSkuLines = 0;
  const issues: Array<{
    store_id: string;
    shopify_order_id: number | null;
    sku: string | null;
    issue: string;
  }> = [];
  const processedOrders: ProcessedOrder[] = [];

  for (const item of mapped) {
    const already = shopifyIdToOrder.get(item.orderId);
    let targetId: string | null = already?.id ?? null;
    let mode: "insert" | "update-shopify" | "link" = already
      ? already.source_system === "shopify" ? "update-shopify" : "link"
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
        mode = matches[0].shopify_order_id ? "update-shopify" : "link";
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

    if (mode === "link" && targetId) {
      const { error } = await client.from("orders").update({
        shopify_store_id: storeRow.id,
        shopify_order_id: item.orderId,
        is_shopify_order: true,
        updated_at: new Date().toISOString(),
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
      linkedExisting += 1;
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

    if (mode === "update-shopify" && targetId) {
      const { error } = await client.from("orders").update({
        ...item.orderRow,
        updated_at: new Date().toISOString(),
      }).eq("id", targetId);
      if (error) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: null,
          issue: "update_failed",
        });
        continue;
      }
      updatedShopify += 1;
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
    inserted += 1;

    const lineRows = item.lines.map((line) => {
      const match = line.sku
        ? pickCatalogMatch(
          line.sku,
          products ?? [],
          packages ?? [],
          storeRow.channel_id,
        )
        : { productId: null, packageId: null };
      if (line.sku && !match.productId && !match.packageId) {
        unmatchedSkuLines += 1;
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
      };
    });
    if (lineRows.length) {
      const { error: lineError } = await client.from("order_lines").insert(lineRows);
      if (lineError) {
        issues.push({
          store_id: storeRow.id,
          shopify_order_id: item.orderId,
          sku: null,
          issue: "lines_insert_failed",
        });
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

  const payments = await syncPaymentsForOrders({
    client,
    storeRow,
    shop,
    token: tokenResult.token,
    processedOrders,
    methodsByName,
    issues,
  });

  if (issues.length) {
    await client.from("shopify_sync_issues").insert(issues);
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
    inserted,
    linkedExisting,
    updatedShopify,
    unmatchedSkuLines,
    paymentsInserted: payments.inserted,
    paymentsPending: payments.pending,
    issueCount: issues.length,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const client = createAdminClient();
  if (!await authenticateCron(request, client)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

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
    dryRun = body.dryRun === true;
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(body.limit)));
    }
    if (typeof body.store === "string" && body.store.trim()) {
      onlyPrefix = body.store.trim();
    }
    backfill = body.mode === "backfill";
    createdMin = typeof body.created_at_min === "string" && body.created_at_min.trim()
      ? body.created_at_min.trim()
      : null;
    createdMax = typeof body.created_at_max === "string" && body.created_at_max.trim()
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
