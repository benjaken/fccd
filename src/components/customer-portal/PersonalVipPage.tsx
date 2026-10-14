import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePersonalWorkspace } from "@/components/customer-portal/CustomerPersonalWorkspace";
import { fetchVipCatalog, submitVipCycle, type VipCycleCatalog } from "@/lib/customer-lunchbox";

const money = (value: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(value);

export function PersonalVipPage() {
  const { t } = useTranslation();
  const { data, busy, run } = usePersonalWorkspace();
  const [cycles, setCycles] = useState<VipCycleCatalog[] | null>(null);
  const [cycleId, setCycleId] = useState("");
  const [addressId, setAddressId] = useState(data?.addresses.find(address => address.is_default)?.id || data?.addresses[0]?.id || "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const requestId = useRef<string | null>(null);
  useEffect(() => { void fetchVipCatalog().then(setCycles).catch(() => setCycles([])); }, []);
  const cycle = cycles?.find(item => item.id === cycleId) || cycles?.[0];
  const days = (cycle?.menus ?? []).map(menu => ({
    menu_id: menu.id,
    items: menu.items.flatMap(item => {
      const quantity = quantities[`${menu.id}:${item.product_id}`] || 0;
      return quantity > 0 ? [{ product_id: item.product_id, quantity }] : [];
    }),
  })).filter(day => day.items.length > 0);
  return <section>
    <h1>{t("personal.vip")}</h1>
    <p>{t("personal.vipIntro")}</p>
    {!cycles?.length ? <p className="personal-empty">{t("personal.noVip")}</p> : null}
    {cycles && cycles.length > 1 ? <label>{t("personal.chooseVip")}<select value={cycle?.id || ""} onChange={event => { setCycleId(event.target.value); setQuantities({}); requestId.current = null; }}>
      {cycles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label> : null}
    {cycle ? <>
      <p>{t("personal.vipCutoff", { time: new Date(cycle.cutoff_at).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" }) })}</p>
      {cycle.menus.map(menu => <div key={menu.id}>
        <h2>{menu.delivery_date} · {menu.name}</h2>
        {menu.items.map(item => <div className="portal-row" key={item.product_id}>
          <label><strong>{item.name}</strong><span>{money(Number(item.unit_price))}</span></label>
          <input aria-label={t("personal.quantityLabel", { name: `${menu.delivery_date} ${item.name}` })} type="number" min={0} max={item.available_quantity} step={1} value={quantities[`${menu.id}:${item.product_id}`] || 0} onChange={event => { requestId.current = null; setQuantities({ ...quantities, [`${menu.id}:${item.product_id}`]: Number(event.target.value) }); }} />
        </div>)}
      </div>)}
      <label>{t("personal.addresses")}<select value={addressId} onChange={event => { requestId.current = null; setAddressId(event.target.value); }}>
        <option value="">{t("personal.chooseAddress")}</option>
        {data?.addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.address}</option>)}
      </select></label>
      {!data?.addresses.length ? <Button variant="outline" asChild><Link to="/customer/personal/addresses">{t("personal.addAddress")}</Link></Button> : null}
      <Button disabled={busy || !addressId || days.length === 0} onClick={() => {
        requestId.current ??= crypto.randomUUID();
        void run(async () => { await submitVipCycle(requestId.current!, cycle.id, addressId, days); requestId.current = null; setQuantities({}); setCycles(await fetchVipCatalog()); }, t("personal.vipSubmitted"));
      }}>{busy ? t("personal.submitting") : t("personal.submitVip", { count: days.length })}</Button>
    </> : null}
  </section>;
}
