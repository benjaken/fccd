import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Eye,
  FileText,
  LoaderCircle,
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
import { ResetPasswordPage } from "@/components/ResetPasswordPage";
import { NotificationCenter } from "@/components/NotificationCenter";
import { FrontendUpdateNotice } from "@/components/FrontendUpdateNotice";
import {
  HomeSalesDashboardPage,
  type HomeSalesDashboardLoader,
} from "@/components/HomeSalesDashboardPage";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import { MigrationWorkspace } from "@/components/MigrationWorkspace";
import { OrdersListPage } from "@/components/OrdersListPage";
import { CustomerServiceOrderInquiriesPage } from "@/components/CustomerServiceOrderInquiriesPage";
import { OrdersDashboardPage } from "@/components/OrdersDashboardPage";
import { OrderSettingsPage } from "@/components/OrderSettingsPage";
import { PaymentsListPage } from "@/components/PaymentsListPage";
import { MasoftInvoiceReceiptsPage } from "@/components/MasoftInvoiceReceiptsPage";
import { ProfilePage } from "@/components/ProfilePage";
import { ReportsPage } from "@/components/ReportsPage";
import { DataInputProgressPage } from "@/components/DataInputProgressPage";
import { QuotesListPage } from "@/components/QuotesListPage";
import { QuoteEditorPage } from "@/components/QuoteEditorPage";
import { QuotePdfEditorPage } from "@/components/QuotePdfEditorPage";
import { ReceiptPdfEditorPage } from "@/components/ReceiptPdfEditorPage";
import { QuotePdfPagesSettingsPage } from "@/components/QuotePdfPagesSettingsPage";
import { QuoteCustomersPage } from "@/components/QuoteCustomersPage";
import { EnquiryFormsListPage } from "@/components/EnquiryFormsListPage";
import { EnquiryFormEditorPage } from "@/components/EnquiryFormEditorPage";
import { EnquiryPendingListPage } from "@/components/EnquiryPendingListPage";
import { EnquiryPendingDetailPage } from "@/components/EnquiryPendingDetailPage";
import { PublicEnquiryFormPage } from "@/components/PublicEnquiryFormPage";
import { ProductsListPage } from "@/components/ProductsListPage";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { PackagesListPage } from "@/components/PackagesListPage";
import { PackageDetailPage } from "@/components/PackageDetailPage";
import { CatalogCreatePage } from "@/components/CatalogCreatePage";
import { ShopifyPendingProductsPage } from "@/components/ShopifyPendingProductsPage";
import { ShopifyPendingProductDetailPage } from "@/components/ShopifyPendingProductDetailPage";
import { PreparedMeatInventoryCalcPage } from "@/components/PreparedMeatInventoryCalcPage";
import { MeatDeliveryNotesPage } from "@/components/MeatDeliveryNotesPage";
import { DeliveryListPage } from "@/components/DeliveryListPage";
import { AssignDriverPage } from "@/components/AssignDriverPage";
import { DeliveryFleetsPage } from "@/components/DeliveryFleetsPage";
import { DeliverySurchargeTypesPage } from "@/components/DeliverySurchargeTypesPage";
import { FactoryBoardPage } from "@/components/FactoryBoardPage";
import { FactoryOrderPage } from "@/components/FactoryOrderPage";
import { FactoryMeatDeliveryNotePage, FactoryShopDeliveryNotePage } from "@/components/FactoryMeatDeliveryNotePage";
import { FactoryMultiDayReportPage } from "@/components/FactoryMultiDayReportPage";
import { FactoryProductionCalendarPage } from "@/components/FactoryProductionCalendarPage";
import { FactoryWarehousePage } from "@/components/FactoryWarehousePage";
import {
  FactoryWarehouseReceiptsPage,
  FactoryWarehouseShipmentsPage,
} from "@/components/FactoryWarehousePages";
import { DriverDeliveryPage } from "@/components/DriverDeliveryPage";
import { CustomerSelfServicePage } from "@/components/CustomerSelfServicePage";
import { RawMeatInventoryCalcPage } from "@/components/RawMeatInventoryCalcPage";
import { SpiceUsagePage } from "@/components/SpiceUsagePage";
import { SeasoningCostSettingsPage } from "@/components/SeasoningCostSettingsPage";
import { SeasoningRecipesPage } from "@/components/SeasoningRecipesPage";
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
import { MaterialInventoryPage } from "@/components/MaterialInventoryPage";
import { KitchenSalesCostReportPage } from "@/components/KitchenSalesCostReportPage";
import { KitchenProductSalesReportPage } from "@/components/KitchenProductSalesReportPage";
import { KitchenChannelSalesReportPage } from "@/components/KitchenChannelSalesReportPage";
import { KitchenAdvertisingPerformanceReportPage } from "@/components/KitchenAdvertisingPerformanceReportPage";
import { FestivalOrderGenerationReportPage } from "@/components/FestivalOrderGenerationReportPage";
import { ReportAiWorkspace } from "@/components/report-ai/ReportAiWorkspace";
import { SuppliersPage } from "@/components/SuppliersPage";
import { IngredientsListPage } from "@/components/IngredientsListPage";
import { RestaurantStaffPage } from "@/components/RestaurantStaffPage";
import { RestaurantDailySalesPage } from "@/components/RestaurantDailySalesPage";
import {
  RestaurantHrPlaceholderPage,
  RestaurantWorkspaceHomePage,
  RestaurantWorkspaceLoginPage,
  RestaurantWorkspacePage,
} from "@/components/RestaurantWorkspacePage";
import { ShopOrderPage } from "@/components/ShopOrderPage";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import { ShopReceivePage } from "@/components/ShopReceivePage";
import { TKO_RESTAURANT_ID } from "@/lib/shop-orders";
import {
  OfficeShopPhonebookPage,
  OfficeShopReviewPage,
  OfficeShopSuppliersPage,
} from "@/components/OfficeShopOrderingPages";
import { RestaurantDailyPurchasesPage } from "@/components/RestaurantDailyPurchasesPage";
import { RestaurantStocktakesPage } from "@/components/RestaurantStocktakesPage";
import { RestaurantMonthlyExpensesPage } from "@/components/RestaurantMonthlyExpensesPage";
import { RestaurantSalesReportPage } from "@/components/RestaurantSalesReportPage";
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
import { CompanyEmployeesPage } from "@/components/settings/CompanyEmployeesPage";
import { DictionariesPage } from "@/components/settings/DictionariesPage";
import { CustomerFaqPage } from "@/components/settings/CustomerFaqPage";
import { DeliveryDistrictsPage } from "@/components/settings/DeliveryDistrictsPage";
import { LoginLogsListPage } from "@/components/settings/LoginLogsListPage";
import { NotificationSettingsPage } from "@/components/settings/NotificationSettingsPage";
import { OrderListConfigsPage } from "@/components/settings/OrderListConfigsPage";
import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import { SettingsAccessDenied } from "@/components/settings/SettingsAccessDenied";
import { UsersListPage } from "@/components/settings/UsersListPage";
import { WatiEmailSendLogsPage } from "@/components/settings/WatiEmailSendLogsPage";
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
import {
  FOLLOW_UP_COUNTS_CHANGED,
  fetchFollowUpCounts,
  followUpCountForKey,
  type FollowUpCounts,
} from "@/lib/follow-up-counts";
import { useTheme } from "@/lib/use-theme";
import { useComfortMode } from "@/lib/use-comfort-mode";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { cn } from "@/lib/utils";
import {
  type Icon,
  type NavItem,
  accessiblePrimaryNavigationPath,
  accessibleBusinessPrimaryPath,
  businessCategoryFromLocation,
  businessPrimaryNav,
  businessSectionFromLocation,
  businessSidebarNav,
  buildBusinessMobileDrawerNav,
  buildMobileDrawerNav,
  firstAccessibleNavigationPath,
  flattenVisibleNavItems,
  isNavItemVisible,
  isBusinessPrimaryNavVisible,
  isBusinessSecondaryNavItemActive,
  isPrimaryNavActive,
  isSecondaryNavItemActive,
  isWorkspaceNavActive,
  mobileNavLinkEnd,
  primaryNav,
  sidebarAccordionExpansion,
  sectionFromPath,
  secondaryNav,
  SECTION_CHILD_KEYS,
  workspaceLinks,
} from "@/lib/nav";
import {
  MENU_STYLE_CHANGED,
  readMenuStyle,
  type MenuStyle,
} from "@/lib/menu-style";

function Brand() {
  const { t } = useTranslation();

  return (
    <Link className="brand" to="/" aria-label={t("brand.name")}>
      <img
        className="brand-logo"
        src={FOOD_CHANNEL_CATERING_LOGO_PATH}
        alt=""
        aria-hidden="true"
      />
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
  const documentEditorMode = /^(?:\/orders\/[^/]+\/(?:receipt|invoice)|\/quotes\/[^/]+\/pdf)\/?$/.test(
    location.pathname,
  );
  const { dark, toggleTheme } = useTheme();
  const { comfortMode, toggleComfortMode } = useComfortMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarGroupExpansion, setSidebarGroupExpansion] = useState<
    Record<string, boolean>
  >({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuStyle>(() =>
    readMenuStyle(user?.id),
  );
  const [orderListConfigs, setOrderListConfigs] = useState<
    OrderListConfigRow[] | null
  >(null);
  const [followUpCounts, setFollowUpCounts] = useState<FollowUpCounts | null>(null);
  const [recoveringInitialPath, setRecoveringInitialPath] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSidebarGroupExpansion({});
  }, [location.pathname, location.search, menuStyle]);

  const isBusinessMenu = menuStyle === "style-one";
  const section = isBusinessMenu
    ? businessSectionFromLocation(location.pathname, location.search)
    : sectionFromPath(location.pathname);
  const businessCategory = isBusinessMenu
    ? businessCategoryFromLocation(section, location.pathname, location.search)
    : "";
  const authorizationRole = profile?.role;
  const pageAccess = usePageAccess(authorizationRole);
  const currentPageKey = pageAccessKey(location.pathname);
  const visiblePrimaryNav = primaryNav.filter((item) => {
    const key = item.permissionKey ?? item.key;
    return (
      pageAccess.canAccessSection(key, SECTION_CHILD_KEYS[key] ?? []) &&
      accessiblePrimaryNavigationPath(item, pageAccess.canAccess) !== null
    );
  });
  const visibleBusinessPrimaryNav = businessPrimaryNav.filter((item) =>
    isBusinessPrimaryNavVisible(item, pageAccess.canAccess),
  );
  const displayedPrimaryNav = isBusinessMenu
    ? visibleBusinessPrimaryNav
    : visiblePrimaryNav;
  const visibleWorkspaceLinks = workspaceLinks.filter((item) =>
    pageAccess.canAccess(item.permissionKey),
  );
  const firstAccessiblePath = firstAccessibleNavigationPath(
    pageAccess.canAccess,
    pageAccess.canAccessSection,
  );
  const sideItems = (isBusinessMenu
    ? businessSidebarNav(section, businessCategory)
    : secondaryNav[section] ?? secondaryNav.overview)
    .filter((item) => isNavItemVisible(item, pageAccess.canAccess))
    .filter((item) => isOrderListNavVisible(item.key, orderListConfigs));
  const styleTwoMobileGroups = buildMobileDrawerNav(
    visiblePrimaryNav,
    pageAccess.canAccess,
  );
  const styleOneMobileGroups = buildBusinessMobileDrawerNav(
    visibleBusinessPrimaryNav,
    pageAccess.canAccess,
    (item) => isOrderListNavVisible(item.key, orderListConfigs),
  );
  const mobileNavGroups = (isBusinessMenu
    ? styleOneMobileGroups
    : styleTwoMobileGroups).map((group) => ({
    ...group,
    items: isBusinessMenu
      ? group.items
      : group.items.filter((item) =>
          isOrderListNavVisible(item.key, orderListConfigs),
        ),
  }));
  const mobileNavHrefs = mobileNavGroups.flatMap((group) =>
    flattenVisibleNavItems(group.items, () => true).map((item) => item.to),
  );
  const firstSettingsPath =
    secondaryNav.settings.find((item) =>
      pageAccess.canAccess(item.permissionKey ?? pageAccessKey(item.to)),
    )?.to ?? "/settings/users";
  const firstSettingsHref = isBusinessMenu
    ? `${firstSettingsPath}${firstSettingsPath.includes("?") ? "&" : "?"}nav=settings`
    : firstSettingsPath;
  const firstReportsPath =
    secondaryNav.reports
      .find((item) => item.key === "reports")
      ?.children?.find((item) =>
        isNavItemVisible(item, pageAccess.canAccess),
      )?.to ??
    REPORT_GROUP_ROUTES.frozenMeat;
  const canViewFinance = pageAccess.canAccess("finance");
  const canEditOrders = pageAccess.canManage("orders");
  const canEditQuotes = pageAccess.canManage("quotes");
  const canEditProducts = pageAccess.canManage("products");
  const canEditPackages = pageAccess.canManage("products.packages");
  const canManageShopifyCatalog = pageAccess.canManage("products.shopify_pending");
  const canEditDeliveries = pageAccess.canManage("delivery");
  const orderListConfigMap = orderListConfigByPreset(orderListConfigs);
  const navLabel = (key: string) =>
    orderListNavLabel(
      key,
      orderListConfigMap,
      isBusinessMenu ? businessMenuLabel(key, i18n.language, t(`navigation.${key}`)) : t(`navigation.${key}`),
    );
  const navCount = (key: string) => followUpCountForKey(followUpCounts, key);

  const visibleNavChildren = (item: NavItem) =>
    (item.children ?? [])
      .filter((child) => isNavItemVisible(child, pageAccess.canAccess))
      .filter((child) => isOrderListNavVisible(child.key, orderListConfigs));
  const leafTargets = (items: NavItem[]): string[] =>
    items.flatMap((item) => {
      const children = visibleNavChildren(item);
      return children.length ? leafTargets(children) : [item.to];
    });
  const sideLeafTargets = leafTargets(sideItems);
  const firstLeafTarget = (item: NavItem): string => {
    const children = visibleNavChildren(item);
    return children.length ? firstLeafTarget(children[0]) : item.to;
  };
  const leafIsActive = (to: string) =>
    isBusinessMenu
      ? isBusinessSecondaryNavItemActive(
          location.pathname,
          location.search,
          to,
          sideLeafTargets,
        )
      : isSecondaryNavItemActive(location.pathname, to, sideLeafTargets);
  const branchIsActive = (item: NavItem): boolean => {
    const children = visibleNavChildren(item);
    return children.length
      ? children.some(branchIsActive)
      : leafIsActive(item.to);
  };

  const renderSidebarItem = (
    item: NavItem,
    depth = 0,
    parentPath = "root",
    options: { nestGroups?: boolean } = {},
  ): ReactNode => {
    const visibleChildren = visibleNavChildren(item);
    const hasChildren = visibleChildren.length > 0;
    const nestGroups = options.nestGroups ?? !sidebarCollapsed;
    const childActive = hasChildren && visibleChildren.some(branchIsActive);
    const expansionKey = `${parentPath}/${item.key}`;
    const isExpanded = sidebarGroupExpansion[expansionKey] ?? childActive;
    const subnavId = `sidebar-subnav-${expansionKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const linkContent = (
      <>
        <item.icon />
        <span>{navLabel(item.key)}</span>
        {nestGroups && navCount(item.key) !== undefined ? (
          <span className="sidebar-link-count">{navCount(item.key)}</span>
        ) : null}
        {nestGroups && hasChildren ? (
          <ChevronRight
            className={cn("link-chevron", isExpanded && "is-expanded")}
          />
        ) : null}
      </>
    );

    return (
      <div className="sidebar-nav-group" key={`${expansionKey}-${item.to}`}>
        {hasChildren && nestGroups ? (
          <button
            type="button"
            className={cn(
              "sidebar-link",
              depth > 0 && "nested",
              "has-children",
              childActive && "open",
            )}
            aria-expanded={isExpanded}
            aria-controls={subnavId}
            onClick={() =>
              setSidebarGroupExpansion((current) =>
                sidebarAccordionExpansion(
                  current,
                  expansionKey,
                  parentPath,
                  isExpanded,
                ),
              )
            }
          >
            {linkContent}
          </button>
        ) : (
          <NavLink
            to={hasChildren ? firstLeafTarget(item) : item.to}
            end
            className={() =>
              cn(
                "sidebar-link",
                depth > 0 && "nested",
                hasChildren && "has-children",
                (hasChildren ? childActive : leafIsActive(item.to)) && "active",
                childActive && "open",
              )
            }
            title={!nestGroups ? navLabel(item.key) : undefined}
          >
            {linkContent}
          </NavLink>
        )}
        {hasChildren && nestGroups && isExpanded ? (
          <div className="sidebar-subnav" id={subnavId}>
            {visibleChildren.map((child) =>
              renderSidebarItem(child, depth + 1, expansionKey, options),
            )}
          </div>
        ) : null}
      </div>
    );
  };


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
    if (!isBusinessMenu) {
      setFollowUpCounts(null);
      return;
    }

    let cancelled = false;
    const loadCounts = () => {
      void fetchFollowUpCounts()
        .then((counts) => {
          if (!cancelled) setFollowUpCounts(counts);
        })
        .catch(() => {
          if (!cancelled) setFollowUpCounts(null);
        });
    };
    loadCounts();
    window.addEventListener(FOLLOW_UP_COUNTS_CHANGED, loadCounts);
    return () => {
      cancelled = true;
      window.removeEventListener(FOLLOW_UP_COUNTS_CHANGED, loadCounts);
    };
  }, [isBusinessMenu, location.pathname, location.search]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setMenuStyle(readMenuStyle(user?.id));
    const handleStyleChange = (event: Event) => {
      setMenuStyle((event as CustomEvent<MenuStyle>).detail);
    };
    window.addEventListener(MENU_STYLE_CHANGED, handleStyleChange);
    return () => window.removeEventListener(MENU_STYLE_CHANGED, handleStyleChange);
  }, [user?.id]);

  useEffect(() => {
    if (!pageAccess.loading) setRecoveringInitialPath(false);
  }, [pageAccess.loading]);

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
    <div className={cn("app-shell", isBusinessMenu && "menu-style-one", documentEditorMode && "document-editor-shell", comfortMode && "comfort-mode")}>
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

        <div className="topbar-center">
          {!documentEditorMode ? <FrontendUpdateNotice /> : null}
          <nav className="workspace-links" aria-label="Workspaces">
            {visibleWorkspaceLinks.map(({ key, to, icon: WorkspaceIcon, disabled }) =>
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
        </div>

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
            className={cn("comfort-mode-toggle", comfortMode && "active")}
            variant="ghost"
            size="icon"
            onClick={toggleComfortMode}
            aria-label={t(
              comfortMode
                ? "common.disableComfortMode"
                : "common.enableComfortMode",
            )}
            aria-pressed={comfortMode}
            title={t(
              comfortMode
                ? "common.disableComfortMode"
                : "common.enableComfortMode",
            )}
          >
            <Eye />
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
          {user ? <NotificationCenter userId={user.id} /> : null}
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
          {displayedPrimaryNav.map((item) => {
            const { key, icon: NavIcon } = item;
            const to =
              isBusinessMenu
                ? accessibleBusinessPrimaryPath(item, pageAccess.canAccess)
                : accessiblePrimaryNavigationPath(item, pageAccess.canAccess) ?? item.to;
            return (
            <NavLink
              key={key}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "primary-nav-link",
                  (isBusinessMenu ? section === key : isPrimaryNavActive(section, key, isActive)) && "active",
                )
              }
            >
              <NavIcon />
              <span>{navLabel(key)}</span>
            </NavLink>
            );
          })}
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
            {sideItems.map((item) => (
              <Fragment key={`${item.key}-${item.to}`}>
                {renderSidebarItem(item)}
              </Fragment>
            ))}
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
            ) : recoveringInitialPath &&
              !pageAccess.canAccess(currentPageKey) &&
              firstAccessiblePath ? (
              <Navigate to={firstAccessiblePath} replace />
            ) : !pageAccess.canAccess(currentPageKey) ? (
              <SettingsAccessDenied />
            ) : (
              <Routes>
              <Route path="/" element={<Dashboard role={profile?.role} />} />
              <Route
                path="/follow-up"
                element={<OrdersDashboardPage />}
              />
              <Route path="/profile" element={<ProfilePage />} />
              <Route
                path="/orders"
                element={<OrdersListPage canViewFinance={canViewFinance} canManageStatuses={canEditOrders} canAccessQueue={pageAccess.canAccess} />}
              />
              <Route
                path="/orders/customer-inquiries"
                element={
                  <CustomerServiceOrderInquiriesPage
                    canManage={pageAccess.canManage("orders.customer_inquiries")}
                  />
                }
              />
              <Route
                path="/orders/dashboard"
                element={<Navigate to="/follow-up" replace />}
              />
              <Route
                path="/orders/pending"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="pending"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/unpaid"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="unpaid"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/delivered-unpaid"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="delivered-unpaid"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/monthly"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="monthly-settlement"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/split"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="split"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/kitchen-notes"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="kitchen-notes"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/reschedule-pending"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="reschedule-pending"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/shopify-pending"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
                    preset="shopify-pending"
                    canViewFinance={canViewFinance}
                  />
                }
              />
              <Route
                path="/orders/not-sent-factory"
                element={
                  <OrdersListPage
                    canManageStatuses={canEditOrders}
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
                element={
                  <PaymentsListPage
                    canViewFinance={canViewFinance}
                    canManageActions={pageAccess.canManage("orders.payments")}
                  />
                }
              />
              <Route
                path="/orders/payments/masoft-invoices"
                element={
                  <MasoftInvoiceReceiptsPage
                    canViewFinance={canViewFinance}
                    canManageActions={pageAccess.canManage("orders.payments")}
                  />
                }
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
                path="/orders/settings/order-list-tips"
                element={
                  pageAccess.canAccess("settings.order_lists") ? (
                    <OrderListConfigsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/orders/settings/:tab"
                element={<OrderSettingsPage />}
              />
              <Route
                path="/orders/new"
                element={
                  canEditOrders ? <QuoteEditorPage documentType="order" canCreateProduct={canEditProducts} /> : <SettingsAccessDenied />
                }
              />
              <Route
                path="/orders/:id/edit"
                element={
                  canEditOrders ? <QuoteEditorPage documentType="order" canCreateProduct={canEditProducts} /> : <SettingsAccessDenied />
                }
              />
              <Route
                path="/orders/:id/receipt"
                element={
                  canEditOrders ? <ReceiptPdfEditorPage /> : <SettingsAccessDenied />
                }
              />
              <Route
                path="/orders/:id/invoice"
                element={
                  canEditOrders ? (
                    <ReceiptPdfEditorPage documentKind="invoice" />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/orders/:id"
                element={
                  <QuoteEditorPage documentType="order" combined readOnly canEdit={canEditOrders} canCreateProduct={canEditProducts} />
                }
              />
              <Route path="/quotes" element={<QuotesListPage canManage={canEditQuotes} />} />
              <Route
                path="/quotes/high-chance"
                element={<QuotesListPage preset="high-chance" canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/large"
                element={<QuotesListPage preset="large" canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/recent-open"
                element={<QuotesListPage preset="recent-open" canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/follow-up"
                element={<Navigate to="/quotes/recent-open" replace />}
              />
              <Route
                path="/quotes/pending"
                element={<EnquiryPendingListPage canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/pending/:id"
                element={<EnquiryPendingDetailPage canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/enquiry-forms"
                element={<EnquiryFormsListPage canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/enquiry-forms/:id/edit"
                element={
                  canEditQuotes ? (
                    <EnquiryFormEditorPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/quotes/upcoming"
                element={<QuotesListPage preset="upcoming" canManage={canEditQuotes} />}
              />
              <Route
                path="/quotes/customers"
                element={
                  <QuoteCustomersPage
                    canManageActions={pageAccess.canManage("quotes.customers")}
                  />
                }
              />
              <Route
                path="/quotes/pdf-pages"
                element={
                  pageAccess.canAccess("quotes.pdf_pages") ? (
                    <QuotePdfPagesSettingsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/quotes/new"
                element={canEditQuotes ? <QuoteEditorPage canCreateProduct={canEditProducts} /> : <SettingsAccessDenied />}
              />
              <Route
                path="/quotes/:id/edit"
                element={canEditQuotes ? <QuoteEditorPage canCreateProduct={canEditProducts} /> : <SettingsAccessDenied />}
              />
              <Route
                path="/quotes/:id/pdf"
                element={canEditQuotes ? <QuotePdfEditorPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/quotes/:id"
                element={<QuoteEditorPage combined readOnly canEdit={canEditQuotes} canCreateProduct={canEditProducts} />}
              />
              <Route path="/products" element={<ProductsListPage canEdit={canEditProducts} canCreatePackage={canEditPackages} />} />
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
                element={<PackagesListPage canEdit={canEditPackages} />}
              />
              <Route
                path="/products/packages/new"
                element={<CatalogCreatePage kind="package" canCreate={canEditPackages} />}
              />
              <Route
                path="/products/packages/:id/edit"
                element={<PackageDetailPage canEdit={canEditPackages} />}
              />
              <Route
                path="/products/packages/:id"
                element={<PackageDetailPage canEdit={canEditPackages} />}
              />
              <Route
                path="/products/shopify-pending"
                element={<ShopifyPendingProductsPage canManage={canManageShopifyCatalog} />}
              />
              <Route
                path="/products/shopify-pending/:id"
                element={<ShopifyPendingProductDetailPage canManage={canManageShopifyCatalog} />}
              />
              <Route
                path="/products/new"
                element={<CatalogCreatePage kind="product" canCreate={canEditProducts} />}
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
                element={
                  <PreparedMeatInventoryCalcPage
                    canManageActions={pageAccess.canManage("frozen.prepared_meat_inventory")}
                  />
                }
              />
              <Route
                path="/frozen/selling-price-cost"
                element={<SellingPriceCostPage />}
              />
              <Route
                path="/frozen/delivery-notes"
                element={
                  <MeatDeliveryNotesPage
                    canManageActions={pageAccess.canManage("frozen.delivery_notes")}
                  />
                }
              />
              <Route
                path="/frozen/seasoning-recipes"
                element={<SeasoningRecipesPage />}
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
                element={
                  <SupplierQuotePage
                    canUpload={pageAccess.canAccess("frozen.supplier_quotes.upload")}
                    canReview={pageAccess.canAccess("frozen.supplier_quotes.review")}
                    canExport={pageAccess.canAccess("frozen.supplier_quotes.export")}
                    canConfigure={pageAccess.canAccess("frozen.supplier_quotes.settings")}
                  />
                }
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
                path="/delivery/fleets"
                element={
                  pageAccess.canAccess("delivery.fleets") ? (
                    <DeliveryFleetsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/delivery/surcharges"
                element={
                  pageAccess.canAccess("delivery") ? (
                    <DeliverySurchargeTypesPage />
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
                path="/restaurant"
                element={<Navigate to="/restaurant/daily-sales" replace />}
              />
              <Route
                path="/restaurant/daily-sales"
                element={pageAccess.canAccess("restaurant.daily_sales") ? <RestaurantDailySalesPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/daily-purchases"
                element={pageAccess.canAccess("restaurant.daily_purchases") ? <RestaurantDailyPurchasesPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/inventory"
                element={pageAccess.canAccess("restaurant.inventory") ? <RestaurantStocktakesPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/monthly-expenses"
                element={pageAccess.canAccess("restaurant.monthly_expenses") ? <RestaurantMonthlyExpensesPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/reports"
                element={pageAccess.canAccess("restaurant.reports") ? <RestaurantSalesReportPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/staff"
                element={pageAccess.canAccess("restaurant.staff") ? <RestaurantStaffPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/ordering/suppliers"
                element={pageAccess.canAccess("restaurant.ordering.suppliers") ? <OfficeShopSuppliersPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/ordering/requests"
                element={<Navigate replace to="/restaurant/ordering/review?nav=restaurant" />}
              />
              <Route
                path="/restaurant/ordering/records"
                element={<Navigate replace to="/restaurant/ordering/review?nav=restaurant" />}
              />
              <Route
                path="/restaurant/ordering/phonebook"
                element={pageAccess.canAccess("restaurant.ordering.phonebook") ? <OfficeShopPhonebookPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/ordering/review"
                element={pageAccess.canAccess("restaurant.ordering.review") ? <OfficeShopReviewPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/ordering/review/:requestId"
                element={pageAccess.canAccess("restaurant.ordering.review") ? <OfficeShopReviewPage /> : <SettingsAccessDenied />}
              />
              <Route
                path="/restaurant/ordering/inventory/*"
                element={<LegacyRestaurantInventoryRecordsRedirect />}
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
                path="/kitchen/inventory"
                element={
                  pageAccess.canAccess("kitchen.inventory") ? (
                    <MaterialInventoryPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/kitchen/inventory-records/*"
                element={pageAccess.canAccess("workspace.factory.warehouse") ? <KitchenInventoryRecordsWorkspace /> : <SettingsAccessDenied />}
              />
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
                    <ReportAiWorkspace
                      reportKey="kitchenSalesCost"
                      permissionKey="kitchen.cost_input"
                      reportTitle={t("reports.ai.reportTitles.kitchenSalesCost")}
                    >
                      <KitchenSalesCostReportPage />
                    </ReportAiWorkspace>
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/product-sales"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <ReportAiWorkspace
                      reportKey="kitchenProductSales"
                      permissionKey="kitchen.cost_input"
                      reportTitle={t("reports.ai.reportTitles.kitchenProductSales")}
                    >
                      <KitchenProductSalesReportPage />
                    </ReportAiWorkspace>
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/channel-sales"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <ReportAiWorkspace
                      reportKey="kitchenChannelSales"
                      permissionKey="kitchen.cost_input"
                      reportTitle={t("reports.ai.reportTitles.kitchenChannelSales")}
                    >
                      <KitchenChannelSalesReportPage />
                    </ReportAiWorkspace>
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/advertising-performance"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <ReportAiWorkspace
                      reportKey="kitchenAdvertisingPerformance"
                      permissionKey="kitchen.cost_input"
                      reportTitle={t("reports.ai.reportTitles.kitchenAdvertisingPerformance")}
                    >
                      <KitchenAdvertisingPerformanceReportPage />
                    </ReportAiWorkspace>
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/reports/kitchen/festival-orders"
                element={
                  pageAccess.canAccess("kitchen.cost_input") ? (
                    <ReportAiWorkspace
                      reportKey="festivalOrderGeneration"
                      permissionKey="kitchen.cost_input"
                      reportTitle={t("reports.ai.reportTitles.festivalOrderGeneration")}
                    >
                      <FestivalOrderGenerationReportPage />
                    </ReportAiWorkspace>
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
                path="/reports/frozen-meat/*"
                element={<ReportsPage group="frozenMeat" />}
              />
              <Route
                path="/reports/shops/*"
                element={<ReportsPage group="shops" />}
              />
              <Route
                path="/reports/*"
                element={<Navigate to={firstReportsPath} replace />}
              />
              <Route
                path="/settings"
                element={<Navigate to={firstSettingsHref} replace />}
              />
              <Route
                path="/promotion"
                element={<Navigate to={secondaryNav.promotion.find((item) => pageAccess.canAccess(item.permissionKey ?? pageAccessKey(item.to)))?.to ?? "/settings/wati-email-logs"} replace />}
              />
              <Route
                path="/settings/employees"
                element={
                  pageAccess.canAccess("settings.employees") ? (
                    <CompanyEmployeesPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
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
                path="/settings/wati-email-logs"
                element={
                  pageAccess.canAccess("settings.wati_email_logs") ? (
                    <WatiEmailSendLogsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/order-lists"
                element={<Navigate to="/orders/settings/order-list-tips" replace />}
              />
              <Route
                path="/settings/notifications"
                element={
                  pageAccess.canAccess("settings.notifications") ? (
                    <NotificationSettingsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/dictionaries"
                element={
                  pageAccess.canAccess("settings.dictionaries") ? (
                    <DictionariesPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/districts"
                element={
                  pageAccess.canAccess("settings.districts") ? (
                    <DeliveryDistrictsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/customer-faq"
                element={
                  pageAccess.canAccess("settings.customer_faq") ? (
                    <CustomerFaqPage />
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
              {visibleWorkspaceLinks.length > 0 ? (
                <div className="mobile-nav-group">
                  <p className="mobile-nav-group-label">
                    {t("workspace.label")}
                  </p>
                  {visibleWorkspaceLinks.map(({ key, to, icon: WorkspaceIcon, disabled }) =>
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
              ) : null}
              {mobileNavGroups.map((group) => (
                <div className="mobile-nav-group" key={group.groupKey}>
                  <p className="mobile-nav-group-label">
                    {navLabel(group.groupKey)}
                  </p>
                  {isBusinessMenu
                    ? group.items.map((item) =>
                        renderSidebarItem(item, 0, `mobile/${group.groupKey}`, {
                          nestGroups: true,
                        }),
                      )
                    : group.items.map(({ key, to, icon: NavIcon }) => (
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
                          {navCount(key) !== undefined ? (
                            <span className="sidebar-link-count">{navCount(key)}</span>
                          ) : null}
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

function LegacyDashboard({
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

const BUSINESS_MENU_LABELS: Record<string, [string, string]> = {
  overview: ["主頁", "Home"],
  followUp: ["營運跟進", "Operations Follow-up"],
  catering: ["到會", "Catering"],
  frozen: ["凍肉", "Frozen Meat"],
  restaurant: ["餐廳", "Restaurant"],
  accountingFollowUp: ["會計跟進", "Accounting Follow-up"],
  cateringData: ["到會數據", "Catering Data"],
  restaurantData: ["餐廳數據", "Restaurant Data"],
  factoryData: ["工場數據", "Factory Data"],
  reports: ["報表", "Reports"],
  settings: ["系統設定", "System Settings"],
  promotion: ["推廣設定", "Promotion Settings"],
  orders: ["訂單", "Orders"],
  allQuotes: ["報價單", "Quotes"],
  cateringQuotes: ["所有報價", "All Quotes"],
  products: ["商品與套餐", "Products & Packages"],
  kitchen: ["中央廚房", "Central Kitchen"],
  delivery: ["配送與司機", "Delivery & Drivers"],
  reminders: ["提醒事項", "Reminders"],
  pendingEntry: ["待入單", "Pending Entry"],
  pendingQuote: ["待報價", "Pending Quote"],
  enquiryForms: ["Enquiry 表單", "Enquiry Forms"],
  pendingPayment: ["待收款", "Pending Payment"],
  pendingFactory: ["待傳送工場", "Pending Factory"],
  pendingDriver: ["待派司機", "Pending Driver"],
  customerOrderInquiries: ["WATI待處理", "Pending WATI"],
  pendingProductReview: ["待審新商品", "Products to Review"],
  packingStocktakes: ["包裝盤點記錄", "Packaging Stocktake Records"],
  ingredientStocktakes: ["食材盤點記錄", "Ingredient Stocktake Records"],
  kitchenMaterialUsage: ["食材包裝用量", "Ingredient & Packaging Usage"],
  operationsExpenseInput: ["營運費用輸入", "Operating Expense Input"],
  purchaseExpenseInput: ["採購費用輸入", "Purchase Expense Input"],
  driverDeliveryRecords: ["司機送貨記錄", "Driver Delivery Records"],
  deliveryList: ["司機送貨記錄", "Driver Delivery Records"],
  restaurantDailySales: ["每日銷售輸入", "Daily Sales Input"],
  restaurantDailyPurchases: ["每日採購輸入", "Daily Purchase Input"],
  restaurantMonthlyExpenses: ["每月費用輸入", "Monthly Expense Input"],
  restaurantStocktakes: ["每月存貨盤點", "Monthly Stocktake"],
  newProductSalesStats: ["新品銷量統計", "New Product Sales"],
  deliveryNotes: ["送貨單管理", "Delivery Note Management"],
  rawMeatReports: ["報表", "Reports"],
  kitchenSalesCost: ["所有銷售及成本", "All Sales and Costs"],
  kitchenChannelSales: ["頻道銷售", "Channel Sales"],
  kitchenProductSales: ["產品銷售", "Product Sales"],
  kitchenAdvertisingPerformance: ["廣告表現", "Advertising Performance"],
  festivalOrderGeneration: ["節日訂單數量", "Festival Order Counts"],
  shopOrderQuantities: ["店舖訂貨數量", "Shop Order Quantities"],
  averageSupplyPrice: ["產品供店舖平均售價", "Average Shop Supply Price"],
  productionCostPrice: ["產品製作成本及工場用貨售價", "Production Cost and Factory Price"],
  rawMeatAveragePrice: ["生肉平均來貨價/KG", "Average Raw Meat Price/KG"],
  preparedMeatStock: ["製成品存貨", "Prepared Meat Stock"],
  rawMeatStock: ["生肉存貨", "Raw Meat Stock"],
  supplierPurchase: ["供應商入貨報表", "Supplier Purchases"],
  shopSales: ["銷售報告", "Sales Report"],
  shopSalesWorkingHours: ["銷售及工時報告", "Sales and Working Hours"],
  restaurantSalesSalary: ["銷售及薪金報告", "Sales and Salary"],
  restaurantSalesCost: ["銷售成本報告", "Sales Cost"],
  restaurantPnl: ["P&L 報告", "P&L Report"],
  newProducts: ["新品報告", "New Product Report"],
};

function businessMenuLabel(key: string, language: string, fallback: string) {
  const labels = BUSINESS_MENU_LABELS[key];
  if (!labels) return fallback;
  return language.toLowerCase().startsWith("zh") ? labels[0] : labels[1];
}

export function Dashboard({
  loadDashboard,
  role,
}: {
  loadDashboard?: HomeSalesDashboardLoader;
  role?: string | null;
}) {
  return <HomeSalesDashboardPage loadDashboard={loadDashboard} role={role} />;
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
  workspaceKey: "factory" | "delivery" | "customer" | "restaurant";
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
      <span className="auth-loading-mark" aria-hidden="true">
        <LoaderCircle />
      </span>
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
  workspaceKey: "factory" | "delivery" | "customer" | "restaurant";
  icon: Icon;
}) {
  return (
    <main className="workspace-standalone">
      <WorkspacePlaceholderPage workspaceKey={workspaceKey} icon={icon} />
    </main>
  );
}

function ProtectedWorkspace({
  permissionKey,
  fallbackPermissionKey,
  allowAnonymous = false,
  children,
}: {
  permissionKey: string;
  fallbackPermissionKey?: string;
  allowAnonymous?: boolean;
  children: ReactNode;
}) {
  const { session, profile, loading, profileLoading } = useAuth();
  const authorizationRole = profile?.role;
  const pageAccess = usePageAccess(authorizationRole);

  if (loading || (session && profileLoading)) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return allowAnonymous ? children : <LoginPage />;
  }

  if (pageAccess.loading) return <AuthLoadingScreen />;
  const effectivePermissionKey =
    fallbackPermissionKey && !pageAccess.hasPermission(permissionKey)
      ? fallbackPermissionKey
      : permissionKey;
  if (!pageAccess.canAccess(effectivePermissionKey)) {
    return (
      <main className="workspace-standalone">
        <SettingsAccessDenied />
      </main>
    );
  }

  return children;
}

function FactoryWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.factory.board"
      fallbackPermissionKey="workspace.factory"
    >
      <FactoryBoardPage />
    </ProtectedWorkspace>
  );
}

function RestaurantFloorWorkspace() {
  const { session, profile, loading, profileLoading } = useAuth();
  const pageAccess = usePageAccess(profile?.role);
  const lockedRestaurantId = profile?.shop_restro_id ?? TKO_RESTAURANT_ID;
  if (loading || (session && profileLoading)) return <AuthLoadingScreen />;
  if (!session) return <RestaurantWorkspaceLoginPage />;
  if (pageAccess.loading) return <AuthLoadingScreen />;
  return (
    <ProtectedWorkspace
      permissionKey="workspace.restaurant.shop_order"
      fallbackPermissionKey="workspace.restaurant"
    >
      <Routes>
        <Route element={<RestaurantWorkspacePage />}>
          <Route index element={<RestaurantWorkspaceHomePage />} />
          <Route path="shop-order" element={<ShopOrderPage />} />
          <Route path="shop-order/:requestId" element={<ShopOrderPage />} />
          <Route path="records" element={<ShopOrderRecordsPage />} />
          <Route path="hr" element={<RestaurantHrPlaceholderPage />} />
          <Route
            path="receive"
            element={pageAccess.canAccess("workspace.restaurant.receive") ? <ShopReceivePage /> : <SettingsAccessDenied />}
          />
          <Route
            path="daily-sales"
            element={pageAccess.canAccess("restaurant.daily_sales") ? <RestaurantDailySalesPage lockedRestaurantId={lockedRestaurantId} /> : <SettingsAccessDenied />}
          />
          <Route
            path="daily-purchases"
            element={pageAccess.canAccess("restaurant.daily_purchases") ? <RestaurantDailyPurchasesPage lockedRestaurantId={lockedRestaurantId} /> : <SettingsAccessDenied />}
          />
          <Route
            path="inventory"
            element={pageAccess.canAccess("restaurant.inventory") ? <RestaurantStocktakesPage lockedRestaurantId={lockedRestaurantId} /> : <SettingsAccessDenied />}
          />
          <Route
            path="monthly-expenses"
            element={pageAccess.canAccess("restaurant.monthly_expenses") ? <RestaurantMonthlyExpensesPage lockedRestaurantId={lockedRestaurantId} /> : <SettingsAccessDenied />}
          />
        </Route>
      </Routes>
    </ProtectedWorkspace>
  );
}

function FactoryOrderWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.factory.order"
      fallbackPermissionKey="workspace.factory"
    >
      <FactoryOrderPage />
    </ProtectedWorkspace>
  );
}

function FactoryMeatDeliveryNoteWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.factory.meat_delivery_note"
      fallbackPermissionKey="workspace.factory"
    >
      <FactoryMeatDeliveryNotePage />
    </ProtectedWorkspace>
  );
}

function FactoryMultiDayWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.factory.multi_day_menu"
      fallbackPermissionKey="workspace.factory"
    >
      <FactoryMultiDayReportPage />
    </ProtectedWorkspace>
  );
}

function FactoryProductionCalendarWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.factory.production_calendar"
      fallbackPermissionKey="workspace.factory"
    >
      <FactoryProductionCalendarPage />
    </ProtectedWorkspace>
  );
}

function KitchenInventoryRecordsWorkspace() {
  return (
    <Routes>
      <Route element={<FactoryWarehousePage />}>
        <Route index element={<FactoryWarehouseShipmentsPage />} />
        <Route path="shipments" element={<Navigate replace to="/kitchen/inventory-records" />} />
        <Route path="receipts" element={<FactoryWarehouseReceiptsPage />} />
      </Route>
    </Routes>
  );
}

function FactoryShopDeliveryNoteWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.factory.meat_delivery_note"
      fallbackPermissionKey="workspace.factory"
    >
      <FactoryShopDeliveryNotePage />
    </ProtectedWorkspace>
  );
}

function LegacyFactoryWarehouseRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/factory\/warehouse/, "");
  return <Navigate replace to={`/kitchen/inventory-records${suffix}${location.search}`} />;
}

function LegacyRestaurantInventoryRecordsRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/restaurant\/ordering\/inventory/, "");
  return <Navigate replace to={`/kitchen/inventory-records${suffix}${location.search}`} />;
}

function DriverDeliveryWorkspace() {
  const location = useLocation();
  return (
    <ProtectedWorkspace
      permissionKey={pageAccessKey(location.pathname)}
      fallbackPermissionKey="workspace.delivery"
      allowAnonymous
    >
      <DriverDeliveryPage />
    </ProtectedWorkspace>
  );
}

function CustomerWorkspace() {
  return (
    <ProtectedWorkspace
      permissionKey="workspace.customer.portal"
      fallbackPermissionKey="workspace.customer"
    >
      <WorkspaceStandalonePage workspaceKey="customer" icon={Users} />
    </ProtectedWorkspace>
  );
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
        path="/reset-password"
        element={
          <AuthProvider>
            <ResetPasswordPage />
          </AuthProvider>
        }
      />
      <Route
        path="/factory/multi-day-menu"
        element={
          <AuthProvider>
            <FactoryMultiDayWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/factory/meat-delivery-note/:meatOrderId"
        element={
          <AuthProvider>
            <FactoryMeatDeliveryNoteWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/factory/order/:deliveryId"
        element={
          <AuthProvider>
            <FactoryOrderWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/factory/production-calendar"
        element={
          <AuthProvider>
            <FactoryProductionCalendarWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/factory/warehouse/*"
        element={<LegacyFactoryWarehouseRedirect />}
      />
      <Route
        path="/factory/shop-delivery-note/:shopRequestId"
        element={
          <AuthProvider>
            <FactoryShopDeliveryNoteWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/factory"
        element={
          <AuthProvider>
            <FactoryWorkspace />
          </AuthProvider>
        }
      />
      <Route
        path="/restaurant-workspace/*"
        element={
          <AuthProvider>
            <RestaurantFloorWorkspace />
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
      <Route path="/quote-inquiry" element={<PublicEnquiryFormPage />} />
      <Route path="/quote-inquiry/:formId" element={<PublicEnquiryFormPage />} />
      <Route path="/self_service_search" element={<CustomerSelfServicePage />} />
      <Route path="/self_service_search/:orderId" element={<CustomerSelfServicePage />} />
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
