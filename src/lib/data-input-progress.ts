import { fetchStocktakeDates, type StocktakeDateItem } from "@/lib/packing-stocktakes";
import { supabase } from "@/lib/supabase";
export type { StocktakeDateItem } from "@/lib/packing-stocktakes";

export type DataInputProgressSummary = {
  source: "monthly_costs" | "bank_settlements" | "packing_stocktakes" | "weekly_advertising";
  periodStart: string;
  enteredCount: number;
  requiredCount: number;
};

let dataInputProgressSummaryFlight: Promise<DataInputProgressSummary[]> | null = null;

export function fetchDataInputProgressSummary(): Promise<DataInputProgressSummary[]> {
  // React Strict Mode remounts effects in development.  Coalesce only requests
  // that are already in flight; the result is never retained as a front-end cache.
  if (dataInputProgressSummaryFlight) return dataInputProgressSummaryFlight;

  const request = Promise.all([
    supabase.rpc("get_data_input_progress_cache"),
    supabase.rpc("get_data_input_progress_current_year"),
  ]).then(([cached, currentYear]) => {
    if (cached.error) throw cached.error;
    if (currentYear.error) throw currentYear.error;
    return ([...(cached.data ?? []), ...(currentYear.data ?? [])] as Array<{
      source: string;
      period_start: string;
      entered_count: number | string | null;
      required_count: number | string | null;
    }>).map((row) => ({
      source: row.source as DataInputProgressSummary["source"],
      periodStart: String(row.period_start),
      enteredCount: Number(row.entered_count ?? 0),
      requiredCount: Number(row.required_count ?? 0),
    }));
  });

  dataInputProgressSummaryFlight = request;
  void request.then(
    () => { if (dataInputProgressSummaryFlight === request) dataInputProgressSummaryFlight = null; },
    () => { if (dataInputProgressSummaryFlight === request) dataInputProgressSummaryFlight = null; },
  );
  return request;
}

/** Kept as a dedicated query boundary so the report page can be tested without the stocktake UI. */
export function fetchPackingStocktakeDates(): Promise<StocktakeDateItem[]> {
  return fetchStocktakeDates("packing");
}
