import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { listPortalOpsChannels, listPortalOpsProducts, type OpsChannel, type OpsProduct } from "@/lib/customer-portal-ops";
import { listLunchboxes, listVipCycles, replaceLunchboxItems, setVipCycleMenus, upsertLunchbox, upsertVipCycle, type LunchboxOpsMenu, type VipCycle } from "@/lib/customer-lunchbox-ops";
import "@/lib/customer-portal-i18n";

type ItemDraft = { product_id: string; unit_price: string; available_quantity: string };

function localInput(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function CustomerPortalLunchboxPage() {
  const { t } = useTranslation();
  const canEdit = useCurrentPageAccess().canAccess("settings.customer_portal.edit");
  const [menus, setMenus] = useState<LunchboxOpsMenu[]>([]);
  const [channels, setChannels] = useState<OpsChannel[]>([]);
  const [products, setProducts] = useState<OpsProduct[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("12:00");
  const [cutoffAt, setCutoffAt] = useState(localInput(new Date()));
  const [shippingFee, setShippingFee] = useState("0");
  const [active, setActive] = useState(true);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [cycles, setCycles] = useState<VipCycle[]>([]);
  const [cycleName, setCycleName] = useState("");
  const [cycleCutoff, setCycleCutoff] = useState(localInput(new Date()));
  const [cycleMenus, setCycleMenus] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [rows, brands, vipCycles] = await Promise.all([listLunchboxes(), listPortalOpsChannels(), listVipCycles()]);
    setMenus(rows ?? []);
    setChannels(brands ?? []);
    setCycles(vipCycles ?? []);
  }, []);
  useEffect(() => { void load().catch(() => setError(t("lunchboxOps.operationFailed"))); }, [load, t]);
  useEffect(() => {
    if (!channelId) { setProducts([]); return; }
    void listPortalOpsProducts(channelId).then(setProducts).catch(() => setError(t("lunchboxOps.operationFailed")));
  }, [channelId, t]);

  function startCreate() {
    setEditing(null); setName(""); setChannelId(channels[0]?.id ?? ""); setDeliveryDate(""); setDeliveryTime("12:00");
    setCutoffAt(localInput(new Date())); setShippingFee("0"); setActive(true); setItems([]); setOpen(true);
  }
  function startEdit(menu: LunchboxOpsMenu) {
    setEditing(menu.id); setName(menu.name); setChannelId(menu.channel_id); setDeliveryDate(menu.delivery_date);
    setDeliveryTime(menu.delivery_time); setCutoffAt(localInput(new Date(menu.cutoff_at))); setShippingFee(String(menu.shipping_fee));
    setActive(menu.is_active);
    setItems(menu.items.map(item => ({ product_id: item.product_id, unit_price: String(item.unit_price), available_quantity: String(item.available_quantity) })));
    setOpen(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    const fee = Number(shippingFee);
    const cutoff = new Date(cutoffAt);
    if (!channelId || !name.trim() || !deliveryDate || !deliveryTime.trim() || Number.isNaN(cutoff.getTime()) || !Number.isFinite(fee) || fee < 0) {
      setError(t("lunchboxOps.invalidMenu")); return;
    }
    const parsed = items.filter(item => item.product_id).map(item => ({
      product_id: item.product_id, unit_price: Number(item.unit_price), available_quantity: Number(item.available_quantity),
    }));
    if (parsed.some(item => !Number.isFinite(item.unit_price) || item.unit_price < 0 || !Number.isInteger(item.available_quantity) || item.available_quantity < 0)) {
      setError(t("lunchboxOps.invalidItems")); return;
    }
    try {
      const id = await upsertLunchbox({
        id: editing, channelId, name: name.trim(), deliveryDate, deliveryTime: deliveryTime.trim(),
        cutoffAt: cutoff.toISOString(), shippingFee: fee, isActive: active,
      });
      await replaceLunchboxItems(id, parsed);
      setOpen(false); setNotice(t("lunchboxOps.saved")); await load();
    } catch {
      setError(t("lunchboxOps.operationFailed"));
    }
  }

  return <section className="ingredients-page customer-portal-ops">
    <header className="page-heading ingredients-heading">
      <div>
        <h1>{t("lunchboxOps.title")}</h1>
        <p>{t("lunchboxOps.description")}</p>
      </div>
      {canEdit ? <Button onClick={startCreate}>{t("lunchboxOps.create")}</Button> : null}
    </header>
    <p><Link to="/settings/customer-portal">{t("lunchboxOps.back")}</Link></p>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <table>
      <thead><tr><th>{t("lunchboxOps.name")}</th><th>{t("lunchboxOps.brand")}</th><th>{t("lunchboxOps.delivery")}</th><th>{t("lunchboxOps.items")}</th><th>{t("lunchboxOps.status")}</th></tr></thead>
      <tbody>
        {!menus.length ? <tr><td colSpan={5}>{t("lunchboxOps.empty")}</td></tr> : null}
        {menus.map(menu => <tr key={menu.id}>
          <td>{canEdit ? <button type="button" onClick={() => startEdit(menu)}>{menu.name}</button> : menu.name}</td>
          <td>{menu.brand}</td>
          <td>{menu.delivery_date} {menu.delivery_time}</td>
          <td>{menu.items.length}</td>
          <td>{menu.is_active ? t("lunchboxOps.active") : t("lunchboxOps.inactive")}</td>
        </tr>)}
      </tbody>
    </table>
    {canEdit ? <form className="portal-ops-form" onSubmit={event => {
      event.preventDefault();
      const cutoff = new Date(cycleCutoff);
      if (!cycleName.trim() || Number.isNaN(cutoff.getTime()) || cycleMenus.length === 0) { setError(t("lunchboxOps.vipInvalid")); return; }
      void (async () => {
        setError("");
        try {
          const id = await upsertVipCycle({ name: cycleName.trim(), cutoffAt: cutoff.toISOString(), isActive: true });
          await setVipCycleMenus(id, cycleMenus);
          setCycleName(""); setCycleMenus([]); setNotice(t("lunchboxOps.vipSaved"));
          await load();
        } catch { setError(t("lunchboxOps.failed")); }
      })();
    }}>
      <h2>{t("lunchboxOps.vipTitle")}</h2>
      <p>{t("lunchboxOps.vipIntro")}</p>
      {cycles.map(cycle => <p key={cycle.id}>{cycle.name} · {new Date(cycle.cutoff_at).toLocaleString()} · {t("lunchboxOps.vipDays", { count: cycle.menu_ids.length })}</p>)}
      <label>{t("lunchboxOps.vipName")}<input value={cycleName} onChange={event => setCycleName(event.target.value)} /></label>
      <label>{t("lunchboxOps.cutoff")}<input type="datetime-local" value={cycleCutoff} onChange={event => setCycleCutoff(event.target.value)} /></label>
      {menus.filter(menu => menu.is_active).map(menu => <label key={menu.id}><input type="checkbox" checked={cycleMenus.includes(menu.id)} onChange={() => setCycleMenus(current => current.includes(menu.id) ? current.filter(id => id !== menu.id) : [...current, menu.id])} /> {menu.delivery_date} · {menu.name}</label>)}
      <Button type="submit">{t("lunchboxOps.vipSave")}</Button>
    </form> : null}
    <SidePanel open={open} onClose={() => setOpen(false)} title={editing ? t("lunchboxOps.edit") : t("lunchboxOps.create")} closeLabel={t("lunchboxOps.close")}>
      <form className="portal-ops-form" onSubmit={event => void submit(event)}>
        <label>{t("lunchboxOps.name")}<input value={name} onChange={event => setName(event.target.value)} required /></label>
        <label>{t("lunchboxOps.brand")}<select value={channelId} onChange={event => setChannelId(event.target.value)} required>
          <option value="">{t("lunchboxOps.chooseBrand")}</option>
          {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
        </select></label>
        <label>{t("lunchboxOps.deliveryDate")}<input type="date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} required /></label>
        <label>{t("lunchboxOps.deliveryTime")}<input value={deliveryTime} onChange={event => setDeliveryTime(event.target.value)} required /></label>
        <label>{t("lunchboxOps.cutoff")}<input type="datetime-local" value={cutoffAt} onChange={event => setCutoffAt(event.target.value)} required /></label>
        <label>{t("lunchboxOps.fee")}<input type="number" min={0} step="0.01" value={shippingFee} onChange={event => setShippingFee(event.target.value)} required /></label>
        <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> {t("lunchboxOps.active")}</label>
        <h2>{t("lunchboxOps.items")}</h2>
        {items.map((item, index) => <div key={index} className="portal-row">
          <select aria-label={t("lunchboxOps.product")} value={item.product_id} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, product_id: event.target.value } : row))}>
            <option value="">{t("lunchboxOps.chooseProduct")}</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <input aria-label={t("lunchboxOps.price")} type="number" min={0} step="0.01" value={item.unit_price} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, unit_price: event.target.value } : row))} />
          <input aria-label={t("lunchboxOps.stock")} type="number" min={0} step={1} value={item.available_quantity} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, available_quantity: event.target.value } : row))} />
        </div>)}
        <Button type="button" variant="outline" onClick={() => setItems([...items, { product_id: "", unit_price: "", available_quantity: "1" }])}>{t("lunchboxOps.addItem")}</Button>
        <div className="portal-ops-actions"><Button type="submit">{t("lunchboxOps.save")}</Button></div>
      </form>
    </SidePanel>
  </section>;
}
