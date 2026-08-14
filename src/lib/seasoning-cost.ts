import { supabase } from "@/lib/supabase";
import { evaluateSeasoningExpression } from "@/lib/seasoning-expression";

export const SEASONING_COST_PAGE_SIZE = 15;

export type SeasoningCostRow = {
  id: string;
  name: string;
  description: string | null;
  calculationExpression: string | null;
  costPerGram: number | null;
  lastUpdatedAt: string | null;
  sortOrder: number | null;
};

type SeasoningRow = {
  id: string;
  name: string;
  description: string | null;
  calculation_expression: string | null;
  cost_per_gram: number | string | null;
  last_updated_at: string | null;
  sort_order: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: SeasoningRow): SeasoningCostRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    calculationExpression: row.calculation_expression,
    costPerGram: toNumber(row.cost_per_gram),
    lastUpdatedAt: row.last_updated_at,
    sortOrder: toNumber(row.sort_order),
  };
}

export async function fetchSeasoningCosts(): Promise<SeasoningCostRow[]> {
  const { data, error } = await supabase
    .from("seasonings")
    .select(
      "id,name,description,calculation_expression,cost_per_gram,last_updated_at,sort_order",
    )
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as SeasoningRow[]).map(mapRow);
}

export async function createSeasoningCost(input: {
  name: string;
  calculationExpression: string;
  description?: string | null;
}): Promise<SeasoningCostRow> {
  const name = input.name.trim();
  const expression = input.calculationExpression.trim();
  if (!name) throw new Error("name_required");
  if (!expression) throw new Error("expression_required");

  const costPerGram = evaluateSeasoningExpression(expression);
  const description =
    input.description === undefined
      ? null
      : nullifTrim(input.description);

  const { data: maxRow, error: maxError } = await supabase
    .from("seasonings")
    .select("sort_order")
    .is("archived_at", null)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;

  const nextSort = (toNumber(maxRow?.sort_order) ?? 0) + 1;
  const now = new Date().toISOString();
  const legacyId = `web-seasoning-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("seasonings")
    .insert({
      legacy_id: legacyId,
      name,
      description,
      calculation_expression: expression,
      cost_per_gram: costPerGram,
      last_updated_at: now,
      sort_order: nextSort,
      updated_at: now,
    })
    .select(
      "id,name,description,calculation_expression,cost_per_gram,last_updated_at,sort_order",
    )
    .single();

  if (error) throw error;
  return mapRow(data as SeasoningRow);
}

export async function updateSeasoningCalculation(
  seasoningId: string,
  calculationExpression: string,
): Promise<SeasoningCostRow> {
  const expression = calculationExpression.trim();
  if (!expression) throw new Error("expression_required");
  const costPerGram = evaluateSeasoningExpression(expression);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("seasonings")
    .update({
      calculation_expression: expression,
      cost_per_gram: costPerGram,
      last_updated_at: now,
      updated_at: now,
    })
    .eq("id", seasoningId)
    .select(
      "id,name,description,calculation_expression,cost_per_gram,last_updated_at,sort_order",
    )
    .single();

  if (error) throw error;
  return mapRow(data as SeasoningRow);
}

export async function updateSeasoningRemark(
  seasoningId: string,
  description: string,
): Promise<string | null> {
  const next = nullifTrim(description);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("seasonings")
    .update({
      description: next,
      updated_at: now,
    })
    .eq("id", seasoningId)
    .select("description")
    .single();

  if (error) throw error;
  return (data as { description: string | null }).description;
}

function nullifTrim(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "")
    .toLocaleLowerCase("zh-HK")
    .includes(needle.toLocaleLowerCase("zh-HK"));
}

export function filterSeasoningCosts(
  rows: SeasoningCostRow[],
  search = "",
) {
  const query = search.trim();
  if (!query) return rows;
  return rows.filter(
    (row) =>
      includesIgnoreCase(row.name, query) ||
      includesIgnoreCase(row.calculationExpression, query) ||
      includesIgnoreCase(row.description, query) ||
      includesIgnoreCase(
        row.costPerGram === null ? "" : String(row.costPerGram),
        query,
      ),
  );
}

export async function archiveSeasoningCost(seasoningId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_seasoning", {
    p_seasoning_id: seasoningId,
  });
  if (error) throw error;
}
