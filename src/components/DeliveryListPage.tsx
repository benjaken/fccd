import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Download, Image as ImageIcon, Printer, RefreshCw, Truck } from "lucide-react";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  buildDeliveryExportCsv,
  cancelPendingDelivery,
  clockFromValue,
  DELIVERIES_PAGE_SIZE,
  downloadCsv,
  deliveryExportFilename,
  feeSharePercent,
  deliveryOrderAmount,
  fetchDeliveries,
  fetchDeliveryExportRows,
  fetchDeliveryLookups,
  hasDeliveryPhotos,
  hongKongDateInputValue,
  hongKongMonthStart,
  isDeliveredStatus,
  isPendingPickupStatus,
  showsDeliveryPhotoAction,
  toDeliveryExportRow,
  type DeliveryListFilters,
  type DeliveryListItem,
  type DeliveryListResult,
  type DeliveryLookupOption,
} from "@/lib/deliveries";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import { cn } from "@/lib/utils";
import { formatOrderNumber } from "@/lib/order-number";

type DeliveriesLoader = (
  filters: DeliveryListFilters,
) => Promise<DeliveryListResult>;
type LookupsLoader = typeof fetchDeliveryLookups;
type ExportLoader = typeof fetchDeliveryExportRows;
type CancelDelivery = typeof cancelPendingDelivery;

const DELIVERY_SKELETON_COLUMNS = [
  { width: "2.5rem" },
  { width: "6rem" },
  { width: "8rem" },
  { width: "6.5rem" },
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
  { width: "9rem", variant: "action" as const },
];

export function DeliveryListPage({
  canEdit = false,
  loadDeliveries = fetchDeliveries,
  loadLookups = fetchDeliveryLookups,
  loadExportRows = fetchDeliveryExportRows,
  cancelDelivery = cancelPendingDelivery,
  now = new Date(),
}: {
  canEdit?: boolean;
  loadDeliveries?: DeliveriesLoader;
  loadLookups?: LookupsLoader;
  loadExportRows?: ExportLoader;
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
  const [feeTotal, setFeeTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [teams, setTeams] = useState<DeliveryLookupOption[]>([]);
  const [shippingMethods, setShippingMethods] = useState<
    DeliveryLookupOption[]
  >([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printRows, setPrintRows] = useState<DeliveryListItem[]>([]);
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState(false);
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
  const selectedTeam = teams.find((team) => team.id === motorcadeId) ?? null;

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

  const formatSummaryDate = (value: string, includeYear = true) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    const [, year, month, day] = match;
    return `${includeYear ? `${Number(year)}年` : ""}${Number(month)}月${Number(day)}日`;
  };

  const formatPrintTimestamp = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}/${Number(part("month"))}/${Number(part("day"))} ${part("hour")}:${part("minute")}`;
  };

  const summaryDateRange = (() => {
    if (!startDate && !endDate) return t("common.notSet");
    if (!startDate) return formatSummaryDate(endDate);
    if (!endDate) return formatSummaryDate(startDate);
    return `${formatSummaryDate(startDate)} - ${formatSummaryDate(
      endDate,
      startDate.slice(0, 4) !== endDate.slice(0, 4),
    )}`;
  })();

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
      setFeeTotal(result.feeTotal ?? 0);
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
      setFeeTotal(0);
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
        deliveryExportFilename(t("deliveryList.title"), startDate, endDate),
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

  const openPrintPreview = async () => {
    if (!selectedTeam || printLoading) return;
    setPrintOpen(true);
    setPrintLoading(true);
    setPrintError(false);
    setPrintRows([]);
    try {
      const rows = await loadExportRows({
        search,
        startDate,
        endDate,
        motorcadeId,
        shippingMethodId,
      });
      setPrintRows(rows);
    } catch {
      setPrintError(true);
    } finally {
      setPrintLoading(false);
    }
  };

  const printTotals = useMemo(
    () =>
      printRows.reduce(
        (totals, item) => ({
          basic: totals.basic + (item.basicFee ?? 0),
          surcharge: totals.surcharge + (item.surchargeAmount ?? 0),
          total: totals.total + (item.totalFee ?? 0),
        }),
        { basic: 0, surcharge: 0, total: 0 },
      ),
    [printRows],
  );

  const renderDeliverySummarySheet = (ariaLabel?: string) => (
    <article className="delivery-summary-sheet" aria-label={ariaLabel}>
      <header>
        <time>{formatPrintTimestamp(now)}</time>
        <h1>FCCD 送貨清單</h1>
      </header>
      <dl className="delivery-summary-sheet-meta">
        <div><dt>車隊:</dt><dd>{selectedTeam?.name ?? "—"}</dd></div>
        <div><dt>日期:</dt><dd>{summaryDateRange}</dd></div>
        <div className="delivery-summary-sheet-payment"><dt>付款方式:</dt><dd>{selectedTeam?.bankAccount || "—"}</dd></div>
      </dl>
      <table>
        <thead><tr><th aria-label="序號" /><th>訂單</th><th>送貨日期</th><th>地區</th><th>地區運費</th><th>附加費</th><th>總運費</th></tr></thead>
        <tbody>
          {printRows.map((item, index) => (
            <tr key={item.id}>
              <td>{index + 1}</td>
              <td>{formatOrderNumber(item.orderNumber) || "—"}</td>
              <td>{formatDate(item.deliveryAt)}</td>
              <td>{item.districtName || "—"}</td>
              <td>{formatFee(item.basicFee)}</td>
              <td>
                {item.surcharges.length ? (
                  <div className="delivery-summary-surcharges">
                    {item.surcharges.map((fee, feeIndex) => (
                      <span key={`${item.id}-print-surcharge-${feeIndex}`}>
                        {fee.name || "附加費"} {formatFee(fee.amount, true)}
                      </span>
                    ))}
                  </div>
                ) : item.surchargeAmount ? (
                  <div className="delivery-summary-surcharges">
                    <span>附加費 {formatFee(item.surchargeAmount, true)}</span>
                  </div>
                ) : null}
              </td>
              <td>{formatFee(item.totalFee)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4} /><td>{formatFee(printTotals.basic)}</td><td>{formatFee(printTotals.surcharge, true)}</td><td>{formatFee(printTotals.total)}</td></tr></tfoot>
      </table>
    </article>
  );

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

  const statusPresentation = (item: DeliveryListItem) => {
    if (isDeliveredStatus(item.deliveryStatus)) {
      const time = clockFromValue(item.fulfilledAt, "Asia/Hong_Kong", {
        keepMidnight: true,
      });
      return {
        label: time
          ? `${t("deliveryList.statuses.delivered")} ${time}`
          : t("deliveryList.statuses.delivered"),
        tone: "green" as const,
      };
    }
    if (
      item.deliveryStatus === "已取" ||
      item.deliveryStatus === "送貨途中"
    ) {
      const time = clockFromValue(item.takenAt, "Asia/Hong_Kong", {
        keepMidnight: true,
      });
      return {
        label: time
          ? `${t("deliveryList.statuses.pickedUp")} ${time}`
          : t("deliveryList.statuses.pickedUp"),
        tone: "blue" as const,
      };
    }
    return {
      label: t("deliveryList.statuses.pendingPickup"),
      tone: "blue" as const,
    };
  };

  return (
    <section className="orders-page delivery-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("deliveryList.eyebrow")}</span>
          <h1>{t("deliveryList.title")}</h1>
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
            actions={(
              <>
                {selectedTeam ? (
                  <aside className="delivery-fleet-summary" aria-label="已選車隊資料">
                    <dl>
                      <div><dt>車隊:</dt><dd>{selectedTeam.name}</dd></div>
                      <div><dt>日期:</dt><dd>{summaryDateRange}</dd></div>
                      <div className="delivery-fleet-summary-payment"><dt>付款方式:</dt><dd>{selectedTeam.bankAccount || "—"}</dd></div>
                    </dl>
                    <Button type="button" onClick={() => void openPrintPreview()} disabled={printLoading || loading || total === 0}><Printer />列印</Button>
                  </aside>
                ) : null}
                <Button type="button" onClick={() => void exportCsv()} disabled={exporting || loading || total === 0}><Download />{exporting ? t("deliveryList.exporting") : t("deliveryList.export")}</Button>
              </>
            )}
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
                  <FilterableSelect
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
                  </FilterableSelect>
                </label>
                <label className="orders-status-filter">
                  <span>{t("deliveryList.shippingMethodFilter")}</span>
                  <FilterableSelect
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
                  </FilterableSelect>
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
                <th>{t("deliveryList.columns.customerName")}</th>
                <th>{t("deliveryList.columns.customerPhone")}</th>
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
                <th>{t("deliveryList.columns.actions")}</th>
              </tr>
            }
          >
            {items.map((item, index) => {
              const share = feeSharePercent(item);
              const orderAmount = deliveryOrderAmount(item);
              const status = statusPresentation(item);
              return (
                <tr key={item.id}>
                  <td>{visibleFrom + index}</td>
                  <td>
                    <div className="delivery-order-cell">
                      {item.orderId ? (
                        <DetailLink className="order-link" to={`/orders/${item.orderId}`} target="_blank" rel="noopener noreferrer">
                          {formatOrderNumber(item.orderNumber) ||
                            t("common.notSet")}
                        </DetailLink>
                      ) : (
                        <strong>
                          {formatOrderNumber(item.orderNumber) ||
                            t("common.notSet")}
                        </strong>
                      )}
                    </div>
                  </td>
                  <td>{display(item.customerName)}</td>
                  <td className="delivery-order-phone">
                    {item.customerPhone?.trim() || "—"}
                  </td>
                  <td>{formatDate(item.deliveryAt)}</td>
                  <td>{item.deliveryTime?.trim() || "—"}</td>
                  <td>{display(item.districtName)}</td>
                  <td>{display(item.address)}</td>
                  <td>{display(item.motorcadeName)}</td>
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
                      <strong>{formatFee(orderAmount)}</strong>
                      {share !== null ? (
                        <small>
                          {t("deliveryList.orderShare", {
                            fee: Math.round(item.totalFee ?? 0),
                            percent: Math.round(share),
                          })}
                        </small>
                      ) : null}
                    </div>
                  </td>
                  <td>{display(item.shippingMethodName)}</td>
                  <td className="delivery-status-cell">
                    <span className={cn("status-badge", status.tone)}>
                      {status.label}
                    </span>
                  </td>
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      {showsDeliveryPhotoAction(item.deliveryStatus) ? (
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
                      ) : null}
                      {canEdit && isPendingPickupStatus(item.deliveryStatus) ? (
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
            fee: formatFee(feeTotal),
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
        open={printOpen}
        title="送貨清單列印預覽"
        description="確認內容後開啟系統列印對話框。"
        onClose={() => setPrintOpen(false)}
        closeLabel="關閉列印預覽"
        half
        className="delivery-summary-panel"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPrintOpen(false)}>關閉</Button>
            <Button type="button" disabled={printLoading || printError || printRows.length === 0} onClick={() => window.print()}>
              <Printer />列印
            </Button>
          </>
        }
      >
        {printLoading ? (
          <div className="delivery-summary-print-state">正在載入送貨清單…</div>
        ) : printError ? (
          <div className="delivery-summary-print-state list-inline-error" role="alert">暫時無法載入列印資料，請稍後再試。</div>
        ) : (
          <div className="delivery-summary-preview">
            {renderDeliverySummarySheet("送貨清單列印內容")}
          </div>
        )}
      </SidePanel>

      {printOpen && !printLoading && !printError && printRows.length > 0
        ? createPortal(
            <div className="delivery-summary-print-root" aria-hidden="true">
              {renderDeliverySummarySheet()}
            </div>,
            document.body,
          )
        : null}

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
