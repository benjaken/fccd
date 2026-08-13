import { supabase } from "@/lib/supabase";

export type ReportShop = {
  id: string;
  name: string;
};

export type ShopOrderQuantityRow = {
  orderDate: string;
  shopId: string;
  shopName: string;
  productId: string | null;
  productName: string;
  unit: string | null;
  totalQuantity: number;
};

export type MeatPriceMode = "shop" | "factory";

export type MonthlyPreparedMeatPriceRow = {
  productId: string;
  productName: string;
  productUnit: string | null;
  sortOrder: number | null;
  monthNumber: number;
  pricePerKg: number;
  pricePerPackage: number;
};

export type MonthlyRawMeatAveragePriceRow = {
  rawMeatItemId: string;
  rawMeatName: string;
  sortOrder: number | null;
  monthNumber: number;
  averagePricePerKg: number;
  totalQuantityKg: number;
  receiptCount: number;
};

type ShopOrderQuantityDbRow = {
  order_date: string;
  shop_id: string;
  shop_name: string;
  product_id: string | null;
  product_name: string;
  unit: string | null;
  total_quantity: number | string;
};

type MonthlyPreparedMeatPriceDbRow = {
  product_id: string;
  product_name: string;
  product_unit: string | null;
  sort_order: number | string | null;
  month_number: number;
  price_per_kg: number | string;
  price_per_package: number | string;
};

type MonthlyRawMeatAveragePriceDbRow = {
  raw_meat_item_id: string;
  raw_meat_name: string;
  sort_order: number | string | null;
  month_number: number;
  average_price_per_kg: number | string;
  total_quantity_kg: number | string;
  receipt_count: number | string;
};

export async function fetchReportShops(): Promise<ReportShop[]> {
  const { data, error } = await supabase
    .from("meat_customers")
    .select("id,name")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as ReportShop[];
}

export async function fetchShopOrderQuantities({
  startDate,
  endDate,
  shopIds,
}: {
  startDate: string;
  endDate: string;
  shopIds: string[];
}): Promise<ShopOrderQuantityRow[]> {
  const { data, error } = await supabase.rpc(
    "report_shop_order_quantities",
    {
      start_date: startDate,
      end_date: endDate,
      shop_ids: shopIds.length ? shopIds : null,
    },
  );
  if (error) throw error;
  return ((data ?? []) as ShopOrderQuantityDbRow[]).map((row) => ({
    orderDate: row.order_date,
    shopId: row.shop_id,
    shopName: row.shop_name,
    productId: row.product_id,
    productName: row.product_name,
    unit: row.unit,
    totalQuantity: Number(row.total_quantity),
  }));
}

export async function fetchMonthlyPreparedMeatPrices({
  year,
  mode,
}: {
  year: number;
  mode: MeatPriceMode;
}): Promise<MonthlyPreparedMeatPriceRow[]> {
  const { data, error } = await supabase.rpc(
    "report_monthly_prepared_meat_prices",
    {
      report_year: year,
      price_mode: mode,
    },
  );
  if (error) throw error;
  return ((data ?? []) as MonthlyPreparedMeatPriceDbRow[]).map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    productUnit: row.product_unit,
    sortOrder: row.sort_order === null ? null : Number(row.sort_order),
    monthNumber: Number(row.month_number),
    pricePerKg: Number(row.price_per_kg),
    pricePerPackage: Number(row.price_per_package),
  }));
}

export async function fetchMonthlyRawMeatAveragePrices(
  year: number,
): Promise<MonthlyRawMeatAveragePriceRow[]> {
  const { data, error } = await supabase.rpc(
    "report_monthly_raw_meat_average_prices",
    { report_year: year },
  );
  if (error) throw error;
  return ((data ?? []) as MonthlyRawMeatAveragePriceDbRow[]).map((row) => ({
    rawMeatItemId: row.raw_meat_item_id,
    rawMeatName: row.raw_meat_name,
    sortOrder: row.sort_order === null ? null : Number(row.sort_order),
    monthNumber: Number(row.month_number),
    averagePricePerKg: Number(row.average_price_per_kg),
    totalQuantityKg: Number(row.total_quantity_kg),
    receiptCount: Number(row.receipt_count),
  }));
}
