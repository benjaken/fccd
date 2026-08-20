import { supabase } from "@/lib/supabase";

export const KITCHEN_ADVERTISING_FESTIVAL_OPTIONS = [
  "父親節",
  "中秋節",
  "母親節",
  "Xmas + 冬至",
  "農曆新年",
  "復活節",
] as const;

export const KITCHEN_ADVERTISING_CHANNEL_ORDER = [
  "Catering",
  "Kitchen",
  "Express",
  "Cuisine",
  "Delivery",
  "Residential",
  "HK lunch box",
  "HK Party Food",
] as const;

export const KITCHEN_ADVERTISING_FIRST_REPORT_YEAR = 2022;

export type KitchenAdvertisingPerformanceMode = "festival" | "non_peak";

export type KitchenAdvertisingPerformanceRow = {
  mode: KitchenAdvertisingPerformanceMode;
  segmentKey: string;
  segmentLabel: string;
  year: number;
  channel: string;
  metric: string;
  amount: number;
};

export type KitchenAdvertisingPerformanceReport = {
  rows: KitchenAdvertisingPerformanceRow[];
};

export type KitchenAdvertisingPerformanceCell = {
  sales: number;
  costs: Record<string, number>;
};

export type KitchenAdvertisingPerformanceYearSummary = {
  year: number;
  cells: Record<string, KitchenAdvertisingPerformanceCell>;
  totalSales: number;
};

type KitchenAdvertisingPerformanceRpcRow = {
  segment_type: string | null;
  segment_key: string | null;
  segment_label: string | null;
  report_year: number | string | null;
  channel_name: string | null;
  metric_name: string | null;
  amount: number | string | null;
};

function numericValue(value: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function canonicalChannelName(value: string) {
  const trimmed = value.trim();
  const known = KITCHEN_ADVERTISING_CHANNEL_ORDER.find(
    (channel) => channel.toLowerCase() === trimmed.toLowerCase(),
  );
  return known ?? trimmed;
}

export async function fetchKitchenAdvertisingPerformanceReport(): Promise<KitchenAdvertisingPerformanceReport> {
  const { data, error } = await supabase.rpc("report_kitchen_advertising_performance");
  if (error) throw new Error(error.message);

  return {
    rows: ((data ?? []) as KitchenAdvertisingPerformanceRpcRow[])
      .map((row) => ({
        mode: (row.segment_type === "non_peak" ? "non_peak" : "festival") as KitchenAdvertisingPerformanceMode,
        segmentKey: row.segment_key?.trim() ?? "",
        segmentLabel: row.segment_label?.trim() ?? "",
        year: Number(row.report_year),
        channel: canonicalChannelName(row.channel_name?.trim() ?? ""),
        metric: row.metric_name?.trim() ?? "",
        amount: numericValue(row.amount),
      }))
      .filter(
        (row) =>
          row.segmentKey.length > 0 &&
          row.segmentLabel.length > 0 &&
          Number.isInteger(row.year) &&
          row.year >= KITCHEN_ADVERTISING_FIRST_REPORT_YEAR &&
          row.channel.length > 0 &&
          row.metric.length > 0,
      ),
  };
}

export function kitchenAdvertisingPerformanceYears(
  rows: KitchenAdvertisingPerformanceRow[],
  mode: KitchenAdvertisingPerformanceMode,
  segmentKey: string,
) {
  return [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.mode === mode &&
            row.segmentKey === segmentKey &&
            row.year >= KITCHEN_ADVERTISING_FIRST_REPORT_YEAR,
        )
        .map((row) => row.year),
    ),
  ].sort((left, right) => left - right);
}

export function defaultKitchenAdvertisingPerformanceYears(years: number[]) {
  return years.filter((year) => year >= KITCHEN_ADVERTISING_FIRST_REPORT_YEAR);
}

export function kitchenAdvertisingPerformanceFestivals(
  rows: KitchenAdvertisingPerformanceRow[],
) {
  const configured = rows
    .filter((row) => row.mode === "festival")
    .map((row) => row.segmentLabel)
    .filter(Boolean);
  const extras = [
    ...new Set(
      configured.filter(
        (name) =>
          !KITCHEN_ADVERTISING_FESTIVAL_OPTIONS.some(
            (option) => option.toLowerCase() === name.toLowerCase(),
          ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh-HK"));
  return [...KITCHEN_ADVERTISING_FESTIVAL_OPTIONS, ...extras];
}

export function kitchenAdvertisingPerformanceChannels(
  rows: KitchenAdvertisingPerformanceRow[],
) {
  const configured = [
    ...new Set(rows.map((row) => canonicalChannelName(row.channel)).filter(Boolean)),
  ];
  const known = [...KITCHEN_ADVERTISING_CHANNEL_ORDER];
  const extras = configured
    .filter((channel) => !known.some((item) => item.toLowerCase() === channel.toLowerCase()))
    .sort((left, right) => left.localeCompare(right, "zh-HK"));
  return [...known, ...extras];
}

export function kitchenAdvertisingPerformanceCostTypes(
  rows: KitchenAdvertisingPerformanceRow[],
  mode: KitchenAdvertisingPerformanceMode,
  segmentKey: string,
) {
  const preferred = ["Google", "Facebook", "Marketing"];
  const configured = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.mode === mode &&
            row.segmentKey === segmentKey &&
            row.metric.toLowerCase() !== "sales",
        )
        .map((row) => row.metric),
    ),
  ];
  return configured.sort((left, right) => {
    const leftIndex = preferred.findIndex((item) => item.toLowerCase() === left.toLowerCase());
    const rightIndex = preferred.findIndex((item) => item.toLowerCase() === right.toLowerCase());
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex) ||
      left.localeCompare(right, "zh-HK");
  });
}

export function buildKitchenAdvertisingPerformanceYearSummaries(
  rows: KitchenAdvertisingPerformanceRow[],
  mode: KitchenAdvertisingPerformanceMode,
  segmentKey: string,
  selectedYears: number[],
  channels = kitchenAdvertisingPerformanceChannels(rows),
): KitchenAdvertisingPerformanceYearSummary[] {
  const summaries = selectedYears.map((year) => {
    const cells = Object.fromEntries(
      channels.map((channel) => [channel, { sales: 0, costs: {} }]),
    ) as Record<string, KitchenAdvertisingPerformanceCell>;

    for (const row of rows) {
      if (row.mode !== mode || row.segmentKey !== segmentKey || row.year !== year) continue;
      const channel = canonicalChannelName(row.channel);
      const cell = cells[channel];
      if (!cell) continue;
      if (row.metric.toLowerCase() === "sales") {
        cell.sales += row.amount;
      } else {
        cell.costs[row.metric] = (cell.costs[row.metric] ?? 0) + row.amount;
      }
    }

    return {
      year,
      cells,
      totalSales: Object.values(cells).reduce((total, cell) => total + cell.sales, 0),
    };
  });

  return summaries;
}
