import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarDays, ChevronDown, Minus, Plus, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersonalWorkspace } from "@/components/customer-portal/CustomerPersonalWorkspace";
import { fetchLunchboxCatalog, submitLunchbox, type LunchboxCatalog, type LunchboxItem } from "@/lib/customer-lunchbox";
import "@/lib/personal-lunchbox-i18n";
import "@/lib/customer-personal-i18n";
import "./personal-lunchbox.css";

const money = (value: number) => `HK$${new Intl.NumberFormat("en-HK", { maximumFractionDigits: 2 }).format(value)}`;
const artwork = "/assets/customer-personal/lunchbox-empty.png";

function FoodImage({ item, large = false }: { item: LunchboxItem; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return item.image_url && !failed ? <img className="lunchbox-food-image" src={item.image_url} alt={item.name} loading={large ? "eager" : "lazy"} onError={() => setFailed(true)} /> : <div className="lunchbox-food-placeholder"><Utensils size={large ? 56 : 32} aria-hidden="true" /></div>;
}

function Quantity({ name, value, max, onChange }: { name: string; value: number; max: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  return <div className="lunchbox-quantity" role="group" aria-label={t("personal.quantityLabel", { name })}>
    <button type="button" aria-label={t("lunchbox.decrease", { name })} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus size={18} /></button>
    <output aria-live="polite">{value}</output>
    <button type="button" aria-label={t("lunchbox.increase", { name })} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={18} /></button>
  </div>;
}

export function PersonalLunchboxPage() {
  const { t, i18n } = useTranslation();
  const { data, busy, run } = usePersonalWorkspace();
  const [catalog, setCatalog] = useState<LunchboxCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [menuId, setMenuId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const [unresolvedSubmission, setUnresolvedSubmission] = useState(false);
  const requestId = useRef<string | null>(null);
  const topRef = useRef<HTMLHeadingElement>(null);
  const focusView = useRef(false);
  const load = useCallback(async () => {
    setFailed(false);
    try { setCatalog(await fetchLunchboxCatalog()); } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (focusView.current) { topRef.current?.focus(); topRef.current?.scrollIntoView({ block: "start" }); }
    focusView.current = true;
  }, [detailId, checkout]);
  const menu = catalog?.menus.find(item => item.id === menuId) || catalog?.menus[0];
  const detail = menu?.items.find(item => item.product_id === detailId);
  const selected = menu?.items.filter(item => (quantities[item.product_id] || 0) > 0) || [];
  const count = selected.reduce((sum, item) => sum + quantities[item.product_id], 0);
  const food = selected.reduce((sum, item) => sum + Number(item.unit_price) * quantities[item.product_id], 0);
  const resolvedAddress = addressId || data?.addresses.find(address => address.is_default)?.id || data?.addresses[0]?.id || "";
  const valid = selected.length > 0 && selected.every(item => Number.isInteger(quantities[item.product_id]) && quantities[item.product_id] <= item.available_quantity);
  const change = (id: string, value: number) => { requestId.current = null; setQuantities(current => ({ ...current, [id]: value })); };
  const cutoff = menu?.cutoff_at ? new Date(menu.cutoff_at).toLocaleString(i18n.language, { timeZone: "Asia/Hong_Kong" }) : "";

  return <section className={`personal-lunchbox${detail ? " is-detail" : ""}`} aria-busy={!catalog && !failed}>
    {detail ? <>
      <button className="lunchbox-back" type="button" onClick={() => setDetailId(null)}><ArrowLeft size={20} />{t("lunchbox.back")}</button>
      <div className="lunchbox-detail-image"><FoodImage key={detail.product_id} item={detail} large /></div>
      <div className="lunchbox-detail-body"><div className="lunchbox-heading"><h1 tabIndex={-1} ref={topRef}>{detail.name}</h1><strong>{money(Number(detail.unit_price))}</strong></div>
        {detail.description ? <p className="lunchbox-description">{detail.description}</p> : null}
        <p className="lunchbox-muted">{t("personal.available", { count: detail.available_quantity })}</p>
        <div className="lunchbox-detail-quantity"><h2>{t("lunchbox.chooseQuantity")}</h2><Quantity name={detail.name} value={detailQuantity} max={detail.available_quantity} onChange={setDetailQuantity} /></div>
        <Button className="lunchbox-primary" disabled={detailQuantity < 1 || busy} onClick={() => { change(detail.product_id, detailQuantity); setDetailId(null); }}>{t("lunchbox.add")} {money(Number(detail.unit_price) * detailQuantity)}</Button>
      </div>
    </> : <>
      <div className="lunchbox-hero"><div><h1 tabIndex={-1} ref={topRef}>{t("personal.lunchbox")}</h1><p>{t("personal.lunchboxIntro")}</p></div><img src={artwork} alt="" /></div>
      {failed ? <div className="lunchbox-state"><p role="alert">{t("lunchbox.loadFailed")}</p><Button onClick={() => void load()}>{t("lunchbox.retry")}</Button></div> : !catalog ? <div className="lunchbox-state" role="status">{t("lunchbox.loading")}</div> : !menu ? <div className="lunchbox-empty"><img src={artwork} alt="" /><h2>{t("lunchbox.emptyTitle")}</h2><p>{t("lunchbox.emptyDescription")}</p><Button variant="outline" asChild><Link to="/customer/personal/orders">{t("lunchbox.orderHistory")}</Link></Button></div> : <>
        <details className="lunchbox-notice"><summary><CalendarDays size={22} /><span><strong>{t("lunchbox.notice")}</strong><small>{t("lunchbox.cutoff", { time: cutoff })}</small></span><ChevronDown size={18} /></summary><p>{t("personal.lunchboxIntro")}</p></details>
        {catalog.menus.length > 1 ? <label className="lunchbox-menu-select">{t("personal.chooseLunchbox")}<select value={menu.id} disabled={busy || unresolvedSubmission} onChange={event => { setMenuId(event.target.value); setQuantities({}); setCheckout(false); requestId.current = null; }}>{catalog.menus.map(item => <option key={item.id} value={item.id}>{item.brand} · {item.name} · {item.delivery_date}</option>)}</select></label> : null}
        {checkout ? <div className="lunchbox-checkout"><button className="lunchbox-back" type="button" disabled={busy || unresolvedSubmission} onClick={() => setCheckout(false)}><ArrowLeft size={18} />{t("lunchbox.back")}</button><h2>{t("lunchbox.confirm")}</h2>
          {unresolvedSubmission ? <p role="status">{t("lunchbox.retrySubmission")}</p> : null}
          {selected.map(item => <div className="lunchbox-review-row" key={item.product_id}><span>{item.name} × {quantities[item.product_id]}</span><strong>{money(Number(item.unit_price) * quantities[item.product_id])}</strong></div>)}
          <p>{menu.delivery_date} · {menu.delivery_time}</p>
          <label>{t("personal.addresses")}<select value={resolvedAddress} disabled={busy || unresolvedSubmission} onChange={event => { requestId.current = null; setAddressId(event.target.value); }}><option value="">{t("personal.chooseAddress")}</option>{data?.addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.address}</option>)}</select></label>
          {!data?.addresses.length ? <Button variant="outline" asChild><Link to="/customer/personal/addresses">{t("personal.addAddress")}</Link></Button> : null}
          <div className="lunchbox-review-row"><span>{t("personal.shipping")}</span><strong>{money(Number(menu.shipping_fee))}</strong></div><div className="lunchbox-review-row"><strong>{t("personal.payable")}</strong><strong>{money(food + Number(menu.shipping_fee))}</strong></div><p className="lunchbox-muted">{t("personal.lunchboxIntro")}</p>
          <Button className="lunchbox-primary" disabled={busy || !valid || !resolvedAddress || !data?.addresses.some(address => address.id === resolvedAddress)} onClick={() => {
            requestId.current ??= crypto.randomUUID();
            const id = requestId.current;
            void run(async () => {
              try {
                await submitLunchbox(id, menu.id, resolvedAddress, selected.map(item => ({ product_id: item.product_id, quantity: quantities[item.product_id] })));
              } catch (error) {
                // A definite database rejection can be edited. An unknown transport result
                // must retry the same payload and id before starting another attempt.
                const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
                setUnresolvedSubmission(!/^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(code));
                throw error;
              }
              setUnresolvedSubmission(false);
              requestId.current = null; setQuantities({}); setCheckout(false);
              await load();
            }, t("personal.lunchboxSubmitted"));
          }}>{busy ? t("personal.submitting") : t("personal.submitLunchbox")}</Button>
        </div> : <>
          <div className="lunchbox-section-heading"><h2>{t("lunchbox.available")}</h2><span>{menu.delivery_date}</span></div>
          <div className="lunchbox-grid">{menu.items.map(item => <article className="lunchbox-card" key={item.product_id}><button className="lunchbox-card-open" type="button" onClick={() => { setDetailQuantity(quantities[item.product_id] || Math.min(1, item.available_quantity)); setDetailId(item.product_id); }}><FoodImage item={item} /><h3>{item.name}</h3>{item.description ? <p>{item.description}</p> : null}</button><div className="lunchbox-card-bottom"><strong>{money(Number(item.unit_price))}</strong><Quantity name={item.name} value={quantities[item.product_id] || 0} max={item.available_quantity} onChange={value => change(item.product_id, value)} /></div></article>)}</div>
          {!menu.items.length ? <p className="lunchbox-state">{t("personal.noLunchbox")}</p> : null}
          <div className="lunchbox-cart"><div aria-live="polite"><span>{t("lunchbox.selected", { count })}</span><strong>{money(food)}</strong></div><Button disabled={busy || !valid} onClick={() => setCheckout(true)}>{t("lunchbox.next")}</Button></div>
        </>}
      </>}
      {catalog?.orders.length ? <details className="lunchbox-history"><summary>{t("lunchbox.orderHistory")}</summary>{catalog.orders.map(order => <Link key={order.id} to={`/customer/personal/${encodeURIComponent(order.id)}`}>{order.number || t("personal.awaitingNumber")} · {order.stage === "quote" ? t("personal.awaitingConfirmation") : t("personal.confirmedOrder")}</Link>)}</details> : null}
    </>}
  </section>;
}
