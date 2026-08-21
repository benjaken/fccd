import { supabase } from "@/lib/supabase";

export type RestaurantNewProductReportRow = {
  saleDate: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type RestaurantNewProductReportResult = {
  rows: RestaurantNewProductReportRow[];
  total: number;
};

type RestaurantNewProductReportRpcRow = {
  sale_date: string;
  product_id: string;
  product_name: string;
  quantity: number | string | null;
  total_count: number | string | null;
};

function formatDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function defaultNewProductReportDates(now = new Date()) {
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: formatDate(now),
  };
}

export async function fetchRestaurantNewProductReport({
  startDate,
  endDate,
  page,
  pageSize,
}: {
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}): Promise<RestaurantNewProductReportResult> {
  const { data, error } = await supabase.rpc("report_restaurant_new_products", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_offset: (page - 1) * pageSize,
    p_limit: pageSize,
  });
  if (error) throw new Error(error.message);

  const rpcRows = (data ?? []) as RestaurantNewProductReportRpcRow[];
  return {
    rows: rpcRows.map((row) => ({
      saleDate: row.sale_date,
      productId: row.product_id,
      productName: row.product_name,
      quantity: Number(row.quantity ?? 0),
    })),
    total: Number(rpcRows[0]?.total_count ?? 0),
  };
}
