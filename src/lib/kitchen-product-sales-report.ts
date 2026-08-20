import { supabase } from "@/lib/supabase";

export type KitchenProductSalesRow = {
  productId: string;
  sku: string | null;
  productName: string;
  brandName: string;
  categoryName: string;
  productSetName: string;
  quantity: number;
  totalAmount: number;
};

export type KitchenProductSalesPackageRow = {
  packageId: string;
  sku: string | null;
  packageName: string;
  brandName: string;
  quantity: number;
  totalAmount: number;
};

export type KitchenProductSalesFilters = {
  startDate: string;
  endDate: string;
  brandId?: string;
  productTypeName?: string;
  collectionId?: string;
};

type KitchenProductSalesDbRow = {
  product_id: string;
  sku: string | null;
  product_name: string | null;
  brand_name: string | null;
  category_name: string | null;
  product_set_name: string | null;
  quantity: number | string | null;
  total_amount: number | string | null;
};

type KitchenProductSalesPackageDbRow = {
  package_id: string;
  sku: string | null;
  package_name: string | null;
  brand_name: string | null;
  quantity: number | string | null;
  total_amount: number | string | null;
};

function numericValue(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchKitchenProductSalesReport({
  startDate,
  endDate,
  brandId = "",
  productTypeName = "",
  collectionId = "",
}: KitchenProductSalesFilters): Promise<KitchenProductSalesRow[]> {
  const { data, error } = await supabase.rpc("report_kitchen_product_sales", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_brand_id: brandId || null,
    p_product_type_name: productTypeName || null,
    p_collection_id: collectionId || null,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as KitchenProductSalesDbRow[]).map((row) => ({
    productId: row.product_id,
    sku: row.sku?.trim() || null,
    productName: row.product_name?.trim() || "未命名產品",
    brandName: row.brand_name?.trim() || "未分類品牌",
    categoryName: row.category_name?.trim() || "未分類",
    productSetName: row.product_set_name?.trim() || "未分類產品集",
    quantity: numericValue(row.quantity),
    totalAmount: numericValue(row.total_amount),
  }));
}

export async function fetchKitchenProductSalesPackages({
  startDate,
  endDate,
  brandId = "",
  productTypeName = "",
  collectionId = "",
}: KitchenProductSalesFilters): Promise<KitchenProductSalesPackageRow[]> {
  const { data, error } = await supabase.rpc("report_kitchen_package_sales", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_brand_id: brandId || null,
    p_product_type_name: productTypeName || null,
    p_collection_id: collectionId || null,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as KitchenProductSalesPackageDbRow[]).map((row) => ({
    packageId: row.package_id,
    sku: row.sku?.trim() || null,
    packageName: row.package_name?.trim() || "未命名套餐",
    brandName: row.brand_name?.trim() || "未分類品牌",
    quantity: numericValue(row.quantity),
    totalAmount: numericValue(row.total_amount),
  }));
}
