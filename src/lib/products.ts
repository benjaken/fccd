import { supabase } from "@/lib/supabase";

export const PRODUCTS_PAGE_SIZE = 15;

export function normalizeProductSku(sku: string | null | undefined) {
  const trimmed = sku?.trim() ?? "";
  return trimmed || null;
}

export function hasProductSku(sku: string | null | undefined) {
  return Boolean(normalizeProductSku(sku));
}

export type ProductPreset = "all" | "catering" | "lunchbox" | "ala-carte";

export type ProductTag = {
  id: string;
  name: string;
  legacyId: string;
};

export type ProductListItem = {
  id: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  status: string | null;
  isActive: boolean;
  isBentoRecommended: boolean;
  channelId: string | null;
  channelName: string | null;
  productTypeId: string | null;
  productTypeName: string | null;
  cookTypeName: string | null;
  bentoMainTypeName: string | null;
  bentoColumnTypeName: string | null;
  mainIngredients: string[];
  specialRequests: string[];
  createdAt: string;
};

export type ProductListResult = {
  items: ProductListItem[];
  total: number;
};

export type ProductPriceRange =
  | ""
  | "under-100"
  | "100-299"
  | "300-799"
  | "800-1999"
  | "2000-plus";

export type ProductStatusFilter = "" | "Active" | "Inactive" | "unset";
export type ProductSortField = "sku" | "name" | "price";

export type ProductListFilters = {
  page: number;
  search: string;
  channelId: string;
  productTypeName: string;
  status: ProductStatusFilter;
  priceRange: ProductPriceRange;
  sortField?: ProductSortField;
  sortAscending?: boolean;
  preset?: ProductPreset;
};

export const PRODUCT_PRICE_RANGES: Array<{
  value: Exclude<ProductPriceRange, "">;
  min: number;
  max: number | null;
}> = [
  { value: "under-100", min: 0, max: 100 },
  { value: "100-299", min: 100, max: 300 },
  { value: "300-799", min: 300, max: 800 },
  { value: "800-1999", min: 800, max: 2000 },
  { value: "2000-plus", min: 2000, max: null },
];

export type CatalogOption = {
  id: string;
  name: string;
  sku?: string | null;
  legacyId?: string;
};

export type ProductEditOptions = {
  channels: CatalogOption[];
  productTypes: CatalogOption[];
  cookTypes: CatalogOption[];
  collections: CatalogOption[];
  packingMaterials: CatalogOption[];
  catalogIngredients: CatalogOption[];
};

export type ProductUpdateInput = {
  name: string;
  chineseName: string;
  sku: string;
  description: string;
  price: number | null;
  status: string;
  isActive: boolean;
  isBentoRecommended: boolean;
  channelId: string | null;
  productTypeId: string | null;
  cookTypeId: string | null;
  collectionIds: string[];
};

export type ProductPremiumIngredient = {
  id: string;
  ingredientId: string;
  name: string;
  quantity: number | null;
  unitCost: number | null;
};

export type ProductLabelRow = {
  id: string;
  displayA: string | null;
  displayB: string | null;
  packingMaterialId: string | null;
  packingName: string | null;
};

export function productIngredientCost(items: ProductPremiumIngredient[]) {
  return items.reduce(
    (total, item) => total + (item.quantity ?? 0) * (item.unitCost ?? 0),
    0,
  );
}

export function canEditProductCatalog(role: string | null | undefined) {
  return role === "Super Admin" || role === "Admin";
}

export type RelatedPackageSummary = {
  id: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
};

export type ProductDetail = {
  id: string;
  legacyId: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  status: string | null;
  isActive: boolean;
  isBentoRecommended: boolean;
  channelId: string | null;
  channelName: string | null;
  productTypeId: string | null;
  productTypeName: string | null;
  cookTypeId: string | null;
  cookTypeName: string | null;
  bentoMainTypeId: string | null;
  bentoMainTypeName: string | null;
  bentoColumnTypeId: string | null;
  bentoColumnTypeName: string | null;
  collections: ProductTag[];
  premiumIngredients: ProductPremiumIngredient[];
  labels: ProductLabelRow[];
  packages: RelatedPackageSummary[];
  updatedAt: string;
};

type RelatedRecord = { id: string; name: string; legacy_id?: string };

type NamedLookup = { id: string; name: string } | { id: string; name: string }[] | null;

type ProductListRow = {
  id: string;
  sku: string | null;
  name: string;
  chinese_name: string | null;
  price: number | string | null;
  price_min: number | string | null;
  price_max: number | string | null;
  status: string | null;
  is_active: boolean;
  is_bento_recommended: boolean;
  bubble_created_at: string | null;
  created_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
  product_types: RelatedRecord | RelatedRecord[] | null;
  cook_types: NamedLookup;
  bento_main_types: NamedLookup;
  bento_column_types: NamedLookup;
};

type ProductDetailRow = {
  id: string;
  legacy_id: string;
  sku: string | null;
  name: string;
  chinese_name: string | null;
  description: string | null;
  image_url: string | null;
  price: number | string | null;
  price_min: number | string | null;
  price_max: number | string | null;
  status: string | null;
  is_active: boolean;
  is_bento_recommended: boolean;
  updated_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
  product_types: RelatedRecord | RelatedRecord[] | null;
  cook_types: RelatedRecord | RelatedRecord[] | null;
  bento_main_types: RelatedRecord | RelatedRecord[] | null;
  bento_column_types: RelatedRecord | RelatedRecord[] | null;
};

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-_.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relatedName(
  value: { name: string } | { name: string }[] | null | undefined,
) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name ?? null;
}

function relatedRecord(
  value: RelatedRecord | RelatedRecord[] | null | undefined,
): RelatedRecord | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function createLegacyId() {
  return `fccd-${crypto.randomUUID()}`;
}

async function fetchNamedLookup(table: string): Promise<CatalogOption[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id,name,legacy_id")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    legacyId: (row.legacy_id as string | null) ?? undefined,
  }));
}

function mapTagLinks(
  rows:
    | Array<{
        product_id?: string;
        bento_main_ingredients?: RelatedRecord | RelatedRecord[] | null;
        bento_special_requests?: RelatedRecord | RelatedRecord[] | null;
      }>
    | null
    | undefined,
  key: "bento_main_ingredients" | "bento_special_requests",
): Map<string, ProductTag[]> {
  const grouped = new Map<string, ProductTag[]>();
  for (const row of rows ?? []) {
    const productId = row.product_id;
    if (!productId) continue;
    const related = relatedRecord(row[key]);
    if (!related?.name) continue;
    const list = grouped.get(productId) ?? [];
    list.push({
      id: related.id,
      name: related.name,
      legacyId: related.legacy_id ?? "",
    });
    grouped.set(productId, list);
  }
  return grouped;
}

const PRESET_CHANNEL_NAMES: Record<
  Exclude<ProductPreset, "all">,
  string[]
> = {
  catering: ["Catering", "Cuisine"],
  lunchbox: ["HK lunch box"],
  "ala-carte": ["Express", "Kitchen", "HK Party Food"],
};

async function channelIdsForNames(names: string[]) {
  const { data, error } = await supabase
    .from("channels")
    .select("id,name")
    .in("name", names);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function fetchProductChannels(): Promise<CatalogOption[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,name")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export async function fetchProductTypes(
  channelId = "",
): Promise<CatalogOption[]> {
  let query = supabase
    .from("product_types")
    .select("id,name")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (channelId) {
    query = query.eq("channel_id", channelId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const unique = new Map<string, string>();
  for (const row of data ?? []) {
    const name = String(row.name ?? "").trim();
    if (!name || unique.has(name)) continue;
    unique.set(name, name);
  }

  return [...unique.values()]
    .sort((left, right) => left.localeCompare(right, "zh-HK"))
    .map((name) => ({ id: name, name }));
}

async function productTypeIdsForName(name: string, channelId = "") {
  const key = name.trim();
  if (!key) return [] as string[];

  let query = supabase.from("product_types").select("id,name");
  if (channelId) {
    query = query.eq("channel_id", channelId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .filter((row) => String(row.name ?? "").trim() === key)
    .map((row) => row.id as string);
}

export async function fetchProducts({
  page,
  search,
  channelId,
  productTypeName,
  status,
  priceRange,
  sortField = "sku",
  sortAscending = true,
  preset = "all",
}: ProductListFilters): Promise<ProductListResult> {
  const start = (page - 1) * PRODUCTS_PAGE_SIZE;
  const end = start + PRODUCTS_PAGE_SIZE - 1;

  let query = supabase
    .from("products")
    .select(
      "id,sku,name,chinese_name,price,price_min,price_max,status,is_active,is_bento_recommended,bubble_created_at,created_at,channels(id,name),product_types(id,name),cook_types(name),bento_main_types(name),bento_column_types(name)",
      { count: "exact" },
    )
    .is("archived_at", null)
    // Temporarily hide Bubble rows that never received a SKU so the catalog
    // matches the old product list instead of the 7k+ incomplete records.
    .not("sku", "is", null)
    .neq("sku", "");

  if (sortField === "name") {
    query = query
      .order("chinese_name", {
        ascending: sortAscending,
        nullsFirst: false,
      })
      .order("name", { ascending: sortAscending, nullsFirst: false });
  } else {
    query = query.order(sortField === "price" ? "price" : "sku", {
      ascending: sortAscending,
      nullsFirst: false,
    });
  }

  query = query.range(start, end);

  if (status === "unset") {
    query = query.or("status.is.null,status.eq.");
  } else if (status) {
    query = query.eq("status", status);
  }

  const range = PRODUCT_PRICE_RANGES.find((item) => item.value === priceRange);
  if (range) {
    query = query.gte("price", range.min);
    if (range.max !== null) {
      query = query.lt("price", range.max);
    }
  }

  if (productTypeName) {
    const typeIds = await productTypeIdsForName(productTypeName, channelId);
    if (typeIds.length === 0) {
      return { items: [], total: 0 };
    }
    query = query.in("product_type_id", typeIds);
  }

  if (channelId) {
    query = query.eq("channel_id", channelId);
  } else if (preset !== "all") {
    const ids = await channelIdsForNames(PRESET_CHANNEL_NAMES[preset]);
    if (ids.length === 0) {
      return { items: [], total: 0 };
    }
    if (preset === "lunchbox") {
      query = query.or(
        `channel_id.in.(${ids.join(",")}),bento_main_type_id.not.is.null`,
      );
    } else {
      query = query.in("channel_id", ids);
    }
  }

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `sku.ilike.%${term}%,name.ilike.%${term}%,chinese_name.ilike.%${term}%`,
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ProductListRow[];
  const productIds = rows.map((row) => row.id);
  const [ingredientRows, requestRows] =
    productIds.length === 0
      ? [null, null]
      : await Promise.all([
          supabase
            .from("product_main_ingredient_links")
            .select("product_id,bento_main_ingredients(id,name,legacy_id)")
            .in("product_id", productIds)
            .then(({ data: links, error: linksError }) => {
              if (linksError) throw linksError;
              return links;
            }),
          supabase
            .from("product_special_request_links")
            .select("product_id,bento_special_requests(id,name,legacy_id)")
            .in("product_id", productIds)
            .then(({ data: links, error: linksError }) => {
              if (linksError) throw linksError;
              return links;
            }),
        ]);

  const ingredientsByProduct = mapTagLinks(ingredientRows, "bento_main_ingredients");
  const requestsByProduct = mapTagLinks(requestRows, "bento_special_requests");

  return {
    items: rows.map((row) => {
      const channel = relatedRecord(row.channels);
      const productType = relatedRecord(row.product_types);
      return {
        id: row.id,
        sku: normalizeProductSku(row.sku),
        name: row.name,
        chineseName: row.chinese_name,
        price: toNumber(row.price),
        priceMin: toNumber(row.price_min),
        priceMax: toNumber(row.price_max),
        status: row.status,
        isActive: row.is_active,
        isBentoRecommended: Boolean(row.is_bento_recommended),
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
        productTypeId: productType?.id ?? null,
        productTypeName: productType?.name ?? null,
        cookTypeName: relatedName(row.cook_types),
        bentoMainTypeName: relatedName(row.bento_main_types),
        bentoColumnTypeName: relatedName(row.bento_column_types),
        mainIngredients:
          ingredientsByProduct.get(row.id)?.map((item) => item.name) ?? [],
        specialRequests:
          requestsByProduct.get(row.id)?.map((item) => item.name) ?? [],
        createdAt: row.bubble_created_at || row.created_at,
      };
    }),
    total: count ?? 0,
  };
}

export async function fetchProductDetail(
  id: string,
): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,legacy_id,sku,name,chinese_name,description,image_url,price,price_min,price_max,status,is_active,is_bento_recommended,updated_at,channels(id,name),product_types(id,name),cook_types(id,name),bento_main_types(id,name),bento_column_types(id,name)",
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ProductDetailRow;
  const [
    { data: collectionRows, error: collectionError },
    { data: packageRows, error: packageError },
    { data: premiumRows, error: premiumError },
    { data: labelRows, error: labelError },
  ] = await Promise.all([
    supabase
      .from("product_collection_links")
      .select("product_collections(id,name,legacy_id)")
      .eq("product_id", id),
    supabase
      .from("package_products")
      .select("packages(id,sku,name,chinese_name,archived_at)")
      .eq("product_id", id),
    supabase
      .from("product_ingredients")
      .select("id,quantity,ingredients(id,name,cost_per_product_unit)")
      .eq("product_id", id)
      .is("package_id", null),
    supabase
      .from("product_labels")
      .select("id,display_name,quantity_label,packing_materials(id,name)")
      .eq("product_id", id),
  ]);

  if (collectionError) throw collectionError;
  if (packageError) throw packageError;

  type IngredientEmbed = {
    id: string;
    name: string;
    cost_per_product_unit?: number | string | null;
  };

  const premiumIngredients = premiumError
    ? []
    : (premiumRows ?? [])
        .map((row) => {
          const raw = row.ingredients as IngredientEmbed | IngredientEmbed[] | null;
          const ingredient = Array.isArray(raw) ? raw[0] : raw;
          if (!ingredient?.name) return null;
          return {
            id: row.id as string,
            ingredientId: ingredient.id,
            name: ingredient.name,
            quantity: toNumber(row.quantity as number | string | null),
            unitCost: toNumber(ingredient.cost_per_product_unit),
          } satisfies ProductPremiumIngredient;
        })
        .filter((item): item is ProductPremiumIngredient => Boolean(item));

  const labels = labelError
    ? []
    : (labelRows ?? []).map((row) => {
        const packing = relatedRecord(
          row.packing_materials as RelatedRecord | RelatedRecord[] | null,
        );
        return {
          id: row.id as string,
          displayA: (row.display_name as string | null) ?? null,
          displayB: (row.quantity_label as string | null) ?? null,
          packingMaterialId: packing?.id ?? null,
          packingName: packing?.name ?? null,
        } satisfies ProductLabelRow;
      });

  const collections = (collectionRows ?? [])
    .map((link) => relatedRecord(link.product_collections as RelatedRecord | RelatedRecord[] | null))
    .filter((item): item is RelatedRecord => Boolean(item?.name))
    .map((item) => ({
      id: item.id,
      name: item.name,
      legacyId: item.legacy_id ?? "",
    }));

  const packages = (packageRows ?? [])
    .map((link) => {
      const related = link.packages as
        | {
            id: string;
            sku: string | null;
            name: string;
            chinese_name: string | null;
            archived_at: string | null;
          }
        | {
            id: string;
            sku: string | null;
            name: string;
            chinese_name: string | null;
            archived_at: string | null;
          }[]
        | null;
      const pkg = Array.isArray(related) ? related[0] : related;
      if (!pkg || pkg.archived_at) return null;
      return {
        id: pkg.id,
        sku: pkg.sku,
        name: pkg.name,
        chineseName: pkg.chinese_name,
      } satisfies RelatedPackageSummary;
    })
    .filter((item): item is RelatedPackageSummary => Boolean(item));

  const channel = relatedRecord(row.channels);
  const productType = relatedRecord(row.product_types);
  const cookType = relatedRecord(row.cook_types);
  const bentoMainType = relatedRecord(row.bento_main_types);
  const bentoColumnType = relatedRecord(row.bento_column_types);

  return {
    id: row.id,
    legacyId: row.legacy_id,
    sku: normalizeProductSku(row.sku),
    name: row.name,
    chineseName: row.chinese_name,
    description: row.description,
    imageUrl: row.image_url,
    price: toNumber(row.price),
    priceMin: toNumber(row.price_min),
    priceMax: toNumber(row.price_max),
    status: row.status,
    isActive: row.is_active,
    isBentoRecommended: row.is_bento_recommended,
    channelId: channel?.id ?? null,
    channelName: channel?.name ?? null,
    productTypeId: productType?.id ?? null,
    productTypeName: productType?.name ?? null,
    cookTypeId: cookType?.id ?? null,
    cookTypeName: cookType?.name ?? null,
    bentoMainTypeId: bentoMainType?.id ?? null,
    bentoMainTypeName: bentoMainType?.name ?? null,
    bentoColumnTypeId: bentoColumnType?.id ?? null,
    bentoColumnTypeName: bentoColumnType?.name ?? null,
    collections,
    premiumIngredients,
    labels,
    packages,
    updatedAt: row.updated_at,
  };
}

export async function fetchProductEditOptions(
  channelId = "",
): Promise<ProductEditOptions> {
  const [channels, productTypes, cookTypes, collections, packingMaterials, catalogIngredients] =
    await Promise.all([
      fetchProductChannels(),
      fetchProductTypeRecords(channelId),
      fetchNamedLookup("cook_types"),
      fetchCollectionRecords(channelId),
      fetchNamedLookup("packing_materials"),
      fetchCatalogIngredients(),
    ]);

  return {
    channels,
    productTypes,
    cookTypes,
    collections,
    packingMaterials,
    catalogIngredients,
  };
}

async function fetchProductTypeRecords(
  channelId = "",
): Promise<CatalogOption[]> {
  let query = supabase
    .from("product_types")
    .select("id,name,legacy_id")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (channelId) {
    query = query.eq("channel_id", channelId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    legacyId: (row.legacy_id as string | null) ?? undefined,
  }));
}

async function fetchCollectionRecords(
  channelId = "",
): Promise<CatalogOption[]> {
  let query = supabase
    .from("product_collections")
    .select("id,name,legacy_id")
    .order("name", { ascending: true });
  if (channelId) {
    query = query.eq("channel_id", channelId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).flatMap((row) => {
    const name = row.name as string;
    if (seen.has(name)) return [];
    seen.add(name);
    return [
      {
        id: row.id as string,
        name,
        legacyId: (row.legacy_id as string | null) ?? undefined,
      },
    ];
  });
}

async function fetchCatalogIngredients(): Promise<CatalogOption[]> {
  const { data, error } = await supabase
    .from("ingredients")
    .select("id,name,sku,legacy_id")
    .is("archived_at", null)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(100);
  if (error) return [];
  return (data ?? []).map((row) => mapIngredientOption(row));
}

export async function searchCatalogProducts(
  term: string,
): Promise<CatalogOption[]> {
  const cleaned = safeSearchTerm(term);
  if (!cleaned) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id,name,chinese_name,sku,legacy_id")
    .is("archived_at", null)
    .eq("is_active", true)
    .not("sku", "is", null)
    .neq("sku", "")
    .or(
      `name.ilike.%${cleaned}%,chinese_name.ilike.%${cleaned}%,sku.ilike.%${cleaned}%`,
    )
    .order("name", { ascending: true })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: ((row.chinese_name as string | null) || (row.name as string)) as string,
    sku: normalizeProductSku(row.sku as string | null),
    legacyId: (row.legacy_id as string | null) ?? undefined,
  }));
}

export async function searchProductIngredients(
  term: string,
): Promise<CatalogOption[]> {
  const cleaned = safeSearchTerm(term);
  if (!cleaned) return [];

  const { data, error } = await supabase
    .from("ingredients")
    .select("id,name,sku,legacy_id")
    .is("archived_at", null)
    .eq("is_active", true)
    .or(`name.ilike.%${cleaned}%,sku.ilike.%${cleaned}%`)
    .order("name", { ascending: true })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((row) => mapIngredientOption(row));
}

function mapIngredientOption(row: {
  id: unknown;
  name: unknown;
  sku?: unknown;
  legacy_id?: unknown;
}): CatalogOption {
  return {
    id: row.id as string,
    name: row.name as string,
    sku: (row.sku as string | null | undefined) ?? null,
    legacyId: (row.legacy_id as string | null | undefined) ?? undefined,
  };
}
export async function updateProductRecommendation(
  id: string,
  isBentoRecommended: boolean,
) {
  const { error } = await supabase
    .from("products")
    .update({
      is_bento_recommended: isBentoRecommended,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);

  if (error) throw error;
}

async function syncProductTagLinks({
  table,
  productId,
  productLegacyId,
  selected,
  relatedIdColumn,
  relatedLegacyColumn,
}: {
  table: "product_collection_links";
  productId: string;
  productLegacyId: string;
  selected: CatalogOption[];
  relatedIdColumn: "collection_id";
  relatedLegacyColumn: "collection_legacy_id";
}) {
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select(`id,${relatedIdColumn}`)
    .eq("product_id", productId);
  if (existingError) throw existingError;

  const currentIds = new Set(
    (existing ?? [])
      .map((row) => {
        const record = row as Record<string, string | null>;
        return record[relatedIdColumn];
      })
      .filter((value): value is string => Boolean(value)),
  );
  const nextIds = new Set(selected.map((item) => item.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  const added = selected.filter((item) => !currentIds.has(item.id));

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("product_id", productId)
      .in(relatedIdColumn, removedIds);
    if (deleteError) throw deleteError;
  }

  if (added.length > 0) {
    const { error: insertError } = await supabase.from(table).insert(
      added.map((item) => ({
        product_id: productId,
        product_legacy_id: productLegacyId,
        [relatedIdColumn]: item.id,
        [relatedLegacyColumn]: item.legacyId || item.id,
      })),
    );
    if (insertError) throw insertError;
  }
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
) {
  const { data: current, error: currentError } = await supabase
    .from("products")
    .select("legacy_id")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) {
    const missing = new Error("product_not_found");
    (missing as { code?: string }).code = "product_not_found";
    throw missing;
  }

  const { error } = await supabase
    .from("products")
    .update({
      name: input.name.trim(),
      chinese_name: emptyToNull(input.chineseName),
      sku: emptyToNull(input.sku),
      description: emptyToNull(input.description),
      price: input.price,
      status: emptyToNull(input.status),
      is_active: input.isActive,
      is_bento_recommended: input.isBentoRecommended,
      channel_id: input.channelId,
      product_type_id: input.productTypeId,
      cook_type_id: input.cookTypeId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw error;

  const collections = await fetchCollectionRecords();
  const collectionsById = new Map(collections.map((item) => [item.id, item]));
  await syncProductTagLinks({
    table: "product_collection_links",
    productId: id,
    productLegacyId: current.legacy_id as string,
    selected: input.collectionIds
      .map((itemId) => collectionsById.get(itemId))
      .filter((item): item is CatalogOption => Boolean(item)),
    relatedIdColumn: "collection_id",
    relatedLegacyColumn: "collection_legacy_id",
  });
}

export async function addProductPremiumIngredient(
  productId: string,
  ingredientId: string,
  quantity: number,
) {
  const [{ data: product, error: productError }, { data: ingredient, error: ingredientError }] =
    await Promise.all([
      supabase
        .from("products")
        .select("legacy_id")
        .eq("id", productId)
        .maybeSingle(),
      supabase
        .from("ingredients")
        .select("legacy_id")
        .eq("id", ingredientId)
        .maybeSingle(),
    ]);
  if (productError) throw productError;
  if (ingredientError) throw ingredientError;
  if (!product || !ingredient) {
    const missing = new Error("product_not_found");
    (missing as { code?: string }).code = "product_not_found";
    throw missing;
  }

  const { error } = await supabase.from("product_ingredients").insert({
    legacy_id: createLegacyId(),
    product_id: productId,
    product_legacy_id: product.legacy_id,
    ingredient_id: ingredientId,
    ingredient_legacy_id: ingredient.legacy_id,
    quantity,
  });
  if (error) throw error;
}

export async function removeProductPremiumIngredient(id: string) {
  const { error } = await supabase.from("product_ingredients").delete().eq("id", id);
  if (error) throw error;
}

export async function addProductLabel(
  productId: string,
  input: {
    displayA: string;
    displayB: string;
    packingMaterialId: string | null;
  },
) {
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("legacy_id")
    .eq("id", productId)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) {
    const missing = new Error("product_not_found");
    (missing as { code?: string }).code = "product_not_found";
    throw missing;
  }

  let packingLegacyId: string | null = null;
  if (input.packingMaterialId) {
    const { data: packing, error: packingError } = await supabase
      .from("packing_materials")
      .select("legacy_id")
      .eq("id", input.packingMaterialId)
      .maybeSingle();
    if (packingError) throw packingError;
    packingLegacyId = (packing?.legacy_id as string | null) ?? null;
  }

  const { error } = await supabase.from("product_labels").insert({
    legacy_id: createLegacyId(),
    product_id: productId,
    product_legacy_id: product.legacy_id,
    display_name: emptyToNull(input.displayA),
    quantity_label: emptyToNull(input.displayB),
    packing_material_id: input.packingMaterialId,
    packing_material_legacy_id: packingLegacyId,
  });
  if (error) throw error;
}

export async function removeProductLabel(id: string) {
  const { error } = await supabase.from("product_labels").delete().eq("id", id);
  if (error) throw error;
}
