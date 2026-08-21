import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Printer,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";

import { FactoryOrderJobView } from "@/components/FactoryOrderJobView";
import { FactoryBrandLogo } from "@/components/FactoryBrandLogo";
import { Button } from "@/components/ui/button";
import {
  addCalendarDays,
  assignDeliveryMotorcade,
  buildDeliveryExportCsv,
  hongKongDateInputValue,
  toDeliveryExportRow,
  type DeliveryListItem,
} from "@/lib/deliveries";
import {
  ALL_BRAND_ID,
  UNASSIGNED_FLEET_ID,
  aggregateFactoryMultiDayMenuRows,
  factoryMultiDayPrintedDate,
  factoryMultiDayRangeLabels,
  factoryVisibleDates,
  fetchFactoryBoard,
  fetchFactoryBrands,
  fetchFactoryFleets,
  fetchFactoryMenuRows,
  fetchFactoryMultiDayMenu,
  fetchFactoryOrderJob,
  filterDispatchRows,
  fleetBadgeForDelivery,
  groupDeliveriesByDate,
  hongKongDateKey,
  isNewFactoryOrder,
  markFactoryOrderLinePrinted,
  type FactoryBoardData,
  type FactoryBoardItem,
  type FactoryBrand,
  type FactoryFleet,
  type FactoryMenuRow,
  type FactoryMultiDayMenuContribution,
  type FactoryOrderJob,
} from "@/lib/factory-board";
import { qzTrayClient, useQzTray, type QzTrayClient } from "@/lib/qz-tray";
import {
  fetchFactoryLabelCommand,
  type FactoryLabelCommandLoader,
} from "@/lib/factory-label";
import { cn } from "@/lib/utils";

type FleetLoader = typeof fetchFactoryFleets;
type BrandLoader = typeof fetchFactoryBrands;
type BoardLoader = (startDate: string) => Promise<FactoryBoardData>;
type OrderJobLoader = typeof fetchFactoryOrderJob;
type MenuLoader = typeof fetchFactoryMenuRows;
type MultiDayMenuLoader = typeof fetchFactoryMultiDayMenu;
type MotorcadeAssigner = typeof assignDeliveryMotorcade;
type LinePrintMarker = typeof markFactoryOrderLinePrinted;

const WEEKDAY_SHORT_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_LONG_ZH = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

function utcWeekdayIndex(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

function FactoryModal({
  open,
  title,
  titleId,
  headerTone = "default",
  headerAction,
  footer,
  wide = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  titleId: string;
  headerTone?: "default" | "dispatch";
  headerAction?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="factory-modal-root" role="presentation">
      <div className="factory-modal-backdrop" onClick={onClose} />
      <div
        className={cn("factory-modal", wide && "is-wide")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header
          className={cn(
            "factory-modal-header",
            headerTone === "dispatch" && "is-dispatch",
          )}
        >
          <h2 id={titleId}>{title}</h2>
          {headerAction}
        </header>
        <div className="factory-modal-body">{children}</div>
        {footer ? <footer className="factory-modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

function formatPortions(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return rounded.replace(/\.0$/, "");
}

export function FactoryBoardPage({
  loadBoard = fetchFactoryBoard,
  loadFleets = fetchFactoryFleets,
  loadBrands = fetchFactoryBrands,
  loadOrderJob = fetchFactoryOrderJob,
  loadMenuRows = fetchFactoryMenuRows,
  loadMultiDayMenu = fetchFactoryMultiDayMenu,
  assignMotorcade = assignDeliveryMotorcade,
  markLinePrinted = markFactoryOrderLinePrinted,
  loadLabelCommand = fetchFactoryLabelCommand,
  qzClient = qzTrayClient,
  initialDate,
  openOrdersInNewPage = true,
  openMultiDayInNewPage = true,
}: {
  loadBoard?: BoardLoader;
  loadFleets?: FleetLoader;
  loadBrands?: BrandLoader;
  loadOrderJob?: OrderJobLoader;
  loadMenuRows?: MenuLoader;
  loadMultiDayMenu?: MultiDayMenuLoader;
  assignMotorcade?: MotorcadeAssigner;
  markLinePrinted?: LinePrintMarker;
  loadLabelCommand?: FactoryLabelCommandLoader;
  qzClient?: QzTrayClient;
  initialDate?: string;
  openOrdersInNewPage?: boolean;
  openMultiDayInNewPage?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qz = useQzTray({ client: qzClient, autoConnect: false });
  const [startDate, setStartDate] = useState(
    () => initialDate ?? addCalendarDays(hongKongDateInputValue(), -1),
  );
  const [board, setBoard] = useState<FactoryBoardData | null>(null);
  const [fleets, setFleets] = useState<FactoryFleet[]>([]);
  const [brands, setBrands] = useState<FactoryBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fleetDate, setFleetDate] = useState<string | null>(null);
  const [selectedFleetId, setSelectedFleetId] = useState(UNASSIGNED_FLEET_ID);
  const [dispatch, setDispatch] = useState<{
    date: string;
    fleetId: string;
    fleetName: string;
  } | null>(null);
  const [brandDate, setBrandDate] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState(ALL_BRAND_ID);
  const [menuSummary, setMenuSummary] = useState<{
    date: string;
    brandId: string;
    brandName: string;
  } | null>(null);
  const [menuRows, setMenuRows] = useState<FactoryMenuRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<DeliveryListItem | null>(null);
  const [orderJob, setOrderJob] = useState<FactoryOrderJob | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState(false);
  const [pendingReprintJob, setPendingReprintJob] =
    useState<DeliveryListItem | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState("");
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [multiDayReport, setMultiDayReport] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [multiDayRows, setMultiDayRows] = useState<
    FactoryMultiDayMenuContribution[]
  >([]);
  const [multiDayLoading, setMultiDayLoading] = useState(false);
  const [multiDayError, setMultiDayError] = useState(false);
  const [activeMultiDayBrandIds, setActiveMultiDayBrandIds] = useState<string[]>([]);

  const dates = board?.dates ?? factoryVisibleDates(startDate);
  const grouped = useMemo(
    () => groupDeliveriesByDate(board?.items ?? [], dates),
    [board?.items, dates],
  );
  const dispatchRows = dispatch
    ? filterDispatchRows(board?.items ?? [], dispatch.date, dispatch.fleetId)
    : [];
  const activeMultiDayBrands = useMemo(
    () => new Set(activeMultiDayBrandIds),
    [activeMultiDayBrandIds],
  );
  const aggregatedMultiDayRows = useMemo(
    () => aggregateFactoryMultiDayMenuRows(multiDayRows, activeMultiDayBrands),
    [activeMultiDayBrands, multiDayRows],
  );
  const multiDayBrandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of multiDayRows) {
      if (!row.brandId) continue;
      counts.set(row.brandId, (counts.get(row.brandId) ?? 0) + row.quantity);
    }
    return counts;
  }, [multiDayRows]);

  useEffect(() => {
    if (
      !fleetDate &&
      !dispatch &&
      !selectedJob &&
      !brandDate &&
      !menuSummary &&
      !datePickerOpen &&
      !rangePickerOpen &&
      !pendingReprintJob
    ) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dispatch) setDispatch(null);
      else if (fleetDate) setFleetDate(null);
      else if (menuSummary) setMenuSummary(null);
      else if (brandDate) setBrandDate(null);
      else if (datePickerOpen) setDatePickerOpen(false);
      else if (rangePickerOpen) setRangePickerOpen(false);
      else if (pendingReprintJob) setPendingReprintJob(null);
      else setSelectedJob(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    brandDate,
    datePickerOpen,
    dispatch,
    fleetDate,
    menuSummary,
    pendingReprintJob,
    rangePickerOpen,
    selectedJob,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void Promise.all([
      loadBoard(startDate),
      loadFleets(),
      loadBrands().catch(() => [] as FactoryBrand[]),
    ])
      .then(([nextBoard, nextFleets, nextBrands]) => {
        if (cancelled) return;
        setBoard(nextBoard);
        setFleets(nextFleets);
        setBrands(nextBrands);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadBoard, loadBrands, loadFleets, startDate]);

  useEffect(() => {
    const orderId = selectedJob?.orderId;
    if (!orderId) {
      setOrderJob(null);
      setJobError(false);
      setJobLoading(false);
      return;
    }
    let cancelled = false;
    setJobLoading(true);
    setJobError(false);
    void loadOrderJob(orderId)
      .then((next) => {
        if (!cancelled) setOrderJob(next);
      })
      .catch(() => {
        if (!cancelled) setJobError(true);
      })
      .finally(() => {
        if (!cancelled) setJobLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOrderJob, selectedJob?.orderId]);

  useEffect(() => {
    if (!menuSummary) {
      setMenuRows([]);
      setMenuLoading(false);
      return;
    }
    const orderIds = (board?.items ?? [])
      .filter(
        (item) =>
          item.orderId &&
          item.deliveryAt &&
          hongKongDateKey(item.deliveryAt) === menuSummary.date,
      )
      .map((item) => item.orderId as string);
    let cancelled = false;
    setMenuLoading(true);
    void loadMenuRows(orderIds, menuSummary.brandId)
      .then((rows) => {
        if (!cancelled) setMenuRows(rows);
      })
      .catch(() => {
        if (!cancelled) setMenuRows([]);
      })
      .finally(() => {
        if (!cancelled) setMenuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board?.items, loadMenuRows, menuSummary]);

  useEffect(() => {
    if (!multiDayReport) {
      setMultiDayRows([]);
      setMultiDayLoading(false);
      setMultiDayError(false);
      return;
    }
    let cancelled = false;
    setMultiDayLoading(true);
    setMultiDayError(false);
    void loadMultiDayMenu(multiDayReport.startDate, multiDayReport.endDate)
      .then((rows) => {
        if (!cancelled) setMultiDayRows(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setMultiDayRows([]);
          setMultiDayError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setMultiDayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMultiDayMenu, multiDayReport]);

  const formatDayHeading = (isoDate: string) => {
    const [, month, day] = isoDate.split("-").map(Number);
    const weekday = i18n.language.startsWith("zh")
      ? WEEKDAY_SHORT_ZH[utcWeekdayIndex(isoDate)]
      : new Intl.DateTimeFormat(i18n.language, {
          weekday: "short",
          timeZone: "UTC",
        }).format(
          new Date(Date.UTC(Number(isoDate.slice(0, 4)), (month ?? 1) - 1, day ?? 1)),
        );
    return t("factoryBoard.dayHeading", {
      month,
      day,
      weekday,
    });
  };

  const formatDispatchTitle = (isoDate: string, fleetName: string) => {
    const [, month, day] = isoDate.split("-").map(Number);
    const weekday = i18n.language.startsWith("zh")
      ? WEEKDAY_LONG_ZH[utcWeekdayIndex(isoDate)]
      : new Intl.DateTimeFormat(i18n.language, {
          weekday: "long",
          timeZone: "UTC",
        }).format(
          new Date(Date.UTC(Number(isoDate.slice(0, 4)), (month ?? 1) - 1, day ?? 1)),
        );
    return t("factoryBoard.dispatchTitle", {
      month: String(month).padStart(2, "0"),
      day: String(day).padStart(2, "0"),
      weekday,
      fleet: fleetName,
    });
  };

  const formatPickerDate = (isoDate: string) => {
    const [, month, day] = isoDate.split("-");
    return t("factoryBoard.fleetPickerDate", {
      day,
      month,
      year: isoDate.slice(0, 4),
    });
  };

  const openFleetPicker = (date: string) => {
    setDispatch(null);
    setBrandDate(null);
    setMenuSummary(null);
    setSelectedFleetId(UNASSIGNED_FLEET_ID);
    setFleetDate(date);
  };

  const openBrandPicker = (date: string) => {
    setDispatch(null);
    setFleetDate(null);
    setMenuSummary(null);
    setSelectedBrandId(ALL_BRAND_ID);
    setBrandDate(date);
  };

  const enterJob = (item: DeliveryListItem) => {
    if (!item.orderId) return;
    if (openOrdersInNewPage) {
      window.open(
        `/factory/order/${encodeURIComponent(item.id)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    setFleetDate(null);
    setDispatch(null);
    setBrandDate(null);
    setMenuSummary(null);
    setSelectedJob(item);
    // Re-check QZ Tray when entering a work order so colleagues know the
    // label printer is available before they try to print.
    void qz.connect();
  };

  const openJob = (item: FactoryBoardItem) => {
    if (item.factorySource === "meat") {
      window.open(
        `/factory/meat-delivery-note/${encodeURIComponent(item.id)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    if (!item.orderId) return;
    if (board?.printStatusByOrderId?.[item.orderId] === "needs-reprint") {
      setPendingReprintJob(item);
      return;
    }
    enterJob(item);
  };

  const submitFleet = () => {
    if (!fleetDate) return;
    const fleetName =
      selectedFleetId === UNASSIGNED_FLEET_ID
        ? t("factoryBoard.unassignedFleet")
        : (fleets.find((fleet) => fleet.id === selectedFleetId)?.name ??
          t("factoryBoard.unassignedFleet"));
    setDispatch({
      date: fleetDate,
      fleetId: selectedFleetId,
      fleetName,
    });
    setFleetDate(null);
  };

  const submitBrand = () => {
    if (!brandDate) return;
    const brandName =
      selectedBrandId === ALL_BRAND_ID
        ? t("factoryBoard.allBrands")
        : (brands.find((brand) => brand.id === selectedBrandId)?.name ??
          t("factoryBoard.allBrands"));
    setMenuSummary({
      date: brandDate,
      brandId: selectedBrandId,
      brandName,
    });
    setBrandDate(null);
  };

  const openMultiDayPicker = () => {
    setRangeStart("");
    setRangeEnd("");
    setRangePickerOpen(true);
  };

  const submitMultiDayRange = () => {
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return;
    if (openMultiDayInNewPage) {
      const query = new URLSearchParams({ start: rangeStart, end: rangeEnd });
      window.open(
        `/factory/multi-day-menu?${query.toString()}`,
        "_blank",
        "noopener,noreferrer",
      );
      setRangePickerOpen(false);
      return;
    }
    setActiveMultiDayBrandIds(brands.map((brand) => brand.id));
    setMultiDayReport({ startDate: rangeStart, endDate: rangeEnd });
    setRangePickerOpen(false);
  };

  const exportDispatch = () => {
    const empty = t("common.notSet");
    const csv = buildDeliveryExportCsv(
      dispatchRows.map((item) =>
        toDeliveryExportRow(item, empty, () => dispatch?.date ?? empty),
      ),
      {
        orderNumber: t("factoryBoard.columns.orderNumber"),
        deliveryDate: t("factoryBoard.columns.date"),
        deliveryTime: t("factoryBoard.columns.dispatchTime"),
        customerName: t("factoryBoard.columns.customerName"),
        customerPhone: t("factoryBoard.columns.customerPhone"),
        district: t("factoryBoard.columns.district"),
        address: t("factoryBoard.columns.address"),
        shippingMethod: t("deliveryList.exportColumns.shippingMethod"),
        fleet: t("deliveryList.exportColumns.fleet"),
      },
    );
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `factory-dispatch-${dispatch?.date ?? "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="factory-board">
      <header className="factory-board-top">
        <FactoryBrandLogo />
        <p
          className="factory-board-notice"
          aria-label={t("factoryBoard.stocktakeNotice")}
        >
          <span aria-hidden="true">📢</span>
          <span>{t("factoryBoard.stocktakeNoticeBefore")}</span>
          <span className="factory-board-notice-day">
            {t("factoryBoard.stocktakeNoticeDay")}
          </span>
          {t("factoryBoard.stocktakeNoticeAfter") ? (
            <span>{t("factoryBoard.stocktakeNoticeAfter")}</span>
          ) : null}
        </p>
        <div className="factory-board-actions">
          {selectedJob || multiDayReport ? null : (
            <Button
              type="button"
              variant="outline"
              className="factory-board-multi-day"
              disabled={loading}
              onClick={openMultiDayPicker}
            >
              {t("factoryBoard.multiDayMenu")}
            </Button>
          )}
        </div>
      </header>

      {selectedJob ? (
        <FactoryOrderJobView
          item={selectedJob}
          job={orderJob}
          loading={jobLoading}
          error={jobError}
          selectedBadge={fleetBadgeForDelivery(selectedJob, fleets)}
          fleets={fleets}
          assignMotorcade={assignMotorcade}
          markLinePrinted={markLinePrinted}
          loadLabelCommand={loadLabelCommand}
          onLinePrinted={(lineId) => {
            setOrderJob((current) => {
              if (!current) return current;
              const lines = current.lines.map((line) =>
                line.id === lineId
                  ? { ...line, printed: true, requiresReprint: false }
                  : line,
              );
              const allPrinted = lines.length > 0 && lines.every((line) => line.printed);
              if (selectedJob.orderId) {
                setBoard((currentBoard) =>
                  currentBoard
                    ? {
                        ...currentBoard,
                        printStatusByOrderId: {
                          ...(currentBoard.printStatusByOrderId ?? {}),
                          [selectedJob.orderId as string]: allPrinted
                            ? "complete"
                            : current.requiresReprint
                              ? "needs-reprint"
                              : "incomplete",
                        },
                      }
                    : currentBoard,
                );
              }
              return {
                ...current,
                lines,
                requiresReprint: allPrinted ? false : current.requiresReprint,
              };
            });
          }}
          onAssigned={(fleet) => {
            setBoard((current) =>
              current
                ? {
                    ...current,
                    items: current.items.map((item) =>
                      item.id === selectedJob.id
                        ? {
                            ...item,
                            motorcadeId: fleet.id,
                            motorcadeName: fleet.name,
                          }
                        : item,
                    ),
                  }
                : current,
            );
            setSelectedJob((current) =>
              current
                ? {
                    ...current,
                    motorcadeId: fleet.id,
                    motorcadeName: fleet.name,
                  }
                : current,
            );
          }}
          qz={qz}
          onBack={() => setSelectedJob(null)}
        />
      ) : multiDayReport ? (
        <section className="factory-multi-day-report">
          <header className="factory-multi-day-report-header">
            <Button
              type="button"
              variant="outline"
              className="factory-multi-day-back no-print"
              onClick={() => setMultiDayReport(null)}
            >
              <ArrowLeft aria-hidden="true" />
              {t("factoryBoard.back")}
            </Button>
            <h1>
              {t("factoryBoard.multiDayReportTitle", {
                ...factoryMultiDayRangeLabels(
                  multiDayReport.startDate,
                  multiDayReport.endDate,
                  i18n.language.startsWith("zh"),
                ),
              })}
            </h1>
            <p>
              {t("factoryBoard.printedAt", {
                date: factoryMultiDayPrintedDate(new Date(), i18n.language),
              })}
            </p>
            <Button
              type="button"
              className="factory-multi-day-print no-print"
              onClick={() => window.print()}
            >
              <Printer aria-hidden="true" />
              {t("factoryBoard.print")}
            </Button>
          </header>

          <div className="factory-multi-day-brands" aria-label={t("factoryBoard.brands")}>
            {brands
              .filter((brand) => activeMultiDayBrands.has(brand.id))
              .map((brand) => (
                <span className="factory-multi-day-brand" key={brand.id}>
                  <button
                    type="button"
                    className="no-print"
                    aria-label={t("factoryBoard.removeBrand", { name: brand.name })}
                    title={t("factoryBoard.removeBrand", { name: brand.name })}
                    onClick={() =>
                      setActiveMultiDayBrandIds((current) =>
                        current.filter((brandId) => brandId !== brand.id),
                      )
                    }
                  >
                    <X aria-hidden="true" />
                  </button>
                  <span>{brand.name}</span>
                  <strong>[{formatPortions(multiDayBrandCounts.get(brand.id)) ?? "0"}]</strong>
                </span>
              ))}
          </div>

          {multiDayLoading ? (
            <p className="factory-multi-day-state">{t("common.loading")}</p>
          ) : multiDayError ? (
            <p className="factory-multi-day-state">{t("factoryBoard.multiDayLoadError")}</p>
          ) : aggregatedMultiDayRows.length === 0 ? (
            <p className="factory-multi-day-state">{t("factoryBoard.emptyMultiDayMenu")}</p>
          ) : (
            <div className="factory-multi-day-table-wrap">
              <table className="factory-multi-day-table">
                <thead>
                  <tr>
                    <th>{t("factoryBoard.menuDish")}</th>
                    <th>{t("factoryBoard.multiDayTotal")}</th>
                    <th>{t("factoryBoard.orders")}</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedMultiDayRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{formatPortions(row.quantity)}</td>
                      <td>
                        <div className="factory-multi-day-orders">
                          {row.orders.map((order) => (
                            <span key={order.orderId}>
                              {order.deliveryDate.slice(5).replace("-", "/")}
                              {order.deliveryTime ? ` ${order.deliveryTime}` : ""}
                              {` · #${order.orderNumber?.replace(/^#/, "") || order.orderId}`}
                              {` × ${formatPortions(order.quantity)}`}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
      <>
      <section className="factory-board-days" aria-busy={loading || undefined}>
        {dates.map((date) => (
          <article className="factory-day" key={date}>
            <header className="factory-day-header">
              <Button type="button" onClick={() => openFleetPicker(date)}>
                {t("factoryBoard.dispatchSheet")}
              </Button>
              <h2>{formatDayHeading(date)}</h2>
              <Button type="button" onClick={() => openBrandPicker(date)}>
                {t("factoryBoard.menuSummary")}
              </Button>
            </header>
            <div className="factory-day-cards">
              {loading ? (
                <p className="factory-day-state">{t("common.loading")}</p>
              ) : error ? (
                <p className="factory-day-state">{t("factoryBoard.loadError")}</p>
              ) : (grouped[date] ?? []).length === 0 ? (
                <p className="factory-day-state">{t("factoryBoard.emptyDay")}</p>
              ) : (
                (grouped[date] ?? []).map((item) => {
                  const portions = formatPortions(
                    item.orderId
                      ? board?.portionsByOrderId[item.orderId]
                      : undefined,
                  );
                  const badge = fleetBadgeForDelivery(item, fleets);
                  const printStatus =
                    item.factorySource === "meat"
                      ? item.factoryPrintStatus
                      : item.orderId
                        ? board?.printStatusByOrderId?.[item.orderId]
                        : undefined;
                  const newOrder =
                    item.factorySource !== "meat" &&
                    isNewFactoryOrder(item.factorySentAt);
                  return (
                    <button
                      type="button"
                      className={cn(
                        "factory-job-card",
                        item.factorySource === "meat" && "is-meat",
                      )}
                      key={item.id}
                      onClick={() => openJob(item)}
                    >
                      {newOrder ? <span className="factory-new-order-corner" title={t("factoryBoard.newOrder")}><Star aria-label={t("factoryBoard.newOrder")} /></span> : null}
                      <span
                        className={cn(
                          "factory-job-print-status",
                          printStatus === "complete" && "is-complete",
                          printStatus === "needs-reprint" && "needs-reprint",
                        )}
                        title={
                          printStatus === "complete"
                            ? t("factoryBoard.allLabelsPrinted")
                            : printStatus === "needs-reprint"
                              ? t("factoryBoard.reprintRequired")
                              : undefined
                        }
                      >
                        {printStatus === "complete" ? (
                          <Printer
                            aria-label={t("factoryBoard.allLabelsPrinted")}
                          />
                        ) : printStatus === "needs-reprint" ? (
                          <TriangleAlert
                            aria-label={t("factoryBoard.reprintRequired")}
                          />
                        ) : null}
                      </span>
                      <div className="factory-job-card-body">
                        {item.factorySource === "meat" ? (
                          <>
                            <strong>{item.orderNumber || t("common.notSet")}</strong>
                            <span>{item.customerName || t("common.notSet")}</span>
                          </>
                        ) : (
                          <>
                            <strong>{item.deliveryTime || t("common.notSet")}</strong>
                            <span>
                              {item.districtName || t("common.notSet")}
                            </span>
                            <span>
                              {item.orderNumber
                                ? `#${item.orderNumber.replace(/^#/, "")}`
                                : t("common.notSet")}
                            </span>
                            {portions ? (
                              <small>
                                {t("factoryBoard.portions", { count: portions })}
                              </small>
                            ) : null}
                            {newOrder ? <small className="factory-new-order-tag">{t("factoryBoard.newOrder")}</small> : null}
                          </>
                        )}
                      </div>
                      <span
                        className={
                          badge ? "factory-job-badge" : "factory-job-badge is-empty"
                        }
                      >
                        {badge || "\u00a0"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </article>
        ))}
      </section>

      <footer className="factory-board-footer">
        <button
          type="button"
          className="factory-board-calendar"
          onClick={() =>
            window.open(
              "/factory/production-calendar",
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          <CalendarDays aria-hidden="true" />
          <span>{t("factoryBoard.productionCalendar")}</span>
        </button>
        <div className="factory-board-pager">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("factoryBoard.previousDays")}
            onClick={() => setStartDate((current) => addCalendarDays(current, -3))}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            className="factory-board-today"
            onClick={() =>
              setStartDate(addCalendarDays(hongKongDateInputValue(), -1))
            }
          >
            {t("factoryBoard.goToday")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("factoryBoard.nextDays")}
            onClick={() => setStartDate((current) => addCalendarDays(current, 3))}
          >
            <ChevronRight />
          </Button>
        </div>
        <button
          type="button"
          className="factory-board-date"
          aria-label={t("factoryBoard.date")}
          onClick={() => {
            setJumpDate(startDate);
            setDatePickerOpen(true);
          }}
        >
          <CalendarDays aria-hidden="true" />
          <span>{t("factoryBoard.date")}</span>
        </button>
      </footer>
      </>
      )}

      <FactoryModal
        open={datePickerOpen}
        title={t("factoryBoard.chooseDate")}
        titleId="factory-date-picker-title"
        onClose={() => setDatePickerOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDatePickerOpen(false)}
            >
              {t("factoryBoard.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!jumpDate}
              onClick={() => {
                if (!jumpDate) return;
                setStartDate(jumpDate);
                setDatePickerOpen(false);
              }}
            >
              {t("factoryBoard.confirmDate")}
            </Button>
          </>
        }
      >
        <label className="factory-date-jump">
          <span>{t("factoryBoard.chooseDate")}</span>
          <input
            type="date"
            value={jumpDate}
            onChange={(event) => setJumpDate(event.target.value)}
          />
        </label>
      </FactoryModal>

      <FactoryModal
        open={Boolean(pendingReprintJob)}
        title={t("factoryBoard.reprintWarningTitle")}
        titleId="factory-reprint-warning-title"
        onClose={() => setPendingReprintJob(null)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingReprintJob(null)}
            >
              {t("factoryBoard.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                const item = pendingReprintJob;
                setPendingReprintJob(null);
                if (item) enterJob(item);
              }}
            >
              {t("factoryBoard.continueToOrder")}
            </Button>
          </>
        }
      >
        <div className="factory-reprint-warning">
          <TriangleAlert aria-hidden="true" />
          <p>
            {t("factoryBoard.reprintWarningDescription", {
              order: pendingReprintJob?.orderNumber?.replace(/^#/, "") ?? "",
            })}
          </p>
        </div>
      </FactoryModal>

      <FactoryModal
        open={rangePickerOpen}
        title={t("factoryBoard.chooseDateRange")}
        titleId="factory-multi-day-range-title"
        onClose={() => setRangePickerOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRangePickerOpen(false)}
            >
              {t("factoryBoard.close")}
            </Button>
            <Button
              type="button"
              disabled={!rangeStart || !rangeEnd || rangeEnd < rangeStart}
              onClick={submitMultiDayRange}
            >
              {t("factoryBoard.next")}
            </Button>
          </>
        }
      >
        <div className="factory-date-range-fields">
          <label>
            <span>{t("factoryBoard.startDate")}</span>
            <input
              type="date"
              value={rangeStart}
              max={rangeEnd || undefined}
              onChange={(event) => setRangeStart(event.target.value)}
            />
          </label>
          <span aria-hidden="true">—</span>
          <label>
            <span>{t("factoryBoard.endDate")}</span>
            <input
              type="date"
              value={rangeEnd}
              min={rangeStart || undefined}
              onChange={(event) => setRangeEnd(event.target.value)}
            />
          </label>
        </div>
      </FactoryModal>

      <FactoryModal
        open={Boolean(fleetDate)}
        title={t("factoryBoard.chooseFleetTitle", {
          date: fleetDate ? formatPickerDate(fleetDate) : "",
        })}
        titleId="factory-fleet-title"
        onClose={() => setFleetDate(null)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFleetDate(null)}
            >
              {t("factoryBoard.close")}
            </Button>
            <Button type="button" onClick={submitFleet}>
              {t("factoryBoard.submit")}
            </Button>
          </>
        }
      >
        <div className="factory-fleet-chips">
          {fleets.map((fleet) => (
            <button
              key={fleet.id}
              type="button"
              className={cn(
                "factory-fleet-chip",
                selectedFleetId === fleet.id && "is-selected",
              )}
              onClick={() => setSelectedFleetId(fleet.id)}
            >
              {fleet.name}
            </button>
          ))}
          <button
            type="button"
            className={cn(
              "factory-fleet-chip is-unassigned",
              selectedFleetId === UNASSIGNED_FLEET_ID && "is-selected",
            )}
            onClick={() => setSelectedFleetId(UNASSIGNED_FLEET_ID)}
          >
            {t("factoryBoard.unassignedFleet")}
          </button>
        </div>
      </FactoryModal>

      <FactoryModal
        open={Boolean(brandDate)}
        title={t("factoryBoard.chooseBrandTitle", {
          date: brandDate ? formatPickerDate(brandDate) : "",
        })}
        titleId="factory-brand-title"
        onClose={() => setBrandDate(null)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBrandDate(null)}
            >
              {t("factoryBoard.close")}
            </Button>
            <Button type="button" onClick={submitBrand}>
              {t("factoryBoard.submit")}
            </Button>
          </>
        }
      >
        <div className="factory-fleet-chips">
          <button
            type="button"
            className={cn(
              "factory-fleet-chip",
              selectedBrandId === ALL_BRAND_ID && "is-selected",
            )}
            onClick={() => setSelectedBrandId(ALL_BRAND_ID)}
          >
            {t("factoryBoard.allBrands")}
          </button>
          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              className={cn(
                "factory-fleet-chip",
                selectedBrandId === brand.id && "is-selected",
              )}
              onClick={() => setSelectedBrandId(brand.id)}
            >
              {brand.name}
            </button>
          ))}
        </div>
      </FactoryModal>

      <FactoryModal
        open={Boolean(dispatch)}
        title={
          dispatch
            ? formatDispatchTitle(dispatch.date, dispatch.fleetName)
            : t("factoryBoard.dispatchSheet")
        }
        titleId="factory-dispatch-title"
        headerTone="dispatch"
        wide
        onClose={() => setDispatch(null)}
        headerAction={
          <Button type="button" variant="outline" onClick={exportDispatch}>
            {t("factoryBoard.export")}
          </Button>
        }
        footer={
          <Button type="button" variant="outline" onClick={() => setDispatch(null)}>
            {t("factoryBoard.close")}
          </Button>
        }
      >
        {dispatchRows.length === 0 ? (
          <p className="factory-day-state">{t("factoryBoard.emptyDispatch")}</p>
        ) : (
          <div className="factory-dispatch-table-wrap">
            <table className="factory-dispatch-table">
              <thead>
                <tr>
                  <th>{t("factoryBoard.columns.item")}</th>
                  <th>{t("factoryBoard.columns.orderNumber")}</th>
                  <th>{t("factoryBoard.columns.customerName")}</th>
                  <th>{t("factoryBoard.columns.customerPhone")}</th>
                  <th>{t("factoryBoard.columns.district")}</th>
                  <th>{t("factoryBoard.columns.dispatchTime")}</th>
                  <th>{t("factoryBoard.columns.arrivalTime")}</th>
                  <th>{t("factoryBoard.columns.address")}</th>
                </tr>
              </thead>
              <tbody>
                {dispatchRows.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.orderNumber || t("common.notSet")}</td>
                    <td>{item.customerName || t("common.notSet")}</td>
                    <td>{item.customerPhone || t("common.notSet")}</td>
                    <td>{item.districtName || t("common.notSet")}</td>
                    <td>{item.deliveryTime || t("common.notSet")}</td>
                    <td>{item.deliveryTime || t("common.notSet")}</td>
                    <td>{item.address || t("common.notSet")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FactoryModal>

      <FactoryModal
        open={Boolean(menuSummary)}
        title={
          menuSummary
            ? formatDispatchTitle(menuSummary.date, menuSummary.brandName)
            : t("factoryBoard.menuSummary")
        }
        titleId="factory-menu-title"
        headerTone="dispatch"
        wide
        onClose={() => setMenuSummary(null)}
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => setMenuSummary(null)}
          >
            {t("factoryBoard.close")}
          </Button>
        }
      >
        {menuLoading ? (
          <p className="factory-day-state">{t("common.loading")}</p>
        ) : menuRows.length === 0 ? (
          <p className="factory-day-state">{t("factoryBoard.emptyMenu")}</p>
        ) : (
          <div className="factory-dispatch-table-wrap">
            <table className="factory-dispatch-table">
              <thead>
                <tr>
                  <th>{t("factoryBoard.columns.item")}</th>
                  <th>{t("factoryBoard.menuDish")}</th>
                  <th>{t("factoryBoard.menuQuantity")}</th>
                </tr>
              </thead>
              <tbody>
                {menuRows.map((row, index) => (
                  <tr key={`${row.label}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{row.label}</td>
                    <td>{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FactoryModal>
    </main>
  );
}
