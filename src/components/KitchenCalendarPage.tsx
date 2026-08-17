import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  buildKitchenCalendarGrid,
  fetchKitchenCalendarOrders,
  hongKongDateParts,
  hongKongDayKey,
  kitchenCalendarDayKey,
  kitchenCalendarDotStyle,
  kitchenCalendarLegendItemStyle,
  kitchenCalendarMonthParam,
  kitchenCalendarOrderHref,
  kitchenCalendarRangeIso,
  kitchenCalendarStatusLegend,
  KITCHEN_CALENDAR_VISIBLE_PER_DAY,
  parseKitchenCalendarMonth,
  shiftKitchenCalendarMonth,
  type KitchenCalendarOrder,
} from "@/lib/kitchen-calendar";
import { orderStatusLabel, type OrderStatusView } from "@/lib/order-statuses";
import { cn } from "@/lib/utils";

type KitchenCalendarLoader = (range: {
  start: string;
  end: string;
}) => Promise<KitchenCalendarOrder[]>;

const WEEKDAY_SUNDAY = new Date(Date.UTC(2026, 7, 16));

function orderLabel(
  order: KitchenCalendarOrder,
  fallback: string,
) {
  const number = order.orderNumber || fallback;
  const name = order.customerName || order.companyName;
  return name ? `${number} - ${name}` : number;
}

function StatusDots({ statuses }: { statuses: readonly OrderStatusView[] }) {
  const dots = statuses.length ? statuses : [{ name: "", color: null }];
  return (
    <span className="kitchen-calendar-dots" aria-hidden="true">
      {dots.map((status, index) => (
        <span
          className="kitchen-calendar-dot"
          key={`${status.name}-${index}`}
          style={kitchenCalendarDotStyle(status.color)}
        />
      ))}
    </span>
  );
}

export function KitchenCalendarPage({
  loadOrders = fetchKitchenCalendarOrders,
  now,
}: {
  loadOrders?: KitchenCalendarLoader;
  now?: Date;
}) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fallbackNow] = useState(() => new Date());
  const clock = now ?? fallbackNow;
  const todayParts = hongKongDateParts(clock);
  const todayKey = hongKongDayKey(clock);
  const { year, month } = parseKitchenCalendarMonth(
    searchParams.get("month"),
    clock,
  );
  const monthParam = kitchenCalendarMonthParam(year, month);
  const [items, setItems] = useState<KitchenCalendarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const days = useMemo(
    () => buildKitchenCalendarGrid(year, month, todayKey),
    [month, todayKey, year],
  );
  const range = useMemo(() => kitchenCalendarRangeIso(days), [days]);

  const monthDate = useMemo(
    () => new Date(Date.UTC(year, month - 1, 1)),
    [month, year],
  );
  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(monthDate),
    [i18n.language, monthDate],
  );
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      timeZone: "UTC",
    });
    return Array.from({ length: 7 }, (_, index) =>
      format.format(
        new Date(WEEKDAY_SUNDAY.getTime() + index * 86_400_000),
      ),
    );
  }, [i18n.language]);
  const selectedDayLabel = useMemo(() => {
    if (!selectedDay) return "";
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(`${selectedDay}T00:00:00Z`));
  }, [i18n.language, selectedDay]);

  const setMonth = (next: { year: number; month: number }) => {
    const params = new URLSearchParams(searchParams);
    params.set("month", kitchenCalendarMonthParam(next.year, next.month));
    setSearchParams(params, { replace: true });
    setSelectedDay(null);
  };

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadOrders(range);
      setItems(result);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "kitchen_calendar_load_failed";
      setItems([]);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [loadOrders, range, reloadKey]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const ordersByDay = useMemo(() => {
    const grouped = new Map<string, KitchenCalendarOrder[]>();
    for (const order of items) {
      const key = kitchenCalendarDayKey(order);
      if (!key) continue;
      const list = grouped.get(key);
      if (list) list.push(order);
      else grouped.set(key, [order]);
    }
    return grouped;
  }, [items]);

  const selectedOrders = selectedDay ? (ordersByDay.get(selectedDay) ?? []) : [];
  const legend = useMemo(() => kitchenCalendarStatusLegend(items), [items]);

  return (
    <section className="kitchen-calendar-page">
      <header className="page-heading kitchen-calendar-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t("navigation.productionCalendar")}</h1>
        </div>
        {legend.length > 0 ? (
          <ul
            className="kitchen-calendar-legend"
            aria-label={t("kitchenCalendar.legend")}
          >
            {legend.map((status) => (
              <li
                key={`${status.name}-${status.color ?? ""}`}
                style={kitchenCalendarLegendItemStyle(status.color)}
              >
                <span
                  className="kitchen-calendar-dot"
                  style={kitchenCalendarDotStyle(status.color)}
                  aria-hidden="true"
                />
                {status.name}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <article className="panel kitchen-calendar-panel">
        <header className="kitchen-calendar-toolbar">
          <div className="kitchen-calendar-nav">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setMonth({ year: todayParts.year, month: todayParts.month })
              }
            >
              {t("common.today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMonth(shiftKitchenCalendarMonth(year, month, -1))}
              aria-label={t("kitchenCalendar.previousMonth")}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMonth(shiftKitchenCalendarMonth(year, month, 1))}
              aria-label={t("kitchenCalendar.nextMonth")}
            >
              <ChevronRight />
            </Button>
          </div>
          <h2 className="kitchen-calendar-month">{monthTitle}</h2>
          <div className="kitchen-calendar-toolbar-spacer" aria-hidden="true" />
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <CalendarDays />
            <div>
              <strong>{t("kitchenCalendar.loadError")}</strong>
              <span>{t("kitchenCalendar.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw />
              {t("kitchenCalendar.retry")}
            </Button>
          </div>
        ) : (
          <div
            className="kitchen-calendar-grid"
            role="grid"
            aria-label={monthTitle}
            aria-busy={loading}
          >
            {weekdays.map((label, index) => (
              <div
                className="kitchen-calendar-weekday"
                key={index}
                role="columnheader"
              >
                {label}
              </div>
            ))}
            {days.map((day) => {
              const dayOrders = ordersByDay.get(day.key) ?? [];
              const visible = dayOrders.slice(0, KITCHEN_CALENDAR_VISIBLE_PER_DAY);
              const hidden = dayOrders.length - visible.length;
              return (
                <div
                  className={cn(
                    "kitchen-calendar-day",
                    !day.inMonth && "outside",
                    day.isToday && "is-today",
                  )}
                  key={day.key}
                  role="gridcell"
                  aria-selected={day.isToday}
                  aria-current={day.isToday ? "date" : undefined}
                >
                  <button
                    className="kitchen-calendar-date"
                    type="button"
                    onClick={() => setSelectedDay(day.key)}
                    aria-label={t("kitchenCalendar.openDay", {
                      date: day.key,
                      count: dayOrders.length,
                    })}
                  >
                    {day.day}
                  </button>
                  <div className="kitchen-calendar-events">
                    {loading
                      ? Array.from({ length: day.inMonth ? 2 : 0 }, (_, index) => (
                          <span
                            className="kitchen-calendar-event-skeleton"
                            key={`${day.key}-skeleton-${index}`}
                          />
                        ))
                      : visible.map((order) => {
                          const label = orderLabel(order, t("common.notSet"));
                          const statusText = orderStatusLabel(order.statuses);
                          return (
                            <Link
                              className="kitchen-calendar-event"
                              key={order.id}
                              to={kitchenCalendarOrderHref(order.id, monthParam)}
                              title={
                                statusText ? `${label} · ${statusText}` : label
                              }
                              aria-label={
                                statusText
                                  ? `${t("orders.open")} ${label} ${statusText}`
                                  : `${t("orders.open")} ${label}`
                              }
                            >
                              <StatusDots statuses={order.statuses} />
                              <span className="kitchen-calendar-event-copy">
                                {label}
                              </span>
                            </Link>
                          );
                        })}
                    {!loading && hidden > 0 ? (
                      <button
                        className="kitchen-calendar-more"
                        type="button"
                        onClick={() => setSelectedDay(day.key)}
                      >
                        {t("kitchenCalendar.more", { count: hidden })}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <SidePanel
        open={Boolean(selectedDay)}
        title={selectedDayLabel || t("navigation.productionCalendar")}
        description={t("kitchenCalendar.dayDescription", {
          count: selectedOrders.length,
        })}
        onClose={() => setSelectedDay(null)}
        closeLabel={t("kitchenCalendar.closeDay")}
      >
        {selectedOrders.length === 0 ? (
          <p className="kitchen-calendar-empty-day">
            {t("kitchenCalendar.emptyDay")}
          </p>
        ) : (
          <ul className="kitchen-calendar-day-list">
            {selectedOrders.map((order) => {
              const label = orderLabel(order, t("common.notSet"));
              const statusText = orderStatusLabel(order.statuses);
              return (
                <li key={order.id}>
                  <Link
                    className="kitchen-calendar-day-item"
                    to={kitchenCalendarOrderHref(order.id, monthParam)}
                    aria-label={
                      statusText
                        ? `${t("orders.open")} ${label} ${statusText}`
                        : `${t("orders.open")} ${label}`
                    }
                  >
                    <StatusDots statuses={order.statuses} />
                    <span className="kitchen-calendar-day-copy">
                      <strong>{order.orderNumber || t("common.notSet")}</strong>
                      <small>
                        {order.customerName ||
                          order.companyName ||
                          t("common.notSet")}
                      </small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SidePanel>
    </section>
  );
}
