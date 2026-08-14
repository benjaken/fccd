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

const PERCENT_INPUT_PATTERN =
  /^(?:100(?:\.0{0,2})?|\d{0,2}(?:\.\d{0,2})?)$/;

export function isPercentInput(value: string) {
  return PERCENT_INPUT_PATTERN.test(value);
}

/** Keep 0-100 with at most two decimal places while typing. */
export function coercePercentInput(value: string): string {
  if (isPercentInput(value)) return value;
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(
    /^0+(?=\d)/,
    "",
  );
  const frac =
    dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const intNum = intDigits === "" ? 0 : Number.parseInt(intDigits, 10);
  if (!Number.isFinite(intNum) || intNum > 100) return "100";
  if (intNum === 100) {
    if (frac === null) return "100";
    if (frac === "" || /^0{0,2}$/.test(frac)) return `100.${frac}`;
    return "100";
  }
  const intPart = intDigits === "" ? (frac === null ? "" : "0") : String(intNum);
  if (frac === null) return intPart;
  return `${intPart}.${frac}`;
}

export function parsePercentInput(value: string): number | null {
  const trimmed = value.trim().replace(/%/g, "");
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizePercent(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
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
  const variationPercent = normalizePercent(input.variationPercent);
  const markupPercent = normalizePercent(input.markupPercent);
  if (variationPercent === null || markupPercent === null) {
    throw new Error("percent_out_of_range");
  }

  const now = new Date().toISOString();
  const legacyId = `web-calc-setting-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("meat_calculation_settings")
    .insert({
      legacy_id: legacyId,
      is_applied: false,
      variation_rate: percentToRate(variationPercent),
      markup_rate: percentToRate(markupPercent),
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

export async function deleteCalculationSetting(
  settingId: string,
): Promise<CalculationSettingRow[]> {
  const { error } = await supabase.rpc("delete_meat_calculation_setting", {
    p_setting_id: settingId,
  });
  if (error) throw error;
  return fetchCalculationSettings();
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "")
    .toLocaleLowerCase("zh-HK")
    .includes(needle.toLocaleLowerCase("zh-HK"));
}

export function filterCalculationSettings(
  rows: CalculationSettingRow[],
  search = "",
  formatPercent: (rate: number | null) => string,
  formatDate: (value: string | null) => string,
) {
  const query = search.trim();
  if (!query) return rows;
  return rows.filter((row) => {
    return (
      includesIgnoreCase(formatPercent(row.variationRate), query) ||
      includesIgnoreCase(formatPercent(row.markupRate), query) ||
      includesIgnoreCase(formatDate(row.createdAt), query)
    );
  });
}
