import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleAlert, LoaderCircle, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import { CustomerPortalGuideLinks } from "@/components/customer-portal/CustomerPortalGuideLinks";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type CustomerPortalNavItem = {
  key: string;
  to?: string;
  href?: string;
  end?: boolean;
  icon: IconComponent;
  label: string;
};

function CustomerPortalDrawer({
  open,
  title,
  mode,
  navItems,
  canSwitch,
  personal,
  organizations = [],
  activeOrganizationId,
  onSelectOrganization,
  loggingOut,
  onClose,
  onLogout,
}: {
  open: boolean;
  title: string;
  mode: "personal" | "organization";
  navItems: CustomerPortalNavItem[];
  canSwitch: boolean;
  personal: boolean;
  organizations?: Array<{ id: string; name: string }>;
  activeOrganizationId?: string;
  onSelectOrganization?: (organizationId: string) => void;
  loggingOut?: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return (
    <div className={`driver-drawer-layer${open ? " is-open" : ""}`} aria-hidden={!open}>
      <button type="button" className="driver-drawer-scrim" aria-label={t("portal.closeMenu")} onClick={onClose} />
      <aside className="driver-drawer customer-portal-drawer" aria-label={t("portal.navigation")}>
        <header>
          <strong>{title}</strong>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("portal.closeMenu")}><X /></Button>
        </header>
        {canSwitch ? (
          <nav className="customer-portal-drawer-modes" aria-label={t("portal.customerMode")}>
            <Link to="/customer?mode=personal" aria-current={personal ? "page" : undefined} onClick={onClose}>{t("portal.personalCustomer")}</Link>
            <Link to="/customer" aria-current={!personal ? "page" : undefined} onClick={onClose}>{t("portal.organizationCustomer")}</Link>
          </nav>
        ) : (
          <p className="customer-portal-drawer-mode-label">{t(mode === "personal" ? "portal.personalCustomer" : "portal.organizationCustomer")}</p>
        )}
        {organizations.length > 1 && !personal ? (
          <label>
            {t("portal.switchOrganization")}
            <select aria-label={t("portal.switchOrganization")} value={activeOrganizationId ?? organizations[0]?.id ?? ""} onChange={event => onSelectOrganization?.(event.target.value)}>
              {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        ) : null}
        {personal && !canSwitch ? (
          <nav aria-label={t("portalApply.title")}>
            <Link to="/customer/apply" onClick={onClose}>{t("portalApply.title")}</Link>
          </nav>
        ) : null}
        {navItems.length > 0 ? (
          <nav>
            {navItems.map(item => {
              const Icon = item.icon;
              if (item.href) {
                return (
                  <a key={item.key} className="driver-nav-primary" href={item.href} target="_blank" rel="noreferrer" onClick={onClose}>
                    <Icon />
                    {item.label}
                  </a>
                );
              }
              return (
                <NavLink
                  key={item.key}
                  to={item.to || "/customer"}
                  end={item.end}
                  className={({ isActive }) => `driver-nav-primary${isActive ? " is-active" : ""}`}
                  onClick={onClose}
                >
                  <Icon />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        ) : null}
        <CustomerPortalGuideLinks base={personal ? "/customer/personal" : "/customer"} onNavigate={onClose} />
        <footer>
          <button type="button" disabled={loggingOut} onClick={() => { onClose(); onLogout(); }}>
            <LogOut />
            {t("portal.logout")}
          </button>
        </footer>
      </aside>
    </div>
  );
}

export function CustomerWorkspaceHeader({
  title,
  desktopTitle,
  mode = "organization",
  navItems = [],
  canSwitch = false,
  personal = mode === "personal",
  organizations = [],
  activeOrganizationId,
  onSelectOrganization,
  loggingOut,
  onLogout,
}: {
  title?: string;
  desktopTitle?: string;
  mode?: "personal" | "organization";
  navItems?: CustomerPortalNavItem[];
  canSwitch?: boolean;
  personal?: boolean;
  organizations?: Array<{ id: string; name: string }>;
  activeOrganizationId?: string;
  onSelectOrganization?: (organizationId: string) => void;
  loggingOut?: boolean;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const heading = title || t("portal.title");
  return (
    <>
      <header className="portal-workspace-header">
        <div className="portal-workspace-top">
          <Button variant="ghost" size="icon" className="portal-menu-trigger" onClick={() => setOpen(true)} aria-label={t("portal.openMenu")}>
            <Menu />
          </Button>
          <Link to="/customer" className="portal-brand-link" aria-label="Food Channels Catering">
            <img src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="Food Channels Catering" />
          </Link>
          <div className="portal-workspace-title">
            <strong>{heading}</strong>
            {desktopTitle && <strong className="portal-workspace-desktop-title">{desktopTitle}</strong>}
            {organizations.length > 1 && !personal ? (
              <select aria-label={t("portal.switchOrganization")} value={activeOrganizationId ?? organizations[0]?.id ?? ""} onChange={event => onSelectOrganization?.(event.target.value)}>
                {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            ) : null}
          </div>
        </div>
      </header>
      <CustomerPortalDrawer
        open={open}
        title={heading}
        mode={mode}
        navItems={navItems}
        canSwitch={canSwitch}
        personal={personal}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        onSelectOrganization={onSelectOrganization}
        loggingOut={loggingOut}
        onClose={() => setOpen(false)}
        onLogout={onLogout}
      />
    </>
  );
}

export function CustomerPortalAccessState({ error, busy, onRetry }: { error: string; busy: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return <section className="portal-access-state">
    <div className="portal-state-icon" aria-hidden="true">{error?<CircleAlert/>:<LoaderCircle className="animate-spin"/>}</div>
    <h1>{t(error?"portal.loadFailedTitle":"portal.loading")}</h1>
    {error?<><p role="alert">{error}</p><Button disabled={busy} onClick={onRetry}>{busy?t("portal.loading"):t("portal.retry")}</Button></>:<p role="status">{t("portal.loadingDetails")}</p>}
  </section>;
}
