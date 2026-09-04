import { supabase } from "@/lib/supabase";

export const FESTIVAL_ORDER_GENERATION_FIRST_YEAR = 2022;

export const FESTIVAL_ORDER_PREFERRED_NAMES = [
  "Xmas + 冬至",
  "中秋節",
  "復活節",
  "母親節",
  "父親節",
  "農曆新年",
] as const;

export type FestivalOrderGenerationRow = {
  festivalKey: string;
  festivalLabel: string;
  year: number;
  month: number;
  orderCount: number;
};

export type FestivalOrderGenerationReport = {
  rows: FestivalOrderGenerationRow[];
};

export type FestivalYearCell = {
  year: number;
  orderCount: number;
  previousYear: number | null;
  delta: number | null;
  percent: number | null;
};

export type FestivalYearSummary = {
  festivalKey: string;
  festivalLabel: string;
  cells: FestivalYearCell[];
  total: number;
};

export type FestivalMonthSummary = {
  month: number;
  cells: FestivalYearCell[];
};

type FestivalOrderGenerationRpcRow = {
  festival_key: string | null;
  festival_label: string | null;
  report_year: number | string | null;
  report_month: number | string | null;
  order_count: number | string | null;
};

function numericValue(value: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function yearOverYearChange(
  current: number,
  previous: number | null | undefined,
) {
  if (previous == null) {
    return { delta: null as number | null, percent: null as number | null };
  }
  const delta = current - previous;
  if (previous === 0) {
    return { delta, percent: current === 0 ? 0 : null };
  }
  return { delta, percent: (delta / previous) * 100 };
}

export function festivalOrderCount(
  rows: readonly FestivalOrderGenerationRow[],
  festivalKey: string,
  year: number,
  month?: number,
) {
  return rows.reduce((total, row) => {
    if (row.festivalKey !== festivalKey || row.year !== year) return total;
    if (month != null && row.month !== month) return total;
    return total + row.orderCount;
  }, 0);
}

export function festivalOrderGenerationYears(
  rows: readonly FestivalOrderGenerationRow[],
) {
  return [...new Set(rows.map((row) => row.year))]
    .filter((year) => Number.isInteger(year) && year >= FESTIVAL_ORDER_GENERATION_FIRST_YEAR)
    .sort((left, right) => left - right);
}

export function defaultFestivalOrderGenerationYears(years: number[]) {
  return years.filter((year) => year >= FESTIVAL_ORDER_GENERATION_FIRST_YEAR);
}

export function festivalOrderGenerationFestivals(
  rows: readonly FestivalOrderGenerationRow[],
  preferred: readonly string[] = FESTIVAL_ORDER_PREFERRED_NAMES,
) {
  const configured = [
    ...new Set(rows.map((row) => row.festivalLabel).filter(Boolean)),
  ];
  const known = preferred
    .map(
      (name) =>
        configured.find((item) => item.toLowerCase() === name.toLowerCase()) ??
        null,
    )
    .filter((name): name is string => Boolean(name));
  const extras = configured
    .filter(
      (name) =>
        !preferred.some((item) => item.toLowerCase() === name.toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right, "zh-HK"));
  return [...known, ...extras];
}

function cellsForYears(
  counts: (year: number) => number,
  selectedYears: readonly number[],
): FestivalYearCell[] {
  return selectedYears.map((year, index) => {
    const orderCount = counts(year);
    const previousYear = index === 0 ? null : selectedYears[index - 1];
    const previousCount =
      previousYear == null ? null : counts(previousYear);
    const change = yearOverYearChange(orderCount, previousCount);
    return {
      year,
      orderCount,
      previousYear,
      delta: change.delta,
      percent: change.percent,
    };
  });
}

export function buildFestivalOrderYearSummaries(
  rows: readonly FestivalOrderGenerationRow[],
  selectedYears: readonly number[],
  festivals = festivalOrderGenerationFestivals(rows),
): FestivalYearSummary[] {
  return festivals.flatMap((label) => {
    const festivalKey =
      rows.find((row) => row.festivalLabel === label)?.festivalKey ?? label;
    const cells = cellsForYears(
      (year) => festivalOrderCount(rows, festivalKey, year),
      selectedYears,
    );
    if (!cells.some((cell) => cell.orderCount > 0)) return [];
    return [
      {
        festivalKey,
        festivalLabel: label,
        cells,
        total: cells.reduce((total, cell) => total + cell.orderCount, 0),
      },
    ];
  });
}

export function buildFestivalOrderYearTotals(
  summaries: readonly FestivalYearSummary[],
  selectedYears: readonly number[],
): FestivalYearCell[] {
  return cellsForYears(
    (year) =>
      summaries.reduce((total, summary) => {
        const cell = summary.cells.find((item) => item.year === year);
        return total + (cell?.orderCount ?? 0);
      }, 0),
    selectedYears,
  );
}

export function buildFestivalOrderMonthSummaries(
  rows: readonly FestivalOrderGenerationRow[],
  festivalKey: string,
  selectedYears: readonly number[],
): FestivalMonthSummary[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      month,
      cells: cellsForYears(
        (year) => festivalOrderCount(rows, festivalKey, year, month),
        selectedYears,
      ),
    };
  });
}

export function festivalOrderGenerationCsv(
  summaries: readonly FestivalYearSummary[],
  totals: readonly FestivalYearCell[],
) {
  const years = totals.map((cell) => cell.year);
  const header = [
    "節日",
    ...years.map(String),
    ...years.slice(1).map((year, index) => `${year}較${years[index]}`),
    ...years.slice(1).map((year, index) => `${year}較${years[index]}%`),
  ];
  const lines = summaries.map((summary) => {
    const counts = summary.cells.map((cell) => String(cell.orderCount));
    const deltas = summary.cells
      .slice(1)
      .map((cell) => (cell.delta == null ? "" : String(cell.delta)));
    const percents = summary.cells.slice(1).map((cell) =>
      cell.percent == null ? "" : cell.percent.toFixed(1),
    );
    return [summary.festivalLabel, ...counts, ...deltas, ...percents];
  });
  const totalLine = [
    "合計",
    ...totals.map((cell) => String(cell.orderCount)),
    ...totals.slice(1).map((cell) => (cell.delta == null ? "" : String(cell.delta))),
    ...totals.slice(1).map((cell) =>
      cell.percent == null ? "" : cell.percent.toFixed(1),
    ),
  ];
  return [header, ...lines, totalLine]
    .map((line) =>
      line.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
}

export async function fetchFestivalOrderGenerationReport(): Promise<FestivalOrderGenerationReport> {
  const { data, error } = await supabase.rpc("report_festival_order_generation");
  if (error) throw new Error(error.message);

  return {
    rows: ((data ?? []) as FestivalOrderGenerationRpcRow[])
      .map((row) => ({
        festivalKey: row.festival_key?.trim() || "未分類節日",
        festivalLabel: row.festival_label?.trim() || "未分類節日",
        year: Number(row.report_year),
        month: Number(row.report_month),
        orderCount: numericValue(row.order_count),
      }))
      .filter(
        (row) =>
          row.festivalKey.length > 0 &&
          row.festivalLabel.length > 0 &&
          Number.isInteger(row.year) &&
          row.year >= FESTIVAL_ORDER_GENERATION_FIRST_YEAR &&
          row.month >= 1 &&
          row.month <= 12,
      ),
  };
}
