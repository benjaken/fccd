import { supabase } from "@/lib/supabase";

export type ShippingMethod = {
  id: string;
  name: string;
  displayName: string;
  displayOrder: number | null;
  requiresAddressCheck: boolean;
  isEditable: boolean;
  isActive: boolean;
};

type MethodRow = {
  id: string;
  name: string;
  display_name: string | null;
  display_order: number | null;
  requires_address_check: boolean | null;
  is_editable: boolean | null;
  is_active: boolean;
};

function mapMethod(row: MethodRow): ShippingMethod {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    displayOrder: row.display_order,
    requiresAddressCheck: Boolean(row.requires_address_check),
    isEditable: row.is_editable !== false,
    isActive: row.is_active,
  };
}

const SELECT_FIELDS =
  "id,name,display_name,display_order,requires_address_check,is_editable,is_active";

export async function fetchShippingMethods(): Promise<ShippingMethod[]> {
  const { data, error } = await supabase
    .from("shipping_methods")
    .select(SELECT_FIELDS)
    .is("archived_at", null)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw error;
  return ((data ?? []) as MethodRow[]).map(mapMethod);
}

async function nextDisplayOrder() {
  const { data, error } = await supabase
    .from("shipping_methods")
    .select("display_order")
    .is("archived_at", null)
    .order("display_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const current =
    data && typeof data.display_order === "number" ? data.display_order : 0;
  return current + 1;
}

export async function createShippingMethod(input: {
  name: string;
  requiresAddressCheck?: boolean;
  isActive?: boolean;
}): Promise<ShippingMethod> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");

  const now = new Date().toISOString();
  const displayOrder = await nextDisplayOrder();
  const { data, error } = await supabase
    .from("shipping_methods")
    .insert({
      legacy_id: `web-shipping-method-${crypto.randomUUID()}`,
      name,
      display_name: name,
      display_order: displayOrder,
      requires_address_check: Boolean(input.requiresAddressCheck),
      is_editable: true,
      is_active: input.isActive !== false,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return mapMethod(data as MethodRow);
}

export async function updateShippingMethod(
  id: string,
  patch: {
    name?: string;
    requiresAddressCheck?: boolean;
    isActive?: boolean;
  },
): Promise<ShippingMethod> {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const { data: existing, error: existingError } = await supabase
      .from("shipping_methods")
      .select("is_editable")
      .eq("id", id)
      .is("archived_at", null)
      .single();
    if (existingError) throw existingError;
    if ((existing as { is_editable: boolean | null }).is_editable !== false) {
      const name = patch.name.trim();
      if (!name) throw new Error("name_required");
      updates.name = name;
      updates.display_name = name;
    }
  }
  if (patch.requiresAddressCheck !== undefined) {
    updates.requires_address_check = patch.requiresAddressCheck;
  }
  if (patch.isActive !== undefined) {
    updates.is_active = patch.isActive;
  }

  const { data, error } = Object.keys(updates).length
    ? await supabase
        .from("shipping_methods")
        .update(updates)
        .eq("id", id)
        .is("archived_at", null)
        .select(SELECT_FIELDS)
        .single()
    : await supabase
        .from("shipping_methods")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .is("archived_at", null)
        .single();
  if (error) throw error;
  return mapMethod(data as MethodRow);
}

export function sortShippingMethods(rows: readonly ShippingMethod[]) {
  return [...rows].sort((left, right) => {
    const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.displayName.localeCompare(right.displayName, "zh-Hant");
  });
}
