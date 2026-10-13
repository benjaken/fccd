import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, CalendarDays, Gift, Home, MapPin, ReceiptText, ShoppingBag, UserRound, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { CustomerSelfServicePage } from "@/components/CustomerSelfServicePage";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { CustomerPersonalAddressesPage, CustomerPersonalEvidencePage, CustomerPersonalProfilePage } from "./CustomerPersonalSettingsPages";
import { fetchPersonalOtpSession, logoutPersonalOtpSession } from "@/lib/customer-otp-session";
import type { CustomerSelfServiceOrderSummary, CustomerSelfServiceSession } from "@/lib/customer-self-service";
import { fetchPersonalSnapshot, fetchPersonalReorder, shopifyCartUrl, shopifyStoreUrl, type PersonalSnapshot } from "@/lib/customer-personal";
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
const navigation = [
  { key: "home", to: base, end: true, icon: Home },
  { key: "menus", to: `${base}/menus`, icon: UtensilsCrossed },
  { key: "orders", to: `${base}/orders`, icon: ShoppingBag },
  { key: "evidence", to: `${base}/payments`, icon: ReceiptText },
  { key: "points", to: `${base}/points`, icon: Gift },
  { key: "addresses", to: `${base}/addresses`, icon: MapPin },
  { key: "profile", to: `${base}/profile`, icon: UserRound },
];
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
      void fetchPersonalReorder(orderId).then(cart => setUrl(shopifyCartUrl(cart))).catch(err => {
        const message = err && typeof err === "object" && "message" in err ? String(err.message) : "";
        setError(t(message.includes("reorder_options_required") ? "personal.reorderOptions" : "personal.reorderUnavailable"));
      }).finally(() => setLoading(false));
    }}>{t(loading ? "personal.loading" : "personal.reorder")}</Button>}
    {url && <div className="personal-reorder-confirm"><p>{t("personal.reorderIntro")}</p><div className="portal-actions">
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
    <div className="portal-actions"><Button variant="outline" asChild><Link to={`${base}/${encodeURIComponent(order.id)}`}>{t("personal.details")}</Link></Button><PersonalReorderButton orderId={order.id} /></div>
  </article>;
}

function PersonalHomePage() {
  const { t } = useTranslation();
  const { session, data } = usePersonalWorkspace();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const next = [...session.orders].filter(order => {
    const state = data?.order_states?.[order.id]?.delivery_status;
    const delivery = order.deliveryDate ? new Date(order.deliveryDate) : null;
    const day = delivery && !Number.isNaN(delivery.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(delivery) : "";
    return day >= today && !state?.match(/取消|完成|已送達|cancel|complete|delivered/i);
  }).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""))[0];
  return <>
    <section className="personal-home-intro"><h1>{t("personal.welcome")}</h1><p>{t("personal.intro")}</p><Button asChild><Link to={`${base}/menus`}>{t("personal.orderNow")}<ArrowUpRight size={16} /></Link></Button></section>
    <section className="personal-next-order"><div className="personal-section-heading"><h2>{t("personal.nextOrder")}</h2><Link to={`${base}/orders`}>{t("personal.orders")}</Link></div>
      {next ? <PersonalOrderRow order={next} /> : <p className="personal-empty">{t("personal.noNextOrder")}</p>}
    </section>
    <section className="personal-home-bottom"><div><h2>{t("personal.balance")}</h2><p>{t("personal.pointsNotActive")}</p><Link to={`${base}/points`}>{t("personal.points")}</Link></div>
      <div><h2>{t("personal.menus")}</h2><p>{t("personal.menusIntro")}</p><Link to={`${base}/menus`}>{t("personal.website")}<ArrowUpRight size={16} /></Link></div>
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

function PersonalPointsPage() {
  const { t } = useTranslation();
  return <section><h1>{t("personal.points")}</h1><div className="personal-empty"><Gift size={32} /><h2>{t("personal.pointsUnavailable")}</h2><p>{t("personal.pointsIntro")}</p></div>
    <dl className="personal-points-facts"><div><dt>{t("personal.balance")}</dt><dd>{t("personal.pointsNotActive")}</dd></div><div><dt>{t("personal.redeem")}</dt><dd>{t("personal.pointsNotActive")}</dd></div></dl>
    <h2>{t("personal.ledger")}</h2><p>{t("personal.noLedger")}</p>
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
  const currentPage = navigation.find(item => item.to === location.pathname)?.key || (location.pathname.startsWith(`${base}/`) ? "orders" : "home");
  const header = <CustomerWorkspaceHeader desktopTitle={t(`personal.${currentPage}`)} mode="personal" personal canSwitch={canSwitch} navItems={navigation.map(item => ({ ...item, label: t(`personal.${item.key}`) }))} loggingOut={loggingOut} onLogout={onLogout} />;
  if (loading) return <main className="customer-portal personal-workspace">{header}<PageSkeleton label={t("personal.loading")} variant="dashboard" /></main>;
  if (!session || sessionError) return <main className="customer-portal personal-workspace">{header}<CustomerPortalAccessState error={sessionError || t("personal.loadFailed")} busy={false} onRetry={() => setVersion(v => v + 1)} /></main>;
  return <main className="customer-portal personal-workspace">{header}<div className="personal-content">
    {dataError && <div className="personal-data-error"><p role="alert">{dataError}</p><Button variant="outline" onClick={() => setVersion(v => v + 1)}>{t("personal.retry")}</Button></div>}
    {operationError && <p role="alert" className="portal-error">{operationError}</p>}{notice && <p role="status" className="portal-notice">{notice}</p>}
    <PersonalContext.Provider value={{ data, session, refresh, busy, run }}><Routes>
      <Route index element={<PersonalHomePage />} />
      <Route path="personal" element={location.search.includes("addonCheckout=") ? <CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded /> : <PersonalHomePage />} />
      <Route path="personal/menus" element={<PersonalMenusPage />} />
      <Route path="personal/orders" element={<PersonalOrdersPage />} />
      <Route path="personal/payments" element={<CustomerPersonalEvidencePage />} />
      <Route path="personal/points" element={<PersonalPointsPage />} />
      <Route path="personal/addresses" element={<CustomerPersonalAddressesPage />} />
      <Route path="personal/profile" element={<CustomerPersonalProfilePage />} />
      <Route path="personal/:orderId" element={<CustomerSelfServicePage routeBase={base} listPath={`${base}/orders`} loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly embedded />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </Routes></PersonalContext.Provider>
  </div></main>;
}
