import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  buildKitchenCalendarGrid,
  fetchKitchenCalendarOrders,
  hongKongDateParts,
  hongKongDayKey,
  isPendingShopifyOrder,
  kitchenCalendarDayKey,
  kitchenCalendarMonthParam,
  kitchenCalendarOrderHref,
  kitchenCalendarRangeIso,
  kitchenCalendarStatus,
  kitchenCalendarTone,
  KITCHEN_CALENDAR_VISIBLE_PER_DAY,
  parseKitchenCalendarMonth,
  shiftKitchenCalendarMonth,
  type KitchenCalendarOrder,
} from "@/lib/kitchen-calendar";
import { isOrderDelivered } from "@/lib/orders";
import { isNewFactoryOrder } from "@/lib/factory-board";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type KitchenCalendarLoader = (range: {
  start: string;
  end: string;
}) => Promise<KitchenCalendarOrder[]>;

const WEEKDAY_SUNDAY = new Date(Date.UTC(2026, 7, 16));
const DAY_IN_MS = 86_400_000;

type MobileCalendarCopy = {
  all: string;
  display: string;
  exceptionOnly: string;
  exceptions: string;
  factory: string;
  filterAll: string;
  filterExceptions: string;
  morning: string;
  afternoon: string;
  evening: string;
  monthView: string;
  nextWeek: string;
  noOrders: string;
  orders: string;
  paid: string;
  payment: string;
  paymentIncomplete: string;
  previousWeek: string;
  sent: string;
  unset: string;
  unsent: string;
  weekView: string;
};

function mobileCalendarCopy(language: string): MobileCalendarCopy {
  if (language.startsWith("zh")) {
    return {
      all: "全部",
      display: "顯示：",
      exceptionOnly: "例外",
      exceptions: "項例外",
      factory: "工場",
      filterAll: "顯示全部訂單",
      filterExceptions: "只顯示例外訂單",
      morning: "上午",
      afternoon: "下午",
      evening: "晚上",
      monthView: "月視圖",
      nextWeek: "下一週",
      noOrders: "當日沒有出餐訂單",
      orders: "張訂單",
      paid: "完成",
      payment: "付款",
      paymentIncomplete: "未完成",
      previousWeek: "上一週",
      sent: "已傳",
      unset: "待確認",
      unsent: "未傳",
      weekView: "週視圖",
    };
  }

  return {
    all: "All",
    display: "Show: ",
    exceptionOnly: "Exceptions",
    exceptions: "exceptions",
    factory: "Factory",
    filterAll: "Show all orders",
    filterExceptions: "Show exceptions only",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    monthView: "Month view",
    nextWeek: "Next week",
    noOrders: "No serving orders on this day",
    orders: "orders",
    paid: "Complete",
    payment: "Payment",
    paymentIncomplete: "Incomplete",
    previousWeek: "Previous week",
    sent: "Sent",
    unset: "Pending",
    unsent: "Not sent",
    weekView: "Week view",
  };
}

function utcDateFromDayKey(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

function dayKeyFromUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekStartForDay(key: string) {
  const date = utcDateFromDayKey(key);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - mondayOffset * DAY_IN_MS);
}

function orderTime(order: KitchenCalendarOrder, language: string) {
  const explicit = order.deliveryTime?.match(/\b(\d{1,2}):(\d{2})\b/);
  if (explicit) {
    return `${explicit[1].padStart(2, "0")}:${explicit[2]}`;
  }
  if (!order.deliveryAt) return "--:--";
  const date = new Date(order.deliveryAt);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function orderPeriod(order: KitchenCalendarOrder, language: string) {
  const hour = Number.parseInt(orderTime(order, language).slice(0, 2), 10);
  if (!Number.isFinite(hour) || hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function isCalendarException(order: KitchenCalendarOrder) {
  if (isOrderDelivered(order.deliveryStatus)) return false;
  return order.isSentToFactory === false || (order.outstanding ?? 0) > 0;
}

function orderLabel(
  order: KitchenCalendarOrder,
  fallback: string,
) {
  const number = order.orderNumber || fallback;
  const name = order.customerName || order.companyName;
  const base = name ? `${number} - ${name}` : number;
  const withDistrict = order.districtName
    ? `${base} - ${order.districtName}`
    : base;
  return isPendingShopifyOrder(order) && order.deliveryTime
    ? `${withDistrict} (${order.deliveryTime})`
    : withDistrict;
}

function operationalStatusLabel(
  order: KitchenCalendarOrder,
  t: (key: string) => string,
) {
  const status = kitchenCalendarStatus(order);
  if (status === "awaitingDriver") return t("dashboard.driverStatus");
  return t(`orders.statuses.${status}`);
}

function KitchenCalendarMobile({
  days,
  error,
  language,
  loading,
  month,
  monthParam,
  monthTitle,
  onRetry,
  ordersByDay,
  setMonth,
  t,
  todayKey,
  todayParts,
  year,
  linkOrders = true,
  factoryMode = false,
  now,
}: {
  days: ReturnType<typeof buildKitchenCalendarGrid>;
  error: string | null;
  language: string;
  loading: boolean;
  month: number;
  monthParam: string;
  monthTitle: string;
  onRetry: () => void;
  ordersByDay: Map<string, KitchenCalendarOrder[]>;
  setMonth: (next: { year: number; month: number }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  todayKey: string;
  todayParts: { year: number; month: number; day: number };
  year: number;
  linkOrders?: boolean;
  factoryMode?: boolean;
  now: Date;
}) {
  const copy = mobileCalendarCopy(language);
  const initialDay = todayKey.startsWith(`${monthParam}-`)
    ? todayKey
    : `${monthParam}-01`;
  const [activeDay, setActiveDay] = useState(initialDay);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [showMonth, setShowMonth] = useState(false);

  useEffect(() => {
    if (activeDay.startsWith(`${monthParam}-`)) return;
    setActiveDay(
      todayKey.startsWith(`${monthParam}-`) ? todayKey : `${monthParam}-01`,
    );
  }, [activeDay, monthParam, todayKey]);

  const weekDays = useMemo(() => {
    const start = weekStartForDay(activeDay);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_IN_MS);
      const key = dayKeyFromUtcDate(date);
      return {
        date,
        day: date.getUTCDate(),
        key,
        label: new Intl.DateTimeFormat(language, {
          weekday: "short",
          timeZone: "UTC",
        }).format(date),
      };
    });
  }, [activeDay, language]);

  const weekTitle = useMemo(() => {
    const start = weekDays[0]?.date;
    const end = weekDays[6]?.date;
    if (!start || !end) return "";
    if (language.startsWith("zh")) {
      if (start.getUTCMonth() === end.getUTCMonth()) {
        return `${start.getUTCMonth() + 1}月${start.getUTCDate()}–${end.getUTCDate()}日`;
      }
      return `${start.getUTCMonth() + 1}月${start.getUTCDate()}日–${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
    }
    return `${new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(start)}–${new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(end)}`;
  }, [language, weekDays]);

  const activeDate = utcDateFromDayKey(activeDay);
  const activeDatePrimary = new Intl.DateTimeFormat(language, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(activeDate);
  const activeWeekday = new Intl.DateTimeFormat(language, {
    weekday: "long",
    timeZone: "UTC",
  }).format(activeDate);

  const weekExceptionCount = weekDays.reduce(
    (count, day) =>
      count +
      (ordersByDay.get(day.key) ?? []).filter(isCalendarException).length,
    0,
  );
  const activeOrders = useMemo(() => {
    const orders = [...(ordersByDay.get(activeDay) ?? [])].sort((a, b) =>
      orderTime(a, language).localeCompare(orderTime(b, language)),
    );
    return exceptionsOnly ? orders.filter(isCalendarException) : orders;
  }, [activeDay, exceptionsOnly, language, ordersByDay]);

  const orderGroups = useMemo(() => {
    const labels = {
      morning: copy.morning,
      afternoon: copy.afternoon,
      evening: copy.evening,
    };
    return (["morning", "afternoon", "evening"] as const)
      .map((period) => ({
        key: period,
        label: labels[period],
        orders: activeOrders.filter(
          (order) => orderPeriod(order, language) === period,
        ),
      }))
      .filter((group) => group.orders.length > 0);
  }, [activeOrders, copy.afternoon, copy.evening, copy.morning, language]);

  const selectDay = (key: string) => {
    const date = utcDateFromDayKey(key);
    const nextMonth = date.getUTCMonth() + 1;
    const nextYear = date.getUTCFullYear();
    if (nextMonth !== month || nextYear !== year) {
      setMonth({ year: nextYear, month: nextMonth });
    }
    setActiveDay(key);
    setShowMonth(false);
  };

  const moveWeek = (delta: number) => {
    const next = new Date(
      utcDateFromDayKey(activeDay).getTime() + delta * 7 * DAY_IN_MS,
    );
    selectDay(dayKeyFromUtcDate(next));
  };

  const goToday = () => {
    setMonth({ year: todayParts.year, month: todayParts.month });
    setActiveDay(todayKey);
    setShowMonth(false);
  };

  return (
    <article className="kitchen-calendar-mobile" aria-label={monthTitle}>
      <button
        type="button"
        className={cn(
          "kitchen-calendar-mobile-filter",
          exceptionsOnly && "is-active",
        )}
        onClick={() => setExceptionsOnly((value) => !value)}
        aria-pressed={exceptionsOnly}
        aria-label={
          exceptionsOnly ? copy.filterAll : copy.filterExceptions
        }
      >
        <span>
          {copy.display}
          {exceptionsOnly ? copy.exceptionOnly : copy.all}
        </span>
        <Filter aria-hidden="true" />
        <span className="kitchen-calendar-mobile-filter-count">
          <span className="kitchen-calendar-dot red" aria-hidden="true" />
          {weekExceptionCount} {copy.exceptions}
        </span>
        <ChevronRight aria-hidden="true" />
      </button>

      <section className="kitchen-calendar-mobile-picker">
        <header className="kitchen-calendar-mobile-nav">
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            {t("common.today")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => moveWeek(-1)}
            aria-label={copy.previousWeek}
          >
            <ChevronLeft />
          </Button>
          <strong>{showMonth ? monthTitle : weekTitle}</strong>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => moveWeek(1)}
            aria-label={copy.nextWeek}
          >
            <ChevronRight />
          </Button>
          <button
            type="button"
            className="kitchen-calendar-mobile-view-toggle"
            onClick={() => setShowMonth((value) => !value)}
            aria-expanded={showMonth}
          >
            {showMonth ? copy.weekView : copy.monthView}
          </button>
        </header>

        {showMonth ? (
          <div className="kitchen-calendar-mobile-month" role="grid">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} role="columnheader">
                {new Intl.DateTimeFormat(language, {
                  weekday: "narrow",
                  timeZone: "UTC",
                }).format(
                  new Date(WEEKDAY_SUNDAY.getTime() + index * DAY_IN_MS),
                )}
              </span>
            ))}
            {days.map((day) => {
              const count = (ordersByDay.get(day.key) ?? []).length;
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={day.key}
                  className={cn(
                    !day.inMonth && "outside",
                    day.key === activeDay && "is-selected",
                  )}
                  onClick={() => selectDay(day.key)}
                  aria-selected={day.key === activeDay}
                  aria-current={day.key === todayKey ? "date" : undefined}
                  aria-label={t("kitchenCalendar.openDay", {
                    date: day.key,
                    count,
                  })}
                >
                  <span>{day.day}</span>
                  {count > 0 ? <small>{count}</small> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="kitchen-calendar-mobile-week" role="list">
            {weekDays.map((day) => {
              const dayOrders = ordersByDay.get(day.key) ?? [];
              const exceptions = dayOrders.filter(isCalendarException).length;
              return (
                <button
                  type="button"
                  role="listitem"
                  key={day.key}
                  className={cn(day.key === activeDay && "is-selected")}
                  onClick={() => selectDay(day.key)}
                  aria-pressed={day.key === activeDay}
                  aria-current={day.key === todayKey ? "date" : undefined}
                  aria-label={t("kitchenCalendar.openDay", {
                    date: day.key,
                    count: dayOrders.length,
                  })}
                >
                  <span>{day.label}</span>
                  <strong>
                    {day.date.getUTCMonth() + 1}/{day.day}
                  </strong>
                  <small>
                    <span className="kitchen-calendar-dot" aria-hidden="true" />
                    {dayOrders.length}
                  </small>
                  <small>
                    <span
                      className="kitchen-calendar-dot red"
                      aria-hidden="true"
                    />
                    {exceptions}
                  </small>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <CalendarDays />
          <div>
            <strong>{t("kitchenCalendar.loadError")}</strong>
            <span>{t("kitchenCalendar.loadErrorDescription")}</span>
          </div>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw />
            {t("kitchenCalendar.retry")}
          </Button>
        </div>
      ) : (
        <section className="kitchen-calendar-mobile-agenda">
          <header>
            <h2>
              <span>{activeDatePrimary}</span> {activeWeekday}
            </h2>
            <span>
              {activeDay === todayKey ? `${t("common.today")} ` : ""}
              {activeOrders.length} {copy.orders}
            </span>
          </header>
          {loading ? (
            <div className="kitchen-calendar-mobile-loading" aria-label={t("kitchenCalendar.loading")}>
              <span />
              <span />
              <span />
            </div>
          ) : orderGroups.length === 0 ? (
            <p className="kitchen-calendar-empty-day">{copy.noOrders}</p>
          ) : (
            orderGroups.map((group) => (
              <section className="kitchen-calendar-mobile-period" key={group.key}>
                <h3>{group.label}</h3>
                <ul>
                  {group.orders.map((order) => {
                    const factoryState =
                      order.isSentToFactory === true
                        ? copy.sent
                        : order.isSentToFactory === false
                          ? copy.unsent
                          : copy.unset;
                    const factoryTone =
                      order.isSentToFactory === true
                        ? "blue"
                        : order.isSentToFactory === false
                          ? "amber"
                          : "muted";
                    const paymentIncomplete =
                      !isOrderDelivered(order.deliveryStatus) &&
                      (order.outstanding ?? 0) > 0;
                    const newFactoryOrder =
                      factoryMode &&
                      isNewFactoryOrder(
                        order.orderReceivedAt,
                        now,
                        order.deliveryAt,
                      );
                    const changedFactoryOrder =
                      factoryMode && Boolean(order.factoryReprintRequired);
                    const title =
                      order.customerName ||
                      order.companyName ||
                      order.orderNumber ||
                      t("common.notSet");
                    const secondary = [order.orderNumber, order.districtName]
                      .filter(Boolean)
                      .filter((value) => value !== title)
                      .join(" · ");
                    const orderContent = (
                      <>
                          <time>{orderTime(order, language)}</time>
                          <span className="kitchen-calendar-mobile-order-copy">
                            <strong>{title}</strong>
                            {secondary ? <small>{secondary}</small> : null}
                          </span>
                          {factoryMode ? (
                            newFactoryOrder || changedFactoryOrder ? (
                              <span className="kitchen-calendar-mobile-statuses">
                                {newFactoryOrder ? (
                                  <small className="factory-new">
                                    {t("factoryBoard.newOrder")}
                                  </small>
                                ) : null}
                                {changedFactoryOrder ? (
                                  <small className="factory-changed">
                                    {t("factoryBoard.changedOrder")}
                                  </small>
                                ) : null}
                              </span>
                            ) : null
                          ) : (
                          <span className="kitchen-calendar-mobile-statuses">
                            <small className={factoryTone}>
                              {copy.factory}：{factoryState}
                            </small>
                            <small className={paymentIncomplete ? "red" : "green"}>
                              {copy.payment}：
                              {paymentIncomplete
                                ? copy.paymentIncomplete
                                : copy.paid}
                            </small>
                          </span>
                          )}
                          {linkOrders ? <ChevronRight aria-hidden="true" /> : null}
                      </>
                    );
                    return (
                      <li key={order.id}>
                        {linkOrders ? (
                          <Link
                            className="kitchen-calendar-mobile-order"
                            to={kitchenCalendarOrderHref(order.id, monthParam)}
                            aria-label={`${t("orders.open")} ${orderLabel(order, t("common.notSet"))}`}
                          >
                            {orderContent}
                          </Link>
                        ) : (
                          <div className="kitchen-calendar-mobile-order">
                            {orderContent}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </section>
      )}
    </article>
  );
}

export function KitchenCalendarPage({
  loadOrders = fetchKitchenCalendarOrders,
  now,
  displayMode = "standard",
}: {
  loadOrders?: KitchenCalendarLoader;
  now?: Date;
  displayMode?: "standard" | "factory";
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
  const isFactoryDisplay = displayMode === "factory";
  const isMobileCalendar = useMediaQuery("(max-width: 760px)");

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

  return (
    <section
      className={cn(
        "kitchen-calendar-page",
        isFactoryDisplay && "is-factory-display",
      )}
    >
      {isFactoryDisplay ? null : (
        <header className="page-heading kitchen-calendar-heading">
          <div>
            <span className="eyebrow">{t("orders.eyebrow")}</span>
            <h1>{t("navigation.productionCalendar")}</h1>
          </div>
          <ul
            className="kitchen-calendar-legend"
            aria-label={t("kitchenCalendar.legend")}
          >
            <li>
              <span className="kitchen-calendar-dot amber" aria-hidden="true" />
              {t("kitchenCalendar.notSentToFactory")}
            </li>
            <li>
              <span className="kitchen-calendar-dot red" aria-hidden="true" />
              {t("kitchenCalendar.unpaid")}
            </li>
          </ul>
        </header>
      )}

      {isMobileCalendar ? (
        <KitchenCalendarMobile
          days={days}
          error={error}
          language={i18n.language}
          loading={loading}
          month={month}
          monthParam={monthParam}
          monthTitle={monthTitle}
          onRetry={() => setReloadKey((key) => key + 1)}
          ordersByDay={ordersByDay}
          setMonth={setMonth}
          t={t}
          todayKey={todayKey}
          todayParts={todayParts}
          year={year}
          linkOrders={!isFactoryDisplay}
          factoryMode={isFactoryDisplay}
          now={clock}
        />
      ) : (
      <article className="panel kitchen-calendar-panel kitchen-calendar-desktop-panel">
        <header className="kitchen-calendar-toolbar">
          <div className="kitchen-calendar-nav">
            {isFactoryDisplay ? null : (
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
            )}
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
              const dayOrders =
                isFactoryDisplay && !day.inMonth
                  ? []
                  : (ordersByDay.get(day.key) ?? []);
              const visibleLimit = isFactoryDisplay
                ? dayOrders.length
                : KITCHEN_CALENDAR_VISIBLE_PER_DAY;
              const visible = dayOrders.slice(0, visibleLimit);
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
                  style={
                    isFactoryDisplay
                      ? {
                          minHeight: `${Math.max(
                            120,
                            56 + dayOrders.length * 41,
                          )}px`,
                        }
                      : undefined
                  }
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
                          const tone = kitchenCalendarTone(order);
                          const label = orderLabel(order, t("common.notSet"));
                          const statusText = operationalStatusLabel(order, t);
                          const eventContent = (
                            <>
                              <span
                                className={cn("kitchen-calendar-dot", tone)}
                                aria-hidden="true"
                              />
                              <span className="kitchen-calendar-event-copy">
                                {label}
                              </span>
                            </>
                          );
                          return isFactoryDisplay ? (
                            <div
                              className={cn(
                                "kitchen-calendar-event",
                                isPendingShopifyOrder(order) && "is-shopify",
                              )}
                              key={order.id}
                              title={`${label} · ${statusText}`}
                            >
                              {eventContent}
                            </div>
                          ) : (
                            <Link
                              className={cn(
                                "kitchen-calendar-event",
                                isPendingShopifyOrder(order) && "is-shopify",
                              )}
                              key={order.id}
                              to={kitchenCalendarOrderHref(order.id, monthParam)}
                              title={`${label} · ${statusText}`}
                              aria-label={`${t("orders.open")} ${label} ${statusText}`}
                            >
                              {eventContent}
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
      )}

      {!isMobileCalendar ? (
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
              const tone = kitchenCalendarTone(order);
              const label = orderLabel(order, t("common.notSet"));
              const statusText = operationalStatusLabel(order, t);
              const dayContent = (
                <>
                  <span
                    className={cn("kitchen-calendar-dot", tone)}
                    aria-hidden="true"
                  />
                  <span className="kitchen-calendar-day-copy">
                    <strong>{order.orderNumber || t("common.notSet")}</strong>
                    <small>
                      {order.customerName ||
                        order.companyName ||
                        t("common.notSet")}
                      {order.districtName ? ` - ${order.districtName}` : ""}
                      {isPendingShopifyOrder(order) && order.deliveryTime
                        ? ` (${order.deliveryTime})`
                        : ""}
                    </small>
                  </span>
                </>
              );
              return (
                <li key={order.id}>
                  {isFactoryDisplay ? (
                    <div
                      className={cn(
                        "kitchen-calendar-day-item",
                        isPendingShopifyOrder(order) && "is-shopify",
                      )}
                    >
                      {dayContent}
                    </div>
                  ) : (
                    <Link
                      className={cn(
                        "kitchen-calendar-day-item",
                        isPendingShopifyOrder(order) && "is-shopify",
                      )}
                      to={kitchenCalendarOrderHref(order.id, monthParam)}
                      aria-label={`${t("orders.open")} ${label} ${statusText}`}
                    >
                      {dayContent}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SidePanel>
      ) : null}
    </section>
  );
}
