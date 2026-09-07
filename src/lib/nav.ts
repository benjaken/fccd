import { type ComponentType } from "react";
import {
  AlertTriangle,
  BellRing,
  Beef,
  Boxes,
  Calculator,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileArchive,
  FileImage,
  FilePenLine,
  FileText,
  HandCoins,
  Handshake,
  History,
  LayoutDashboard,
  Landmark,
  Leaf,
  ListFilter,
  Mail,
  MapPinned,
  MessageCircleMore,
  Package,
  PackageCheck,
  PackagePlus,
  Phone,
  Palette,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Snowflake,
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
  REPORT_GROUP_TABS,
  REPORT_TAB_PERMISSION_KEYS,
  REPORT_TAB_ROUTES,
} from "@/auth/use-page-access";
import { FROZEN_ACTION_PAGE_KEYS } from "@/lib/frozen-action-permissions";
import {
  KITCHEN_ACTION_PAGE_KEYS,
  KITCHEN_MATERIAL_USAGE_PAGE_KEY,
} from "@/lib/kitchen-action-permissions";
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
  {
    key: "followUp",
    to: "/follow-up",
    icon: ClipboardCheck,
    permissionKey: "overview.follow_up",
  },
  { key: "orders", to: "/orders", icon: ClipboardList },
  { key: "quotes", to: "/quotes", icon: FileText },
  {
    key: "customerSection",
    to: "/quotes/customers",
    icon: Users,
    permissionKey: "customerSection",
  },
  { key: "products", to: "/products", icon: ShoppingBasket },
  { key: "frozen", to: "/frozen/raw-meat-inventory", icon: Snowflake },
  { key: "kitchen", to: "/kitchen", icon: Utensils },
  { key: "delivery", to: "/delivery", icon: Truck },
  { key: "restaurant", to: "/restaurant/daily-sales", icon: Store },
  { key: "reports", to: "/reports", icon: ChartNoAxesCombined },
  {
    key: "settings",
    to: "/settings",
    icon: Settings,
    permissionKey: "settings",
  },
];

/**
 * Business-grouped menu (style one). Destinations still point to the same
 * canonical routes used by style two; this only changes where links appear.
 */
export const businessPrimaryNav: NavItem[] = [
  { key: "overview", to: "/", icon: LayoutDashboard, permissionKey: "overview" },
  { key: "followUp", to: "/follow-up?nav=follow-up.catering", icon: ClipboardCheck, permissionKey: "overview.follow_up" },
  { key: "catering", to: "/orders?nav=catering.orders", icon: Utensils, permissionKey: "orders" },
  { key: "frozen", to: "/frozen/raw-meat-inventory?nav=frozen", icon: Snowflake, permissionKey: "frozen.raw_meat_inventory" },
  { key: "restaurant", to: "/restaurant/daily-sales?nav=restaurant", icon: Store, permissionKey: "restaurant.daily_sales" },
  { key: "accountingFollowUp", to: "/reports/kitchen?nav=accounting.cateringData", icon: Calculator },
  { key: "reports", to: "/reports?nav=reports", icon: ChartNoAxesCombined, permissionKey: "reports" },
  { key: "settings", to: "/settings?nav=settings", icon: Settings, permissionKey: "settings" },
];

export const businessCategoryNav: Record<string, NavItem[]> = {
  followUp: [
    { key: "catering", to: "/follow-up?nav=follow-up.catering", icon: Utensils, permissionKey: "overview.follow_up" },
    { key: "restaurant", to: "/follow-up?nav=follow-up.restaurant", icon: Store, permissionKey: "restaurant.daily_sales" },
    { key: "frozen", to: "/follow-up?nav=follow-up.frozen", icon: Snowflake, permissionKey: "frozen.raw_meat_inventory" },
  ],
  accountingFollowUp: [
    { key: "cateringData", to: "/reports/kitchen?nav=accounting.cateringData", icon: Utensils, permissionKey: "kitchen.cost_input" },
    { key: "restaurantData", to: `${REPORT_GROUP_ROUTES.shops}?nav=accounting.restaurantData`, icon: Store, permissionKey: REPORT_GROUP_PAGE_KEYS.shops },
    { key: "factoryData", to: `${REPORT_GROUP_ROUTES.frozenMeat}?nav=accounting.factoryData`, icon: Factory, permissionKey: REPORT_GROUP_PAGE_KEYS.frozenMeat },
  ],
  catering: [
    { key: "orders", to: "/orders?nav=catering.orders", icon: ClipboardList, permissionKey: "orders" },
    { key: "allQuotes", to: "/quotes?nav=catering.quotes", icon: FileText, permissionKey: "quotes" },
    { key: "customers", to: "/quotes/customers?nav=catering.customerSection", icon: Users, permissionKey: "quotes.customers" },
    { key: "products", to: "/products?nav=catering.products", icon: ShoppingBasket, permissionKey: "products" },
    { key: "kitchen", to: "/kitchen?nav=catering.kitchen", icon: Utensils, permissionKey: "kitchen" },
    { key: "delivery", to: "/delivery?nav=catering.delivery", icon: Truck, permissionKey: "delivery" },
  ],
};

const followUpCateringNav: NavItem[] = [
  { key: "reminders", to: "/follow-up?nav=follow-up.catering", icon: BellRing, permissionKey: "overview.follow_up" },
  { key: "pendingEntry", to: "/orders?tab=shopify-pending&nav=follow-up.catering", icon: ShoppingBag, permissionKey: "orders" },
  { key: "pendingQuote", to: "/quotes/pending?nav=follow-up.catering", icon: FileText, permissionKey: "quotes" },
  { key: "pendingPayment", to: "/orders?tab=unpaid&nav=follow-up.catering", icon: HandCoins, permissionKey: "orders" },
  { key: "pendingFactory", to: "/orders?tab=not-sent-factory&nav=follow-up.catering", icon: Factory, permissionKey: "orders" },
  { key: "pendingDriver", to: "/orders?status=awaitingDriver&nav=follow-up.catering", icon: Truck, permissionKey: "orders" },
  { key: "customerOrderInquiries", to: "/orders/customer-inquiries?nav=follow-up.catering", icon: MessageCircleMore, permissionKey: "orders.customer_inquiries" },
  { key: "pendingProductReview", to: "/products/shopify-pending?nav=follow-up.catering", icon: ShoppingBasket, permissionKey: "products.shopify_pending" },
];

function kitchenReportNavItems(): NavItem[] {
  return [
    { key: "kitchenSalesCost", to: "/reports/kitchen", icon: ChartNoAxesCombined, permissionKey: "kitchen.cost_input" },
    { key: "kitchenChannelSales", to: "/reports/kitchen/channel-sales", icon: ChartNoAxesCombined, permissionKey: "kitchen.cost_input" },
    { key: "kitchenProductSales", to: "/reports/kitchen/product-sales", icon: ChartNoAxesCombined, permissionKey: "kitchen.cost_input" },
    { key: "kitchenAdvertisingPerformance", to: "/reports/kitchen/advertising-performance", icon: ChartNoAxesCombined, permissionKey: "kitchen.cost_input" },
    { key: "festivalOrderGeneration", to: "/reports/kitchen/festival-orders", icon: ChartNoAxesCombined, permissionKey: "kitchen.cost_input" },
  ];
}

function reportGroupNavItems(group: "frozenMeat" | "shops"): NavItem[] {
  return REPORT_GROUP_TABS[group].map((tab) => ({
    key: tab,
    to: REPORT_TAB_ROUTES[tab],
    icon: ChartNoAxesCombined,
    permissionKey: REPORT_TAB_PERMISSION_KEYS[tab],
  }));
}

function cateringAccountingNavItems(): NavItem[] {
  return [
    ...kitchenReportNavItems(),
    {
      key: "dataInputProgress",
      to: REPORT_GROUP_ROUTES.dataInputProgress,
      icon: ClipboardCheck,
      permissionKey: REPORT_GROUP_PAGE_KEYS.dataInputProgress,
    },
    {
      key: "operationsExpenseInput",
      to: "/finance/cost-input",
      icon: CircleDollarSign,
      permissionKey: "kitchen.cost_input",
    },
    {
      key: "purchaseExpenseInput",
      to: "/finance/cost-input?tab=monthly-suppliers",
      icon: Receipt,
      permissionKey: "kitchen.cost_input",
    },
  ];
}

export const secondaryNav: Record<string, NavItem[]> = {
  overview: [
    { key: "overview", to: "/", icon: LayoutDashboard, permissionKey: "overview" },
    { key: "orders", to: "/orders", icon: ClipboardList, permissionKey: "orders" },
    { key: "quotes", to: "/quotes", icon: FileText, permissionKey: "quotes" },
    {
      key: "delivery",
      to: "/delivery",
      icon: Truck,
      permissionKey: "delivery",
    },
  ],
  followUp: [
    {
      key: "followUp",
      to: "/follow-up",
      icon: ClipboardCheck,
      permissionKey: "overview.follow_up",
    },
  ],
  orders: [
    {
      key: "allOrders",
      to: "/orders",
      icon: ClipboardList,
      permissionKey: "orders",
    },
    {
      key: "customerOrderInquiries",
      to: "/orders/customer-inquiries",
      icon: MessageCircleMore,
      permissionKey: "orders.customer_inquiries",
    },
    {
      key: "payments",
      to: "/orders/payments/bank-arrival-date",
      icon: HandCoins,
      permissionKey: "orders.payments",
      children: [
        {
          key: "bankArrivalDateInput",
          to: "/orders/payments/bank-arrival-date",
          icon: Landmark,
          permissionKey: "orders.payments",
        },
        {
          key: "masoftInvoiceReceipts",
          to: "/orders/payments/masoft-invoices",
          icon: FileText,
          permissionKey: "orders.payments",
        },
      ],
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
          key: "orderWatiNotifications",
          to: "/orders/settings/wati-notifications",
          icon: MessageCircleMore,
          permissionKey: "orders.settings.wati_notifications",
        },
        {
          key: "orderEmailNotifications",
          to: "/orders/settings/email-notifications",
          icon: Mail,
          permissionKey: "orders.settings.email_notifications",
        },
        {
          key: "orderFirstNotificationRecipients",
          to: "/orders/settings/first-notification-recipients",
          icon: BellRing,
          permissionKey: "orders.settings.first_notification_recipients",
        },
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
          key: "customerTags",
          to: "/orders/settings/customer-tags",
          icon: Tags,
          permissionKey: "orders.settings",
        },
        {
          key: "costOptions",
          to: "/orders/settings/cost-options",
          icon: CircleDollarSign,
          permissionKey: "orders.settings",
        },
        {
          key: "supplierExpenses",
          to: "/orders/settings/supplier-expenses",
          icon: Receipt,
          permissionKey: "orders.settings",
        },
        {
          key: "quoteSalesSources",
          to: "/orders/settings/quote-sales-sources",
          icon: Handshake,
          permissionKey: "orders.settings",
        },
        {
          key: "quoteCommunicationChannels",
          to: "/orders/settings/quote-communication-channels",
          icon: BellRing,
          permissionKey: "orders.settings",
        },
        {
          key: "festivalOptions",
          to: "/orders/settings/festivals",
          icon: CalendarDays,
          permissionKey: "orders.settings",
        },
        {
          key: "quoteTerms",
          to: "/orders/settings/quote-terms",
          icon: FileText,
          permissionKey: "orders.settings",
        },
        {
          key: "quotePaymentTemplates",
          to: "/orders/settings/quote-payments",
          icon: HandCoins,
          permissionKey: "orders.settings",
        },
        {
          key: "orderShippingMethods",
          to: "/orders/settings/shipping",
          icon: PackageCheck,
          permissionKey: "orders.settings",
        },
        {
          key: "orderShippingFees",
          to: "/orders/settings/shipping-fees",
          icon: Truck,
          permissionKey: "orders.settings.shipping_fees",
        },
        {
          key: "orderPaymentMethods",
          to: "/orders/settings/payments",
          icon: CircleDollarSign,
          permissionKey: "orders.settings",
        },
        {
          key: "orderAddonSettings",
          to: "/orders/settings/add-ons",
          icon: PackagePlus,
          permissionKey: "orders.settings.addons",
        },
        {
          key: "orderAddonBlockDates",
          to: "/orders/settings/add-on-block-dates",
          icon: CalendarOff,
          permissionKey: "orders.settings.addon_block_dates",
        },
        {
          key: "orderListTips",
          to: "/orders/settings/order-list-tips",
          icon: ListFilter,
          permissionKey: "settings.order_lists",
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
      key: "pendingQuote",
      to: "/quotes/pending?nav=catering.quotes",
      icon: FileText,
      permissionKey: "quotes",
    },
    {
      key: "enquiryForms",
      to: "/quotes/enquiry-forms?nav=catering.quotes",
      icon: FilePenLine,
      permissionKey: "quotes",
    },
    {
      key: "quotePdfPages",
      to: "/quotes/pdf-pages",
      icon: FileImage,
      permissionKey: "quotes.pdf_pages",
    },
  ],
  customerSection: [
    {
      key: "customers",
      to: "/quotes/customers",
      icon: Users,
      permissionKey: "quotes.customers",
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
    {
      key: "shopifyPendingProducts",
      to: "/products/shopify-pending",
      icon: ShoppingBag,
      permissionKey: "products.shopify_pending",
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
      key: "seasoningRecipes",
      to: "/frozen/seasoning-recipes",
      icon: Scale,
      permissionKey: "frozen.seasoning_recipes",
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
    {
      key: "supplierQuotes",
      to: "/frozen/supplier-quotes",
      icon: FileText,
      permissionKey: "frozen.supplier_quotes",
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
      key: "kitchenMaterialUsage",
      to: "/kitchen/material-usage",
      icon: Calculator,
      permissionKey: KITCHEN_MATERIAL_USAGE_PAGE_KEY,
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
    {
      key: "deliveryFleets",
      to: "/delivery/fleets",
      icon: Truck,
      permissionKey: "delivery.fleets",
    },
    {
      key: "deliverySurcharges",
      to: "/delivery/surcharges",
      icon: CircleDollarSign,
      permissionKey: "delivery",
    },
  ],
  restaurant: [
    {
      key: "restaurantDailySales",
      to: "/restaurant/daily-sales",
      icon: Store,
      permissionKey: "restaurant.daily_sales",
    },
    {
      key: "restaurantDailyPurchases",
      to: "/restaurant/daily-purchases",
      icon: Receipt,
      permissionKey: "restaurant.daily_purchases",
    },
    {
      key: "restaurantStocktakes",
      to: "/restaurant/inventory",
      icon: ClipboardCheck,
      permissionKey: "restaurant.inventory",
    },
    {
      key: "restaurantMonthlyExpenses",
      to: "/restaurant/monthly-expenses",
      icon: CircleDollarSign,
      permissionKey: "restaurant.monthly_expenses",
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
    {
      key: "restaurantOrdering",
      to: "/restaurant/ordering/review",
      icon: ShoppingBag,
      permissionKey: "restaurant.ordering",
      children: [
        { key: "restaurantOrderingSuppliers", to: "/restaurant/ordering/suppliers", icon: Store, permissionKey: "restaurant.ordering.suppliers" },
        { key: "restaurantOrderingPhonebook", to: "/restaurant/ordering/phonebook", icon: Phone, permissionKey: "restaurant.ordering.phonebook" },
        { key: "restaurantOrderingReview", to: "/restaurant/ordering/review", icon: ShieldCheck, permissionKey: "restaurant.ordering.review" },
        { key: "restaurantOrderingInventory", to: "/restaurant/ordering/inventory", icon: Warehouse, permissionKey: "workspace.factory.warehouse" },
      ],
    },
  ],
  reports: [
    {
      key: "reports",
      to: "/reports",
      icon: ChartNoAxesCombined,
      permissionKey: "reports",
      children: [
        {
          key: "kitchenReports",
          to: "/reports/kitchen",
          icon: Utensils,
          permissionKey: "kitchen.cost_input",
        },
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
      children: [
        {
          key: "dataInputProgress",
          to: REPORT_GROUP_ROUTES.dataInputProgress,
          icon: ClipboardCheck,
          permissionKey: REPORT_GROUP_PAGE_KEYS.dataInputProgress,
        },
        {
          key: "kitchenCostInput",
          to: "/finance/cost-input",
          icon: CircleDollarSign,
          permissionKey: "kitchen.cost_input",
        },
      ],
    },
  ],
  settings: [
    {
      key: "employees",
      to: "/settings/employees",
      icon: Users,
      permissionKey: "settings.employees",
    },
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
      key: "watiEmailLogs",
      to: "/settings/wati-email-logs",
      icon: Mail,
      permissionKey: "settings.wati_email_logs",
    },
    {
      key: "customerFaq",
      to: "/settings/customer-faq",
      icon: MessageCircleMore,
      permissionKey: "settings.customer_faq",
    },
    {
      key: "dictionaries",
      to: "/settings/dictionaries",
      icon: ListFilter,
      permissionKey: "settings.dictionaries",
    },
    {
      key: "notificationSettings",
      to: "/settings/notifications",
      icon: BellRing,
      permissionKey: "settings.notifications",
    },
    {
      key: "districts",
      to: "/settings/districts",
      icon: MapPinned,
      permissionKey: "settings.districts",
    },
    {
      key: "attachments",
      to: "/settings/attachments",
      icon: FileArchive,
      permissionKey: "settings.attachments",
    },
  ],
};

function appendNavContext(item: NavItem, context: string): NavItem {
  const separator = item.to.includes("?") ? "&" : "?";
  return {
    ...item,
    to: `${item.to}${separator}nav=${context}`,
    children: item.children?.map((child) => appendNavContext(child, context)),
  };
}

export function businessSectionFromLocation(pathname: string, search: string) {
  const context = new URLSearchParams(search).get("nav") || "";
  if (context.startsWith("follow-up.")) return "followUp";
  if (context.startsWith("accounting.")) return "accountingFollowUp";
  if (context.startsWith("catering.")) return "catering";
  if (context === "frozen") return "frozen";
  if (context === "restaurant") return "restaurant";
  if (context === "reports") return "reports";
  if (context === "settings") return "settings";

  const segment = pathname.split("/")[1] || "";
  if (!segment) return "overview";
  if (segment === "follow-up") return "followUp";
  if (["orders", "quotes", "products", "kitchen", "delivery"].includes(segment)) return "catering";
  if (["frozen", "restaurant", "reports", "settings"].includes(segment)) return segment;
  if (segment === "finance") return "reports";
  return "";
}

export function businessCategoryFromLocation(
  section: string,
  pathname: string,
  search: string,
) {
  const context = new URLSearchParams(search).get("nav") || "";
  if (context.includes(".")) return context.split(".")[1];
  if (section === "followUp") return "catering";
  if (section === "accountingFollowUp") return "cateringData";
  if (section === "catering") {
    const segment = pathname.split("/")[1] || "orders";
    return segment === "follow-up" ? "orders" : segment;
  }
  return "";
}

export function businessSidebarNav(
  section: string,
  _category: string,
): NavItem[] {
  if (section === "overview") return secondaryNav.overview;
  if (section === "followUp") {
    return businessCategoryNav.followUp.map((category) => {
      const context = `follow-up.${category.key}`;
      if (category.key === "restaurant") {
        const restaurantKeys = new Set([
          "restaurantDailySales",
          "restaurantDailyPurchases",
          "restaurantMonthlyExpenses",
          "restaurantStocktakes",
        ]);
        const children = secondaryNav.restaurant
          .filter((item) => restaurantKeys.has(item.key))
          .map((item) => appendNavContext(item, context));
        children.push({
          key: "newProductSalesStats",
          to: `/restaurant/reports?nav=${context}`,
          icon: ChartNoAxesCombined,
          permissionKey: "restaurant.reports",
        });
        return { ...category, children };
      }
      if (category.key === "frozen") {
        const frozenKeys = new Set([
          "rawMeatInventoryCalc",
          "preparedMeatInventoryCalc",
          "sellingPriceCost",
          "deliveryNotes",
        ]);
        return {
          ...category,
          children: secondaryNav.frozen
            .filter((item) => frozenKeys.has(item.key))
            .map((item) => appendNavContext(item, context)),
        };
      }

      const kitchenKeys = new Set([
        "packingStocktakes",
        "ingredientStocktakes",
        "kitchenMaterialUsage",
      ]);
      const kitchenEntries = secondaryNav.kitchen
        .filter((item) => kitchenKeys.has(item.key))
        .map((item) => appendNavContext(item, context));
      const driverEntry = secondaryNav.delivery
        .filter((item) => item.key === "deliveryList")
        .map((item) => appendNavContext(item, context));
      return {
        ...category,
        children: [
          ...followUpCateringNav,
          ...kitchenEntries,
          {
            key: "operationsExpenseInput",
            to: `/finance/cost-input?nav=${context}`,
            icon: CircleDollarSign,
            permissionKey: "kitchen.cost_input",
          },
          {
            key: "purchaseExpenseInput",
            to: `/finance/cost-input?tab=monthly-suppliers&nav=${context}`,
            icon: Receipt,
            permissionKey: "kitchen.cost_input",
          },
          ...driverEntry,
        ],
      };
    });
  }
  if (section === "catering") {
    return businessCategoryNav.catering.map((category) => {
      if (category.key === "customers") {
        return category;
      }
      const sourceKey = category.key === "allQuotes" ? "quotes" : category.key;
      const children = (secondaryNav[sourceKey] ?? []).map((item) =>
        appendNavContext(item, `catering.${sourceKey}`),
      );
      if (sourceKey === "kitchen") {
        children.push(
          {
            key: "dataInputProgress",
            to: `${REPORT_GROUP_ROUTES.dataInputProgress}?nav=catering.kitchen`,
            icon: ClipboardCheck,
            permissionKey: REPORT_GROUP_PAGE_KEYS.dataInputProgress,
          },
          {
            key: "operationsExpenseInput",
            to: "/finance/cost-input?nav=catering.kitchen",
            icon: CircleDollarSign,
            permissionKey: "kitchen.cost_input",
          },
          {
            key: "purchaseExpenseInput",
            to: "/finance/cost-input?tab=monthly-suppliers&nav=catering.kitchen",
            icon: Receipt,
            permissionKey: "kitchen.cost_input",
          },
        );
      }
      return {
        ...category,
        children,
      };
    });
  }
  if (section === "accountingFollowUp") {
    return (businessCategoryNav.accountingFollowUp ?? []).map((category) => {
      const context = `accounting.${category.key}`;
      if (category.key === "restaurantData") {
        return {
          ...category,
          children: reportGroupNavItems("shops").map((item) =>
            appendNavContext(item, context),
          ),
        };
      }
      if (category.key === "factoryData") {
        return {
          ...category,
          children: reportGroupNavItems("frozenMeat").map((item) =>
            appendNavContext(item, context),
          ),
        };
      }
      return {
        ...category,
        children: cateringAccountingNavItems().map((item) =>
          appendNavContext(item, context),
        ),
      };
    });
  }
  if (section === "frozen") {
    const frozenReport = secondaryNav.reports
      .flatMap((item) => item.children ?? [])
      .find((item) => item.key === "frozenMeat");
    const frozenReportChildren = reportGroupNavItems("frozenMeat");
    return [
      ...(frozenReport
        ? [
            appendNavContext(
              {
                ...frozenReport,
                key: "rawMeatReports",
                children: frozenReportChildren,
              },
              "frozen",
            ),
          ]
        : []),
      ...secondaryNav.frozen.map((item) => appendNavContext(item, "frozen")),
    ];
  }
  if (section === "restaurant") {
    const restaurantSettings = secondaryNav.restaurant.find(
      (item) => item.key === "restaurantSettings",
    );
    const restaurantStaff = secondaryNav.restaurant.find(
      (item) => item.key === "restaurantStaff",
    );
    const restaurantOperations = secondaryNav.restaurant.filter(
      (item) =>
        item.key !== "restaurantSettings" && item.key !== "restaurantStaff",
    );
    const restaurantReports: NavItem[] = [
      {
        key: "shopSales",
        to: REPORT_TAB_ROUTES.shopSales,
        icon: ChartNoAxesCombined,
        permissionKey: REPORT_TAB_PERMISSION_KEYS.shopSales,
      },
      {
        key: "shopSalesWorkingHours",
        to: REPORT_TAB_ROUTES.shopSalesWorkingHours,
        icon: CalendarClock,
        permissionKey: REPORT_TAB_PERMISSION_KEYS.shopSalesWorkingHours,
      },
      {
        key: "restaurantSalesSalary",
        to: REPORT_TAB_ROUTES.restaurantSalesSalary,
        icon: HandCoins,
        permissionKey: REPORT_TAB_PERMISSION_KEYS.restaurantSalesSalary,
      },
      {
        key: "restaurantSalesCost",
        to: REPORT_TAB_ROUTES.restaurantSalesCost,
        icon: Receipt,
        permissionKey: REPORT_TAB_PERMISSION_KEYS.restaurantSalesCost,
      },
      {
        key: "restaurantPnl",
        to: REPORT_TAB_ROUTES.restaurantPnl,
        icon: CircleDollarSign,
        permissionKey: REPORT_TAB_PERMISSION_KEYS.restaurantPnl,
      },
      {
        key: "newProductSalesStats",
        to: REPORT_TAB_ROUTES.newProducts,
        icon: ChartNoAxesCombined,
        permissionKey: REPORT_TAB_PERMISSION_KEYS.newProducts,
      },
    ];
    return [
      ...restaurantOperations,
      ...restaurantReports,
      ...(restaurantStaff ? [restaurantStaff] : []),
      ...(restaurantSettings ? [restaurantSettings] : []),
    ].map((item) => appendNavContext(item, "restaurant"));
  }
  if (section === "reports") {
    const reportEntrances = secondaryNav.reports
      .find((item) => item.key === "reports")
      ?.children ?? [];
    return reportEntrances.map((item) => {
      if (item.key === "kitchenReports") {
        return appendNavContext(
          {
            ...item,
            children: kitchenReportNavItems(),
          },
          "reports",
        );
      }
      const group = item.key === "frozenMeat" ? "frozenMeat" : "shops";
      return appendNavContext(
        {
          ...item,
          children: reportGroupNavItems(group),
        },
        "reports",
      );
    });
  }
  if (section === "settings") {
    return secondaryNav.settings.map((item) => appendNavContext(item, "settings"));
  }
  return [];
}

export const SECTION_CHILD_KEYS: Record<string, string[]> = {
  orders: [
    "orders.new",
    "orders.customer_inquiries",
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
    "orders.settings.wati_notifications",
    "orders.settings.statuses",
    "orders.settings.sale_partners",
    "orders.settings.email_notifications",
    "orders.settings.first_notification_recipients",
    "orders.settings.shipping_fees",
    "settings.order_lists",
    "settings.order_lists.edit",
    ...ORDER_ACTION_PAGE_KEYS,
  ],
  quotes: ["quotes.pending", "quotes.pdf_pages"],
  customerSection: ["quotes", "quotes.customers"],
  products: [
    "products.catering",
    "products.lunchbox",
    "products.ala_carte",
    "products.packages",
    "products.shopify_pending",
  ],
  frozen: [
    "frozen.raw_meat_inventory",
    "frozen.prepared_meat_inventory",
    "frozen.selling_price_cost",
    "frozen.delivery_notes",
    "frozen.seasoning_recipes",
    "frozen.seasoning_cost",
    "frozen.calculation_settings",
    "frozen.meat_customers",
    "frozen.spice_usage",
    "frozen.yield_errors",
    "frozen.supplier_quotes",
    ...FROZEN_ACTION_PAGE_KEYS,
  ],
  kitchen: [
    "kitchen.inventory",
    "kitchen.ingredients",
    "kitchen.packing_stocktakes",
    "kitchen.ingredient_stocktakes",
    "kitchen.suppliers",
    KITCHEN_MATERIAL_USAGE_PAGE_KEY,
    ...KITCHEN_ACTION_PAGE_KEYS,
  ],
  delivery: ["delivery.assign", "delivery.fleets"],
  restaurant: ["restaurant.daily_sales", "restaurant.daily_purchases", "restaurant.monthly_expenses", "restaurant.inventory", "restaurant.reports", "restaurant.staff", "restaurant.settings", "restaurant.settings.restaurants", "restaurant.settings.departments", "restaurant.settings.service_periods", "restaurant.settings.payment_methods", "restaurant.settings.delivery_platforms", "restaurant.settings.holidays", "restaurant.settings.roster_times", "restaurant.settings.supplier_cost_categories", "restaurant.settings.inventory_items", "restaurant.settings.monthly_pnl_cost_categories", "restaurant.ordering", "restaurant.ordering.suppliers", "restaurant.ordering.requests", "restaurant.ordering.records", "restaurant.ordering.phonebook", "restaurant.ordering.review", "workspace.factory.warehouse", "workspace.factory.warehouse.outbound", "workspace.factory.warehouse.inbound"],
  reports: [
    REPORT_GROUP_PAGE_KEYS.dataInputProgress,
    "kitchen.cost_input",
    REPORT_GROUP_PAGE_KEYS.frozenMeat,
    REPORT_GROUP_PAGE_KEYS.shops,
    REPORT_TAB_PERMISSION_KEYS.shopSales,
    REPORT_TAB_PERMISSION_KEYS.shopSalesWorkingHours,
    REPORT_TAB_PERMISSION_KEYS.shopOrderQuantities,
    REPORT_TAB_PERMISSION_KEYS.averageSupplyPrice,
    REPORT_TAB_PERMISSION_KEYS.productionCostPrice,
    REPORT_TAB_PERMISSION_KEYS.rawMeatAveragePrice,
    REPORT_TAB_PERMISSION_KEYS.preparedMeatStock,
    REPORT_TAB_PERMISSION_KEYS.rawMeatStock,
    REPORT_TAB_PERMISSION_KEYS.supplierPurchase,
  ],
  settings: [
    "settings.employees",
    "settings.users",
    "settings.users.create",
    "settings.users.edit",
    "settings.users.change_password",
    "settings.roles",
    "settings.login_logs",
    "settings.wati_email_logs",
    "settings.notifications",
    "settings.dictionaries",
    "settings.dictionaries.edit",
    "settings.districts",
    "settings.districts.edit",
    "settings.customer_faq",
    "settings.customer_faq.edit",
    "settings.attachments",
  ],
};

export const workspaceLinks: Array<{
  key: string;
  to: string;
  icon: Icon;
  permissionKey: string;
  disabled?: boolean;
}> = [
  {
    key: "factory",
    to: "/factory",
    icon: Factory,
    permissionKey: "workspace.factory",
  },
  {
    key: "restaurant",
    to: "/restaurant-workspace",
    icon: Store,
    permissionKey: "workspace.restaurant",
  },
  {
    key: "delivery",
    to: "/driver-delivery",
    icon: Truck,
    permissionKey: "workspace.delivery",
  },
  {
    key: "customer",
    to: "/self_service_search",
    icon: Users,
    permissionKey: "workspace.customer",
  },
];

/** First real destination available to a role, following the visible menu order. */
export function firstAccessibleNavigationPath(
  canAccess: (pageKey: string) => boolean,
  canAccessSection: (pageKey: string, childKeys?: string[]) => boolean,
) {
  for (const primary of primaryNav) {
    const permissionKey = primary.permissionKey ?? primary.key;
    if (
      !canAccessSection(permissionKey, SECTION_CHILD_KEYS[permissionKey] ?? [])
    ) {
      continue;
    }

    const configured = secondaryNav[primary.key];
    const firstVisible = configured
      ? flattenVisibleNavItems(configured, canAccess)[0]
      : undefined;
    if (firstVisible) return firstVisible.to;
    if (primary.key === "orders") {
      const queueFallbacks: Array<[string, string]> = [
        ["orders.pending", "/orders/pending"],
        ["orders.not_sent_factory", "/orders/not-sent-factory"],
        ["orders.unpaid", "/orders/unpaid"],
        ["orders.monthly", "/orders/monthly"],
        ["orders.split", "/orders/split"],
        ["orders.kitchen_notes", "/orders/kitchen-notes"],
        ["orders.reschedule_pending", "/orders/reschedule-pending"],
        ["orders.shopify_pending", "/orders/shopify-pending"],
      ];
      const queuePath = queueFallbacks.find(([key]) => canAccess(key))?.[1];
      if (queuePath) return queuePath;
    }
    if (canAccess(pageAccessKey(primary.to))) return primary.to;
  }

  return (
    workspaceLinks.find(
      (item) => !item.disabled && canAccess(item.permissionKey),
    )?.to ?? null
  );
}

/** Resolve a primary tab to a destination the current role can really open. */
export function accessiblePrimaryNavigationPath(
  primary: NavItem,
  canAccess: (pageKey: string) => boolean,
) {
  // Home is not a container for the shortcut links shown in its sidebar.
  if (primary.key === "overview") {
    return canAccess(navItemPermissionKey(primary)) ? primary.to : null;
  }

  const configured = secondaryNav[primary.key];
  if (configured) {
    return flattenVisibleNavItems(configured, canAccess)[0]?.to ?? null;
  }
  return canAccess(navItemPermissionKey(primary)) ? primary.to : null;
}

export function sectionFromPath(pathname: string) {
  if (
    pathname === "/quotes/customers" ||
    pathname.startsWith("/quotes/customers/")
  ) {
    return "customerSection";
  }
  const segment = pathname.split("/")[1] ?? "";
  if (segment === "follow-up") return "followUp";
  if (segment === "inventory") return "overview";
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
  if (
    pathname === "/restaurant-workspace" ||
    pathname.startsWith("/restaurant-workspace/")
  ) {
    return "restaurant";
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
  const targetPath = to.split("?")[0];
  if (pathname === targetPath) return true;
  if (exact) return false;
  return pathname.startsWith(`${targetPath}/`);
}

/** Match style-one links by both route and queue/menu query context. */
export function isBusinessNavTargetActive(
  pathname: string,
  search: string,
  target: string,
) {
  const [targetPath, targetQuery = ""] = target.split("?");
  if (pathname !== targetPath && !pathname.startsWith(`${targetPath}/`)) {
    return false;
  }
  const expected = new URLSearchParams(targetQuery);
  const current = new URLSearchParams(search);
  for (const [key, value] of expected) {
    // Canonical routes and old bookmarks do not carry the style-one context.
    // Their pathname still identifies the correct business-menu branch.
    if (key === "nav" && !current.has("nav")) continue;
    if (current.get(key) !== value) return false;
  }
  if (targetPath === "/orders" && !expected.has("tab") && current.has("tab")) {
    return false;
  }
  return true;
}

/** Keep only the most specific matching leaf active in the business menu. */
export function isBusinessSecondaryNavItemActive(
  pathname: string,
  search: string,
  to: string,
  siblingTargets: readonly string[] = [to],
) {
  const matchingTargets = siblingTargets.filter((target) =>
    isBusinessNavTargetActive(pathname, search, target),
  );
  const longestMatch = matchingTargets.reduce<string | null>((best, target) => {
    if (!best) return target;

    const [targetPath, targetQuery = ""] = target.split("?");
    const [bestPath, bestQuery = ""] = best.split("?");
    if (targetPath.length !== bestPath.length) {
      return targetPath.length > bestPath.length ? target : best;
    }

    // Multiple sidebar entries can intentionally share a route and use query
    // parameters to select different views. Prefer the target with the most
    // matching query parameters so the generic route does not stay active.
    const targetSpecificity = new URLSearchParams(targetQuery).size;
    const bestSpecificity = new URLSearchParams(bestQuery).size;
    return targetSpecificity > bestSpecificity ? target : best;
  }, null);

  return longestMatch === to;
}

export function isSecondaryNavItemActive(
  pathname: string,
  to: string,
  siblingPaths: readonly string[] = [to],
) {
  const matchingPaths = siblingPaths.filter((path) =>
    isNavPathActive(pathname, path, false),
  );
  const longestMatch = matchingPaths.reduce<string | null>(
    (longest, path) =>
      !longest || path.length > longest.length ? path : longest,
    null,
  );

  return longestMatch === to;
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

/** Keep the nested sidebar tree so style-one mobile can show second and third levels. */
export function keepVisibleNavTree(
  items: NavItem[],
  canAccess: (pageKey: string) => boolean,
  isItemAllowed: (item: NavItem) => boolean = () => true,
): NavItem[] {
  return items.flatMap((item) => {
    const children = keepVisibleNavTree(item.children ?? [], canAccess, isItemAllowed);
    const next = {
      ...item,
      children: children.length ? children : undefined,
    };
    return isNavItemVisible(next, canAccess) && isItemAllowed(next) ? [next] : [];
  });
}

export function buildBusinessMobileDrawerNav(
  visiblePrimary: NavItem[],
  canAccess: (pageKey: string) => boolean,
  isItemAllowed: (item: NavItem) => boolean = () => true,
): Array<{ groupKey: string; items: NavItem[] }> {
  return visiblePrimary
    .map((primary) => {
      const defaultCategory =
        primary.key === "followUp"
          ? "catering"
          : primary.key === "catering"
            ? "orders"
            : primary.key === "accountingFollowUp"
              ? "cateringData"
              : "";
      return {
        groupKey: primary.key,
        items: keepVisibleNavTree(
          businessSidebarNav(primary.key, defaultCategory),
          canAccess,
          isItemAllowed,
        ),
      };
    })
    .filter((group) => group.items.length > 0);
}

export function isBusinessPrimaryNavVisible(
  item: NavItem,
  canAccess: (pageKey: string) => boolean,
) {
  if (item.key === "accountingFollowUp") {
    return (
      keepVisibleNavTree(businessSidebarNav("accountingFollowUp", ""), canAccess)
        .length > 0
    );
  }
  return isNavItemVisible(item, canAccess);
}

export function accessibleBusinessPrimaryPath(
  item: NavItem,
  canAccess: (pageKey: string) => boolean,
) {
  if (item.key === "accountingFollowUp") {
    return (
      flattenVisibleNavItems(
        businessSidebarNav("accountingFollowUp", ""),
        canAccess,
      )[0]?.to ?? item.to
    );
  }
  return item.to;
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
