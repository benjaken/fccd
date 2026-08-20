import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Sun,
  Truck,
  Users,
  UserRound,
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
  REPORT_GROUP_ROUTES,
  usePageAccess,
} from "@/auth/use-page-access";
import { LoginPage } from "@/components/LoginPage";
import { MigrationWorkspace } from "@/components/MigrationWorkspace";
import { FollowUpPage } from "@/components/FollowUpPage";
import { OrdersListPage } from "@/components/OrdersListPage";
import { OrdersDashboardPage } from "@/components/OrdersDashboardPage";
import { OrderSettingsPage } from "@/components/OrderSettingsPage";
import { OrderDetailPage } from "@/components/OrderDetailPage";
import { PaymentsListPage } from "@/components/PaymentsListPage";
import { MasoftInvoiceReceiptsPage } from "@/components/MasoftInvoiceReceiptsPage";
import { ProfilePage } from "@/components/ProfilePage";
import { ReportsPage } from "@/components/ReportsPage";
import { DataInputProgressPage } from "@/components/DataInputProgressPage";
import { QuotesListPage } from "@/components/QuotesListPage";
import { QuoteCustomersPage } from "@/components/QuoteCustomersPage";
import { ProductsListPage } from "@/components/ProductsListPage";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { PackagesListPage } from "@/components/PackagesListPage";
import { PackageDetailPage } from "@/components/PackageDetailPage";
import { PreparedMeatInventoryCalcPage } from "@/components/PreparedMeatInventoryCalcPage";
import { MeatDeliveryNotesPage } from "@/components/MeatDeliveryNotesPage";
import { DeliveryListPage } from "@/components/DeliveryListPage";
import { AssignDriverPage } from "@/components/AssignDriverPage";
import { FactoryBoardPage } from "@/components/FactoryBoardPage";
import { DriverDeliveryPage } from "@/components/DriverDeliveryPage";
import { RawMeatInventoryCalcPage } from "@/components/RawMeatInventoryCalcPage";
import { SpiceUsagePage } from "@/components/SpiceUsagePage";
import { SeasoningCostSettingsPage } from "@/components/SeasoningCostSettingsPage";
import { SellingPriceCostPage } from "@/components/SellingPriceCostPage";
import { CalculationSettingsPage } from "@/components/CalculationSettingsPage";
import { MeatCustomersPage } from "@/components/MeatCustomersPage";
import { MeatYieldErrorsPage } from "@/components/MeatYieldErrorsPage";
import { SupplierQuotePage } from "@/components/SupplierQuotePage";
import { KitchenCalendarPage } from "@/components/KitchenCalendarPage";
import { KitchenOrdersPage } from "@/components/KitchenOrdersPage";
import { KitchenSettingsPage } from "@/components/KitchenSettingsPage";
import { KitchenCostInputPage } from "@/components/KitchenCostInputPage";
import { KitchenMaterialUsagePage } from "@/components/KitchenMaterialUsagePage";
import { KitchenSalesCostReportPage } from "@/components/KitchenSalesCostReportPage";
import { KitchenProductSalesReportPage } from "@/components/KitchenProductSalesReportPage";
import { KitchenChannelSalesReportPage } from "@/components/KitchenChannelSalesReportPage";
import { KitchenAdvertisingPerformanceReportPage } from "@/components/KitchenAdvertisingPerformanceReportPage";
import { SuppliersPage } from "@/components/SuppliersPage";
import { IngredientsListPage } from "@/components/IngredientsListPage";
import { RestaurantStaffPage } from "@/components/RestaurantStaffPage";
import { RestaurantInventoryItemsPage } from "@/components/RestaurantInventoryItemsPage";
import { RestaurantSettingsPage } from "@/components/RestaurantSettingsPage";
import { RestaurantDepartmentSettingsPage } from "@/components/RestaurantDepartmentSettingsPage";
import { RestaurantServicePeriodsPage } from "@/components/RestaurantServicePeriodsPage";
import { RestaurantPaymentMethodsPage } from "@/components/RestaurantPaymentMethodsPage";
import { RestaurantDeliveryPlatformsPage } from "@/components/RestaurantDeliveryPlatformsPage";
import { RestaurantHolidaysPage } from "@/components/RestaurantHolidaysPage";
import { RestaurantRosterTimesPage } from "@/components/RestaurantRosterTimesPage";
import { SupplierCostCategoriesPage } from "@/components/SupplierCostCategoriesPage";
import { MonthlyPnlCostCategoriesPage } from "@/components/MonthlyPnlCostCategoriesPage";
import { PackingStocktakesPage } from "@/components/PackingStocktakesPage";
import { OrderStatusesPage } from "@/components/OrderStatusesPage";
import { SalesPartnersPage } from "@/components/SalesPartnersPage";
import { AttachmentsListPage } from "@/components/settings/AttachmentsListPage";
import { LoginLogsListPage } from "@/components/settings/LoginLogsListPage";
import { OrderListConfigsPage } from "@/components/settings/OrderListConfigsPage";
import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import { SettingsAccessDenied } from "@/components/settings/SettingsAccessDenied";
import { UsersListPage } from "@/components/settings/UsersListPage";
import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  fetchDashboardData,
  type DashboardData,
  type DashboardJob,
} from "@/lib/dashboard";
import {
  fetchOrderListConfigs,
  isOrderListNavVisible,
  ORDER_LIST_CONFIGS_CHANGED,
  orderListConfigByPreset,
  orderListNavLabel,
  type OrderListConfigRow,
} from "@/lib/order-list-configs";
import { useTheme } from "@/lib/use-theme";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { canAssignDeliveryFleet } from "@/lib/deliveries";
import { canEditProductCatalog } from "@/lib/products";
import { cn } from "@/lib/utils";
import {
  type Icon,
  type NavItem,
  buildMobileDrawerNav,
  isNavItemVisible,
  isNavPathActive,
  isPrimaryNavActive,
  isWorkspaceNavActive,
  mobileNavLinkEnd,
  primaryNav,
  sectionFromPath,
  secondaryNav,
  SECTION_CHILD_KEYS,
  workspaceLinks,
} from "@/lib/nav";

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
  const [orderListConfigs, setOrderListConfigs] = useState<
    OrderListConfigRow[] | null
  >(null);
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
  const sideItems = (secondaryNav[section] ?? secondaryNav.overview)
    .filter((item) => isNavItemVisible(item, pageAccess.canAccess))
    .filter((item) => isOrderListNavVisible(item.key, orderListConfigs));
  const mobileNavGroups = buildMobileDrawerNav(
    visiblePrimaryNav,
    (permissionKey) => pageAccess.canAccess(permissionKey),
  ).map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      isOrderListNavVisible(item.key, orderListConfigs),
    ),
  }));
  const mobileNavHrefs = mobileNavGroups.flatMap((group) =>
    group.items.map((item) => item.to),
  );
  const firstSettingsPath =
    secondaryNav.settings.find((item) =>
      pageAccess.canAccess(item.permissionKey ?? pageAccessKey(item.to)),
    )?.to ?? "/settings/users";
  const firstReportsPath =
    secondaryNav.reports
      .find((item) => item.key === "reports")
      ?.children?.find((item) =>
        isNavItemVisible(item, pageAccess.canAccess),
      )?.to ??
    REPORT_GROUP_ROUTES.frozenMeat;
  const canViewFinance = pageAccess.canAccess("finance");
  const canEditProducts = canEditProductCatalog(authorizationRole);
  const canEditDeliveries = canAssignDeliveryFleet(authorizationRole);
  const orderListConfigMap = orderListConfigByPreset(orderListConfigs);
  const navLabel = (key: string) =>
    orderListNavLabel(key, orderListConfigMap, t(`navigation.${key}`));

  useEffect(() => {
    let cancelled = false;
    const loadConfigs = () => {
      void fetchOrderListConfigs()
        .then((rows) => {
          if (!cancelled) setOrderListConfigs(rows);
        })
        .catch(() => {
          if (!cancelled) setOrderListConfigs([]);
        });
    };
    loadConfigs();
    window.addEventListener(ORDER_LIST_CONFIGS_CHANGED, loadConfigs);
    return () => {
      cancelled = true;
      window.removeEventListener(ORDER_LIST_CONFIGS_CHANGED, loadConfigs);
    };
  }, []);

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
          {workspaceLinks.map(({ key, to, icon: WorkspaceIcon, disabled }) =>
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
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "workspace-soft-link",
                  isWorkspaceNavActive(key, location.pathname) && "active",
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
                      sidebarCollapsed ? navLabel(item.key) : undefined
                    }
                  >
                    <item.icon />
                    <span>{navLabel(item.key)}</span>
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
                          <span>{navLabel(child.key)}</span>
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
                path="/orders/dashboard"
                element={<OrdersDashboardPage />}
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
                path="/orders/monthly"
                element={
                  <OrdersListPage
                    preset="monthly-settlement"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/split"
                element={
                  <OrdersListPage
                    preset="split"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/kitchen-notes"
                element={
                  <OrdersListPage
                    preset="kitchen-notes"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/reschedule-pending"
                element={
                  <OrdersListPage
                    preset="reschedule-pending"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/shopify-pending"
                element={
                  <OrdersListPage
                    preset="shopify-pending"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/not-sent-factory"
                element={
                  <OrdersListPage
                    preset="not-sent-factory"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/payments"
                element={<Navigate to="/orders/payments/bank-arrival-date" replace />}
              />
              <Route
                path="/orders/payments/bank-arrival-date"
                element={<PaymentsListPage canViewFinance={canViewFinance} />}
              />
              <Route
                path="/orders/payments/masoft-invoices"
                element={<MasoftInvoiceReceiptsPage canViewFinance={canViewFinance} />}
              />
              <Route
                path="/orders/calendar"
                element={<KitchenCalendarPage />}
              />
              <Route
                path="/orders/production"
                element={
                  <Navigate
                    to={`/orders/calendar${location.search}`}
                    replace
                  />
                }
              />
              <Route
                path="/orders/settings"
                element={<Navigate to="/orders/settings/sale-partners" replace />}
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
                path="/orders/settings/:tab"
                element={<OrderSettingsPage />}
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
                path="/quotes/pending"
                element={<QuotesListPage preset="pending" />}
              />
              <Route
                path="/quotes/upcoming"
                element={<QuotesListPage preset="upcoming" />}
              />
              <Route
                path="/quotes/customers"
                element={<QuoteCustomersPage />}
              />
              <Route
                path="/quotes/:id"
                element={
                  <OrderDetailPage documentType="quote" canViewFinance={canViewFinance} />
                }
              />
              <Route path="/products" element={<ProductsListPage canEdit={canEditProducts} />} />
              <Route
                path="/products/catering"
                element={<ProductsListPage preset="catering" canEdit={canEditProducts} />}
              />
              <Route
                path="/products/lunchbox"
                element={<ProductsListPage preset="lunchbox" canEdit={canEditProducts} />}
              />
              <Route
                path="/products/ala-carte"
                element={<ProductsListPage preset="ala-carte" canEdit={canEditProducts} />}
              />
              <Route
                path="/products/packages"
                element={<PackagesListPage canEdit={canEditProducts} />}
              />
              <Route
                path="/products/packages/:id/edit"
                element={<PackageDetailPage canEdit={canEditProducts} />}
              />
              <Route
                path="/products/packages/:id"
                element={<PackageDetailPage canEdit={canEditProducts} />}
              />
              <Route
                path="/products/:id/edit"
                element={<ProductDetailPage canEdit={canEditProducts} />}
              />
              <Route
                path="/products/:id"
                element={<ProductDetailPage canEdit={canEditProducts} />}
              />
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
                path="/frozen/supplier-quotes"
                element={<SupplierQuotePage />}
              />
              <Route
                path="/kitchen"
                element={<KitchenOrdersPage />}
              />
              <Route
                path="/kitchen/calendar"
                element={
                  <Navigate
                    to={`/orders/calendar${location.search}`}
                    replace
                  />
                }
              />
              <Route
                path="/delivery"
                element={<DeliveryListPage canEdit={canEditDeliveries} />}
              />
              <Route
                path="/delivery/assign"
                element={
                  pageAccess.canAccess("delivery.assign") ? (
                    <AssignDriverPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/settings"
                element={
                  pageAccess.canAccess("kitchen.settings") ? (
                    <KitchenSettingsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/suppliers"
                element={
                  pageAccess.canAccess("kitchen.suppliers") ? (
                    <SuppliersPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/ingredients"
                element={
                  pageAccess.canAccess("kitchen.ingredients") ? (
                    <IngredientsListPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/cost-input"
                element={<Navigate to={`/finance/cost-input${location.search}`} replace />}
              />
              <Route
                path="/finance/cost-input"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <KitchenCostInputPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/restaurant/staff"
                element={pageAccess.canAccess("restaurant.staff") ? <RestaurantStaffPage /> : <SettingsAccessDenied />}
              />
              <Route path="/restaurant/settings/monthly-pnl-cost-categories" element={pageAccess.canAccess("restaurant.settings.monthly_pnl_cost_categories") ? <MonthlyPnlCostCategoriesPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/inventory-items" element={pageAccess.canAccess("restaurant.settings.inventory_items") ? <RestaurantInventoryItemsPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/restaurants" element={pageAccess.canAccess("restaurant.settings.restaurants") ? <RestaurantSettingsPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/departments" element={pageAccess.canAccess("restaurant.settings.departments") ? <RestaurantDepartmentSettingsPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/service-periods" element={pageAccess.canAccess("restaurant.settings.service_periods") ? <RestaurantServicePeriodsPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/payment-methods" element={pageAccess.canAccess("restaurant.settings.payment_methods") ? <RestaurantPaymentMethodsPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/delivery-platforms" element={pageAccess.canAccess("restaurant.settings.delivery_platforms") ? <RestaurantDeliveryPlatformsPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/holidays" element={pageAccess.canAccess("restaurant.settings.holidays") ? <RestaurantHolidaysPage /> : <SettingsAccessDenied />} />
              <Route path="/restaurant/settings/roster-times" element={pageAccess.canAccess("restaurant.settings.roster_times") ? <RestaurantRosterTimesPage /> : <SettingsAccessDenied />} />
              <Route
                path="/kitchen/packing-stocktakes"
                element={
                  pageAccess.canAccess("kitchen.packing_stocktakes") ? (
                    <PackingStocktakesPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/ingredient-stocktakes"
                element={
                  pageAccess.canAccess("kitchen.ingredient_stocktakes") ? (
                    <PackingStocktakesPage kind="ingredient" />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports"
                element={<Navigate to={firstReportsPath} replace />}
              />
              <Route
                path="/reports/data-input-progress"
                element={
                  pageAccess.canAccess("reports.data_input_progress") ? (
                    <DataInputProgressPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <KitchenSalesCostReportPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/product-sales"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <KitchenProductSalesReportPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/channel-sales"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <KitchenChannelSalesReportPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/advertising-performance"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <KitchenAdvertisingPerformanceReportPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/material-usage"
                element={
                  pageAccess.canAccess("kitchen.material_usage") ? (
                    <KitchenMaterialUsagePage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
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
              <Route path="/restaurant/settings/supplier-cost-categories" element={pageAccess.canAccess("restaurant.settings.supplier_cost_categories") ? <SupplierCostCategoriesPage /> : <SettingsAccessDenied />} />
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
                path="/settings/order-lists"
                element={
                  pageAccess.canAccess("settings.order_lists") ? (
                    <OrderListConfigsPage />
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
              <div className="mobile-nav-group">
                <p className="mobile-nav-group-label">
                  {t("workspace.label")}
                </p>
                {workspaceLinks.map(({ key, to, icon: WorkspaceIcon, disabled }) =>
                  disabled ? (
                    <span
                      key={key}
                      className="sidebar-link disabled"
                      aria-disabled="true"
                    >
                      <WorkspaceIcon />
                      <span>{t(`workspace.${key}`)}</span>
                    </span>
                  ) : (
                    <Link
                      key={key}
                      to={to}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "sidebar-link",
                        isWorkspaceNavActive(key, location.pathname) && "active",
                      )}
                    >
                      <WorkspaceIcon />
                      <span>{t(`workspace.${key}`)}</span>
                    </Link>
                  ),
                )}
              </div>
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
                      <span>{navLabel(key)}</span>
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
                    <DetailLink className="order-link" to={`/orders/${job.id}`}>
                      {job.orderNumber || t("common.notSet")}
                    </DetailLink>
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
                      <DetailLink
                        to={`/orders/${job.id}`}
                        aria-label={`${t("dashboard.no")} ${
                          job.orderNumber || job.id
                        }`}
                      >
                        <ChevronRight />
                      </DetailLink>
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

export function WorkspacePlaceholderPage({
  workspaceKey,
  icon: WorkspaceIcon,
}: {
  workspaceKey: "factory" | "delivery" | "customer";
  icon: Icon;
}) {
  const { t } = useTranslation();

  return (
    <section className="placeholder-page">
      <div className="placeholder-icon">
        <WorkspaceIcon />
      </div>
      <h1>{t(`workspace.${workspaceKey}`)}</h1>
      <p>{t("workspace.placeholder")}</p>
    </section>
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
      <span className="eyebrow">{t("workspace.factory")}</span>
      <h1>{t(`navigation.${navItem?.key ?? "overview"}`)}</h1>
      <p>{t("dashboard.description")}</p>
      <Button asChild>
        <Link to="/">{t("navigation.overview")}</Link>
      </Button>
    </section>
  );
}

function AuthLoadingScreen() {
  const { t } = useTranslation();

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

function WorkspaceStandalonePage({
  workspaceKey,
  icon,
}: {
  workspaceKey: "factory" | "delivery" | "customer";
  icon: Icon;
}) {
  return (
    <main className="workspace-standalone">
      <WorkspacePlaceholderPage workspaceKey={workspaceKey} icon={icon} />
    </main>
  );
}

function FactoryWorkspace() {
  const { session, loading, profileLoading } = useAuth();

  if (loading || (session && profileLoading)) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return <LoginPage />;
  }

  return <FactoryBoardPage />;
}

function DriverDeliveryWorkspace() {
  return <DriverDeliveryPage />;
}

function CustomerWorkspace() {
  return <WorkspaceStandalonePage workspaceKey="customer" icon={Users} />;
}

function AuthGate() {
  const { session, loading, profileLoading } = useAuth();

  if (loading || (session && profileLoading)) {
    return <AuthLoadingScreen />;
  }

  return session ? <OperationsShell /> : <LoginPage />;
}

function App() {
  return (
    <Routes>
      <Route
        path="/factory"
        element={
          <AuthProvider>
            <FactoryWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/driver-delivery/*"
        element={
          <AuthProvider>
            <DriverDeliveryWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/customer/*"
        element={
          <AuthProvider>
            <CustomerWorkspace />
          </AuthProvider>
        }
      />
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
