export type FactoryMenuCategory =
  | "chinese"
  | "western"
  | "fusion"
  | "tea"
  | "unclassified";

export const FACTORY_MENU_CATEGORY_ORDER: FactoryMenuCategory[] = [
  "chinese",
  "western",
  "fusion",
  "tea",
  "unclassified",
];

/** Dish product types that always belong to 茶點, regardless of brand. */
export const FACTORY_TEA_PRODUCT_TYPES = [
  "分享小食-C",
  "分享小食-E",
  "甜品",
  "甜品糖水",
  "點心",
  "飲品",
  "禮品",
  "配件",
] as const;

/** Western dish types take priority over the brand grouping. */
export const FACTORY_WESTERN_PRODUCT_TYPES = [
  "西式熱盤",
  "沙律",
  "三文治/包類",
  "意粉",
  "餐湯",
] as const;

/** Brands/catering channels that are purely Chinese food. */
export const FACTORY_CHINESE_BRANDS = ["Cuisine", "Kitchen"] as const;

/** Brands/catering channels that mix Chinese and Western food. */
export const FACTORY_FUSION_BRANDS = [
  "Catering",
  "HK lunch box",
  "Express",
] as const;

/**
 * Merge precedence when one dish label is contributed by several categories.
 * Dish-type categories (tea/western) are more specific than the brand grouping.
 */
const CATEGORY_MERGE_PRIORITY: Record<FactoryMenuCategory, number> = {
  tea: 0,
  western: 1,
  chinese: 2,
  fusion: 3,
  unclassified: 4,
};

const TEA_PRODUCT_TYPES = new Set<string>(FACTORY_TEA_PRODUCT_TYPES);
const WESTERN_PRODUCT_TYPES = new Set<string>(FACTORY_WESTERN_PRODUCT_TYPES);
const CHINESE_BRANDS = new Set<string>(FACTORY_CHINESE_BRANDS);
const FUSION_BRANDS = new Set<string>(FACTORY_FUSION_BRANDS);

function normalizeCategoryName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function factoryMenuCategory(input: {
  productTypeName?: string | null;
  brandName?: string | null;
}): FactoryMenuCategory {
  const productType = normalizeCategoryName(input.productTypeName);
  if (TEA_PRODUCT_TYPES.has(productType)) return "tea";
  if (WESTERN_PRODUCT_TYPES.has(productType)) return "western";
  const brand = normalizeCategoryName(input.brandName);
  if (CHINESE_BRANDS.has(brand)) return "chinese";
  if (FUSION_BRANDS.has(brand)) return "fusion";
  return "unclassified";
}

export function factoryMenuCategoryRank(
  category: FactoryMenuCategory | null | undefined,
): number {
  const index = category ? FACTORY_MENU_CATEGORY_ORDER.indexOf(category) : -1;
  return index === -1 ? FACTORY_MENU_CATEGORY_ORDER.length : index;
}

/** Keeps the most specific category when merging contributions. */
export function preferredFactoryMenuCategory(
  current: FactoryMenuCategory | null | undefined,
  candidate: FactoryMenuCategory | null | undefined,
): FactoryMenuCategory {
  if (!current) return candidate ?? "unclassified";
  if (!candidate) return current;
  return CATEGORY_MERGE_PRIORITY[candidate] < CATEGORY_MERGE_PRIORITY[current]
    ? candidate
    : current;
}

export type FactoryMenuCategoryGroup<T> = {
  category: FactoryMenuCategory;
  rows: T[];
};

/** Groups rows that have already been sorted by category. */
export function groupFactoryMenuRowsByCategory<
  T extends { category?: FactoryMenuCategory | null },
>(rows: readonly T[]): FactoryMenuCategoryGroup<T>[] {
  const groups: FactoryMenuCategoryGroup<T>[] = [];
  for (const row of rows) {
    const category = row.category ?? "unclassified";
    const last = groups[groups.length - 1];
    if (last && last.category === category) {
      last.rows.push(row);
    } else {
      groups.push({ category, rows: [row] });
    }
  }
  return groups;
}
