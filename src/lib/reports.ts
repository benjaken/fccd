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

type ShopOrderQuantityDbRow = {
  order_date: string;
  shop_id: string;
  shop_name: string;
  product_id: string | null;
  product_name: string;
  unit: string | null;
  total_quantity: number | string;
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
