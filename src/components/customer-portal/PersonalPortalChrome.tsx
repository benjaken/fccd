import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, ClipboardList, Gift, Home, LogOut, MapPin, Menu, ShoppingCart, Upload, UserRound, UtensilsCrossed, X } from "lucide-react";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
type NavItem = { key: string; to: string; end?: boolean; icon: IconComponent; tab?: boolean };

const base = "/customer/personal";
export const personalNavigation: NavItem[] = [
  { key: "home", to: base, end: true, icon: Home, tab: true },
  { key: "menus", to: `${base}/menus`, icon: UtensilsCrossed, tab: true },
  { key: "instant", to: `${base}/menus`, icon: ShoppingCart, tab: true },
  { key: "evidence", to: `${base}/payments`, icon: Upload },
  { key: "orders", to: `${base}/orders`, icon: ClipboardList, tab: true },
  { key: "points", to: `${base}/points`, icon: Gift },
  { key: "addresses", to: `${base}/addresses`, icon: MapPin },
  { key: "profile", to: `${base}/profile`, icon: UserRound, tab: true },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return <>
    {personalNavigation.map(item => {
      const Icon = item.icon;
      if (item.key === "instant") {
        return <Link key={item.key} to={item.to} className="personal-nav-link" onClick={onNavigate}><Icon size={18} />{t(`personal.${item.key}`)}</Link>;
      }
      return <NavLink key={item.key} to={item.to} end={item.end} className={({ isActive }) => `personal-nav-link${isActive ? " is-active" : ""}`} onClick={onNavigate}><Icon size={18} />{t(`personal.${item.key}`)}</NavLink>;
    })}
  </>;
}

export function PersonalPortalChrome({
  accountName, canSwitch = false, loggingOut, onLogout, children,
}: {
  accountName?: string;
  canSwitch?: boolean;
  loggingOut?: boolean;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const name = accountName?.trim() || t("personal.accountMenu");
  const initial = name.slice(0, 1);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);
  return <div className="personal-app">
    <header className="personal-topbar">
      <button type="button" className="personal-menu-trigger" aria-label={t("portal.openMenu")} onClick={() => setMenuOpen(true)}><Menu size={22} /></button>
      <Link to={base} className="personal-brand" aria-label="Food Channels Catering">
        <img src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="Food Channels Catering" />
      </Link>
      <div className="personal-top-actions">
        <button type="button" className="personal-icon-button" aria-expanded={alertsOpen} aria-controls="personal-alerts" onClick={() => setAlertsOpen(open => !open)}><Bell size={18} /><span className="personal-sr">{t("personal.alerts")}</span></button>
        {alertsOpen && <p id="personal-alerts" className="personal-alerts" role="status">{t("personal.noAlerts")}</p>}
        <Link to={`${base}/profile`} className="personal-account">
          <span className="personal-avatar" aria-hidden="true">{initial}</span>
          <span className="personal-account-name">{name}</span>
        </Link>
      </div>
    </header>
    <nav className="personal-side-nav" aria-label={t("portal.navigation")}>
      <NavItems />
      {canSwitch ? <div className="personal-mode-switch" role="navigation" aria-label={t("portal.customerMode")}>
        <Link to="/customer?mode=personal">{t("portal.personalCustomer")}</Link>
        <Link to="/customer">{t("portal.organizationCustomer")}</Link>
      </div> : null}
    </nav>
    <div className="personal-side-foot">
      <button type="button" disabled={loggingOut} onClick={onLogout}><LogOut size={18} />{t("portal.logout")}</button>
    </div>
    <div className="personal-main">{children}</div>
    <nav className="personal-tabbar" aria-label={t("portal.navigation")}>
      {personalNavigation.filter(item => item.tab).map(item => {
        const Icon = item.icon;
        if (item.key === "instant") return <Link key={item.key} to={item.to}><Icon size={18} /><span>{t("personal.instantShort")}</span></Link>;
        return <NavLink key={item.key} to={item.to} end={item.end} className={({ isActive }) => isActive ? "is-active" : undefined}><Icon size={18} /><span>{t(`personal.${item.key}`)}</span></NavLink>;
      })}
    </nav>
    <div className={`personal-drawer${menuOpen ? " is-open" : ""}`} aria-hidden={!menuOpen}>
      <button type="button" className="personal-drawer-scrim" aria-label={t("portal.closeMenu")} onClick={() => setMenuOpen(false)} />
      <aside aria-label={t("portal.navigation")}>
        <header>
          <strong>{t("portal.title")}</strong>
          <button type="button" aria-label={t("portal.closeMenu")} onClick={() => setMenuOpen(false)}><X size={20} /></button>
        </header>
        <NavItems onNavigate={() => setMenuOpen(false)} />
        {canSwitch ? <div className="personal-mode-switch" role="navigation" aria-label={t("portal.customerMode")}>
          <Link to="/customer?mode=personal" onClick={() => setMenuOpen(false)}>{t("portal.personalCustomer")}</Link>
          <Link to="/customer" onClick={() => setMenuOpen(false)}>{t("portal.organizationCustomer")}</Link>
        </div> : null}
        <button type="button" disabled={loggingOut} onClick={() => { setMenuOpen(false); onLogout(); }}><LogOut size={18} />{t("portal.logout")}</button>
      </aside>
    </div>
  </div>;
}
