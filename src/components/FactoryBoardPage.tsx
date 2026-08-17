import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Printer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addCalendarDays,
  buildDeliveryExportCsv,
  hongKongDateInputValue,
  toDeliveryExportRow,
  type DeliveryLookupOption,
} from "@/lib/deliveries";
import {
  UNASSIGNED_FLEET_ID,
  factoryVisibleDates,
  fetchFactoryBoard,
  fetchFactoryFleets,
  filterDispatchRows,
  fleetBadgeChar,
  groupDeliveriesByDate,
  type FactoryBoardData,
} from "@/lib/factory-board";
import { cn } from "@/lib/utils";

type FleetLoader = typeof fetchFactoryFleets;
type BoardLoader = (startDate: string) => Promise<FactoryBoardData>;

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
  initialDate,
}: {
  loadBoard?: BoardLoader;
  loadFleets?: FleetLoader;
  initialDate?: string;
}) {
  const { t, i18n } = useTranslation();
  const [startDate, setStartDate] = useState(
    () => initialDate ?? hongKongDateInputValue(),
  );
  const [board, setBoard] = useState<FactoryBoardData | null>(null);
  const [fleets, setFleets] = useState<DeliveryLookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fleetDate, setFleetDate] = useState<string | null>(null);
  const [selectedFleetId, setSelectedFleetId] = useState(UNASSIGNED_FLEET_ID);
  const [dispatch, setDispatch] = useState<{
    date: string;
    fleetId: string;
    fleetName: string;
  } | null>(null);

  const dates = board?.dates ?? factoryVisibleDates(startDate);
  const grouped = useMemo(
    () => groupDeliveriesByDate(board?.items ?? [], dates),
    [board?.items, dates],
  );
  const dispatchRows = dispatch
    ? filterDispatchRows(board?.items ?? [], dispatch.date, dispatch.fleetId)
    : [];

  useEffect(() => {
    if (!fleetDate && !dispatch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dispatch) setDispatch(null);
      else setFleetDate(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, fleetDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void Promise.all([loadBoard(startDate), loadFleets()])
      .then(([nextBoard, nextFleets]) => {
        if (cancelled) return;
        setBoard(nextBoard);
        setFleets(nextFleets);
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
  }, [loadBoard, loadFleets, startDate]);

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
    setSelectedFleetId(UNASSIGNED_FLEET_ID);
    setFleetDate(date);
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
        <p className="factory-board-notice">
          <Megaphone />
          {t("factoryBoard.stocktakeNotice")}
        </p>
        <Button type="button" variant="outline" className="factory-board-multi-day">
          {t("factoryBoard.multiDayMenu")}
        </Button>
      </header>

      <section className="factory-board-days" aria-busy={loading || undefined}>
        {dates.map((date) => (
          <article className="factory-day" key={date}>
            <header className="factory-day-header">
              <Button type="button" onClick={() => openFleetPicker(date)}>
                {t("factoryBoard.dispatchSheet")}
              </Button>
              <h2>{formatDayHeading(date)}</h2>
              <Button type="button">
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
                  const badge = fleetBadgeChar(item.motorcadeName);
                  return (
                    <article className="factory-job-card" key={item.id}>
                      <Printer aria-hidden="true" />
                      <div>
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
                      {badge ? (
                        <span className="factory-job-badge">{badge}</span>
                      ) : null}
                    </article>
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
    </main>
  );
}
