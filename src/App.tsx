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
  Bell,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBasket,
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
import { AttachmentsListPage } from "@/components/settings/AttachmentsListPage";
import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import { SettingsAccessDenied } from "@/components/settings/SettingsAccessDenied";
import { UsersListPage } from "@/components/settings/UsersListPage";
import { Button } from "@/components/ui/button";
import {
  fetchDashboardData,
  type DashboardData,
  type DashboardJob,
} from "@/lib/dashboard";
import { useTheme } from "@/lib/use-theme";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  key: string;
  to: string;
  icon: Icon;
  permissionKey?: string;
};

const primaryNav: NavItem[] = [
  { key: "overview", to: "/", icon: LayoutDashboard },
  { key: "orders", to: "/orders", icon: ClipboardList },
  { key: "quotes", to: "/quotes", icon: FileText },
  { key: "products", to: "/products", icon: ShoppingBasket },
  { key: "kitchen", to: "/kitchen", icon: Utensils },
  { key: "delivery", to: "/delivery", icon: Truck },
  { key: "restaurant", to: "/restaurant", icon: Store },
  { key: "reports", to: "/reports", icon: ChartNoAxesCombined },
  {
    key: "settings",
    to: "/settings/users",
    icon: Settings,
    permissionKey: "settings.users",
  },
];

const secondaryNav: Record<string, NavItem[]> = {
  overview: [
    { key: "overview", to: "/", icon: LayoutDashboard },
    { key: "followUp", to: "/follow-up", icon: ClipboardCheck },
    { key: "orders", to: "/orders", icon: ClipboardList },
    { key: "quotes", to: "/quotes", icon: FileText },
    { key: "inventory", to: "/inventory", icon: Warehouse },
    { key: "delivery", to: "/delivery", icon: Truck },
  ],
  orders: [
    { key: "allOrders", to: "/orders", icon: ClipboardList },
    { key: "newOrder", to: "/orders/new", icon: FileText },
    { key: "pendingOrders", to: "/orders/pending", icon: ClipboardCheck },
    {
      key: "productionCalendar",
      to: "/orders/production",
      icon: CalendarDays,
    },
    { key: "payments", to: "/orders/payments", icon: HandCoins },
    { key: "assignDriver", to: "/orders/drivers", icon: Truck },
  ],
  quotes: [
    { key: "cateringQuotes", to: "/quotes", icon: FileText },
    { key: "customers", to: "/quotes/customers", icon: Users },
    { key: "followUp", to: "/quotes/follow-up", icon: ClipboardCheck },
  ],
  products: [
    { key: "products", to: "/products", icon: ShoppingBasket },
    { key: "inventory", to: "/inventory", icon: Boxes },
  ],
  kitchen: [
    { key: "kitchen", to: "/kitchen", icon: Utensils },
    { key: "productionCalendar", to: "/kitchen/calendar", icon: CalendarDays },
    { key: "inventory", to: "/kitchen/inventory", icon: Warehouse },
  ],
  delivery: [
    { key: "delivery", to: "/delivery", icon: Truck },
    { key: "assignDriver", to: "/delivery/assign", icon: PackageCheck },
  ],
  restaurant: [
    { key: "restaurant", to: "/restaurant", icon: Store },
    { key: "inventory", to: "/restaurant/inventory", icon: Warehouse },
    { key: "reports", to: "/restaurant/reports", icon: ChartNoAxesCombined },
  ],
  reports: [
    { key: "reports", to: "/reports", icon: ChartNoAxesCombined },
    { key: "finance", to: "/finance", icon: CircleDollarSign },
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
      key: "attachments",
      to: "/settings/attachments",
      icon: FileArchive,
      permissionKey: "settings.attachments",
    },
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
  const segment = pathname.split("/")[1];
  if (segment === "follow-up" || segment === "inventory") return "overview";
  if (segment === "finance") return "reports";
  return secondaryNav[segment] ? segment : "overview";
}

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
  const isSuperAdmin = pageAccess.isSuperAdmin;
  const currentPageKey = pageAccessKey(location.pathname);
  const visiblePrimaryNav = primaryNav.filter((item) =>
    pageAccess.canAccess(item.permissionKey ?? item.key),
  );
  const sideItems = (secondaryNav[section] ?? secondaryNav.overview).filter(
    (item) => pageAccess.canAccess(item.permissionKey ?? pageAccessKey(item.to)),
  );
  const activeWorkspace =
    section === "delivery"
      ? "delivery"
      : section === "restaurant"
        ? "restaurant"
        : "catering";
  const canViewFinance = ["Super Admin", "Admin", "Accounting"].includes(
    profile?.role ?? "",
  );

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
          <label className="search-box">
            <Search aria-hidden="true" />
            <span className="sr-only">{t("common.search")}</span>
            <input placeholder={t("common.search")} />
          </label>
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
                    "Food Channel Catering"}
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
                cn("primary-nav-link", isActive && "active")
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
            {sideItems.map(({ key, to, icon: NavIcon }) => (
              <NavLink
                key={`${key}-${to}`}
                to={to}
                end={to === "/" || to === `/${section}`}
                className={({ isActive }) =>
                  cn("sidebar-link", isActive && "active")
                }
                title={sidebarCollapsed ? t(`navigation.${key}`) : undefined}
              >
                <NavIcon />
                <span>{t(`navigation.${key}`)}</span>
                {!sidebarCollapsed && <ChevronRight className="link-chevron" />}
              </NavLink>
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
              <div className="profile-state" role="status">
                <RefreshCw className="spin" />
                <span>{t("settings.loadingPermissions")}</span>
              </div>
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
              <Route path="/reports/*" element={<ReportsPage />} />
              <Route
                path="/settings"
                element={<Navigate to="/settings/users" replace />}
              />
              <Route
                path="/settings/users"
                element={
                  isSuperAdmin ? <UsersListPage /> : <SettingsAccessDenied />
                }
              />
              <Route
                path="/settings/roles"
                element={
                  isSuperAdmin ? (
                    <RolePermissionsPage />
                  ) : (
                    <SettingsAccessDenied />
                  )
                }
              />
              <Route
                path="/settings/attachments"
                element={
                  isSuperAdmin ? (
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
            <nav>
              {visiblePrimaryNav.map(({ key, to, icon: NavIcon }) => (
                <NavLink
                  key={key}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    cn("sidebar-link", isActive && "active")
                  }
                >
                  <NavIcon />
                  <span>{t(`navigation.${key}`)}</span>
                </NavLink>
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
    return { label: labels.awaitingDriver, tone: "red" };
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
      tone: "red",
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
    },
    {
      label: t("dashboard.preparing"),
      count: data.progress.preparing,
      to: "/kitchen?status=preparing",
    },
    {
      label: t("dashboard.ready"),
      count: data.progress.ready,
      to: "/kitchen?status=ready",
    },
    {
      label: t("dashboard.shipping"),
      count: data.progress.shipping,
      to: "/delivery?status=shipping",
    },
    {
      label: t("dashboard.completed"),
      count: data.progress.completed,
      to: "/orders?status=completed",
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

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">{t("dashboard.eyebrow")}</span>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.description")}</p>
        </div>
        <div className="heading-actions">
          <Button
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "spin" : undefined} />
            {t("dashboard.refresh")}
          </Button>
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

      {loading && (
        <div className="dashboard-loading" role="status">
          <RefreshCw className="spin" />
          {t("dashboard.loading")}
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
          tone="red"
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
              <Link className="progress-row" key={item.label} to={item.to}>
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
        <div className="table-wrap">
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
        </div>
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
