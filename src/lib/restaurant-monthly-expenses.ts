import { supabase } from "@/lib/supabase";

export type MonthlyExpenseRestaurant = {
  id: string;
  name: string;
};

export type MonthlyExpenseItem = {
  id: string;
  legacyId: string;
  name: string;
  sortOrder: number;
  costTypeId: string | null;
  costTypeLegacyId: string | null;
  categoryName: string;
  categorySortOrder: number;
};

export type RestaurantMonthlyExpenseMasters = {
  restaurants: MonthlyExpenseRestaurant[];
  costs: MonthlyExpenseItem[];
};

export type RestaurantMonthlyExpenseRecord = {
  amounts: Record<string, number>;
  remarks: Record<string, string>;
  canProceedPnl: boolean;
};

export type RestaurantMonthlyExpenseRecentItem = {
  restaurantId: string;
  restaurantName: string;
  month: string;
  total: number;
  canProceedPnl: boolean;
  modifiedAt: string | null;
};

export type SaveRestaurantMonthlyExpenseInput = {
  restaurantId: string;
  month: string;
  costs: MonthlyExpenseItem[];
  amounts: Record<string, number>;
  remarks: Record<string, string>;
  canProceedPnl: boolean;
};

type MonthlyCostRow = {
  id: string;
  restaurant_id: string | null;
  cost_id: string | null;
  month_at: string | null;
  amount: number | string | null;
  can_proceed_pnl: boolean | null;
  remarks: string | null;
  bubble_modified_at: string | null;
  created_at: string | null;
};

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  return {
    start: `${month}-01T00:00:00+08:00`,
    end: `${nextMonth}-01T00:00:00+08:00`,
    monthAt: `${month}-01T12:00:00+08:00`,
  };
}

function toMonth(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export const emptyRestaurantMonthlyExpenseRecord = (): RestaurantMonthlyExpenseRecord => ({
  amounts: {},
  remarks: {},
  canProceedPnl: false,
});

export async function fetchRestaurantMonthlyExpenseMasters(): Promise<RestaurantMonthlyExpenseMasters> {
  const [restaurantsResult, costTypesResult, costsResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id,name")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("restaurant_cost_types")
      .select("id,legacy_id,name,sort_order")
      .is("archived_at", null)
      .order("sort_order")
      .order("name"),
    supabase
      .from("restaurant_costs")
      .select("id,legacy_id,cost_type_id,cost_type_legacy_id,name,sort_order")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("sort_order")
      .order("name"),
  ]);
  const failed = [restaurantsResult, costTypesResult, costsResult].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const costTypes = new Map((costTypesResult.data ?? []).map((row) => [String(row.id), {
    name: String(row.name ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    legacyId: String(row.legacy_id ?? ""),
  }]));

  const costs = (costsResult.data ?? []).map((row) => {
    const type = row.cost_type_id ? costTypes.get(String(row.cost_type_id)) : undefined;
    return {
      id: String(row.id),
      legacyId: String(row.legacy_id ?? ""),
      name: String(row.name ?? ""),
      sortOrder: Number(row.sort_order ?? 0),
      costTypeId: row.cost_type_id ? String(row.cost_type_id) : null,
      costTypeLegacyId: String(row.cost_type_legacy_id ?? type?.legacyId ?? "") || null,
      categoryName: type?.name || "其他營運開支",
      categorySortOrder: type?.sortOrder ?? 9999,
    } satisfies MonthlyExpenseItem;
  }).filter((row) => row.id && row.name)
    .sort((left, right) => left.categorySortOrder - right.categorySortOrder
      || left.categoryName.localeCompare(right.categoryName)
      || left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name));

  return {
    restaurants: (restaurantsResult.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
    })).filter((row) => row.id && row.name),
    costs,
  };
}

export async function fetchRecentRestaurantMonthlyExpenses(): Promise<RestaurantMonthlyExpenseRecentItem[]> {
  const [rowsResult, restaurantsResult] = await Promise.all([
    supabase
      .from("restaurant_monthly_costs")
      .select("id,restaurant_id,cost_id,month_at,amount,can_proceed_pnl,remarks,bubble_modified_at,created_at")
      .not("restaurant_id", "is", null)
      .not("month_at", "is", null)
      .order("month_at", { ascending: false }),
    supabase.from("restaurants").select("id,name"),
  ]);
  if (rowsResult.error) throw new Error(rowsResult.error.message);
  if (restaurantsResult.error) throw new Error(restaurantsResult.error.message);
  const restaurantNames = new Map((restaurantsResult.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]));
  const grouped = new Map<string, RestaurantMonthlyExpenseRecentItem>();
  for (const row of (rowsResult.data ?? []) as MonthlyCostRow[]) {
    if (!row.restaurant_id || !row.month_at) continue;
    const month = toMonth(row.month_at);
    const key = `${row.restaurant_id}:${month}`;
    const modifiedAt = row.bubble_modified_at ?? row.created_at;
    const current = grouped.get(key) ?? {
      restaurantId: row.restaurant_id,
      restaurantName: restaurantNames.get(row.restaurant_id) ?? "",
      month,
      total: 0,
      canProceedPnl: true,
      modifiedAt,
    };
    current.total += Number(row.amount ?? 0);
    current.canProceedPnl = current.canProceedPnl && Boolean(row.can_proceed_pnl);
    if (modifiedAt && (!current.modifiedAt || modifiedAt > current.modifiedAt)) current.modifiedAt = modifiedAt;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) =>
    right.month.localeCompare(left.month) || left.restaurantName.localeCompare(right.restaurantName),
  );
}

export async function fetchRestaurantMonthlyExpense(
  restaurantId: string,
  month: string,
): Promise<RestaurantMonthlyExpenseRecord> {
  const { start, end } = monthBounds(month);
  const { data, error } = await supabase
    .from("restaurant_monthly_costs")
    .select("id,restaurant_id,cost_id,month_at,amount,can_proceed_pnl,remarks,bubble_modified_at,created_at")
    .eq("restaurant_id", restaurantId)
    .gte("month_at", start)
    .lt("month_at", end);
  if (error) throw new Error(error.message);
  const record = emptyRestaurantMonthlyExpenseRecord();
  const rows = (data ?? []) as MonthlyCostRow[];
  record.canProceedPnl = rows.length > 0 && rows.every((row) => Boolean(row.can_proceed_pnl));
  for (const row of rows) {
    if (!row.cost_id) continue;
    record.amounts[row.cost_id] = (record.amounts[row.cost_id] ?? 0) + Number(row.amount ?? 0);
    if (row.remarks?.trim()) record.remarks[row.cost_id] = row.remarks;
  }
  return record;
}

export async function restaurantMonthlyExpenseExists(restaurantId: string, month: string) {
  const { start, end } = monthBounds(month);
  const { count, error } = await supabase
    .from("restaurant_monthly_costs")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .gte("month_at", start)
    .lt("month_at", end);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function saveRestaurantMonthlyExpense(input: SaveRestaurantMonthlyExpenseInput) {
  const { start, end, monthAt } = monthBounds(input.month);
  const { data, error } = await supabase
    .from("restaurant_monthly_costs")
    .select("id,cost_id")
    .eq("restaurant_id", input.restaurantId)
    .gte("month_at", start)
    .lt("month_at", end);
  if (error) throw new Error(error.message);
  const existing = new Map((data ?? []).filter((row) => row.cost_id).map((row) => [String(row.cost_id), String(row.id)]));
  const now = new Date().toISOString();
  const updates = input.costs.filter((cost) => existing.has(cost.id));
  const inserts = input.costs.filter((cost) => !existing.has(cost.id)).map((cost) => ({
    legacy_id: `web-monthly-expense-${input.restaurantId}-${input.month}-${cost.id}`,
    restaurant_id: input.restaurantId,
    cost_id: cost.id,
    cost_legacy_id: cost.legacyId || null,
    cost_type_id: cost.costTypeId,
    cost_type_legacy_id: cost.costTypeLegacyId,
    month_at: monthAt,
    amount: input.amounts[cost.id] ?? 0,
    cost_type_sort: cost.categorySortOrder,
    can_proceed_pnl: input.canProceedPnl,
    remarks: input.remarks[cost.id]?.trim() || null,
    bubble_created_at: now,
    bubble_modified_at: now,
  }));

  const updateResults = await Promise.all(updates.map((cost) => supabase
    .from("restaurant_monthly_costs")
    .update({
      amount: input.amounts[cost.id] ?? 0,
      remarks: input.remarks[cost.id]?.trim() || null,
      month_at: monthAt,
      cost_type_id: cost.costTypeId,
      cost_type_legacy_id: cost.costTypeLegacyId,
      cost_type_sort: cost.categorySortOrder,
      can_proceed_pnl: input.canProceedPnl,
      bubble_modified_at: now,
    })
    .eq("id", existing.get(cost.id)!)));
  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) throw new Error(updateError.message);
  if (inserts.length) {
    const { error: insertError } = await supabase.from("restaurant_monthly_costs").insert(inserts);
    if (insertError) throw new Error(insertError.message);
  }
}

export async function setRestaurantMonthlyExpensePnlStatus(
  restaurantId: string,
  month: string,
  canProceedPnl: boolean,
) {
  const { start, end } = monthBounds(month);
  const { error } = await supabase
    .from("restaurant_monthly_costs")
    .update({ can_proceed_pnl: canProceedPnl, bubble_modified_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .gte("month_at", start)
    .lt("month_at", end);
  if (error) throw new Error(error.message);
}

export async function deleteRestaurantMonthlyExpense(restaurantId: string, month: string) {
  const { start, end } = monthBounds(month);
  const { error } = await supabase
    .from("restaurant_monthly_costs")
    .delete()
    .eq("restaurant_id", restaurantId)
    .gte("month_at", start)
    .lt("month_at", end);
  if (error) throw new Error(error.message);
}
