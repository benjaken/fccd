import { supabase } from "@/lib/supabase";

export const PRODUCTS_PAGE_SIZE = 15;

export type ProductPreset = "all" | "catering" | "lunchbox" | "ala-carte";

export type ProductListItem = {
  id: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
  price: number | null;
  status: string | null;
  isActive: boolean;
  channelId: string | null;
  channelName: string | null;
  productTypeId: string | null;
  productTypeName: string | null;
  updatedAt: string;
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
  productTypeId: string;
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
};

export type RelatedPackageSummary = {
  id: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
};

export type ProductDetail = {
  id: string;
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
  cookTypeName: string | null;
  bentoMainTypeName: string | null;
  bentoColumnTypeName: string | null;
  collections: string[];
  packages: RelatedPackageSummary[];
  updatedAt: string;
};

type RelatedRecord = { id: string; name: string };

type ProductListRow = {
  id: string;
  sku: string | null;
  name: string;
  chinese_name: string | null;
  price: number | string | null;
  status: string | null;
  is_active: boolean;
  updated_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
  product_types: RelatedRecord | RelatedRecord[] | null;
};

type ProductDetailRow = {
  id: string;
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
  cook_types: { name: string } | { name: string }[] | null;
  bento_main_types: { name: string } | { name: string }[] | null;
  bento_column_types: { name: string } | { name: string }[] | null;
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

export async function fetchProductTypes(): Promise<CatalogOption[]> {
  const { data, error } = await supabase
    .from("product_types")
    .select("id,name")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export async function fetchProducts({
  page,
  search,
  channelId,
  productTypeId,
  status,
  priceRange,
  preset = "all",
}: ProductListFilters): Promise<ProductListResult> {
  const start = (page - 1) * PRODUCTS_PAGE_SIZE;
  const end = start + PRODUCTS_PAGE_SIZE - 1;

  let query = supabase
    .from("products")
    .select(
      "id,sku,name,chinese_name,price,status,is_active,updated_at,channels(id,name),product_types(id,name)",
      { count: "exact" },
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
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

  if (productTypeId) {
    query = query.eq("product_type_id", productTypeId);
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

  return {
    items: ((data ?? []) as ProductListRow[]).map((row) => {
      const channel = relatedRecord(row.channels);
      const productType = relatedRecord(row.product_types);
      return {
        id: row.id,
        sku: row.sku,
        name: row.name,
        chineseName: row.chinese_name,
        price: toNumber(row.price),
        status: row.status,
        isActive: row.is_active,
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
        productTypeId: productType?.id ?? null,
        productTypeName: productType?.name ?? null,
        updatedAt: row.updated_at,
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
      "id,sku,name,chinese_name,description,image_url,price,price_min,price_max,status,is_active,is_bento_recommended,updated_at,channels(id,name),product_types(id,name),cook_types(name),bento_main_types(name),bento_column_types(name)",
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ProductDetailRow;
  const [{ data: collectionRows, error: collectionError }, { data: packageRows, error: packageError }] =
    await Promise.all([
      supabase
        .from("product_collection_links")
        .select("product_collections(name)")
        .eq("product_id", id),
      supabase
        .from("package_products")
        .select("packages(id,sku,name,chinese_name,archived_at)")
        .eq("product_id", id),
    ]);

  if (collectionError) throw collectionError;
  if (packageError) throw packageError;

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

  return {
    id: row.id,
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
    cookTypeName: relatedName(row.cook_types),
    bentoMainTypeName: relatedName(row.bento_main_types),
    bentoColumnTypeName: relatedName(row.bento_column_types),
    collections,
    packages,
    updatedAt: row.updated_at,
  };
}
