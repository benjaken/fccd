import { supabase } from "@/lib/supabase";

export type PaymentMethod = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string | null;
};

type MethodRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string | null;
};

function mapMethod(row: MethodRow): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

const SELECT_FIELDS = "id,name,is_active,created_at";

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select(SELECT_FIELDS)
    .is("archived_at", null)
    .order("created_at")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as MethodRow[]).map(mapMethod);
}

export async function createPaymentMethod(input: {
  name: string;
  isActive?: boolean;
}): Promise<PaymentMethod> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({
      legacy_id: `web-payment-method-${crypto.randomUUID()}`,
      name,
      is_active: input.isActive !== false,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return mapMethod(data as MethodRow);
}

export async function updatePaymentMethod(
  id: string,
  patch: {
    name?: string;
    isActive?: boolean;
  },
): Promise<PaymentMethod> {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("name_required");
    updates.name = name;
  }
  if (patch.isActive !== undefined) {
    updates.is_active = patch.isActive;
  }

  const { data, error } = Object.keys(updates).length
    ? await supabase
        .from("payment_methods")
        .update(updates)
        .eq("id", id)
        .is("archived_at", null)
        .select(SELECT_FIELDS)
        .single()
    : await supabase
        .from("payment_methods")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .is("archived_at", null)
        .single();
  if (error) throw error;
  return mapMethod(data as MethodRow);
}

export function sortPaymentMethods(rows: readonly PaymentMethod[]) {
  return [...rows].sort((left, right) => {
    const leftCreated = left.createdAt;
    const rightCreated = right.createdAt;
    if (leftCreated !== rightCreated) {
      if (!leftCreated) return 1;
      if (!rightCreated) return -1;
      return leftCreated.localeCompare(rightCreated);
    }
    return left.name.localeCompare(right.name, "zh-Hant");
  });
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

export function filterPaymentMethods(
  rows: readonly PaymentMethod[],
  search = "",
) {
  const term = search.trim();
  if (!term) return sortPaymentMethods(rows);
  return sortPaymentMethods(
    rows.filter((row) => includesIgnoreCase(row.name, term)),
  );
}
