import { useEffect, useMemo, useState } from "react";
import { CalendarRange, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildRestaurantSalesMatrix,
  currentMonthValue,
  defaultRestaurantSalesDates,
  fetchRestaurantSalesReport,
  monthDateRange,
  weekDateRange,
  type RestaurantSalesCategory,
  type RestaurantSalesPeriod,
  type RestaurantSalesReportRow,
} from "@/lib/restaurant-sales-report";
import { cn } from "@/lib/utils";

type ReportLoader = typeof fetchRestaurantSalesReport;

const periods: RestaurantSalesPeriod[] = ["month", "day", "week"];
const categories: RestaurantSalesCategory[] = [
  "platform",
  "department",
  "servicePeriod",
];

const currency = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return currency.format(value).replace("HK$", "$");
}

export function RestaurantSalesReportPage({
  loadReport = fetchRestaurantSalesReport,
  embedded = false,
}: {
  loadReport?: ReportLoader;
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const defaults = useMemo(() => defaultRestaurantSalesDates(), []);
  const [period, setPeriod] = useState<RestaurantSalesPeriod>("month");
  const [category, setCategory] =
    useState<RestaurantSalesCategory>("platform");
  const [monthStart, setMonthStart] = useState(defaults.monthStart);
  const [monthEnd, setMonthEnd] = useState(defaults.monthEnd);
  const [dayStart, setDayStart] = useState(defaults.dayStart);
  const [dayEnd, setDayEnd] = useState(defaults.dayEnd);
  const [weekDate, setWeekDate] = useState(defaults.weekDate);
  const [rows, setRows] = useState<RestaurantSalesReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (period === "month") return monthDateRange(monthStart, monthEnd);
    if (period === "week") return weekDateRange(weekDate);
    return { startDate: dayStart, endDate: dayEnd };
  }, [dayEnd, dayStart, monthEnd, monthStart, period, weekDate]);
  const matrix = useMemo(() => buildRestaurantSalesMatrix(rows), [rows]);
  const validRange = Boolean(
    range.startDate && range.endDate && range.startDate <= range.endDate,
  );

  useEffect(() => {
    if (!validRange) {
      setRows([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void loadReport({
      startDate: range.startDate,
      endDate: range.endDate,
      period,
      category,
    })
      .then((nextRows) => {
        if (active) setRows(nextRows);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setRows([]);
        setError(loadError instanceof Error ? loadError.message : "load_failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, loadReport, period, range.endDate, range.startDate, validRange]);

  const bucketLabel = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    if (period === "month") {
      return new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "short",
      }).format(date);
    }
    if (period === "week") {
      const week = weekDateRange(value);
      return t("restaurantSalesReport.weekLabel", {
        start: week.startDate,
        end: week.endDate,
      });
    }
    return new Intl.DateTimeFormat(i18n.language, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  };

  return (
    <section className={cn("restaurant-sales-page", embedded && "is-embedded")}>
      {embedded ? null : <header className="page-heading restaurant-sales-heading">
        <div>
          <span className="eyebrow">{t("navigation.restaurant")}</span>
          <h1>{t("restaurantSalesReport.title")}</h1>
          <p>{t("restaurantSalesReport.description")}</p>
        </div>
      </header>}

      <section className="panel restaurant-sales-filters">
        <div className="restaurant-sales-filter-group">
          <span>{t("restaurantSalesReport.period")}</span>
          <div className="restaurant-sales-segmented">
            {periods.map((option) => (
              <button
                type="button"
                className={cn(period === option && "active")}
                aria-pressed={period === option}
                key={option}
                onClick={() => setPeriod(option)}
              >
                {t(`restaurantSalesReport.periods.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="restaurant-sales-date-filter">
          <CalendarRange aria-hidden="true" />
          {period === "month" ? (
            <div className="restaurant-sales-month-range">
              <label>
                <span>{t("restaurantSalesReport.startMonth")}</span>
                <input
                  type="month"
                  value={monthStart}
                  max={monthEnd}
                  onChange={(event) => setMonthStart(event.target.value)}
                />
              </label>
              <span aria-hidden="true">—</span>
              <label>
                <span>{t("restaurantSalesReport.endMonth")}</span>
                <input
                  type="month"
                  value={monthEnd}
                  min={monthStart}
                  max={currentMonthValue()}
                  onChange={(event) => setMonthEnd(event.target.value)}
                />
              </label>
            </div>
          ) : period === "day" ? (
            <DateRangePicker
              startId="restaurant-sales-start-date"
              endId="restaurant-sales-end-date"
              startValue={dayStart}
              endValue={dayEnd}
              onStartChange={(value) => {
                setDayStart(value);
                if (value && dayEnd && value > dayEnd) setDayEnd(value);
              }}
              onEndChange={(value) => {
                setDayEnd(value);
                if (value && dayStart && value < dayStart) setDayStart(value);
              }}
              startLabel={t("restaurantSalesReport.startDate")}
              endLabel={t("restaurantSalesReport.endDate")}
              legend={t("restaurantSalesReport.dateRange")}
              allowOutOfOrder
            />
          ) : (
            <label className="restaurant-sales-week-picker">
              <span>{t("restaurantSalesReport.weekDate")}</span>
              <div className="restaurant-sales-week-input-row">
                <input
                  type="date"
                  aria-label={t("restaurantSalesReport.weekDate")}
                  value={weekDate}
                  onChange={(event) => setWeekDate(event.target.value)}
                />
                <small>
                  {t("restaurantSalesReport.weekRange", {
                    start: range.startDate,
                    end: range.endDate,
                  })}
                </small>
              </div>
            </label>
          )}
        </div>

        <div className="restaurant-sales-filter-group restaurant-sales-category-filter">
          <span>{t("restaurantSalesReport.category")}</span>
          <div className="restaurant-sales-segmented">
            {categories.map((option) => (
              <button
                type="button"
                className={cn(category === option && "active")}
                aria-pressed={category === option}
                key={option}
                onClick={() => setCategory(option)}
              >
                {t(`restaurantSalesReport.categories.${option}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!validRange ? (
        <section className="panel restaurant-sales-state">
          {t("restaurantSalesReport.invalidRange")}
        </section>
      ) : loading ? (
        <PageSkeleton
          compact
          label={t("restaurantSalesReport.loading")}
          showSummary={false}
          variant="report"
        />
      ) : error ? (
        <section className="panel restaurant-sales-state is-error">
          <RefreshCw />
          <div>
            <strong>{t("restaurantSalesReport.loadError")}</strong>
            <span>{error}</span>
          </div>
        </section>
      ) : matrix.buckets.length === 0 ? (
        <section className="panel restaurant-sales-state">
          {t("restaurantSalesReport.empty")}
        </section>
      ) : (
        <section className="panel restaurant-sales-report-card">
          <div className="restaurant-sales-table-scroll">
            <table className="restaurant-sales-table">
              <thead>
                <tr>
                  <th rowSpan={2} scope="col" className="restaurant-sales-period-column">
                    {t("restaurantSalesReport.periodColumn")}
                  </th>
                  {matrix.restaurants.map((restaurant) => (
                    <th
                      scope="colgroup"
                      colSpan={matrix.categories.length + 1}
                      key={restaurant.id}
                    >
                      {restaurant.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  {matrix.restaurants.flatMap((restaurant) => [
                    <th scope="col" className="restaurant-sales-total" key={`${restaurant.id}:total`}>
                      {t("restaurantSalesReport.totalSales")}
                    </th>,
                    ...matrix.categories.map((item) => (
                      <th scope="col" key={`${restaurant.id}:${item.key}`}>
                        {item.name}
                      </th>
                    )),
                  ])}
                </tr>
              </thead>
              <tbody>
                {matrix.buckets.map((bucket) => (
                  <tr key={bucket.start}>
                    <th scope="row" className="restaurant-sales-period-column">
                      {bucketLabel(bucket.start)}
                    </th>
                    {matrix.restaurants.flatMap((restaurant) => [
                      <td className="restaurant-sales-total" key={`${restaurant.id}:total`}>
                        {formatMoney(bucket.totals[restaurant.id] ?? 0)}
                      </td>,
                      ...matrix.categories.map((item) => (
                        <td key={`${restaurant.id}:${item.key}`}>
                          {formatMoney(
                            bucket.values[restaurant.id]?.[item.key] ?? 0,
                          )}
                        </td>
                      )),
                    ])}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
