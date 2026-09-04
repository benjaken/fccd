import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, ClipboardList, Eye, Save, Send } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import {
  fetchShopCatalog,
  fetchShopContacts,
  fetchShopOrderRequests,
  groupCatalogBySupplier,
  sendShopOrderToFactory,
  shopCatalogSupplierKey,
  updateShopOrderLines,
  type ShopCatalogItem,
  type ShopOrderRequest,
  type ShopSupplierContact,
} from "@/lib/shop-orders";

function OfficeShopHeading({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <header className="page-heading ingredients-heading">
      <div>
        <span className="eyebrow">{t("shopOrdering.office")}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </header>
  );
}

function ShopStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`shop-order-status status-${status}`}>{t(`shopOrdering.status.${status}`, { defaultValue: status })}</span>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="office-shop-state">
      <OperationalListState
        icon={AlertCircle}
        title={t("shopOrdering.loadError")}
        retryLabel={t("shopOrdering.retry")}
        onRetry={onRetry}
      />
    </div>
  );
}

export function OfficeShopSuppliersPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void fetchShopCatalog().then(setCatalog).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const groups = useMemo(() => groupCatalogBySupplier(catalog), [catalog]);

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.suppliersTitle")} description={t("shopOrdering.suppliersDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={3}
            searchPlaceholder={t("shopOrdering.searchSuppliers")}
            emptyTitle={t("shopOrdering.emptySuppliers")}
            header={<tr><th>{t("shopOrdering.supplier")}</th><th>{t("shopOrdering.columns.channel")}</th><th>{t("shopOrdering.columns.itemCount")}</th></tr>}
          >
            {groups.map((group) => (
              <tr key={shopCatalogSupplierKey(group)}>
                <td><strong>{group.supplierName}</strong></td>
                <td><span className={`shop-channel-badge channel-${group.channel}`}>{group.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</span></td>
                <td>{group.items.length}</td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        )}
      </article>
    </section>
  );
}

export function OfficeShopRequestsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void fetchShopOrderRequests({ channel: "fc_internal" })
      .then((items) => setRows(items.filter((row) => row.status === "submitted")))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.requestsTitle")} description={t("shopOrdering.requestsDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={6}
            searchPlaceholder={t("shopOrdering.searchRequests")}
            emptyTitle={t("shopOrdering.emptyRequests")}
            header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopOrdering.columns.supplier")}</th><th>{t("shopOrdering.columns.deliveryDate")}</th><th>{t("shopOrdering.columns.itemCount")}</th><th>{t("shopOrdering.columns.status")}</th></tr>}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.requestNo}</strong></td>
                <td>{row.restaurantName ?? "—"}</td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{row.lines.length}</td>
                <td><ShopStatus status={row.status} /></td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        )}
      </article>
    </section>
  );
}

export function OfficeShopPhonebookPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [contacts, setContacts] = useState<ShopSupplierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void fetchShopCatalog().then(async (items) => {
      setCatalog(items);
      const ids = [...new Set(items.map((item) => item.fccSupplierId).filter(Boolean))] as string[];
      setContacts((await Promise.all(ids.map((id) => fetchShopContacts(id)))).flat());
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const names = new Map(catalog.map((item) => [item.fccSupplierId, item.supplierName]));

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.phonebookTitle")} description={t("shopOrdering.phonebookDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={4}
            searchPlaceholder={t("shopOrdering.searchContacts")}
            emptyTitle={t("shopOrdering.emptyContacts")}
            header={<tr><th>{t("shopOrdering.supplier")}</th><th>{t("shopOrdering.contact")}</th><th>{t("shopOrdering.columns.phone")}</th><th>{t("shopOrdering.note")}</th></tr>}
          >
            {contacts.map((row) => (
              <tr key={row.id}>
                <td><strong>{names.get(row.supplierId) ?? row.supplierId}</strong></td>
                <td>{row.name || "—"}</td>
                <td><a className="table-primary-link" href={`tel:${row.phone}`}>{row.phone}</a></td>
                <td>{row.note || "—"}</td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        )}
      </article>
    </section>
  );
}

export function OfficeShopReviewPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canSend = access.canAccess("restaurant.ordering.review.send_factory");
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [selected, setSelected] = useState<ShopOrderRequest | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void fetchShopOrderRequests({ channel: "fc_internal" }).then((items) => {
      setRows(items.filter((row) => row.status === "submitted"));
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openReview = (row: ShopOrderRequest) => {
    setSelected(row);
    setMessage("");
    setQuantities(Object.fromEntries(row.lines.map((line) => [line.id, String(line.quantity)])));
  };

  const save = async (row: ShopOrderRequest) => {
    const lines = row.lines.map((line) => ({ id: line.id, quantity: Number(quantities[line.id]) }));
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      setMessage(t("shopOrdering.quantityInvalid"));
      return false;
    }
    setBusy(true);
    setMessage("");
    try {
      await updateShopOrderLines(row.id, lines);
      setRows((current) => current.map((item) => item.id === row.id ? {
        ...item,
        lines: item.lines.map((line) => ({ ...line, quantity: lines.find((value) => value.id === line.id)?.quantity ?? line.quantity })),
      } : item));
      setMessage(t("shopOrdering.reviewSaved"));
      return true;
    } catch {
      setMessage(t("shopOrdering.reviewSaveError"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async (row: ShopOrderRequest) => {
    if (!await save(row)) return;
    setBusy(true);
    try {
      await sendShopOrderToFactory(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setSelected(null);
    } catch {
      setMessage(t("shopOrdering.sendFactoryError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.reviewTitle")} description={t("shopOrdering.reviewDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={7}
            searchPlaceholder={t("shopOrdering.searchRequests")}
            emptyTitle={t("shopOrdering.emptyReview")}
            header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopOrdering.columns.supplier")}</th><th>{t("shopOrdering.columns.deliveryDate")}</th><th>{t("shopOrdering.columns.itemCount")}</th><th>{t("shopOrdering.columns.status")}</th><th aria-label={t("shopOrdering.columns.actions")} /></tr>}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.requestNo}</strong></td>
                <td>{row.restaurantName ?? "—"}</td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{row.lines.length}</td>
                <td><ShopStatus status={row.status} /></td>
                <td className="table-actions-cell"><div className="table-row-actions"><Button size="icon" variant="outline" aria-label={t("shopOrdering.openReview", { number: row.requestNo })} onClick={() => openReview(row)}><Eye /></Button></div></td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        )}
      </article>
      <SidePanel
        open={Boolean(selected)}
        wide
        title={selected ? t("shopOrdering.reviewPanelTitle", { number: selected.requestNo }) : ""}
        description={selected ? `${selected.catalogSupplierName} · ${selected.deliveryDate}` : undefined}
        closeLabel={t("shopOrdering.closeReview")}
        onClose={() => setSelected(null)}
        footer={selected ? <><Button variant="outline" disabled={busy} onClick={() => void save(selected)}><Save />{t("shopOrdering.saveChanges")}</Button>{canSend ? <Button disabled={busy} onClick={() => void send(selected)}><Send />{t("shopOrdering.sendFactory")}</Button> : null}</> : null}
      >
        {selected ? <div className="office-shop-review-detail">
          <dl><div><dt>{t("shopOrdering.restaurant")}</dt><dd>{selected.restaurantName ?? "—"}</dd></div><div><dt>{t("shopOrdering.columns.status")}</dt><dd><ShopStatus status={selected.status} /></dd></div>{selected.note ? <div><dt>{t("shopOrdering.note")}</dt><dd>{selected.note}</dd></div> : null}</dl>
          {message ? <p className="office-shop-review-message" role="status">{message}</p> : null}
          <div className="table-wrap operational-table-wrap"><table><thead><tr><th>{t("shopOrdering.item")}</th><th>{t("shopOrdering.unit")}</th><th>{t("shopOrdering.quantity")}</th></tr></thead><tbody>{selected.lines.map((line) => <tr key={line.id}><td><strong>{line.name}</strong>{line.sku ? <small>{line.sku}</small> : null}</td><td>{line.unit}</td><td><input aria-label={t("shopOrdering.editQuantity", { item: line.name })} type="number" min="0.01" step="any" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>
        </div> : <OperationalListState icon={ClipboardList} title={t("shopOrdering.emptyReview")} />}
      </SidePanel>
    </section>
  );
}

export function OfficeShopRecordsPage() {
  return <ShopOrderRecordsPage office />;
}
