import { supabase } from "@/lib/supabase";

export type RestaurantPurchaseOption = {
  id: string;
  legacyId: string;
  name: string;
};

export type RestaurantPurchaseCategory = RestaurantPurchaseOption & {
  amount: number;
};

export type RestaurantDailyPurchaseRecord = {
  date: string | null;
  restaurantId: string;
  restaurantName: string;
  supplierId: string;
  supplierName: string;
  categories: RestaurantPurchaseCategory[];
  total: number;
};

export type RestaurantDailyPurchaseFilters = {
  mode: "single" | "range";
  singleDate: string;
  startDate: string;
  endDate: string;
  restaurantIds: string[];
  supplierIds: string[];
};

export type RestaurantDailyPurchaseEntry = {
  id: string;
  date: string;
  restaurantId: string;
  restaurantName: string;
  supplierId: string;
  supplierName: string;
  purchaseTypeId: string;
  purchaseTypeName: string;
  amount: number;
};

type PurchaseRecordRpcRow = {
  record_date: string | null;
  restaurant_id: string;
  restaurant_name: string;
  supplier_id: string;
  supplier_name: string;
  category_amounts: Array<{
    purchaseTypeId: string;
    purchaseTypeLegacyId: string;
    name: string;
    amount: number | string;
  }> | null;
  total_amount: number | string;
  total_count: number | string;
};

function mapOptions(rows: Array<{ id: string; legacy_id: string; name: string }>) {
  return rows.map((row) => ({
    id: row.id,
    legacyId: row.legacy_id,
    name: row.name.trim(),
  }));
}

export async function fetchRestaurantPurchaseRestaurants() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,legacy_id,name")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return mapOptions((data ?? []) as Array<{ id: string; legacy_id: string; name: string }>);
}

export async function fetchRestaurantPurchaseSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,legacy_id,company_name,bubble_created_at")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("bubble_created_at", { ascending: true, nullsFirst: false })
    .order("company_name");
  if (error) throw new Error(error.message);
  return mapOptions(
    ((data ?? []) as Array<{ id: string; legacy_id: string; company_name: string }>).map((row) => ({
      id: row.id,
      legacy_id: row.legacy_id,
      name: row.company_name,
    })),
  );
}

export async function fetchRestaurantPurchaseTypes() {
  const { data, error } = await supabase
    .from("restaurant_purchase_types")
    .select("id,legacy_id,name,sort_order,bubble_created_at")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort_order")
    .order("bubble_created_at")
    .order("name");
  if (error) throw new Error(error.message);
  return mapOptions((data ?? []) as Array<{ id: string; legacy_id: string; name: string }>);
}

export async function fetchRestaurantDailyPurchaseRecords({
  filters,
  page,
  pageSize,
}: {
  filters: RestaurantDailyPurchaseFilters;
  page: number;
  pageSize: number;
}) {
  const { data, error } = await supabase.rpc("get_restaurant_daily_purchase_records", {
    p_single_date: filters.mode === "single" && filters.singleDate ? filters.singleDate : null,
    p_start_date: filters.mode === "range" && filters.startDate ? filters.startDate : null,
    p_end_date: filters.mode === "range" && filters.endDate ? filters.endDate : null,
    p_restaurant_ids: filters.restaurantIds.length ? filters.restaurantIds : null,
    p_supplier_ids: filters.supplierIds.length ? filters.supplierIds : null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PurchaseRecordRpcRow[];
  return {
    items: rows.map((row) => ({
      date: row.record_date,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      categories: (row.category_amounts ?? []).map((category) => ({
        id: category.purchaseTypeId,
        legacyId: category.purchaseTypeLegacyId,
        name: category.name,
        amount: Number(category.amount ?? 0),
      })),
      total: Number(row.total_amount ?? 0),
    })) satisfies RestaurantDailyPurchaseRecord[],
    total: Number(rows[0]?.total_count ?? 0),
  };
}

export async function saveRestaurantDailyPurchaseRecord(input: {
  date: string;
  restaurantId: string;
  supplierId: string;
  amounts: Array<{ purchaseTypeId: string; amount: number }>;
  original?: { date: string; restaurantId: string; supplierId: string } | null;
}) {
  const { error } = await supabase.rpc("save_restaurant_daily_purchase_record", {
    p_record_date: input.date,
    p_restaurant_id: input.restaurantId,
    p_supplier_id: input.supplierId,
    p_amounts: input.amounts,
    p_original_date: input.original?.date ?? null,
    p_original_restaurant_id: input.original?.restaurantId ?? null,
    p_original_supplier_id: input.original?.supplierId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchRestaurantDailyPurchaseEntries({
  filters,
  page,
  pageSize,
}: {
  filters: RestaurantDailyPurchaseFilters;
  page: number;
  pageSize: number;
}) {
  const { data, error } = await supabase.rpc("get_restaurant_daily_purchase_entries", {
    p_single_date: filters.mode === "single" && filters.singleDate ? filters.singleDate : null,
    p_start_date: filters.mode === "range" && filters.startDate ? filters.startDate : null,
    p_end_date: filters.mode === "range" && filters.endDate ? filters.endDate : null,
    p_restaurant_ids: filters.restaurantIds.length ? filters.restaurantIds : null,
    p_supplier_ids: filters.supplierIds.length ? filters.supplierIds : null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    record_date: string;
    restaurant_id: string;
    restaurant_name: string;
    supplier_id: string;
    supplier_name: string;
    purchase_type_id: string;
    purchase_type_name: string;
    amount: number | string;
    total_count: number | string;
  }>;
  return {
    items: rows.map((row) => ({
      id: row.id,
      date: row.record_date,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      purchaseTypeId: row.purchase_type_id,
      purchaseTypeName: row.purchase_type_name,
      amount: Number(row.amount ?? 0),
    })) satisfies RestaurantDailyPurchaseEntry[],
    total: Number(rows[0]?.total_count ?? 0),
  };
}

export async function updateRestaurantDailyPurchaseEntry(id: string, amount: number) {
  const { error } = await supabase
    .from("restaurant_supplier_purchases")
    .update({ amount, bubble_modified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRestaurantDailyPurchaseEntry(id: string) {
  const { error } = await supabase
    .from("restaurant_supplier_purchases")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
