import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardList, Clock, Globe, Star, UtensilsCrossed } from "lucide-react";
import { cutoffDuration, portalPermissions } from "@/lib/customer-portal";
import { fetchVipSummary, type VipCycleSummary } from "@/lib/customer-lunchbox";
import { useNow } from "@/lib/use-countdown";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

const money = (value: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(value);

export function CustomerHomePage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t } = portal;
  const data = portal.data;
  const now = useNow(1000);
  const canOrder = data ? portalPermissions(data).ordering : false;
  const [vip, setVip] = useState<VipCycleSummary | null>(null);
  useEffect(() => {
    if (!canOrder) { setVip(null); return; }
    let active = true;
    void fetchVipSummary().then(summary => { if (active) setVip(summary?.cycle_id ? summary : null); }).catch(() => { if (active) setVip(null); });
    return () => { active = false; };
  }, [canOrder]);
  if (!data) return null;
  const permissions = portalPermissions(data);
  const next = data.orders[0];
  return <div className="personal-home">
    <section className="personal-hero">
      <div className="personal-hero-copy">
        <span>{data.organization.name}</span>
        <h1>{t("portal.headline")}</h1>
        <p>{t("portal.homeDescription")}</p>
        <Link className="personal-pill" to="/customer/vip">{t("portal.orderNow")}<ChevronRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="personal-hero-art" aria-hidden="true">
        <svg className="personal-hero-rays" viewBox="0 0 60 52" fill="none"><path d="M8 32 22 38M22 13 32 26M43 5 47 21" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
        <img className="personal-hero-bowl" src="/assets/customer-personal/hero-bowl-clean.png" alt="" />
      </div>
    </section>
    <nav className="personal-quick" aria-label={t("portal.home")}>
      <Link className="personal-quick-card" to="/customer/menus"><span className="personal-quick-icon"><Globe size={22} /></span><span>{t("portal.siteNav.cateringSite")}<ChevronRight size={14} aria-hidden="true" /></span></Link>
      {canOrder ? <Link className="personal-quick-card" to="/customer/vip"><span className="personal-quick-icon"><UtensilsCrossed size={22} /></span><span>{t("portal.vip")}<ChevronRight size={14} aria-hidden="true" /></span></Link> : null}
      {permissions.orders ? <Link className="personal-quick-card" to="/customer/orders"><span className="personal-quick-icon"><ClipboardList size={22} /></span><span>{t("portal.orders")}<ChevronRight size={14} aria-hidden="true" /></span></Link> : null}
      {permissions.points ? <Link className="personal-quick-card" to="/customer/points"><span className="personal-quick-icon"><Star size={22} /></span><span>{t("portal.points")}<ChevronRight size={14} aria-hidden="true" /></span></Link> : null}
    </nav>
    <div className={`personal-status${next ? " has-delivery" : ""}`}>
      <section className={`personal-next-card${next ? " has-delivery" : ""}`}>
        <div className="personal-status-copy">
          <h2><span className="personal-status-icon"><CalendarDays size={16} /></span>{t("portal.orders")}</h2>
          {next ? <div className="personal-delivery-summary"><strong>{next.number}<span> · {next.brand}</span></strong></div> : <p>{t("portal.noOrders")}</p>}
          <Link className="personal-pill is-ghost" to={next ? `/customer/orders/${encodeURIComponent(next.id)}` : "/customer/vip"}>{t(next ? "portal.details" : "portal.orderNow")}<ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <img src={next ? "/assets/customer-personal/delivery-bag-truck.png" : "/assets/empty-box.svg"} alt="" />
      </section>
      <section className="personal-points-card">
        <div className="personal-status-copy">
          <h2><span className="personal-status-icon is-star"><Star size={16} /></span>{t("portal.balanceLabel")}</h2>
          <strong>{data.balance.toLocaleString()} {t("portal.pointUnit")}</strong>
          <Link className="personal-pill is-ghost" to="/customer/points">{t("portal.points")}<ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <img src="/assets/customer-personal/points-coins-v2.png" alt="" />
      </section>
    </div>
    {vip ? <section className="personal-panel">
      <div className="personal-section-heading"><h2><CalendarDays size={18} aria-hidden="true" />{t("portal.vipSummaryTitle")}</h2><Link to="/customer/vip">{t("portal.details")}<ChevronRight size={16} aria-hidden="true" /></Link></div>
      <div className="personal-vip-cycle">
        <span className="personal-vip-name">{vip.cycle_name}</span>
        <span className="personal-vip-countdown" role="timer" aria-live="off">
          <Clock size={18} aria-hidden="true" />
          <span className="personal-vip-countdown-label">{t("portal.cutoffLabel")}</span>
          <span className="personal-vip-countdown-time">{cutoffDuration(vip.cutoff_at, now, t) || t("portal.cutoffPassed")}</span>
        </span>
      </div>
      {data.role === "admin" ? <dl className="personal-vip-stats">
        <div><dt>{t("portal.vipOrdered")}</dt><dd>{vip.ordered ?? 0}</dd></div>
        <div><dt>{t("portal.vipNotOrdered")}</dt><dd>{Math.max((vip.members ?? 0) - (vip.ordered ?? 0), 0)}</dd></div>
        {vip.amount != null ? <div><dt>{t("portal.vipAmount")}</dt><dd>{money(vip.amount)}</dd></div> : null}
      </dl> : <dl className="personal-vip-stats">
        <div><dt>{t("portal.vipMyStatus")}</dt><dd data-state={vip.me?.ordered ? "ordered" : "waiting"}>{t(vip.me?.ordered ? "portal.vipMyOrdered" : "portal.vipMyWaiting")}</dd></div>
        {vip.me?.amount != null ? <div><dt>{t("portal.vipMyAmount")}</dt><dd>{money(vip.me.amount)}</dd></div> : null}
      </dl>}
    </section> : null}
  </div>;
}
