import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  PackagePlus,
  Save,
  Settings2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { fetchShopCatalog, type ShopCatalogItem } from "@/lib/shop-orders";
import { hongKongDateInputValue } from "@/lib/raw-meat-inventory";
import {
  fetchInventoryShortageNotificationControl,
  fetchShopShipments,
  fetchShopWarehouseReceipts,
  recordShopWarehouseReceipt,
  setInventoryShortageNotificationsEnabled,
  setShopCatalogMinimumStock,
  type ShopShipment,
  type ShopStockWarning,
  type ShopWarehouseReceipt,
} from "@/lib/shop-warehouse";

function warningLabel(t: (key: string) => string, warning: ShopStockWarning) {
  if (warning === "ok") return t("shopWarehouse.warningOk");
  if (warning === "low") return t("shopWarehouse.warningLow");
  if (warning === "missing") return t("shopWarehouse.warningMissing");
  return t("shopWarehouse.warningUnmapped");
}

function StockBadge({ warning }: { warning: ShopStockWarning }) {
  const { t } = useTranslation();
  const Icon = warning === "ok" ? CheckCircle2 : warning === "low" ? TriangleAlert : AlertCircle;
  return (
    <span className="inventory-stock-badge" data-tone={warning}>
      <Icon aria-hidden="true" />
      {warningLabel(t, warning)}
    </span>
  );
}

function Feedback({ tone, children }: { tone: "success" | "error" | "warning"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : AlertCircle;
  return <div className={`inventory-feedback ${tone}`} role={tone === "error" ? "alert" : "status"}><Icon aria-hidden="true" /><span>{children}</span></div>;
}

export function FactoryWarehouseShipmentsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopShipment[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ShopShipment | null>(null);

  useEffect(() => {
    void fetchShopShipments().then(setRows).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  return (
    <section className="inventory-records-page">
      {error ? <Feedback tone="error">{t("shopWarehouse.loadError")}</Feedback> : null}
      {!error ? <RestaurantSettingsListTable
        loading={loading}
        loadingLabel={t("shopOrdering.loading")}
        skeletonColumns={6}
        searchPlaceholder={t("shopOrdering.searchRequests")}
        emptyTitle={t("shopWarehouse.emptyOutbound")}
        header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopWarehouse.shippedAt")}</th><th>{t("shopOrdering.columns.status")}</th><th>{t("shopWarehouse.itemCount")}</th><th><span className="sr-only">{t("shopWarehouse.viewShipment")}</span></th></tr>}
      >
        {rows.map((row) => <tr key={row.id}>
            <td data-label={t("shopOrdering.columns.number")}><strong>{row.shipmentNo}</strong>{row.requestNo ? <small>{row.requestNo}</small> : null}</td>
            <td data-label={t("shopOrdering.restaurant")}>{row.restaurantName ?? "—"}</td>
            <td data-label={t("shopWarehouse.shippedAt")}>{row.shippedAt.slice(0, 10)}</td>
            <td data-label={t("shopOrdering.columns.status")}><span className="inventory-status-badge">{t(`shopOrdering.status.${row.status}`, { defaultValue: row.status })}</span></td>
            <td data-label={t("shopWarehouse.itemCount")}><b>{row.lines.length}</b></td>
            <td data-label={t("shopWarehouse.viewShipment")} className="inventory-table-action"><Button variant="outline" size="sm" onClick={() => setSelected(row)}><Eye aria-hidden="true" />{t("shopWarehouse.viewShipment")}</Button></td>
          </tr>)}
      </RestaurantSettingsListTable> : null}
      <SidePanel open={selected != null} title={selected?.shipmentNo ?? ""} description={t("shopWarehouse.shipmentDetailsDescription")} closeLabel={t("common.close")} onClose={() => setSelected(null)} className="inventory-shipment-panel" wide>
        {selected ? <div className="inventory-shipment-detail">
          <dl className="inventory-detail-summary">
            <div><dt>{t("shopWarehouse.requestNumber")}</dt><dd>{selected.requestNo ?? "—"}</dd></div>
            <div><dt>{t("shopOrdering.restaurant")}</dt><dd>{selected.restaurantName ?? "—"}</dd></div>
            <div><dt>{t("shopWarehouse.shippedAt")}</dt><dd>{selected.shippedAt.slice(0, 10)}</dd></div>
            <div><dt>{t("shopOrdering.columns.status")}</dt><dd><span className="inventory-status-badge">{t(`shopOrdering.status.${selected.status}`, { defaultValue: selected.status })}</span></dd></div>
          </dl>
          <div className="inventory-table-wrap"><table className="inventory-table inventory-delivery-note-lines">
            <thead><tr><th>{t("shopOrdering.quantity")}</th><th>{t("shopOrdering.item")}</th></tr></thead>
            <tbody>{selected.lines.map((line) => <tr key={line.id}>
              <td><strong>{line.shippedQuantity}</strong></td>
              <td>{line.name}</td>
            </tr>)}</tbody>
          </table></div>
        </div> : null}
      </SidePanel>
    </section>
  );
}

export function FactoryWarehouseReceiptsPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [rows, setRows] = useState<ShopWarehouseReceipt[]>([]);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [receiptDate, setReceiptDate] = useState(hongKongDateInputValue);
  const [sourceName, setSourceName] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [receiptPanelOpen, setReceiptPanelOpen] = useState(false);
  const [minimumPanelOpen, setMinimumPanelOpen] = useState(false);
  const [minimumDrafts, setMinimumDrafts] = useState<Record<string, string>>({});
  const [minimumSavingId, setMinimumSavingId] = useState<string | null>(null);
  const [shortageNotificationsEnabled, setShortageNotificationsEnabled] = useState(false);
  const [shortageNotificationsLoading, setShortageNotificationsLoading] = useState(false);
  const [shortageNotificationsSaving, setShortageNotificationsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const items = useMemo(() => catalog.filter((item) => item.channel === "fc_internal" && item.warehouse), [catalog]);
  const receiptItems = useMemo(() => items.filter((item) => item.warehouse === "dry"), [items]);
  const selected = receiptItems.find((item) => item.id === itemId) ?? null;

  useEffect(() => {
    void Promise.all([fetchShopCatalog(), fetchShopWarehouseReceipts()])
      .then(([catalogRows, receiptRows]) => { setCatalog(catalogRows); setRows(receiptRows); })
      .catch(() => setLoadError(t("shopWarehouse.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const save = async () => {
    if (!selected) { setError(t("shopWarehouse.needItem")); return; }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setError(t("shopWarehouse.qtyInvalid")); return; }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await recordShopWarehouseReceipt({ catalogItem: selected, quantity: qty, receiptDate, sourceName, batchNo, idempotencyKey });
      setMessage(result.replayed ? t("shopWarehouse.receiptReplayed", { number: result.receiptNo }) : t("shopWarehouse.receiptSaved", { number: result.receiptNo }));
      setIdempotencyKey(crypto.randomUUID());
      setQuantity("");
      setBatchNo("");
      setRows(await fetchShopWarehouseReceipts());
      setReceiptPanelOpen(false);
    } catch {
      setError(t("shopWarehouse.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const openMinimums = () => {
    setMinimumDrafts(Object.fromEntries(items.map((item) => [item.id, item.minimumStockLevel == null ? "" : String(item.minimumStockLevel)])));
    setError("");
    setMinimumPanelOpen(true);
    setShortageNotificationsLoading(true);
    void fetchInventoryShortageNotificationControl()
      .then((control) => setShortageNotificationsEnabled(control.enabled))
      .catch(() => setError(t("shopWarehouse.shortageNotificationsLoadError")))
      .finally(() => setShortageNotificationsLoading(false));
  };

  const toggleShortageNotifications = async (enabled: boolean) => {
    setShortageNotificationsSaving(true);
    setError("");
    try {
      const saved = await setInventoryShortageNotificationsEnabled(enabled);
      setShortageNotificationsEnabled(saved);
      setMessage(t(saved
        ? "shopWarehouse.shortageNotificationsEnabledMessage"
        : "shopWarehouse.shortageNotificationsDisabledMessage"));
    } catch {
      setError(t("shopWarehouse.shortageNotificationsSaveError"));
    } finally {
      setShortageNotificationsSaving(false);
    }
  };

  const saveMinimum = async (item: ShopCatalogItem) => {
    const value = Number(minimumDrafts[item.id]);
    if (!Number.isFinite(value) || value < 0) {
      setError(t("shopWarehouse.minimumInvalid"));
      return;
    }
    setMinimumSavingId(item.id);
    setError("");
    try {
      const saved = await setShopCatalogMinimumStock(item.id, value);
      setCatalog((current) => current.map((row) => row.id === item.id ? { ...row, minimumStockLevel: saved } : row));
      setMessage(t("shopWarehouse.minimumSaved", { name: item.name }));
    } catch {
      setError(t("shopWarehouse.minimumSaveError"));
    } finally {
      setMinimumSavingId(null);
    }
  };

  return (
    <section className="inventory-records-page">
      {message ? <Feedback tone="success">{message}</Feedback> : null}
      {loadError ? <Feedback tone="error">{loadError}</Feedback> : null}
      {!loadError ? <RestaurantSettingsListTable
        loading={loading}
        loadingLabel={t("shopOrdering.loading")}
        skeletonColumns={6}
        emptyTitle={t("shopWarehouse.historyTitle")}
        toolbarAction={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openMinimums}><Settings2 aria-hidden="true" />{t("shopWarehouse.minimumSettings")}</Button><Button onClick={() => { setError(""); setReceiptPanelOpen(true); }}><PackagePlus aria-hidden="true" />{t("shopWarehouse.receiptFormTitle")}</Button></div>}
        header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopWarehouse.receiptDate")}</th><th>{t("shopOrdering.item")}</th><th>{t("shopOrdering.quantity")}</th><th>{t("shopWarehouse.source")}</th><th>{t("shopWarehouse.batch")}</th></tr>}
      >
        {rows.map((row) => <tr key={row.id}>
          <td data-label={t("shopOrdering.columns.number")}><strong>{row.receiptNo}</strong></td>
          <td data-label={t("shopWarehouse.receiptDate")}>{row.receiptDate}</td>
          <td data-label={t("shopOrdering.item")}><strong>{row.name}</strong><small>{row.sku ? `${row.sku} · ` : ""}{row.unit}</small></td>
          <td data-label={t("shopOrdering.quantity")}><b>{row.quantity}</b></td>
          <td data-label={t("shopWarehouse.source")}>{row.sourceName ?? "—"}</td>
          <td data-label={t("shopWarehouse.batch")}>{row.batchNo ?? "—"}</td>
        </tr>)}
      </RestaurantSettingsListTable> : null}
      <SidePanel
        open={receiptPanelOpen}
        title={t("shopWarehouse.receiptFormTitle")}
        description={t("shopWarehouse.receiptFormDescription")}
        closeLabel={t("common.close")}
        onClose={() => setReceiptPanelOpen(false)}
        className="inventory-receipt-panel"
        footer={<div className="inventory-receipt-panel-actions"><Button variant="outline" onClick={() => setReceiptPanelOpen(false)}>{t("common.cancel")}</Button><Button disabled={saving || loading} onClick={() => void save()}><PackagePlus aria-hidden="true" />{t("shopWarehouse.saveReceipt")}</Button></div>}
      >
        {error ? <Feedback tone="error">{error}</Feedback> : null}
        <div className="inventory-receipt-form">
          <label className="inventory-field inventory-field-wide"><span>{t("shopOrdering.item")}</span><FilterableSelect aria-label={t("shopOrdering.item")} value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">{t("shopWarehouse.itemPlaceholder")}</option>{receiptItems.map((item) => <option key={item.id} value={item.id}>{item.supplierName} · {item.name} ({item.unit})</option>)}</FilterableSelect></label>
          <label className="inventory-field"><span>{t("shopOrdering.quantity")}</span><input type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label className="inventory-field"><span>{t("shopWarehouse.receiptDate")}</span><input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></label>
          <label className="inventory-field"><span>{t("shopWarehouse.source")}</span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></label>
          <label className="inventory-field"><span>{t("shopWarehouse.batch")}</span><input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} /></label>
        </div>
      </SidePanel>
      <SidePanel
        open={minimumPanelOpen}
        title={t("shopWarehouse.minimumSettings")}
        description={t("shopWarehouse.minimumDescription")}
        closeLabel={t("common.close")}
        onClose={() => setMinimumPanelOpen(false)}
        className="inventory-receipt-panel"
        half
      >
        {error ? <Feedback tone="error">{error}</Feedback> : null}
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <strong className="block text-sm text-slate-900">{t("shopWarehouse.shortageNotificationsTitle")}</strong>
            <p className="mt-1 text-sm text-slate-600">{t("shopWarehouse.shortageNotificationsDescription")}</p>
            <span className="mt-2 inline-block text-xs font-medium text-amber-800">
              {t(shortageNotificationsEnabled
                ? "shopWarehouse.shortageNotificationsOn"
                : "shopWarehouse.shortageNotificationsOff")}
            </span>
          </div>
          <Switch
            checked={shortageNotificationsEnabled}
            disabled={shortageNotificationsLoading || shortageNotificationsSaving}
            aria-label={t("shopWarehouse.shortageNotificationsTitle")}
            onCheckedChange={(checked) => void toggleShortageNotifications(checked)}
          />
        </div>
        <div className="overflow-x-hidden rounded-xl border border-slate-200">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup><col className="w-[52%]" /><col className="w-[30%]" /><col className="w-[18%]" /></colgroup>
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">{t("shopOrdering.item")}</th><th className="px-4 py-3">{t("shopWarehouse.minimumStock")}</th><th className="px-4 py-3"><span className="sr-only">{t("common.save")}</span></th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} className="border-t border-slate-100">
              <td className="px-4 py-3 whitespace-normal"><strong className="block break-words text-slate-900">{item.name}</strong><span className="break-words text-slate-500">{item.sku || t("common.notSet")} · {item.unit}</span></td>
              <td className="px-4 py-3"><label className="flex min-w-0 items-center gap-2"><span className="sr-only">{t("shopWarehouse.minimumStockFor", { name: item.name })}</span><input className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" type="number" min="0" step="0.001" value={minimumDrafts[item.id] ?? ""} onChange={(event) => setMinimumDrafts((current) => ({ ...current, [item.id]: event.target.value }))} /><span className="shrink-0 text-slate-500">{item.unit}</span></label></td>
              <td className="px-4 py-3 text-right"><Button size="sm" disabled={minimumSavingId === item.id} onClick={() => void saveMinimum(item)}><Save aria-hidden="true" />{t("common.save")}</Button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </SidePanel>
    </section>
  );
}
