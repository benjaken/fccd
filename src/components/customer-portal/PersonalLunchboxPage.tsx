import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePersonalWorkspace } from "@/components/customer-portal/CustomerPersonalWorkspace";
import { fetchLunchboxCatalog, submitLunchbox, type LunchboxCatalog } from "@/lib/customer-lunchbox";

const money = (value: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(value);

export function PersonalLunchboxPage() {
  const { t } = useTranslation();
  const { data, busy, run } = usePersonalWorkspace();
  const [catalog, setCatalog] = useState<LunchboxCatalog | null>(null);
  const [menuId, setMenuId] = useState("");
  const [addressId, setAddressId] = useState(data?.addresses.find(address => address.is_default)?.id || data?.addresses[0]?.id || "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const requestId = useRef<string | null>(null);
  useEffect(() => { void fetchLunchboxCatalog().then(setCatalog).catch(() => setCatalog({ menus: [], orders: [] })); }, []);
  const menu = catalog?.menus.find(item => item.id === menuId) || catalog?.menus[0];
  const items = menu ? Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([product_id, quantity]) => ({ product_id, quantity })) : [];
  const food = menu ? menu.items.reduce((sum, item) => sum + Number(item.unit_price) * (quantities[item.product_id] || 0), 0) : 0;
  return <section>
    <h1>{t("personal.lunchbox")}</h1>
    <p>{t("personal.lunchboxIntro")}</p>
    {catalog?.orders.map(order => <p key={order.id}>{order.number || t("personal.awaitingNumber")} · {order.stage === "quote" ? t("personal.awaitingConfirmation") : t("personal.confirmedOrder")}</p>)}
    {!catalog?.menus.length ? <p className="personal-empty">{t("personal.noLunchbox")}</p> : null}
    {catalog && catalog.menus.length > 1 ? <label>{t("personal.chooseLunchbox")}<select value={menu?.id || ""} onChange={event => { setMenuId(event.target.value); setQuantities({}); requestId.current = null; }}>
      {catalog.menus.map(item => <option key={item.id} value={item.id}>{item.brand} · {item.name} · {item.delivery_date}</option>)}
    </select></label> : null}
    {menu ? <>
      <p>{menu.brand} · {menu.delivery_date} · {menu.delivery_time}</p>
      {menu.items.map(item => <div className="portal-row" key={item.product_id}>
        <label><strong>{item.name}</strong><span>{money(Number(item.unit_price))} · {t("personal.available", { count: item.available_quantity })}</span></label>
        <input aria-label={t("personal.quantityLabel", { name: item.name })} type="number" min={0} max={item.available_quantity} step={1} value={quantities[item.product_id] || 0} onChange={event => { requestId.current = null; setQuantities({ ...quantities, [item.product_id]: Number(event.target.value) }); }} />
      </div>)}
      <label>{t("personal.addresses")}<select value={addressId} onChange={event => { requestId.current = null; setAddressId(event.target.value); }}>
        <option value="">{t("personal.chooseAddress")}</option>
        {data?.addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.address}</option>)}
      </select></label>
      {!data?.addresses.length ? <Button variant="outline" asChild><Link to="/customer/personal/addresses">{t("personal.addAddress")}</Link></Button> : null}
      <p>{t("personal.shipping")}: {money(Number(menu.shipping_fee))}</p>
      <strong>{t("personal.payable")}: {money(food + Number(menu.shipping_fee))}</strong>
      <Button disabled={busy || !items.length || !addressId || items.some(item => !Number.isInteger(item.quantity) || item.quantity > (menu.items.find(row => row.product_id === item.product_id)?.available_quantity || 0))} onClick={() => {
        requestId.current ??= crypto.randomUUID();
        void run(async () => { await submitLunchbox(requestId.current!, menu.id, addressId, items); requestId.current = null; setQuantities({}); setCatalog(await fetchLunchboxCatalog()); }, t("personal.lunchboxSubmitted"));
      }}>{busy ? t("personal.submitting") : t("personal.submitLunchbox")}</Button>
    </> : null}
  </section>;
}
