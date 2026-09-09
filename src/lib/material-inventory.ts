import { supabase } from "@/lib/supabase";

export type MaterialInventoryKind = "ingredient" | "packing";

export type MaterialInventoryItem = {
  ingredientId: string;
  sku: string | null;
  name: string;
  ingredientType: string | null;
  unit: string | null;
  currentQuantity: number | null;
  minimumStock: number | null;
  lastActivityAt: string | null;
};

export type MaterialInventoryLedgerEntry = {
  id: string;
  type: "inbound" | "outbound" | "consumption" | "adjustment" | "stocktake";
  occurredAt: string | null;
  quantity: number | null;
  balanceAfter: number | null;
  reference: string | null;
  note: string | null;
};

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchMaterialInventory(
  kind: MaterialInventoryKind,
  search = "",
): Promise<MaterialInventoryItem[]> {
  const { data, error } = await supabase.rpc("material_inventory_summary", {
    p_kind: kind,
    p_search: search.trim() || null,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ingredientId: String(row.ingredient_id),
    sku: row.sku ? String(row.sku) : null,
    name: String(row.item_name ?? ""),
    ingredientType: row.ingredient_type ? String(row.ingredient_type) : null,
    unit: row.unit ? String(row.unit) : null,
    currentQuantity: numberOrNull(row.current_quantity as number | string | null),
    minimumStock: numberOrNull(row.minimum_stock as number | string | null),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  }));
}

export async function fetchMaterialInventoryLedger(
  kind: MaterialInventoryKind,
  ingredientId: string,
): Promise<MaterialInventoryLedgerEntry[]> {
  const { data, error } = await supabase.rpc("material_inventory_ledger", {
    p_kind: kind,
    p_ingredient_id: ingredientId,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.movement_id),
    type: String(row.movement_type) as MaterialInventoryLedgerEntry["type"],
    occurredAt: row.occurred_at ? String(row.occurred_at) : null,
    quantity: numberOrNull(row.quantity as number | string | null),
    balanceAfter: numberOrNull(row.balance_after as number | string | null),
    reference: row.reference ? String(row.reference) : null,
    note: row.note ? String(row.note) : null,
  }));
}

export async function correctMaterialCurrentStock(input: {
  kind: MaterialInventoryKind;
  ingredientId: string;
  quantity: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("correct_material_current_stock", {
    p_kind: input.kind,
    p_ingredient_id: input.ingredientId,
    p_quantity: input.quantity,
    p_reason: input.reason,
  });
  if (error) throw error;
  return String(data);
}
