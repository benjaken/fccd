import { supabase } from "@/lib/supabase";

export const MEAT_YIELD_ERRORS_PAGE_SIZE = 15;

export type MeatYieldErrorRow = {
  id: string;
  productionAt: string | null;
  rawMeatName: string | null;
  preparedMeatName: string | null;
  rawInputKg: number | null;
  expectedPacks: number | null;
  actualPacks: number | null;
  deviationPacks: number | null;
  deviationRatio: number | null;
  deviationDirection: "over" | "under" | null;
};

export type MeatYieldErrorListFilters = {
  page: number;
  search?: string;
};

export type MeatYieldErrorListResult = {
  items: MeatYieldErrorRow[];
  total: number;
};

type YieldErrorRecord = {
  id: string;
  production_at: string | null;
  raw_meat_name_snapshot: string | null;
  prepared_meat_name_snapshot: string | null;
  raw_input_kg: number | string | null;
  expected_packs: number | string | null;
  actual_packs: number | string | null;
  deviation_packs: number | string | null;
  deviation_ratio: number | string | null;
  deviation_direction: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapRow(row: YieldErrorRecord): MeatYieldErrorRow {
  const direction = row.deviation_direction === "over" || row.deviation_direction === "under"
    ? row.deviation_direction
    : null;
  return {
    id: row.id,
    productionAt: row.production_at,
    rawMeatName: row.raw_meat_name_snapshot?.trim() || null,
    preparedMeatName: row.prepared_meat_name_snapshot?.trim() || null,
    rawInputKg: toNumber(row.raw_input_kg),
    expectedPacks: toNumber(row.expected_packs),
    actualPacks: toNumber(row.actual_packs),
    deviationPacks: toNumber(row.deviation_packs),
    deviationRatio: toNumber(row.deviation_ratio),
    deviationDirection: direction,
  };
}

export async function fetchMeatYieldErrors({
  page,
  search,
}: MeatYieldErrorListFilters): Promise<MeatYieldErrorListResult> {
  const start = (page - 1) * MEAT_YIELD_ERRORS_PAGE_SIZE;
  const end = start + MEAT_YIELD_ERRORS_PAGE_SIZE - 1;
  let query = supabase
    .from("meat_yield_errors")
    .select(
      "id,production_at,raw_meat_name_snapshot,prepared_meat_name_snapshot,raw_input_kg,expected_packs,actual_packs,deviation_packs,deviation_ratio,deviation_direction",
      { count: "exact" },
    )
    .order("production_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search ?? "");
  if (term) {
    query = query.or(
      `raw_meat_name_snapshot.ilike.%${term}%,prepared_meat_name_snapshot.ilike.%${term}%`,
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as YieldErrorRecord[]).map(mapRow),
    total: count ?? 0,
  };
}
