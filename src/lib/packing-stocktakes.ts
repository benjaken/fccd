import { supabase } from "@/lib/supabase";

export const PACKING_STOCKTAKES_PAGE_SIZE = 15;
export type StocktakeKind = "packing" | "ingredient";

function eventTable(kind: StocktakeKind) {
  return kind === "ingredient" ? "ingredient_stocktake_events" : "packing_stocktake_events";
}

export type PackingStocktakeItem = {
  id: string;
  ingredientId: string | null;
  stocktakeAt: string | null;
  sku: string | null;
  ingredientType: string | null;
  name: string | null;
  quantity: number | null;
  currentQuantity: number | null;
  currentStocktakeAt: string | null;
  unit: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
};

export type StocktakeDateItem = { date: string; updatedAt: string };

const PACKING_VARIANT_SUFFIXES = [
  { pattern: /(?:[\s\-–—_/（(]+)(?:蓋|盒蓋|lid)[）)]?$/iu, rank: 10 },
  { pattern: /蓋$/u, rank: 10 },
  { pattern: /(?:[\s\-–—_/（(]+)(?:盒|盒身|box|base)[）)]?$/iu, rank: 20 },
  { pattern: /(?:盒身)$/u, rank: 20 },
  { pattern: /盒盒$/u, rank: 20 },
  { pattern: /(?:[\s\-–—_/（(]+)(?:大碼|大號|大型|大|large|lg)[）)]?$/iu, rank: 30 },
  { pattern: /(?:[\s\-–—_/（(]+)(?:中碼|中號|中型|中|medium|md)[）)]?$/iu, rank: 40 },
  { pattern: /(?:[\s\-–—_/（(]+)(?:細碼|小碼|細號|小號|細型|小型|細|小|small|sm)[）)]?$/iu, rank: 50 },
] as const;

function normalizePackingName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replaceAll("温", "溫")
    .replace(/\s+/gu, " ")
    .trim();
}

function packingSortParts(item: PackingStocktakeItem) {
  const name = normalizePackingName(item.name ?? item.sku);
  for (const suffix of PACKING_VARIANT_SUFFIXES) {
    if (!suffix.pattern.test(name)) continue;
    const group = name.replace(suffix.pattern, "").replace(/[\s\-–—_/（(]+$/gu, "").trim();
    if (group) return { group, rank: suffix.rank, name };
  }
  return { group: name, rank: 0, name };
}

/** Keeps components and sizes of the same packaging set beside each other. */
export function sortPackingStocktakeItems(items: PackingStocktakeItem[]) {
  const collator = new Intl.Collator("zh-HK", { numeric: true, sensitivity: "base" });
  return [...items].sort((left, right) => {
    const leftParts = packingSortParts(left);
    const rightParts = packingSortParts(right);
    return collator.compare(leftParts.group, rightParts.group)
      || leftParts.rank - rightParts.rank
      || collator.compare(leftParts.name, rightParts.name)
      || collator.compare(left.sku ?? "", right.sku ?? "");
  });
}

type PackingStocktakeRow = {
  id: string;
  ingredient_id: string | null;
  stocktake_at: string | null;
  sku_snapshot: string | null;
  quantity: number | string | null;
  ingredients: {
    sku: string | null;
    name: string | null;
    ingredient_type: string | null;
    stocktake_unit: string | null;
    suppliers: { company_name: string | null; phone_number: string | null } | Array<{ company_name: string | null; phone_number: string | null }> | null;
  } | Array<{
    sku: string | null;
    name: string | null;
    ingredient_type: string | null;
    stocktake_unit: string | null;
    suppliers: { company_name: string | null; phone_number: string | null } | Array<{ company_name: string | null; phone_number: string | null }> | null;
  }> | null;
};

function toNumber(value: number | string | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: PackingStocktakeRow): PackingStocktakeItem {
  const ingredient = Array.isArray(row.ingredients)
    ? (row.ingredients[0] ?? null)
    : row.ingredients;
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    stocktakeAt: row.stocktake_at,
    sku: ingredient?.sku ?? row.sku_snapshot,
    ingredientType: ingredient?.ingredient_type ?? null,
    name: ingredient?.name ?? null,
    quantity: toNumber(row.quantity),
    currentQuantity: null,
    currentStocktakeAt: null,
    unit: ingredient?.stocktake_unit ?? null,
    supplierName: (Array.isArray(ingredient?.suppliers) ? ingredient.suppliers[0]?.company_name : ingredient?.suppliers?.company_name) ?? null,
    supplierPhone: (Array.isArray(ingredient?.suppliers) ? ingredient.suppliers[0]?.phone_number : ingredient?.suppliers?.phone_number) ?? null,
  };
}

function nextDate(date: string) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function fetchPackingStocktakes({
  page,
  search,
  stocktakeDate,
  kind = "packing",
}: {
  page: number;
  search: string;
  stocktakeDate: string | null;
  kind?: StocktakeKind;
}): Promise<{ items: PackingStocktakeItem[]; total: number }> {
  const start = (page - 1) * PACKING_STOCKTAKES_PAGE_SIZE;
  const end = start + PACKING_STOCKTAKES_PAGE_SIZE - 1;
  const normalizedSearch = search.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
  let ingredientNameIds: string[] = [];
  if (normalizedSearch) {
    const { data: ingredientRows, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id")
      .or(`sku.ilike.%${normalizedSearch}%,name.ilike.%${normalizedSearch}%,ingredient_type.ilike.%${normalizedSearch}%`);
    if (ingredientError) throw ingredientError;
    ingredientNameIds = (ingredientRows ?? []).map((row) => String(row.id));
  }

  const buildQuery = () => {
    let query = supabase
      .from(eventTable(kind))
      .select(
        "id,ingredient_id,stocktake_at,sku_snapshot,quantity,ingredients(sku,name,ingredient_type,stocktake_unit,suppliers(company_name,phone_number))",
        { count: "exact" },
      )
      .order("stocktake_at", { ascending: false, nullsFirst: false });
    if (normalizedSearch) {
      const ingredientFilter = ingredientNameIds.length > 0
        ? `ingredient_id.in.(${ingredientNameIds.join(",")})`
        : null;
      query = query.or(
        ingredientFilter
          ? `sku_snapshot.ilike.%${normalizedSearch}%,${ingredientFilter}`
          : `sku_snapshot.ilike.%${normalizedSearch}%`,
      );
    }
    if (stocktakeDate) {
      query = query
        .gte("stocktake_at", `${stocktakeDate}T00:00:00+08:00`)
        .lt("stocktake_at", `${nextDate(stocktakeDate)}T00:00:00+08:00`);
    }
    return query;
  };

  let rows: PackingStocktakeRow[] = [];
  let total = 0;
  if (kind === "packing") {
    // Sorting packaging families needs the complete result set. Read it in
    // bounded server pages so the API row cap cannot silently truncate it.
    let offset = 0;
    while (offset <= total) {
      const { data, count, error } = await buildQuery().range(offset, offset + 999);
      if (error) throw error;
      const chunk = (data ?? []) as PackingStocktakeRow[];
      if (offset === 0) total = count ?? chunk.length;
      rows.push(...chunk);
      if (!chunk.length) break;
      offset += chunk.length;
      if (offset >= total) break;
    }
  } else {
    const { data, count, error } = await buildQuery().range(start, end);
    if (error) throw error;
    rows = (data ?? []) as PackingStocktakeRow[];
    total = count ?? rows.length;
  }
  const mappedItems = rows.map(mapRow);
  const items = kind === "packing"
    ? sortPackingStocktakeItems(mappedItems).slice(start, end + 1)
    : mappedItems;
  const ingredientIds = [...new Set(items.flatMap((item) => item.ingredientId ? [item.ingredientId] : []))];
  if (ingredientIds.length > 0) {
    const { data: currentData, error: currentError } = await supabase.rpc(
      "get_material_current_stock",
      { p_kind: kind, p_ingredient_ids: ingredientIds },
    );
    if (currentError) throw currentError;
    const currentByIngredient = new Map(
      ((currentData ?? []) as Array<{
        ingredient_id: string;
        quantity: number | string | null;
        stocktake_at: string | null;
      }>).map((row) => [row.ingredient_id, row] as const),
    );
    for (const item of items) {
      const current = item.ingredientId ? currentByIngredient.get(item.ingredientId) : null;
      item.currentQuantity = toNumber(current?.quantity ?? null);
      item.currentStocktakeAt = current?.stocktake_at ?? null;
    }
  }
  return {
    items,
    total,
  };
}

export async function createPackingStocktake(stocktakeDate: string): Promise<number> {
  const { data, error } = await supabase.rpc("create_packing_stocktake", {
    p_stocktake_date: stocktakeDate,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchStocktakeDates(kind: StocktakeKind = "packing"): Promise<StocktakeDateItem[]> {
  const { data, error } = await supabase.rpc("get_stocktake_dates", {
    p_kind: kind,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{
    stocktake_date: string;
    updated_at: string | null;
  }>).map((row) => ({
    date: row.stocktake_date,
    updatedAt: row.updated_at ?? `${row.stocktake_date}T00:00:00+08:00`,
  }));
}

export async function createIngredientStocktake(stocktakeDate: string): Promise<number> {
  const { data, error } = await supabase.rpc("create_ingredient_stocktake", {
    p_stocktake_date: stocktakeDate,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** All rows for one dated paper sheet; unlike the operational table this is not paginated. */
export async function fetchPackingStocktakeSheet(stocktakeDate: string, kind: StocktakeKind = "packing"): Promise<PackingStocktakeItem[]> {
  const { data, error } = await supabase
    .from(eventTable(kind))
    .select("id,ingredient_id,stocktake_at,sku_snapshot,quantity,ingredients(sku,name,ingredient_type,stocktake_unit,suppliers(company_name,phone_number))")
    .gte("stocktake_at", `${stocktakeDate}T00:00:00+08:00`)
    .lt("stocktake_at", `${nextDate(stocktakeDate)}T00:00:00+08:00`)
    .order("sku_snapshot", { ascending: true, nullsFirst: false })
    .range(0, 4999);
  if (error) throw error;
  return ((data ?? []) as PackingStocktakeRow[]).map(mapRow);
}

export async function updatePackingStocktakeQuantity(
  id: string,
  quantity: number,
  kind: StocktakeKind = "packing",
): Promise<number> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("packing_stocktake_quantity_invalid");
  }
  const { data, error } = await supabase
    .from(eventTable(kind))
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("quantity")
    .single();
  if (error) throw error;
  return toNumber((data as { quantity: number | string | null }).quantity) ?? 0;
}

export async function deleteStocktakeDate(stocktakeDate: string, kind: StocktakeKind): Promise<void> {
  const { error } = await supabase.rpc(
    kind === "ingredient" ? "delete_ingredient_stocktake" : "delete_packing_stocktake",
    { p_stocktake_date: stocktakeDate },
  );
  if (error) throw error;
}
