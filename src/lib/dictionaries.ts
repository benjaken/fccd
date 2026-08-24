import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export const DICTIONARIES_CHANGED = "fccd:dictionaries-changed";

export const DICT_TYPE = {
  ingredientType: "ingredient_type",
  restaurantStaffDepartment: "restaurant_staff_department",
  restaurantEmploymentType: "restaurant_employment_type",
  restaurantInventoryDepartment: "restaurant_inventory_department",
  restaurantStocktakeDepartment: "restaurant_stocktake_department",
  deliveryTimeSlot: "delivery_time_slot",
  shipOutTimeSlot: "ship_out_time_slot",
  quoteTermTemplate: "quote_term_template",
  quotePaymentTemplate: "quote_payment_template",
  quoteAdditionalInfo: "quote_additional_info",
  quoteActivity: "quote_activity",
  quoteStatus: "quote_status",
  restaurantMonthlyPnlCategory: "restaurant_monthly_pnl_category",
  kitchenAdvertisingFestival: "kitchen_advertising_festival",
  orderManualTodo: "order_manual_todo",
  supplierQuotePriceUnit: "supplier_quote_price_unit",
  catalogStatus: "catalog_status",
  productPriceRange: "product_price_range",
} as const;

export type DictType = {
  id: string;
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

export type DictItem = {
  id: string;
  dictTypeId: string;
  value: string;
  label: string;
  labelEn: string | null;
  description: string;
  metadata: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
};

export type DictTypeWriteInput = {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type DictItemWriteInput = {
  value: string;
  label: string;
  labelEn?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  isActive?: boolean;
};

type DictTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type DictItemRow = {
  id: string;
  dict_type_id: string;
  value: string;
  label: string;
  label_en: string | null;
  description: string | null;
  metadata: unknown;
  sort_order: number;
  is_active: boolean;
};

const TYPE_FIELDS = "id,code,name,description,sort_order,is_active";
const ITEM_FIELDS =
  "id,dict_type_id,value,label,label_en,description,metadata,sort_order,is_active";

function mapType(row: DictTypeRow): DictType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description?.trim() ?? "",
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function mapItem(row: DictItemRow): DictItem {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    dictTypeId: row.dict_type_id,
    value: row.value,
    label: row.label,
    labelEn: row.label_en,
    description: row.description?.trim() ?? "",
    metadata,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function requireText(value: string, errorCode: string) {
  const next = value.trim();
  if (!next) throw new Error(errorCode);
  return next;
}

function notifyDictionariesChanged(typeCode?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DICTIONARIES_CHANGED, { detail: { typeCode } }),
  );
}

export async function fetchDictTypes(options: { includeInactive?: boolean } = {}) {
  let query = supabase
    .from("dict_types")
    .select(TYPE_FIELDS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as DictTypeRow[]).map(mapType);
}

export async function fetchDictItems(
  typeCode: string,
  options: { includeInactive?: boolean } = {},
): Promise<DictItem[]> {
  const { data: typeData, error: typeError } = await supabase
    .from("dict_types")
    .select("id,is_active")
    .eq("code", typeCode)
    .maybeSingle();
  if (typeError) throw typeError;
  if (!typeData || (!options.includeInactive && !typeData.is_active)) return [];

  let query = supabase
    .from("dict_items")
    .select(ITEM_FIELDS)
    .eq("dict_type_id", typeData.id)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as DictItemRow[]).map(mapItem);
}

export async function fetchDictItemsByTypeId(
  dictTypeId: string,
  options: { includeInactive?: boolean } = {},
) {
  let query = supabase
    .from("dict_items")
    .select(ITEM_FIELDS)
    .eq("dict_type_id", dictTypeId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as DictItemRow[]).map(mapItem);
}

export async function createDictType(input: DictTypeWriteInput) {
  const code = requireText(input.code, "code_required").toLowerCase();
  const name = requireText(input.name, "name_required");
  const { data, error } = await supabase
    .from("dict_types")
    .insert({
      code,
      name,
      description: input.description?.trim() ?? "",
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
    })
    .select(TYPE_FIELDS)
    .single();
  if (error) throw error;
  notifyDictionariesChanged(code);
  return mapType(data as DictTypeRow);
}

export async function updateDictType(id: string, input: DictTypeWriteInput) {
  const code = requireText(input.code, "code_required").toLowerCase();
  const name = requireText(input.name, "name_required");
  const { data, error } = await supabase
    .from("dict_types")
    .update({
      code,
      name,
      description: input.description?.trim() ?? "",
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(TYPE_FIELDS)
    .single();
  if (error) throw error;
  notifyDictionariesChanged(code);
  return mapType(data as DictTypeRow);
}

export async function createDictItem(dictTypeId: string, input: DictItemWriteInput) {
  const value = requireText(input.value, "value_required");
  const label = requireText(input.label, "label_required");
  const { data, error } = await supabase
    .from("dict_items")
    .insert({
      dict_type_id: dictTypeId,
      value,
      label,
      label_en: input.labelEn?.trim() || null,
      description: input.description?.trim() ?? "",
      metadata: input.metadata ?? {},
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
    })
    .select(ITEM_FIELDS)
    .single();
  if (error) throw error;
  notifyDictionariesChanged();
  return mapItem(data as DictItemRow);
}

export async function updateDictItem(id: string, input: DictItemWriteInput) {
  const value = requireText(input.value, "value_required");
  const label = requireText(input.label, "label_required");
  const { data, error } = await supabase
    .from("dict_items")
    .update({
      value,
      label,
      label_en: input.labelEn?.trim() || null,
      description: input.description?.trim() ?? "",
      metadata: input.metadata ?? {},
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(ITEM_FIELDS)
    .single();
  if (error) throw error;
  notifyDictionariesChanged();
  return mapItem(data as DictItemRow);
}

export function dictItemLabel(item: DictItem, language: string) {
  return language.toLowerCase().startsWith("en") && item.labelEn
    ? item.labelEn
    : item.label;
}

export function dictSelectOptions(
  items: readonly DictItem[],
  language: string,
  currentValue?: string | null,
) {
  const options = items.map((item) => ({
    value: item.value,
    label: dictItemLabel(item, language),
    metadata: item.metadata,
  }));
  const current = currentValue?.trim();
  if (current && !options.some((item) => item.value === current)) {
    options.push({ value: current, label: current, metadata: {} });
  }
  return options;
}

export function useDictItems(typeCode: string) {
  const [items, setItems] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      setError(null);
      void fetchDictItems(typeCode)
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setItems([]);
            setError(loadError);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    const onChanged = (event: Event) => {
      const changedType = (event as CustomEvent<{ typeCode?: string }>).detail
        ?.typeCode;
      if (!changedType || changedType === typeCode) load();
    };
    load();
    window.addEventListener(DICTIONARIES_CHANGED, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(DICTIONARIES_CHANGED, onChanged);
    };
  }, [reloadKey, typeCode]);

  return { items, loading, error, reload };
}
