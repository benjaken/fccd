import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, UtensilsCrossed } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { CornerNotice } from "@/components/ui/corner-notice";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { listPortalOpsChannels, listPortalOpsProducts, type OpsChannel, type OpsProduct } from "@/lib/customer-portal-ops";
import { listLunchboxes, listVipCycles, replaceLunchboxItems, setVipCycleMenus, upsertLunchbox, upsertVipCycle, type LunchboxOpsMenu, type VipCycle } from "@/lib/customer-lunchbox-ops";
import "@/components/customer-portal.css";
import "./customer-portal-reward-catalog.css";
import "./customer-lunchbox.css";
import "@/lib/customer-portal-i18n";

type ItemDraft = { product_id: string; unit_price: string; available_quantity: string };

function localInput(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatCutoff(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function CustomerPortalLunchboxPage() {
  const { t } = useTranslation();
  const canEdit = useCurrentPageAccess().canAccess("settings.customer_portal.edit");
  const [menus, setMenus] = useState<LunchboxOpsMenu[]>([]);
  const [channels, setChannels] = useState<OpsChannel[]>([]);
  const [products, setProducts] = useState<OpsProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
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
    setLoading(true);
    try {
      const [rows, brands, vipCycles] = await Promise.all([listLunchboxes(), listPortalOpsChannels(), listVipCycles()]);
      setMenus(rows ?? []);
      setChannels(brands ?? []);
      setCycles(vipCycles ?? []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      setError(t("lunchboxOps.operationFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!channelId) { setProducts([]); return; }
    void listPortalOpsProducts(channelId).then(setProducts).catch(() => setError(t("lunchboxOps.operationFailed")));
  }, [channelId, t]);

  function startCreate() {
    setError(""); setNotice("");
    setEditing(null); setName(""); setChannelId(channels[0]?.id ?? ""); setDeliveryDate(""); setDeliveryTime("12:00");
    setCutoffAt(localInput(new Date())); setShippingFee("0"); setActive(true); setItems([]); setOpen(true);
  }
  function startEdit(menu: LunchboxOpsMenu) {
    setError(""); setNotice("");
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
    setSaving(true);
    try {
      const id = await upsertLunchbox({
        id: editing, channelId, name: name.trim(), deliveryDate, deliveryTime: deliveryTime.trim(),
        cutoffAt: cutoff.toISOString(), shippingFee: fee, isActive: active,
      });
      await replaceLunchboxItems(id, parsed);
      setOpen(false); setNotice(t("lunchboxOps.saved")); await load();
    } catch {
      setError(t("lunchboxOps.operationFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function publishCycle(event: FormEvent) {
    event.preventDefault();
    const cutoff = new Date(cycleCutoff);
    if (!cycleName.trim() || Number.isNaN(cutoff.getTime()) || cycleMenus.length === 0) {
      setError(t("lunchboxOps.vipInvalid"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const id = await upsertVipCycle({ name: cycleName.trim(), cutoffAt: cutoff.toISOString(), isActive: true });
      await setVipCycleMenus(id, cycleMenus);
      setCycleName("");
      setCycleMenus([]);
      setNotice(t("lunchboxOps.vipSaved"));
      setCycleOpen(false);
      await load();
    } catch {
      setError(t("lunchboxOps.failed"));
    } finally {
      setSaving(false);
    }
  }

  const activeMenus = menus.filter(menu => menu.is_active);

  return (
    <section className="orders-page reward-admin lunchbox-ops-page customer-portal-ops">
      <div className="portal-ops-list-intro">
        <h2 className="sr-only">{t("lunchboxOps.listTitle")}</h2>
        <header className="page-heading">
          <div className="reward-admin-actions">
            {canEdit ? <Button type="button" onClick={startCreate}>{t("lunchboxOps.create")}</Button> : null}
            {canEdit ? <Button type="button" variant="outline" onClick={() => setCycleOpen(true)}>{t("lunchboxOps.vipTitle")}</Button> : null}
          </div>
        </header>
        {error && !loadFailed ? <p className="reward-admin-error" role="alert">{error}</p> : null}
      </div>
      {notice ? <CornerNotice message={notice} onDismiss={() => setNotice("")} /> : null}

      <article className="panel orders-panel orders-panel-no-toolbar">
        {loadFailed ? (
          <div className="orders-state orders-state-error" role="alert">
            <UtensilsCrossed />
            <div><strong>{error}</strong></div>
            <Button variant="outline" onClick={() => void load()}><RefreshCw />{t("portal.retry")}</Button>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            loading={loading && !menus.length}
            loadingLabel={t("lunchboxOps.loading")}
            skeletonColumns={6}
            skeletonRows={8}
            onRefresh={load}
            header={<tr>
              <th>{t("lunchboxOps.name")}</th>
              <th>{t("lunchboxOps.brand")}</th>
              <th>{t("lunchboxOps.delivery")}</th>
              <th>{t("lunchboxOps.items")}</th>
              <th>{t("lunchboxOps.status")}</th>
              <th className="table-actions-cell">{t("orders.columns.actions")}</th>
            </tr>}
          >
            {menus.map(menu => (
              <tr key={menu.id}>
                <td><div className="reward-admin-table-name">{menu.name}</div></td>
                <td>{menu.brand}</td>
                <td>{menu.delivery_date} {menu.delivery_time}</td>
                <td>{menu.items.length}</td>
                <td>{menu.is_active ? t("lunchboxOps.active") : t("lunchboxOps.inactive")}</td>
                <td className="table-actions-cell">
                  {canEdit ? (
                    <div className="order-row-actions quote-row-actions">
                      <button type="button" onClick={() => startEdit(menu)} aria-label={t("lunchboxOps.editAction")} title={t("lunchboxOps.editAction")}>
                        <Pencil aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!menus.length ? <tr><td colSpan={6}>{t("lunchboxOps.empty")}</td></tr> : null}
          </ListTable>
        )}
        <TablePagination
          summary={loading || loadFailed ? "" : t("settings.pagination", { from: menus.length ? 1 : 0, to: menus.length, total: menus.length })}
          page={1}
          totalPages={1}
          loading={loading && !menus.length}
          onPrevious={() => undefined}
          onNext={() => undefined}
          onPageChange={() => undefined}
          previousLabel={t("settings.previous")}
          nextLabel={t("settings.next")}
          pageLabel={t("orders.pageOf")}
          jumpLabel={t("orders.jumpToPage")}
        />
      </article>

      {canEdit ? (
        <SidePanel className="lunchbox-cycle-panel" open={cycleOpen} onClose={() => { if (!saving) setCycleOpen(false); }} title={t("lunchboxOps.vipTitle")} description={t("lunchboxOps.vipIntro")} closeLabel={t("lunchboxOps.close")} footer={<Button type="submit" form="vip-cycle-form" disabled={saving} aria-busy={saving}>{t("lunchboxOps.vipSave")}</Button>}>
          {error ? <p className="portal-ops-alert" role="alert">{error}</p> : null}
          <form id="vip-cycle-form" className="portal-ops-form" onSubmit={event => void publishCycle(event)}>
            {cycles.length ? (
              <ul className="portal-ops-cycles">
                {cycles.map(cycle => (
                  <li key={cycle.id}>
                    <strong>{cycle.name}</strong>
                    <span>{formatCutoff(cycle.cutoff_at)} · {t("lunchboxOps.vipDays", { count: cycle.menu_ids.length })}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="portal-ops-fields">
              <label htmlFor="vip-cycle-name">
                {t("lunchboxOps.vipName")}
                <Input id="vip-cycle-name" value={cycleName} onChange={event => setCycleName(event.target.value)} />
              </label>
              <label htmlFor="vip-cycle-cutoff">
                {t("lunchboxOps.cutoff")}
                <Input id="vip-cycle-cutoff" type="datetime-local" value={cycleCutoff} onChange={event => setCycleCutoff(event.target.value)} />
              </label>
            </div>
            <fieldset className="lunchbox-form-section portal-ops-menu-picker">
              <legend>{t("lunchboxOps.selectMenus")}</legend>
              {activeMenus.length ? activeMenus.map(menu => (
                <label className="portal-ops-check" key={menu.id}>
                  <input
                    type="checkbox"
                    checked={cycleMenus.includes(menu.id)}
                    onChange={() => setCycleMenus(current => current.includes(menu.id) ? current.filter(id => id !== menu.id) : [...current, menu.id])}
                  />
                  <span>{menu.delivery_date} · {menu.name}</span>
                </label>
              )) : <p>{t("lunchboxOps.vipNoMenus")}</p>}
            </fieldset>
          </form>
        </SidePanel>
      ) : null}

      <SidePanel half className="lunchbox-editor-panel" open={open} onClose={() => { if (!saving) setOpen(false); }} title={editing ? t("lunchboxOps.edit") : t("lunchboxOps.create")} closeLabel={t("lunchboxOps.close")} footer={<Button type="submit" form="lunchbox-menu-form" disabled={saving} aria-busy={saving}>{t("lunchboxOps.save")}</Button>}>
        <form id="lunchbox-menu-form" className="portal-ops-form lunchbox-editor-form" onSubmit={event => void submit(event)}>
          {error ? <p className="portal-ops-alert" role="alert">{error}</p> : null}
          <fieldset className="lunchbox-form-section"><legend>{t("lunchboxOps.menuDetails")}</legend>
          <div className="lunchbox-details-grid">
          <label htmlFor="lunchbox-name">
            {t("lunchboxOps.name")}
            <Input id="lunchbox-name" value={name} onChange={event => setName(event.target.value)} required />
          </label>
          <label htmlFor="lunchbox-brand">
            {t("lunchboxOps.brand")}
            <select id="lunchbox-brand" value={channelId} onChange={event => setChannelId(event.target.value)} required>
              <option value="">{t("lunchboxOps.chooseBrand")}</option>
              {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
          </label>
          </div></fieldset>
          <fieldset className="lunchbox-form-section"><legend>{t("lunchboxOps.deliverySettings")}</legend>
          <div className="portal-ops-period">
            <label htmlFor="lunchbox-delivery-date">
              {t("lunchboxOps.deliveryDate")}
              <Input id="lunchbox-delivery-date" type="date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} required />
            </label>
            <label htmlFor="lunchbox-delivery-time">
              {t("lunchboxOps.deliveryTime")}
              <Input id="lunchbox-delivery-time" value={deliveryTime} onChange={event => setDeliveryTime(event.target.value)} required />
            </label>
            <label htmlFor="lunchbox-cutoff">
              {t("lunchboxOps.cutoff")}
              <Input id="lunchbox-cutoff" type="datetime-local" value={cutoffAt} onChange={event => setCutoffAt(event.target.value)} required />
            </label>
            <label htmlFor="lunchbox-fee">
              {t("lunchboxOps.fee")}
              <Input id="lunchbox-fee" type="number" min={0} step="0.01" value={shippingFee} onChange={event => setShippingFee(event.target.value)} required />
            </label>
          </div>
          <label className="portal-ops-switch">
            <span>{t("lunchboxOps.active")}</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
          </fieldset>
          <fieldset className="lunchbox-form-section"><legend>{t("lunchboxOps.items")}</legend>
          {items.map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="portal-ops-item-row is-fields">
              <label>{t("lunchboxOps.product")}<select aria-label={t("lunchboxOps.product")} value={item.product_id} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, product_id: event.target.value } : row))}>
                <option value="">{t("lunchboxOps.chooseProduct")}</option>
                {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select></label>
              <label>{t("lunchboxOps.price")}<Input aria-label={t("lunchboxOps.price")} type="number" min={0} step="0.01" value={item.unit_price} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, unit_price: event.target.value } : row))} /></label>
              <label>{t("lunchboxOps.stock")}<Input aria-label={t("lunchboxOps.stock")} type="number" min={0} step={1} value={item.available_quantity} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, available_quantity: event.target.value } : row))} /></label>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setItems([...items, { product_id: "", unit_price: "", available_quantity: "1" }])}><Plus />{t("lunchboxOps.addItem")}</Button>
          </fieldset>
        </form>
      </SidePanel>
    </section>
  );
}
