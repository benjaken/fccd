import { ArrowDown, ArrowUp, Minus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildRestaurantSalesCostReport,
  defaultRestaurantSalesCostMonths,
  fetchRestaurantSalesCostReport,
  findDefaultSalesCostRestaurant,
  type RestaurantSalesCostMonth,
  type RestaurantSalesCostRow,
  type SalesCostDepartmentValues,
} from "@/lib/restaurant-sales-cost-report";
import {
  fetchShopReportRestaurants,
  type ShopReportRestaurant,
} from "@/lib/shop-sales-working-hours-report";

const currency = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const columns = ["restaurant", "waterBar", "misc", "total"] as const;

function money(value: number, negative = false) {
  const amount = negative ? -Math.abs(value) : value;
  const formatted = currency.format(Math.abs(amount)).replace("HK$", "$");
  return amount < 0 ? `(${formatted})` : formatted;
}

function ratio(value: number, sales: number) {
  return `${percent.format(sales ? (value / sales) * 100 : 0)}%`;
}

function ratioOrDash(value: number, denominator: number) {
  return denominator ? ratio(value, denominator) : "—";
}

function MetricRow({
  label,
  values,
  negative = false,
  className,
  previousValues,
  trendColumns = [],
  trendLayout = "inline",
  trendFavorable = "down",
}: {
  label: ReactNode;
  values: SalesCostDepartmentValues;
  negative?: boolean;
  className?: string;
  previousValues?: SalesCostDepartmentValues;
  trendColumns?: readonly (typeof columns)[number][];
  trendLayout?: "inline" | "stacked";
  trendFavorable?: "up" | "down";
}) {
  return (
    <tr className={className}>
      <th>{label}</th>
      {columns.map((column) => (
        <td className={trendColumns.includes(column) ? `has-trend ${trendLayout}` : undefined} key={column}>
          <span>{money(values[column], negative)}</span>
          {trendColumns.includes(column) ? (
            <Trend current={values[column]} previous={previousValues?.[column]} favorable={trendFavorable} />
          ) : null}
        </td>
      ))}
    </tr>
  );
}

function Trend({ current, previous, favorable }: { current: number; previous?: number; favorable: "up" | "down" }) {
  if (previous === undefined || current === previous) {
    return (
      <span className="trend-indicator neutral" aria-label="沒有變化">
        <Minus />
      </span>
    );
  }
  const up = current > previous;
  const positive = favorable === (up ? "up" : "down");
  const change = previous ? Math.abs(((current - previous) / previous) * 100) : null;
  const label = change === null ? "—" : `${percent.format(change)}%`;
  const direction = up ? "上升" : "下降";
  return (
    <span className={`trend-indicator ${positive ? "positive" : "negative"}`} aria-label={`${direction} ${label}`}>
      {up ? <ArrowUp /> : <ArrowDown />}
      <span>{label}</span>
    </span>
  );
}

function MonthTable({ month, previous, monthLabel, t }: {
  month: RestaurantSalesCostMonth;
  previous?: RestaurantSalesCostMonth;
  monthLabel: (value: string) => string;
  t: (key: string) => string;
}) {
  const currentGrossRatio = month.sales.total ? month.grossProfit.total / month.sales.total : 0;
  const previousGrossRatio = previous?.sales.total
    ? previous.grossProfit.total / previous.sales.total
    : undefined;

  return (
    <table className="restaurant-sales-cost-table">
      <colgroup><col className="label" />{columns.map((column) => <col key={column} />)}</colgroup>
      <thead>
        <tr><th colSpan={5}>{monthLabel(month.monthStart)}</th></tr>
        <tr>
          <th />
          {columns.map((column) => <th key={column}>{t(`restaurantSalesCost.columns.${column}`)}</th>)}
        </tr>
      </thead>
      <tbody>
        <MetricRow
          className="sales"
          label={t("restaurantSalesCost.sales")}
          values={month.sales}
          previousValues={previous?.sales}
          trendColumns={["restaurant", "waterBar", "total"]}
          trendLayout="stacked"
          trendFavorable="up"
        />
        <MetricRow label={t("restaurantSalesCost.opening")} values={month.opening} />
        <tr className="supplier-heading"><th>{t("restaurantSalesCost.supplier")}</th><td colSpan={4} /></tr>
        {month.suppliers.map((supplier) => (
          <MetricRow
            className="supplier-detail"
            key={supplier.supplierId}
            label={supplier.supplierName}
            values={supplier}
            previousValues={previous?.suppliers.find((item) => item.supplierId === supplier.supplierId)}
            trendColumns={["total"]}
          />
        ))}
        <MetricRow className="closing" label={t("restaurantSalesCost.closing")} values={month.closing} negative />
        <MetricRow
          className="total-cos"
          label={t("restaurantSalesCost.totalCos")}
          values={month.costOfSales}
          previousValues={previous?.costOfSales}
          trendColumns={["total"]}
          trendLayout="stacked"
        />
        <tr className="cost-ratio-row">
          <th>{t("restaurantSalesCost.costRatio")}</th>
          <td>{ratioOrDash(month.costOfSales.restaurant, month.costOfSales.total)}</td>
          <td>{ratioOrDash(month.costOfSales.waterBar, month.costOfSales.total)}</td>
          <td>{ratioOrDash(month.costOfSales.misc, month.costOfSales.total)}</td>
          <td />
        </tr>
        <tr className="ratio-row">
          <th>{t("restaurantSalesCost.cosSales")}</th>
          {columns.map((column) => <td key={column}>{ratioOrDash(month.costOfSales[column], month.sales[column])}</td>)}
        </tr>
        <MetricRow
          className="gross-profit"
          label={t("restaurantSalesCost.gp")}
          values={month.grossProfit}
          previousValues={previous?.grossProfit}
          trendColumns={["total"]}
          trendFavorable="up"
        />
        <tr className="trend-row gp-trend">
          <th>{t("restaurantSalesCost.gpPercent")}</th>
          <td>{ratio(month.grossProfit.restaurant, month.sales.restaurant)}</td>
          <td>{ratio(month.grossProfit.waterBar, month.sales.waterBar)}</td>
          <td>{ratio(month.grossProfit.misc, month.sales.misc)}</td>
          <td className="trend-total">
            <span>{ratio(month.grossProfit.total, month.sales.total)}</span>
            <Trend current={currentGrossRatio} previous={previousGrossRatio} favorable="up" />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function RestaurantSalesCostReport({
  loadRestaurants = fetchShopReportRestaurants,
  loadReport = fetchRestaurantSalesCostReport,
}: {
  loadRestaurants?: () => Promise<ShopReportRestaurant[]>;
  loadReport?: (input: { startMonth: string; endMonth: string; restaurantId: string }) => Promise<RestaurantSalesCostRow[]>;
}) {
  const { t, i18n } = useTranslation();
  const defaults = useMemo(defaultRestaurantSalesCostMonths, []);
  const [startMonth, setStartMonth] = useState(defaults.startMonth);
  const [endMonth, setEndMonth] = useState(defaults.endMonth);
  const [restaurants, setRestaurants] = useState<ShopReportRestaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [rows, setRows] = useState<RestaurantSalesCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const validRange = Boolean(startMonth && endMonth && startMonth <= endMonth);
  const months = useMemo(() => buildRestaurantSalesCostReport(rows), [rows]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadRestaurants().then((items) => {
      if (!active) return;
      setRestaurants(items);
      setRestaurantId(findDefaultSalesCostRestaurant(items)?.id ?? "");
      if (!items.length) setLoading(false);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : "load_failed");
      setLoading(false);
    });
    return () => { active = false; };
  }, [loadRestaurants]);

  useEffect(() => {
    if (!validRange || !restaurantId) {
      setRows([]);
      if (restaurants.length) setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      void loadReport({ startMonth, endMonth, restaurantId }).then((items) => {
        if (active) setRows(items);
      }).catch((loadError: unknown) => {
        if (!active) return;
        setRows([]);
        setError(loadError instanceof Error ? loadError.message : "load_failed");
      }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [endMonth, loadReport, restaurantId, restaurants.length, startMonth, validRange]);

  const reset = () => {
    setStartMonth(defaults.startMonth);
    setEndMonth(defaults.endMonth);
    setRestaurantId(findDefaultSalesCostRestaurant(restaurants)?.id ?? "");
  };
  const monthLabel = (value: string) => {
    const [year, month] = value.slice(0, 7).split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "long" })
      .format(new Date(year, month - 1, 1));
  };

  return (
    <section className="restaurant-sales-cost-report">
      <section className="panel restaurant-pnl-filters">
        <label><span>{t("restaurantSalesCost.startMonth")}</span><input aria-label={t("restaurantSalesCost.startMonth")} type="month" value={startMonth} max={endMonth} onChange={(event) => setStartMonth(event.target.value)} /></label>
        <label><span>{t("restaurantSalesCost.endMonth")}</span><input aria-label={t("restaurantSalesCost.endMonth")} type="month" value={endMonth} min={startMonth} max={defaults.endMonth} onChange={(event) => setEndMonth(event.target.value)} /></label>
        <fieldset className="restaurant-pnl-restaurants">
          <legend>{t("restaurantSalesCost.restaurant")}</legend>
          <div>{restaurants.map((restaurant) => <button aria-pressed={restaurantId === restaurant.id} className={restaurantId === restaurant.id ? "active" : undefined} key={restaurant.id} type="button" onClick={() => setRestaurantId(restaurant.id)}>{restaurant.name}</button>)}</div>
        </fieldset>
        <Button type="button" variant="outline" onClick={reset}><RotateCcw />{t("restaurantSalesCost.reset")}</Button>
      </section>

      {!validRange ? <section className="panel restaurant-pnl-state">{t("restaurantSalesCost.invalidRange")}</section>
        : !restaurantId ? <section className="panel restaurant-pnl-state">{t("restaurantSalesCost.noRestaurants")}</section>
        : loading ? <PageSkeleton compact showSummary={false} tableRows={10} label={t("restaurantSalesCost.loading")} variant="report" />
        : error ? <section className="panel restaurant-pnl-state is-error"><strong>{t("restaurantSalesCost.loadError")}</strong><span>{error}</span></section>
        : !months.length ? <section className="panel restaurant-pnl-state">{t("restaurantSalesCost.empty")}</section>
        : <section className="panel restaurant-sales-cost-card"><div className="restaurant-sales-cost-scroll"><div className="restaurant-sales-cost-months">{months.map((month, index) => <MonthTable key={month.monthStart} month={month} previous={months[index - 1]} monthLabel={monthLabel} t={t} />)}</div></div></section>}
    </section>
  );
}
