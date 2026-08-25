import { createClient } from "npm:@supabase/supabase-js@2";
import {
  canonicalCatalogJson,
  catalogChangeDiff,
  isShopifyOptionHelperProduct,
  normalizeCatalogProduct,
  parseGloboPackageSchema,
  resolveShopDomain,
  type NormalizedCatalogProduct,
  type ShopifyBundleComponent,
  type ShopifyCatalogEnrichment,
  type ShopifyProduct,
} from "./map.ts";

export const SHOPIFY_API_VERSION = "2026-07";
const PAGE_SIZE = 250;
const MAX_PAGES = 400;
const RETRY_DELAYS_MS = [250, 1000, 3000];

export type AdminClient = ReturnType<typeof createClient>;

export type StoreRow = {
  id: string;
  shop_domain: string;
  channel_id: string | null;
  secret_prefix: string;
};

export type SyncMode = "full" | "incremental" | "specific_product" | "retry_failed" | "webhook";

type RunCounters = {
  fetched: number;
  products: number;
  packages: number;
  matched: number;
  pending: number;
  conflicts: number;
  failed: number;
};

export function emptyCounters(): RunCounters {
  return { fetched: 0, products: 0, packages: 0, matched: 0, pending: 0, conflicts: 0, failed: 0 };
}

export function envFor(prefix: string, suffix: string): string | null {
  return Deno.env.get(`${prefix}_${suffix}`)?.trim() || null;
}

function shopDomainFor(store: StoreRow): string | null {
  return resolveShopDomain(envFor(store.secret_prefix, "SHOP"), store.shop_domain);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(url, init);
    lastResponse = response;
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < RETRY_DELAYS_MS.length) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RETRY_DELAYS_MS[attempt]);
    }
  }
  return lastResponse as Response;
}

export async function getShopifyToken(store: StoreRow): Promise<string> {
  const configured = envFor(store.secret_prefix, "ADMIN_ACCESS_TOKEN");
  if (configured) return configured;
  const clientId = envFor(store.secret_prefix, "CLIENT_ID");
  const clientSecret = envFor(store.secret_prefix, "CLIENT_SECRET");
  const shop = shopDomainFor(store);
  if (!clientId || !clientSecret || !shop) throw new Error("shopify_credentials_missing");
  const response = await fetchWithRetry(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) throw new Error("shopify_auth_failed");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("shopify_auth_failed");
  return payload.access_token;
}

async function shopifyJson<T>(store: StoreRow, token: string, path: string): Promise<T> {
  const shop = shopDomainFor(store);
  if (!shop) throw new Error("shopify_store_invalid");
  const response = await fetchWithRetry(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${path}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`shopify_request_failed:${response.status}`);
  return await response.json() as T;
}

async function graphQl<T>(store: StoreRow, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const shop = shopDomainFor(store);
  if (!shop) throw new Error("shopify_store_invalid");
  const response = await fetchWithRetry(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`shopify_graphql_failed:${response.status}`);
  const payload = await response.json() as { data?: T; errors?: unknown[] };
  if (!payload.data || payload.errors?.length) throw new Error("shopify_graphql_invalid");
  return payload.data;
}

export async function fetchProductEnrichment(
  store: StoreRow,
  token: string,
  product: ShopifyProduct,
): Promise<ShopifyCatalogEnrichment> {
  const productId = Number(product.id);
  type ComponentNode = {
    quantity: number;
    productVariant: {
      legacyResourceId?: string | number | null;
      sku?: string | null;
      displayName?: string | null;
      product?: { legacyResourceId?: string | number | null } | null;
    };
  };
  type VariantNode = {
    legacyResourceId?: string | number | null;
    requiresComponents?: boolean;
    productVariantComponents?: { nodes?: ComponentNode[] } | null;
  };
  type Data = {
    product?: {
      packageSchema?: { value?: string | null } | null;
      variants?: { nodes?: VariantNode[] } | null;
    } | null;
  };
  const data = await graphQl<Data>(store, token, `
    query ShopifyCatalogProduct($id: ID!) {
      product(id: $id) {
        packageSchema: metafield(namespace: "fccd", key: "package_schema") { value }
        variants(first: 100) {
          nodes {
            legacyResourceId
            requiresComponents
            productVariantComponents(first: 30) {
              nodes {
                quantity
                productVariant {
                  legacyResourceId
                  sku
                  displayName
                  product { legacyResourceId }
                }
              }
            }
          }
        }
      }
    }
  `, { id: `gid://shopify/Product/${productId}` });
  const fixedComponents: ShopifyBundleComponent[] = [];
  const variantRequiresComponents: Record<string, boolean> = {};
  for (const variant of data.product?.variants?.nodes ?? []) {
    const parentVariantId = Number(variant.legacyResourceId);
    if (Number.isSafeInteger(parentVariantId)) {
      variantRequiresComponents[String(parentVariantId)] = Boolean(variant.requiresComponents);
    }
    for (const [index, component] of (variant.productVariantComponents?.nodes ?? []).entries()) {
      const childVariantId = Number(component.productVariant.legacyResourceId);
      fixedComponents.push({
        key: `${parentVariantId || "parent"}-${childVariantId || index + 1}`,
        parentVariantId: Number.isSafeInteger(parentVariantId) ? parentVariantId : null,
        productId: Number(component.productVariant.product?.legacyResourceId) || null,
        variantId: Number.isSafeInteger(childVariantId) ? childVariantId : null,
        sku: component.productVariant.sku ?? null,
        name: component.productVariant.displayName ?? component.productVariant.sku ?? `Component ${index + 1}`,
        quantity: Number(component.quantity) || 1,
      });
    }
  }
  let packageSchema: unknown = data.product?.packageSchema?.value ?? null;
  const tags = Array.isArray(product.tags) ? product.tags.join(",") : String(product.tags ?? "");
  const mayUseStorefrontOptions = /自選|任選|套餐/.test(`${product.title ?? ""} ${product.product_type ?? ""} ${tags}`);
  if (!packageSchema && !fixedComponents.length && mayUseStorefrontOptions && product.handle) {
    const shop = shopDomainFor(store);
    if (shop) {
      try {
        const response = await fetchWithRetry(`https://${shop}/products/${encodeURIComponent(product.handle)}`, {
          headers: { Accept: "text/html" },
        });
        if (response.ok) packageSchema = parseGloboPackageSchema(await response.text(), productId);
      } catch {
        // Storefront option enrichment is best-effort; the Admin API record remains reviewable.
      }
    }
  }
  return {
    fixedComponents,
    packageSchema,
    variantRequiresComponents,
  };
}

async function fetchProducts(
  store: StoreRow,
  token: string,
  mode: SyncMode,
  productId: number | null,
  updatedAtMin: string | null,
): Promise<ShopifyProduct[]> {
  if (mode === "specific_product" || mode === "webhook") {
    if (!productId) throw new Error("shopify_product_id_required");
    const payload = await shopifyJson<{ product?: ShopifyProduct }>(store, token, `products/${productId}.json`);
    return payload.product ? [payload.product] : [];
  }
  const products: ShopifyProduct[] = [];
  let pageInfo: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (pageInfo) params.set("page_info", pageInfo);
    else if (mode === "incremental" && updatedAtMin) params.set("updated_at_min", updatedAtMin);
    const shop = shopDomainFor(store);
    if (!shop) throw new Error("shopify_store_invalid");
    const response = await fetchWithRetry(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?${params}`,
      { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" } },
    );
    if (!response.ok) throw new Error(`shopify_products_failed:${response.status}`);
    const payload = await response.json() as { products?: ShopifyProduct[] };
    products.push(...(payload.products ?? []));
    const next = (response.headers.get("Link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
    pageInfo = next ? new URL(next[1]).searchParams.get("page_info") : null;
    if (!pageInfo) break;
  }
  return products;
}

type CatalogMatch = { status: "mapped" | "sku_matched" | "unmatched" | "missing_sku" | "duplicate_sku"; productId: string | null };

async function resolveMatches(
  client: AdminClient,
  store: StoreRow,
  normalized: NormalizedCatalogProduct,
): Promise<{ variantMatches: Map<number, CatalogMatch>; itemMatches: Map<string, CatalogMatch> }> {
  const variantIds = [...new Set([
    ...normalized.variants.map((variant) => variant.shopifyVariantId),
    ...normalized.packageItems.map((item) => item.childVariantId).filter((id): id is number => Boolean(id)),
  ])];
  const skus = [...new Set([
    ...normalized.variants.map((variant) => variant.sku),
    ...normalized.packageItems.map((item) => item.sku),
  ].filter((sku): sku is string => Boolean(sku)))];

  const [{ data: mappingRows, error: mappingError }, { data: productRows, error: productError }] = await Promise.all([
    variantIds.length
      ? client.from("shopify_catalog_mappings")
        .select("shopify_variant_id,internal_product_id")
        .eq("store_id", store.id)
        .eq("resource_type", "product_variant")
        .eq("is_active", true)
        .in("shopify_variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    skus.length
      ? client.from("products").select("id,sku,channel_id").in("sku", skus).is("archived_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (mappingError) throw mappingError;
  if (productError) throw productError;
  const mapped = new Map<number, string>();
  for (const row of mappingRows ?? []) mapped.set(Number(row.shopify_variant_id), String(row.internal_product_id));
  const productsBySku = new Map<string, Array<{ id: string; channelId: string | null }>>();
  for (const row of productRows ?? []) {
    const key = String(row.sku ?? "").trim();
    if (!key) continue;
    const entries = productsBySku.get(key) ?? [];
    entries.push({ id: String(row.id), channelId: row.channel_id ? String(row.channel_id) : null });
    productsBySku.set(key, entries);
  }
  const match = (variantId: number | null, sku: string | null): CatalogMatch => {
    if (variantId && mapped.has(variantId)) return { status: "mapped", productId: mapped.get(variantId) ?? null };
    if (!sku) return { status: "missing_sku", productId: null };
    const candidates = productsBySku.get(sku) ?? [];
    const channelCandidates = store.channel_id
      ? candidates.filter((candidate) => candidate.channelId === store.channel_id)
      : candidates;
    const resolved = channelCandidates.length ? channelCandidates : candidates;
    if (resolved.length === 1) return { status: "sku_matched", productId: resolved[0].id };
    if (resolved.length > 1) return { status: "duplicate_sku", productId: null };
    return { status: "unmatched", productId: null };
  };
  return {
    variantMatches: new Map(normalized.variants.map((variant) => [variant.shopifyVariantId, match(variant.shopifyVariantId, variant.sku)])),
    itemMatches: new Map(normalized.packageItems.map((item) => [item.externalKey, match(item.childVariantId, item.sku)])),
  };
}

export async function persistCatalogProduct(input: {
  client: AdminClient;
  store: StoreRow;
  product: ShopifyProduct;
  enrichment?: ShopifyCatalogEnrichment;
  runId?: string | null;
  sourceTopic?: string | null;
}): Promise<{ status: string; catalogType: string; matched: number }> {
  const normalized = normalizeCatalogProduct(input.product, input.enrichment);
  const fingerprint = await sha256Hex(canonicalCatalogJson(normalized));
  const ignored = isShopifyOptionHelperProduct(input.product);
  const { variantMatches, itemMatches } = ignored
    ? { variantMatches: new Map<number, CatalogMatch>(), itemMatches: new Map<string, CatalogMatch>() }
    : await resolveMatches(input.client, input.store, normalized);
  const blockingReasons = new Set<string>();
  for (const match of variantMatches.values()) {
    if (match.status === "missing_sku" || match.status === "duplicate_sku") blockingReasons.add(match.status);
  }
  for (const match of itemMatches.values()) {
    if (!match.productId) blockingReasons.add(`package_item_${match.status}`);
  }
  const { data: previous, error: previousError } = await input.client
    .from("shopify_catalog_drafts")
    .select("id,approval_status,approved_fingerprint,approved_snapshot,content_fingerprint,normalized_snapshot,updated_at")
    .eq("store_id", input.store.id)
    .eq("shopify_product_id", normalized.shopifyProductId)
    .maybeSingle();
  if (previousError) throw previousError;
  const hasApprovedMapping = Boolean(previous?.approved_fingerprint || previous?.approval_status === "approved");
  let approvalStatus = ignored ? "ignored" : blockingReasons.size
    ? (normalized.catalogType === "product" ? "conflict" : "dependency_pending")
    : hasApprovedMapping && previous?.approved_fingerprint !== fingerprint
      ? "change_pending"
      : hasApprovedMapping ? "approved" : "pending";
  if (previous?.content_fingerprint === fingerprint && previous.approval_status === "rejected") {
    approvalStatus = "rejected";
  }
  const changeDiff = !ignored && hasApprovedMapping
    ? catalogChangeDiff((previous?.approved_snapshot as Record<string, unknown> | null) ?? null, normalized as unknown as Record<string, unknown>)
    : {};
  const draftRow = {
    store_id: input.store.id,
    shopify_product_id: normalized.shopifyProductId,
    title: normalized.title,
    handle: normalized.handle,
    description_html: normalized.descriptionHtml,
    vendor: normalized.vendor,
    product_type: normalized.productType,
    catalog_type: ignored ? "unknown" : normalized.catalogType,
    shopify_status: normalized.shopifyStatus,
    tags: normalized.tags,
    featured_image_url: normalized.featuredImageUrl,
    source_created_at: normalized.sourceCreatedAt,
    source_updated_at: normalized.sourceUpdatedAt,
    source_topic: input.sourceTopic,
    source_run_id: input.runId ?? null,
    approval_status: approvalStatus,
    content_fingerprint: fingerprint,
    raw_snapshot: input.product,
    normalized_snapshot: normalized,
    change_diff: changeDiff,
    blocking_reasons: [...blockingReasons],
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { data: draft, error: draftError } = await input.client
    .from("shopify_catalog_drafts")
    .upsert(draftRow, { onConflict: "store_id,shopify_product_id" })
    .select("id")
    .single();
  if (draftError) throw draftError;
  const draftId = String(draft.id);
  const cleanup = await Promise.all([
    input.client.from("shopify_catalog_draft_package_items").delete().eq("draft_id", draftId),
    input.client.from("shopify_catalog_draft_choice_sets").delete().eq("draft_id", draftId),
    input.client.from("shopify_catalog_draft_variants").delete().eq("draft_id", draftId),
  ]);
  const cleanupError = cleanup.find((result) => result.error)?.error;
  if (cleanupError) throw cleanupError;
  if (ignored) return { status: "ignored", catalogType: "unknown", matched: 0 };
  if (normalized.variants.length) {
    const { error } = await input.client.from("shopify_catalog_draft_variants").insert(
      normalized.variants.map((variant) => {
        const resolved = variantMatches.get(variant.shopifyVariantId) as CatalogMatch;
        return {
          draft_id: draftId,
          shopify_variant_id: variant.shopifyVariantId,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price,
          compare_at_price: variant.compareAtPrice,
          option_values: variant.optionValues,
          image_url: variant.imageUrl,
          requires_components: variant.requiresComponents,
          matched_product_id: resolved.productId,
          match_status: resolved.status,
        };
      }),
    );
    if (error) throw error;
  }
  const choiceIds = new Map<string, string>();
  if (normalized.choiceSets.length) {
    const { data, error } = await input.client.from("shopify_catalog_draft_choice_sets").insert(
      normalized.choiceSets.map((choice) => ({
        draft_id: draftId,
        external_key: choice.externalKey,
        name: choice.name,
        minimum_choices: choice.minimumChoices,
        maximum_choices: choice.maximumChoices,
        sort_order: choice.sortOrder,
      })),
    ).select("id,external_key");
    if (error) throw error;
    for (const row of data ?? []) choiceIds.set(String(row.external_key), String(row.id));
  }
  if (normalized.packageItems.length) {
    const { error } = await input.client.from("shopify_catalog_draft_package_items").insert(
      normalized.packageItems.map((item) => {
        const resolved = itemMatches.get(item.externalKey) as CatalogMatch;
        return {
          draft_id: draftId,
          choice_set_id: item.choiceSetKey ? choiceIds.get(item.choiceSetKey) ?? null : null,
          external_key: item.externalKey,
          parent_variant_id: item.parentVariantId,
          child_shopify_product_id: item.childProductId,
          child_shopify_variant_id: item.childVariantId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          addon_price: item.addonPrice,
          is_required: item.isRequired,
          is_default: item.isDefault,
          matched_product_id: resolved.productId,
          match_status: resolved.status,
        };
      }),
    );
    if (error) throw error;
  }
  const matched = [...variantMatches.values(), ...itemMatches.values()].filter((match) => Boolean(match.productId)).length;
  return { status: approvalStatus, catalogType: normalized.catalogType, matched };
}

async function recordRunError(client: AdminClient, runId: string, storeId: string, productId: number | null, error: unknown) {
  await client.from("shopify_catalog_sync_errors").insert({
    run_id: runId,
    store_id: storeId,
    shopify_product_id: productId,
    code: error instanceof Error ? error.message.split(":")[0] : "shopify_catalog_sync_failed",
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  });
}

export async function runStoreSync(input: {
  client: AdminClient;
  store: StoreRow;
  mode: SyncMode;
  source: "manual" | "reconciliation";
  requestedBy?: string | null;
  productId?: number | null;
  runId?: string;
}): Promise<{ runId: string; counters: RunCounters; status: string }> {
  const runId = input.runId ?? await createCatalogSyncRun(input);
  await input.client.from("shopify_catalog_sync_runs").update({
    status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", runId);
  const counters = emptyCounters();
  try {
    const token = await getShopifyToken(input.store);
    await drainWebhookEvents(input.client, input.store);
    const { data: checkpoint } = await input.client.from("shopify_catalog_sync_checkpoints")
      .select("last_successful_synced_at").eq("store_id", input.store.id).maybeSingle();
    const previous = checkpoint?.last_successful_synced_at
      ? new Date(String(checkpoint.last_successful_synced_at))
      : null;
    const updatedAtMin = previous
      ? new Date(previous.getTime() - 10 * 60 * 1000).toISOString()
      : null;
    const products = input.mode === "retry_failed"
      ? await retryFailedProducts(input.client, input.store, token, runId)
      : await fetchProducts(input.store, token, input.mode, input.productId ?? null, updatedAtMin);
    for (const product of products) {
      counters.fetched += 1;
      try {
        const enrichment = await fetchProductEnrichment(input.store, token, product);
        const result = await persistCatalogProduct({
          client: input.client,
          store: input.store,
          product,
          enrichment,
          runId,
          sourceTopic: null,
        });
        if (result.status === "ignored") continue;
        if (result.catalogType === "product") counters.products += 1;
        else counters.packages += 1;
        counters.matched += result.matched;
        if (result.status === "conflict" || result.status === "dependency_pending") counters.conflicts += 1;
        else counters.pending += 1;
      } catch (error) {
        counters.failed += 1;
        await recordRunError(input.client, runId, input.store.id, Number(product.id), error);
      }
    }
    const status = counters.failed === 0 ? "completed" : counters.fetched > counters.failed ? "completed_with_errors" : "failed";
    await input.client.from("shopify_catalog_sync_runs").update({
      status,
      total_fetched: counters.fetched,
      product_count: counters.products,
      package_count: counters.packages,
      matched_count: counters.matched,
      pending_count: counters.pending,
      conflict_count: counters.conflicts,
      failed_count: counters.failed,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", runId);
    if (status !== "failed") {
      const now = new Date().toISOString();
      await input.client.from("shopify_catalog_sync_checkpoints").upsert({
        store_id: input.store.id,
        last_successful_synced_at: now,
        last_full_sync_at: input.mode === "full" ? now : undefined,
        updated_at: now,
      }, { onConflict: "store_id" });
    }
    return { runId, counters, status };
  } catch (error) {
    counters.failed += 1;
    await recordRunError(input.client, runId, input.store.id, input.productId ?? null, error);
    await input.client.from("shopify_catalog_sync_runs").update({
      status: "failed", failed_count: counters.failed,
      finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, counters, status: "failed" };
  }
}

export async function createCatalogSyncRun(input: {
  client: AdminClient;
  store: StoreRow;
  mode: SyncMode;
  source: "manual" | "reconciliation";
  requestedBy?: string | null;
  productId?: number | null;
}): Promise<string> {
  const { data, error } = await input.client.from("shopify_catalog_sync_runs").insert({
    store_id: input.store.id,
    mode: input.mode,
    source: input.source,
    requested_product_id: input.productId ?? null,
    status: "queued",
    requested_by: input.requestedBy ?? null,
  }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

async function drainWebhookEvents(client: AdminClient, store: StoreRow) {
  const { data, error } = await client.from("shopify_catalog_webhook_events")
    .select("id,topic,payload")
    .eq("store_id", store.id)
    .in("status", ["queued", "failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  for (const event of data ?? []) {
    await processWebhookEvent({
      client,
      eventId: String(event.id),
      store,
      topic: String(event.topic),
      product: event.payload as ShopifyProduct,
    });
  }
}

async function retryFailedProducts(client: AdminClient, store: StoreRow, token: string, runId: string): Promise<ShopifyProduct[]> {
  const { data, error } = await client.from("shopify_catalog_sync_errors")
    .select("shopify_product_id")
    .eq("store_id", store.id)
    .eq("retryable", true)
    .not("shopify_product_id", "is", null)
    .limit(100);
  if (error) throw error;
  const ids = Array.from(new Set<number>(
    (data ?? [])
      .map((row: { shopify_product_id: number | string | null }) => Number(row.shopify_product_id))
      .filter((id: number) => Number.isSafeInteger(id) && id > 0),
  ));
  const products: ShopifyProduct[] = [];
  for (const id of ids) {
    try {
      const payload = await shopifyJson<{ product?: ShopifyProduct }>(store, token, `products/${id}.json`);
      if (payload.product) products.push(payload.product);
    } catch (error) {
      await recordRunError(client, runId, store.id, id, error);
    }
  }
  return products;
}

export async function processWebhookEvent(input: {
  client: AdminClient;
  eventId: string;
  store: StoreRow;
  topic: string;
  product: ShopifyProduct;
}) {
  const { data: current } = await input.client.from("shopify_catalog_webhook_events")
    .select("attempt_count").eq("id", input.eventId).maybeSingle();
  await input.client.from("shopify_catalog_webhook_events").update({
    status: "processing",
    attempt_count: Number(current?.attempt_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", input.eventId);
  try {
    if (input.topic === "products/delete") {
      await input.client.from("shopify_catalog_drafts").update({
        approval_status: "deleted",
        source_topic: input.topic,
        source_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("store_id", input.store.id).eq("shopify_product_id", Number(input.product.id));
    } else {
      const token = await getShopifyToken(input.store);
      const enrichment = await fetchProductEnrichment(input.store, token, input.product);
      await persistCatalogProduct({
        client: input.client,
        store: input.store,
        product: input.product,
        enrichment,
        sourceTopic: input.topic,
      });
    }
    await input.client.from("shopify_catalog_webhook_events").update({
      status: "processed", processed_at: new Date().toISOString(), last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", input.eventId);
    await input.client.from("shopify_catalog_sync_checkpoints").upsert({
      store_id: input.store.id, last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });
  } catch (error) {
    await input.client.from("shopify_catalog_webhook_events").update({
      status: "failed",
      last_error: error instanceof Error ? error.message : String(error),
      next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", input.eventId);
  }
}
