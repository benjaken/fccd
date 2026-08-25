import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeShopDomain, type ShopifyProduct } from "./map.ts";
import { corsHeaders, jsonResponse } from "./response.ts";
import {
  envFor,
  createCatalogSyncRun,
  processWebhookEvent,
  runStoreSync,
  type AdminClient,
  type StoreRow,
  type SyncMode,
} from "./sync.ts";

const WEBHOOK_TOPICS = new Set(["products/create", "products/update", "products/delete"]);
const MANUAL_MODES = new Set<SyncMode>(["full", "incremental", "specific_product", "retry_failed"]);

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

function createAdminClient(): AdminClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function constantTimeEqual(supplied: string | null, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = (supplied ?? "").length ^ expected.length;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function hmacSha256Base64(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function verifyWebhook(request: Request, store: StoreRow, rawBody: string): Promise<boolean> {
  const supplied = request.headers.get("X-Shopify-Hmac-Sha256");
  const secret = envFor(store.secret_prefix, "WEBHOOK_SECRET") ?? envFor(store.secret_prefix, "CLIENT_SECRET");
  if (!supplied || !secret) return false;
  return constantTimeEqual(supplied, await hmacSha256Base64(secret, rawBody));
}

async function authenticateCron(request: Request, client: AdminClient): Promise<boolean> {
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const { data, error } = await client.from("bubble_incremental_cron_auth")
    .select("secret_sha256").eq("singleton", true).single();
  return !error && Boolean(data?.secret_sha256) &&
    constantTimeEqual(await sha256Hex(supplied), String(data.secret_sha256));
}

async function authenticateManager(request: Request, client: AdminClient): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return { ok: false };
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user) return { ok: false, error: "invalid_authorization" };
  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
  if (!role) return { ok: false, error: "page_manage_required" };
  if (role === "Super Admin" || role === "Admin") return { ok: true, userId: user.id };
  const { data, error: permissionError } = await client.from("role_page_permissions")
    .select("can_manage")
    .eq("role", role)
    .eq("page_key", "products.shopify_pending")
    .maybeSingle();
  if (permissionError) return { ok: false, error: "permission_check_failed" };
  return data?.can_manage ? { ok: true, userId: user.id } : { ok: false, error: "page_manage_required" };
}

function storeDomains(store: StoreRow): string[] {
  return [
    store.shop_domain,
    envFor(store.secret_prefix, "SHOP"),
    ...(envFor(store.secret_prefix, "SHOP_ALIASES")?.split(",") ?? []),
  ].map(normalizeShopDomain).filter((domain): domain is string => Boolean(domain));
}

function defer(promise: Promise<unknown>, waitUntil?: (promise: Promise<unknown>) => void) {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (waitUntil) waitUntil(promise);
  else if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}

export function createShopifyProductSyncHandler(input: {
  createClient?: () => AdminClient;
  waitUntil?: (promise: Promise<unknown>) => void;
} = {}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
    const client = input.createClient?.() ?? createAdminClient();
    const topic = request.headers.get("X-Shopify-Topic");
    if (topic) {
      if (!WEBHOOK_TOPICS.has(topic)) return jsonResponse({ error: "topic_not_allowed" }, 400);
      const rawBody = await request.text();
      if (!rawBody) return jsonResponse({ error: "empty_body" }, 400);
      let product: ShopifyProduct;
      try {
        product = JSON.parse(rawBody) as ShopifyProduct;
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }
      if (!Number.isSafeInteger(Number(product.id)) || Number(product.id) <= 0) {
        return jsonResponse({ error: "missing_product_id" }, 400);
      }
      const webhookId = request.headers.get("X-Shopify-Webhook-Id")?.trim();
      if (!webhookId) return jsonResponse({ error: "missing_webhook_id" }, 400);
      const shopDomain = normalizeShopDomain(request.headers.get("X-Shopify-Shop-Domain"));
      if (!shopDomain) return jsonResponse({ error: "invalid_shop_domain" }, 400);
      const { data: stores, error: storeError } = await client.from("shopify_stores")
        .select("id,shop_domain,channel_id,secret_prefix").eq("is_active", true);
      if (storeError) return jsonResponse({ error: "store_lookup_failed" }, 500);
      const store = (stores ?? []).find((candidate: unknown) =>
        storeDomains(candidate as StoreRow).includes(shopDomain)
      ) as StoreRow | undefined;
      if (!store) return jsonResponse({ error: "store_not_found" }, 404);
      if (!(await verifyWebhook(request, store, rawBody))) {
        return jsonResponse({ error: "invalid_webhook_signature" }, 401);
      }
      const eventRow = {
        store_id: store.id,
        webhook_id: webhookId,
        event_id: request.headers.get("X-Shopify-Event-Id"),
        topic,
        shopify_product_id: Number(product.id),
        api_version: request.headers.get("X-Shopify-API-Version"),
        triggered_at: request.headers.get("X-Shopify-Triggered-At"),
        payload: product,
        status: "queued",
      };
      const { data: inserted, error: insertError } = await client.from("shopify_catalog_webhook_events")
        .upsert(eventRow, { onConflict: "store_id,webhook_id", ignoreDuplicates: true })
        .select("id,status").maybeSingle();
      if (insertError) return jsonResponse({ error: "webhook_enqueue_failed" }, 500);
      if (!inserted) return jsonResponse({ ok: true, duplicate: true, webhookId }, 200);
      defer(processWebhookEvent({ client, eventId: String(inserted.id), store, topic, product }), input.waitUntil);
      return jsonResponse({ ok: true, accepted: true, webhookId }, 202);
    }

    let body: { mode?: string; source?: string; store?: string; productId?: number | string };
    try {
      body = request.headers.get("content-type")?.includes("application/json")
        ? await request.json() as typeof body
        : {};
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }
    const cronOk = await authenticateCron(request, client);
    const manager = cronOk ? { ok: true } : await authenticateManager(request, client);
    if (!manager.ok) return jsonResponse({ error: manager.error ?? "unauthorized" }, 401);
    const mode = (body.mode ?? "incremental") as SyncMode;
    if (!MANUAL_MODES.has(mode)) return jsonResponse({ error: "invalid_sync_mode" }, 400);
    const productId = body.productId === undefined || body.productId === ""
      ? null
      : Number(body.productId);
    if (mode === "specific_product" && (!Number.isSafeInteger(productId) || Number(productId) <= 0)) {
      return jsonResponse({ error: "product_id_required" }, 400);
    }
    let storeQuery = client.from("shopify_stores")
      .select("id,shop_domain,channel_id,secret_prefix").eq("is_active", true);
    if (body.store) storeQuery = storeQuery.eq("id", body.store);
    const { data: stores, error: storesError } = await storeQuery;
    if (storesError) return jsonResponse({ error: "store_lookup_failed" }, 500);
    if (!stores?.length) return jsonResponse({ error: "store_not_configured" }, 404);
    const source = cronOk || body.source === "reconciliation" ? "reconciliation" : "manual";
    const results: Array<{ runId: string; status: string }> = [];
    for (const store of stores) {
      const storeRow = store as StoreRow;
      const runId = await createCatalogSyncRun({
        client,
        store: storeRow,
        mode,
        source,
        requestedBy: manager.userId ?? null,
        productId,
      });
      defer(runStoreSync({
        client,
        store: storeRow,
        mode,
        source,
        requestedBy: manager.userId ?? null,
        productId,
        runId,
      }), input.waitUntil);
      results.push({ runId, status: "queued" });
    }
    return jsonResponse({
      ok: true,
      mode,
      source,
      results,
    }, 202);
  };
}

const handler = createShopifyProductSyncHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
