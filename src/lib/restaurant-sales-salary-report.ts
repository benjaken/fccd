import { supabase } from "@/lib/supabase";
import type { ShopReportRestaurant } from "@/lib/shop-sales-working-hours-report";

export type RestaurantSalesSalaryRow = {
  monthStart: string;
  restaurantId: string;
  restaurantName: string;
  sales: number;
  salary: number | null;
  salaryToSalesPercent: number | null;
};

type DbRow = {
  month_start: string;
  restaurant_id: string;
  restaurant_name: string;
  sales: number | string | null;
  salary: number | string | null;
  salary_to_sales_percent: number | string | null;
};

export function defaultSalesSalaryMonths(now = new Date()) {
  return {
    startMonth: `${now.getFullYear()}-01`,
    endMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}

export async function fetchRestaurantSalesSalaryReport({
  startMonth,
  endMonth,
  restaurantIds,
}: {
  startMonth: string;
  endMonth: string;
  restaurantIds: string[];
}): Promise<RestaurantSalesSalaryRow[]> {
  const { data, error } = await supabase.rpc("report_restaurant_sales_salary", {
    p_start_month: `${startMonth}-01`,
    p_end_month: `${endMonth}-01`,
    p_restaurant_ids: restaurantIds.length ? restaurantIds : null,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRow[]).map((row) => ({
    monthStart: row.month_start,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    sales: Number(row.sales ?? 0),
    salary: row.salary == null ? null : Number(row.salary),
    salaryToSalesPercent:
      row.salary_to_sales_percent == null
        ? null
        : Number(row.salary_to_sales_percent),
  }));
}

export function buildRestaurantSalesSalaryTable(
  rows: RestaurantSalesSalaryRow[],
  restaurants: ShopReportRestaurant[],
) {
  const rowMap = new Map(
    rows.map((row) => [`${row.monthStart}:${row.restaurantId}`, row]),
  );
  const months = [...new Set(rows.map((row) => row.monthStart))].sort();
  return {
    months,
    restaurants,
    value(month: string, restaurantId: string) {
      return rowMap.get(`${month}:${restaurantId}`);
    },
  };
}
