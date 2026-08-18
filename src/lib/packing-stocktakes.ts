import { supabase } from "@/lib/supabase";

export const PACKING_STOCKTAKES_PAGE_SIZE = 15;
export type StocktakeKind = "packing" | "ingredient";

function eventTable(kind: StocktakeKind) {
  return kind === "ingredient" ? "ingredient_stocktake_events" : "packing_stocktake_events";
}

export type PackingStocktakeItem = {
  id: string;
  stocktakeAt: string | null;
  sku: string | null;
  ingredientType: string | null;
  name: string | null;
  quantity: number | null;
  unit: string | null;
};

export type StocktakeDateItem = { date: string; updatedAt: string };

type PackingStocktakeRow = {
  id: string;
  stocktake_at: string | null;
  sku_snapshot: string | null;
  quantity: number | string | null;
  ingredients: {
    sku: string | null;
    name: string | null;
    ingredient_type: string | null;
    stocktake_unit: string | null;
  } | Array<{
    sku: string | null;
    name: string | null;
    ingredient_type: string | null;
    stocktake_unit: string | null;
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
    stocktakeAt: row.stocktake_at,
    sku: ingredient?.sku ?? row.sku_snapshot,
    ingredientType: ingredient?.ingredient_type ?? null,
    name: ingredient?.name ?? null,
    quantity: toNumber(row.quantity),
    unit: ingredient?.stocktake_unit ?? null,
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
  let query = supabase
    .from(eventTable(kind))
    .select(
      "id,stocktake_at,sku_snapshot,quantity,ingredients(sku,name,ingredient_type,stocktake_unit)",
      { count: "exact" },
    )
    .order("stocktake_at", { ascending: false, nullsFirst: false })
    .range(start, end);

  const term = search.trim().replace(/[,%()]/g, " ");
  if (term) query = query.ilike("sku_snapshot", `%${term}%`);
  if (stocktakeDate) {
    query = query
      .gte("stocktake_at", `${stocktakeDate}T00:00:00+08:00`)
      .lt("stocktake_at", `${nextDate(stocktakeDate)}T00:00:00+08:00`);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    items: ((data ?? []) as PackingStocktakeRow[]).map(mapRow),
    total: count ?? 0,
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
  const { data, error } = await supabase
    .from(eventTable(kind))
    .select("stocktake_at,updated_at")
    .not("stocktake_at", "is", null)
    .order("stocktake_at", { ascending: false })
    .range(0, 4999);
  if (error) throw error;
  const dates = new Map<string, string>();
  (data ?? []).forEach((row) => {
    const value = row.stocktake_at as string;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
    const updatedAt = (row.updated_at as string | null) ?? value;
    if (!dates.has(date) || updatedAt > (dates.get(date) ?? "")) dates.set(date, updatedAt);
  });
  return [...dates.entries()].map(([date, updatedAt]) => ({ date, updatedAt }));
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
    .select("id,stocktake_at,sku_snapshot,quantity,ingredients(sku,name,ingredient_type,stocktake_unit)")
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
