import { supabase } from "@/lib/supabase";

export const YIELD_ERRORS_PAGE_SIZE = 15;

export type MeatYieldErrorDirection = "over" | "under";

export type MeatYieldErrorListItem = {
  id: string;
  productionAt: string;
  rawMeatName: string | null;
  preparedMeatName: string | null;
  rawInputKg: number;
  expectedPacks: number;
  actualPacks: number;
  deviationPacks: number;
  deviationRatio: number;
  direction: MeatYieldErrorDirection;
  remarks: string | null;
};

export type MeatYieldErrorListFilters = {
  page: number;
  search: string;
  direction: "" | MeatYieldErrorDirection;
};

export type MeatYieldErrorListResult = {
  total: number;
  items: MeatYieldErrorListItem[];
};

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function fetchMeatYieldErrors({
  page,
  search,
  direction,
}: MeatYieldErrorListFilters): Promise<MeatYieldErrorListResult> {
  const start = (page - 1) * YIELD_ERRORS_PAGE_SIZE;
  const end = start + YIELD_ERRORS_PAGE_SIZE - 1;
  let query = supabase
    .from("meat_yield_errors")
    .select(
      "id,production_at,raw_meat_name_snapshot,prepared_meat_name_snapshot,raw_input_kg,expected_packs,actual_packs,deviation_packs,deviation_ratio,deviation_direction,remarks",
      { count: "exact" },
    )
    .order("production_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  if (direction === "over" || direction === "under") {
    query = query.eq("deviation_direction", direction);
  }

  const term = search.replace(/[^\p{L}\p{N}\s@._+\-#]/gu, " ").trim();
  if (term) {
    query = query.or(
      `raw_meat_name_snapshot.ilike.%${term}%,prepared_meat_name_snapshot.ilike.%${term}%,remarks.ilike.%${term}%`,
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    total: count ?? 0,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      productionAt: String(row.production_at),
      rawMeatName: row.raw_meat_name_snapshot,
      preparedMeatName: row.prepared_meat_name_snapshot,
      rawInputKg: toNumber(row.raw_input_kg),
      expectedPacks: toNumber(row.expected_packs),
      actualPacks: toNumber(row.actual_packs),
      deviationPacks: toNumber(row.deviation_packs),
      deviationRatio: toNumber(row.deviation_ratio),
      direction: row.deviation_direction === "over" ? "over" : "under",
      remarks: row.remarks,
    })),
  };
}
