import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, ClipboardList, Leaf, ShoppingCart, Star, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CornerNotice } from "@/components/ui/corner-notice";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { CustomerSelfServicePage } from "@/components/CustomerSelfServicePage";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { personalNavigation, personalNavLabel } from "@/components/customer-portal/PersonalPortalChrome";
import { CustomerPersonalAddressesPage, CustomerPersonalEvidencePage, CustomerPersonalProfilePage } from "./CustomerPersonalSettingsPages";
import { PersonalLunchboxPage } from "@/components/customer-portal/PersonalLunchboxPage";
import { CustomerGuidePage } from "@/components/customer-portal/CustomerGuidePage";
import { AccountOrderFeedback } from "@/components/customer-portal/OrderFeedbackPage";
import { RewardCatalogList } from "@/components/customer-portal/RewardCatalogList";
import { getStorefrontLogoPath } from "@/lib/brand-logo";
import { fetchPersonalOtpSession, logoutPersonalOtpSession } from "@/lib/customer-otp-session";
import type { CustomerSelfServiceOrderSummary, CustomerSelfServiceSession } from "@/lib/customer-self-service";
import { fetchPersonalPoints, fetchPersonalSnapshot, fetchPersonalReorder, reorderPersonalQuote, shopifyCartUrl, shopifyStoreUrl, type PersonalPoints, type PersonalSnapshot } from "@/lib/customer-personal";
import { IssuedShopifyVouchers } from "@/components/customer-portal/IssuedShopifyVouchers";
import { redeemPersonalCatalog } from "@/lib/customer-reward-catalog";
import "@/lib/customer-personal-i18n";
import "@/lib/customer-portal-i18n";
import "./customer-personal.css";

type PersonalController = {
  data: PersonalSnapshot | null; session: CustomerSelfServiceSession; busy: boolean;
  refresh: () => Promise<void>; run: (action: () => Promise<void>, notice: string) => Promise<boolean>;
};
const PersonalContext = createContext<PersonalController | null>(null);
export function usePersonalWorkspace() {
  const value = useContext(PersonalContext);
  if (!value) throw new Error("personal_workspace_required");
  return value;
}
const base = "/customer/personal";
function date(value: string | null, language: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Hong_Kong" });
}
function money(amount: number, currency: string, language: string) {
  return new Intl.NumberFormat(language, { style: "currency", currency }).format(amount);
}

export function PersonalReorderButton({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  return <div className="personal-reorder">
    {!url && <Button type="button" variant="outline" disabled={loading} onClick={() => {
      setLoading(true); setError("");
      void reorderPersonalQuote(orderId, crypto.randomUUID()).then(() => setUrl("quote")).catch(quoteError => {
        const quoteMessage = quoteError && typeof quoteError === "object" && "message" in quoteError ? String(quoteError.message) : "";
        if (!quoteMessage.includes("not_portal_quote")) {
          setError(t("personal.reorderUnavailable"));
          return;
        }
        void fetchPersonalReorder(orderId).then(cart => setUrl(shopifyCartUrl(cart))).catch(err => {
          const message = err && typeof err === "object" && "message" in err ? String(err.message) : "";
          setError(t(message.includes("reorder_options_required") ? "personal.reorderOptions" : "personal.reorderUnavailable"));
        });
      }).finally(() => setLoading(false));
    }}>{t(loading ? "personal.loading" : "personal.reorder")}</Button>}
    {url === "quote" ? <p role="status">{t("personal.reorderQuoted")}</p> : null}
    {url && url !== "quote" && <div className="personal-reorder-confirm"><p>{t("personal.reorderIntro")}</p><div className="portal-actions">
      <Button asChild><a href={url}>{t("personal.confirmReorder")}<ArrowUpRight size={16} /></a></Button>
      <Button type="button" variant="ghost" onClick={() => setUrl("")}>{t("personal.cancel")}</Button>
    </div></div>}
    {error && <p role="alert" className="portal-error">{error} <Link to={`${base}/menus`}>{t("personal.menus")}</Link></p>}
  </div>;
}

function PersonalOrderRow({ order }: { order: CustomerSelfServiceOrderSummary }) {
  const { t, i18n } = useTranslation();
  const { data } = usePersonalWorkspace();
  const state = data?.order_states?.[order.id];
  return <article className="personal-order-row">
    <div className="personal-order-info"><Link to={`${base}/${encodeURIComponent(order.id)}`} className="personal-order-number">{order.orderNumber}</Link>
      <p><CalendarDays size={16} />{date(order.deliveryDate, i18n.language) || t("personal.unknownDate")}</p>
      <div className="personal-order-status"><span>{state ? t(state.paid ? "personal.paid" : "personal.unpaid") : t("personal.unknownStatus")}</span>{state?.delivery_status && <span>{state.delivery_status}</span>}</div>
    </div>
    <strong>{money(order.grandTotal, order.currency, i18n.language)}</strong>
    <div className="portal-actions"><Button variant="outline" asChild><Link to={`${base}/${encodeURIComponent(order.id)}`}>{t("personal.details")}</Link></Button><Button variant="outline" asChild><Link to={`${base}/feedback/${encodeURIComponent(order.id)}`}>{t("portalFeedback.title")}</Link></Button><PersonalReorderButton orderId={order.id} /></div>
  </article>;
}

function upcomingOrder(session: CustomerSelfServiceSession, data: PersonalSnapshot | null) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return [...session.orders].filter(order => {
    const state = data?.order_states?.[order.id]?.delivery_status;
    const delivery = order.deliveryDate ? new Date(order.deliveryDate) : null;
    const day = delivery && !Number.isNaN(delivery.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(delivery) : "";
    return day >= today && !state?.match(/取消|完成|已送達|cancel|complete|delivered/i);
  }).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""))[0];
}

function longDate(value: string | null, language: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  if (!language.toLowerCase().startsWith("zh")) return date(value, language);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(parsed);
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value || "");
  return `${pick("year")}年${pick("month")}月${pick("day")}日`;
}

function menuTone(name: string, domain: string) {
  const text = `${name} ${domain}`;
  if (/express|\bfce\b/i.test(text)) return "express";
  if (/lunch\s*box|lunchbox|hklunchbox|飯盒/i.test(text)) return "lunch-box";
  if (/party\s*food|partyfood|hkpartyfood/i.test(text)) return "party-food";
  if (/cuisine|福滿樓/i.test(text)) return "cuisine";
  if (/kitchen|中央廚房|\bfck\b/i.test(text)) return "kitchen";
  if (/catering|foodchannels-catering/i.test(text)) return "catering";
  return "";
}

function PersonalHomePage() {
  const { t, i18n } = useTranslation();
  const { session, data } = usePersonalWorkspace();
  const next = upcomingOrder(session, data);
  const recent = [...session.orders].sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "")).slice(0, 3);
  const [points, setPoints] = useState<PersonalPoints | null>(null);
  useEffect(() => { void fetchPersonalPoints().then(setPoints).catch(() => setPoints({ balance: 0, pending: 0, ledger: [] })); }, []);
  const shortcuts = [
    { to: `${base}/menus`, icon: BookOpen, label: t("personal.menus") },
    { to: `${base}/lunchbox`, icon: ShoppingCart, label: t("personal.instantShort") },
    { to: `${base}/payments`, icon: Upload, label: t("personal.evidenceUpload") },
    { to: `${base}/orders`, icon: ClipboardList, label: t("personal.ordersRecord") },
  ];
  const nextState = next ? data?.order_states?.[next.id] : undefined;
  return <div className="personal-home">
    <section className="personal-hero">
      <div className="personal-hero-copy">
        <h1>{t("personal.hello")}</h1>
        <p>{t("personal.helloIntro")}</p>
        <Link className="personal-pill" to={`${base}/lunchbox`}>{t("personal.orderNow")}<ChevronRight size={16} aria-hidden="true" /></Link>
      </div>
      <img className="personal-hero-bowl" src="/assets/customer-personal/hero-bowl.png" alt="" />
    </section>
    <nav className="personal-quick" aria-label={t("personal.home")}>
      {shortcuts.map(item => {
        const Icon = item.icon;
        return <Link key={item.to} to={item.to} className="personal-quick-card"><span className="personal-quick-icon"><Icon size={22} /></span><span>{item.label}<ChevronRight size={14} aria-hidden="true" /></span></Link>;
      })}
    </nav>
    <div className="personal-status">
      <section className="personal-next-card">
        <div className="personal-status-copy">
          <h2><span className="personal-status-icon"><CalendarDays size={16} /></span>{t("personal.nextStatus")}</h2>
          {next ? <>
            <span className={nextState?.paid ? "is-paid" : "is-unpaid"}>{t(nextState ? (nextState.paid ? "personal.paid" : "personal.unpaid") : "personal.unknownStatus")}</span>
            <Link to={`${base}/${encodeURIComponent(next.id)}`}>{next.orderNumber}</Link>
          </> : <p>{t("personal.noNextOrder")}</p>}
          <Link className="personal-pill is-ghost" to={`${base}/lunchbox`}>{t("personal.orderNow")}<ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <img src="/assets/customer-personal/order-box.png" alt="" />
      </section>
      <section className="personal-points-card">
        <div className="personal-status-copy">
          <h2><span className="personal-status-icon is-star"><Star size={16} /></span>{t("personal.balance")}</h2>
          <strong>{points ? `${points.balance.toLocaleString()} ${t("personal.pointUnit")}` : t("personal.loading")}</strong>
          <Link className="personal-pill is-ghost" to={`${base}/points`}>{t("personal.points")}<ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <img src="/assets/customer-personal/points-coins.png" alt="" />
      </section>
    </div>
    <section className="personal-panel">
      <div className="personal-section-heading"><h2><ClipboardList size={18} />{t("personal.recentOrders")}</h2><Link to={`${base}/orders`}>{t("personal.viewAll")}<ChevronRight size={16} aria-hidden="true" /></Link></div>
      {recent.length ? <div className="personal-recent-list">{recent.map(order => {
        const state = data?.order_states?.[order.id];
        const paid = Boolean(state?.paid);
        return <article key={order.id} className="personal-recent-row">
          <img src="/assets/customer-personal/order-thumb.png" alt="" />
          <div>
            <Link to={`${base}/${encodeURIComponent(order.id)}`}>{order.orderNumber}</Link>
            <p>{longDate(order.deliveryDate || order.orderDate, i18n.language) || t("personal.unknownDate")}</p>
          </div>
          <span className={paid ? "is-paid" : "is-unpaid"}>{state ? t(paid ? "personal.paid" : "personal.unpaid") : t("personal.unknownStatus")}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </article>;
      })}</div> : <p className="personal-empty">{t("personal.noOrders")}</p>}
    </section>
    <section className="personal-panel">
      <div className="personal-section-heading"><h2><Leaf size={18} />{t("personal.menus")}</h2><Link to={`${base}/menus`}>{t("personal.viewMore")}<ChevronRight size={16} aria-hidden="true" /></Link></div>
      {data?.stores.length ? <div className="personal-menu-scroller">{data.stores.slice(0, 8).map(item => {
        const logo = getStorefrontLogoPath(item.name, item.domain);
        const tone = menuTone(item.name, item.domain);
        return <a key={item.id} className="personal-menu-card" href={shopifyStoreUrl(item.domain)}>
          <span className="personal-home-logo">{logo ? <img src={logo} alt="" /> : <span aria-hidden="true">{item.name.slice(0, 1)}</span>}</span>
          <strong>{item.name}</strong>
          {tone ? <span>{t(`personal.menuBlurb.${tone}`)}</span> : null}
        </a>;
      })}</div> : <p className="personal-empty">{t("personal.noStores")}</p>}
    </section>
  </div>;
}

function PersonalMenusPage() {
  const { t } = useTranslation();
  const { data } = usePersonalWorkspace();
  return <section className="personal-menus">
    <h1>{t("personal.menus")}</h1>
    <p>{t("personal.menusIntro")}</p>
    {data?.stores.length ? <ul className="personal-menu-list">
      {data.stores.map(store => {
        const logo = getStorefrontLogoPath(store.name, store.domain);
        return <li key={store.id}>
          <a className="personal-menu-row" href={shopifyStoreUrl(store.domain)}>
            <span className="personal-menu-logo">
              {logo ? <img src={logo} alt="" /> : <span aria-hidden="true">{store.name.slice(0, 1)}</span>}
            </span>
            <span className="personal-menu-copy">
              <strong>{store.name}</strong>
              <span>{store.domain}</span>
            </span>
            <span className="personal-menu-cta">{t("personal.website")}<ChevronRight size={16} aria-hidden="true" /></span>
          </a>
        </li>;
      })}
    </ul> : <p className="personal-empty">{t("personal.noStores")}</p>}
    <p className="personal-menu-note">{t("personal.shopifyCheckout")}</p>
  </section>;
}

function PersonalOrdersPage() {
  const { t } = useTranslation();
  const { session } = usePersonalWorkspace();
  return <section><h1>{t("personal.orders")}</h1><p><Link to={`${base}/payments`}>{t("portal.siteNav.evidenceLink")}</Link></p>{session.orders.length ? session.orders.map(order => <PersonalOrderRow key={order.id} order={order} />) : <div className="personal-empty"><p>{t("personal.noOrders")}</p><p>{t("personal.orderHelp")}</p><Button asChild><Link to={`${base}/menus`}>{t("personal.orderNow")}</Link></Button></div>}</section>;
}

function PersonalOrderFeedbackPage() {
  const { t } = useTranslation();
  const { orderId = "" } = useParams();
  return <div><Link className="self-service-back" to={`${base}/orders`}><ArrowLeft aria-hidden="true" />{t("portalFeedback.backToOrders")}</Link><AccountOrderFeedback key={orderId} orderId={orderId} showEmptyState /></div>;
}

function PersonalPointsPage() {
  const { t } = useTranslation();
  const [points, setPoints] = useState<PersonalPoints | null>(null);
  useEffect(() => { void fetchPersonalPoints().then(setPoints).catch(() => setPoints({ balance: 0, pending: 0, ledger: [] })); }, []);
  return <section><h1>{t("personal.points")}</h1>
    <p>{t("personal.pointsIntro")}</p>
    <dl className="personal-points-facts"><div><dt>{t("personal.balance")}</dt><dd>{points ? `${points.balance.toLocaleString()} ${t("personal.pointUnit")}` : t("personal.loading")}</dd></div></dl>
    {points && Number(points.incoming) > 0 ? <p>{t("personal.incomingPoints", { count: points.incoming, date: points.incoming_at ? new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(points.incoming_at)) : "" })}</p> : null}
    {points && points.pending > 0 ? <p>{t("personal.pendingPoints", { count: points.pending })}</p> : null}
    <h2>{t("personal.ledger")}</h2>
    {points?.ledger.length ? points.ledger.map(entry => <div className="portal-row" key={entry.id}><span>{t(`personal.ledgerKind.${entry.kind}`, { defaultValue: entry.kind })}</span><strong>{entry.points > 0 ? "+" : ""}{entry.points}</strong></div>) : <p>{t("personal.noLedger")}</p>}
    <RewardCatalogList balance={points?.balance ?? 0} onRedeem={async item => { await redeemPersonalCatalog(crypto.randomUUID(), item.id); setPoints(await fetchPersonalPoints()); }} />
    <IssuedShopifyVouchers scope="personal" refreshKey={points?.balance} />
  </section>;
}

export function CustomerPersonalWorkspace({ canSwitch, loggingOut, onLogout }: { canSwitch: boolean; loggingOut: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [session, setSession] = useState<CustomerSelfServiceSession | null>(null);
  const [data, setData] = useState<PersonalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [dataError, setDataError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [operationError, setOperationError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(async () => { setData(await fetchPersonalSnapshot()); setDataError(""); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setSessionError(""); setDataError("");
    // Snapshot permissions reuse the authenticated parent-order capability.
    const ordersRequest = fetchPersonalOtpSession();
    void Promise.allSettled([ordersRequest, ordersRequest.then(() => fetchPersonalSnapshot())]).then(([orders, details]) => {
      if (!active) return;
      if (orders.status === "fulfilled") setSession(orders.value); else setSessionError(t("personal.loadFailed"));
      if (details.status === "fulfilled") setData(details.value); else { setData(null); setDataError(t("personal.loadFailed")); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [t, version]);
  useEffect(() => { setNotice(""); setOperationError(""); }, [location.pathname]);
  async function run(action: () => Promise<void>, message: string) {
    if (busy) return false;
    setBusy(true); setNotice(""); setOperationError("");
    try { await action(); setNotice(message); return true; }
    catch { setOperationError(t("personal.operationFailed")); return false; }
    finally { setBusy(false); }
  }
  const pageKey = location.pathname.startsWith(`${base}/payments`) ? "orders"
    : personalNavigation.find(item => item.to && (item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))?.key
    || (location.pathname.startsWith(`${base}/`) ? "orders" : "home");
  const header = <CustomerWorkspaceHeader desktopTitle={location.pathname.startsWith(`${base}/feedback/`) ? t("portalFeedback.title") : location.pathname.startsWith(`${base}/guides/`) ? t("portal.siteNav.guides") : t(`personal.${pageKey}`)} mode="personal" personal canSwitch={canSwitch} navItems={personalNavigation.map(item => ({ ...item, label: t(personalNavLabel[item.key]) }))} loggingOut={loggingOut} onLogout={onLogout} />;
  const frame = (child: ReactNode) => <main className="customer-portal personal-workspace">{header}{child}</main>;
  if (loading) return frame(<PageSkeleton label={t("personal.loading")} variant="dashboard" />);
  if (!session || sessionError) return frame(<CustomerPortalAccessState error={sessionError || t("personal.loadFailed")} busy={false} onRetry={() => setVersion(v => v + 1)} />);
  return frame(<div className="personal-content">
    {dataError && <div className="personal-data-error"><p role="alert">{dataError}</p><Button variant="outline" onClick={() => setVersion(v => v + 1)}>{t("personal.retry")}</Button></div>}
    {operationError && <p role="alert" className="portal-error">{operationError}</p>}{notice && <CornerNotice message={notice} onDismiss={() => setNotice("")} />}
    <PersonalContext.Provider value={{ data, session, refresh, busy, run }}><Routes>
      <Route index element={<PersonalHomePage />} />
      <Route path="personal" element={location.search.includes("addonCheckout=") ? <CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded /> : <PersonalHomePage />} />
      <Route path="personal/menus" element={<PersonalMenusPage />} />
      <Route path="personal/lunchbox" element={<PersonalLunchboxPage />} />
      <Route path="personal/orders" element={<PersonalOrdersPage />} />
      <Route path="personal/payments" element={<CustomerPersonalEvidencePage />} />
      <Route path="personal/points" element={<PersonalPointsPage />} />
      <Route path="personal/addresses" element={<CustomerPersonalAddressesPage />} />
      <Route path="personal/profile" element={<CustomerPersonalProfilePage />} />
      <Route path="personal/guides/:slug" element={<CustomerGuidePage />} />
      <Route path="personal/feedback/:orderId" element={<PersonalOrderFeedbackPage />} />
      <Route path="personal/:orderId" element={<CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </Routes></PersonalContext.Provider>
  </div>);
}
