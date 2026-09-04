import { supabase } from "@/lib/supabase";

export type SeasoningRecipeSpice = {
  id: string;
  name: string;
  costPerGram: number | null;
  sortOrder: number | null;
};

export type SeasoningRecipeProduct = {
  id: string;
  name: string;
  sortOrder: number | null;
  rawMeatItemId: string | null;
  rawMeatName: string | null;
};

export type SeasoningRecipeLine = {
  id: string;
  seasoningId: string;
  seasoningName: string;
  quantityGrams: number;
  totalCost: number;
  unitCost: number | null;
  sort: number | null;
};

export type SeasoningRecipeRow = {
  key: string;
  preparedMeatItemId: string;
  preparedMeatName: string;
  preparedSortOrder: number | null;
  rawMeatItemId: string | null;
  rawMeatName: string | null;
  versionCode: number;
  productionRawMeatKg: number;
  totalCost: number;
  seasoningPerKg: number | null;
  isApplied: boolean;
  lines: SeasoningRecipeLine[];
};

export type SeasoningRecipeLineInput = {
  seasoningId: string;
  quantityGrams: number;
};

type Nested<T> = T | T[] | null;

type VersionRow = {
  id: string;
  prepared_meat_item_id: string | null;
  raw_meat_item_id: string | null;
  seasoning_id: string | null;
  production_raw_meat_kg: number | string | null;
  seasoning_quantity_grams: number | string | null;
  total_cost: number | string | null;
  unit_cost: number | string | null;
  version_code: number | string | null;
  seasoning_sort: number | string | null;
  is_applied: boolean | null;
  prepared_meat_items: Nested<{
    id: string;
    name: string;
    sort_order: number | string | null;
    raw_meat_item_id: string | null;
  }>;
  raw_meat_items: Nested<{
    id: string;
    name: string;
  }>;
  seasonings: Nested<{
    id: string;
    name: string;
    cost_per_gram: number | string | null;
  }>;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNested<T>(value: Nested<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function recipeKey(preparedMeatItemId: string, versionCode: number) {
  return `${preparedMeatItemId}:${versionCode}`;
}

export function todaySeasoningVersionCode(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return Number.parseInt(`${year}${month}${day}`, 10);
}

export function calculateSeasoningLineCost(
  grams: number,
  costPerGram: number | null,
) {
  if (!Number.isFinite(grams) || grams <= 0 || costPerGram === null) return null;
  return grams * costPerGram;
}

export function calculateSeasoningPerKg(
  totalCost: number,
  productionRawMeatKg: number,
) {
  if (!Number.isFinite(productionRawMeatKg) || productionRawMeatKg <= 0) {
    return null;
  }
  return totalCost / productionRawMeatKg;
}

export function coerceGramsInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(
    /^0+(?=\d)/,
    "",
  );
  const frac =
    dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 3);
  const intPart = intDigits === "" ? (frac === null ? "" : "0") : intDigits;
  if (frac === null) return intPart;
  return `${intPart}.${frac}`;
}

export function parseVersionCode(value: string) {
  const trimmed = value.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;
  const year = Number.parseInt(trimmed.slice(0, 4), 10);
  const month = Number.parseInt(trimmed.slice(4, 6), 10);
  const day = Number.parseInt(trimmed.slice(6, 8), 10);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Number.parseInt(trimmed, 10);
}

export function groupSeasoningRecipes(rows: VersionRow[]): SeasoningRecipeRow[] {
  const grouped = new Map<string, SeasoningRecipeRow>();

  for (const row of rows) {
    const prepared = firstNested(row.prepared_meat_items);
    const raw = firstNested(row.raw_meat_items);
    const seasoning = firstNested(row.seasonings);
    const preparedId = row.prepared_meat_item_id ?? prepared?.id;
    const versionCode = toNumber(row.version_code);
    if (!preparedId || versionCode === null) continue;

    const key = recipeKey(preparedId, versionCode);
    const current = grouped.get(key) ?? {
      key,
      preparedMeatItemId: preparedId,
      preparedMeatName: prepared?.name ?? "",
      preparedSortOrder: toNumber(prepared?.sort_order),
      rawMeatItemId: row.raw_meat_item_id ?? raw?.id ?? prepared?.raw_meat_item_id ?? null,
      rawMeatName: raw?.name ?? null,
      versionCode,
      productionRawMeatKg: toNumber(row.production_raw_meat_kg) ?? 0,
      totalCost: 0,
      seasoningPerKg: null,
      isApplied: Boolean(row.is_applied),
      lines: [],
    };

    current.isApplied = current.isApplied || Boolean(row.is_applied);
    if (row.raw_meat_item_id && raw?.name) {
      current.rawMeatItemId = row.raw_meat_item_id;
      current.rawMeatName = raw.name;
    }

    const quantityGrams = toNumber(row.seasoning_quantity_grams) ?? 0;
    const totalCost = toNumber(row.total_cost) ?? 0;
    current.lines.push({
      id: row.id,
      seasoningId: row.seasoning_id ?? seasoning?.id ?? "",
      seasoningName: seasoning?.name ?? "",
      quantityGrams,
      totalCost,
      unitCost: toNumber(row.unit_cost) ?? toNumber(seasoning?.cost_per_gram),
      sort: toNumber(row.seasoning_sort),
    });
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((recipe) => {
      const lines = [...recipe.lines].sort((left, right) => {
        const leftSort = left.sort;
        const rightSort = right.sort;
        if (leftSort !== rightSort) {
          if (leftSort === null) return 1;
          if (rightSort === null) return -1;
          return leftSort - rightSort;
        }
        return left.seasoningName.localeCompare(right.seasoningName, "zh-HK");
      });
      const totalCost = lines.reduce((sum, line) => sum + line.totalCost, 0);
      return {
        ...recipe,
        lines,
        totalCost,
        seasoningPerKg: calculateSeasoningPerKg(
          totalCost,
          recipe.productionRawMeatKg,
        ),
      };
    })
    .sort((left, right) => {
      if (left.preparedSortOrder !== right.preparedSortOrder) {
        if (left.preparedSortOrder === null) return 1;
        if (right.preparedSortOrder === null) return -1;
        return left.preparedSortOrder - right.preparedSortOrder;
      }
      const nameCmp = left.preparedMeatName.localeCompare(
        right.preparedMeatName,
        "zh-HK",
      );
      if (nameCmp !== 0) return nameCmp;
      return right.versionCode - left.versionCode;
    });
}

export function filterSeasoningRecipes(
  rows: SeasoningRecipeRow[],
  preparedMeatItemId: string | null,
  search = "",
) {
  const needle = search.trim().toLocaleLowerCase("zh-HK");
  return rows.filter((row) => {
    if (preparedMeatItemId && row.preparedMeatItemId !== preparedMeatItemId) {
      return false;
    }
    if (!needle) return true;
    const haystack = [
      String(row.versionCode),
      row.preparedMeatName,
      row.rawMeatName,
      ...row.lines.map((line) => line.seasoningName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-HK");
    return haystack.includes(needle);
  });
}

export function filterSeasoningRecipeProducts(
  products: SeasoningRecipeProduct[],
  search = "",
) {
  const needle = search.trim().toLocaleLowerCase("zh-HK");
  if (!needle) return products;
  return products.filter((product) =>
    product.name.toLocaleLowerCase("zh-HK").includes(needle),
  );
}

export function nextCopiedVersionCode(
  existingCodes: number[],
  preferred = todaySeasoningVersionCode(),
) {
  const used = new Set(existingCodes);
  let next = preferred;
  while (used.has(next)) next += 1;
  return next;
}

export async function fetchSeasoningRecipeSpices(): Promise<
  SeasoningRecipeSpice[]
> {
  const { data, error } = await supabase
    .from("seasonings")
    .select("id,name,cost_per_gram,sort_order")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    cost_per_gram: number | string | null;
    sort_order: number | string | null;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    costPerGram: toNumber(row.cost_per_gram),
    sortOrder: toNumber(row.sort_order),
  }));
}

export async function fetchSeasoningRecipeProducts(): Promise<
  SeasoningRecipeProduct[]
> {
  const { data, error } = await supabase
    .from("prepared_meat_items")
    .select("id,name,sort_order,raw_meat_item_id,raw_meat_items(id,name)")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    sort_order: number | string | null;
    raw_meat_item_id: string | null;
    raw_meat_items: Nested<{ id: string; name: string }>;
  }>).map((row) => {
    const raw = firstNested(row.raw_meat_items);
    return {
      id: row.id,
      name: row.name,
      sortOrder: toNumber(row.sort_order),
      rawMeatItemId: row.raw_meat_item_id ?? raw?.id ?? null,
      rawMeatName: raw?.name ?? null,
    };
  });
}

export async function fetchSeasoningRecipes(): Promise<SeasoningRecipeRow[]> {
  const { data, error } = await supabase
    .from("meat_seasoning_cost_versions")
    .select(
      "id,prepared_meat_item_id,raw_meat_item_id,seasoning_id,production_raw_meat_kg,seasoning_quantity_grams,total_cost,unit_cost,version_code,seasoning_sort,is_applied,prepared_meat_items(id,name,sort_order,raw_meat_item_id),raw_meat_items(id,name),seasonings(id,name,cost_per_gram)",
    )
    .not("prepared_meat_item_id", "is", null)
    .not("version_code", "is", null);

  if (error) throw error;
  return groupSeasoningRecipes((data ?? []) as VersionRow[]);
}

export async function saveSeasoningRecipe(input: {
  preparedMeatItemId: string;
  versionCode: number;
  productionRawMeatKg: number;
  lines: SeasoningRecipeLineInput[];
  previousVersionCode?: number | null;
}): Promise<void> {
  const { error } = await supabase.rpc("save_meat_seasoning_recipe", {
    p_prepared_meat_item_id: input.preparedMeatItemId,
    p_version_code: input.versionCode,
    p_production_raw_meat_kg: input.productionRawMeatKg,
    p_lines: input.lines.map((line) => ({
      seasoning_id: line.seasoningId,
      quantity_grams: line.quantityGrams,
    })),
    p_previous_version_code: input.previousVersionCode ?? null,
  });
  if (error) throw error;
}

export async function deleteSeasoningRecipe(
  preparedMeatItemId: string,
  versionCode: number,
): Promise<void> {
  const { error } = await supabase.rpc("delete_meat_seasoning_recipe", {
    p_prepared_meat_item_id: preparedMeatItemId,
    p_version_code: versionCode,
  });
  if (error) throw error;
}

export async function setSeasoningRecipeApplied(
  preparedMeatItemId: string,
  versionCode: number,
  isApplied: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_meat_seasoning_recipe_applied", {
    p_prepared_meat_item_id: preparedMeatItemId,
    p_version_code: versionCode,
    p_is_applied: isApplied,
  });
  if (error) throw error;
}
