import { supabase } from "@/lib/supabase";

export const KITCHEN_SALES_CATEGORY = "Sales";

/**
 * Keep the familiar P&L order while still allowing newly configured cost
 * types to appear after the standard categories.
 */
export const KITCHEN_COST_CATEGORY_ORDER = [
  "Google",
  "Facebook",
  "Delivery charge",
  "Food cost",
  "Packing",
  "Rent",
  "Wages",
  "Miscellaneous",
  "Water",
  "Electricity",
  "Shopify",
  "Marketing",
] as const;

export type KitchenSalesCostReportRow = {
  year: number;
  month: number;
  category: string;
  amount: number;
};

export type KitchenSalesCostReport = {
  rows: KitchenSalesCostReportRow[];
};

export type KitchenSalesCostYearSummary = {
  year: number;
  sales: number[];
  costs: Record<string, number[]>;
  net: number[];
  totalSales: number;
  totalCosts: number;
  totalNet: number;
};

type KitchenSalesCostRpcRow = {
  report_year: number | string;
  month_number: number | string;
  category_name: string | null;
  amount: number | string | null;
};

const categoryNames = new Map(
  KITCHEN_COST_CATEGORY_ORDER.map((name) => [name.toLowerCase(), name]),
);

function canonicalCategoryName(value: string) {
  const trimmed = value.trim();
  return categoryNames.get(trimmed.toLowerCase()) ?? trimmed;
}

function numericValue(value: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function fetchKitchenSalesCostReport(): Promise<KitchenSalesCostReport> {
  const { data, error } = await supabase.rpc("report_kitchen_sales_costs");
  if (error) throw new Error(error.message);

  return {
    rows: ((data ?? []) as KitchenSalesCostRpcRow[])
      .map((row) => ({
        year: Number(row.report_year),
        month: Number(row.month_number),
        category: row.category_name?.trim() || "Other cost",
        amount: numericValue(row.amount),
      }))
      .filter(
        (row) =>
          Number.isInteger(row.year) &&
          row.year > 1900 &&
          row.month >= 1 &&
          row.month <= 12,
      ),
  };
}

export function kitchenSalesCostYears(rows: KitchenSalesCostReportRow[]) {
  return [...new Set(rows.map((row) => row.year))].sort((left, right) => left - right);
}

export function defaultKitchenSalesCostYears(years: number[]) {
  const available = new Set(years);
  const preferred = [2025, 2026].filter((year) => available.has(year));
  if (preferred.length > 0) return preferred;
  return years.slice(-2);
}

export function kitchenSalesCostCategories(rows: KitchenSalesCostReportRow[]) {
  const configured = [
    ...new Set(
      rows
        .map((row) => canonicalCategoryName(row.category))
        .filter((category) => category !== KITCHEN_SALES_CATEGORY),
    ),
  ];
  const known = [...KITCHEN_COST_CATEGORY_ORDER].filter((category) =>
    configured.some((item) => item.toLowerCase() === category.toLowerCase()),
  );
  const extra = configured
    .filter(
      (category) =>
        !known.some((item) => item.toLowerCase() === category.toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right));
  return [...known, ...extra];
}

export function buildKitchenSalesCostYearSummary(
  rows: KitchenSalesCostReportRow[],
  year: number,
  categories = kitchenSalesCostCategories(rows),
): KitchenSalesCostYearSummary {
  const sales = Array.from({ length: 12 }, () => 0);
  const costs = Object.fromEntries(
    categories.map((category) => [category, Array.from({ length: 12 }, () => 0)]),
  ) as Record<string, number[]>;

  for (const row of rows) {
    if (row.year !== year || row.month < 1 || row.month > 12) continue;
    const monthIndex = row.month - 1;
    const category =
      row.category === KITCHEN_SALES_CATEGORY
        ? KITCHEN_SALES_CATEGORY
        : canonicalCategoryName(row.category);
    if (category === KITCHEN_SALES_CATEGORY) {
      sales[monthIndex] += row.amount;
    } else if (costs[category]) {
      costs[category][monthIndex] += row.amount;
    }
  }

  const net = sales.map((amount, monthIndex) => {
    const monthlyCosts = categories.reduce(
      (sum, category) => sum + costs[category][monthIndex],
      0,
    );
    return amount - monthlyCosts;
  });
  const totalSales = sales.reduce((sum, amount) => sum + amount, 0);
  const totalCosts = categories.reduce(
    (sum, category) =>
      sum + costs[category].reduce((categoryTotal, amount) => categoryTotal + amount, 0),
    0,
  );

  return {
    year,
    sales,
    costs,
    net,
    totalSales,
    totalCosts,
    totalNet: totalSales - totalCosts,
  };
}
