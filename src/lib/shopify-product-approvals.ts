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
  | "ignored"
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
  currentProduct: ShopifyCurrentProduct | null;
};

export type ShopifyCurrentProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  isActive: boolean;
  status: string | null;
  updatedAt: string;
};

export type ShopifyCurrentPackageItem = {
  id: string;
  productId: string;
  quantity: number;
  addonPrice: number;
  isSelected: boolean;
};

export type ShopifyCurrentPackage = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | null;
  isActive: boolean;
  status: string | null;
  updatedAt: string;
  items: ShopifyCurrentPackageItem[];
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
  isDefault: boolean;
  currentProduct: ShopifyCurrentProduct | null;
  currentPackageItem: ShopifyCurrentPackageItem | null;
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
  currentPackage: ShopifyCurrentPackage | null;
};

export type ShopifySyncMode = "full" | "incremental" | "specific_product" | "retry_failed";

export type ShopifySyncRun = {
  id: string;
  mode: ShopifySyncMode | "webhook";
  runCount: number;
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
  errors: ShopifySyncError[];
};

export type ShopifySyncError = {
  code: string;
  message: string | null;
  shopifyProductId: number | null;
  createdAt: string;
};

export type ShopifyProductCandidate = {
  id: string;
  sku: string | null;
  name: string;
};

export type ShopifyApprovalMaterialKind = "ingredient" | "packing";

export type ShopifyApprovalMaterialOption = {
  id: string;
  sku: string | null;
  name: string;
};

export type ShopifyApprovalMaterialInput = {
  ingredientId: string;
  kind: ShopifyApprovalMaterialKind;
  quantity: number;
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
  const matchedProductIds = Array.from(new Set(
    [...variants, ...itemRows]
      .map((row) => row.matched_product_id ? String(row.matched_product_id) : null)
      .filter((value): value is string => Boolean(value)),
  ));
  const { data: currentProductRows, error: currentProductsError } = matchedProductIds.length
    ? await supabase.from("products")
      .select("id,sku,name,description,image_url,price,is_active,status,updated_at")
      .in("id", matchedProductIds)
    : { data: [], error: null };
  if (currentProductsError) throw currentProductsError;
  const currentProducts = new Map<string, ShopifyCurrentProduct>(
    (currentProductRows ?? []).map((row) => [String(row.id), {
      id: String(row.id),
      sku: row.sku ? String(row.sku) : null,
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      imageUrl: row.image_url ? String(row.image_url) : null,
      price: row.price === null ? null : numberValue(row.price),
      isActive: Boolean(row.is_active),
      status: row.status ? String(row.status) : null,
      updatedAt: String(row.updated_at),
    }]),
  );
  let currentPackage: ShopifyCurrentPackage | null = null;
  if (data.catalog_type === "fixed_package" || data.catalog_type === "configurable_package") {
    const { data: mapping, error: mappingError } = await supabase.from("shopify_catalog_mappings")
      .select("internal_package_id")
      .eq("store_id", data.store_id)
      .eq("resource_type", "package")
      .eq("shopify_product_id", data.shopify_product_id)
      .eq("is_active", true)
      .maybeSingle();
    if (mappingError) throw mappingError;
    if (mapping?.internal_package_id) {
      const packageId = String(mapping.internal_package_id);
      const [{ data: packageRow, error: packageError }, { data: packageItemRows, error: packageItemsError }] = await Promise.all([
        supabase.from("packages").select("id,sku,name,description,price,is_active,status,updated_at").eq("id", packageId).maybeSingle(),
        supabase.from("package_products").select("id,product_id,quantity,addon_price,is_selected").eq("package_id", packageId),
      ]);
      if (packageError) throw packageError;
      if (packageItemsError) throw packageItemsError;
      if (packageRow) {
        currentPackage = {
          id: String(packageRow.id),
          sku: packageRow.sku ? String(packageRow.sku) : null,
          name: String(packageRow.name),
          description: packageRow.description ? String(packageRow.description) : null,
          price: packageRow.price === null ? null : numberValue(packageRow.price),
          isActive: Boolean(packageRow.is_active),
          status: packageRow.status ? String(packageRow.status) : null,
          updatedAt: String(packageRow.updated_at),
          items: (packageItemRows ?? []).map((row) => ({
            id: String(row.id),
            productId: String(row.product_id),
            quantity: numberValue(row.quantity),
            addonPrice: numberValue(row.addon_price),
            isSelected: Boolean(row.is_selected),
          })),
        };
      }
    }
  }
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
    isDefault: Boolean(row.is_default),
    currentProduct: row.matched_product_id ? currentProducts.get(String(row.matched_product_id)) ?? null : null,
    currentPackageItem: row.matched_product_id
      ? currentPackage?.items.find((item) => item.productId === String(row.matched_product_id)) ?? null
      : null,
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
      currentProduct: row.matched_product_id ? currentProducts.get(String(row.matched_product_id)) ?? null : null,
    })),
    choiceSets,
    fixedItems: items.filter((item) => !item.choiceSetId),
    currentPackage,
  };
}

const SPECIFIC_SYNC_BATCH_GAP_MS = 5 * 60 * 1000;

function mergedRunStatus(left: string, right: string): string {
  const statuses = [left, right];
  if (statuses.includes("running")) return "running";
  if (statuses.includes("queued")) return "queued";
  if (statuses.every((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "failed" || status === "completed_with_errors")) return "completed_with_errors";
  return "completed";
}

export function aggregateShopifySyncRuns(runs: ShopifySyncRun[]): ShopifySyncRun[] {
  const ordered = [...runs].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const batches: ShopifySyncRun[] = [];
  const latestSpecificBatchByStore = new Map<string, ShopifySyncRun>();

  for (const run of ordered) {
    if (run.mode !== "specific_product") {
      batches.push(run);
      continue;
    }
    const storeKey = run.storeDomain ?? "__all_stores__";
    const previous = latestSpecificBatchByStore.get(storeKey);
    const previousEnd = previous?.finishedAt ?? previous?.createdAt;
    const withinBatch = previous
      && Date.parse(run.createdAt) - Date.parse(previousEnd ?? run.createdAt) <= SPECIFIC_SYNC_BATCH_GAP_MS;
    if (!withinBatch || !previous) {
      const batch = { ...run, errors: [...run.errors] };
      batches.push(batch);
      latestSpecificBatchByStore.set(storeKey, batch);
      continue;
    }

    previous.runCount += run.runCount;
    previous.totalFetched += run.totalFetched;
    previous.products += run.products;
    previous.packages += run.packages;
    previous.pending += run.pending;
    previous.conflicts += run.conflicts;
    previous.failed += run.failed;
    previous.errors.push(...run.errors);
    previous.status = mergedRunStatus(previous.status, run.status);
    previous.finishedAt = run.finishedAt;
  }

  return batches.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function fetchShopifySyncRuns(limit = 10): Promise<ShopifySyncRun[]> {
  const rawLimit = Math.min(1000, Math.max(200, limit * 20));
  const { data, error } = await supabase
    .from("shopify_catalog_sync_runs")
    .select("*,shopify_stores(shop_domain),shopify_catalog_sync_errors(code,message,shopify_product_id,created_at)")
    .order("created_at", { ascending: false })
    .limit(rawLimit);
  if (error) throw error;
  const runs = (data ?? []).map((row): ShopifySyncRun => {
    const errors = (row.shopify_catalog_sync_errors ?? []) as Array<Record<string, unknown>>;
    return {
      id: row.id as string,
      mode: row.mode as ShopifySyncRun["mode"],
      runCount: 1,
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
      errors: errors.map((item) => ({
        code: String(item.code),
        message: item.message ? String(item.message) : null,
        shopifyProductId: item.shopify_product_id === null ? null : numberValue(item.shopify_product_id),
        createdAt: String(item.created_at),
      })),
    };
  });
  return aggregateShopifySyncRuns(runs).slice(0, limit);
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

export async function approveShopifyCatalogDraft(
  id: string,
  expectedUpdatedAt: string,
  note: string,
  materials: ShopifyApprovalMaterialInput[] = [],
) {
  const { data, error } = await supabase.rpc("approve_shopify_pending_catalog_item_with_materials", {
    p_draft_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_review_note: note.trim() || null,
    p_materials: materials.map((material) => ({
      ingredientId: material.ingredientId,
      kind: material.kind,
      quantity: material.quantity,
    })),
  });
  if (error) throw error;
  return data as { status: string; packageId?: string; productIdsCreated?: number };
}

export async function fetchShopifyApprovalMaterialOptions(
  kind: ShopifyApprovalMaterialKind,
): Promise<ShopifyApprovalMaterialOption[]> {
  let query = supabase
    .from("ingredients")
    .select("id,sku,name")
    .is("archived_at", null)
    .eq("is_active", true);
  query = kind === "packing"
    ? query.eq("ingredient_type", "包裝用品")
    : query.or("ingredient_type.is.null,ingredient_type.neq.包裝用品");
  const { data, error } = await query.order("name", { ascending: true }).limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    sku: row.sku ? String(row.sku) : null,
    name: String(row.name),
  }));
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
