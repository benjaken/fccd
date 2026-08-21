import { supabase } from "@/lib/supabase";

export type RestaurantSalesPeriod = "month" | "day" | "week";
export type RestaurantSalesCategory =
  | "platform"
  | "department"
  | "servicePeriod";

export type RestaurantSalesReportRow = {
  bucketStart: string;
  restaurantId: string;
  restaurantName: string;
  restaurantOrder: number;
  categoryKey: string;
  categoryName: string;
  categoryOrder: number;
  amount: number;
};

export type RestaurantSalesReportInput = {
  startDate: string;
  endDate: string;
  period: RestaurantSalesPeriod;
  category: RestaurantSalesCategory;
};

export type RestaurantSalesMatrix = {
  restaurants: Array<{ id: string; name: string }>;
  categories: Array<{ key: string; name: string }>;
  buckets: Array<{
    start: string;
    values: Record<string, Record<string, number>>;
    totals: Record<string, number>;
  }>;
};

type RestaurantSalesRpcRow = {
  bucket_start: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_order: number | string | null;
  category_key: string;
  category_name: string;
  category_order: number | string | null;
  amount: number | string | null;
};

function dateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function currentMonthValue(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultRestaurantSalesDates(now = new Date()) {
  const today = dateValue(now);
  return {
    monthStart: `${now.getFullYear()}-01`,
    monthEnd: currentMonthValue(now),
    dayStart: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    dayEnd: today,
    weekDate: today,
  };
}

export function monthDateRange(startMonth: string, endMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
    return { startDate: "", endDate: "" };
  }
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  const end = new Date(endYear, endMonthNumber, 0);
  return {
    startDate: `${startMonth}-01`,
    endDate: dateValue(end),
  };
}

export function weekDateRange(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { startDate: "", endDate: "" };
  }
  const [year, month, day] = value.split("-").map(Number);
  const selected = new Date(year, (month ?? 1) - 1, day ?? 1);
  const weekday = selected.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(selected);
  start.setDate(selected.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: dateValue(start), endDate: dateValue(end) };
}

export async function fetchRestaurantSalesReport(
  input: RestaurantSalesReportInput,
): Promise<RestaurantSalesReportRow[]> {
  const { data, error } = await supabase.rpc("report_restaurant_sales", {
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_period: input.period,
    p_category: input.category === "servicePeriod" ? "service_period" : input.category,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as RestaurantSalesRpcRow[]).map((row) => ({
    bucketStart: row.bucket_start,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    restaurantOrder: Number(row.restaurant_order ?? 0),
    categoryKey: row.category_key,
    categoryName: row.category_name,
    categoryOrder: Number(row.category_order ?? 0),
    amount: Number(row.amount ?? 0),
  }));
}

export function buildRestaurantSalesMatrix(
  rows: RestaurantSalesReportRow[],
): RestaurantSalesMatrix {
  const restaurantMap = new Map<string, { id: string; name: string; order: number }>();
  const categoryMap = new Map<string, { key: string; name: string; order: number }>();
  const bucketMap = new Map<
    string,
    {
      start: string;
      values: Record<string, Record<string, number>>;
      totals: Record<string, number>;
    }
  >();
  const explicitTotals = new Set<string>();

  for (const row of rows) {
    restaurantMap.set(row.restaurantId, {
      id: row.restaurantId,
      name: row.restaurantName,
      order: row.restaurantOrder,
    });
    const bucket = bucketMap.get(row.bucketStart) ?? {
      start: row.bucketStart,
      values: {},
      totals: {},
    };
    const totalKey = `${row.bucketStart}:${row.restaurantId}`;
    if (row.categoryKey === "__total__") {
      bucket.totals[row.restaurantId] = row.amount;
      explicitTotals.add(totalKey);
      bucketMap.set(row.bucketStart, bucket);
      continue;
    }
    categoryMap.set(row.categoryKey, {
      key: row.categoryKey,
      name: row.categoryName,
      order: row.categoryOrder,
    });
    const restaurantValues = bucket.values[row.restaurantId] ?? {};
    restaurantValues[row.categoryKey] =
      (restaurantValues[row.categoryKey] ?? 0) + row.amount;
    bucket.values[row.restaurantId] = restaurantValues;
    if (!explicitTotals.has(totalKey)) {
      bucket.totals[row.restaurantId] =
        (bucket.totals[row.restaurantId] ?? 0) + row.amount;
    }
    bucketMap.set(row.bucketStart, bucket);
  }

  return {
    restaurants: [...restaurantMap.values()]
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
      .map(({ id, name }) => ({ id, name })),
    categories: [...categoryMap.values()]
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
      .map(({ key, name }) => ({ key, name })),
    buckets: [...bucketMap.values()].sort((left, right) =>
      left.start.localeCompare(right.start),
    ),
  };
}
