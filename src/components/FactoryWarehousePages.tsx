import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  PackageOpen,
  PackagePlus,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { SidePanel } from "@/components/ui/side-panel";
import { fetchShopCatalog, type ShopCatalogItem } from "@/lib/shop-orders";
import { hongKongDateInputValue } from "@/lib/raw-meat-inventory";
import {
  fetchShopShipments,
  fetchShopWarehouseReceipts,
  recordShopWarehouseReceipt,
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

function PageHeading({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <header className="page-heading ingredients-heading inventory-page-heading">
      <div>
        <span className="eyebrow">{t("shopWarehouse.title")}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </header>
  );
}

function Feedback({ tone, children }: { tone: "success" | "error" | "warning"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : AlertCircle;
  return <div className={`inventory-feedback ${tone}`} role={tone === "error" ? "alert" : "status"}><Icon aria-hidden="true" /><span>{children}</span></div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="inventory-empty-state"><PackageOpen aria-hidden="true" /><strong>{children}</strong></div>;
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
    <section className="ingredients-page inventory-records-page">
      <PageHeading title={t("shopWarehouse.outboundTitle")} description={t("shopWarehouse.outboundDescription")} />
      <article className="panel ingredients-panel inventory-records-panel">
        {error ? <Feedback tone="error">{t("shopWarehouse.loadError")}</Feedback> : null}
        {loading ? <div className="inventory-loading">{t("shopOrdering.loading")}</div> : null}
        {!loading && rows.length === 0 && !error ? <EmptyState>{t("shopWarehouse.emptyOutbound")}</EmptyState> : null}
        {rows.length ? <div className="inventory-table-wrap"><table className="inventory-table inventory-history-table">
          <thead><tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopWarehouse.shippedAt")}</th><th>{t("shopOrdering.columns.status")}</th><th>{t("shopWarehouse.itemCount")}</th><th><span className="sr-only">{t("shopWarehouse.viewShipment")}</span></th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td data-label={t("shopOrdering.columns.number")}><strong>{row.shipmentNo}</strong>{row.requestNo ? <small>{row.requestNo}</small> : null}</td>
            <td data-label={t("shopOrdering.restaurant")}>{row.restaurantName ?? "—"}</td>
            <td data-label={t("shopWarehouse.shippedAt")}>{row.shippedAt.slice(0, 10)}</td>
            <td data-label={t("shopOrdering.columns.status")}><span className="inventory-status-badge">{t(`shopOrdering.status.${row.status}`, { defaultValue: row.status })}</span></td>
            <td data-label={t("shopWarehouse.itemCount")}><b>{row.lines.length}</b></td>
            <td data-label={t("shopWarehouse.viewShipment")} className="inventory-table-action"><Button variant="outline" size="sm" onClick={() => setSelected(row)}><Eye aria-hidden="true" />{t("shopWarehouse.viewShipment")}</Button></td>
          </tr>)}</tbody>
        </table></div> : null}
      </article>
      <SidePanel open={selected != null} title={selected?.shipmentNo ?? ""} description={t("shopWarehouse.shipmentDetailsDescription")} closeLabel={t("common.close")} onClose={() => setSelected(null)} wide>
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
  const [loading, setLoading] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const items = useMemo(() => catalog.filter((item) => item.channel === "fc_internal" && item.warehouse), [catalog]);
  const selected = items.find((item) => item.id === itemId) ?? null;

  useEffect(() => {
    void Promise.all([fetchShopCatalog(), fetchShopWarehouseReceipts()])
      .then(([catalogRows, receiptRows]) => { setCatalog(catalogRows); setRows(receiptRows); })
      .catch(() => setError(t("shopWarehouse.loadError")))
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
    } catch {
      setError(t("shopWarehouse.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ingredients-page inventory-records-page">
      <PageHeading title={t("shopWarehouse.inboundTitle")} description={t("shopWarehouse.inboundDescription")} />
      {message ? <Feedback tone="success">{message}</Feedback> : null}
      {error ? <Feedback tone="error">{error}</Feedback> : null}
      <article className="panel inventory-receipt-form-card">
        <header><span className="inventory-section-icon"><PackagePlus aria-hidden="true" /></span><div><h2>{t("shopWarehouse.receiptFormTitle")}</h2><p>{t("shopWarehouse.receiptFormDescription")}</p></div></header>
        <div className="inventory-receipt-form">
          <label className="inventory-field inventory-field-wide"><span>{t("shopOrdering.item")}</span><FilterableSelect aria-label={t("shopOrdering.item")} value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">{t("shopWarehouse.itemPlaceholder")}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.supplierName} · {item.name} ({item.unit})</option>)}</FilterableSelect></label>
          <label className="inventory-field"><span>{t("shopOrdering.quantity")}</span><input type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label className="inventory-field"><span>{t("shopWarehouse.receiptDate")}</span><input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></label>
          <label className="inventory-field"><span>{t("shopWarehouse.source")}</span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></label>
          <label className="inventory-field"><span>{t("shopWarehouse.batch")}</span><input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} /></label>
          <div className="inventory-form-action"><Button disabled={saving || loading} onClick={() => void save()}><PackagePlus aria-hidden="true" />{t("shopWarehouse.saveReceipt")}</Button></div>
        </div>
      </article>
      <article className="panel ingredients-panel inventory-records-panel">
        <header className="inventory-section-heading"><h2>{t("shopWarehouse.historyTitle")}</h2><span>{rows.length}</span></header>
        {loading ? <div className="inventory-loading">{t("shopOrdering.loading")}</div> : null}
        {!loading && rows.length === 0 && !error ? <EmptyState>{t("shopWarehouse.historyTitle")}</EmptyState> : null}
        {rows.length ? <div className="inventory-table-wrap"><table className="inventory-table inventory-history-table">
          <thead><tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopWarehouse.receiptDate")}</th><th>{t("shopOrdering.item")}</th><th>{t("shopOrdering.quantity")}</th><th>{t("shopWarehouse.source")}</th><th>{t("shopWarehouse.batch")}</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td data-label={t("shopOrdering.columns.number")}><strong>{row.receiptNo}</strong></td>
            <td data-label={t("shopWarehouse.receiptDate")}>{row.receiptDate}</td>
            <td data-label={t("shopOrdering.item")}><strong>{row.name}</strong><small>{row.sku ? `${row.sku} · ` : ""}{row.unit}</small></td>
            <td data-label={t("shopOrdering.quantity")}><b>{row.quantity}</b></td>
            <td data-label={t("shopWarehouse.source")}>{row.sourceName ?? "—"}</td>
            <td data-label={t("shopWarehouse.batch")}>{row.batchNo ?? "—"}</td>
          </tr>)}</tbody>
        </table></div> : null}
      </article>
    </section>
  );
}
