import { supabase } from "@/lib/supabase";

export type KitchenSupplierOption = {
  id: string;
  legacyId: string;
  name: string;
};

export type KitchenSupplierPurchaseType = {
  id: string;
  legacyId: string;
  name: string;
};

export type KitchenSupplierCategoryAmount = KitchenSupplierPurchaseType & {
  amount: number;
};

export type KitchenSupplierRecord = {
  date: string | null;
  supplierId: string;
  supplierLegacyId: string;
  supplierName: string;
  categories: KitchenSupplierCategoryAmount[];
  total: number;
};

export type KitchenSupplierRecordFilters = {
  mode: "single" | "range";
  singleDate: string;
  startDate: string;
  endDate: string;
  supplierIds: string[];
};

export type KitchenSupplierCostEntry = {
  id: string;
  date: string;
  supplierId: string;
  supplierName: string;
  purchaseTypeId: string;
  purchaseTypeName: string;
  amount: number;
};

type SupplierRecordRpcRow = {
  record_date: string | null;
  supplier_id: string;
  supplier_legacy_id: string;
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

export async function fetchKitchenSupplierOptions() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,legacy_id,company_name")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("company_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; legacy_id: string; company_name: string }>).map((row) => ({
    id: row.id,
    legacyId: row.legacy_id,
    name: row.company_name,
  }));
}

export async function fetchKitchenSupplierPurchaseTypes() {
  const { data, error } = await supabase
    .from("purchase_types")
    .select("id,legacy_id,name,bubble_created_at")
    .order("bubble_created_at", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; legacy_id: string; name: string }>).map((row) => ({
    id: row.id,
    legacyId: row.legacy_id,
    name: row.name.trim(),
  }));
}

export async function fetchKitchenSupplierRecords({
  filters,
  page,
  pageSize,
}: {
  filters: KitchenSupplierRecordFilters;
  page: number;
  pageSize: number;
}) {
  const { data, error } = await supabase.rpc("get_kitchen_supplier_records", {
    p_single_date: filters.mode === "single" && filters.singleDate ? filters.singleDate : null,
    p_start_date: filters.mode === "range" && filters.startDate ? filters.startDate : null,
    p_end_date: filters.mode === "range" && filters.endDate ? filters.endDate : null,
    p_supplier_ids: filters.supplierIds.length ? filters.supplierIds : null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SupplierRecordRpcRow[];
  return {
    items: rows.map((row) => ({
      date: row.record_date,
      supplierId: row.supplier_id,
      supplierLegacyId: row.supplier_legacy_id,
      supplierName: row.supplier_name,
      categories: (row.category_amounts ?? []).map((category) => ({
        id: category.purchaseTypeId,
        legacyId: category.purchaseTypeLegacyId,
        name: category.name,
        amount: Number(category.amount ?? 0),
      })),
      total: Number(row.total_amount ?? 0),
    })) satisfies KitchenSupplierRecord[],
    total: Number(rows[0]?.total_count ?? 0),
  };
}

export async function saveKitchenSupplierRecord(input: {
  date: string;
  supplierId: string;
  amounts: Array<{ purchaseTypeId: string; amount: number }>;
  original?: { date: string; supplierId: string } | null;
}) {
  const { error } = await supabase.rpc("save_kitchen_supplier_record", {
    p_record_date: input.date,
    p_supplier_id: input.supplierId,
    p_amounts: input.amounts,
    p_original_date: input.original?.date ?? null,
    p_original_supplier_id: input.original?.supplierId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteKitchenSupplierRecord(input: { date: string; supplierId: string }) {
  const { error } = await supabase.rpc("delete_kitchen_supplier_record", {
    p_record_date: input.date,
    p_supplier_id: input.supplierId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchKitchenSupplierCostEntries({
  filters,
  page,
  pageSize,
}: {
  filters: KitchenSupplierRecordFilters;
  page: number;
  pageSize: number;
}) {
  const { data, error } = await supabase.rpc("get_kitchen_supplier_cost_entries", {
    p_single_date: filters.mode === "single" && filters.singleDate ? filters.singleDate : null,
    p_start_date: filters.mode === "range" && filters.startDate ? filters.startDate : null,
    p_end_date: filters.mode === "range" && filters.endDate ? filters.endDate : null,
    p_supplier_ids: filters.supplierIds.length ? filters.supplierIds : null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    record_date: string;
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
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      purchaseTypeId: row.purchase_type_id,
      purchaseTypeName: row.purchase_type_name,
      amount: Number(row.amount ?? 0),
    })) satisfies KitchenSupplierCostEntry[],
    total: Number(rows[0]?.total_count ?? 0),
  };
}

export async function updateKitchenSupplierCostEntry(id: string, amount: number) {
  const { error } = await supabase
    .from("supplier_purchases")
    .update({ amount, bubble_modified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteKitchenSupplierCostEntry(id: string) {
  const { error } = await supabase.from("supplier_purchases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
