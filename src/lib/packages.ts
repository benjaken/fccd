import { supabase } from "@/lib/supabase";

export const PACKAGES_PAGE_SIZE = 15;

export type PackageSortField = "sku" | "createdAt" | "price";
export type PackageStatusFilter = "" | "Active" | "Inactive";

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
  choiceSetCount: number;
  createdAt: string;
};

export type PackageListResult = {
  items: PackageListItem[];
  total: number;
};

export type PackageListFilters = {
  page: number;
  search: string;
  channelId: string;
  status: PackageStatusFilter;
  sortField: PackageSortField;
  sortAscending: boolean;
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
  choiceSetLegacyId: string | null;
};

export type PackageChoiceSet = {
  id: string;
  legacyId: string;
  name: string | null;
  maximumChoices: number | null;
  products: PackageMember[];
};

export type PackageDetail = {
  id: string;
  legacyId: string;
  sku: string | null;
  name: string;
  chineseName: string | null;
  description: string | null;
  price: number | null;
  status: string | null;
  isActive: boolean;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
  updatedAt: string;
  choiceSets: PackageChoiceSet[];
  ungroupedProducts: PackageMember[];
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
  bubble_created_at: string | null;
  created_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
};

type PackageDetailRow = {
  id: string;
  legacy_id: string;
  sku: string | null;
  name: string;
  chinese_name: string | null;
  description: string | null;
  price: number | string | null;
  status: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  channels: RelatedRecord | RelatedRecord[] | null;
};

type PackageMemberRow = {
  id: string;
  product_id: string | null;
  quantity: number | string | null;
  addon_price: number | string | null;
  is_selected: boolean | null;
  package_choice_set_legacy_id: string | null;
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

const SORT_COLUMNS: Record<PackageSortField, string> = {
  sku: "sku",
  createdAt: "created_at",
  price: "price",
};

function createLegacyId() {
  return `fccd-${crypto.randomUUID()}`;
}

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

function mapMember(member: PackageMemberRow): PackageMember {
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
    choiceSetLegacyId: member.package_choice_set_legacy_id,
  };
}

async function fetchChoiceSetCounts(packageIds: string[]) {
  const counts = new Map<string, number>();
  if (packageIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("package_choice_sets")
    .select("package_id")
    .in("package_id", packageIds);
  if (error) return counts;
  for (const row of data ?? []) {
    const packageId = row.package_id as string | null;
    if (!packageId) continue;
    counts.set(packageId, (counts.get(packageId) ?? 0) + 1);
  }
  return counts;
}

export async function fetchPackages({
  page,
  search,
  channelId,
  status,
  sortField,
  sortAscending,
}: PackageListFilters): Promise<PackageListResult> {
  const start = (page - 1) * PACKAGES_PAGE_SIZE;
  const end = start + PACKAGES_PAGE_SIZE - 1;

  let query = supabase
    .from("packages")
    .select(
      "id,sku,name,chinese_name,price,status,is_active,bubble_created_at,created_at,channels(id,name)",
      { count: "exact" },
    )
    .is("archived_at", null)
    // Hide Bubble placeholder rows that never received a SKU so the package
    // list matches the old system's usable set instead of the empty records.
    .not("sku", "is", null)
    .neq("sku", "");

  if (sortField === "createdAt") {
    query = query
      .order("bubble_created_at", {
        ascending: sortAscending,
        nullsFirst: false,
      })
      .order("created_at", { ascending: sortAscending });
  } else {
    query = query.order(SORT_COLUMNS[sortField], {
      ascending: sortAscending,
      nullsFirst: false,
    });
  }

  query = query
    .range(start, end);

  if (status === "Active") {
    query = query.eq("is_active", true);
  } else if (status === "Inactive") {
    query = query.eq("is_active", false);
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

  const rows = (data ?? []) as PackageListRow[];
  const choiceSetCounts = await fetchChoiceSetCounts(rows.map((row) => row.id));

  return {
    items: rows.map((row) => {
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
        choiceSetCount: choiceSetCounts.get(row.id) ?? 0,
        createdAt: row.bubble_created_at || row.created_at,
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
      "id,legacy_id,sku,name,chinese_name,description,price,status,is_active,created_at,updated_at,channels(id,name)",
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
          "id,product_id,quantity,addon_price,is_selected,package_choice_set_legacy_id,products(id,sku,name,chinese_name,price)",
        )
        .eq("package_id", id)
        .order("bubble_created_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("package_choice_sets")
        .select("id,legacy_id,choice_type,maximum_choices")
        .eq("package_id", id)
        .order("bubble_created_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

  if (memberError) throw memberError;
  if (choiceError) throw choiceError;

  const members = ((memberRows ?? []) as PackageMemberRow[]).map(mapMember);
  const membersByChoiceLegacy = new Map<string, PackageMember[]>();
  const ungroupedProducts: PackageMember[] = [];
  for (const member of members) {
    if (!member.choiceSetLegacyId) {
      ungroupedProducts.push(member);
      continue;
    }
    const current = membersByChoiceLegacy.get(member.choiceSetLegacyId) ?? [];
    current.push(member);
    membersByChoiceLegacy.set(member.choiceSetLegacyId, current);
  }

  const choiceSets: PackageChoiceSet[] = (choiceRows ?? []).map((choice) => {
    const legacyId = choice.legacy_id as string;
    return {
      id: choice.id as string,
      legacyId,
      name: (choice.choice_type as string | null) ?? null,
      maximumChoices: toNumber(choice.maximum_choices as number | string | null),
      products: membersByChoiceLegacy.get(legacyId) ?? [],
    };
  });

  const knownLegacyIds = new Set(choiceSets.map((item) => item.legacyId));
  for (const [legacyId, products] of membersByChoiceLegacy) {
    if (knownLegacyIds.has(legacyId)) continue;
    ungroupedProducts.push(...products);
  }

  return {
    id: row.id,
    legacyId: row.legacy_id,
    sku: row.sku,
    name: row.name,
    chineseName: row.chinese_name,
    description: row.description,
    price: toNumber(row.price),
    status: row.status,
    isActive: row.is_active,
    channelId: channel?.id ?? null,
    channelName: channel?.name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    choiceSets,
    ungroupedProducts,
  };
}

export async function archivePackage(id: string) {
  const { error } = await supabase
    .from("packages")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw error;
}

export async function addPackageChoiceSet(
  packageId: string,
  name: string,
  maximumChoices: number,
) {
  const { data: pkg, error: packageError } = await supabase
    .from("packages")
    .select("legacy_id")
    .eq("id", packageId)
    .maybeSingle();
  if (packageError) throw packageError;
  if (!pkg) {
    const missing = new Error("package_not_found");
    (missing as { code?: string }).code = "package_not_found";
    throw missing;
  }

  const { error } = await supabase.from("package_choice_sets").insert({
    legacy_id: createLegacyId(),
    package_id: packageId,
    package_legacy_id: pkg.legacy_id,
    choice_type: name,
    maximum_choices: maximumChoices,
  });
  if (error) throw error;
}

export async function removePackageChoiceSet(id: string, legacyId: string) {
  const { error: productError } = await supabase
    .from("package_products")
    .delete()
    .eq("package_choice_set_legacy_id", legacyId);
  if (productError) throw productError;

  const { error } = await supabase.from("package_choice_sets").delete().eq("id", id);
  if (error) throw error;
}

export async function addPackageProduct(
  packageId: string,
  choiceSetLegacyId: string | null,
  productId: string,
  quantity = 1,
  addonPrice = 0,
) {
  const [{ data: pkg, error: packageError }, { data: product, error: productError }] =
    await Promise.all([
      supabase.from("packages").select("legacy_id").eq("id", packageId).maybeSingle(),
      supabase.from("products").select("legacy_id").eq("id", productId).maybeSingle(),
    ]);
  if (packageError) throw packageError;
  if (productError) throw productError;
  if (!pkg || !product) {
    const missing = new Error("package_not_found");
    (missing as { code?: string }).code = "package_not_found";
    throw missing;
  }

  const { error } = await supabase.from("package_products").insert({
    legacy_id: createLegacyId(),
    package_id: packageId,
    package_legacy_id: pkg.legacy_id,
    product_id: productId,
    product_legacy_id: product.legacy_id,
    package_choice_set_legacy_id: choiceSetLegacyId,
    quantity,
    addon_price: addonPrice,
    is_selected: false,
  });
  if (error) throw error;
}

export async function removePackageProduct(id: string) {
  const { error } = await supabase.from("package_products").delete().eq("id", id);
  if (error) throw error;
}
