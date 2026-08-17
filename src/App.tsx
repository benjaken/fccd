import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bell,
  Beef,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Calculator,
  FileArchive,
  FileText,
  HandCoins,
  Handshake,
  History,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Package,
  PackageCheck,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Snowflake,
  Store,
  Sun,
  Truck,
  UserRound,
  Users,
  Utensils,
  Warehouse,
  X,
} from "lucide-react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import {
  pageAccessKey,
  REPORT_GROUP_PAGE_KEYS,
  REPORT_GROUP_ROUTES,
  REPORT_TAB_PERMISSION_KEYS,
  usePageAccess,
} from "@/auth/use-page-access";
import { LoginPage } from "@/components/LoginPage";
import { MigrationWorkspace } from "@/components/MigrationWorkspace";
import { FollowUpPage } from "@/components/FollowUpPage";
import { OrdersListPage } from "@/components/OrdersListPage";
import { OrderDetailPage } from "@/components/OrderDetailPage";
import { PaymentsListPage } from "@/components/PaymentsListPage";
import { ProfilePage } from "@/components/ProfilePage";
import { ReportsPage } from "@/components/ReportsPage";
import { QuotesListPage } from "@/components/QuotesListPage";
import { ProductsListPage } from "@/components/ProductsListPage";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { PackagesListPage } from "@/components/PackagesListPage";
import { PackageDetailPage } from "@/components/PackageDetailPage";
import { PreparedMeatInventoryCalcPage } from "@/components/PreparedMeatInventoryCalcPage";
import { MeatDeliveryNotesPage } from "@/components/MeatDeliveryNotesPage";
import { RawMeatInventoryCalcPage } from "@/components/RawMeatInventoryCalcPage";
import { SpiceUsagePage } from "@/components/SpiceUsagePage";
import { SeasoningCostSettingsPage } from "@/components/SeasoningCostSettingsPage";
import { SellingPriceCostPage } from "@/components/SellingPriceCostPage";
import { CalculationSettingsPage } from "@/components/CalculationSettingsPage";
import { MeatCustomersPage } from "@/components/MeatCustomersPage";
import { MeatYieldErrorsPage } from "@/components/MeatYieldErrorsPage";
import { OrderStatusesPage } from "@/components/OrderStatusesPage";
import { SalesPartnersPage } from "@/components/SalesPartnersPage";
import { AttachmentsListPage } from "@/components/settings/AttachmentsListPage";
import { LoginLogsListPage } from "@/components/settings/LoginLogsListPage";
import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import { SettingsAccessDenied } from "@/components/settings/SettingsAccessDenied";
import { UsersListPage } from "@/components/settings/UsersListPage";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  fetchDashboardData,
  type DashboardData,
  type DashboardJob,
} from "@/lib/dashboard";
import { FROZEN_ACTION_PAGE_KEYS } from "@/lib/frozen-action-permissions";
import { ORDER_ACTION_PAGE_KEYS } from "@/lib/order-action-permissions";
import { useTheme } from "@/lib/use-theme";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  key: string;
  to: string;
  icon: Icon;
  permissionKey?: string;
  children?: NavItem[];
};

const primaryNav: NavItem[] = [
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

const secondaryNav: Record<string, NavItem[]> = {
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
      key: "inventory",
      to: "/inventory",
      icon: Warehouse,
      permissionKey: "inventory",
    },
    {
      key: "delivery",
      to: "/delivery",
      icon: Truck,
      permissionKey: "delivery",
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
      key: "newOrder",
      to: "/orders/new",
      icon: FileText,
      permissionKey: "orders.new",
    },
    {
      key: "pendingOrders",
      to: "/orders/pending",
      icon: ClipboardCheck,
      permissionKey: "orders.pending",
    },
    {
      key: "productionCalendar",
      to: "/orders/production",
      icon: CalendarDays,
      permissionKey: "orders.production",
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
      key: "orderSettings",
      to: "/orders/settings/statuses",
      icon: Settings,
      permissionKey: "orders.settings",
      children: [
        {
          key: "orderStatuses",
          to: "/orders/settings/statuses",
          icon: Palette,
          permissionKey: "orders.settings.statuses",
        },
        {
          key: "salePartners",
          to: "/orders/settings/sale-partners",
          icon: Handshake,
          permissionKey: "orders.settings.sale_partners",
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
    { key: "kitchen", to: "/kitchen", icon: Utensils, permissionKey: "kitchen" },
    {
      key: "productionCalendar",
      to: "/kitchen/calendar",
      icon: CalendarDays,
      permissionKey: "kitchen.calendar",
    },
    {
      key: "inventory",
      to: "/kitchen/inventory",
      icon: Warehouse,
      permissionKey: "kitchen.inventory",
    },
  ],
  delivery: [
    {
      key: "delivery",
      to: "/delivery",
      icon: Truck,
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
      key: "attachments",
      to: "/settings/attachments",
      icon: FileArchive,
      permissionKey: "settings.attachments",
    },
  ],
};

const SECTION_CHILD_KEYS: Record<string, string[]> = {
  overview: ["overview.follow_up"],
  orders: [
    "orders.new",
    "orders.pending",
    "orders.production",
    "orders.payments",
    "orders.drivers",
    "orders.unpaid",
    "orders.delivered_unpaid",
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
  kitchen: ["kitchen.calendar", "kitchen.inventory"],
  delivery: ["delivery.assign"],
  restaurant: ["restaurant.inventory", "restaurant.reports"],
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
  ],
};

const workspaceLinks: Array<{
  key: string;
  to: string;
  icon: Icon;
  disabled?: boolean;
}> = [
  { key: "catering", to: "/", icon: Utensils },
  { key: "delivery", to: "/delivery", icon: Truck },
  { key: "restaurant", to: "/restaurant", icon: Store },
  { key: "customer", to: "/customer", icon: Users, disabled: true },
];

function sectionFromPath(pathname: string) {
  const segment = pathname.split("/")[1] ?? "";
  if (segment === "follow-up" || segment === "inventory") return "overview";
  if (segment === "finance") return "reports";
  if (secondaryNav[segment]) return segment;
  // Exact home only — do not light 主頁 for profile/migration/unknown paths.
  if (!segment) return "overview";
  return "";
}

/** Primary top-nav stays active for the whole section, including child routes. */
function isPrimaryNavActive(section: string, key: string, isActive: boolean) {
  return isActive || (section !== "" && section === key);
}

function navItemPermissionKey(item: NavItem) {
  return item.permissionKey ?? pageAccessKey(item.to);
}

function isNavItemVisible(
  item: NavItem,
  canAccess: (pageKey: string) => boolean,
): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isNavItemVisible(child, canAccess));
  }
  return canAccess(navItemPermissionKey(item));
}

function isNavPathActive(pathname: string, to: string, exact: boolean) {
  if (pathname === to) return true;
  if (exact) return false;
  return pathname.startsWith(`${to}/`);
}

/** Flatten primary + secondary destinations for the mobile drawer (no nested menus). */
function flattenVisibleNavItems(
  items: NavItem[],
  canAccess: (permissionKey: string) => boolean,
): NavItem[] {
  return items.flatMap((item) => {
    if (item.children?.length) {
      return flattenVisibleNavItems(item.children, canAccess);
    }
    return isNavItemVisible(item, canAccess) ? [item] : [];
  });
}

function buildMobileDrawerNav(
  visiblePrimary: NavItem[],
  canAccess: (permissionKey: string) => boolean,
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

function mobileNavLinkEnd(to: string, allHrefs: string[]) {
  return (
    to === "/" ||
    allHrefs.some((href) => href !== to && href.startsWith(`${to}/`))
  );
}

export { isPrimaryNavActive, sectionFromPath, buildMobileDrawerNav };

function Brand() {
  const { t } = useTranslation();

  return (
    <Link className="brand" to="/" aria-label={t("brand.name")}>
      <span className="brand-mark" aria-hidden="true">
        <span>FC</span>
      </span>
      <span className="brand-copy">
        <strong>{t("brand.name")}</strong>
        <small>{t("brand.system")}</small>
      </span>
    </Link>
  );
}

export function CurrentDateTime({
  initialNow,
  live = true,
}: {
  initialNow?: Date;
  live?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(initialNow ?? new Date());

  useEffect(() => {
    if (!live) return;

    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, [live]);

  const date = new Intl.DateTimeFormat(i18n.language, {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(now);
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(now);

  return (
    <div className="workspace-context">
      <span className="status-pulse" />
      <span>{t("common.today")}</span>
      <strong>{date}</strong>
      <time dateTime={now.toISOString()}>{time}</time>
    </div>
  );
}

function OperationsShell() {
  const { t, i18n } = useTranslation();
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const { dark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const section = sectionFromPath(location.pathname);
  const authorizationRole =
    typeof user?.app_metadata?.role === "string"
      ? user.app_metadata.role
      : profile?.role;
  const pageAccess = usePageAccess(authorizationRole);
  const currentPageKey = pageAccessKey(location.pathname);
  const visiblePrimaryNav = primaryNav.filter((item) => {
    const key = item.permissionKey ?? item.key;
    return pageAccess.canAccessSection(key, SECTION_CHILD_KEYS[key] ?? []);
  });
  const sideItems = (secondaryNav[section] ?? secondaryNav.overview).filter(
    (item) => isNavItemVisible(item, pageAccess.canAccess),
  );
  const mobileNavGroups = buildMobileDrawerNav(
    visiblePrimaryNav,
    (permissionKey) => pageAccess.canAccess(permissionKey),
  );
  const mobileNavHrefs = mobileNavGroups.flatMap((group) =>
    group.items.map((item) => item.to),
  );
  const firstSettingsPath =
    secondaryNav.settings.find((item) =>
      pageAccess.canAccess(item.permissionKey ?? pageAccessKey(item.to)),
    )?.to ?? "/settings/users";
  const firstReportsPath =
    secondaryNav.reports
      .flatMap((item) => item.children ?? [])
      .find((item) => isNavItemVisible(item, pageAccess.canAccess))?.to ??
    REPORT_GROUP_ROUTES.frozenMeat;
  const activeWorkspace =
    section === "delivery"
      ? "delivery"
      : section === "restaurant"
        ? "restaurant"
        : "catering";
  const canViewFinance = pageAccess.canAccess("finance");

  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;

    const closeMenu = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [userMenuOpen]);

  const pageKey = useMemo(() => location.pathname.replaceAll("/", "-"), [
    location.pathname,
  ]);

  const switchLanguage = () => {
    void i18n.changeLanguage(i18n.language === "en" ? "zh-HK" : "en");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <Button
            className="mobile-only"
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("common.openMenu")}
          >
            <Menu />
          </Button>
          <Brand />
        </div>

        <nav className="workspace-links" aria-label="Workspaces">
          {workspaceLinks.map(
            ({ key, to, icon: WorkspaceIcon, disabled }) =>
              disabled ? (
                <span
                  key={key}
                  className="workspace-soft-link disabled"
                  aria-disabled="true"
                >
                  <WorkspaceIcon />
                  <span>{t(`workspace.${key}`)}</span>
                </span>
              ) : (
                <Link
                  key={key}
                  to={to}
                  className={cn(
                    "workspace-soft-link",
                    activeWorkspace === key && "active",
                  )}
                >
                  <WorkspaceIcon />
                  <span>{t(`workspace.${key}`)}</span>
                </Link>
              ),
          )}
        </nav>

        <div className="topbar-actions">
          <Button
            variant="ghost"
            size="icon"
            onClick={switchLanguage}
            aria-label={t("common.switchLanguage")}
            title={t("common.switchLanguage")}
          >
            <span className="language-label">
              {i18n.language === "en" ? "繁" : "EN"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={t("common.switchTheme")}
            title={t("common.switchTheme")}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
          <Button
            className="notification-button"
            variant="ghost"
            size="icon"
            aria-label={t("common.notifications")}
          >
            <Bell />
            <span className="notification-dot" />
          </Button>
          <div className="user-menu-wrap" ref={userMenuRef}>
            <button
              className="user-menu"
              type="button"
              onClick={() => setUserMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <span className="avatar">
                {(
                  profile?.user_name?.slice(0, 2) ||
                  user?.email?.slice(0, 2) ||
                  "FC"
                ).toUpperCase()}
              </span>
              <span className="user-copy">
                <strong>
                  {profile?.user_name ||
                    user?.email?.split("@")[0] ||
                    t("brand.name")}
                </strong>
                <small>{profile?.role || t("common.notSet")}</small>
              </span>
              <ChevronDown />
            </button>
            {userMenuOpen && (
              <div className="user-dropdown" role="menu">
                <div className="user-dropdown-identity">
                  <strong>
                    {profile?.user_name ||
                      user?.email?.split("@")[0] ||
                      t("common.notSet")}
                  </strong>
                  <span>{profile?.email || user?.email}</span>
                </div>
                <Link className="user-dropdown-item" to="/profile" role="menuitem">
                  <UserRound />
                  <span>{t("user.personalProfile")}</span>
                </Link>
                <button
                  className="user-dropdown-item danger"
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                >
                  <LogOut />
                  <span>{t("common.signOut")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace-bar">
        <div className="nav-row-spacer" aria-hidden="true" />
        <nav className="primary-nav lowered-nav" aria-label="Primary">
          {visiblePrimaryNav.map(({ key, to, icon: NavIcon }) => (
            <NavLink
              key={key}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "primary-nav-link",
                  isPrimaryNavActive(section, key, isActive) && "active",
                )
              }
            >
              <NavIcon />
              <span>{t(`navigation.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <CurrentDateTime />
      </div>

      <div
        className={cn(
          "shell-body",
          sidebarCollapsed && "sidebar-is-collapsed",
        )}
      >
        <aside className="sidebar">
          <nav aria-label="Secondary">
            {sideItems.map((item) => {
              const visibleChildren = (item.children ?? []).filter((child) =>
                isNavItemVisible(child, pageAccess.canAccess),
              );
              const childActive = visibleChildren.some((child) =>
                isNavPathActive(location.pathname, child.to, false),
              );
              const parentExact = item.to === "/" || item.to === `/${section}`;

              return (
                <div className="sidebar-nav-group" key={`${item.key}-${item.to}`}>
                  <NavLink
                    to={visibleChildren[0]?.to ?? item.to}
                    end={parentExact || visibleChildren.length > 0}
                    className={({ isActive }) =>
                      cn(
                        "sidebar-link",
                        visibleChildren.length > 0 && "has-children",
                        (isActive || childActive) &&
                          (visibleChildren.length === 0 || sidebarCollapsed) &&
                          "active",
                        childActive && "open",
                      )
                    }
                    title={
                      sidebarCollapsed ? t(`navigation.${item.key}`) : undefined
                    }
                  >
                    <item.icon />
                    <span>{t(`navigation.${item.key}`)}</span>
                    {!sidebarCollapsed && (
                      <ChevronRight
                        className={cn(
                          "link-chevron",
                          visibleChildren.length > 0 && "is-expanded",
                        )}
                      />
                    )}
                  </NavLink>
                  {visibleChildren.length > 0 && !sidebarCollapsed ? (
                    <div className="sidebar-subnav">
                      {visibleChildren.map((child) => (
                        <NavLink
                          key={`${child.key}-${child.to}`}
                          to={child.to}
                          end
                          className={({ isActive }) =>
                            cn("sidebar-link nested", isActive && "active")
                          }
                        >
                          <child.icon />
                          <span>{t(`navigation.${child.key}`)}</span>
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <button
            className="sidebar-collapse"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={
              sidebarCollapsed ? t("common.openMenu") : t("common.closeMenu")
            }
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!sidebarCollapsed && <span>{t("common.closeMenu")}</span>}
          </button>
        </aside>

        <main className="main-content">
          <div className="page-transition" key={pageKey}>
            {pageAccess.loading ? (
              <PageSkeleton label={t("settings.loadingPermissions")} />
            ) : !pageAccess.canAccess(currentPageKey) ? (
              <SettingsAccessDenied />
            ) : (
              <Routes>
              <Route path="/" element={<Dashboard role={profile?.role} />} />
              <Route
                path="/follow-up"
                element={<FollowUpPage role={profile?.role ?? null} />}
              />
              <Route path="/profile" element={<ProfilePage />} />
              <Route
                path="/orders"
                element={<OrdersListPage canViewFinance={canViewFinance} />}
              />
              <Route
                path="/orders/pending"
                element={
                  <OrdersListPage
                    preset="pending"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/unpaid"
                element={
                  <OrdersListPage
                    preset="unpaid"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/delivered-unpaid"
                element={
                  <OrdersListPage
                    preset="delivered-unpaid"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/payments"
                element={<PaymentsListPage canViewFinance={canViewFinance} />}
              />
              <Route
                path="/orders/settings"
                element={<Navigate to="/orders/settings/statuses" replace />}
              />
              <Route
                path="/orders/settings/statuses"
                element={<OrderStatusesPage />}
              />
              <Route
                path="/orders/settings/sale-partners"
                element={<SalesPartnersPage />}
              />
              <Route
                path="/orders/:id"
                element={
                  <OrderDetailPage
                    documentType="order"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route path="/quotes" element={<QuotesListPage />} />
              <Route
                path="/quotes/high-chance"
                element={<QuotesListPage preset="high-chance" />}
              />
              <Route
                path="/quotes/large"
                element={<QuotesListPage preset="large" />}
              />
              <Route
                path="/quotes/follow-up"
                element={<QuotesListPage preset="follow-up" />}
              />
              <Route
                path="/quotes/:id"
                element={
                  <OrderDetailPage documentType="quote" canViewFinance={canViewFinance} />
                }
              />
              <Route path="/products" element={<ProductsListPage />} />
              <Route
                path="/products/catering"
                element={<ProductsListPage preset="catering" />}
              />
              <Route
                path="/products/lunchbox"
                element={<ProductsListPage preset="lunchbox" />}
              />
              <Route
                path="/products/ala-carte"
                element={<ProductsListPage preset="ala-carte" />}
              />
              <Route
                path="/products/packages"
                element={<PackagesListPage />}
              />
              <Route
                path="/products/packages/:id"
                element={<PackageDetailPage />}
              />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route
                path="/frozen"
                element={<Navigate to="/frozen/raw-meat-inventory" replace />}
              />
              <Route
                path="/frozen/raw-meat-inventory"
                element={<RawMeatInventoryCalcPage />}
              />
              <Route
                path="/frozen/prepared-meat-inventory"
                element={<PreparedMeatInventoryCalcPage />}
              />
              <Route
                path="/frozen/selling-price-cost"
                element={<SellingPriceCostPage />}
              />
              <Route
                path="/frozen/delivery-notes"
                element={<MeatDeliveryNotesPage />}
              />
              <Route
                path="/frozen/seasoning-cost"
                element={<SeasoningCostSettingsPage />}
              />
              <Route
                path="/frozen/calculation-settings"
                element={<CalculationSettingsPage />}
              />
              <Route
                path="/frozen/customers"
                element={<MeatCustomersPage />}
              />
              <Route
                path="/frozen/spice-usage"
                element={<SpiceUsagePage />}
              />
              <Route
                path="/frozen/yield-errors"
                element={<MeatYieldErrorsPage />}
              />
              <Route
                path="/reports/frozen-meat"
                element={<ReportsPage group="frozenMeat" />}
              />
              <Route
                path="/reports/shops"
                element={<ReportsPage group="shops" />}
              />
              <Route
                path="/reports/*"
                element={<Navigate to={firstReportsPath} replace />}
              />
              <Route
                path="/settings"
                element={<Navigate to={firstSettingsPath} replace />}
              />
              <Route
                path="/settings/users"
                element={
                  pageAccess.canAccess("settings.users") ? (
                    <UsersListPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/roles"
                element={
                  pageAccess.canAccess("settings.roles") ? (
                    <RolePermissionsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/login-logs"
                element={
                  pageAccess.canAccess("settings.login_logs") ? (
                    <LoginLogsListPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/attachments"
                element={
                  pageAccess.canAccess("settings.attachments") ? (
                    <AttachmentsListPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route path="*" element={<ModulePlaceholder section={section} />} />
              </Routes>
            )}
          </div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-menu-layer">
          <button
            className="mobile-backdrop"
            type="button"
            aria-label={t("common.closeMenu")}
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="mobile-drawer">
            <div className="mobile-drawer-header">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t("common.closeMenu")}
              >
                <X />
              </Button>
            </div>
            <nav aria-label="Navigation">
              {mobileNavGroups.map((group) => (
                <div className="mobile-nav-group" key={group.groupKey}>
                  <p className="mobile-nav-group-label">
                    {t(`navigation.${group.groupKey}`)}
                  </p>
                  {group.items.map(({ key, to, icon: NavIcon }) => (
                    <NavLink
                      key={`${group.groupKey}-${key}-${to}`}
                      to={to}
                      end={mobileNavLinkEnd(to, mobileNavHrefs)}
                      className={({ isActive }) =>
                        cn("sidebar-link", isActive && "active")
                      }
                    >
                      <NavIcon />
                      <span>{t(`navigation.${key}`)}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="mobile-account-actions">
              <Link className="sidebar-link" to="/profile">
                <UserRound />
                <span>{t("user.personalProfile")}</span>
              </Link>
              <button
                className="sidebar-link danger"
                type="button"
                onClick={() => void signOut()}
              >
                <LogOut />
                <span>{t("common.signOut")}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: MetricIcon,
  tone,
  to,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: Icon;
  tone: "red" | "blue" | "green" | "amber";
  to: string;
}) {
  return (
    <Link className="metric-card" to={to}>
      <div className={cn("metric-icon", tone)}>
        <MetricIcon />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <ChevronRight className="metric-chevron" />
    </Link>
  );
}

const EMPTY_DASHBOARD: DashboardData = {
  metrics: {
    ordersToday: 0,
    ordersChange: null,
    revenueToday: 0,
    revenueChange: null,
    pendingDeliveries: 0,
    lowStock: 0,
  },
  queues: {
    highChanceQuotes: 0,
    largeQuotes: 0,
    unpaidOrders: 0,
    unassignedDrivers: 0,
    deliveredUnpaid: 0,
  },
  progress: {
    confirmed: 0,
    preparing: 0,
    ready: 0,
    shipping: 0,
    completed: 0,
  },
  jobs: [],
};

type DashboardLoader = (role?: string | null) => Promise<DashboardData>;

const defaultDashboardLoader: DashboardLoader = (role) =>
  fetchDashboardData(new Date(), role);

function AnimatedValue({
  value,
  format = (number) => Math.round(number).toLocaleString(),
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const animated = useAnimatedNumber(value);
  return <span className="animated-number">{format(animated)}</span>;
}

function AnimatedChange({
  value,
  unavailable,
  versusYesterday,
}: {
  value: number | null;
  unavailable: string;
  versusYesterday: string;
}) {
  const animated = useAnimatedNumber(value ?? 0);
  if (value === null) return <>{unavailable}</>;
  const sign = animated >= 0 ? "+" : "";
  return (
    <>
      {sign}
      {animated.toFixed(1)}% {versusYesterday}
    </>
  );
}

function jobStatus(
  job: DashboardJob,
  labels: {
    completed: string;
    shipping: string;
    ready: string;
    awaitingDriver: string;
    preparing: string;
    confirmed: string;
  },
) {
  if (job.deliveryStatus === "己送達" || job.deliveryStatus === "已送達") {
    return { label: labels.completed, tone: "green" };
  }
  if (job.deliveryStatus === "送貨途中") {
    return { label: labels.shipping, tone: "blue" };
  }
  if (job.deliveryStatus === "待取貨") {
    return { label: labels.ready, tone: "green" };
  }
  if (
    job.deliveryStatus === "待接單" ||
    job.deliveryStatus === "未派車隊"
  ) {
    return { label: labels.awaitingDriver, tone: "amber" };
  }
  if (job.isSentToFactory) {
    return { label: labels.preparing, tone: "amber" };
  }
  return { label: labels.confirmed, tone: "blue" };
}

export function Dashboard({
  loadDashboard = defaultDashboardLoader,
  role,
}: {
  loadDashboard?: DashboardLoader;
  role?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const currency = new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  });
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadDashboard(role)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const code =
          typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
            ? loadError.code
            : "dashboard_load_failed";
        setError(code);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadDashboard, reloadKey, role]);

  const queues = [
    {
      label: t("dashboard.highChanceQuotes"),
      count: data.queues.highChanceQuotes,
      tone: "amber",
      to: "/quotes/high-chance",
    },
    {
      label: t("dashboard.largeQuotes"),
      count: data.queues.largeQuotes,
      tone: "amber",
      to: "/quotes/large",
    },
    {
      label: t("dashboard.unpaidOrders"),
      count: data.queues.unpaidOrders,
      tone: "blue",
      to: "/orders/unpaid",
    },
    {
      label: t("dashboard.unassignedDrivers"),
      count: data.queues.unassignedDrivers,
      tone: "purple",
      to: "/delivery/unassigned",
    },
    {
      label: t("dashboard.deliveredUnpaid"),
      count: data.queues.deliveredUnpaid,
      tone: "green",
      to: "/orders/delivered-unpaid",
    },
  ];

  const progressTotal = Object.values(data.progress).reduce(
    (total, count) => total + count,
    0,
  );
  const progressWidth = (count: number) =>
    `${progressTotal === 0 ? 0 : Math.max(2, (count / progressTotal) * 100)}%`;
  const progress = [
    {
      label: t("dashboard.confirmed"),
      count: data.progress.confirmed,
      to: "/orders?status=confirmed",
      tone: "indigo",
    },
    {
      label: t("dashboard.preparing"),
      count: data.progress.preparing,
      to: "/kitchen?status=preparing",
      tone: "amber",
    },
    {
      label: t("dashboard.ready"),
      count: data.progress.ready,
      to: "/kitchen?status=ready",
      tone: "violet",
    },
    {
      label: t("dashboard.shipping"),
      count: data.progress.shipping,
      to: "/delivery?status=shipping",
      tone: "cyan",
    },
    {
      label: t("dashboard.completed"),
      count: data.progress.completed,
      to: "/orders?status=completed",
      tone: "green",
    },
  ].map((item) => ({ ...item, width: progressWidth(item.count) }));

  const statusLabels = {
    completed: t("dashboard.completedStatus"),
    shipping: t("dashboard.shippingStatus"),
    ready: t("dashboard.readyStatus"),
    awaitingDriver: t("dashboard.driverStatus"),
    preparing: t("dashboard.preparingStatus"),
    confirmed: t("dashboard.confirmedStatus"),
  };
  const jobTime = (job: DashboardJob) => {
    if (job.shipOutTime?.trim()) return job.shipOutTime;
    if (!job.deliveryAt) return t("common.notSet");
    const formatted = time.format(new Date(job.deliveryAt));
    return formatted === "24:00" || formatted === "00:00"
      ? t("common.notSet")
      : formatted;
  };

  if (loading) {
    return <PageSkeleton label={t("dashboard.loading")} variant="dashboard" />;
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">{t("dashboard.eyebrow")}</span>
          <h1>{t("dashboard.title")}</h1>
        </div>
        <div className="heading-actions">
          <Button variant="outline" asChild>
            <Link to="/reports/daily">
              <FileText />
              {t("dashboard.export")}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/orders/new">
              <span className="plus">+</span>
              {t("dashboard.newOrder")}
            </Link>
          </Button>
        </div>
      </section>

      {error && (
        <div className="dashboard-state dashboard-state-error" role="alert">
          <div>
            <strong>{t("dashboard.loadError")}</strong>
            <span>{t("dashboard.loadErrorDescription")}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw />
            {t("dashboard.retry")}
          </Button>
        </div>
      )}

      <section className="metrics-grid">
        <MetricCard
          label={t("dashboard.ordersToday")}
          value={
            <>
              <AnimatedValue value={data.metrics.ordersToday} />{" "}
              {t("dashboard.orderUnit")}
            </>
          }
          detail={
            <AnimatedChange
              value={data.metrics.ordersChange}
              unavailable={t("dashboard.noComparison")}
              versusYesterday={t("dashboard.versusYesterday")}
            />
          }
          icon={ClipboardList}
          tone="blue"
          to="/orders"
        />
        <MetricCard
          label={t("dashboard.revenueToday")}
          value={
            data.metrics.revenueToday === null ? (
              t("dashboard.unavailable")
            ) : (
              <AnimatedValue
                value={data.metrics.revenueToday}
                format={(value) => currency.format(value)}
              />
            )
          }
          detail={
            data.metrics.revenueToday === null ? (
              t("dashboard.noFinanceAccess")
            ) : (
              <AnimatedChange
                value={data.metrics.revenueChange}
                unavailable={t("dashboard.noComparison")}
                versusYesterday={t("dashboard.versusYesterday")}
              />
            )
          }
          icon={CircleDollarSign}
          tone="green"
          to="/reports?view=revenue"
        />
        <MetricCard
          label={t("dashboard.deliveries")}
          value={
            <>
              <AnimatedValue value={data.metrics.pendingDeliveries} />{" "}
              {t("dashboard.orderUnit")}
            </>
          }
          detail={`${data.metrics.ordersToday} ${t("dashboard.ordersTodayTotal")}`}
          icon={Truck}
          tone="blue"
          to="/delivery"
        />
        <MetricCard
          label={t("dashboard.lowStock")}
          value={
            data.metrics.lowStock === null ? (
              t("dashboard.unavailable")
            ) : (
              <>
                <AnimatedValue value={data.metrics.lowStock} />{" "}
                {t("dashboard.itemUnit")}
              </>
            )
          }
          detail={
            data.metrics.lowStock === null
              ? t("dashboard.noInventoryAccess")
              : t("dashboard.lowStockDefinition")
          }
          icon={Boxes}
          tone="amber"
          to="/inventory/low-stock"
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel queue-panel">
          <PanelHeader
            title={t("dashboard.queueTitle")}
            description={t("dashboard.queueDescription")}
          />
          <div className="queue-list">
            {queues.map((item) => (
              <Link key={item.label} to={item.to} className="queue-item">
                <span className={cn("queue-dot", item.tone)} />
                <span>{item.label}</span>
                <strong>
                  <AnimatedValue value={item.count} />
                </strong>
                <ChevronRight />
              </Link>
            ))}
          </div>
        </article>

        <article className="panel progress-panel">
          <PanelHeader
            title={t("dashboard.orderFlow")}
            description={t("dashboard.orderFlowDescription")}
          />
          <div className="progress-list">
            {progress.map((item) => (
              <Link
                className={cn("progress-row", `tone-${item.tone}`)}
                key={item.label}
                to={item.to}
              >
                <div>
                  <span>{item.label}</span>
                  <strong>
                    <AnimatedValue value={item.count} />
                  </strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: item.width }} />
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <article className="panel jobs-panel">
        <PanelHeader
          title={t("dashboard.productionTitle")}
          description={t("dashboard.productionDescription")}
          action={t("common.viewAll")}
          actionTo="/kitchen"
        />
        <PullToRefresh
          className="table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          refreshing={loading}
        >
          <table>
            <thead>
              <tr>
                <th>{t("dashboard.no")}</th>
                <th>{t("dashboard.customer")}</th>
                <th>{t("dashboard.time")}</th>
                <th>{t("dashboard.status")}</th>
                <th>{t("dashboard.amount")}</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((job) => {
                const status = jobStatus(job, statusLabels);
                return (
                <tr key={job.id}>
                  <td>
                    <Link className="order-link" to={`/orders/${job.id}`}>
                      {job.orderNumber || t("common.notSet")}
                    </Link>
                  </td>
                  <td>{job.customerName || t("common.notSet")}</td>
                  <td>{jobTime(job)}</td>
                  <td>
                    <span className={cn("status-badge", status.tone)}>
                      {status.label}
                    </span>
                  </td>
                  <td>
                    {job.amount === null ? (
                      t("common.notSet")
                    ) : (
                      <AnimatedValue
                        value={job.amount}
                        format={(value) =>
                          job.currency === "HKD"
                            ? currency.format(value)
                            : `${job.currency} ${Math.round(value).toLocaleString()}`
                        }
                      />
                    )}
                  </td>
                  <td>
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        to={`/orders/${job.id}`}
                        aria-label={`${t("dashboard.no")} ${
                          job.orderNumber || job.id
                        }`}
                      >
                        <ChevronRight />
                      </Link>
                    </Button>
                  </td>
                </tr>
                );
              })}
              {!loading && data.jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="dashboard-empty-row">
                    {t("dashboard.emptyJobs")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </PullToRefresh>
      </article>
    </>
  );
}

function PanelHeader({
  title,
  description,
  action,
  actionTo,
}: {
  title: string;
  description: string;
  action?: string;
  actionTo?: string;
}) {
  return (
    <header className="panel-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && actionTo && (
        <Button variant="ghost" asChild>
          <Link to={actionTo}>
            {action}
            <ChevronRight />
          </Link>
        </Button>
      )}
    </header>
  );
}

function ModulePlaceholder({ section }: { section: string }) {
  const { t } = useTranslation();
  const navItem = primaryNav.find((item) => item.key === section);
  const ModuleIcon = navItem?.icon ?? Settings;

  return (
    <section className="placeholder-page">
      <div className="placeholder-icon">
        <ModuleIcon />
      </div>
      <span className="eyebrow">{t("workspace.catering")}</span>
      <h1>{t(`navigation.${navItem?.key ?? "overview"}`)}</h1>
      <p>{t("dashboard.description")}</p>
      <Button asChild>
        <Link to="/">{t("navigation.overview")}</Link>
      </Button>
    </section>
  );
}

function AuthGate() {
  const { session, loading, profileLoading } = useAuth();
  const { t } = useTranslation();

  if (loading || (session && profileLoading)) {
    return (
      <main className="auth-loading">
        <span className="auth-loading-mark">FC</span>
        <div className="auth-loading-bar">
          <span />
        </div>
        <p>{t("auth.loading")}</p>
      </main>
    );
  }

  return session ? <OperationsShell /> : <LoginPage />;
}

function App() {
  return (
    <Routes>
      <Route
        path="/migration/*"
        element={
          <AuthProvider>
            <MigrationWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="*"
        element={
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        }
      />
    </Routes>
  );
}

export default App;
