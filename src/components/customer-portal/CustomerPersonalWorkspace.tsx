import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, CircleCheck, ClipboardList, Clock, Download, Ellipsis, Globe, Leaf, MessageCircle, Plus, ShoppingCart, Star, Truck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CornerNotice } from "@/components/ui/corner-notice";
import { PersonalPageSkeleton, personalSkeletonForPath } from "./PersonalPageSkeleton";
import { CustomerSelfServicePage, ReceiptPreview } from "@/components/CustomerSelfServicePage";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { personalNavigation, personalNavLabel } from "@/components/customer-portal/PersonalPortalChrome";
import { CustomerPersonalAddressesPage, CustomerPersonalEvidencePage, CustomerPersonalProfilePage } from "./CustomerPersonalSettingsPages";
import { PersonalLunchboxPage } from "@/components/customer-portal/PersonalLunchboxPage";
import { CustomerGuidePage } from "@/components/customer-portal/CustomerGuidePage";
import { AccountOrderFeedback } from "@/components/customer-portal/OrderFeedbackPage";
import { PersonalPointsPage, PersonalPointsSkeleton } from "./PersonalPointsPage";
import { HistoricalPointsWelcome } from "./HistoricalPointsWelcome";
import { getStorefrontLogoPath } from "@/lib/brand-logo";
import { fetchPersonalOtpSession, logoutPersonalOtpSession } from "@/lib/customer-otp-session";
import { fetchCustomerSelfServiceAddonOptions, fetchCustomerSelfServiceOrder, type CustomerSelfServiceOrderDetail, type CustomerSelfServiceOrderSummary, type CustomerSelfServiceSession } from "@/lib/customer-self-service";
import { printPdf } from "@/lib/print-pdf";
import { fetchPersonalPoints, fetchPersonalSnapshot, shopifyStoreUrl, type PersonalPoints, type PersonalSnapshot } from "@/lib/customer-personal";
import "@/lib/customer-personal-i18n";
import "@/lib/customer-portal-i18n";
import "./customer-personal.css";

type PersonalController = {
  data: PersonalSnapshot | null; points: PersonalPoints | null; session: CustomerSelfServiceSession; busy: boolean;
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

// "Order again" only opens the order's trusted brand website. It never rebuilds
// a quote, cart or payment data; an unconfigured brand disables the action.
export function PersonalWebsiteButton({ orderId, onNavigate }: { orderId: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { data } = usePersonalWorkspace();
  const domain = data?.order_states?.[orderId]?.store_domain || "";
  const store = data?.stores.find(item => item.domain === domain);
  if (menuTone(store?.name || "", domain) === "lunch-box") return <Link className="personal-order-action is-order" to={`${base}/lunchbox`} onClick={onNavigate}><ShoppingCart size={15} aria-hidden="true" />{t("personal.orderLunchbox")}</Link>;
  let href = "";
  if (domain) { try { href = shopifyStoreUrl(domain); } catch { href = ""; } }
  if (!href) return <div className="personal-reorder">
    <button type="button" className="personal-order-action is-order" disabled><Globe size={15} aria-hidden="true" />{t("personal.website")}</button>
    <p className="personal-order-note" role="status">{t("personal.websiteUnavailable")}</p>
  </div>;
  return <a className="personal-order-action is-order" href={href} onClick={onNavigate}>{t("personal.website")}<ArrowUpRight size={15} aria-hidden="true" /></a>;
}

function PersonalOrderMoreActions({ order, includeFeedback }: { order: CustomerSelfServiceOrderSummary; includeFeedback: boolean }) {
  const { t } = useTranslation();
  const { session } = usePersonalWorkspace();
  const [open, setOpen] = useState(false);
  const [canAddOn, setCanAddOn] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchCustomerSelfServiceAddonOptions(session.token, order.id)
      .then(options => { if (active) setCanAddOn(options.canAddOn); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [session.token, order.id]);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="personal-order-action personal-order-more" aria-label={t("personal.moreOrderActions", { number: order.orderNumber })}><Ellipsis size={20} aria-hidden="true" /></button></PopoverTrigger>
    <PopoverContent align="end" className="personal-order-more-menu" aria-label={t("personal.orderActions")}>
      {canAddOn ? <Link className="personal-order-action is-addon" to={`${base}/${encodeURIComponent(order.id)}?addon=1`} onClick={() => setOpen(false)}><Plus size={15} aria-hidden="true" />{t("personal.addon")}</Link> : null}
      {includeFeedback ? <Link className="personal-order-action is-feedback" to={`${base}/feedback/${encodeURIComponent(order.id)}`} onClick={() => setOpen(false)}><MessageCircle size={15} aria-hidden="true" />{t("portalFeedback.title")}</Link> : null}
      <PersonalWebsiteButton orderId={order.id} onNavigate={() => setOpen(false)} />
    </PopoverContent>
  </Popover>;
}

function deliveredStatus(status: string | null | undefined) {
  return /已送達|delivered/i.test(status || "");
}

function PersonalDocumentButton({ orderId, kind }: { orderId: string; kind: "receipt" | "invoice" }) {
  const { t } = useTranslation();
  const { session } = usePersonalWorkspace();
  const [order, setOrder] = useState<CustomerSelfServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return <>
    <button type="button" className={`personal-order-action is-payment is-${kind}`} disabled={loading} onClick={() => {
      setLoading(true); setError("");
      void fetchCustomerSelfServiceOrder(session.token, orderId)
        .then(setOrder)
        .catch(() => setError(t("personal.documentUnavailable")))
        .finally(() => setLoading(false));
    }}><Download size={15} aria-hidden="true" />{t(loading ? "personal.loading" : kind === "invoice" ? "personal.downloadInvoice" : "personal.downloadReceipt")}</button>
    {error ? <CornerNotice message={error} tone="error" onDismiss={() => setError("")} /> : null}
    {order ? <ReceiptPreview order={order} documentKind={kind} printReceipt={printPdf} onClose={() => setOrder(null)} /> : null}
  </>;
}

function PersonalOrderCard({ order }: { order: CustomerSelfServiceOrderSummary }) {
  const { t, i18n } = useTranslation();
  const { data } = usePersonalWorkspace();
  const state = data?.order_states?.[order.id];
  const paid = state?.paid === true;
  const delivery = state?.delivery_status?.trim() || "";
  const deliveryDone = deliveredStatus(delivery);
  return <article className="personal-order-card">
    <div className="personal-order-top">
      <Link to={`${base}/${encodeURIComponent(order.id)}`}>{order.orderNumber}</Link>
      <strong>{money(order.grandTotal, order.currency, i18n.language)}</strong>
    </div>
    <p className="personal-order-date"><CalendarDays size={15} aria-hidden="true" />{longDate(order.deliveryDate || order.orderDate, i18n.language) || t("personal.unknownDate")}</p>
    <div className="personal-order-chips">
      <span className={paid ? "is-done" : "is-wait"}>{paid ? <CircleCheck size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}{state ? t(paid ? "personal.paid" : "personal.unpaid") : t("personal.unknownStatus")}</span>
      <span className={deliveryDone ? "is-done" : "is-wait"}><Truck size={14} aria-hidden="true" />{delivery || t("personal.unassigned")}</span>
    </div>
    <div className="personal-order-actions">
      {paid ? <><PersonalDocumentButton orderId={order.id} kind="receipt" /><PersonalDocumentButton orderId={order.id} kind="invoice" /></> : <Link className="personal-order-action is-payment" to={`${base}/payments?order=${encodeURIComponent(order.id)}`}><Upload size={15} aria-hidden="true" />{t("personal.evidenceUpload")}</Link>}
      {!paid ? <Link className="personal-order-action is-feedback" to={`${base}/feedback/${encodeURIComponent(order.id)}`}><MessageCircle size={15} aria-hidden="true" />{t("portalFeedback.title")}</Link> : null}
      <PersonalOrderMoreActions order={order} includeFeedback={paid} />
    </div>
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
  const { session, data, points } = usePersonalWorkspace();
  const next = upcomingOrder(session, data);
  const [deliveryDetail, setDeliveryDetail] = useState<{ id: string; order: CustomerSelfServiceOrderDetail | null } | null>(null);
  const nextId = next?.id;
  useEffect(() => {
    if (!nextId) return;
    let active = true;
    void fetchCustomerSelfServiceOrder(session.token, nextId)
      .then(order => { if (active) setDeliveryDetail({ id: nextId, order }); })
      .catch(() => { if (active) setDeliveryDetail({ id: nextId, order: null }); });
    return () => { active = false; };
  }, [nextId, session.token]);
  const recent = [...session.orders].sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "")).slice(0, 3);
  const shortcuts = [
    { to: `${base}/menus`, icon: BookOpen, label: t("personal.menus") },
    { to: `${base}/lunchbox`, icon: ShoppingCart, label: t("personal.instantShort") },
    { to: `${base}/payments`, icon: Upload, label: t("personal.evidenceUpload") },
    { to: `${base}/orders`, icon: ClipboardList, label: t("personal.ordersRecord") },
  ];
  const detail = deliveryDetail && deliveryDetail.id === nextId ? deliveryDetail.order : null;
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = dayFormat.format(new Date());
  const tomorrow = new Date(`${today}T00:00:00+08:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const deliveryDay = next?.deliveryDate ? dayFormat.format(new Date(next.deliveryDate)) : "";
  const arrival = deliveryDay === today ? t("personal.arrivesToday") : deliveryDay === dayFormat.format(tomorrow) ? t("personal.arrivesTomorrow") : t("personal.arrivesOn", { date: longDate(next?.deliveryDate || null, i18n.language) });
  return <div className="personal-home">
    <section className="personal-hero">
      <div className="personal-hero-copy">
        <h1>{t("personal.hello")}</h1>
        <p>{t("personal.helloIntro")}</p>
        <Link className="personal-pill" to={`${base}/lunchbox`}>{t("personal.orderNow")}<ChevronRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="personal-hero-art" aria-hidden="true">
        <svg className="personal-hero-rays" viewBox="0 0 60 52" fill="none"><path d="M8 32 22 38M22 13 32 26M43 5 47 21" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
        <img className="personal-hero-bowl" src="/assets/customer-personal/hero-bowl-clean.png" alt="" />
      </div>
    </section>
    <nav className="personal-quick" aria-label={t("personal.home")}>
      {shortcuts.map(item => {
        const Icon = item.icon;
        return <Link key={item.to} to={item.to} className="personal-quick-card"><span className="personal-quick-icon"><Icon size={22} /></span><span>{item.label}<ChevronRight size={14} aria-hidden="true" /></span></Link>;
      })}
    </nav>
    <div className={`personal-status${next ? " has-delivery" : ""}`}>
      <section className={`personal-next-card${next ? " has-delivery" : ""}`}>
        <div className="personal-status-copy">
          <h2><span className="personal-status-icon"><CalendarDays size={16} /></span>{t("personal.nextStatus")}</h2>
          {next ? <>
            <div className="personal-delivery-summary"><strong>{next.orderNumber}<span> · {arrival}</span></strong></div>
            <p className="personal-delivery-time">{t("personal.estimatedArrival", { time: detail?.deliveryTime?.trim() || t("personal.deliveryTimePending") })}</p>
          </> : <p>{t("personal.noNextOrder")}</p>}
          <Link className="personal-pill is-ghost" to={next ? `${base}/${encodeURIComponent(next.id)}` : `${base}/lunchbox`}>{t(next ? "personal.details" : "personal.orderNow")}<ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <img src={next ? "/assets/customer-personal/delivery-bag-truck.png" : "/assets/empty-box.svg"} alt="" />
      </section>
      <section className="personal-points-card">
        <div className="personal-status-copy">
          <h2><span className="personal-status-icon is-star"><Star size={16} /></span>{t("personal.balance")}</h2>
          {points ? <strong>{`${points.balance.toLocaleString()} ${t("personal.pointUnit")}`}</strong> : <span className="personal-points-loading page-skeleton-bone" role="status" aria-label={t("personal.loading")} aria-busy="true" />}
          <Link className="personal-pill is-ghost" to={`${base}/points`}>{t("personal.points")}<ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <img src="/assets/customer-personal/points-coins-v2.png" alt="" />
      </section>
    </div>
    <section className="personal-panel">
      <div className="personal-section-heading"><h2><ClipboardList size={18} />{t("personal.recentOrders")}</h2><Link to={`${base}/orders`}>{t("personal.viewAll")}<ChevronRight size={16} aria-hidden="true" /></Link></div>
      {recent.length ? <div className="personal-recent-list">{recent.map(order => {
        const state = data?.order_states?.[order.id];
        const paid = Boolean(state?.paid);
        return <Link key={order.id} className="personal-recent-row" aria-label={order.orderNumber} to={`${base}/${encodeURIComponent(order.id)}`}>
          <div>
            <strong>{order.orderNumber}</strong>
            <p>{longDate(order.deliveryDate || order.orderDate, i18n.language) || t("personal.unknownDate")}</p>
          </div>
          <span className={paid ? "is-paid" : "is-unpaid"}>{state ? t(paid ? "personal.paid" : "personal.unpaid") : t("personal.unknownStatus")}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>;
      })}</div> : <p className="personal-empty">{t("personal.noOrders")}</p>}
    </section>
    <section className="personal-panel">
      <div className="personal-section-heading"><h2><Leaf size={18} />{t("personal.menus")}</h2><Link to={`${base}/menus`}>{t("personal.viewMore")}<ChevronRight size={16} aria-hidden="true" /></Link></div>
      {data?.stores.length ? <div className="personal-menu-scroller">{data.stores.slice(0, 8).map(item => {
        const logo = getStorefrontLogoPath(item.name, item.domain);
        const tone = menuTone(item.name, item.domain);
        return <a key={item.id} className="personal-menu-card" href={menuTone(item.name, item.domain) === "lunch-box" ? `${base}/lunchbox` : shopifyStoreUrl(item.domain)}>
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
          <a className="personal-menu-row" href={menuTone(store.name, store.domain) === "lunch-box" ? `${base}/lunchbox` : shopifyStoreUrl(store.domain)}>
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
  const orders = [...session.orders].sort((a, b) => (b.deliveryDate || b.orderDate || "").localeCompare(a.deliveryDate || a.orderDate || ""));
  return <section className="personal-orders">
    <h1>{t("personal.orders")}</h1>
    <p>{t("personal.ordersIntro")}</p>
    {orders.length ? <div className="personal-order-list">{orders.map(order => <PersonalOrderCard key={order.id} order={order} />)}</div> : <div className="personal-empty"><p>{t("personal.noOrders")}</p><p>{t("personal.orderHelp")}</p><Button asChild><Link to={`${base}/menus`}>{t("personal.orderNow")}</Link></Button></div>}
  </section>;
}

function PersonalOrderFeedbackPage() {
  const { t } = useTranslation();
  const { orderId = "" } = useParams();
  return <div><Link className="self-service-back" to={`${base}/orders`}><ArrowLeft aria-hidden="true" />{t("portalFeedback.backToOrders")}</Link><AccountOrderFeedback key={orderId} orderId={orderId} showEmptyState /></div>;
}

export function CustomerPersonalWorkspace({ canSwitch, loggingOut, onLogout }: { canSwitch: boolean; loggingOut: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [session, setSession] = useState<CustomerSelfServiceSession | null>(null);
  const [data, setData] = useState<PersonalSnapshot | null>(null);
  const [points, setPoints] = useState<PersonalPoints | null>(null);
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
    void Promise.allSettled([ordersRequest, ordersRequest.then(() => fetchPersonalSnapshot()), fetchPersonalPoints()]).then(([orders, details, pointsResult]) => {
      if (!active) return;
      if (orders.status === "fulfilled") setSession(orders.value); else setSessionError(t("personal.loadFailed"));
      if (details.status === "fulfilled") setData(details.value); else { setData(null); setDataError(t("personal.loadFailed")); }
      if (pointsResult.status === "fulfilled") setPoints(pointsResult.value);
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
  const guideNav = personalNavigation.find(item => item.to === location.pathname);
  const navItem = personalNavigation.find(item => item.key === pageKey);
  const isOrderDetail = location.pathname.startsWith(`${base}/`);
  const desktopTitle = isOrderDetail && /^[-a-z0-9]{36}$/i.test(location.pathname.slice(base.length + 1)) ? t("personal.orderDetail", { defaultValue: "訂單詳情" }) : location.pathname.startsWith(`${base}/feedback/`) ? t("portalFeedback.title") : location.pathname.startsWith(`${base}/guides/`)
    ? t(guideNav ? personalNavLabel[guideNav.key] : "portal.siteNav.guides")
    : t(navItem ? personalNavLabel[navItem.key] : `personal.${pageKey}`);
  const header = <CustomerWorkspaceHeader desktopTitle={desktopTitle} mode="personal" personal canSwitch={canSwitch} navItems={personalNavigation.map(item => ({ ...item, label: t(personalNavLabel[item.key]) }))} loggingOut={loggingOut} onLogout={onLogout} />;
  const frame = (child: ReactNode) => <main className="customer-portal personal-workspace">{header}{child}</main>;
  if (loading) return frame(<div className="personal-content">{pageKey === "points" ? <PersonalPointsSkeleton label={t("personal.loading")} /> : <PersonalPageSkeleton variant={personalSkeletonForPath(location.pathname, location.search)} />}</div>);
  if (!session || sessionError) return frame(<CustomerPortalAccessState error={sessionError || t("personal.loadFailed")} busy={false} onRetry={() => setVersion(v => v + 1)} />);
  return frame(<div className="personal-content">
    <HistoricalPointsWelcome />
    {dataError && <div className="personal-data-error"><p role="alert">{dataError}</p><Button variant="outline" onClick={() => setVersion(v => v + 1)}>{t("personal.retry")}</Button></div>}
    {operationError && <CornerNotice message={operationError} tone="error" onDismiss={() => setOperationError("")} />}{notice && <CornerNotice message={notice} onDismiss={() => setNotice("")} />}
    <PersonalContext.Provider value={{ data, points, session, refresh, busy, run }}><Routes>
      <Route index element={<PersonalHomePage />} />
      <Route path="personal" element={location.search.includes("addonCheckout=") ? <CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded /> : <PersonalHomePage />} />
      <Route path="personal/menus" element={<PersonalMenusPage />} />
      <Route path="personal/lunchbox" element={<PersonalLunchboxPage />} />
      <Route path="personal/orders" element={<PersonalOrdersPage />} />
      <Route path="personal/payments" element={<CustomerPersonalEvidencePage />} />
      <Route path="personal/points" element={<PersonalPointsPage initialPoints={points} onPointsChange={setPoints} />} />
      <Route path="personal/addresses" element={<CustomerPersonalAddressesPage />} />
      <Route path="personal/profile" element={<CustomerPersonalProfilePage />} />
      <Route path="personal/guides/:slug" element={<CustomerGuidePage />} />
      <Route path="personal/feedback/:orderId" element={<PersonalOrderFeedbackPage />} />
      <Route path="personal/:orderId" element={<CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </Routes></PersonalContext.Provider>
  </div>);
}
