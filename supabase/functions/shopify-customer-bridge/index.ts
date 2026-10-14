import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "../shopify-order-sync/response.ts";
import {
  ADDRESS_CREATE,
  ADDRESS_DELETE,
  ADDRESS_UPDATE,
  CUSTOMER_ADDRESSES,
  DISCOUNT_CODE_CREATE,
  DISCOUNT_CODE_LOOKUP,
  SHOPIFY_API_VERSION,
  addressDeleteResult,
  addressFingerprint,
  addressMutationId,
  basicDiscountInput,
  discountCreateId,
  discountLookupId,
  parseCustomerAddresses,
  planAddressReconciliation,
  shopifyCustomerGid,
  toMailingAddress,
  voucherCodeFromBytes,
  type SyncAction,
  type SyncLink,
  type SyncLocalAddress,
  type SyncRemoteAddress,
} from "./logic.ts";

type AdminClient = ReturnType<typeof createClient>;
type StoreTarget = {
  owner_type: "user" | "organization";
  owner_id: string;
  store_id: string;
  customer_gid: string;
  shop_domain: string;
  secret_prefix: string;
};
type VoucherJob = {
  id: string;
  code: string | null;
  amount: number;
  ends_at: string;
  title: string;
  shop_domain: string;
  secret_prefix: string;
  customer_gid: string | null;
};

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

function adminClient(): AdminClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function envFor(prefix: string, suffix: string): string | null {
  return Deno.env.get(`${prefix}_${suffix}`)?.trim() || null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Base64(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(supplied: string, expected: string): boolean {
  const length = Math.max(supplied.length, expected.length);
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < length; index += 1) difference |= (supplied.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  return difference === 0;
}

const shopifyTokens = new Map<string, string>();

async function shopifyToken(target: { secret_prefix: string; shop_domain: string }): Promise<string> {
  const cached = shopifyTokens.get(target.secret_prefix);
  if (cached) return cached;
  const configured = envFor(target.secret_prefix, "ADMIN_ACCESS_TOKEN");
  if (configured) {
    shopifyTokens.set(target.secret_prefix, configured);
    return configured;
  }
  const clientId = envFor(target.secret_prefix, "CLIENT_ID");
  const clientSecret = envFor(target.secret_prefix, "CLIENT_SECRET");
  const shop = envFor(target.secret_prefix, "SHOP") || target.shop_domain;
  if (!clientId || !clientSecret || !shop) throw new Error("shopify_credentials_missing");
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) throw new Error("shopify_auth_failed");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("shopify_auth_failed");
  shopifyTokens.set(target.secret_prefix, payload.access_token);
  return payload.access_token;
}

async function shopifyGraph<T>(target: { secret_prefix: string; shop_domain: string }, query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await shopifyToken(target);
  const shop = envFor(target.secret_prefix, "SHOP") || target.shop_domain;
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`shopify_graphql_failed:${response.status}`);
  const payload = await response.json() as { data?: T; errors?: unknown[] };
  if (!payload.data || payload.errors?.length) throw new Error("shopify_graphql_invalid");
  return payload.data;
}

async function issueVoucher(client: AdminClient, job: VoucherJob) {
  try {
    const code = job.code ?? voucherCodeFromBytes(crypto.getRandomValues(new Uint8Array(10)));
    if (!job.code) {
      const { error } = await client.rpc("shopify_assign_voucher_code", { p_id: job.id, p_code: code });
      if (error) throw error;
    }
    const existing = discountLookupId(await shopifyGraph(job, DISCOUNT_CODE_LOOKUP, { code }));
    const discountId = existing ?? await (async () => {
      const created = discountCreateId(await shopifyGraph(job, DISCOUNT_CODE_CREATE, {
        basicCodeDiscount: basicDiscountInput({
          code,
          title: `FCCD ${job.title}`,
          amount: Number(job.amount),
          startsAt: new Date().toISOString(),
          endsAt: job.ends_at,
          customerGid: job.customer_gid,
        }),
      }));
      if ("error" in created) throw new Error(created.error);
      return created.id;
    })();
    const { error } = await client.rpc("shopify_complete_voucher", { p_id: job.id, p_gid: discountId, p_code: code });
    if (error) throw error;
  } catch (error) {
    await client.rpc("shopify_fail_voucher", { p_id: job.id, p_error: error instanceof Error ? error.message : "shopify_voucher_failed" });
  }
}

async function issueVouchers(client: AdminClient, userId: string | null) {
  const { data, error } = await client.rpc("shopify_claim_voucher_jobs", { p_user_id: userId, p_limit: 20 });
  if (error) throw error;
  for (const job of (data ?? []) as VoucherJob[]) await issueVoucher(client, job);
}

async function reconcileTarget(client: AdminClient, target: StoreTarget) {
  const remote = parseCustomerAddresses(await shopifyGraph(target, CUSTOMER_ADDRESSES, { id: target.customer_gid }));
  const { data, error } = await client.rpc("shopify_address_snapshot", {
    p_owner_type: target.owner_type, p_owner_id: target.owner_id, p_store_id: target.store_id,
  });
  if (error) throw error;
  const snapshot = data as { local: SyncLocalAddress[]; links: SyncLink[] };
  const trackDefault = target.owner_type === "user";
  const actions = planAddressReconciliation({ local: snapshot.local ?? [], remote, links: snapshot.links ?? [], trackDefault });
  for (const action of actions) await applyAction(client, target, snapshot.local ?? [], remote, action, trackDefault);
}

async function applyAction(
  client: AdminClient,
  target: StoreTarget,
  localRows: SyncLocalAddress[],
  remoteRows: SyncRemoteAddress[],
  action: SyncAction,
  trackDefault: boolean,
) {
  const local = "localId" in action ? localRows.find(row => row.id === action.localId) : undefined;
  const remote = "remoteId" in action ? remoteRows.find(row => row.id === action.remoteId) : undefined;
  if (action.type === "hold") return;
  if (action.type === "drop_link") {
    await client.rpc("shopify_clear_address_link", { p_owner_type: target.owner_type, p_local_id: action.localId, p_store_id: target.store_id });
    return;
  }
  if (action.type === "conflict") {
    await client.rpc("shopify_mark_address_conflict", {
      p_owner_type: target.owner_type, p_local_id: action.localId, p_store_id: target.store_id, p_remote_id: action.remoteId,
    });
    return;
  }
  if (action.type === "push_delete") {
    const deleted = addressDeleteResult(await shopifyGraph(target, ADDRESS_DELETE, { customerId: target.customer_gid, addressId: action.remoteId }));
    if ("error" in deleted) throw new Error(deleted.error);
    await client.rpc("shopify_clear_address_link", { p_owner_type: target.owner_type, p_local_id: action.localId, p_store_id: target.store_id });
    return;
  }
  if (action.type === "pull_archive" || action.type === "pull_create" || action.type === "pull_update") {
    const source = remote ?? { recipient: "", phone: "", address: "", isDefault: false, id: action.type === "pull_archive" ? action.remoteId : "" };
    const hash = addressFingerprint({ ...source, isDefault: trackDefault ? source.isDefault : false });
    const { error } = await client.rpc("shopify_apply_address_pull", {
      p_owner_type: target.owner_type,
      p_owner_id: target.owner_id,
      p_store_id: target.store_id,
      p_remote_id: "remoteId" in action ? action.remoteId : source.id,
      p_local_id: "localId" in action ? action.localId : null,
      p_recipient: source.recipient,
      p_phone: source.phone,
      p_address: source.address,
      p_is_default: trackDefault ? source.isDefault : false,
      p_hash: hash,
      p_mode: action.type === "pull_create" ? "create" : action.type === "pull_update" ? "update" : "archive",
    });
    if (error) throw error;
    return;
  }
  if (!local) return;
  const mailing = toMailingAddress(local);
  const created = action.type === "push_create"
    ? addressMutationId(await shopifyGraph(target, ADDRESS_CREATE, { customerId: target.customer_gid, address: mailing, setAsDefault: trackDefault && local.isDefault }), "customerAddressCreate")
    : addressMutationId(await shopifyGraph(target, ADDRESS_UPDATE, { customerId: target.customer_gid, addressId: action.remoteId, address: mailing, setAsDefault: trackDefault && local.isDefault }), "customerAddressUpdate");
  if ("error" in created) throw new Error(created.error);
  await client.rpc("shopify_save_address_link", {
    p_owner_type: target.owner_type,
    p_owner_id: target.owner_id,
    p_local_id: local.id,
    p_store_id: target.store_id,
    p_remote_id: created.id,
    p_hash: addressFingerprint({ ...local, isDefault: trackDefault ? local.isDefault : false }),
  });
}

async function syncTargets(client: AdminClient, targets: StoreTarget[]) {
  const seen = new Set<string>();
  for (const target of targets) {
    const key = `${target.owner_type}:${target.owner_id}:${target.store_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await reconcileTarget(client, target);
      await client.rpc("shopify_finish_address_jobs", {
        p_owner_type: target.owner_type, p_owner_id: target.owner_id, p_store_id: target.store_id, p_error: null,
      });
    } catch (error) {
      await client.rpc("shopify_finish_address_jobs", {
        p_owner_type: target.owner_type, p_owner_id: target.owner_id, p_store_id: target.store_id,
        p_error: error instanceof Error ? error.message : "shopify_address_sync_failed",
      });
    }
  }
}

async function userId(client: AdminClient, request: Request): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || token === serviceKey()) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function cronAuthorized(client: AdminClient, request: Request): Promise<boolean> {
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const { data, error } = await client.from("bubble_incremental_cron_auth").select("secret_sha256").eq("singleton", true).maybeSingle();
  if (error || !data?.secret_sha256) return false;
  return constantTimeEqual(await sha256Hex(supplied), String(data.secret_sha256));
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const client = adminClient();
  const topic = request.headers.get("x-shopify-topic");
  const rawBody = await request.text();
  try {
    if (topic) return await handleWebhook(client, request, rawBody, topic);
    const body = rawBody ? JSON.parse(rawBody) as { action?: string } : {};
    const cron = await cronAuthorized(client, request);
    const actor = cron ? null : await userId(client, request);
    if (!cron && !actor) return jsonResponse({ error: "unauthorized" }, 401);
    if (body.action === "issue_mine" && actor) {
      await issueVouchers(client, actor);
      return jsonResponse({ ok: true });
    }
    if (body.action === "sync_mine" && actor) {
      const { data, error } = await client.rpc("shopify_actor_targets", { p_user_id: actor });
      if (error) throw error;
      await syncTargets(client, (data ?? []) as StoreTarget[]);
      return jsonResponse({ ok: true });
    }
    if (body.action === "drain" && cron) {
      await issueVouchers(client, null);
      const { data, error } = await client.rpc("shopify_claim_address_jobs", { p_limit: 20 });
      if (error) throw error;
      await syncTargets(client, (data ?? []) as StoreTarget[]);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: "unsupported_action" }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "shopify_customer_bridge_failed" }, 500);
  }
});

async function handleWebhook(client: AdminClient, request: Request, rawBody: string, topic: string) {
  if (topic !== "customers/update" && topic !== "customers/create") return jsonResponse({ ok: true, ignored: true });
  const shop = request.headers.get("x-shopify-shop-domain")?.trim().toLowerCase();
  if (!shop) return jsonResponse({ error: "shop_missing" }, 400);
  const { data: store, error } = await client.from("shopify_stores").select("id,shop_domain,secret_prefix").eq("shop_domain", shop).eq("is_active", true).maybeSingle();
  if (error || !store) return jsonResponse({ ok: true, ignored: true });
  const secret = envFor(store.secret_prefix, "WEBHOOK_SECRET") ?? envFor(store.secret_prefix, "CLIENT_SECRET");
  const supplied = request.headers.get("x-shopify-hmac-sha256");
  if (!secret || !supplied || !constantTimeEqual(supplied, await hmacSha256Base64(secret, rawBody))) return jsonResponse({ error: "invalid_signature" }, 401);
  const payload = JSON.parse(rawBody) as { id?: number | string };
  const customerGid = shopifyCustomerGid(String(payload.id ?? ""));
  if (!customerGid) return jsonResponse({ ok: true, ignored: true });
  const { data: identity, error: identityError } = await client.rpc("shopify_identity_for_customer", { p_store_id: store.id, p_customer_gid: customerGid });
  if (identityError) throw identityError;
  if (!identity) return jsonResponse({ ok: true, ignored: true });
  const target = { ...(identity as StoreTarget), shop_domain: store.shop_domain, secret_prefix: store.secret_prefix, store_id: store.id };
  await syncTargets(client, [target]);
  return jsonResponse({ ok: true });
}
