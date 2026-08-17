import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Image as ImageIcon, RefreshCw, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  assignDeliveryMotorcade,
  buildDeliveryExportCsv,
  cancelPendingDelivery,
  clockFromValue,
  DELIVERIES_PAGE_SIZE,
  downloadCsv,
  feeSharePercent,
  fetchDeliveries,
  fetchDeliveryExportRows,
  fetchDeliveryLookups,
  hasDeliveryPhotos,
  hongKongDateInputValue,
  hongKongMonthStart,
  isDeliveredStatus,
  isPendingPickupStatus,
  isPickedUpStatus,
  toDeliveryExportRow,
  type DeliveryListFilters,
  type DeliveryListItem,
  type DeliveryListResult,
  type DeliveryLookupOption,
} from "@/lib/deliveries";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import { cn } from "@/lib/utils";

type DeliveriesLoader = (
  filters: DeliveryListFilters,
) => Promise<DeliveryListResult>;
type LookupsLoader = typeof fetchDeliveryLookups;
type ExportLoader = typeof fetchDeliveryExportRows;
type AssignFleet = typeof assignDeliveryMotorcade;
type CancelDelivery = typeof cancelPendingDelivery;

const DELIVERY_SKELETON_COLUMNS = [
  { width: "2.5rem" },
  { width: "10rem" },
  { width: "5.5rem" },
  { width: "6.5rem" },
  { width: "4.5rem" },
  { width: "10rem" },
  { width: "6rem" },
  { width: "4rem" },
  { width: "5rem" },
  { width: "4.5rem" },
  { width: "6rem" },
  { width: "7rem", variant: "badge" as const },
];

function formatOrderNumber(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#") || /[A-Za-z]/.test(trimmed)) return trimmed;
  return `#${trimmed}`;
}

export function DeliveryListPage({
  loadDeliveries = fetchDeliveries,
  loadLookups = fetchDeliveryLookups,
  loadExportRows = fetchDeliveryExportRows,
  assignFleet = assignDeliveryMotorcade,
  cancelDelivery = cancelPendingDelivery,
  now = new Date(),
}: {
  loadDeliveries?: DeliveriesLoader;
  loadLookups?: LookupsLoader;
  loadExportRows?: ExportLoader;
  assignFleet?: AssignFleet;
  cancelDelivery?: CancelDelivery;
  now?: Date;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(() => hongKongMonthStart(now));
  const [endDate, setEndDate] = useState(() => hongKongDateInputValue(now));
  const [motorcadeId, setMotorcadeId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DeliveryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [teams, setTeams] = useState<DeliveryLookupOption[]>([]);
  const [shippingMethods, setShippingMethods] = useState<
    DeliveryLookupOption[]
  >([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [imageItem, setImageItem] = useState<DeliveryListItem | null>(null);
  const [cancelItem, setCancelItem] = useState<DeliveryListItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const startDateFilter = useDeferredFilter(startDate, (value) => {
    setPage(1);
    setStartDate(value);
  });
  const endDateFilter = useDeferredFilter(endDate, (value) => {
    setPage(1);
    setEndDate(value);
  });
  const motorcadeFilter = useDeferredFilter(motorcadeId, (value) => {
    setPage(1);
    setMotorcadeId(value);
  });
  const shippingMethodFilter = useDeferredFilter(
    shippingMethodId,
    (value) => {
      setPage(1);
      setShippingMethodId(value);
    },
  );

  const totalPages = Math.max(1, Math.ceil(total / DELIVERIES_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * DELIVERIES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * DELIVERIES_PAGE_SIZE, total);
  const filtersActive = Boolean(
    startDate || endDate || motorcadeId || shippingMethodId,
  );

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );
  const currencyExact = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "long",
        day: "numeric",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );
  const exportDate = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "zh-HK" ? "en-GB" : i18n.language, {
        timeZone: "Asia/Hong_Kong",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [i18n.language],
  );

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const formatDate = (value: string | null) => {
    if (!value) return t("common.notSet");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("common.notSet");
    return date.format(parsed);
  };

  const formatExportDate = (value: string | null) => {
    if (!value) return t("common.notSet");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("common.notSet");
    return exportDate.format(parsed);
  };

  const formatFee = (value: number | null, exact = false) => {
    if (value === null) return t("common.notSet");
    return exact ? currencyExact.format(value) : currency.format(value);
  };

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadDeliveries({
        page,
        search,
        startDate,
        endDate,
        motorcadeId,
        shippingMethodId,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "deliveries_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [
    endDate,
    loadDeliveries,
    motorcadeId,
    page,
    reloadKey,
    search,
    shippingMethodId,
    startDate,
  ]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    let active = true;
    void loadLookups()
      .then((result) => {
        if (!active) return;
        setTeams(result.teams);
        setShippingMethods(result.shippingMethods);
      })
      .catch(() => {
        if (!active) return;
        setTeams([]);
        setShippingMethods([]);
      });
    return () => {
      active = false;
    };
  }, [loadLookups]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const confirmFilters = () => {
    startDateFilter.confirm();
    endDateFilter.confirm();
    motorcadeFilter.confirm();
    shippingMethodFilter.confirm();
  };

  const revertFilters = () => {
    startDateFilter.revert();
    endDateFilter.revert();
    motorcadeFilter.revert();
    shippingMethodFilter.revert();
  };

  const pageFeeTotal = items.reduce(
    (sum, item) => sum + (item.totalFee ?? 0),
    0,
  );

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const rows = await loadExportRows({
        search,
        startDate,
        endDate,
        motorcadeId,
        shippingMethodId,
      });
      const csv = buildDeliveryExportCsv(
        rows.map((item) =>
          toDeliveryExportRow(item, t("common.notSet"), formatExportDate),
        ),
        {
          orderNumber: t("deliveryList.exportColumns.orderNumber"),
          deliveryDate: t("deliveryList.exportColumns.deliveryDate"),
          deliveryTime: t("deliveryList.exportColumns.deliveryTime"),
          customerName: t("deliveryList.exportColumns.customerName"),
          customerPhone: t("deliveryList.exportColumns.customerPhone"),
          district: t("deliveryList.exportColumns.district"),
          address: t("deliveryList.exportColumns.address"),
          shippingMethod: t("deliveryList.exportColumns.shippingMethod"),
          fleet: t("deliveryList.exportColumns.fleet"),
        },
      );
      downloadCsv(
        `delivery-list-${startDate || "all"}-${endDate || "all"}.csv`,
        csv,
      );
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "deliveries_export_failed";
      setExportError(code);
    } finally {
      setExporting(false);
    }
  };

  const changeFleet = async (item: DeliveryListItem, nextId: string) => {
    const motorcadeIdValue = nextId || null;
    const motorcadeName =
      teams.find((team) => team.id === motorcadeIdValue)?.name ?? null;
    setAssignError(null);
    setAssigningId(item.id);
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, motorcadeId: motorcadeIdValue, motorcadeName }
          : row,
      ),
    );
    try {
      await assignFleet(item.id, motorcadeIdValue);
    } catch {
      setAssignError("assign_failed");
      setItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                motorcadeId: item.motorcadeId,
                motorcadeName: item.motorcadeName,
              }
            : row,
        ),
      );
    } finally {
      setAssigningId(null);
    }
  };

  const confirmCancelDelivery = async () => {
    if (!cancelItem || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelDelivery(cancelItem.id);
      setCancelItem(null);
      if (items.length <= 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        setReloadKey((key) => key + 1);
      }
    } catch {
      setCancelError("cancel_failed");
    } finally {
      setCancelling(false);
    }
  };

  const statusLabel = (item: DeliveryListItem) => {
    if (isDeliveredStatus(item.deliveryStatus)) {
      return t("deliveryList.statuses.delivered");
    }
    if (item.deliveryStatus === "已取") {
      return t("deliveryList.statuses.pickedUp");
    }
    if (item.deliveryStatus === "待取貨") {
      return t("deliveryList.statuses.pendingPickup");
    }
    if (
      item.deliveryStatus === "未派車隊" ||
      item.deliveryStatus === "待接單"
    ) {
      return t("deliveryList.statuses.unassigned");
    }
    if (item.deliveryStatus === "送貨途中") {
      return t("deliveryList.statuses.shipping");
    }
    return item.deliveryStatus?.trim() || t("common.notSet");
  };

  return (
    <section className="orders-page delivery-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("deliveryList.eyebrow")}</span>
          <h1>{t("deliveryList.title")}</h1>
        </div>
        <div className="heading-actions delivery-list-heading-actions">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label={t("deliveryList.refresh")}
            title={t("deliveryList.refresh")}
          >
            <RefreshCw />
          </Button>
          <Button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || loading || total === 0}
          >
            <Download />
            {exporting ? t("deliveryList.exporting") : t("deliveryList.export")}
          </Button>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar delivery-list-toolbar">
          <ListSearchBar
            id="delivery-list-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("deliveryList.search")}
            placeholder={t("deliveryList.searchPlaceholder")}
            submitLabel={t("deliveryList.searchAction")}
            filtersActive={filtersActive}
            filtersTitle={t("common.filters")}
            onConfirmFilters={confirmFilters}
            onDismissFilters={revertFilters}
            filters={
              <div className="delivery-list-filters">
                <DateRangePicker
                  startId="delivery-list-start-date"
                  endId="delivery-list-end-date"
                  startValue={startDateFilter.value}
                  endValue={endDateFilter.value}
                  onStartChange={(value) => startDateFilter.setValue(value)}
                  onEndChange={(value) => endDateFilter.setValue(value)}
                  startLabel={t("deliveryList.startDate")}
                  endLabel={t("deliveryList.endDate")}
                  legend={t("common.dateRange")}
                />
                <label className="orders-status-filter">
                  <span>{t("deliveryList.driverFilter")}</span>
                  <select
                    value={motorcadeFilter.value}
                    onChange={(event) =>
                      motorcadeFilter.setValue(event.target.value)
                    }
                    aria-label={t("deliveryList.driverFilter")}
                  >
                    <option value="">{t("deliveryList.allDrivers")}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="orders-status-filter">
                  <span>{t("deliveryList.shippingMethodFilter")}</span>
                  <select
                    value={shippingMethodFilter.value}
                    onChange={(event) =>
                      shippingMethodFilter.setValue(event.target.value)
                    }
                    aria-label={t("deliveryList.shippingMethodFilter")}
                  >
                    <option value="">
                      {t("deliveryList.allShippingMethods")}
                    </option>
                    {shippingMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            }
          />
        </header>

        {exportError ? (
          <p className="list-inline-error" role="alert">
            {t("deliveryList.exportError")}
          </p>
        ) : null}
        {assignError ? (
          <p className="list-inline-error" role="alert">
            {t("deliveryList.assignFleetError")}
          </p>
        ) : null}
        {cancelError && !cancelItem ? (
          <p className="list-inline-error" role="alert">
            {t("deliveryList.cancelError")}
          </p>
        ) : null}

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <Truck />
            <div>
              <strong>{t("deliveryList.loadError")}</strong>
              <span>{t("deliveryList.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw />
              {t("deliveryList.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <Truck />
            <div>
              <strong>{t("deliveryList.empty")}</strong>
              <span>{t("deliveryList.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap delivery-list-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("deliveryList.loading")}
            skeletonRows={DELIVERIES_PAGE_SIZE}
            skeletonColumns={DELIVERY_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("deliveryList.columns.no")}</th>
                <th>{t("deliveryList.columns.order")}</th>
                <th>{t("deliveryList.columns.deliveryDate")}</th>
                <th>{t("deliveryList.columns.time")}</th>
                <th>{t("deliveryList.columns.district")}</th>
                <th>{t("deliveryList.columns.address")}</th>
                <th>{t("deliveryList.columns.driver")}</th>
                <th>{t("deliveryList.columns.districtFee")}</th>
                <th>{t("deliveryList.columns.surcharge")}</th>
                <th>{t("deliveryList.columns.totalFee")}</th>
                <th>{t("deliveryList.columns.shippingMethod")}</th>
                <th>{t("deliveryList.columns.status")}</th>
              </tr>
            }
          >
            {items.map((item, index) => {
              const pickedUpTime = clockFromValue(item.takenAt);
              const deliveredTime = clockFromValue(item.fulfilledAt);
              const share = feeSharePercent(item);
              return (
                <tr key={item.id}>
                  <td>{visibleFrom + index}</td>
                  <td>
                    <div className="delivery-order-cell">
                      {item.orderId ? (
                        <Link className="order-link" to={`/orders/${item.orderId}`}>
                          {formatOrderNumber(item.orderNumber) ||
                            t("common.notSet")}
                        </Link>
                      ) : (
                        <strong>
                          {formatOrderNumber(item.orderNumber) ||
                            t("common.notSet")}
                        </strong>
                      )}
                      <span>{display(item.customerName)}</span>
                      {item.customerPhone ? (
                        <span className="delivery-order-phone">
                          {item.customerPhone}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="delivery-view-image"
                        disabled={!hasDeliveryPhotos(item)}
                        aria-label={
                          hasDeliveryPhotos(item)
                            ? t("deliveryList.viewImage")
                            : t("deliveryList.noImage")
                        }
                        title={
                          hasDeliveryPhotos(item)
                            ? t("deliveryList.viewImage")
                            : t("deliveryList.noImage")
                        }
                        onClick={() => setImageItem(item)}
                      >
                        <ImageIcon />
                        {t("deliveryList.viewImage")}
                      </Button>
                    </div>
                  </td>
                  <td>{formatDate(item.deliveryAt)}</td>
                  <td>{item.deliveryTime?.trim() || "—"}</td>
                  <td>{display(item.districtName)}</td>
                  <td>{display(item.address)}</td>
                  <td>
                    <select
                      className="delivery-fleet-select"
                      value={item.motorcadeId ?? ""}
                      disabled={assigningId === item.id}
                      aria-label={t("deliveryList.chooseFleet")}
                      onChange={(event) =>
                        void changeFleet(item, event.target.value)
                      }
                    >
                      <option value="">{t("deliveryList.chooseFleet")}</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="delivery-fee-box">
                      {formatFee(item.basicFee)}
                    </span>
                  </td>
                  <td>
                    {item.surcharges.length > 0 ? (
                      <div className="delivery-surcharge-list">
                        {item.surcharges.map((surcharge, surchargeIndex) => (
                          <span key={`${item.id}-surcharge-${surchargeIndex}`}>
                            {surcharge.name || t("deliveryList.surcharge")}
                            <strong>{formatFee(surcharge.amount, true)}</strong>
                          </span>
                        ))}
                      </div>
                    ) : item.surchargeAmount ? (
                      <span className="delivery-surcharge-list">
                        <span>
                          {t("deliveryList.surcharge")}
                          <strong>
                            {formatFee(item.surchargeAmount, true)}
                          </strong>
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="delivery-total-fee">
                      <strong>{formatFee(item.totalFee)}</strong>
                      {share !== null ? (
                        <small>
                          {t("deliveryList.orderShare", {
                            percent: Math.round(share),
                          })}
                        </small>
                      ) : null}
                    </div>
                  </td>
                  <td>{display(item.shippingMethodName)}</td>
                  <td>
                    <div className="delivery-status-cell">
                      <span
                        className={cn(
                          "status-badge",
                          isDeliveredStatus(item.deliveryStatus)
                            ? "green"
                            : item.deliveryStatus === "待取貨" ||
                                item.deliveryStatus === "已取" ||
                                item.deliveryStatus === "送貨途中"
                              ? "blue"
                              : "amber",
                        )}
                      >
                        {statusLabel(item)}
                      </span>
                      <ol className="delivery-status-steps">
                        <li className="is-pending">
                          {t("deliveryList.statuses.pendingPickup")}
                        </li>
                        <li
                          className={cn(
                            "is-picked",
                            isPickedUpStatus(item.deliveryStatus) && "is-done",
                          )}
                        >
                          {t("deliveryList.statuses.pickedUp")}
                          {pickedUpTime ? ` ${pickedUpTime}` : ""}
                        </li>
                        <li
                          className={cn(
                            "is-delivered",
                            isDeliveredStatus(item.deliveryStatus) && "is-done",
                          )}
                        >
                          {t("deliveryList.statuses.delivered")}
                          {deliveredTime ? ` ${deliveredTime}` : ""}
                        </li>
                      </ol>
                      {isPendingPickupStatus(item.deliveryStatus) ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="delivery-cancel"
                          onClick={() => {
                            setCancelError(null);
                            setCancelItem(item);
                          }}
                        >
                          {t("deliveryList.cancelDelivery")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </ListTable>
        )}

        <TablePagination
          summary={t("deliveryList.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
            fee: formatFee(pageFeeTotal),
          })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
          onPageChange={setPage}
          previousLabel={t("deliveryList.previous")}
          nextLabel={t("deliveryList.next")}
          pageLabel={t("deliveryList.pageOf")}
          jumpLabel={t("deliveryList.jumpToPage")}
        />
      </article>

      <SidePanel
        open={Boolean(imageItem)}
        title={t("deliveryList.viewImageTitle")}
        onClose={() => setImageItem(null)}
        closeLabel={t("common.closeMenu")}
        half
      >
        <div className="delivery-image-list">
          {(imageItem?.imageReferences ?? []).map((src) => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="delivery-image-link"
            >
              <img src={src} alt={t("deliveryList.viewImageTitle")} />
            </a>
          ))}
        </div>
      </SidePanel>

      <SidePanel
        open={Boolean(cancelItem)}
        title={t("deliveryList.cancelTitle")}
        description={t("deliveryList.cancelConfirm", {
          order:
            formatOrderNumber(cancelItem?.orderNumber) ||
            t("common.notSet"),
        })}
        onClose={() => {
          if (cancelling) return;
          setCancelItem(null);
        }}
        closeLabel={t("common.closeMenu")}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={cancelling}
              onClick={() => setCancelItem(null)}
            >
              {t("deliveryList.cancelKeep")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelling}
              onClick={() => void confirmCancelDelivery()}
            >
              {cancelling
                ? t("deliveryList.cancelling")
                : t("deliveryList.cancelConfirmAction")}
            </Button>
          </>
        }
      >
        {cancelError ? (
          <p className="list-inline-error" role="alert">
            {t("deliveryList.cancelError")}
          </p>
        ) : (
          <p>{t("deliveryList.cancelDescription")}</p>
        )}
      </SidePanel>
    </section>
  );
}
