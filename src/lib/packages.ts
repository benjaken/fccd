import { supabase } from "@/lib/supabase";

export const PACKAGES_PAGE_SIZE = 15;

export type PackageListItem = {
  id: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
  price: number | null;
  status: string | null;
  isActive: boolean;
  channelId: string | null;
  channelName: string | null;
  memberCount: number;
  updatedAt: string;
};

export type PackageListResult = {
  items: PackageListItem[];
  total: number;
};

export type PackageListFilters = {
  page: number;
  search: string;
  channelId: string;
  activeOnly: boolean;
};

export type PackageMember = {
  id: string;
  productId: string | null;
  quantity: number | null;
  addonPrice: number | null;
  isSelected: boolean | null;
  productSku: string | null;
  productName: string | null;
  productChineseName: string | null;
  productPrice: number | null;
};

export type PackageChoiceSet = {
  id: string;
  choiceType: string | null;
  maximumChoices: number | null;
};

export type PackageDetail = {
  id: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
  description: string | null;
  price: number | null;
  status: string | null;
  isActive: boolean;
  channelId: string | null;
  channelName: string | null;
  updatedAt: string;
  members: PackageMember[];
  choiceSets: PackageChoiceSet[];
};

type RelatedRecord = { id: string; name: string };

type PackageListRow = {
  id: string;
  sku: string | null;
  name: string;
  chinese_name: string | null;
  price: number | string | null;
  status: string | null;
  is_active: boolean;
  updated_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
  package_products: { id: string }[] | null;
};

type PackageDetailRow = {
  id: string;
  sku: string | null;
  name: string;
  chinese_name: string | null;
  description: string | null;
  price: number | string | null;
  status: string | null;
  is_active: boolean;
  updated_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
};

type PackageMemberRow = {
  id: string;
  product_id: string | null;
  quantity: number | string | null;
  addon_price: number | string | null;
  is_selected: boolean | null;
  products:
    | {
        id: string;
        sku: string | null;
        name: string;
        chinese_name: string | null;
        price: number | string | null;
      }
    | {
        id: string;
        sku: string | null;
        name: string;
        chinese_name: string | null;
        price: number | string | null;
      }[]
    | null;
};

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-_.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function relatedProduct(value: PackageMemberRow["products"]) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchPackages({
  page,
  search,
  channelId,
  activeOnly,
}: PackageListFilters): Promise<PackageListResult> {
  const start = (page - 1) * PACKAGES_PAGE_SIZE;
  const end = start + PACKAGES_PAGE_SIZE - 1;

  let query = supabase
    .from("packages")
    .select(
      "id,sku,name,chinese_name,price,status,is_active,updated_at,channels(id,name),package_products(id)",
      { count: "exact" },
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .range(start, end);

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  if (channelId) {
    query = query.eq("channel_id", channelId);
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
    items: ((data ?? []) as PackageListRow[]).map((row) => {
      const channel = relatedRecord(row.channels);
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
        memberCount: row.package_products?.length ?? 0,
        updatedAt: row.updated_at,
      };
    }),
    total: count ?? 0,
  };
}

export async function fetchPackageDetail(
  id: string,
): Promise<PackageDetail | null> {
  const { data, error } = await supabase
    .from("packages")
    .select(
      "id,sku,name,chinese_name,description,price,status,is_active,updated_at,channels(id,name)",
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as PackageDetailRow;
  const channel = relatedRecord(row.channels);

  const [{ data: memberRows, error: memberError }, { data: choiceRows, error: choiceError }] =
    await Promise.all([
      supabase
        .from("package_products")
        .select(
          "id,product_id,quantity,addon_price,is_selected,products(id,sku,name,chinese_name,price)",
        )
        .eq("package_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("package_choice_sets")
        .select("id,choice_type,maximum_choices")
        .eq("package_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (memberError) throw memberError;
  if (choiceError) throw choiceError;

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    chineseName: row.chinese_name,
    description: row.description,
    price: toNumber(row.price),
    status: row.status,
    isActive: row.is_active,
    channelId: channel?.id ?? null,
    channelName: channel?.name ?? null,
    updatedAt: row.updated_at,
    members: ((memberRows ?? []) as PackageMemberRow[]).map((member) => {
      const product = relatedProduct(member.products);
      return {
        id: member.id,
        productId: member.product_id ?? product?.id ?? null,
        quantity: toNumber(member.quantity),
        addonPrice: toNumber(member.addon_price),
        isSelected: member.is_selected,
        productSku: product?.sku ?? null,
        productName: product?.name ?? null,
        productChineseName: product?.chinese_name ?? null,
        productPrice: toNumber(product?.price),
      };
    }),
    choiceSets: (choiceRows ?? []).map((choice) => ({
      id: choice.id as string,
      choiceType: (choice.choice_type as string | null) ?? null,
      maximumChoices: toNumber(choice.maximum_choices as number | string | null),
    })),
  };
}
