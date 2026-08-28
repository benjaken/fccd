import { supabase } from "@/lib/supabase";

export type SupplierExpenseOption = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string | null;
};

export type SupplierExpenseOptionInput = Pick<
  SupplierExpenseOption,
  "name" | "isActive"
>;

type SupplierExpenseOptionRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string | null;
};

function mapOption(row: SupplierExpenseOptionRow): SupplierExpenseOption {
  return {
    id: row.id,
    name: row.name.trim(),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function sortSupplierExpenseOptions(
  rows: readonly SupplierExpenseOption[],
) {
  return [...rows].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.MAX_SAFE_INTEGER;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.name.localeCompare(right.name, "zh-Hant");
  });
}

export function filterSupplierExpenseOptions(
  rows: readonly SupplierExpenseOption[],
  search = "",
) {
  const term = search.trim().toLocaleLowerCase("zh-HK");
  if (!term) return [...rows];
  return rows.filter((row) =>
    row.name.toLocaleLowerCase("zh-HK").includes(term),
  );
}

export async function fetchSupplierExpenseOptions(): Promise<
  SupplierExpenseOption[]
> {
  const { data, error } = await supabase
    .from("purchase_types")
    .select("id,name,is_active,created_at")
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return sortSupplierExpenseOptions(
    ((data ?? []) as SupplierExpenseOptionRow[]).map(mapOption),
  );
}

export async function createSupplierExpenseOption(
  input: SupplierExpenseOptionInput,
): Promise<SupplierExpenseOption> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("purchase_types")
    .insert({
      legacy_id: `web-purchase-type-${crypto.randomUUID()}`,
      name,
      is_active: input.isActive,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id,name,is_active,created_at")
    .single();
  if (error) throw error;
  return mapOption(data as SupplierExpenseOptionRow);
}

export async function updateSupplierExpenseOption(
  id: string,
  input: Partial<SupplierExpenseOptionInput>,
): Promise<SupplierExpenseOption> {
  const changes: Record<string, unknown> = {
    bubble_modified_at: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("name_required");
    changes.name = name;
  }
  if (input.isActive !== undefined) changes.is_active = input.isActive;

  const { data, error } = await supabase
    .from("purchase_types")
    .update(changes)
    .eq("id", id)
    .select("id,name,is_active,created_at")
    .single();
  if (error) throw error;
  return mapOption(data as SupplierExpenseOptionRow);
}
