import { supabase } from "@/lib/supabase";
import {
  defaultRestaurantPnlMonths,
  findDefaultPnlRestaurant,
} from "@/lib/restaurant-pnl-report";

export type RestaurantSalesCostRow = {
  monthStart: string;
  restaurantId: string;
  restaurantName: string;
  salesRestaurant: number;
  salesWaterBar: number;
  salesMisc: number;
  openingRestaurant: number;
  openingWaterBar: number;
  openingMisc: number;
  purchasesRestaurant: number;
  purchasesWaterBar: number;
  purchasesMisc: number;
  closingRestaurant: number;
  closingWaterBar: number;
  closingMisc: number;
  suppliers?: RestaurantSalesCostSupplier[];
};

export type SalesCostDepartmentValues = {
  restaurant: number;
  waterBar: number;
  misc: number;
  total: number;
};

export type RestaurantSalesCostSupplier = SalesCostDepartmentValues & {
  supplierId: string;
  supplierName: string;
};

type DbRow = {
  month_start: string;
  restaurant_id: string;
  restaurant_name: string;
  sales_restaurant: number | string | null;
  sales_water_bar: number | string | null;
  sales_misc: number | string | null;
  opening_restaurant: number | string | null;
  opening_water_bar: number | string | null;
  opening_misc: number | string | null;
  purchases_restaurant: number | string | null;
  purchases_water_bar: number | string | null;
  purchases_misc: number | string | null;
  closing_restaurant: number | string | null;
  closing_water_bar: number | string | null;
  closing_misc: number | string | null;
};

type DbSupplierRow = {
  month_start: string;
  supplier_id: string;
  supplier_name: string;
  purchases_restaurant: number | string | null;
  purchases_water_bar: number | string | null;
  purchases_misc: number | string | null;
};

export const defaultRestaurantSalesCostMonths = defaultRestaurantPnlMonths;
export const findDefaultSalesCostRestaurant = findDefaultPnlRestaurant;

export async function fetchRestaurantSalesCostReport({
  startMonth,
  endMonth,
  restaurantId,
}: {
  startMonth: string;
  endMonth: string;
  restaurantId: string;
}): Promise<RestaurantSalesCostRow[]> {
  const parameters = {
    p_start_month: `${startMonth}-01`,
    p_end_month: `${endMonth}-01`,
    p_restaurant_id: restaurantId,
  };
  const [reportResult, supplierResult] = await Promise.all([
    supabase.rpc("report_restaurant_sales_cost", parameters),
    supabase.rpc("report_restaurant_sales_cost_suppliers", parameters),
  ]);
  if (reportResult.error) throw new Error(reportResult.error.message);
  if (supplierResult.error) throw new Error(supplierResult.error.message);

  const number = (value: number | string | null) => Number(value ?? 0);
  const suppliersByMonth = new Map<string, RestaurantSalesCostSupplier[]>();
  for (const row of (supplierResult.data ?? []) as DbSupplierRow[]) {
    const restaurant = number(row.purchases_restaurant);
    const waterBar = number(row.purchases_water_bar);
    const misc = number(row.purchases_misc);
    const supplier = {
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      restaurant,
      waterBar,
      misc,
      total: restaurant + waterBar + misc,
    };
    suppliersByMonth.set(row.month_start, [
      ...(suppliersByMonth.get(row.month_start) ?? []),
      supplier,
    ]);
  }

  return ((reportResult.data ?? []) as DbRow[]).map((row) => ({
    monthStart: row.month_start,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    salesRestaurant: number(row.sales_restaurant),
    salesWaterBar: number(row.sales_water_bar),
    salesMisc: number(row.sales_misc),
    openingRestaurant: number(row.opening_restaurant),
    openingWaterBar: number(row.opening_water_bar),
    openingMisc: number(row.opening_misc),
    purchasesRestaurant: number(row.purchases_restaurant),
    purchasesWaterBar: number(row.purchases_water_bar),
    purchasesMisc: number(row.purchases_misc),
    closingRestaurant: number(row.closing_restaurant),
    closingWaterBar: number(row.closing_water_bar),
    closingMisc: number(row.closing_misc),
    suppliers: suppliersByMonth.get(row.month_start) ?? [],
  }));
}

export type RestaurantSalesCostMonth = RestaurantSalesCostRow & {
  suppliers: RestaurantSalesCostSupplier[];
  sales: SalesCostDepartmentValues;
  opening: SalesCostDepartmentValues;
  purchases: SalesCostDepartmentValues;
  closing: SalesCostDepartmentValues;
  costOfSales: SalesCostDepartmentValues;
  grossProfit: SalesCostDepartmentValues;
};

function values(restaurant: number, waterBar: number, misc: number) {
  return {
    restaurant,
    waterBar,
    misc,
    total: restaurant + waterBar + misc,
  };
}

export function buildRestaurantSalesCostReport(rows: RestaurantSalesCostRow[]) {
  const sortedRows = [...rows].sort((left, right) =>
    left.monthStart.localeCompare(right.monthStart),
  );
  const supplierCatalog = new Map<string, string>();
  for (const row of sortedRows) {
    for (const supplier of row.suppliers ?? []) {
      if (!supplierCatalog.has(supplier.supplierId)) {
        supplierCatalog.set(supplier.supplierId, supplier.supplierName);
      }
    }
  }

  return sortedRows
    .map<RestaurantSalesCostMonth>((row) => {
      const sales = values(row.salesRestaurant, row.salesWaterBar, row.salesMisc);
      const opening = values(
        row.openingRestaurant,
        row.openingWaterBar,
        row.openingMisc,
      );
      const purchases = values(
        row.purchasesRestaurant,
        row.purchasesWaterBar,
        row.purchasesMisc,
      );
      const closing = values(
        row.closingRestaurant,
        row.closingWaterBar,
        row.closingMisc,
      );
      const costOfSales = values(
        opening.restaurant + purchases.restaurant - closing.restaurant,
        opening.waterBar + purchases.waterBar - closing.waterBar,
        opening.misc + purchases.misc - closing.misc,
      );
      const grossProfit = values(
        sales.restaurant - costOfSales.restaurant,
        sales.waterBar - costOfSales.waterBar,
        sales.misc - costOfSales.misc,
      );

      return {
        ...row,
        suppliers: [...supplierCatalog].map(([supplierId, supplierName]) =>
          row.suppliers?.find((supplier) => supplier.supplierId === supplierId) ?? {
            supplierId,
            supplierName,
            restaurant: 0,
            waterBar: 0,
            misc: 0,
            total: 0,
          },
        ),
        sales,
        opening,
        purchases,
        closing,
        costOfSales,
        grossProfit,
      };
    });
}
