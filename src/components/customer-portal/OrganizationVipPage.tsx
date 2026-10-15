import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { fetchVipCatalog, submitVipCycle, type VipCycleCatalog, type LunchboxItem } from "@/lib/customer-lunchbox";
import { portalPricesVisible } from "@/lib/customer-portal";
import { PersonalPageSkeleton } from "@/components/customer-portal/PersonalPageSkeleton";
import { FoodImage, LunchboxNotice, Quantity, cutoffParts, lunchboxArtwork, lunchboxMoney } from "./lunchbox-shared";
import "./personal-lunchbox.css";
import "./organization-vip.css";

export function OrganizationVipPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t, i18n } = useTranslation();
  const { busy, run, setPage, refresh } = portal;
  const addresses = portal.data?.addresses ?? [];
  const showPrices = portalPricesVisible(portal.data);
  const [cycles, setCycles] = useState<VipCycleCatalog[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cycleId, setCycleId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<{ menuId: string; productId: string } | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const requestId = useRef<string | null>(null);
  const topRef = useRef<HTMLHeadingElement>(null);
  const focusView = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try { setCycles(await fetchVipCatalog()); }
    catch { setCycles(null); setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (focusView.current) { topRef.current?.focus(); topRef.current?.scrollIntoView({ block: "start" }); }
    focusView.current = true;
  }, [detail, checkout]);

  const list = cycles ?? [];
  const cycle = list.find(item => item.id === cycleId) || list[0];
  const keyOf = (menuId: string, productId: string) => `${menuId}:${productId}`;
  const quantityOf = (menuId: string, item: LunchboxItem) => quantities[keyOf(menuId, item.product_id)] || 0;
  const selectedDays = (cycle?.menus ?? []).map(menu => ({ menu, items: menu.items.filter(item => quantityOf(menu.id, item) > 0) })).filter(day => day.items.length > 0);
  const count = selectedDays.reduce((sum, day) => sum + day.items.reduce((daySum, item) => daySum + quantityOf(day.menu.id, item), 0), 0);
  const food = selectedDays.reduce((sum, day) => sum + day.items.reduce((daySum, item) => daySum + Number(item.unit_price) * quantityOf(day.menu.id, item), 0), 0);
  const days = selectedDays.map(day => ({ menu_id: day.menu.id, items: day.items.map(item => ({ product_id: item.product_id, quantity: quantityOf(day.menu.id, item) })) }));
  const resolvedAddress = addressId || addresses.find(address => address.is_default)?.id || addresses[0]?.id || "";
  const detailMenu = detail ? cycle?.menus.find(menu => menu.id === detail.menuId) : undefined;
  const detailItem = detail ? detailMenu?.items.find(item => item.product_id === detail.productId) : undefined;
  const change = (menuId: string, productId: string, value: number) => { requestId.current = null; setQuantities(current => ({ ...current, [keyOf(menuId, productId)]: value })); };

  if (cycles === null && !failed) return <PersonalPageSkeleton variant="vip" label={t("portal.loading")} />;

  return <section className={`personal-lunchbox personal-vip${detailItem ? " is-detail" : ""}`}>
    {detailItem && detail ? <>
      <button className="lunchbox-back" type="button" onClick={() => setDetail(null)}><ArrowLeft size={20} />{t("portal.vipBack")}</button>
      <div className="lunchbox-detail-image"><FoodImage key={detailItem.product_id} item={detailItem} large /></div>
      <div className="lunchbox-detail-body">
        <div className="lunchbox-heading"><h1 tabIndex={-1} ref={topRef}>{detailItem.name}</h1>{showPrices ? <strong>{lunchboxMoney(Number(detailItem.unit_price))}</strong> : null}</div>
        {detailItem.description ? <p className="lunchbox-description">{detailItem.description}</p> : null}
        <p className="lunchbox-muted">{t("portal.available", { count: detailItem.available_quantity })}</p>
        <div className="lunchbox-detail-quantity"><h2>{t("portal.vipChooseQuantity")}</h2><Quantity name={detailItem.name} value={detailQuantity} max={detailItem.available_quantity} onChange={setDetailQuantity} /></div>
        <Button className="lunchbox-primary" disabled={detailQuantity < 1 || busy} onClick={() => { change(detail.menuId, detailItem.product_id, detailQuantity); setDetail(null); }}>{t("portal.vipAdd")}{showPrices ? ` ${lunchboxMoney(Number(detailItem.unit_price) * detailQuantity)}` : ""}</Button>
      </div>
    </> : <>
      <h1 className="sr-only" tabIndex={-1} ref={topRef}>{t("portal.vip")}</h1>
      {failed ? <div className="lunchbox-state"><p role="alert">{t("portal.vipLoadFailed")}</p><Button onClick={() => void load()}>{t("portal.retry")}</Button></div>
        : !list.length ? <div className="lunchbox-empty"><img src={lunchboxArtwork} alt="" /><h2>{t("portal.noVip")}</h2><p>{t("portal.vipIntro")}</p></div>
          : !cycle ? null : <>
            <LunchboxNotice cutoff={cutoffParts(cycle.cutoff_at, i18n.language)} />
            {list.length > 1 ? <label className="lunchbox-menu-select">{t("portal.chooseVip")}<select value={cycle.id} disabled={busy} onChange={event => { setCycleId(event.target.value); setQuantities({}); setCheckout(false); requestId.current = null; }}>{list.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
            {checkout ? <div className="lunchbox-checkout">
              <button className="lunchbox-back" type="button" disabled={busy} onClick={() => setCheckout(false)}><ArrowLeft size={18} />{t("portal.vipBack")}</button>
              <h2>{t("portal.vipConfirm")}</h2>
              {selectedDays.map(day => <div className="vip-day" key={day.menu.id}>
                <div className="lunchbox-section-heading"><h3>{day.menu.name}</h3><span>{day.menu.delivery_date}</span></div>
                {day.items.map(item => <div className="lunchbox-review-row" key={item.product_id}><span>{item.name} × {quantityOf(day.menu.id, item)}</span>{showPrices ? <strong>{lunchboxMoney(Number(item.unit_price) * quantityOf(day.menu.id, item))}</strong> : null}</div>)}
              </div>)}
              <label>{t("portal.addresses")}<select value={resolvedAddress} disabled={busy} onChange={event => { requestId.current = null; setAddressId(event.target.value); }}><option value="">{t("portal.chooseAddress")}</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.address}</option>)}</select></label>
              {!addresses.length ? <Button variant="outline" onClick={() => setPage("addresses")}>{t("portal.addAddress")}</Button> : null}
              {showPrices ? <div className="lunchbox-review-row"><strong>{t("portal.payable")}</strong><strong>{lunchboxMoney(food)}</strong></div> : null}
              <p className="lunchbox-muted">{t("portal.vipIntro")}</p>
              <Button className="lunchbox-primary" disabled={busy || !days.length || !addresses.some(address => address.id === resolvedAddress)} onClick={() => {
                requestId.current ??= crypto.randomUUID();
                void run(async () => {
                  await submitVipCycle(requestId.current!, cycle.id, resolvedAddress, days);
                  requestId.current = null;
                  setQuantities({});
                  setCheckout(false);
                  setCycles(await fetchVipCatalog());
                  await refresh();
                  setPage("orders");
                }, t("portal.vipSubmitted"));
              }}>{busy ? t("portal.submitting") : t("portal.submitVip", { count: days.length })}</Button>
            </div> : <>
              <div className="lunchbox-section-heading"><h2>{t("portal.vipAvailable")}</h2><span>{cycle.name}</span></div>
              {cycle.menus.map(menu => <div className="vip-day" key={menu.id}>
                <div className="lunchbox-section-heading"><h3>{menu.name}</h3><span>{menu.delivery_date}{menu.delivery_time ? ` · ${menu.delivery_time}` : ""}</span></div>
                {menu.items.length ? <div className="lunchbox-grid">{menu.items.map(item => <article className="lunchbox-card" key={item.product_id}>
                  <button className="lunchbox-card-open" type="button" onClick={() => { setDetailQuantity(quantityOf(menu.id, item) || Math.min(1, item.available_quantity)); setDetail({ menuId: menu.id, productId: item.product_id }); }}>
                    <FoodImage item={item} /><h3>{item.name}</h3>{item.description ? <p>{item.description}</p> : null}
                  </button>
                  <div className="lunchbox-card-bottom">
                    <strong>{showPrices ? lunchboxMoney(Number(item.unit_price)) : t("portal.available", { count: item.available_quantity })}</strong>
                    <Quantity name={`${menu.delivery_date} ${item.name}`} value={quantityOf(menu.id, item)} max={item.available_quantity} onChange={value => change(menu.id, item.product_id, value)} />
                  </div>
                </article>)}</div> : <p className="lunchbox-state">{t("portal.noMenus")}</p>}
              </div>)}
              <div className="lunchbox-cart"><div className="lunchbox-cart-summary"><span className="lunchbox-cart-icon" aria-hidden="true"><ShoppingCart size={22} /><b className="lunchbox-cart-badge">{count}</b></span><div className="lunchbox-cart-copy" aria-live="polite"><span>{t("portal.vipSelected", { count })}</span>{showPrices ? <strong>{lunchboxMoney(food)}</strong> : null}</div></div><Button disabled={busy || !days.length} onClick={() => setCheckout(true)}>{t("portal.vipNext")}</Button></div>
            </>}
          </>}
    </>}
  </section>;
}
