import { supabase } from "@/lib/supabase";

export const PRODUCTS_PAGE_SIZE = 15;

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

export type ProductListFilters = {
  page: number;
  search: string;
  channelId: string;
  productTypeName: string;
  status: ProductStatusFilter;
  priceRange: ProductPriceRange;
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
  legacyId?: string;
};

export type ProductEditOptions = {
  channels: CatalogOption[];
  productTypes: CatalogOption[];
  cookTypes: CatalogOption[];
  bentoMainTypes: CatalogOption[];
  bentoColumnTypes: CatalogOption[];
  mainIngredients: CatalogOption[];
  specialRequests: CatalogOption[];
};

export type ProductUpdateInput = {
  name: string;
  chineseName: string;
  sku: string;
  description: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  status: string;
  isActive: boolean;
  isBentoRecommended: boolean;
  channelId: string | null;
  productTypeId: string | null;
  cookTypeId: string | null;
  bentoMainTypeId: string | null;
  bentoColumnTypeId: string | null;
  mainIngredientIds: string[];
  specialRequestIds: string[];
};

export function canEditProductCatalog(role: string | null | undefined) {
  return role === "Super Admin" || role === "Admin";
}

export function showsBentoListColumns(preset: ProductPreset) {
  return preset === "lunchbox" || preset === "ala-carte";
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
  collections: string[];
  mainIngredients: ProductTag[];
  specialRequests: ProductTag[];
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
    // Bubble Created Date (fallback to DB created_at).
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

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
        sku: row.sku,
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
    { data: ingredientRows, error: ingredientError },
    { data: requestRows, error: requestError },
  ] = await Promise.all([
    supabase
      .from("product_collection_links")
      .select("product_collections(name)")
      .eq("product_id", id),
    supabase
      .from("package_products")
      .select("packages(id,sku,name,chinese_name,archived_at)")
      .eq("product_id", id),
    supabase
      .from("product_main_ingredient_links")
      .select("bento_main_ingredients(id,name,legacy_id)")
      .eq("product_id", id),
    supabase
      .from("product_special_request_links")
      .select("bento_special_requests(id,name,legacy_id)")
      .eq("product_id", id),
  ]);

  if (collectionError) throw collectionError;
  if (packageError) throw packageError;
  if (ingredientError) throw ingredientError;
  if (requestError) throw requestError;

  const collections = (collectionRows ?? [])
    .map((link) => {
      const related = link.product_collections as
        | { name: string }
        | { name: string }[]
        | null;
      return relatedName(related);
    })
    .filter((name): name is string => Boolean(name));

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

  const toTags = (
    links:
      | Array<{
          bento_main_ingredients?: RelatedRecord | RelatedRecord[] | null;
          bento_special_requests?: RelatedRecord | RelatedRecord[] | null;
        }>
      | null,
    key: "bento_main_ingredients" | "bento_special_requests",
  ): ProductTag[] =>
    (links ?? [])
      .map((link) => relatedRecord(link[key]))
      .filter((item): item is RelatedRecord => Boolean(item?.name))
      .map((item) => ({
        id: item.id,
        name: item.name,
        legacyId: item.legacy_id ?? "",
      }));

  return {
    id: row.id,
    legacyId: row.legacy_id,
    sku: row.sku,
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
    mainIngredients: toTags(ingredientRows, "bento_main_ingredients"),
    specialRequests: toTags(requestRows, "bento_special_requests"),
    packages,
    updatedAt: row.updated_at,
  };
}

export async function fetchProductEditOptions(
  channelId = "",
): Promise<ProductEditOptions> {
  const [channels, productTypes, cookTypes, bentoMainTypes, bentoColumnTypes, mainIngredients, specialRequests] =
    await Promise.all([
      fetchProductChannels(),
      fetchProductTypeRecords(channelId),
      fetchNamedLookup("cook_types"),
      fetchNamedLookup("bento_main_types"),
      fetchNamedLookup("bento_column_types"),
      fetchNamedLookup("bento_main_ingredients"),
      fetchNamedLookup("bento_special_requests"),
    ]);

  return {
    channels,
    productTypes,
    cookTypes,
    bentoMainTypes,
    bentoColumnTypes,
    mainIngredients,
    specialRequests,
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
  table: "product_main_ingredient_links" | "product_special_request_links";
  productId: string;
  productLegacyId: string;
  selected: CatalogOption[];
  relatedIdColumn: "main_ingredient_id" | "special_request_id";
  relatedLegacyColumn: "main_ingredient_legacy_id" | "special_request_legacy_id";
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
      price_min: input.priceMin,
      price_max: input.priceMax,
      status: emptyToNull(input.status),
      is_active: input.isActive,
      is_bento_recommended: input.isBentoRecommended,
      channel_id: input.channelId,
      product_type_id: input.productTypeId,
      cook_type_id: input.cookTypeId,
      bento_main_type_id: input.bentoMainTypeId,
      bento_column_type_id: input.bentoColumnTypeId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw error;

  const [ingredientOptions, requestOptions] = await Promise.all([
    fetchNamedLookup("bento_main_ingredients"),
    fetchNamedLookup("bento_special_requests"),
  ]);
  const ingredientsById = new Map(ingredientOptions.map((item) => [item.id, item]));
  const requestsById = new Map(requestOptions.map((item) => [item.id, item]));

  await syncProductTagLinks({
    table: "product_main_ingredient_links",
    productId: id,
    productLegacyId: current.legacy_id as string,
    selected: input.mainIngredientIds
      .map((itemId) => ingredientsById.get(itemId))
      .filter((item): item is CatalogOption => Boolean(item)),
    relatedIdColumn: "main_ingredient_id",
    relatedLegacyColumn: "main_ingredient_legacy_id",
  });
  await syncProductTagLinks({
    table: "product_special_request_links",
    productId: id,
    productLegacyId: current.legacy_id as string,
    selected: input.specialRequestIds
      .map((itemId) => requestsById.get(itemId))
      .filter((item): item is CatalogOption => Boolean(item)),
    relatedIdColumn: "special_request_id",
    relatedLegacyColumn: "special_request_legacy_id",
  });
}
