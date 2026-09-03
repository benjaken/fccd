import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { fetchShopCatalog, type ShopCatalogItem, type ShopOrderRequest } from "@/lib/shop-orders";
import { hongKongDateInputValue } from "@/lib/raw-meat-inventory";
import {
  assessShopWarehouseRequest,
  canShipWithWarning,
  fetchFactoryPendingShopOrders,
  fetchShopShipments,
  fetchShopWarehouseReceipts,
  isShipQuantityAllowed,
  recordShopWarehouseReceipt,
  shipShopOrderRequest,
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

export function FactoryWarehousePendingPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, ShopStockWarning>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const items = await fetchFactoryPendingShopOrders();
    setRows(items);
    const next: Record<string, string> = {};
    for (const row of items) {
      for (const line of row.lines) next[line.id] = String(line.quantity);
    }
    setQuantities(next);
    const assessed: Record<string, ShopStockWarning> = {};
    for (const row of items) {
      const result = await assessShopWarehouseRequest(
        row.id,
        row.lines.map((line) => ({
          requestLineId: line.id,
          quantity: Number(next[line.id] || line.quantity),
        })),
      );
      for (const item of result) assessed[item.requestLineId] = item.warning;
    }
    setWarnings(assessed);
  };

  useEffect(() => {
    void load().catch(() => setError(t("shopWarehouse.loadError")));
  }, [t]);

  const ship = async (row: ShopOrderRequest) => {
    const lines = row.lines.map((line) => ({
      requestLineId: line.id,
      quantity: Number(quantities[line.id] || line.quantity),
    }));
    if (lines.some((line, index) => !isShipQuantityAllowed(line.quantity, row.lines[index].quantity))) {
      setError(t("shopWarehouse.qtyInvalid"));
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const result = await shipShopOrderRequest(row, lines);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage(
        result.replayed
          ? t("shopWarehouse.shipReplayed", { number: result.shipmentNo })
          : t("shopWarehouse.shipped", { number: result.shipmentNo }),
      );
    } catch {
      setError(t("shopWarehouse.shipError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopWarehouse.title")}</span>
          <h1>{t("shopWarehouse.pendingTitle")}</h1>
          <p>{t("shopWarehouse.pendingDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel">
        {message ? <p>{message}</p> : null}
        {error ? <p>{error}</p> : null}
        {rows.length === 0 && !error ? <p>{t("shopWarehouse.emptyPending")}</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="shop-review-card">
            <h2>
              {row.requestNo} · {row.restaurantName ?? row.restaurantId} · {row.catalogSupplierName} · {row.deliveryDate}
            </h2>
            <table className="shop-order-items">
              <thead>
                <tr>
                  <th>{t("shopOrdering.item")}</th>
                  <th>{t("shopOrdering.unit")}</th>
                  <th>{t("shopWarehouse.approved")}</th>
                  <th>{t("shopOrdering.quantity")}</th>
                  <th>{t("shopWarehouse.stock")}</th>
                </tr>
              </thead>
              <tbody>
                {row.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.unit}</td>
                    <td>{line.quantity}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={line.quantity}
                        value={quantities[line.id] ?? ""}
                        onChange={(event) =>
                          setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                        }
                      />
                    </td>
                    <td>{warningLabel(t, warnings[line.id] ?? "ok")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {row.lines.some((line) => warnings[line.id] && warnings[line.id] !== "ok") ? (
              <p>{t("shopWarehouse.warnButShip")}</p>
            ) : null}
            <div className="shop-order-actions">
              <Button
                disabled={busyId === row.id || row.lines.some((line) => !canShipWithWarning(warnings[line.id] ?? "ok"))}
                onClick={() => void ship(row)}
              >
                {t("shopWarehouse.ship")}
              </Button>
            </div>
          </div>
        ))}
      </article>
    </section>
  );
}

export function FactoryWarehouseShipmentsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopShipment[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    void fetchShopShipments()
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopWarehouse.title")}</span>
          <h1>{t("shopWarehouse.outboundTitle")}</h1>
        </div>
      </header>
      <article className="panel ingredients-panel">
        {error ? <p>{t("shopWarehouse.loadError")}</p> : null}
        {rows.length === 0 && !error ? <p>{t("shopWarehouse.emptyOutbound")}</p> : null}
        <table className="shop-order-items">
          <thead>
            <tr>
              <th>{t("shopOrdering.columns.number")}</th>
              <th>{t("shopOrdering.restaurant")}</th>
              <th>{t("shopWarehouse.shippedAt")}</th>
              <th>{t("shopOrdering.columns.status")}</th>
              <th>{t("shopOrdering.columns.lines")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.shipmentNo}{row.requestNo ? ` / ${row.requestNo}` : ""}</td>
                <td>{row.restaurantName ?? "—"}</td>
                <td>{row.shippedAt.slice(0, 10)}</td>
                <td>{row.status}</td>
                <td>
                  {row.lines
                    .map((line) => `${line.name} × ${line.shippedQuantity} (${warningLabel(t, line.stockWarning)})`)
                    .join("、")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  const items = useMemo(
    () => catalog.filter((item) => item.channel === "fc_internal" && item.warehouse),
    [catalog],
  );
  const selected = items.find((item) => item.id === itemId) ?? null;

  useEffect(() => {
    void Promise.all([fetchShopCatalog(), fetchShopWarehouseReceipts()])
      .then(([catalogRows, receiptRows]) => {
        setCatalog(catalogRows);
        setRows(receiptRows);
      })
      .catch(() => setError(t("shopWarehouse.loadError")));
  }, [t]);

  const save = async () => {
    if (!selected) {
      setError(t("shopWarehouse.needItem"));
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t("shopWarehouse.qtyInvalid"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await recordShopWarehouseReceipt({
        catalogItem: selected,
        quantity: qty,
        receiptDate,
        sourceName,
        batchNo,
        idempotencyKey,
      });
      setMessage(
        result.replayed
          ? t("shopWarehouse.receiptReplayed", { number: result.receiptNo })
          : t("shopWarehouse.receiptSaved", { number: result.receiptNo }),
      );
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
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopWarehouse.title")}</span>
          <h1>{t("shopWarehouse.inboundTitle")}</h1>
          <p>{t("shopWarehouse.inboundDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel">
        {message ? <p>{message}</p> : null}
        {error ? <p>{error}</p> : null}
        <div className="shop-order-form">
          <label>
            <span>{t("shopOrdering.item")}</span>
            <select value={itemId} onChange={(event) => setItemId(event.target.value)}>
              <option value="">{t("shopWarehouse.itemPlaceholder")}</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.supplierName} · {item.name} ({item.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("shopOrdering.quantity")}</span>
            <input type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label>
            <span>{t("shopWarehouse.receiptDate")}</span>
            <input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
          </label>
          <label>
            <span>{t("shopWarehouse.source")}</span>
            <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
          </label>
          <label>
            <span>{t("shopWarehouse.batch")}</span>
            <input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} />
          </label>
          <div className="shop-order-actions">
            <Button disabled={saving} onClick={() => void save()}>
              {t("shopWarehouse.saveReceipt")}
            </Button>
          </div>
        </div>
        <table className="shop-order-items">
          <thead>
            <tr>
              <th>{t("shopOrdering.columns.number")}</th>
              <th>{t("shopWarehouse.receiptDate")}</th>
              <th>{t("shopOrdering.item")}</th>
              <th>{t("shopOrdering.quantity")}</th>
              <th>{t("shopWarehouse.source")}</th>
              <th>{t("shopWarehouse.batch")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.receiptNo}</td>
                <td>{row.receiptDate}</td>
                <td>{row.name} ({row.unit})</td>
                <td>{row.quantity}</td>
                <td>{row.sourceName ?? "—"}</td>
                <td>{row.batchNo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
