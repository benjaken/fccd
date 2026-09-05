import {
  CalendarDays,
  Eye,
  PackageOpen,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Store,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import {
  TKO_RESTAURANT_ID,
  canRestaurantEditShopOrder,
  fetchShopCatalog,
  fetchShopOrderRecords,
  reviewShopOrder,
  withdrawSubmittedShopOrder,
  type ShopCatalogItem,
  type ShopOrderRequest,
} from "@/lib/shop-orders";

import styles from "./ShopOrderRecordsPage.module.css";

export function ShopOrderRecordsPage({ office = false }: { office?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const access = useCurrentPageAccess();
  const canReview = access.canAccess("restaurant.ordering.review");
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<ShopOrderRequest | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selected, setSelected] = useState<ShopOrderRequest | null>(null);
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(
        await fetchShopOrderRecords(
          office ? undefined : { restaurantId: TKO_RESTAURANT_ID },
        ),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [office]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const confirmWithdraw = async () => {
    if (!withdrawing || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    try {
      await withdrawSubmittedShopOrder(withdrawing.id);
      setRows((current) =>
        current.map((row) =>
          row.id === withdrawing.id ? { ...row, status: "withdrawn" } : row,
        ),
      );
      setWithdrawing(null);
    } catch {
      setActionError(t("shopOrdering.withdrawError"));
      setWithdrawing(null);
    } finally {
      setActionBusy(false);
    }
  };

  const status = (value: string) => (
    <span className={`shop-order-status status-${value}`}>
      {t(`shopOrdering.status.${value}`, { defaultValue: value })}
    </span>
  );

  const selectedCatalog = useMemo(() => {
    if (!selected) return [];
    return catalog.filter(
      (item) =>
        item.channel === selected.channel &&
        item.supplierName === selected.catalogSupplierName &&
        item.fccSupplierId === selected.supplierId,
    );
  }, [catalog, selected]);

  const visibleCatalog = useMemo(() => {
    const search = itemSearch.trim().toLocaleLowerCase("zh-HK");
    if (!search) return selectedCatalog;
    return selectedCatalog.filter((item) =>
      `${item.name} ${item.sku ?? ""}`
        .toLocaleLowerCase("zh-HK")
        .includes(search),
    );
  }, [itemSearch, selectedCatalog]);

  const canModifySelected = Boolean(
    office &&
      canReview &&
      (selected?.supplierOrders?.length ?? 1) === 1 &&
      selected?.channel === "fc_internal" &&
      selected.status === "submitted",
  );

  const openDetails = (row: ShopOrderRequest) => {
    const supplierOrders = row.supplierOrders ?? [row];
    if (office && supplierOrders.length === 1 && row.channel === "fc_internal") {
      navigate(`/restaurant/ordering/review/${supplierOrders[0].id}?from=records`);
      return;
    }
    setSelected(row);
    setEditing(false);
    setItemSearch("");
    setActionError("");
    if (office && catalog.length === 0 && !catalogLoading) {
      setCatalogLoading(true);
      setCatalogError(false);
      void fetchShopCatalog()
        .then(setCatalog)
        .catch(() => setCatalogError(true))
        .finally(() => setCatalogLoading(false));
    }
  };

  const startEditing = () => {
    if (!selected || !canModifySelected || catalogLoading || catalogError) return;
    const next: Record<string, string> = {};
    selected.lines.forEach((line) => {
      const item = selectedCatalog.find(
        (candidate) =>
          candidate.id === line.catalogItemId ||
          (!line.catalogItemId &&
            candidate.name === line.name &&
            candidate.sku === line.sku),
      );
      if (item) next[item.id] = String(line.quantity);
    });
    setQuantities(next);
    setItemSearch("");
    setEditing(true);
  };

  const saveRecordItems = async () => {
    if (!selected || !canModifySelected || actionBusy) return;
    const lines = selectedCatalog
      .map((item) => ({ item, quantity: Number(quantities[item.id]) }))
      .filter(({ quantity }) => Number.isFinite(quantity) && quantity > 0);
    if (lines.length === 0) {
      setActionError(t("shopOrdering.needLines"));
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      await reviewShopOrder({
        requestId: selected.id,
        deliveryDate: selected.deliveryDate,
        note: selected.note ?? "",
        reviewNote: "",
        action: "save",
        lines: lines.map(({ item, quantity }) => ({
          catalogItemId: item.id,
          quantity,
        })),
      });
      const updatedLines = lines.map(({ item, quantity }) => ({
        id:
          selected.lines.find((line) => line.catalogItemId === item.id)?.id ??
          `catalog-${item.id}`,
        catalogItemId: item.id,
        name: item.name,
        unit: item.unit,
        sku: item.sku,
        quantity,
        warehouse: item.warehouse,
      }));
      const updated = { ...selected, lines: updatedLines };
      setSelected(updated);
      setRows((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setEditing(false);
    } catch {
      setActionError(t("shopOrdering.updatePendingError"));
    } finally {
      setActionBusy(false);
    }
  };

  const detailPanel = (
    <SidePanel
      open={Boolean(selected)}
      half
      className={styles.detailPanel}
      title={
        selected
          ? t("shopOrdering.orderDetailsTitle", { number: selected.requestNo })
          : ""
      }
      description={
        selected
          ? `${selected.supplierOrders?.length ?? 1} ${t("shopOrdering.suppliers")} · ${selected.deliveryDate}`
          : undefined
      }
      closeLabel={t("common.close")}
      onClose={() => {
        if (!actionBusy) {
          setSelected(null);
          setEditing(false);
          setActionError("");
        }
      }}
      footer={
        selected ? (
          editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={actionBusy}
                onClick={() => {
                  setEditing(false);
                  setActionError("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={actionBusy}
                onClick={() => void saveRecordItems()}
              >
                <Save />
                {actionBusy
                  ? t("shopOrdering.savingChanges")
                  : t("shopOrdering.saveOrderChanges")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected(null)}
              >
                {t("common.close")}
              </Button>
              {canModifySelected ? (
                <Button
                  type="button"
                  disabled={catalogLoading || catalogError}
                  onClick={startEditing}
                >
                  <Pencil />
                  {t("shopOrdering.editAndAddItems")}
                </Button>
              ) : null}
            </>
          )
        ) : null
      }
    >
      {selected ? (
        <div className={styles.detailContent}>
          <dl className={styles.detailMeta}>
            <div>
              <dt>{t("shopOrdering.restaurant")}</dt>
              <dd>{selected.restaurantName ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("shopOrdering.columns.supplier")}</dt>
              <dd>{selected.catalogSupplierName}</dd>
            </div>
            <div>
              <dt>{t("shopOrdering.columns.channel")}</dt>
              <dd>
                {[...new Set((selected.supplierOrders ?? [selected]).map((order) =>
                  order.channel === "fc_internal"
                    ? t("shopOrdering.fcInternal")
                    : t("shopOrdering.external"),
                ))].join(" + ")}
              </dd>
            </div>
            <div>
              <dt>{t("shopOrdering.columns.status")}</dt>
              <dd>{status(selected.status)}</dd>
            </div>
            <div>
              <dt>{t("shopOrdering.columns.deliveryDate")}</dt>
              <dd>{selected.deliveryDate}</dd>
            </div>
            <div>
              <dt>{t("shopOrdering.note")}</dt>
              <dd>{selected.note || "—"}</dd>
            </div>
          </dl>

          {actionError ? (
            <p className={styles.actionError} role="alert">
              {actionError}
            </p>
          ) : null}

          {editing ? (
            <section
              className={styles.editor}
              aria-label={t("shopOrdering.editAndAddItems")}
            >
              <label className={styles.itemSearch}>
                <Search aria-hidden="true" />
                <span className="sr-only">
                  {t("shopOrdering.searchWithinSupplierPlaceholder", {
                    supplier: selected.catalogSupplierName,
                  })}
                </span>
                <input
                  type="search"
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder={t(
                    "shopOrdering.searchWithinSupplierPlaceholder",
                    { supplier: selected.catalogSupplierName },
                  )}
                />
              </label>
              {catalogLoading ? (
                <p className={styles.editorState}>{t("shopOrdering.loading")}</p>
              ) : null}
              {catalogError ? (
                <p className={styles.editorState} role="alert">
                  {t("shopOrdering.editLoadError")}
                </p>
              ) : null}
              {!catalogLoading && !catalogError ? (
                <div className={styles.editableLines}>
                  {visibleCatalog.map((item) => (
                    <label key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {[item.sku, item.unit].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                      <input
                        aria-label={t("shopOrdering.editQuantity", {
                          item: item.name,
                        })}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={quantities[item.id] ?? ""}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder={t("shopOrdering.quantityPlaceholder")}
                      />
                    </label>
                  ))}
                  {visibleCatalog.length === 0 ? (
                    <p className={styles.editorState}>
                      {t("shopOrdering.noMatchingItems")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section
              className={styles.detailLines}
              aria-label={t("shopOrdering.columns.lines")}
            >
              <header>
                <span>{t("shopOrdering.columns.lines")}</span>
                <strong>{selected.lines.length}</strong>
              </header>
              {(selected.supplierOrders ?? [selected]).map((order) => (
                <div className={styles.supplierGroup} key={order.id}>
                  <div className={styles.supplierGroupHeading}>
                    <strong>{order.catalogSupplierName}</strong>
                    <span className={`shop-channel-badge channel-${order.channel}`}>
                      {order.channel === "fc_internal"
                        ? t("shopOrdering.fcInternal")
                        : t("shopOrdering.external")}
                    </span>
                  </div>
                  <ul>
                    {order.lines.map((line) => (
                      <li key={line.id}>
                        <span>
                          <strong>{line.name}</strong>
                          <small>
                            {[line.sku, line.unit].filter(Boolean).join(" · ")}
                          </small>
                        </span>
                        <b>{line.quantity}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      ) : null}
    </SidePanel>
  );

  if (office) {
    return (
      <section className="ingredients-page office-shop-page">
        <header className="page-heading ingredients-heading">
          <div>
            <span className="eyebrow">{t("shopOrdering.office")}</span>
            <h1>{t("shopOrdering.officeRecordsTitle")}</h1>
            <p>{t("shopOrdering.recordsDescription")}</p>
          </div>
        </header>
        <article className="panel ingredients-panel">
          {error ? (
            <p className="office-shop-inline-error">
              {t("shopOrdering.loadError")}
            </p>
          ) : null}
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={8}
            searchPlaceholder={t("shopOrdering.searchRecords")}
            emptyTitle={t("shopOrdering.emptyRecords")}
            header={
              <tr>
                <th>{t("shopOrdering.columns.number")}</th>
                <th>{t("shopOrdering.restaurant")}</th>
                <th>{t("shopOrdering.columns.channel")}</th>
                <th>{t("shopOrdering.columns.supplier")}</th>
                <th>{t("shopOrdering.columns.deliveryDate")}</th>
                <th>{t("shopOrdering.columns.status")}</th>
                <th>{t("shopOrdering.columns.lines")}</th>
                <th aria-label={t("shopOrdering.columns.actions")} />
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.requestNo}</strong></td>
                <td>{row.restaurantName ?? "—"}</td>
                <td>
                  <span className={`shop-channel-badge channel-${row.channel}`}>
                    {row.channel === "fc_internal"
                      ? t("shopOrdering.fcInternal")
                      : t("shopOrdering.external")}
                  </span>
                </td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{status(row.status)}</td>
                <td>
                  {row.lines
                    .map((line) => `${line.name} × ${line.quantity} ${line.unit}`)
                    .join("、")}
                </td>
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("shopOrdering.viewOrderDetails", {
                        number: row.requestNo,
                      })}
                      onClick={() => openDetails(row)}
                    >
                      <Eye />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        </article>
        {detailPanel}
      </section>
    );
  }

  return (
    <section
      className={`ingredients-page ${styles.page}`}
      aria-label={t("shopOrdering.recordsTitle")}
    >
      <article className={`panel ingredients-panel ${styles.panel}`}>
        {actionError && !selected ? (
          <p className={styles.actionError} role="alert">{actionError}</p>
        ) : null}
        {loading ? (
          <div className={styles.state} role="status">
            <RefreshCw className={styles.spinner} aria-hidden="true" />
            <strong>{t("shopOrdering.loading")}</strong>
          </div>
        ) : null}
        {error && !loading ? (
          <div className={styles.state} role="alert">
            <PackageOpen aria-hidden="true" />
            <strong>{t("shopOrdering.loadError")}</strong>
            <Button variant="outline" onClick={loadRecords}>
              <RefreshCw />{t("shopOrdering.retry")}
            </Button>
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className={styles.state}>
            <PackageOpen aria-hidden="true" />
            <strong>{t("shopOrdering.emptyRecords")}</strong>
          </div>
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className={styles.list}>
            {rows.map((row) => (
              <article className={styles.card} key={row.id}>
                <header>
                  <div>
                    <span>{t("shopOrdering.columns.number")}</span>
                    <strong>{row.requestNo}</strong>
                  </div>
                  {status(row.status)}
                </header>

                <dl className={styles.meta}>
                  <div>
                    <dt><Store aria-hidden="true" />{t("shopOrdering.columns.supplier")}</dt>
                    <dd>{row.catalogSupplierName}</dd>
                  </div>
                  <div>
                    <dt><CalendarDays aria-hidden="true" />{t("shopOrdering.columns.deliveryDate")}</dt>
                    <dd>{row.deliveryDate}</dd>
                  </div>
                </dl>

                <div className={styles.channel}>
                  {[...new Set((row.supplierOrders ?? [row]).map((order) => order.channel))]
                    .map((channel) => (
                      <span key={channel} className={`shop-channel-badge channel-${channel}`}>
                        {channel === "fc_internal"
                          ? t("shopOrdering.fcInternal")
                          : t("shopOrdering.external")}
                      </span>
                    ))}
                </div>

                <section className={styles.lines} aria-label={t("shopOrdering.columns.lines")}>
                  <header>
                    <span><PackageOpen aria-hidden="true" />{t("shopOrdering.columns.lines")}</span>
                    <b>{row.lines.length} {t("shopOrdering.columns.itemCount")}</b>
                  </header>
                  <ul>
                    {row.lines.map((line) => (
                      <li key={line.id}>
                        <span>
                          <strong>{line.name}</strong>
                          {line.sku ? <small>{line.sku}</small> : null}
                        </span>
                        <b>{line.quantity} <small>{line.unit}</small></b>
                      </li>
                    ))}
                  </ul>
                </section>

                {row.note ? (
                  <p className={styles.note}>
                    <span>{t("shopOrdering.note")}</span>{row.note}
                  </p>
                ) : null}
                <footer className={styles.actions}>
                  <Button variant="outline" onClick={() => openDetails(row)}>
                    <Eye />{t("shopOrdering.viewDetails")}
                  </Button>
                  {(row.supplierOrders?.length ?? 1) === 1 && canRestaurantEditShopOrder(row) ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={actionBusy}
                        onClick={() =>
                          navigate(`/restaurant-workspace/shop-order/${row.id}`)
                        }
                      >
                        <Pencil />{t("shopOrdering.editOrder")}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={actionBusy}
                        onClick={() => {
                          setActionError("");
                          setWithdrawing(row);
                        }}
                      >
                        <Undo2 />{t("shopOrdering.withdrawOrder")}
                      </Button>
                    </>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        ) : null}
      </article>

      {detailPanel}

      <ConfirmDialog
        open={Boolean(withdrawing)}
        title={t("shopOrdering.withdrawConfirmTitle")}
        description={
          withdrawing
            ? t("shopOrdering.withdrawConfirmDescription", {
                number: withdrawing.requestNo,
              })
            : undefined
        }
        confirmLabel={t("shopOrdering.confirmWithdraw")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={actionBusy}
        busyLabel={t("shopOrdering.withdrawing")}
        variant="destructive"
        onCancel={() => {
          if (!actionBusy) setWithdrawing(null);
        }}
        onConfirm={() => void confirmWithdraw()}
      />
    </section>
  );
}
