import { supabase } from "@/lib/supabase";

export type SeasoningOption = {
  id: string;
  name: string;
  sortOrder: number | null;
};

export type SeasoningUsageRow = {
  id: string;
  preparedMeatItemId: string;
  preparedMeatName: string;
  preparedSortOrder: number | null;
  quantityGrams: number;
  totalCost: number;
};

type SeasoningRow = {
  id: string;
  name: string;
  sort_order: number | string | null;
};

type UsageRow = {
  id: string;
  seasoning_quantity_grams: number | string | null;
  total_cost: number | string | null;
  version_code: number | string | null;
  prepared_meat_items:
    | {
        id: string;
        name: string;
        sort_order: number | string | null;
      }
    | {
        id: string;
        name: string;
        sort_order: number | string | null;
      }[]
    | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function relatedPrepared(value: UsageRow["prepared_meat_items"]) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchSeasonings(): Promise<SeasoningOption[]> {
  const { data, error } = await supabase
    .from("seasonings")
    .select("id,name,sort_order")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as SeasoningRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: toNumber(row.sort_order),
  }));
}

/** Applied seasoning usages for one spice, one row per prepared meat item. */
export async function fetchSeasoningUsages(
  seasoningId: string,
): Promise<SeasoningUsageRow[]> {
  const { data, error } = await supabase
    .from("meat_seasoning_cost_versions")
    .select(
      "id,seasoning_quantity_grams,total_cost,version_code,prepared_meat_items(id,name,sort_order)",
    )
    .eq("seasoning_id", seasoningId)
    .eq("is_applied", true)
    .not("prepared_meat_item_id", "is", null);

  if (error) throw error;

  const byPrepared = new Map<
    string,
    SeasoningUsageRow & { versionCode: number | null }
  >();

  for (const row of (data ?? []) as UsageRow[]) {
    const prepared = relatedPrepared(row.prepared_meat_items);
    if (!prepared?.id) continue;

    const versionCode = toNumber(row.version_code);
    const next = {
      id: row.id,
      preparedMeatItemId: prepared.id,
      preparedMeatName: prepared.name,
      preparedSortOrder: toNumber(prepared.sort_order),
      quantityGrams: toNumber(row.seasoning_quantity_grams) ?? 0,
      totalCost: toNumber(row.total_cost) ?? 0,
      versionCode,
    };

    const current = byPrepared.get(prepared.id);
    if (
      !current ||
      (versionCode !== null &&
        (current.versionCode === null || versionCode > current.versionCode))
    ) {
      byPrepared.set(prepared.id, next);
    }
  }

  return [...byPrepared.values()]
    .map(({ versionCode: _versionCode, ...row }) => row)
    .sort((left, right) => {
      const leftSort = left.preparedSortOrder;
      const rightSort = right.preparedSortOrder;
      if (leftSort !== rightSort) {
        if (leftSort === null) return 1;
        if (rightSort === null) return -1;
        return leftSort - rightSort;
      }
      return left.preparedMeatName.localeCompare(
        right.preparedMeatName,
        "zh-HK",
      );
    });
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "")
    .toLocaleLowerCase("zh-HK")
    .includes(needle.toLocaleLowerCase("zh-HK"));
}

export function filterSeasonings(rows: SeasoningOption[], search = "") {
  const query = search.trim();
  if (!query) return rows;
  return rows.filter((row) => includesIgnoreCase(row.name, query));
}

export function filterSeasoningUsages(rows: SeasoningUsageRow[], search = "") {
  const query = search.trim();
  if (!query) return rows;
  return rows.filter((row) => includesIgnoreCase(row.preparedMeatName, query));
}

export async function unapplySeasoningUsage(versionId: string): Promise<void> {
  const { error } = await supabase.rpc("unapply_meat_seasoning_cost_version", {
    p_version_id: versionId,
  });
  if (error) throw error;
}
