import { supabase } from "@/lib/supabase";

export type ShopReportRestaurant = {
  id: string;
  name: string;
};

export type ShopSalesWorkingHoursRow = {
  reportDate: string;
  restaurantId: string;
  restaurantName: string;
  departmentName: string;
  departmentOrder: number;
  sales: number;
  workingHours: number;
  salesPerWorkingHour: number;
};

export type ShopSalesWorkingHoursTable = {
  restaurant: ShopReportRestaurant;
  departments: Array<{ name: string; order: number }>;
  summaries: Array<{
    departmentName: string;
    maximum: number;
    minimum: number;
    average: number;
  }>;
  dates: Array<{
    date: string;
    departments: Record<
      string,
      { sales: number; workingHours: number; salesPerWorkingHour: number }
    >;
    totalSales: number;
    totalWorkingHours: number;
    totalSalesPerWorkingHour: number;
  }>;
};

type DbRow = {
  report_date: string;
  restaurant_id: string;
  restaurant_name: string;
  department_name: string;
  department_order: number | string;
  sales: number | string;
  working_hours: number | string;
  sales_per_working_hour: number | string;
};

export async function fetchShopReportRestaurants(): Promise<
  ShopReportRestaurant[]
> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ShopReportRestaurant[];
}

export async function fetchShopSalesWorkingHours({
  startDate,
  endDate,
  restaurantIds,
}: {
  startDate: string;
  endDate: string;
  restaurantIds: string[];
}): Promise<ShopSalesWorkingHoursRow[]> {
  const { data, error } = await supabase.rpc(
    "report_shop_sales_working_hours",
    {
      p_start_date: startDate,
      p_end_date: endDate,
      p_restaurant_ids: restaurantIds.length ? restaurantIds : null,
    },
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map((row) => ({
    reportDate: row.report_date,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    departmentName: row.department_name,
    departmentOrder: Number(row.department_order),
    sales: Number(row.sales),
    workingHours: Number(row.working_hours),
    salesPerWorkingHour: Number(row.sales_per_working_hour),
  }));
}

export function buildShopSalesWorkingHoursTables(
  rows: ShopSalesWorkingHoursRow[],
  restaurants: ShopReportRestaurant[],
): ShopSalesWorkingHoursTable[] {
  return restaurants.map((restaurant) => {
    const restaurantRows = rows.filter(
      (row) => row.restaurantId === restaurant.id,
    );
    const departments = [
      ...new Map(
        restaurantRows.map((row) => [
          row.departmentName,
          { name: row.departmentName, order: row.departmentOrder },
        ]),
      ).values(),
    ].sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name),
    );
    const dateMap = new Map<string, ShopSalesWorkingHoursTable["dates"][number]>();
    for (const row of restaurantRows) {
      const date = dateMap.get(row.reportDate) ?? {
        date: row.reportDate,
        departments: {},
        totalSales: 0,
        totalWorkingHours: 0,
        totalSalesPerWorkingHour: 0,
      };
      date.departments[row.departmentName] = {
        sales: row.sales,
        workingHours: row.workingHours,
        salesPerWorkingHour: row.salesPerWorkingHour,
      };
      date.totalSales += row.sales;
      date.totalWorkingHours += row.workingHours;
      date.totalSalesPerWorkingHour = date.totalWorkingHours
        ? date.totalSales / date.totalWorkingHours
        : 0;
      dateMap.set(row.reportDate, date);
    }
    const dates = [...dateMap.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    const primaryDepartment =
      departments.find((department) => department.order === 1)?.name ??
      departments[0]?.name;
    for (const date of dates) {
      date.totalWorkingHours = Object.values(date.departments).reduce(
        (total, department) => total + department.workingHours,
        0,
      );
      date.totalSales = primaryDepartment
        ? (date.departments[primaryDepartment]?.sales ?? 0)
        : 0;
      date.totalSalesPerWorkingHour = date.totalWorkingHours
        ? date.totalSales / date.totalWorkingHours
        : 0;
    }
    const summaries = departments.map((department) => {
      const dailyValues = dates
        .map(
          (date) => date.departments[department.name]?.salesPerWorkingHour,
        )
        .filter((value): value is number => Number.isFinite(value));
      return {
        departmentName: department.name,
        maximum: dailyValues.length ? Math.max(...dailyValues) : 0,
        minimum: dailyValues.length ? Math.min(...dailyValues) : 0,
        average: dailyValues.length
          ? dailyValues.reduce((total, value) => total + value, 0) /
            dailyValues.length
          : 0,
      };
    });
    return {
      restaurant,
      departments,
      summaries,
      dates,
    };
  });
}
