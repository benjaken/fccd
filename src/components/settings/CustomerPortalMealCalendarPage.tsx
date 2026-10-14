import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { SidePanel } from "@/components/ui/side-panel";
import {
  listGroupCalendar,
  setOrderBlackout,
  type GroupCalendarOpening,
  type OrderBlackout,
} from "@/lib/customer-portal-calendar-ops";
import {
  buildKitchenCalendarGrid,
  hongKongDateParts,
  kitchenCalendarMonthParam,
  parseKitchenCalendarMonth,
  shiftKitchenCalendarMonth,
  type KitchenCalendarDay,
} from "@/lib/kitchen-calendar";
import {
  groupMealOrdersByDay,
  formatMealQuantity,
  hongKongTodayKey,
  listMealCalendarOrders,
  mealSummary,
  type MealCalendarOrder,
} from "@/lib/customer-portal-meal-calendar";
import { cn } from "@/lib/utils";
import "@/lib/customer-portal-i18n";
import "./customer-portal-meal-calendar.css";

const VISIBLE_PER_DAY = 3;

function serviceKey(day: KitchenCalendarDay) {
  return day.key;
}

function covers(opening: GroupCalendarOpening, day: string) {
  return opening.delivery_date <= day && (opening.valid_until || opening.delivery_date) >= day;
}

export function CustomerPortalMealCalendarPage() {
  const { t } = useTranslation();
  const canEdit = useCurrentPageAccess().canAccess("settings.customer_portal.edit");
  const [params, setParams] = useSearchParams();
  const todayKey = hongKongTodayKey();
  const today = hongKongDateParts(new Date());
  const month = parseKitchenCalendarMonth(params.get("month"), new Date());
  const days = useMemo(
    () => buildKitchenCalendarGrid(month.year, month.month, todayKey),
    [month.year, month.month, todayKey],
  );
  const from = days[0]?.key ?? "";
  const to = days[days.length - 1]?.key ?? "";
  const [orders, setOrders] = useState<MealCalendarOrder[]>([]);
  const [openings, setOpenings] = useState<GroupCalendarOpening[]>([]);
  const [blackouts, setBlackouts] = useState<OrderBlackout[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([listMealCalendarOrders(from, to), listGroupCalendar(from, to)])
      .then(([rows, calendar]) => {
        if (!cancelled) {
          setOrders(rows);
          setOpenings(calendar?.openings ?? []);
          setBlackouts(calendar?.blackouts ?? []);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setError(t("mealCalendar.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadKey, t]);

  const organizations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const order of orders) seen.set(order.organization_id, order.organization_name);
    for (const opening of openings) seen.set(opening.organization_id, opening.organization_name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  }, [orders, openings]);

  const visibleOrders = organizationId
    ? orders.filter((order) => order.organization_id === organizationId)
    : orders;
  const visibleOpenings = organizationId
    ? openings.filter((opening) => opening.organization_id === organizationId)
    : openings;
  const byDay = useMemo(() => groupMealOrdersByDay(visibleOrders), [visibleOrders]);
  const selectedOrders = byDay.get(selectedDay) ?? [];
  const selectedOpenings = selectedDay ? visibleOpenings.filter((opening) => covers(opening, selectedDay)) : [];
  const selectedBlackout = blackouts.find((day) => day.blackout_on === selectedDay);
  const weekdays = t("mealCalendar.weekdays", { returnObjects: true }) as string[];
  const monthTitle = new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));

  function chooseDay(day: string) {
    setSelectedDay(day);
    setHolidayName(blackouts.find((item) => item.blackout_on === day)?.name ?? "");
    setNotice("");
    setFormError("");
  }

  async function saveHoliday(event: FormEvent) {
    event.preventDefault();
    if (!selectedDay || !holidayName.trim()) {
      setFormError(t("mealCalendar.invalidHoliday"));
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await setOrderBlackout(selectedDay, holidayName.trim());
      setNotice(t("mealCalendar.holidaySaved"));
      setReloadKey((key) => key + 1);
    } catch {
      setFormError(t("mealCalendar.loadError"));
    } finally {
      setBusy(false);
    }
  }

  async function clearHoliday() {
    if (!selectedDay) return;
    setBusy(true);
    setFormError("");
    try {
      await setOrderBlackout(selectedDay, "", true);
      setHolidayName("");
      setNotice(t("mealCalendar.holidayCleared"));
      setReloadKey((key) => key + 1);
    } catch {
      setFormError(t("mealCalendar.loadError"));
    } finally {
      setBusy(false);
    }
  }

  function shift(delta: number) {
    const next = shiftKitchenCalendarMonth(month.year, month.month, delta);
    setParams({ month: kitchenCalendarMonthParam(next.year, next.month) });
  }

  return (
    <section className="kitchen-calendar-page meal-order-calendar">
      <header className="page-heading kitchen-calendar-heading">
        <div>
          <h1>{t("mealCalendar.title")}</h1>
          <p>{t("mealCalendar.description")}</p>
        </div>

      </header>

      <article className="panel kitchen-calendar-panel">
        <header className="kitchen-calendar-toolbar">
          <div className="kitchen-calendar-nav">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setParams({ month: kitchenCalendarMonthParam(today.year, today.month) })}
            >
              {t("mealCalendar.today")}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={t("mealCalendar.previousMonth")}>
              <ChevronLeft />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => shift(1)} aria-label={t("mealCalendar.nextMonth")}>
              <ChevronRight />
            </Button>
          </div>
          <h2 className="kitchen-calendar-month">{monthTitle}</h2>
          <label className="meal-calendar-filter">
          <span>{t("mealCalendar.organization")}</span>
          <FilterableSelect
            searchable
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            <option value="">{t("mealCalendar.allOrganizations")}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </FilterableSelect>
        </label>
        </header>
        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <CalendarDays />
            <div>
              <strong>{error}</strong>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />
              {t("mealCalendar.retry")}
            </Button>
          </div>
        ) : (
          <div className="kitchen-calendar-grid" role="grid" aria-label={monthTitle} aria-busy={loading}>
            {weekdays.map((label) => (
              <div className="kitchen-calendar-weekday" key={label} role="columnheader">{label}</div>
            ))}
            {days.map((day) => {
              const dayOrders = byDay.get(serviceKey(day)) ?? [];
              const dayOpenings = visibleOpenings.filter((opening) => covers(opening, day.key));
              const closed = blackouts.find((item) => item.blackout_on === day.key);
              const visible = dayOrders.slice(0, VISIBLE_PER_DAY);
              const hidden = dayOrders.length - visible.length;
              const visibleMenus = dayOpenings.slice(0, VISIBLE_PER_DAY);
              return (
                <div
                  className={cn("kitchen-calendar-day", !day.inMonth && "outside", day.isToday && "is-today", selectedDay === day.key && "is-selected", closed && "is-closed")}
                  key={day.key}
                  role="gridcell"
                >
                  <button
                    className="kitchen-calendar-date"
                    type="button"
                    onClick={() => chooseDay(day.key)}
                    aria-label={t("mealCalendar.openDay", { date: day.key, count: dayOrders.length })}
                    aria-current={day.isToday ? "date" : undefined}
                  >
                    {day.day}
                  </button>
                  {closed ? <span className="meal-calendar-closed">{closed.name}</span> : null}
                  <div className="kitchen-calendar-events">
                    {visibleMenus.map((opening) => (
                      <button
                        className="kitchen-calendar-event meal-calendar-opening"
                        key={opening.menu_id}
                        type="button"
                        onClick={() => chooseDay(day.key)}
                      >
                        <span className="kitchen-calendar-dot" aria-hidden="true" />
                        <span className="kitchen-calendar-event-copy">
                          {t("mealCalendar.openingLabel", { company: opening.organization_name, menu: opening.menu_name })}
                        </span>
                      </button>
                    ))}
                    {visible.map((order) => (
                      <button
                        className="kitchen-calendar-event"
                        key={order.order_id}
                        type="button"
                        title={`${order.organization_name} · ${mealSummary(order.lines)}`}
                        onClick={() => chooseDay(day.key)}
                      >
                        <span className="kitchen-calendar-dot" aria-hidden="true" />
                        <span className="kitchen-calendar-event-copy">
                          {order.organization_name} · {mealSummary(order.lines) || t("mealCalendar.noMeals")}
                        </span>
                      </button>
                    ))}
                    {hidden > 0 ? (
                      <button className="kitchen-calendar-more" type="button" onClick={() => chooseDay(day.key)}>
                        {t("mealCalendar.more", { count: hidden })}
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
        onClose={() => { if (!busy) setSelectedDay(""); }}
        title={selectedDay}
        description={selectedBlackout ? t("mealCalendar.closedHint", { name: selectedBlackout.name }) : t("mealCalendar.dayCount", { count: selectedOpenings.length })}
        closeLabel={t("mealCalendar.close")}
        half
      >
        {notice ? <p role="status">{notice}</p> : null}
        {formError ? <p role="alert">{formError}</p> : null}
        <section className="meal-calendar-openings">
          <h3>{t("mealCalendar.openings")}</h3>
          {selectedOpenings.length === 0 ? <p>{t("mealCalendar.noOpenings")}</p> : (
            <ul>
              {selectedOpenings.map((opening) => (
                <li key={opening.menu_id}>
                  <Link to={`/settings/customer-portal/${opening.organization_id}/menus/${opening.menu_id}`}>
                    {t("mealCalendar.openingLabel", { company: opening.organization_name, menu: opening.menu_name })}
                  </Link>
                  <small>{opening.brand}</small>
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <form className="meal-calendar-holiday" onSubmit={(event) => void saveHoliday(event)}>
              <label>
                {t("mealCalendar.holidayName")}
                <Input value={holidayName} maxLength={80} placeholder={t("mealCalendar.holidayPlaceholder")} onChange={(event) => setHolidayName(event.target.value)} />
              </label>
              <div>
                <Button type="submit" disabled={busy}>{busy ? t("mealCalendar.saving") : t("mealCalendar.saveHoliday")}</Button>
                {selectedBlackout ? <Button type="button" variant="outline" disabled={busy} onClick={() => void clearHoliday()}>{t("mealCalendar.clearHoliday")}</Button> : null}
              </div>
            </form>
          ) : null}
        </section>
        <h3>{t("mealCalendar.ordersHeading")}</h3>
        {loading ? <p>{t("mealCalendar.loading")}</p> : null}
        {!loading && selectedOrders.length === 0 ? <p>{t("mealCalendar.emptyDay")}</p> : null}
        <div className="meal-calendar-day-list">
          {selectedOrders.map((order) => (
            <article className="meal-calendar-order" key={order.order_id}>
              <h3>{order.organization_name}</h3>
              <p>
                <Link to={`/orders/${order.order_id}`}>{order.order_number || t("mealCalendar.untitledOrder")}</Link>
                {" · "}
                {order.document_type === "order" ? t("mealCalendar.confirmed") : t("mealCalendar.quote")}
                {order.delivery_time ? ` · ${order.delivery_time}` : ""}
                {order.brand ? ` · ${order.brand}` : ""}
                {order.delivery_status ? ` · ${order.delivery_status}` : ""}
              </p>
              {order.address ? <p>{order.address}</p> : null}
              <ul className="meal-calendar-lines">
                {order.lines.length === 0 ? <li>{t("mealCalendar.noMeals")}</li> : null}
                {order.lines.map((line, index) => (
                  <li key={`${order.order_id}-${index}`}>
                    <span>{line.name}</span>
                    {line.quantity === null || line.quantity === undefined ? null : <span>×{formatMealQuantity(line.quantity)}</span>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SidePanel>
    </section>
  );
}
