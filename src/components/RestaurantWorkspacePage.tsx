import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  PackageCheck,
  Receipt,
  ShoppingBag,
  Store,
  UsersRound,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";

const LINKS = [
  { to: "/restaurant-workspace", key: "home", icon: Home, permission: "workspace.restaurant", end: true },
  { to: "/restaurant-workspace/daily-sales", key: "dailySales", icon: Store, permission: "restaurant.daily_sales" },
  { to: "/restaurant-workspace/shop-order", key: "shopOrder", icon: ShoppingBag, permission: "workspace.restaurant.shop_order" },
  { to: "/restaurant-workspace/records", key: "records", icon: ClipboardList, permission: "workspace.restaurant.records" },
  { to: "/restaurant-workspace/receive", key: "receive", icon: PackageCheck, permission: "workspace.restaurant.receive" },
  { to: "/restaurant-workspace/daily-purchases", key: "dailyPurchases", icon: Receipt, permission: "restaurant.daily_purchases" },
  { to: "/restaurant-workspace/inventory", key: "inventory", icon: ClipboardCheck, permission: "restaurant.inventory" },
  { to: "/restaurant-workspace/monthly-expenses", key: "monthlyExpenses", icon: CircleDollarSign, permission: "restaurant.monthly_expenses" },
  { to: "/restaurant-workspace/hr", key: "hr", icon: UsersRound, permission: "workspace.restaurant" },
] as const;

export function RestaurantWorkspaceLoginPage() {
  const { t } = useTranslation();
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError("");
    const result = await signIn(email.trim(), password);
    if (result) setError(t("shopOrdering.login.error"));
    setBusy(false);
  }

  return (
    <main className="restaurant-login-shell">
      <section className="restaurant-login-panel" aria-labelledby="restaurant-login-title">
        <div className="restaurant-login-mark" aria-hidden="true"><Store /></div>
        <p className="restaurant-login-eyebrow">Food Channels</p>
        <h1 id="restaurant-login-title">{t("shopOrdering.login.title")}</h1>
        <p className="restaurant-login-intro">{t("shopOrdering.login.description")}</p>
        <form className="restaurant-login-form" onSubmit={submit}>
          <label htmlFor="restaurant-login-email">{t("shopOrdering.login.email")}</label>
          <input
            id="restaurant-login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          <label htmlFor="restaurant-login-password">{t("shopOrdering.login.password")}</label>
          <input
            id="restaurant-login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {!configured ? <p className="driver-form-error">{t("auth.configuration")}</p> : null}
          {error ? <p className="driver-form-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={!configured || busy || !email.trim() || !password}>
            {busy ? t("shopOrdering.login.signingIn") : t("shopOrdering.login.signIn")}
          </Button>
        </form>
      </section>
    </main>
  );
}

export function RestaurantWorkspacePage() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const access = useCurrentPageAccess();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const visibleLinks = LINKS.filter((link) => access.canAccess(link.permission));
  const activeLink = [...visibleLinks]
    .reverse()
    .find((link) => "end" in link && link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));

  return (
    <main className="restaurant-workspace">
      <header className="restaurant-mobile-header">
        <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label={t("shopOrdering.openMenu")}>
          <Menu />
        </Button>
        <div>
          <span>{t("shopOrdering.workspaceTitle")}</span>
          <h1>{t(`shopOrdering.nav.${activeLink?.key ?? "home"}`)}</h1>
        </div>
        <span aria-hidden="true" />
      </header>

      <div className="restaurant-workspace-body"><Outlet /></div>

      <div className={`restaurant-drawer-layer${drawerOpen ? " is-open" : ""}`} aria-hidden={!drawerOpen}>
        <button className="restaurant-drawer-scrim" aria-label={t("shopOrdering.closeMenu")} onClick={() => setDrawerOpen(false)} />
        <aside className="restaurant-drawer" aria-label={t("workspace.restaurant")}>
          <header>
            <div><span>{t("workspace.restaurant")}</span><strong>{t("shopOrdering.workspaceTitle")}</strong></div>
            <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)} aria-label={t("shopOrdering.closeMenu")}><X /></Button>
          </header>
          <nav>
            {visibleLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink key={link.to} to={link.to} end={"end" in link && link.end === true} onClick={() => setDrawerOpen(false)}>
                  {({ isActive }) => <span className={isActive ? "is-active" : ""}><Icon />{t(`shopOrdering.nav.${link.key}`)}</span>}
                </NavLink>
              );
            })}
          </nav>
          <footer>
            <span>{profile?.email ?? ""}</span>
            <button onClick={() => void signOut()}><LogOut />{t("shopOrdering.logout")}</button>
          </footer>
        </aside>
      </div>
    </main>
  );
}

export function RestaurantWorkspaceHomePage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const features = LINKS.slice(1).filter((link) => access.canAccess(link.permission));

  return (
    <section className="restaurant-home-page">
      <header>
        <span>{t("shopOrdering.home.eyebrow")}</span>
        <h2>{t("shopOrdering.home.title")}</h2>
        <p>{t("shopOrdering.home.description")}</p>
      </header>
      <div className="restaurant-home-grid">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Link className={index === 0 ? "is-primary" : ""} key={feature.to} to={feature.to}>
              <span><Icon /></span>
              <div>
                <strong>{t(`shopOrdering.nav.${feature.key}`)}</strong>
                <small>{t(`shopOrdering.home.items.${feature.key}`)}</small>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function RestaurantHrPlaceholderPage() {
  const { t } = useTranslation();

  return (
    <section className="restaurant-hr-placeholder" aria-labelledby="restaurant-hr-title">
      <div className="restaurant-hr-placeholder-icon" aria-hidden="true"><UsersRound /></div>
      <span className="eyebrow">{t("shopOrdering.hr.eyebrow")}</span>
      <h1 id="restaurant-hr-title">{t("shopOrdering.hr.title")}</h1>
      <p>{t("shopOrdering.hr.description")}</p>
      <div className="restaurant-hr-preview" aria-label={t("shopOrdering.hr.plannedTitle")}>
        <strong>{t("shopOrdering.hr.plannedTitle")}</strong>
        <span>{t("shopOrdering.hr.plannedItems")}</span>
      </div>
    </section>
  );
}
