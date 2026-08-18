import { supabase } from "@/lib/supabase";

export const INGREDIENTS_PAGE_SIZE = 15;

export type IngredientSortField = "name" | "sku" | "cost" | "createdAt";
export type IngredientStatusFilter = "" | "active" | "inactive";

export type IngredientListItem = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  ingredientType: string | null;
  productUnit: string | null;
  stocktakeUnit: string | null;
  productQuantity: number | null;
  costPerProductUnit: number | null;
  costPerStocktakeUnit: number | null;
  isActive: boolean;
  isIngredientStocktake: boolean;
  isPackingStocktake: boolean;
  supplierId: string | null;
  supplierName: string | null;
  createdAt: string;
};

export type IngredientListResult = {
  items: IngredientListItem[];
  total: number;
};

export type IngredientListFilters = {
  page: number;
  search: string;
  status: IngredientStatusFilter;
  sortField: IngredientSortField;
  sortAscending: boolean;
};

export type IngredientWriteInput = {
  sku: string | null;
  name: string;
  description: string | null;
  ingredientType: string | null;
  productUnit: string | null;
  stocktakeUnit: string | null;
  productQuantity: number | null;
  costPerProductUnit: number | null;
  costPerStocktakeUnit: number | null;
  isActive: boolean;
  isIngredientStocktake: boolean;
  isPackingStocktake: boolean;
  supplierId: string | null;
};

type IngredientDbRow = {
  id: string;
  legacy_id: string;
  supplier_id: string | null;
  supplier_legacy_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  ingredient_type: string | null;
  product_unit: string | null;
  stocktake_unit: string | null;
  product_quantity: number | string | null;
  cost_per_product_unit: number | string | null;
  cost_per_stocktake_unit: number | string | null;
  is_active: boolean;
  is_ingredient_stocktake: boolean | null;
  is_packing_stocktake: boolean | null;
  bubble_created_at: string | null;
  bubble_modified_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  suppliers?: { id: string; company_name: string | null } | { id: string; company_name: string | null }[] | null;
};

const INGREDIENT_SELECT_FIELDS =
  "id,legacy_id,supplier_id,supplier_legacy_id,sku,name,description,ingredient_type,product_unit,stocktake_unit,product_quantity,cost_per_product_unit,cost_per_stocktake_unit,is_active,is_ingredient_stocktake,is_packing_stocktake,bubble_created_at,bubble_modified_at,created_at,updated_at,archived_at,suppliers(id,company_name)";

const SORT_COLUMNS: Record<IngredientSortField, string> = {
  name: "name",
  sku: "sku",
  cost: "cost_per_product_unit",
  createdAt: "created_at",
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-_.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relatedRecord<T extends { id: string }>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapIngredient(row: IngredientDbRow): IngredientListItem {
  const supplier = relatedRecord(row.suppliers);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    ingredientType: row.ingredient_type,
    productUnit: row.product_unit,
    stocktakeUnit: row.stocktake_unit,
    productQuantity: toNumber(row.product_quantity),
    costPerProductUnit: toNumber(row.cost_per_product_unit),
    costPerStocktakeUnit: toNumber(row.cost_per_stocktake_unit),
    isActive: row.is_active,
    isIngredientStocktake: row.is_ingredient_stocktake ?? false,
    isPackingStocktake: row.is_packing_stocktake ?? false,
    supplierId: row.supplier_id ?? supplier?.id ?? null,
    supplierName: supplier?.company_name ?? null,
    createdAt: row.bubble_created_at || row.created_at,
  };
}

export async function fetchIngredients({
  page,
  search,
  status,
  sortField,
  sortAscending,
}: IngredientListFilters): Promise<IngredientListResult> {
  const start = (page - 1) * INGREDIENTS_PAGE_SIZE;
  const end = start + INGREDIENTS_PAGE_SIZE - 1;

  let query = supabase
    .from("ingredients")
    .select(INGREDIENT_SELECT_FIELDS, { count: "exact" })
    .is("archived_at", null);

  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,description.ilike.%${term}%,ingredient_type.ilike.%${term}%`,
    );
  }

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

  query = query.range(start, end);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as IngredientDbRow[]).map(mapIngredient),
    total: count ?? 0,
  };
}

export async function fetchSupplierOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,company_name")
    .is("archived_at", null)
    .order("company_name", { ascending: true });
  if (error) return [];
  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      name: (row.company_name as string | null) ?? "",
    }))
    .filter((item) => item.name)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));
}

function writeFields(input: IngredientWriteInput) {
  const name = input.name.trim();
  if (!name) throw new Error("ingredient_name_required");
  const clean = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    sku: clean(input.sku),
    name,
    description: clean(input.description),
    ingredient_type: clean(input.ingredientType),
    product_unit: clean(input.productUnit),
    stocktake_unit: clean(input.stocktakeUnit),
    product_quantity: input.productQuantity,
    cost_per_product_unit: input.costPerProductUnit,
    cost_per_stocktake_unit: input.costPerStocktakeUnit,
    is_active: input.isActive,
    is_ingredient_stocktake: input.isIngredientStocktake,
    is_packing_stocktake: input.isPackingStocktake,
    supplier_id: input.supplierId,
  };
}

export async function createIngredient(
  input: IngredientWriteInput,
): Promise<IngredientListItem> {
  const fields = writeFields(input);
  const now = new Date().toISOString();
  const legacyId = `web-ingredient-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      legacy_id: legacyId,
      ...fields,
      bubble_created_at: now,
      bubble_modified_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(INGREDIENT_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapIngredient(data as IngredientDbRow);
}

export async function updateIngredient(
  ingredientId: string,
  input: IngredientWriteInput,
): Promise<IngredientListItem> {
  const fields = writeFields(input);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("ingredients")
    .update({
      ...fields,
      bubble_modified_at: now,
      updated_at: now,
    })
    .eq("id", ingredientId)
    .select(INGREDIENT_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapIngredient(data as IngredientDbRow);
}

export async function archiveIngredient(ingredientId: string): Promise<void> {
  const { error } = await supabase
    .from("ingredients")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingredientId);
  if (error) throw error;
}
