import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, CalendarDays, ClipboardList, Gift, Link2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { CustomerSelfServicePage } from "@/components/CustomerSelfServicePage";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { personalNavigation } from "@/components/customer-portal/PersonalPortalChrome";
import { CustomerPersonalAddressesPage, CustomerPersonalEvidencePage, CustomerPersonalProfilePage } from "./CustomerPersonalSettingsPages";
import { PersonalLunchboxPage } from "@/components/customer-portal/PersonalLunchboxPage";
import { PersonalVipPage } from "@/components/customer-portal/PersonalVipPage";
import { AccountOrderFeedback } from "@/components/customer-portal/OrderFeedbackPage";
import { RewardCatalogList } from "@/components/customer-portal/RewardCatalogList";
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

function PersonalHomePage() {
  const { t, i18n } = useTranslation();
  const { session, data } = usePersonalWorkspace();
  const name = data?.profile.name?.trim();
  const next = upcomingOrder(session, data);
  const recent = [...session.orders].sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "")).slice(0, 3);
  const store = data?.stores[0];
  const reorderTarget = next || recent[0];
  const [points, setPoints] = useState<PersonalPoints | null>(null);
  useEffect(() => { void fetchPersonalPoints().then(setPoints).catch(() => setPoints({ balance: 0, pending: 0, ledger: [] })); }, []);
  return <>
    <section className="personal-hero">
      <div>
        <h1>{name ? t("personal.helloName", { name }) : t("personal.hello")}</h1>
        <p>{t("personal.helloIntro")}</p>
        <Button asChild><Link to={`${base}/lunchbox`}>{t("personal.orderNow")}<ArrowUpRight size={16} /></Link></Button>
        <Button variant="outline" asChild><Link to={`${base}/vip`}>{t("personal.vip")}</Link></Button>
      </div>
      <div className="personal-hero-art" aria-hidden="true">
        <svg viewBox="0 0 320 220" role="img">
          <rect width="320" height="220" rx="28" fill="#e7f3ea" />
          <rect x="78" y="46" width="164" height="128" rx="36" fill="#f4e1c4" />
          <ellipse cx="160" cy="118" rx="62" ry="36" fill="#f7f1e4" />
          <circle cx="132" cy="108" r="16" fill="#d9783a" />
          <circle cx="168" cy="96" r="14" fill="#de5b45" />
          <circle cx="186" cy="122" r="12" fill="#6aa84f" />
          <path d="M108 150c18 16 86 16 104 0" fill="none" stroke="#c4a574" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>
    </section>
    <section className="personal-shortcuts" aria-label={t("personal.home")}>
      <article>
        <span className="personal-shortcut-icon"><ClipboardList size={18} /></span>
        <h2>{t("personal.nextStatus")}</h2>
        {next ? <>
          <strong className={data?.order_states?.[next.id]?.paid ? "is-paid" : "is-unpaid"}>{t(data?.order_states?.[next.id] ? (data.order_states[next.id].paid ? "personal.paid" : "personal.unpaid") : "personal.unknownStatus")}</strong>
          <Link to={`${base}/${encodeURIComponent(next.id)}`}>{next.orderNumber}</Link>
        </> : <p>{t("personal.noNextOrder")}</p>}
      </article>
      <article>
        <span className="personal-shortcut-icon"><Gift size={18} /></span>
        <h2>{t("personal.balance")}</h2>
        <strong>{points ? `${points.balance.toLocaleString()} ${t("personal.pointUnit")}` : t("personal.loading")}</strong>
        <Link to={`${base}/points`}>{t("personal.points")}</Link>
      </article>
      <article>
        <span className="personal-shortcut-icon"><ShoppingCart size={18} /></span>
        <h2>{t("personal.reorder")}</h2>
        <p>{reorderTarget ? t("personal.lastOrderOn", { date: date(reorderTarget.orderDate, i18n.language) || t("personal.unknownDate") }) : t("personal.noOrders")}</p>
        {reorderTarget ? <PersonalReorderButton orderId={reorderTarget.id} /> : null}
      </article>
      <article>
        <span className="personal-shortcut-icon"><Link2 size={18} /></span>
        <h2>{t("personal.website")}</h2>
        <p>{store ? store.name : t("personal.visitSiteHint")}</p>
        {store ? <a href={shopifyStoreUrl(store.domain)}>{t("personal.viewMenu")}<ArrowUpRight size={14} /></a> : <Link to={`${base}/menus`}>{t("personal.menus")}</Link>}
      </article>
    </section>
    <section className="personal-panel">
      <div className="personal-section-heading"><h2>{t("personal.menus")}</h2><Link to={`${base}/menus`}>{t("personal.viewMore")}</Link></div>
      {data?.stores.length ? <div className="personal-menu-scroller">{data.stores.slice(0, 4).map(item => <a key={item.id} className="personal-menu-card" href={shopifyStoreUrl(item.domain)}><span className="personal-menu-visual" aria-hidden="true">{item.name.slice(0, 1)}</span><strong>{item.name}</strong><span>{item.domain}</span><em>{t("personal.viewMenu")}<ArrowUpRight size={14} /></em></a>)}</div> : <p className="personal-empty">{t("personal.noStores")}</p>}
    </section>
    <section className="personal-panel">
      <div className="personal-section-heading"><h2>{t("personal.recentOrders")}</h2><Link to={`${base}/orders`}>{t("personal.viewAll")}</Link></div>
      {recent.length ? <div className="personal-table-wrap"><table className="personal-orders-table">
        <thead><tr><th>{t("personal.orderNumber")}</th><th>{t("personal.orderDate")}</th><th>{t("personal.delivery")}</th><th>{t("personal.orderAmount")}</th><th>{t("personal.columnStatus")}</th><th>{t("personal.columnAction")}</th></tr></thead>
        <tbody>{recent.map(order => {
          const state = data?.order_states?.[order.id];
          const paid = Boolean(state?.paid);
          return <tr key={order.id}>
            <td><Link to={`${base}/${encodeURIComponent(order.id)}`}>{order.orderNumber}</Link></td>
            <td>{date(order.orderDate, i18n.language) || t("personal.unknownDate")}</td>
            <td>{date(order.deliveryDate, i18n.language) || t("personal.unknownDate")}</td>
            <td>{money(order.grandTotal, order.currency, i18n.language)}</td>
            <td><span className={paid ? "is-paid" : "is-unpaid"}>{state ? t(paid ? "personal.paid" : "personal.unpaid") : t("personal.unknownStatus")}</span></td>
            <td>{paid ? <PersonalReorderButton orderId={order.id} /> : <Link to={`${base}/payments`}>{t("personal.evidence")}</Link>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="personal-empty">{t("personal.noOrders")}</p>}
    </section>
    <section className="personal-points-banner">
      <div><Gift size={28} /><div><h2>{t("personal.balance")}</h2><p>{t("personal.pointsIntro")}</p><Link to={`${base}/points`}>{t("personal.pointsDetails")}</Link></div></div>
    </section>
  </>;
}

function PersonalMenusPage() {
  const { t } = useTranslation();
  const { data } = usePersonalWorkspace();
  return <section><h1>{t("personal.menus")}</h1><p>{t("personal.menusIntro")}</p>
    {data?.stores.length ? <div className="personal-store-list">{data.stores.map(store => <a key={store.id} href={shopifyStoreUrl(store.domain)} className="personal-store-link"><div><strong>{store.name}</strong><span>{store.domain}</span></div><span>{t("personal.website")}<ArrowUpRight size={18} /></span></a>)}</div> : <p className="personal-empty">{t("personal.noStores")}</p>}
    <p>{t("personal.shopifyCheckout")}</p>
  </section>;
}

function PersonalOrdersPage() {
  const { t } = useTranslation();
  const { session } = usePersonalWorkspace();
  return <section><h1>{t("personal.orders")}</h1>{session.orders.length ? session.orders.map(order => <PersonalOrderRow key={order.id} order={order} />) : <div className="personal-empty"><p>{t("personal.noOrders")}</p><p>{t("personal.orderHelp")}</p><Button asChild><Link to={`${base}/menus`}>{t("personal.orderNow")}</Link></Button></div>}</section>;
}

function PersonalOrderFeedbackPage() {
  const { orderId = "" } = useParams();
  return <AccountOrderFeedback orderId={orderId} />;
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
  const pageKey = personalNavigation.find(item => item.key !== "instant" && (item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))?.key
    || (location.pathname.startsWith(`${base}/`) ? "orders" : "home");
  const header = <CustomerWorkspaceHeader desktopTitle={t(`personal.${pageKey}`)} mode="personal" personal canSwitch={canSwitch} navItems={personalNavigation.map(item => ({ ...item, label: t(`personal.${item.key}`) }))} loggingOut={loggingOut} onLogout={onLogout} />;
  const frame = (child: ReactNode) => <main className="customer-portal personal-workspace">{header}{child}</main>;
  if (loading) return frame(<PageSkeleton label={t("personal.loading")} variant="dashboard" />);
  if (!session || sessionError) return frame(<CustomerPortalAccessState error={sessionError || t("personal.loadFailed")} busy={false} onRetry={() => setVersion(v => v + 1)} />);
  return frame(<div className="personal-content">
    {dataError && <div className="personal-data-error"><p role="alert">{dataError}</p><Button variant="outline" onClick={() => setVersion(v => v + 1)}>{t("personal.retry")}</Button></div>}
    {operationError && <p role="alert" className="portal-error">{operationError}</p>}{notice && <p role="status" className="portal-notice">{notice}</p>}
    <PersonalContext.Provider value={{ data, session, refresh, busy, run }}><Routes>
      <Route index element={<PersonalHomePage />} />
      <Route path="personal" element={location.search.includes("addonCheckout=") ? <CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded /> : <PersonalHomePage />} />
      <Route path="personal/menus" element={<PersonalMenusPage />} />
      <Route path="personal/lunchbox" element={<PersonalLunchboxPage />} />
      <Route path="personal/vip" element={<PersonalVipPage />} />
      <Route path="personal/orders" element={<PersonalOrdersPage />} />
      <Route path="personal/payments" element={<CustomerPersonalEvidencePage />} />
      <Route path="personal/points" element={<PersonalPointsPage />} />
      <Route path="personal/addresses" element={<CustomerPersonalAddressesPage />} />
      <Route path="personal/profile" element={<CustomerPersonalProfilePage />} />
      <Route path="personal/feedback/:orderId" element={<PersonalOrderFeedbackPage />} />
      <Route path="personal/:orderId" element={<CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </Routes></PersonalContext.Provider>
  </div>);
}
