import { supabase } from "@/lib/supabase";

export const SHOPIFY_PENDING_PAGE_SIZE = 20;

export type ShopifyCatalogType =
  | "product"
  | "fixed_package"
  | "configurable_package"
  | "unknown";

export type ShopifyApprovalStatus =
  | "pending"
  | "change_pending"
  | "dependency_pending"
  | "conflict"
  | "approved"
  | "rejected"
  | "deleted";

export type ShopifyStoreOption = {
  id: string;
  domain: string;
};

export type ShopifyPendingItem = {
  id: string;
  storeId: string;
  storeDomain: string;
  shopifyProductId: number;
  title: string;
  catalogType: ShopifyCatalogType;
  status: ShopifyApprovalStatus;
  shopifyStatus: string | null;
  variantCount: number;
  skus: string[];
  blockingReasons: string[];
  sourceTopic: string | null;
  updatedAt: string;
};

export type ShopifyDraftVariant = {
  id: string;
  shopifyVariantId: number;
  title: string | null;
  sku: string | null;
  price: number | null;
  matchedProductId: string | null;
  matchStatus: string;
};

export type ShopifyDraftPackageItem = {
  id: string;
  choiceSetId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  addonPrice: number;
  matchedProductId: string | null;
  matchStatus: string;
  required: boolean;
};

export type ShopifyDraftChoiceSet = {
  id: string;
  key: string;
  name: string;
  minimumChoices: number | null;
  maximumChoices: number;
  items: ShopifyDraftPackageItem[];
};

export type ShopifyPendingDetail = ShopifyPendingItem & {
  handle: string | null;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  featuredImageUrl: string | null;
  sourceUpdatedAt: string | null;
  changeDiff: Record<string, { before: unknown; after: unknown }>;
  variants: ShopifyDraftVariant[];
  choiceSets: ShopifyDraftChoiceSet[];
  fixedItems: ShopifyDraftPackageItem[];
};

export type ShopifySyncMode = "full" | "incremental" | "specific_product" | "retry_failed";

export type ShopifySyncRun = {
  id: string;
  mode: ShopifySyncMode | "webhook";
  status: string;
  storeDomain: string | null;
  totalFetched: number;
  products: number;
  packages: number;
  pending: number;
  conflicts: number;
  failed: number;
  createdAt: string;
  finishedAt: string | null;
};

export type ShopifyProductCandidate = {
  id: string;
  sku: string | null;
  name: string;
};

type RelatedStore = { shop_domain: string } | Array<{ shop_domain: string }> | null;

function relationStore(value: RelatedStore): string {
  return (Array.isArray(value) ? value[0]?.shop_domain : value?.shop_domain) ?? "—";
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchShopifyStores(): Promise<ShopifyStoreOption[]> {
  const { data, error } = await supabase
    .from("shopify_stores")
    .select("id,shop_domain")
    .eq("is_active", true)
    .order("shop_domain");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, domain: String(row.shop_domain) }));
}

export async function fetchShopifyPendingItems(input: {
  page: number;
  search?: string;
  storeId?: string;
  status?: string;
  catalogType?: string;
}): Promise<{ items: ShopifyPendingItem[]; total: number }> {
  const from = (input.page - 1) * SHOPIFY_PENDING_PAGE_SIZE;
  let query = supabase
    .from("shopify_catalog_drafts")
    .select(
      "id,store_id,shopify_product_id,title,catalog_type,approval_status,shopify_status,blocking_reasons,source_topic,updated_at,shopify_stores(shop_domain),shopify_catalog_draft_variants(sku)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, from + SHOPIFY_PENDING_PAGE_SIZE - 1);
  if (input.storeId) query = query.eq("store_id", input.storeId);
  if (input.status) query = query.eq("approval_status", input.status);
  else query = query.in("approval_status", ["pending", "change_pending", "dependency_pending", "conflict"]);
  if (input.catalogType) query = query.eq("catalog_type", input.catalogType);
  const search = input.search?.trim().replace(/[,%()]/g, "") ?? "";
  if (search) query = query.or(`title.ilike.%${search}%,handle.ilike.%${search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return {
    items: (data ?? []).map((row) => {
      const variants = (row.shopify_catalog_draft_variants ?? []) as Array<{ sku: string | null }>;
      return {
        id: row.id as string,
        storeId: row.store_id as string,
        storeDomain: relationStore(row.shopify_stores as RelatedStore),
        shopifyProductId: numberValue(row.shopify_product_id),
        title: String(row.title),
        catalogType: row.catalog_type as ShopifyCatalogType,
        status: row.approval_status as ShopifyApprovalStatus,
        shopifyStatus: row.shopify_status as string | null,
        variantCount: variants.length,
        skus: variants.map((variant) => variant.sku?.trim()).filter((sku): sku is string => Boolean(sku)),
        blockingReasons: (row.blocking_reasons ?? []) as string[],
        sourceTopic: row.source_topic as string | null,
        updatedAt: String(row.updated_at),
      };
    }),
    total: count ?? 0,
  };
}

export async function fetchShopifyPendingDetail(id: string): Promise<ShopifyPendingDetail | null> {
  const { data, error } = await supabase
    .from("shopify_catalog_drafts")
    .select("*,shopify_stores(shop_domain),shopify_catalog_draft_variants(*),shopify_catalog_draft_choice_sets(*),shopify_catalog_draft_package_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const variants = (data.shopify_catalog_draft_variants ?? []) as Array<Record<string, unknown>>;
  const itemRows = (data.shopify_catalog_draft_package_items ?? []) as Array<Record<string, unknown>>;
  const items: ShopifyDraftPackageItem[] = itemRows.map((row) => ({
    id: String(row.id),
    choiceSetId: row.choice_set_id ? String(row.choice_set_id) : null,
    name: String(row.name),
    sku: row.sku ? String(row.sku) : null,
    quantity: numberValue(row.quantity),
    addonPrice: numberValue(row.addon_price),
    matchedProductId: row.matched_product_id ? String(row.matched_product_id) : null,
    matchStatus: String(row.match_status),
    required: Boolean(row.is_required),
  }));
  const choiceSets = ((data.shopify_catalog_draft_choice_sets ?? []) as Array<Record<string, unknown>>)
    .sort((left, right) => numberValue(left.sort_order) - numberValue(right.sort_order))
    .map((row) => ({
      id: String(row.id),
      key: String(row.external_key),
      name: String(row.name),
      minimumChoices: row.minimum_choices === null ? null : numberValue(row.minimum_choices),
      maximumChoices: numberValue(row.maximum_choices),
      items: items.filter((item) => item.choiceSetId === String(row.id)),
    }));
  return {
    id: data.id as string,
    storeId: data.store_id as string,
    storeDomain: relationStore(data.shopify_stores as RelatedStore),
    shopifyProductId: numberValue(data.shopify_product_id),
    title: String(data.title),
    catalogType: data.catalog_type as ShopifyCatalogType,
    status: data.approval_status as ShopifyApprovalStatus,
    shopifyStatus: data.shopify_status as string | null,
    variantCount: variants.length,
    skus: variants.map((row) => row.sku ? String(row.sku) : "").filter(Boolean),
    blockingReasons: (data.blocking_reasons ?? []) as string[],
    sourceTopic: data.source_topic as string | null,
    updatedAt: String(data.updated_at),
    handle: data.handle as string | null,
    descriptionHtml: data.description_html as string | null,
    vendor: data.vendor as string | null,
    productType: data.product_type as string | null,
    featuredImageUrl: data.featured_image_url as string | null,
    sourceUpdatedAt: data.source_updated_at as string | null,
    changeDiff: (data.change_diff ?? {}) as Record<string, { before: unknown; after: unknown }>,
    variants: variants.map((row) => ({
      id: String(row.id),
      shopifyVariantId: numberValue(row.shopify_variant_id),
      title: row.title ? String(row.title) : null,
      sku: row.sku ? String(row.sku) : null,
      price: row.price === null ? null : numberValue(row.price),
      matchedProductId: row.matched_product_id ? String(row.matched_product_id) : null,
      matchStatus: String(row.match_status),
    })),
    choiceSets,
    fixedItems: items.filter((item) => !item.choiceSetId),
  };
}

export async function fetchShopifySyncRuns(limit = 10): Promise<ShopifySyncRun[]> {
  const { data, error } = await supabase
    .from("shopify_catalog_sync_runs")
    .select("*,shopify_stores(shop_domain)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    mode: row.mode as ShopifySyncRun["mode"],
    status: String(row.status),
    storeDomain: relationStore(row.shopify_stores as RelatedStore),
    totalFetched: numberValue(row.total_fetched),
    products: numberValue(row.product_count),
    packages: numberValue(row.package_count),
    pending: numberValue(row.pending_count),
    conflicts: numberValue(row.conflict_count),
    failed: numberValue(row.failed_count),
    createdAt: String(row.created_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }));
}

export async function startShopifyCatalogSync(input: {
  mode: ShopifySyncMode;
  storeId?: string;
  productId?: number;
}) {
  const { data, error } = await supabase.functions.invoke("shopify-product-sync", {
    body: {
      mode: input.mode,
      store: input.storeId || undefined,
      productId: input.productId,
    },
  });
  if (error) throw error;
  return data as { ok: boolean; results: Array<{ runId: string; status: string }> };
}

export async function approveShopifyCatalogDraft(id: string, expectedUpdatedAt: string, note: string) {
  const { data, error } = await supabase.rpc("approve_shopify_pending_catalog_item", {
    p_draft_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_review_note: note.trim() || null,
  });
  if (error) throw error;
  return data as { status: string; packageId?: string; productIdsCreated?: number };
}

export async function rejectShopifyCatalogDraft(id: string, expectedUpdatedAt: string, note: string) {
  const { data, error } = await supabase.rpc("reject_shopify_pending_catalog_item", {
    p_draft_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_review_note: note.trim() || null,
  });
  if (error) throw error;
  return data as { status: string };
}

export async function searchShopifyMatchCandidates(search: string): Promise<ShopifyProductCandidate[]> {
  const term = search.trim().replace(/[,%()]/g, "");
  if (!term) return [];
  const { data, error } = await supabase.from("products")
    .select("id,sku,name")
    .is("archived_at", null)
    .eq("is_active", true)
    .or(`sku.ilike.%${term}%,name.ilike.%${term}%`)
    .order("sku", { ascending: true, nullsFirst: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    sku: row.sku as string | null,
    name: String(row.name),
  }));
}

export async function resolveShopifyCatalogMatch(input: {
  draftId: string;
  variantRowId?: string;
  packageItemRowId?: string;
  productId: string;
  expectedUpdatedAt: string;
}) {
  const { data, error } = await supabase.rpc("resolve_shopify_catalog_match", {
    p_draft_id: input.draftId,
    p_variant_row_id: input.variantRowId ?? null,
    p_package_item_row_id: input.packageItemRowId ?? null,
    p_product_id: input.productId,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw error;
  return data as { status: ShopifyApprovalStatus; updatedAt: string };
}
