import { type ComponentType } from "react";
import {
  AlertTriangle,
  Beef,
  Boxes,
  Calculator,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileArchive,
  FileText,
  HandCoins,
  Handshake,
  History,
  LayoutDashboard,
  Leaf,
  ListFilter,
  Package,
  PackageCheck,
  Palette,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Snowflake,
  Split,
  StickyNote,
  Store,
  Tags,
  Truck,
  Users,
  Utensils,
  Warehouse,
} from "lucide-react";
import {
  pageAccessKey,
  REPORT_GROUP_PAGE_KEYS,
  REPORT_GROUP_ROUTES,
  REPORT_TAB_PERMISSION_KEYS,
} from "@/auth/use-page-access";
import { FROZEN_ACTION_PAGE_KEYS } from "@/lib/frozen-action-permissions";
import { KITCHEN_ACTION_PAGE_KEYS } from "@/lib/kitchen-action-permissions";
import { ORDER_ACTION_PAGE_KEYS } from "@/lib/order-action-permissions";

export type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

export type NavItem = {
  key: string;
  to: string;
  icon: Icon;
  permissionKey?: string;
  children?: NavItem[];
};

export const primaryNav: NavItem[] = [
  { key: "overview", to: "/", icon: LayoutDashboard },
  { key: "orders", to: "/orders", icon: ClipboardList },
  { key: "quotes", to: "/quotes", icon: FileText },
  { key: "products", to: "/products", icon: ShoppingBasket },
  { key: "frozen", to: "/frozen/raw-meat-inventory", icon: Snowflake },
  { key: "kitchen", to: "/kitchen", icon: Utensils },
  { key: "delivery", to: "/delivery", icon: Truck },
  { key: "restaurant", to: "/restaurant", icon: Store },
  { key: "reports", to: "/reports", icon: ChartNoAxesCombined },
  {
    key: "settings",
    to: "/settings",
    icon: Settings,
    permissionKey: "settings",
  },
];

export const secondaryNav: Record<string, NavItem[]> = {
  overview: [
    { key: "overview", to: "/", icon: LayoutDashboard, permissionKey: "overview" },
    {
      key: "followUp",
      to: "/follow-up",
      icon: ClipboardCheck,
      permissionKey: "overview.follow_up",
    },
    { key: "orders", to: "/orders", icon: ClipboardList, permissionKey: "orders" },
    { key: "quotes", to: "/quotes", icon: FileText, permissionKey: "quotes" },
    {
      key: "delivery",
      to: "/delivery",
      icon: Truck,
      permissionKey: "delivery",
    },
  ],
  orders: [
    {
      key: "ordersDashboard",
      to: "/orders/dashboard",
      icon: LayoutDashboard,
      permissionKey: "orders.dashboard",
    },
    {
      key: "allOrders",
      to: "/orders",
      icon: ClipboardList,
      permissionKey: "orders",
    },
    {
      key: "shopifyPendingOrders",
      to: "/orders/shopify-pending",
      icon: ShoppingBag,
      permissionKey: "orders.shopify_pending",
    },
    {
      key: "pendingOrders",
      to: "/orders/pending",
      icon: ClipboardCheck,
      permissionKey: "orders.pending",
    },
    {
      key: "notSentFactoryOrders",
      to: "/orders/not-sent-factory",
      icon: Factory,
      permissionKey: "orders.not_sent_factory",
    },
    {
      key: "unpaidOrders",
      to: "/orders/unpaid",
      icon: CircleDollarSign,
      permissionKey: "orders.unpaid",
    },
    {
      key: "monthlyOrders",
      to: "/orders/monthly",
      icon: CalendarRange,
      permissionKey: "orders.monthly",
    },
    {
      key: "splitOrders",
      to: "/orders/split",
      icon: Split,
      permissionKey: "orders.split",
    },
    {
      key: "kitchenNotesOrders",
      to: "/orders/kitchen-notes",
      icon: StickyNote,
      permissionKey: "orders.kitchen_notes",
    },
    {
      key: "reschedulePendingOrders",
      to: "/orders/reschedule-pending",
      icon: CalendarClock,
      permissionKey: "orders.reschedule_pending",
    },
    {
      key: "payments",
      to: "/orders/payments",
      icon: HandCoins,
      permissionKey: "orders.payments",
    },
    {
      key: "assignDriver",
      to: "/orders/drivers",
      icon: Truck,
      permissionKey: "orders.drivers",
    },
    {
      key: "productionCalendar",
      to: "/orders/calendar",
      icon: CalendarDays,
      permissionKey: "kitchen.calendar",
    },
    {
      key: "orderSettings",
      to: "/orders/settings/sale-partners",
      icon: Settings,
      permissionKey: "orders.settings",
      children: [
        {
          key: "salePartners",
          to: "/orders/settings/sale-partners",
          icon: Handshake,
          permissionKey: "orders.settings.sale_partners",
        },
        {
          key: "orderStatuses",
          to: "/orders/settings/statuses",
          icon: Palette,
          permissionKey: "orders.settings.statuses",
        },
        {
          key: "orderTags",
          to: "/orders/settings/tags",
          icon: Tags,
          permissionKey: "orders.settings",
        },
        {
          key: "orderShippingMethods",
          to: "/orders/settings/shipping",
          icon: PackageCheck,
          permissionKey: "orders.settings",
        },
        {
          key: "orderPaymentMethods",
          to: "/orders/settings/payments",
          icon: CircleDollarSign,
          permissionKey: "orders.settings",
        },
      ],
    },
  ],
  quotes: [
    {
      key: "cateringQuotes",
      to: "/quotes",
      icon: FileText,
      permissionKey: "quotes",
    },
    {
      key: "customers",
      to: "/quotes/customers",
      icon: Users,
      permissionKey: "quotes.customers",
    },
    {
      key: "followUp",
      to: "/quotes/follow-up",
      icon: ClipboardCheck,
      permissionKey: "quotes.follow_up",
    },
  ],
  products: [
    {
      key: "allProducts",
      to: "/products",
      icon: ShoppingBasket,
      permissionKey: "products",
    },
    {
      key: "cateringFood",
      to: "/products/catering",
      icon: Utensils,
      permissionKey: "products.catering",
    },
    {
      key: "lunchBoxes",
      to: "/products/lunchbox",
      icon: Boxes,
      permissionKey: "products.lunchbox",
    },
    {
      key: "alaCarte",
      to: "/products/ala-carte",
      icon: ShoppingBasket,
      permissionKey: "products.ala_carte",
    },
    {
      key: "packages",
      to: "/products/packages",
      icon: PackageCheck,
      permissionKey: "products.packages",
    },
  ],
  frozen: [
    {
      key: "rawMeatInventoryCalc",
      to: "/frozen/raw-meat-inventory",
      icon: Beef,
      permissionKey: "frozen.raw_meat_inventory",
    },
    {
      key: "preparedMeatInventoryCalc",
      to: "/frozen/prepared-meat-inventory",
      icon: Package,
      permissionKey: "frozen.prepared_meat_inventory",
    },
    {
      key: "sellingPriceCost",
      to: "/frozen/selling-price-cost",
      icon: Receipt,
      permissionKey: "frozen.selling_price_cost",
    },
    {
      key: "deliveryNotes",
      to: "/frozen/delivery-notes",
      icon: ClipboardList,
      permissionKey: "frozen.delivery_notes",
    },
    {
      key: "seasoningCost",
      to: "/frozen/seasoning-cost",
      icon: CircleDollarSign,
      permissionKey: "frozen.seasoning_cost",
    },
    {
      key: "calculationSettings",
      to: "/frozen/calculation-settings",
      icon: Calculator,
      permissionKey: "frozen.calculation_settings",
    },
    {
      key: "meatCustomers",
      to: "/frozen/customers",
      icon: Users,
      permissionKey: "frozen.meat_customers",
    },
    {
      key: "spiceUsage",
      to: "/frozen/spice-usage",
      icon: Leaf,
      permissionKey: "frozen.spice_usage",
    },
    {
      key: "yieldErrors",
      to: "/frozen/yield-errors",
      icon: AlertTriangle,
      permissionKey: "frozen.yield_errors",
    },
  ],
  kitchen: [
    { key: "kitchenOrders", to: "/kitchen", icon: Utensils, permissionKey: "kitchen" },
    {
      key: "ingredients",
      to: "/kitchen/ingredients",
      icon: Leaf,
      permissionKey: "kitchen.ingredients",
    },
    {
      key: "suppliers",
      to: "/kitchen/suppliers",
      icon: Users,
      permissionKey: "kitchen.suppliers",
    },
    {
      key: "packingStocktakes",
      to: "/kitchen/packing-stocktakes",
      icon: ClipboardList,
      permissionKey: "kitchen.packing_stocktakes",
    },
    {
      key: "ingredientStocktakes",
      to: "/kitchen/ingredient-stocktakes",
      icon: ClipboardList,
      permissionKey: "kitchen.ingredient_stocktakes",
    },
    {
      key: "kitchenCostInput",
      to: "/kitchen/cost-input",
      icon: CircleDollarSign,
      permissionKey: "kitchen.cost_input",
    },
    {
      key: "kitchenSettings",
      to: "/kitchen/settings",
      icon: Settings,
      permissionKey: "kitchen.settings",
    },
  ],
  delivery: [
    {
      key: "deliveryList",
      to: "/delivery",
      icon: ClipboardList,
      permissionKey: "delivery",
    },
    {
      key: "assignDriver",
      to: "/delivery/assign",
      icon: PackageCheck,
      permissionKey: "delivery.assign",
    },
  ],
  restaurant: [
    {
      key: "restaurant",
      to: "/restaurant",
      icon: Store,
      permissionKey: "restaurant",
    },
    {
      key: "inventory",
      to: "/restaurant/inventory",
      icon: Warehouse,
      permissionKey: "restaurant.inventory",
    },
    {
      key: "reports",
      to: "/restaurant/reports",
      icon: ChartNoAxesCombined,
      permissionKey: "restaurant.reports",
    },
    {
      key: "restaurantStaff",
      to: "/restaurant/staff",
      icon: Users,
      permissionKey: "restaurant.staff",
    },
    { key: "restaurantSettings", to: "/restaurant/settings/restaurants", icon: Settings, permissionKey: "restaurant.settings", children: [
      { key: "restaurantSettingsPage", to: "/restaurant/settings/restaurants", icon: Store, permissionKey: "restaurant.settings.restaurants" },
      { key: "restaurantDepartmentSettings", to: "/restaurant/settings/departments", icon: Users, permissionKey: "restaurant.settings.departments" },
      { key: "restaurantServicePeriods", to: "/restaurant/settings/service-periods", icon: CalendarClock, permissionKey: "restaurant.settings.service_periods" },
      { key: "restaurantPaymentMethods", to: "/restaurant/settings/payment-methods", icon: HandCoins, permissionKey: "restaurant.settings.payment_methods" },
      { key: "restaurantDeliveryPlatforms", to: "/restaurant/settings/delivery-platforms", icon: ShoppingBag, permissionKey: "restaurant.settings.delivery_platforms" },
      { key: "restaurantHolidays", to: "/restaurant/settings/holidays", icon: CalendarDays, permissionKey: "restaurant.settings.holidays" },
      { key: "restaurantRosterTimes", to: "/restaurant/settings/roster-times", icon: CalendarClock, permissionKey: "restaurant.settings.roster_times" },
      { key: "supplierCostCategories", to: "/restaurant/settings/supplier-cost-categories", icon: CircleDollarSign, permissionKey: "restaurant.settings.supplier_cost_categories" },
      { key: "restaurantInventoryItems", to: "/restaurant/settings/inventory-items", icon: Warehouse, permissionKey: "restaurant.settings.inventory_items" },
      { key: "restaurantPnlCostCategories", to: "/restaurant/settings/monthly-pnl-cost-categories", icon: CircleDollarSign, permissionKey: "restaurant.settings.monthly_pnl_cost_categories" },
    ] },
  ],
  reports: [
    {
      key: "reports",
      to: "/reports",
      icon: ChartNoAxesCombined,
      permissionKey: "reports",
      children: [
        {
          key: "frozenMeat",
          to: REPORT_GROUP_ROUTES.frozenMeat,
          icon: Beef,
          permissionKey: REPORT_GROUP_PAGE_KEYS.frozenMeat,
        },
        {
          key: "shops",
          to: REPORT_GROUP_ROUTES.shops,
          icon: Store,
          permissionKey: REPORT_GROUP_PAGE_KEYS.shops,
        },
      ],
    },
    {
      key: "finance",
      to: "/finance",
      icon: CircleDollarSign,
      permissionKey: "finance",
    },
  ],
  settings: [
    {
      key: "users",
      to: "/settings/users",
      icon: Users,
      permissionKey: "settings.users",
    },
    {
      key: "rolePermissions",
      to: "/settings/roles",
      icon: ShieldCheck,
      permissionKey: "settings.roles",
    },
    {
      key: "loginLogs",
      to: "/settings/login-logs",
      icon: History,
      permissionKey: "settings.login_logs",
    },
    {
      key: "orderLists",
      to: "/settings/order-lists",
      icon: ListFilter,
      permissionKey: "settings.order_lists",
    },
    {
      key: "attachments",
      to: "/settings/attachments",
      icon: FileArchive,
      permissionKey: "settings.attachments",
    },
  ],
};

export const SECTION_CHILD_KEYS: Record<string, string[]> = {
  overview: ["overview.follow_up"],
  orders: [
    "orders.dashboard",
    "orders.new",
    "orders.pending",
    "orders.not_sent_factory",
    "kitchen.calendar",
    "orders.payments",
    "orders.drivers",
    "orders.unpaid",
    "orders.delivered_unpaid",
    "orders.monthly",
    "orders.split",
    "orders.kitchen_notes",
    "orders.reschedule_pending",
    "orders.shopify_pending",
    "orders.settings",
    "orders.settings.statuses",
    "orders.settings.sale_partners",
    ...ORDER_ACTION_PAGE_KEYS,
  ],
  quotes: ["quotes.customers", "quotes.follow_up"],
  products: [
    "products.catering",
    "products.lunchbox",
    "products.ala_carte",
    "products.packages",
  ],
  frozen: [
    "frozen.raw_meat_inventory",
    "frozen.prepared_meat_inventory",
    "frozen.selling_price_cost",
    "frozen.delivery_notes",
    "frozen.seasoning_cost",
    "frozen.calculation_settings",
    "frozen.meat_customers",
    "frozen.spice_usage",
    "frozen.yield_errors",
    ...FROZEN_ACTION_PAGE_KEYS,
  ],
  kitchen: [
    "kitchen.inventory",
    "kitchen.ingredients",
    "kitchen.packing_stocktakes",
    "kitchen.ingredient_stocktakes",
    "kitchen.cost_input",
    "kitchen.suppliers",
    ...KITCHEN_ACTION_PAGE_KEYS,
  ],
  delivery: ["delivery.assign"],
  restaurant: ["restaurant.inventory", "restaurant.reports", "restaurant.staff", "restaurant.settings", "restaurant.settings.restaurants", "restaurant.settings.departments", "restaurant.settings.service_periods", "restaurant.settings.payment_methods", "restaurant.settings.delivery_platforms", "restaurant.settings.holidays", "restaurant.settings.roster_times", "restaurant.settings.supplier_cost_categories", "restaurant.settings.inventory_items", "restaurant.settings.monthly_pnl_cost_categories"],
  reports: [
    REPORT_GROUP_PAGE_KEYS.frozenMeat,
    REPORT_GROUP_PAGE_KEYS.shops,
    REPORT_TAB_PERMISSION_KEYS.shopOrderQuantities,
    REPORT_TAB_PERMISSION_KEYS.averageSupplyPrice,
    REPORT_TAB_PERMISSION_KEYS.productionCostPrice,
    REPORT_TAB_PERMISSION_KEYS.rawMeatAveragePrice,
    REPORT_TAB_PERMISSION_KEYS.preparedMeatStock,
    REPORT_TAB_PERMISSION_KEYS.rawMeatStock,
    REPORT_TAB_PERMISSION_KEYS.supplierPurchase,
  ],
  settings: [
    "settings.users",
    "settings.users.create",
    "settings.users.edit",
    "settings.users.change_password",
    "settings.roles",
    "settings.login_logs",
    "settings.attachments",
    "settings.order_lists",
    "settings.order_lists.edit",
  ],
};

export const workspaceLinks: Array<{
  key: string;
  to: string;
  icon: Icon;
  disabled?: boolean;
}> = [
  { key: "factory", to: "/factory", icon: Factory },
  { key: "delivery", to: "/driver-delivery", icon: Truck },
  { key: "customer", to: "/customer", icon: Users, disabled: true },
];

export function sectionFromPath(pathname: string) {
  const segment = pathname.split("/")[1] ?? "";
  if (segment === "follow-up" || segment === "inventory") return "overview";
  if (segment === "finance") return "reports";
  if (secondaryNav[segment]) return segment;
  // Exact home only — do not light 主頁 for profile/migration/unknown paths.
  if (!segment) return "overview";
  return "";
}

export function workspaceFromPath(pathname: string) {
  if (
    pathname === "/driver-delivery" ||
    pathname.startsWith("/driver-delivery/")
  ) {
    return "delivery";
  }
  if (pathname === "/customer" || pathname.startsWith("/customer/")) {
    return "customer";
  }
  return "factory";
}

export function isWorkspaceNavActive(key: string, pathname: string) {
  if (key === "factory") return false;
  return workspaceFromPath(pathname) === key;
}

/** Primary top-nav stays active for the whole section, including child routes. */
export function isPrimaryNavActive(
  section: string,
  key: string,
  isActive: boolean,
) {
  return isActive || (section !== "" && section === key);
}

export function navItemPermissionKey(item: NavItem) {
  return item.permissionKey ?? pageAccessKey(item.to);
}

export function isNavItemVisible(
  item: NavItem,
  canAccess: (pageKey: string) => boolean,
): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isNavItemVisible(child, canAccess));
  }
  return canAccess(navItemPermissionKey(item));
}

export function isNavPathActive(pathname: string, to: string, exact: boolean) {
  if (pathname === to) return true;
  if (exact) return false;
  return pathname.startsWith(`${to}/`);
}

/** Flatten primary + secondary destinations for the mobile drawer (no nested menus). */
export function flattenVisibleNavItems(
  items: NavItem[],
  canAccess: (pageKey: string) => boolean,
): NavItem[] {
  return items.flatMap((item) => {
    if (item.children?.length) {
      return flattenVisibleNavItems(item.children, canAccess);
    }
    return isNavItemVisible(item, canAccess) ? [item] : [];
  });
}

export function buildMobileDrawerNav(
  visiblePrimary: NavItem[],
  canAccess: (pageKey: string) => boolean,
): Array<{ groupKey: string; items: NavItem[] }> {
  const primaryKeys = new Set(visiblePrimary.map((item) => item.key));
  const primaryPaths = new Set(visiblePrimary.map((item) => item.to));

  return visiblePrimary
    .map((primary) => {
      const configured = secondaryNav[primary.key];
      const secondary = flattenVisibleNavItems(configured ?? [], canAccess);

      const items =
        primary.key === "overview"
          ? secondary.filter(
              (item) =>
                item.to === primary.to ||
                (!primaryPaths.has(item.to) && !primaryKeys.has(item.key)),
            )
          : configured
            ? secondary
            : [
                {
                  ...primary,
                  permissionKey: navItemPermissionKey(primary),
                },
              ];

      return { groupKey: primary.key, items };
    })
    .filter((group) => group.items.length > 0);
}

export function mobileNavLinkEnd(to: string, allHrefs: string[]) {
  return (
    to === "/" ||
    allHrefs.some((href) => href !== to && href.startsWith(`${to}/`))
  );
}
