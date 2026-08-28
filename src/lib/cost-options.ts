import { supabase } from "@/lib/supabase";

export type CostOption = {
  id: string;
  name: string;
  isAdvertising: boolean;
  isBrand: boolean;
  isActive: boolean;
  createdAt: string | null;
};

export type CostOptionInput = Pick<
  CostOption,
  "name" | "isAdvertising" | "isBrand" | "isActive"
>;

type CostOptionRow = {
  id: string;
  name: string;
  is_advertising: boolean;
  is_brand: boolean;
  is_active: boolean;
  created_at: string | null;
};

function mapCostOption(row: CostOptionRow): CostOption {
  return {
    id: row.id,
    name: row.name,
    isAdvertising: row.is_advertising,
    isBrand: row.is_brand,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function sortCostOptions(rows: readonly CostOption[]) {
  return [...rows].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.MAX_SAFE_INTEGER;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.name.localeCompare(right.name, "zh-Hant");
  });
}

export function filterCostOptions(rows: readonly CostOption[], search = "") {
  const term = search.trim().toLocaleLowerCase("zh-HK");
  if (!term) return [...rows];
  return rows.filter((row) =>
    row.name.toLocaleLowerCase("zh-HK").includes(term),
  );
}

export async function fetchCostOptions(): Promise<CostOption[]> {
  const { data, error } = await supabase
    .from("cost_types")
    .select("id,name,is_advertising,is_brand,is_active,created_at")
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return sortCostOptions(((data ?? []) as CostOptionRow[]).map(mapCostOption));
}

export async function createCostOption(input: CostOptionInput): Promise<CostOption> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cost_types")
    .insert({
      legacy_id: `web-cost-type-${crypto.randomUUID()}`,
      name,
      is_advertising: input.isAdvertising,
      is_brand: input.isBrand,
      is_active: input.isActive,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id,name,is_advertising,is_brand,is_active,created_at")
    .single();
  if (error) throw error;
  return mapCostOption(data as CostOptionRow);
}

export async function updateCostOption(
  id: string,
  input: Partial<CostOptionInput>,
): Promise<CostOption> {
  const changes: Record<string, unknown> = {
    bubble_modified_at: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("name_required");
    changes.name = name;
  }
  if (input.isAdvertising !== undefined) {
    changes.is_advertising = input.isAdvertising;
  }
  if (input.isBrand !== undefined) changes.is_brand = input.isBrand;
  if (input.isActive !== undefined) changes.is_active = input.isActive;

  const { data, error } = await supabase
    .from("cost_types")
    .update(changes)
    .eq("id", id)
    .select("id,name,is_advertising,is_brand,is_active,created_at")
    .single();
  if (error) throw error;
  return mapCostOption(data as CostOptionRow);
}
