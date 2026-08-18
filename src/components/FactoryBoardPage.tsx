import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Printer,
} from "lucide-react";

import { FactoryOrderJobView } from "@/components/FactoryOrderJobView";
import { Button } from "@/components/ui/button";
import {
  addCalendarDays,
  buildDeliveryExportCsv,
  hongKongDateInputValue,
  toDeliveryExportRow,
  type DeliveryListItem,
} from "@/lib/deliveries";
import {
  ALL_BRAND_ID,
  UNASSIGNED_FLEET_ID,
  factoryVisibleDates,
  fetchFactoryBoard,
  fetchFactoryBrands,
  fetchFactoryFleets,
  fetchFactoryMenuRows,
  fetchFactoryOrderJob,
  filterDispatchRows,
  fleetBadgeForDelivery,
  groupDeliveriesByDate,
  hongKongDateKey,
  type FactoryBoardData,
  type FactoryBrand,
  type FactoryFleet,
  type FactoryMenuRow,
  type FactoryOrderJob,
} from "@/lib/factory-board";
import { cn } from "@/lib/utils";

type FleetLoader = typeof fetchFactoryFleets;
type BrandLoader = typeof fetchFactoryBrands;
type BoardLoader = (startDate: string) => Promise<FactoryBoardData>;
type OrderJobLoader = typeof fetchFactoryOrderJob;
type MenuLoader = typeof fetchFactoryMenuRows;

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
  initialDate,
}: {
  loadBoard?: BoardLoader;
  loadFleets?: FleetLoader;
  loadBrands?: BrandLoader;
  loadOrderJob?: OrderJobLoader;
  loadMenuRows?: MenuLoader;
  initialDate?: string;
}) {
  const { t, i18n } = useTranslation();
  const [startDate, setStartDate] = useState(
    () => initialDate ?? hongKongDateInputValue(),
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

  const dates = board?.dates ?? factoryVisibleDates(startDate);
  const grouped = useMemo(
    () => groupDeliveriesByDate(board?.items ?? [], dates),
    [board?.items, dates],
  );
  const dispatchRows = dispatch
    ? filterDispatchRows(board?.items ?? [], dispatch.date, dispatch.fleetId)
    : [];

  useEffect(() => {
    if (!fleetDate && !dispatch && !selectedJob && !brandDate && !menuSummary) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dispatch) setDispatch(null);
      else if (fleetDate) setFleetDate(null);
      else if (menuSummary) setMenuSummary(null);
      else if (brandDate) setBrandDate(null);
      else setSelectedJob(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [brandDate, dispatch, fleetDate, menuSummary, selectedJob]);

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

  const openJob = (item: DeliveryListItem) => {
    if (!item.orderId) return;
    setFleetDate(null);
    setDispatch(null);
    setBrandDate(null);
    setMenuSummary(null);
    setSelectedJob(item);
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
        <div className="factory-board-brand">
          <strong>{t("brand.name")}</strong>
          <small>{t("brand.system")}</small>
        </div>
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
        {selectedJob ? (
          <span />
        ) : (
          <Button type="button" variant="outline" className="factory-board-multi-day">
            {t("factoryBoard.multiDayMenu")}
          </Button>
        )}
      </header>

      {selectedJob ? (
        <FactoryOrderJobView
          item={selectedJob}
          job={orderJob}
          loading={jobLoading}
          error={jobError}
          selectedBadge={fleetBadgeForDelivery(selectedJob, fleets)}
          onBack={() => setSelectedJob(null)}
        />
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
                  return (
                    <button
                      type="button"
                      className="factory-job-card"
                      key={item.id}
                      onClick={() => openJob(item)}
                    >
                      <Printer aria-hidden="true" />
                      <div className="factory-job-card-body">
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
        <div className="factory-board-pager">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("factoryBoard.previousDays")}
            onClick={() => setStartDate((current) => addCalendarDays(current, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            className="factory-board-today"
            onClick={() => setStartDate(hongKongDateInputValue())}
          >
            {t("factoryBoard.goToday")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("factoryBoard.nextDays")}
            onClick={() => setStartDate((current) => addCalendarDays(current, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <label className="factory-board-date">
          <CalendarDays />
          <span>{t("factoryBoard.date")}</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => {
              if (event.target.value) setStartDate(event.target.value);
            }}
            aria-label={t("factoryBoard.date")}
          />
        </label>
      </footer>
      </>
      )}

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
