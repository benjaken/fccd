import { supabase } from "@/lib/supabase";

export const COOK_TYPE_WORKLOAD_MIN = 1;
export const COOK_TYPE_WORKLOAD_MAX = 5;

export type CookTypeRow = {
  id: string;
  name: string;
  workloadScore: number | null;
};

type CookTypeRecord = {
  id: string;
  name: string;
  workload_score: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: CookTypeRecord): CookTypeRow {
  return {
    id: row.id,
    name: row.name,
    workloadScore: toNumber(row.workload_score),
  };
}

export function formatWorkloadScore(score: number | null) {
  if (score === null) return "";
  return Number.isInteger(score) ? String(score) : String(score);
}

export function parseWorkloadScore(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[1-5]$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export function filterCookTypes(rows: CookTypeRow[], search = "") {
  const query = search.trim().toLocaleLowerCase("zh-HK");
  if (!query) return rows;
  return rows.filter((row) => {
    const name = row.name.toLocaleLowerCase("zh-HK");
    const score = formatWorkloadScore(row.workloadScore).toLocaleLowerCase(
      "zh-HK",
    );
    return name.includes(query) || score.includes(query);
  });
}

export async function fetchCookTypes(): Promise<CookTypeRow[]> {
  const { data, error } = await supabase
    .from("cook_types")
    .select("id,name,workload_score")
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as CookTypeRecord[]).map(mapRow);
}

export async function createCookType(input: {
  name: string;
  workloadScore: number;
}): Promise<CookTypeRow> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  if (
    !Number.isInteger(input.workloadScore) ||
    input.workloadScore < COOK_TYPE_WORKLOAD_MIN ||
    input.workloadScore > COOK_TYPE_WORKLOAD_MAX
  ) {
    throw new Error("workload_out_of_range");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cook_types")
    .insert({
      legacy_id: `web-cook-type-${crypto.randomUUID()}`,
      name,
      workload_score: input.workloadScore,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id,name,workload_score")
    .single();

  if (error) throw error;
  return mapRow(data as CookTypeRecord);
}

export async function deleteCookType(cookTypeId: string): Promise<void> {
  const { error } = await supabase
    .from("cook_types")
    .delete()
    .eq("id", cookTypeId);

  if (error) {
    if (error.code === "23503") throw new Error("cook_type_in_use");
    throw error;
  }
}
