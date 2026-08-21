import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

type PermissionValue = {
  canAccess: boolean;
  canManage: boolean;
};

const EXACT_PAGE_KEYS: Array<{ prefix: string; pageKey: string }> = [
  { prefix: "/settings/users", pageKey: "settings.users" },
  { prefix: "/settings/roles", pageKey: "settings.roles" },
  { prefix: "/settings/login-logs", pageKey: "settings.login_logs" },
  { prefix: "/settings/attachments", pageKey: "settings.attachments" },
  { prefix: "/restaurant/settings/supplier-cost-categories", pageKey: "restaurant.settings.supplier_cost_categories" },
  { prefix: "/settings/order-lists", pageKey: "settings.order_lists" },
  { prefix: "/settings", pageKey: "settings" },
  { prefix: "/orders/pending", pageKey: "orders.pending" },
  { prefix: "/orders/dashboard", pageKey: "orders.dashboard" },
  { prefix: "/orders/not-sent-factory", pageKey: "orders.not_sent_factory" },
  { prefix: "/orders/calendar", pageKey: "kitchen.calendar" },
  { prefix: "/orders/production", pageKey: "kitchen.calendar" },
  { prefix: "/orders/payments", pageKey: "orders.payments" },
  { prefix: "/orders/drivers", pageKey: "orders.drivers" },
  { prefix: "/orders/unpaid", pageKey: "orders.unpaid" },
  { prefix: "/orders/delivered-unpaid", pageKey: "orders.delivered_unpaid" },
  { prefix: "/orders/monthly", pageKey: "orders.monthly" },
  { prefix: "/orders/split", pageKey: "orders.split" },
  { prefix: "/orders/kitchen-notes", pageKey: "orders.kitchen_notes" },
  {
    prefix: "/orders/reschedule-pending",
    pageKey: "orders.reschedule_pending",
  },
  { prefix: "/orders/shopify-pending", pageKey: "orders.shopify_pending" },
  { prefix: "/orders/new", pageKey: "orders.new" },
  {
    prefix: "/orders/settings/statuses",
    pageKey: "orders.settings.statuses",
  },
  {
    prefix: "/orders/settings/sale-partners",
    pageKey: "orders.settings.sale_partners",
  },
  { prefix: "/orders/settings", pageKey: "orders.settings" },
  { prefix: "/quotes/pdf-pages", pageKey: "quotes.pdf_pages" },
  { prefix: "/quotes/customers", pageKey: "quotes.customers" },
  { prefix: "/quotes/follow-up", pageKey: "quotes.follow_up" },
  { prefix: "/quotes/pending", pageKey: "quotes.pending" },
  { prefix: "/quotes/upcoming", pageKey: "quotes.upcoming" },
  { prefix: "/products/packages", pageKey: "products.packages" },
  { prefix: "/products/catering", pageKey: "products.catering" },
  { prefix: "/products/lunchbox", pageKey: "products.lunchbox" },
  { prefix: "/products/ala-carte", pageKey: "products.ala_carte" },
  {
    prefix: "/frozen/raw-meat-inventory",
    pageKey: "frozen.raw_meat_inventory",
  },
  {
    prefix: "/frozen/prepared-meat-inventory",
    pageKey: "frozen.prepared_meat_inventory",
  },
  {
    prefix: "/frozen/delivery-notes",
    pageKey: "frozen.delivery_notes",
  },
  {
    prefix: "/frozen/spice-usage",
    pageKey: "frozen.spice_usage",
  },
  {
    prefix: "/frozen/selling-price-cost",
    pageKey: "frozen.selling_price_cost",
  },
  {
    prefix: "/frozen/seasoning-cost",
    pageKey: "frozen.seasoning_cost",
  },
  {
    prefix: "/frozen/calculation-settings",
    pageKey: "frozen.calculation_settings",
  },
  {
    prefix: "/frozen/customers",
    pageKey: "frozen.meat_customers",
  },
  {
    prefix: "/frozen/yield-errors",
    pageKey: "frozen.yield_errors",
  },
  {
    prefix: "/frozen/supplier-quotes",
    pageKey: "frozen.supplier_quotes",
  },
  { prefix: "/frozen", pageKey: "frozen" },
  { prefix: "/kitchen/settings", pageKey: "kitchen.settings" },
  { prefix: "/kitchen/cost-input", pageKey: "kitchen.cost_input" },
  { prefix: "/kitchen/material-usage", pageKey: "kitchen.material_usage" },
  { prefix: "/kitchen/calendar", pageKey: "kitchen.calendar" },
  { prefix: "/kitchen/inventory", pageKey: "kitchen.inventory" },
  {
    prefix: "/kitchen/packing-stocktakes",
    pageKey: "kitchen.packing_stocktakes",
  },
  {
    prefix: "/kitchen/ingredient-stocktakes",
    pageKey: "kitchen.ingredient_stocktakes",
  },
  { prefix: "/kitchen/ingredients", pageKey: "kitchen.ingredients" },
  { prefix: "/kitchen/suppliers", pageKey: "kitchen.suppliers" },
  { prefix: "/delivery/assign", pageKey: "delivery.assign" },
  { prefix: "/restaurant/inventory", pageKey: "restaurant.inventory" },
  { prefix: "/restaurant/staff", pageKey: "restaurant.staff" },
  { prefix: "/restaurant/settings/inventory-items", pageKey: "restaurant.settings.inventory_items" },
  { prefix: "/restaurant/settings/restaurants", pageKey: "restaurant.settings.restaurants" },
  { prefix: "/restaurant/settings/departments", pageKey: "restaurant.settings.departments" },
  { prefix: "/restaurant/settings/service-periods", pageKey: "restaurant.settings.service_periods" },
  { prefix: "/restaurant/settings/payment-methods", pageKey: "restaurant.settings.payment_methods" },
  { prefix: "/restaurant/settings/delivery-platforms", pageKey: "restaurant.settings.delivery_platforms" },
  { prefix: "/restaurant/settings/new-products", pageKey: "restaurant.settings.new_products" },
  { prefix: "/restaurant/settings/holidays", pageKey: "restaurant.settings.holidays" },
  { prefix: "/restaurant/settings/roster-times", pageKey: "restaurant.settings.roster_times" },
  { prefix: "/restaurant/settings/monthly-pnl-cost-categories", pageKey: "restaurant.settings.monthly_pnl_cost_categories" },
  { prefix: "/restaurant/reports", pageKey: "restaurant.reports" },
  {
    prefix: "/reports/data-input-progress",
    pageKey: "reports.data_input_progress",
  },
  { prefix: "/reports/kitchen", pageKey: "kitchen.cost_input" },
  { prefix: "/reports/frozen-meat", pageKey: "reports.frozen_meat" },
  { prefix: "/reports/shops", pageKey: "reports.shops" },
  { prefix: "/reports/tabs/shop-sales", pageKey: "reports.shop_sales" },
  {
    prefix: "/reports/tabs/shop-sales-working-hours",
    pageKey: "reports.shop_sales_working_hours",
  },
  {
    prefix: "/reports/tabs/restaurant-sales-salary",
    pageKey: "reports.restaurant_sales_salary",
  },
  {
    prefix: "/reports/tabs/restaurant-pnl",
    pageKey: "reports.restaurant_pnl",
  },
  {
    prefix: "/reports/tabs/new-products",
    pageKey: "reports.new_products",
  },
  {
    prefix: "/reports/tabs/shop-order-quantities",
    pageKey: "reports.shop_order_quantities",
  },
  {
    prefix: "/reports/tabs/average-supply-price",
    pageKey: "reports.average_supply_price",
  },
  {
    prefix: "/reports/tabs/production-cost-price",
    pageKey: "reports.production_cost_price",
  },
  {
    prefix: "/reports/tabs/raw-meat-average-price",
    pageKey: "reports.raw_meat_average_price",
  },
  {
    prefix: "/reports/tabs/prepared-meat-stock",
    pageKey: "reports.prepared_meat_stock",
  },
  {
    prefix: "/reports/tabs/raw-meat-stock",
    pageKey: "reports.raw_meat_stock",
  },
  {
    prefix: "/reports/tabs/supplier-purchase",
    pageKey: "reports.supplier_purchase",
  },
  { prefix: "/follow-up", pageKey: "overview.follow_up" },
  { prefix: "/factory", pageKey: "workspace" },
  { prefix: "/driver-delivery", pageKey: "workspace" },
  { prefix: "/finance/cost-input", pageKey: "kitchen.cost_input" },
  { prefix: "/finance", pageKey: "finance" },
  { prefix: "/inventory", pageKey: "inventory" },
  { prefix: "/profile", pageKey: "profile" },
];

export const REPORT_TAB_PERMISSION_KEYS = {
  shopSales: "reports.shop_sales",
  shopSalesWorkingHours: "reports.shop_sales_working_hours",
  restaurantSalesSalary: "reports.restaurant_sales_salary",
  restaurantSalesCost: "reports.restaurant_sales_cost",
  restaurantPnl: "reports.restaurant_pnl",
  newProducts: "reports.new_products",
  shopOrderQuantities: "reports.shop_order_quantities",
  averageSupplyPrice: "reports.average_supply_price",
  productionCostPrice: "reports.production_cost_price",
  rawMeatAveragePrice: "reports.raw_meat_average_price",
  preparedMeatStock: "reports.prepared_meat_stock",
  rawMeatStock: "reports.raw_meat_stock",
  supplierPurchase: "reports.supplier_purchase",
} as const;

export type ReportTabKey = keyof typeof REPORT_TAB_PERMISSION_KEYS;
export type ReportGroup = "frozenMeat" | "shops";

export const REPORT_GROUP_PAGE_KEYS = {
  dataInputProgress: "reports.data_input_progress",
  frozenMeat: "reports.frozen_meat",
  shops: "reports.shops",
} as const;

export const REPORT_GROUP_ROUTES = {
  dataInputProgress: "/reports/data-input-progress",
  frozenMeat: "/reports/frozen-meat",
  shops: "/reports/shops",
} as const;

export const REPORT_GROUP_TABS = {
  frozenMeat: [
    "shopOrderQuantities",
    "averageSupplyPrice",
    "productionCostPrice",
    "rawMeatAveragePrice",
    "preparedMeatStock",
    "rawMeatStock",
    "supplierPurchase",
  ],
  shops: ["shopSales", "shopSalesWorkingHours", "restaurantSalesSalary", "restaurantSalesCost", "restaurantPnl", "newProducts"],
} as const satisfies Record<ReportGroup, readonly ReportTabKey[]>;

function tabPermissionKeys(tabs: readonly ReportTabKey[]) {
  return tabs.map((tab) => REPORT_TAB_PERMISSION_KEYS[tab]);
}

const PAGE_ACCESS_CHILD_KEYS: Record<string, string[]> = {
  "kitchen.settings": ["kitchen.settings.cook_types"],
  [REPORT_GROUP_PAGE_KEYS.frozenMeat]: tabPermissionKeys(
    REPORT_GROUP_TABS.frozenMeat,
  ),
  [REPORT_GROUP_PAGE_KEYS.shops]: tabPermissionKeys(REPORT_GROUP_TABS.shops),
  reports: [
    REPORT_GROUP_PAGE_KEYS.frozenMeat,
    REPORT_GROUP_PAGE_KEYS.shops,
    ...tabPermissionKeys(REPORT_GROUP_TABS.frozenMeat),
    ...tabPermissionKeys(REPORT_GROUP_TABS.shops),
  ],
  finance: [REPORT_GROUP_PAGE_KEYS.dataInputProgress, "kitchen.cost_input"],
  "orders.settings": [
    "orders.settings.statuses",
    "orders.settings.sale_partners",
  ],
  "settings.order_lists": ["settings.order_lists.edit"],
};

export function pageAccessKey(pathname: string) {
  if (pathname === "/" || pathname === "") return "overview";

  for (const entry of EXACT_PAGE_KEYS) {
    if (
      pathname === entry.prefix ||
      pathname.startsWith(`${entry.prefix}/`) ||
      pathname.startsWith(`${entry.prefix}?`)
    ) {
      return entry.pageKey;
    }
  }

  const segment = pathname.split("/").filter(Boolean)[0];
  return segment || "overview";
}

export function useCurrentPageAccess() {
  const { user, profile } = useAuth();
  const authorizationRole =
    typeof user?.app_metadata?.role === "string"
      ? user.app_metadata.role
      : profile?.role;
  return usePageAccess(authorizationRole);
}

export function usePageAccess(role: string | null | undefined) {
  const isSuperAdmin = role === "Super Admin";
  const [permissions, setPermissions] = useState<Map<string, PermissionValue>>(
    new Map(),
  );
  const [loading, setLoading] = useState(!isSuperAdmin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      setPermissions(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    if (!role) {
      setPermissions(new Map());
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void supabase
      .from("role_page_permissions")
      .select("page_key,can_access,can_manage")
      .eq("role", role)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setPermissions(new Map());
          setError(loadError.code || "page_permissions_failed");
        } else {
          setPermissions(
            new Map(
              (data ?? []).map((item) => [
                item.page_key,
                {
                  canAccess: item.can_access,
                  canManage: item.can_manage,
                },
              ]),
            ),
          );
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isSuperAdmin, role]);

  return useMemo(
    () => ({
      isSuperAdmin,
      loading,
      error,
      canAccess: (pageKey: string) => {
        if (pageKey === "profile" || pageKey === "workspace" || isSuperAdmin) return true;
        if (permissions.get(pageKey)?.canAccess === true) return true;
        return (PAGE_ACCESS_CHILD_KEYS[pageKey] ?? []).some(
          (child) => permissions.get(child)?.canAccess === true,
        );
      },
      canManage: (pageKey: string) =>
        isSuperAdmin || permissions.get(pageKey)?.canManage === true,
      /** Section nav: visible if the section itself or any of its children is allowed. */
      canAccessSection: (pageKey: string, childKeys: string[] = []) => {
        if (pageKey === "profile" || pageKey === "workspace" || isSuperAdmin) return true;
        if (permissions.get(pageKey)?.canAccess === true) return true;
        return childKeys.some(
          (child) => permissions.get(child)?.canAccess === true,
        );
      },
    }),
    [error, isSuperAdmin, loading, permissions],
  );
}
