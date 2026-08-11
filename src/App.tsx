import { useEffect, useMemo, useState, type ComponentType } from "react";
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
  DatabaseZap,
  FileText,
  HandCoins,
  LayoutDashboard,
  Menu,
  Moon,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShoppingBasket,
  Store,
  Sun,
  Truck,
  Users,
  Utensils,
  Warehouse,
  X,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { DataMigrationPage } from "@/components/DataMigrationPage";
import { LoginPage } from "@/components/LoginPage";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  key: string;
  to: string;
  icon: Icon;
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
  { key: "migration", to: "/migration", icon: DatabaseZap },
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
    { key: "quotes", to: "/quotes", icon: FileText },
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
  migration: [
    { key: "migration", to: "/migration", icon: DatabaseZap },
    { key: "overview", to: "/", icon: LayoutDashboard },
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

function OperationsShell() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { dark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const section = sectionFromPath(location.pathname);
  const sideItems = secondaryNav[section] ?? secondaryNav.overview;
  const activeWorkspace =
    section === "delivery"
      ? "delivery"
      : section === "restaurant"
        ? "restaurant"
        : "catering";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

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
          <button
            className="user-menu"
            type="button"
            onClick={() => void signOut()}
            title={t("common.signOut")}
          >
            <span className="avatar">
              {(user?.email?.slice(0, 2) || "FC").toUpperCase()}
            </span>
            <span className="user-copy">
              <strong>
                {user?.email?.split("@")[0] || "Food Channel Catering"}
              </strong>
              <small>{t("user.role")}</small>
            </span>
            <ChevronDown />
          </button>
        </div>
      </header>

      <div className="workspace-bar">
        <div className="nav-row-spacer" aria-hidden="true" />
        <nav className="primary-nav lowered-nav" aria-label="Primary">
          {primaryNav.map(({ key, to, icon: NavIcon }) => (
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
        <div className="workspace-context">
          <span className="status-pulse" />
          <span>{t("common.today")}</span>
          <strong>
            {new Intl.DateTimeFormat(i18n.language, {
              month: "short",
              day: "numeric",
              weekday: "short",
              timeZone: "Asia/Hong_Kong",
            }).format(new Date())}
          </strong>
        </div>
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
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/migration" element={<DataMigrationPage />} />
              <Route path="*" element={<ModulePlaceholder section={section} />} />
            </Routes>
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
              {primaryNav.map(({ key, to, icon: NavIcon }) => (
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
}: {
  label: string;
  value: string;
  detail: string;
  icon: Icon;
  tone: "red" | "blue" | "green" | "amber";
}) {
  return (
    <article className="metric-card">
      <div className={cn("metric-icon", tone)}>
        <MetricIcon />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function Dashboard() {
  const { t, i18n } = useTranslation();
  const currency = new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  });

  const queues = [
    { label: t("dashboard.highChanceQuotes"), count: 8, tone: "red" },
    { label: t("dashboard.largeQuotes"), count: 3, tone: "amber" },
    { label: t("dashboard.unpaidOrders"), count: 12, tone: "blue" },
    { label: t("dashboard.unassignedDrivers"), count: 5, tone: "purple" },
    { label: t("dashboard.deliveredUnpaid"), count: 4, tone: "green" },
  ];

  const progress = [
    { label: t("dashboard.confirmed"), count: 18, width: "82%" },
    { label: t("dashboard.preparing"), count: 12, width: "64%" },
    { label: t("dashboard.ready"), count: 7, width: "43%" },
    { label: t("dashboard.shipping"), count: 5, width: "31%" },
    { label: t("dashboard.completed"), count: 9, width: "52%" },
  ];

  const jobs = [
    {
      no: "FC-260811-018",
      customer: "One Harbour Square",
      time: "11:30",
      status: t("dashboard.preparingStatus"),
      amount: currency.format(12680),
      tone: "amber",
    },
    {
      no: "FC-260811-021",
      customer: "香港科技園",
      time: "12:15",
      status: t("dashboard.readyStatus"),
      amount: currency.format(8960),
      tone: "green",
    },
    {
      no: "FC-260811-024",
      customer: "Central Plaza",
      time: "13:00",
      status: t("dashboard.driverStatus"),
      amount: currency.format(15420),
      tone: "red",
    },
  ];

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">{t("dashboard.eyebrow")}</span>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.description")}</p>
        </div>
        <div className="heading-actions">
          <Button variant="outline">
            <FileText />
            {t("dashboard.export")}
          </Button>
          <Button>
            <span className="plus">+</span>
            {t("dashboard.newOrder")}
          </Button>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label={t("dashboard.ordersToday")}
          value={`42 ${t("dashboard.orderUnit")}`}
          detail={`+12% ${t("dashboard.versusYesterday")}`}
          icon={ClipboardList}
          tone="red"
        />
        <MetricCard
          label={t("dashboard.revenueToday")}
          value={currency.format(128450)}
          detail={`+8.6% ${t("dashboard.versusYesterday")}`}
          icon={CircleDollarSign}
          tone="green"
        />
        <MetricCard
          label={t("dashboard.deliveries")}
          value={`9 ${t("dashboard.orderUnit")}`}
          detail={`5 ${t("common.pending")}`}
          icon={Truck}
          tone="blue"
        />
        <MetricCard
          label={t("dashboard.lowStock")}
          value={`16 ${t("dashboard.itemUnit")}`}
          detail={t("dashboard.urgent")}
          icon={Boxes}
          tone="amber"
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
              <button key={item.label} type="button" className="queue-item">
                <span className={cn("queue-dot", item.tone)} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <ChevronRight />
              </button>
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
              <div className="progress-row" key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: item.width }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="panel jobs-panel">
        <PanelHeader
          title={t("dashboard.productionTitle")}
          description={t("dashboard.productionDescription")}
          action={t("common.viewAll")}
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
              {jobs.map((job) => (
                <tr key={job.no}>
                  <td>
                    <strong>{job.no}</strong>
                  </td>
                  <td>{job.customer}</td>
                  <td>{job.time}</td>
                  <td>
                    <span className={cn("status-badge", job.tone)}>
                      {job.status}
                    </span>
                  </td>
                  <td>{job.amount}</td>
                  <td>
                    <Button variant="ghost" size="icon">
                      <ChevronRight />
                    </Button>
                  </td>
                </tr>
              ))}
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
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <header className="panel-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && (
        <Button variant="ghost">
          {action}
          <ChevronRight />
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
  const { session, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
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

function PublicMigrationPage() {
  return (
    <main className="public-migration-shell">
      <DataMigrationPage />
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/migration" element={<PublicMigrationPage />} />
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
