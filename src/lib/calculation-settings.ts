import { supabase } from "@/lib/supabase";

export type CalculationSettingRow = {
  id: string;
  isApplied: boolean;
  markupRate: number | null;
  variationRate: number | null;
  createdAt: string | null;
};

type SettingRow = {
  id: string;
  is_applied: boolean | null;
  markup_rate: number | string | null;
  variation_rate: number | string | null;
  bubble_created_at: string | null;
  created_at: string;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: SettingRow): CalculationSettingRow {
  return {
    id: row.id,
    isApplied: Boolean(row.is_applied),
    markupRate: toNumber(row.markup_rate),
    variationRate: toNumber(row.variation_rate),
    createdAt: row.bubble_created_at || row.created_at || null,
  };
}

/** Convert UI percent (e.g. 15) to stored fraction (0.15). */
export function percentToRate(percent: number) {
  return percent / 100;
}

/** Convert stored fraction (0.15) to UI percent (15). */
export function rateToPercent(rate: number) {
  return rate * 100;
}

export async function fetchCalculationSettings(): Promise<
  CalculationSettingRow[]
> {
  const { data, error } = await supabase
    .from("meat_calculation_settings")
    .select(
      "id,is_applied,markup_rate,variation_rate,bubble_created_at,created_at",
    )
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as SettingRow[]).map(mapRow);
}

export async function createCalculationSetting(input: {
  variationPercent: number;
  markupPercent: number;
}): Promise<CalculationSettingRow> {
  if (!Number.isFinite(input.variationPercent)) {
    throw new Error("variation_required");
  }
  if (!Number.isFinite(input.markupPercent)) {
    throw new Error("markup_required");
  }

  const now = new Date().toISOString();
  const legacyId = `web-calc-setting-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("meat_calculation_settings")
    .insert({
      legacy_id: legacyId,
      is_applied: false,
      variation_rate: percentToRate(input.variationPercent),
      markup_rate: percentToRate(input.markupPercent),
      bubble_created_at: now,
      bubble_modified_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id,is_applied,markup_rate,variation_rate,bubble_created_at,created_at",
    )
    .single();

  if (error) throw error;
  return mapRow(data as SettingRow);
}

/**
 * Activate or deactivate a calculation setting.
 * Activating one deactivates all others (single active rule).
 */
export async function setCalculationSettingApplied(
  settingId: string,
  isApplied: boolean,
): Promise<CalculationSettingRow[]> {
  const { data, error } = await supabase.rpc(
    "set_meat_calculation_setting_applied",
    {
      p_setting_id: settingId,
      p_is_applied: isApplied,
    },
  );
  if (error) throw error;

  // RPC returns the updated row; reload list for consistent ordering.
  void data;
  return fetchCalculationSettings();
}
