import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

export type PagePermissionValue = {
  canAccess: boolean;
  canManage: boolean;
  parentPageKey: string | null;
};

const WORKSPACE_CONTAINER_KEYS = new Set([
  "workspace",
  "workspace.factory",
  "workspace.restaurant",
  "workspace.delivery",
  "workspace.customer",
]);

function hasAccessibleAncestors(
  pageKey: string,
  permissions: ReadonlyMap<string, PagePermissionValue>,
  visited = new Set<string>(),
) {
  if (visited.has(pageKey)) return false;

  const parentPageKey = permissions.get(pageKey)?.parentPageKey;
  if (!parentPageKey) return true;

  const parent = permissions.get(parentPageKey);
  // Keep the legacy parent fallback when the parent row is not registered yet.
  if (!parent) return true;
  if (!parent.canAccess) return false;

  const nextVisited = new Set(visited);
  nextVisited.add(pageKey);
  return hasAccessibleAncestors(parentPageKey, permissions, nextVisited);
}

/**
 * Resolve page access without allowing a stale child grant to bypass a
 * disabled parent permission. Containers can still be inferred from children
 * when the relevant parent row has not been registered in an older database.
 */
export function hasEffectivePageAccess(
  pageKey: string,
  permissions: ReadonlyMap<string, PagePermissionValue>,
  visited = new Set<string>(),
): boolean {
  if (pageKey === "profile") return true;
  if (visited.has(pageKey)) return false;

  const permission = permissions.get(pageKey);
  const directAccess =
    permission?.canAccess === true &&
    hasAccessibleAncestors(pageKey, permissions);
  const childKeys = PAGE_ACCESS_CHILD_KEYS[pageKey] ?? [];

  // Workspace links lead to a container whose actual routes are the child
  // pages. Do not leave a dead top-level link visible after all children have
  // been disabled. Keep the legacy fallback if those child rows are absent.
  if (WORKSPACE_CONTAINER_KEYS.has(pageKey)) {
    const registeredChildren = childKeys.filter((child) =>
      permissions.has(child),
    );
    if (registeredChildren.length > 0) {
      const parentAllowsChildren =
        !permission ||
        (permission.canAccess && hasAccessibleAncestors(pageKey, permissions));
      if (!parentAllowsChildren) return false;
      return registeredChildren.some((child) =>
        hasEffectivePageAccess(child, permissions, new Set(visited).add(pageKey)),
      );
    }
  }

  const nextVisited = new Set(visited);
  nextVisited.add(pageKey);
  if (directAccess) return true;
  return childKeys.some((child) =>
    hasEffectivePageAccess(child, permissions, nextVisited),
  );
}

const EXACT_PAGE_KEYS: Array<{ prefix: string; pageKey: string }> = [
  { prefix: "/settings/employees", pageKey: "settings.employees" },
  { prefix: "/settings/users", pageKey: "settings.users" },
  { prefix: "/settings/roles", pageKey: "settings.roles" },
  { prefix: "/settings/login-logs", pageKey: "settings.login_logs" },
  { prefix: "/settings/wati-email-logs", pageKey: "settings.wati_email_logs" },
  { prefix: "/settings/notifications", pageKey: "settings.notifications" },
  { prefix: "/settings/dictionaries", pageKey: "settings.dictionaries" },
  { prefix: "/settings/districts", pageKey: "settings.districts" },
  { prefix: "/settings/attachments", pageKey: "settings.attachments" },
  { prefix: "/restaurant/settings/supplier-cost-categories", pageKey: "restaurant.settings.supplier_cost_categories" },
  { prefix: "/settings/order-lists", pageKey: "settings.order_lists" },
  { prefix: "/settings", pageKey: "settings" },
  { prefix: "/orders/pending", pageKey: "orders.pending" },
  // Keep legacy bookmarks accessible through the dashboard's new home location.
  { prefix: "/orders/dashboard", pageKey: "overview.follow_up" },
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
    prefix: "/orders/settings/wati-notifications",
    pageKey: "orders.settings.wati_notifications",
  },
  {
    prefix: "/orders/settings/email-notifications",
    pageKey: "orders.settings.email_notifications",
  },
  {
    prefix: "/orders/settings/first-notification-recipients",
    pageKey: "orders.settings.first_notification_recipients",
  },
  {
    prefix: "/orders/settings/statuses",
    pageKey: "orders.settings.statuses",
  },
  {
    prefix: "/orders/settings/sale-partners",
    pageKey: "orders.settings.sale_partners",
  },
  {
    prefix: "/orders/settings/order-list-tips",
    pageKey: "settings.order_lists",
  },
  {
    prefix: "/orders/settings/shipping-fees",
    pageKey: "orders.settings.shipping_fees",
  },
  {
    prefix: "/orders/settings/add-on-block-dates",
    pageKey: "orders.settings.addon_block_dates",
  },
  {
    prefix: "/orders/settings/add-ons",
    pageKey: "orders.settings.addons",
  },
  { prefix: "/orders/settings", pageKey: "orders.settings" },
  { prefix: "/quotes/pdf-pages", pageKey: "quotes.pdf_pages" },
  { prefix: "/quotes/customers", pageKey: "quotes.customers" },
  // Keep legacy pending-quote bookmarks accessible through the main quotes page.
  { prefix: "/quotes/follow-up", pageKey: "quotes" },
  { prefix: "/quotes/pending", pageKey: "quotes" },
  { prefix: "/quotes/upcoming", pageKey: "quotes.upcoming" },
  { prefix: "/quotes/large", pageKey: "quotes" },
  { prefix: "/quotes/recent-open", pageKey: "quotes" },
  { prefix: "/products/packages", pageKey: "products.packages" },
  { prefix: "/products/shopify-pending", pageKey: "products.shopify_pending" },
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
  { prefix: "/delivery/fleets", pageKey: "delivery.fleets" },
  { prefix: "/delivery/surcharges", pageKey: "delivery" },
  { prefix: "/restaurant-workspace/records", pageKey: "workspace.restaurant.records" },
  { prefix: "/restaurant-workspace/daily-sales", pageKey: "restaurant.daily_sales" },
  { prefix: "/restaurant-workspace/daily-purchases", pageKey: "restaurant.daily_purchases" },
  { prefix: "/restaurant-workspace/inventory", pageKey: "restaurant.inventory" },
  { prefix: "/restaurant-workspace/monthly-expenses", pageKey: "restaurant.monthly_expenses" },
  { prefix: "/restaurant-workspace", pageKey: "workspace.restaurant.shop_order" },
  { prefix: "/restaurant/ordering/suppliers", pageKey: "restaurant.ordering.suppliers" },
  { prefix: "/restaurant/ordering/requests", pageKey: "restaurant.ordering.requests" },
  { prefix: "/restaurant/ordering/records", pageKey: "restaurant.ordering.records" },
  { prefix: "/restaurant/ordering/phonebook", pageKey: "restaurant.ordering.phonebook" },
  { prefix: "/restaurant/ordering/review", pageKey: "restaurant.ordering.review" },
  { prefix: "/restaurant/daily-purchases", pageKey: "restaurant.daily_purchases" },
  { prefix: "/restaurant/daily-sales", pageKey: "restaurant.daily_sales" },
  { prefix: "/restaurant/monthly-expenses", pageKey: "restaurant.monthly_expenses" },
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
  {
    prefix: "/reports/shops/sales-working-hours",
    pageKey: "reports.shop_sales_working_hours",
  },
  {
    prefix: "/reports/shops/sales-salary",
    pageKey: "reports.restaurant_sales_salary",
  },
  {
    prefix: "/reports/shops/sales-cost",
    pageKey: "reports.restaurant_sales_cost",
  },
  {
    prefix: "/reports/shops/pnl",
    pageKey: "reports.restaurant_pnl",
  },
  {
    prefix: "/reports/shops/new-products",
    pageKey: "reports.new_products",
  },
  {
    prefix: "/reports/frozen-meat/average-supply-price",
    pageKey: "reports.average_supply_price",
  },
  {
    prefix: "/reports/frozen-meat/production-cost-price",
    pageKey: "reports.production_cost_price",
  },
  {
    prefix: "/reports/frozen-meat/raw-meat-average-price",
    pageKey: "reports.raw_meat_average_price",
  },
  {
    prefix: "/reports/frozen-meat/prepared-meat-stock",
    pageKey: "reports.prepared_meat_stock",
  },
  {
    prefix: "/reports/frozen-meat/raw-meat-stock",
    pageKey: "reports.raw_meat_stock",
  },
  {
    prefix: "/reports/frozen-meat/supplier-purchase",
    pageKey: "reports.supplier_purchase",
  },
  { prefix: "/reports/frozen-meat", pageKey: "reports.frozen_meat" },
  { prefix: "/reports/shops", pageKey: "reports.shops" },
  { prefix: "/follow-up", pageKey: "overview.follow_up" },
  {
    prefix: "/factory/multi-day-menu",
    pageKey: "workspace.factory.multi_day_menu",
  },
  {
    prefix: "/factory/meat-delivery-note",
    pageKey: "workspace.factory.meat_delivery_note",
  },
  { prefix: "/factory/order", pageKey: "workspace.factory.order" },
  {
    prefix: "/factory/production-calendar",
    pageKey: "workspace.factory.production_calendar",
  },
  { prefix: "/factory", pageKey: "workspace.factory.board" },
  {
    prefix: "/driver-delivery/available",
    pageKey: "workspace.delivery.available",
  },
  {
    prefix: "/driver-delivery/accepted",
    pageKey: "workspace.delivery.accepted",
  },
  {
    prefix: "/driver-delivery/fleet",
    pageKey: "workspace.delivery.fleet",
  },
  {
    prefix: "/driver-delivery/income",
    pageKey: "workspace.delivery.income",
  },
  {
    prefix: "/driver-delivery/districts",
    pageKey: "workspace.delivery.districts",
  },
  {
    prefix: "/driver-delivery/settings",
    pageKey: "workspace.delivery.settings",
  },
  { prefix: "/driver-delivery", pageKey: "workspace.delivery" },
  { prefix: "/customer", pageKey: "workspace.customer.portal" },
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

export const REPORT_TAB_ROUTES = {
  shopSales: "/reports/shops",
  shopSalesWorkingHours: "/reports/shops/sales-working-hours",
  restaurantSalesSalary: "/reports/shops/sales-salary",
  restaurantSalesCost: "/reports/shops/sales-cost",
  restaurantPnl: "/reports/shops/pnl",
  newProducts: "/reports/shops/new-products",
  shopOrderQuantities: "/reports/frozen-meat",
  averageSupplyPrice: "/reports/frozen-meat/average-supply-price",
  productionCostPrice: "/reports/frozen-meat/production-cost-price",
  rawMeatAveragePrice: "/reports/frozen-meat/raw-meat-average-price",
  preparedMeatStock: "/reports/frozen-meat/prepared-meat-stock",
  rawMeatStock: "/reports/frozen-meat/raw-meat-stock",
  supplierPurchase: "/reports/frozen-meat/supplier-purchase",
} as const satisfies Record<ReportTabKey, string>;

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
  restaurant: ["restaurant.daily_sales", "restaurant.daily_purchases", "restaurant.inventory"],
  "kitchen.settings": ["kitchen.settings.cook_types"],
  "restaurant.settings": [
    "restaurant.settings.restaurants",
    "restaurant.settings.departments",
    "restaurant.settings.service_periods",
    "restaurant.settings.payment_methods",
    "restaurant.settings.delivery_platforms",
    "restaurant.settings.new_products",
    "restaurant.settings.holidays",
    "restaurant.settings.roster_times",
    "restaurant.settings.supplier_cost_categories",
    "restaurant.settings.inventory_items",
    "restaurant.settings.monthly_pnl_cost_categories",
  ],
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
    "orders.settings.wati_notifications",
    "orders.settings.email_notifications",
    "orders.settings.first_notification_recipients",
    "orders.settings.statuses",
    "orders.settings.sale_partners",
    "orders.settings.shipping_fees",
    "orders.settings.addons",
    "orders.settings.addon_block_dates",
  ],
  "settings.order_lists": ["settings.order_lists.edit"],
  "settings.districts": ["settings.districts.edit"],
  workspace: [
    "workspace.factory",
    "workspace.restaurant",
    "workspace.delivery",
    "workspace.customer",
  ],
  "workspace.restaurant": [
    "workspace.restaurant.shop_order",
    "workspace.restaurant.records",
  ],
  "restaurant.ordering": [
    "restaurant.ordering.suppliers",
    "restaurant.ordering.requests",
    "restaurant.ordering.records",
    "restaurant.ordering.phonebook",
    "restaurant.ordering.review",
  ],
  "workspace.factory": [
    "workspace.factory.board",
    "workspace.factory.order",
    "workspace.factory.meat_delivery_note",
    "workspace.factory.multi_day_menu",
    "workspace.factory.production_calendar",
  ],
  "workspace.delivery": [
    "workspace.delivery.available",
    "workspace.delivery.accepted",
    "workspace.delivery.fleet",
    "workspace.delivery.income",
    "workspace.delivery.districts",
    "workspace.delivery.settings",
  ],
  "workspace.customer": ["workspace.customer.portal"],
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
  const { profile } = useAuth();
  return usePageAccess(profile?.role);
}

export function usePageAccess(role: string | null | undefined) {
  const [permissions, setPermissions] = useState<
    Map<string, PagePermissionValue>
  >(
    new Map(),
  );
  const [loading, setLoading] = useState(Boolean(role));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!role) {
      setPermissions(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void supabase
      .from("role_page_permissions")
      .select(
        "page_key,can_access,can_manage,app_pages!inner(parent_page_key)",
      )
      .eq("role", role)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setPermissions(new Map());
          setError(loadError.code || "page_permissions_failed");
        } else {
          setPermissions(
            new Map(
              (data ?? []).map((item) => {
                const page = Array.isArray(item.app_pages)
                  ? item.app_pages[0]
                  : item.app_pages;
                return [
                  item.page_key,
                  {
                    canAccess: item.can_access,
                    canManage: item.can_manage,
                    parentPageKey: page?.parent_page_key ?? null,
                  },
                ];
              }),
            ),
          );
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [role]);

  return useMemo(
    () => ({
      loading,
      error,
      hasPermission: (pageKey: string) => permissions.has(pageKey),
      canAccess: (pageKey: string) =>
        hasEffectivePageAccess(pageKey, permissions),
      canManage: (pageKey: string) =>
        permissions.get(pageKey)?.canManage === true,
      /** Section nav: visible if the section itself or any of its children is allowed. */
      canAccessSection: (pageKey: string, childKeys: string[] = []) => {
        if (pageKey === "profile") return true;
        return (
          hasEffectivePageAccess(pageKey, permissions) ||
          childKeys.some((child) => hasEffectivePageAccess(child, permissions))
        );
      },
    }),
    [error, loading, permissions],
  );
}
