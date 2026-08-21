import { supabase } from "@/lib/supabase";
import type { ShopReportRestaurant } from "@/lib/shop-sales-working-hours-report";

export type RestaurantPnlRow = {
  monthStart: string;
  restaurantId: string;
  restaurantName: string;
  sales: number;
  openingStock: number;
  purchases: number;
  closingStock: number;
  categoryKey: string | null;
  categoryName: string | null;
  categoryOrder: number;
  itemKey: string | null;
  itemName: string | null;
  itemOrder: number;
  amount: number;
};

type DbRow = {
  month_start: string;
  restaurant_id: string;
  restaurant_name: string;
  sales: number | string | null;
  opening_stock: number | string | null;
  purchases: number | string | null;
  closing_stock: number | string | null;
  category_key: string | null;
  category_name: string | null;
  category_order: number | string | null;
  item_key: string | null;
  item_name: string | null;
  item_order: number | string | null;
  amount: number | string | null;
};

export function defaultRestaurantPnlMonths(now = new Date()) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { startMonth: `${now.getFullYear()}-01`, endMonth: currentMonth };
}

export function findDefaultPnlRestaurant(
  restaurants: ShopReportRestaurant[],
): ShopReportRestaurant | undefined {
  return (
    restaurants.find((restaurant) =>
      /(?:^|\s)TKO(?:\s|$)|將軍澳/i.test(restaurant.name),
    ) ?? restaurants[0]
  );
}

export async function fetchRestaurantPnlReport({
  startMonth,
  endMonth,
  restaurantId,
}: {
  startMonth: string;
  endMonth: string;
  restaurantId: string;
}): Promise<RestaurantPnlRow[]> {
  const { data, error } = await supabase.rpc("report_restaurant_pnl", {
    p_start_month: `${startMonth}-01`,
    p_end_month: `${endMonth}-01`,
    p_restaurant_id: restaurantId,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRow[]).map((row) => ({
    monthStart: row.month_start,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    sales: Number(row.sales ?? 0),
    openingStock: Number(row.opening_stock ?? 0),
    purchases: Number(row.purchases ?? 0),
    closingStock: Number(row.closing_stock ?? 0),
    categoryKey: row.category_key,
    categoryName: row.category_name,
    categoryOrder: Number(row.category_order ?? 0),
    itemKey: row.item_key,
    itemName: row.item_name,
    itemOrder: Number(row.item_order ?? 0),
    amount: Number(row.amount ?? 0),
  }));
}

export type RestaurantPnlMonth = {
  monthStart: string;
  sales: number;
  openingStock: number;
  purchases: number;
  closingStock: number;
  totalCostOfSales: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  values: Record<string, number>;
};

export function buildRestaurantPnlReport(rows: RestaurantPnlRow[]) {
  const categories = [
    ...new Map(
      rows
        .filter((row) => row.categoryKey && row.categoryName)
        .map((row) => [
          row.categoryKey as string,
          {
            key: row.categoryKey as string,
            name: row.categoryName as string,
            order: row.categoryOrder,
            items: new Map<string, { key: string; name: string; order: number }>(),
          },
        ]),
    ).values(),
  ];
  const categoryMap = new Map(categories.map((category) => [category.key, category]));
  for (const row of rows) {
    if (!row.categoryKey || !row.itemKey || !row.itemName) continue;
    categoryMap.get(row.categoryKey)?.items.set(row.itemKey, {
      key: row.itemKey,
      name: row.itemName,
      order: row.itemOrder,
    });
  }
  categories.sort(
    (left, right) => left.order - right.order || left.name.localeCompare(right.name),
  );
  let normalizedCategories = categories.map((category) => ({
    ...category,
    items: [...category.items.values()].sort(
      (left, right) => left.order - right.order || left.name.localeCompare(right.name),
    ),
  }));

  // The legacy P&L treats Discount as the first detail of promotion costs,
  // rather than as a standalone operating-cost section.
  const discountCategory = normalizedCategories.find(
    (category) => category.name.trim().toLowerCase() === "discount",
  );
  const promotionCategory = normalizedCategories.find((category) =>
    /推廣費用|promotion|marketing/i.test(category.name),
  );
  if (
    discountCategory &&
    promotionCategory &&
    promotionCategory !== discountCategory
  ) {
    promotionCategory.items = [
      ...discountCategory.items,
      ...promotionCategory.items,
    ].sort(
      (left, right) => left.order - right.order || left.name.localeCompare(right.name),
    );
    normalizedCategories = normalizedCategories.filter(
      (category) => category !== discountCategory,
    );
  }

  const monthMap = new Map<string, RestaurantPnlMonth>();
  for (const row of rows) {
    const month = monthMap.get(row.monthStart) ?? {
      monthStart: row.monthStart,
      sales: row.sales,
      openingStock: row.openingStock,
      purchases: row.purchases,
      closingStock: row.closingStock,
      totalCostOfSales: row.openingStock + row.purchases - row.closingStock,
      grossProfit: row.sales - (row.openingStock + row.purchases - row.closingStock),
      totalExpenses: 0,
      netProfit: 0,
      values: {},
    };
    if (row.itemKey) month.values[row.itemKey] = row.amount;
    monthMap.set(row.monthStart, month);
  }
  const months = [...monthMap.values()].sort((left, right) =>
    left.monthStart.localeCompare(right.monthStart),
  );
  for (const month of months) {
    month.totalExpenses = normalizedCategories.reduce(
      (sum, category) =>
        sum + category.items.reduce((categorySum, item) => categorySum + (month.values[item.key] ?? 0), 0),
      0,
    );
    month.netProfit = month.grossProfit - month.totalExpenses;
  }

  return { categories: normalizedCategories, months };
}
