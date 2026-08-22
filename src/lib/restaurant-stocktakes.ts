import { supabase } from "@/lib/supabase";

export const RESTAURANT_STOCKTAKES_PAGE_SIZE = 15;
const RESTAURANT_STOCKTAKES_FETCH_SIZE = 100;

export const RESTAURANT_STOCKTAKE_DEPARTMENTS = [
  { id: "restaurant", name: "餐廳" },
  { id: "water-bar", name: "水吧" },
] as const;

export type RestaurantStocktakeOption = {
  id: string;
  name: string;
};

export type RestaurantStocktakeRecord = {
  month: string;
  restaurantId: string;
  restaurantName: string;
  departmentName: string;
  updatedAt: string;
};

export type RestaurantStocktakeItem = {
  id: string;
  supplierName: string | null;
  name: string;
  unit: string | null;
  unitCost: number;
  quantity: number | null;
  totalCost: number;
};

export type RestaurantStocktakeMasters = {
  restaurants: RestaurantStocktakeOption[];
  departments: RestaurantStocktakeOption[];
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchRestaurantStocktakeMasters(): Promise<RestaurantStocktakeMasters> {
  const restaurantsResult = await supabase
    .from("restaurants")
    .select("id,name")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("name");
  if (restaurantsResult.error) throw restaurantsResult.error;
  return {
    restaurants: (restaurantsResult.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
    departments: RESTAURANT_STOCKTAKE_DEPARTMENTS.map((department) => ({ ...department })),
  };
}

export async function fetchRestaurantStocktakeRecords(): Promise<RestaurantStocktakeRecord[]> {
  const { data, error } = await supabase.rpc("get_restaurant_stocktake_records");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    month: String(row.record_month).slice(0, 7),
    restaurantId: String(row.restaurant_id),
    restaurantName: String(row.restaurant_name ?? ""),
    departmentName: String(row.department_name ?? ""),
    updatedAt: String(row.updated_at ?? `${String(row.record_month).slice(0, 10)}T00:00:00+08:00`),
  }));
}

export async function fetchRestaurantStocktakeItems({
  month,
  restaurantId,
  departmentName,
  search,
  page,
}: {
  month: string;
  restaurantId: string;
  departmentName: string;
  search: string;
  page: number;
}): Promise<{ items: RestaurantStocktakeItem[]; total: number; inventoryValue: number }> {
  void page;
  const loadChunk = async (offset: number) => {
    const { data, error } = await supabase.rpc("get_restaurant_stocktake_items", {
      p_month: `${month}-01`,
      p_restaurant_id: restaurantId,
      p_department_name: departmentName,
      p_search: search.trim() || null,
      p_limit: RESTAURANT_STOCKTAKES_FETCH_SIZE,
      p_offset: offset,
    });
    if (error) throw error;
    return (data ?? []) as Array<Record<string, unknown>>;
  };

  const firstChunk = await loadChunk(0);
  const total = firstChunk.length ? numberValue(firstChunk[0].total_count) : 0;
  const offsets = Array.from(
    { length: Math.max(0, Math.ceil((total - firstChunk.length) / RESTAURANT_STOCKTAKES_FETCH_SIZE)) },
    (_, index) => firstChunk.length + index * RESTAURANT_STOCKTAKES_FETCH_SIZE,
  );
  const rows = firstChunk.concat(...(await Promise.all(offsets.map(loadChunk))));
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      supplierName: row.supplier_name ? String(row.supplier_name) : null,
      name: String(row.item_name ?? ""),
      unit: row.unit ? String(row.unit) : null,
      unitCost: numberValue(row.unit_cost),
      quantity: row.quantity === null || row.quantity === undefined ? null : numberValue(row.quantity),
      totalCost: numberValue(row.total_cost),
    })),
    total,
    inventoryValue: rows.length ? numberValue(rows[0].inventory_value) : 0,
  };
}

export async function createRestaurantStocktake(month: string, restaurantId: string, departmentName: string): Promise<number> {
  const { data, error } = await supabase.rpc("create_restaurant_stocktake", {
    p_month: `${month}-01`,
    p_restaurant_id: restaurantId,
    p_department_name: departmentName,
  });
  if (error) throw error;
  return numberValue(data);
}

export async function updateRestaurantStocktakeQuantity(id: string, quantity: number): Promise<void> {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("restaurant_stocktake_quantity_invalid");
  const { error } = await supabase.rpc("update_restaurant_stocktake_quantity", {
    p_id: id,
    p_quantity: quantity,
  });
  if (error) throw error;
}

export async function deleteRestaurantStocktake(month: string, restaurantId: string, departmentName: string): Promise<void> {
  const { error } = await supabase.rpc("delete_restaurant_stocktake", {
    p_month: `${month}-01`,
    p_restaurant_id: restaurantId,
    p_department_name: departmentName,
  });
  if (error) throw error;
}
