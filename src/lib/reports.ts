import { supabase } from "@/lib/supabase";

export type ReportShop = {
  id: string;
  name: string;
};

export type ReportSupplier = {
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

export type MonthlyPreparedMeatStockRow = {
  preparedMeatItemId: string;
  preparedMeatName: string;
  productUnit: string | null;
  sortOrder: number | null;
  monthNumber: number;
  monthEndPackages: number;
  monthlyNetPackages: number;
};

export type MonthlyRawMeatStockRow = {
  rawMeatItemId: string;
  rawMeatName: string;
  productUnit: string | null;
  sortOrder: number | null;
  monthNumber: number;
  monthEndKg: number;
  monthlyNetKg: number;
};

export type SupplierPurchaseRow = {
  supplierId: string;
  supplierName: string;
  rawMeatItemId: string;
  rawMeatName: string;
  quantityKg: number;
  purchaseAmount: number;
  averagePricePerKg: number;
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

type ReportSupplierDbRow = {
  supplier_id: string;
  supplier_name: string;
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

type MonthlyPreparedMeatStockDbRow = {
  prepared_meat_item_id: string;
  prepared_meat_name: string;
  product_unit: string | null;
  sort_order: number | string | null;
  month_number: number;
  month_end_packages: number | string;
  monthly_net_packages: number | string;
};

type MonthlyRawMeatStockDbRow = {
  raw_meat_item_id: string;
  raw_meat_name: string;
  product_unit: string | null;
  sort_order: number | string | null;
  month_number: number;
  month_end_kg: number | string;
  monthly_net_kg: number | string;
};

type SupplierPurchaseDbRow = {
  supplier_id: string;
  supplier_name: string;
  raw_meat_item_id: string;
  raw_meat_name: string;
  quantity_kg: number | string;
  purchase_amount: number | string;
  average_price_per_kg: number | string;
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

export async function fetchReportSuppliers(): Promise<ReportSupplier[]> {
  const { data, error } = await supabase.rpc("report_raw_meat_suppliers");
  if (error) throw error;
  return ((data ?? []) as ReportSupplierDbRow[]).map((supplier) => ({
    id: supplier.supplier_id,
    name: supplier.supplier_name,
  }));
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

export async function fetchMonthlyPreparedMeatStock(
  year: number,
): Promise<MonthlyPreparedMeatStockRow[]> {
  const { data, error } = await supabase.rpc(
    "report_monthly_prepared_meat_stock",
    { report_year: year },
  );
  if (error) throw error;
  return ((data ?? []) as MonthlyPreparedMeatStockDbRow[]).map((row) => ({
    preparedMeatItemId: row.prepared_meat_item_id,
    preparedMeatName: row.prepared_meat_name,
    productUnit: row.product_unit,
    sortOrder: row.sort_order === null ? null : Number(row.sort_order),
    monthNumber: Number(row.month_number),
    monthEndPackages: Number(row.month_end_packages),
    monthlyNetPackages: Number(row.monthly_net_packages),
  }));
}

export async function fetchMonthlyRawMeatStock(
  year: number,
): Promise<MonthlyRawMeatStockRow[]> {
  const { data, error } = await supabase.rpc(
    "report_monthly_raw_meat_stock",
    { report_year: year },
  );
  if (error) throw error;
  return ((data ?? []) as MonthlyRawMeatStockDbRow[]).map((row) => ({
    rawMeatItemId: row.raw_meat_item_id,
    rawMeatName: row.raw_meat_name,
    productUnit: row.product_unit,
    sortOrder: row.sort_order === null ? null : Number(row.sort_order),
    monthNumber: Number(row.month_number),
    monthEndKg: Number(row.month_end_kg),
    monthlyNetKg: Number(row.monthly_net_kg),
  }));
}

export async function fetchSupplierPurchases({
  startDate,
  endDate,
  supplierIds,
}: {
  startDate: string;
  endDate: string;
  supplierIds: string[];
}): Promise<SupplierPurchaseRow[]> {
  const { data, error } = await supabase.rpc(
    "report_supplier_raw_meat_purchases",
    {
      start_date: startDate,
      end_date: endDate,
      supplier_ids: supplierIds.length ? supplierIds : null,
    },
  );
  if (error) throw error;
  return ((data ?? []) as SupplierPurchaseDbRow[]).map((row) => ({
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    rawMeatItemId: row.raw_meat_item_id,
    rawMeatName: row.raw_meat_name,
    quantityKg: Number(row.quantity_kg),
    purchaseAmount: Number(row.purchase_amount),
    averagePricePerKg: Number(row.average_price_per_kg),
  }));
}
