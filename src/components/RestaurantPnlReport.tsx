import { RotateCcw } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildRestaurantPnlReport,
  defaultRestaurantPnlMonths,
  fetchRestaurantPnlReport,
  findDefaultPnlRestaurant,
  type RestaurantPnlRow,
} from "@/lib/restaurant-pnl-report";
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

function money(value: number) {
  return currency.format(value).replace("HK$", "$");
}

function ratio(value: number, sales: number) {
  return `${percent.format(sales ? (value / sales) * 100 : 0)}%`;
}

function needsSectionSeparator(categoryName: string) {
  return /租金|員工成本|外賣平台|收款平台手續費|水電費|推廣費用|其他營運(?:開支|費用)/.test(
    categoryName,
  );
}

export function RestaurantPnlReport({
  loadRestaurants = fetchShopReportRestaurants,
  loadReport = fetchRestaurantPnlReport,
}: {
  loadRestaurants?: () => Promise<ShopReportRestaurant[]>;
  loadReport?: (input: {
    startMonth: string;
    endMonth: string;
    restaurantId: string;
  }) => Promise<RestaurantPnlRow[]>;
}) {
  const { t, i18n } = useTranslation();
  const defaults = useMemo(defaultRestaurantPnlMonths, []);
  const [startMonth, setStartMonth] = useState(defaults.startMonth);
  const [endMonth, setEndMonth] = useState(defaults.endMonth);
  const [restaurants, setRestaurants] = useState<ShopReportRestaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [rows, setRows] = useState<RestaurantPnlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const validRange = Boolean(startMonth && endMonth && startMonth <= endMonth);
  const report = useMemo(() => buildRestaurantPnlReport(rows), [rows]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadRestaurants()
      .then((items) => {
        if (!active) return;
        setRestaurants(items);
        setRestaurantId(findDefaultPnlRestaurant(items)?.id ?? "");
        if (!items.length) setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "load_failed");
        setLoading(false);
      });
    return () => {
      active = false;
    };
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
      void loadReport({ startMonth, endMonth, restaurantId })
        .then((items) => {
          if (active) setRows(items);
        })
        .catch((loadError: unknown) => {
          if (!active) return;
          setRows([]);
          setError(loadError instanceof Error ? loadError.message : "load_failed");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [endMonth, loadReport, restaurantId, restaurants.length, startMonth, validRange]);

  const reset = () => {
    setStartMonth(defaults.startMonth);
    setEndMonth(defaults.endMonth);
    setRestaurantId(findDefaultPnlRestaurant(restaurants)?.id ?? "");
  };
  const monthLabel = (value: string) => {
    const [year, month] = value.slice(0, 7).split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language, {
      year: "numeric",
      month: "long",
    }).format(new Date(year, month - 1, 1));
  };

  return (
    <section className="restaurant-pnl-report">
      <section className="panel restaurant-pnl-filters">
        <label>
          <span>{t("restaurantPnl.startMonth")}</span>
          <input
            aria-label={t("restaurantPnl.startMonth")}
            type="month"
            value={startMonth}
            max={endMonth}
            onChange={(event) => setStartMonth(event.target.value)}
          />
        </label>
        <label>
          <span>{t("restaurantPnl.endMonth")}</span>
          <input
            aria-label={t("restaurantPnl.endMonth")}
            type="month"
            value={endMonth}
            min={startMonth}
            max={defaults.endMonth}
            onChange={(event) => setEndMonth(event.target.value)}
          />
        </label>
        <fieldset className="restaurant-pnl-restaurants">
          <legend>{t("restaurantPnl.restaurant")}</legend>
          <div>
            {restaurants.map((restaurant) => (
              <button
                aria-pressed={restaurantId === restaurant.id}
                className={restaurantId === restaurant.id ? "active" : undefined}
                key={restaurant.id}
                type="button"
                onClick={() => setRestaurantId(restaurant.id)}
              >
                {restaurant.name}
              </button>
            ))}
          </div>
        </fieldset>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw />
          {t("restaurantPnl.reset")}
        </Button>
      </section>

      {!validRange ? (
        <section className="panel restaurant-pnl-state">{t("restaurantPnl.invalidRange")}</section>
      ) : !restaurantId ? (
        <section className="panel restaurant-pnl-state">{t("restaurantPnl.noRestaurants")}</section>
      ) : loading ? (
        <PageSkeleton compact showSummary={false} tableRows={18} label={t("restaurantPnl.loading")} variant="report" />
      ) : error ? (
        <section className="panel restaurant-pnl-state is-error">
          <strong>{t("restaurantPnl.loadError")}</strong>
          <span>{error}</span>
        </section>
      ) : report.months.length === 0 ? (
        <section className="panel restaurant-pnl-state">{t("restaurantPnl.empty")}</section>
      ) : (
        <section className="panel restaurant-pnl-card">
          <div className="restaurant-pnl-scroll">
            <div className="restaurant-pnl-months">
              {report.months.map((month) => (
                <table className="restaurant-pnl-table" key={month.monthStart}>
                  <colgroup>
                    <col className="restaurant-pnl-category-column" />
                    <col className="restaurant-pnl-item-column" />
                    <col className="restaurant-pnl-amount-column" />
                    <col className="restaurant-pnl-total-column" />
                  </colgroup>
                  <thead>
                    <tr><th colSpan={4}>{monthLabel(month.monthStart)}</th></tr>
                  </thead>
                  <tbody>
                    <tr className="summary"><th>{t("restaurantPnl.revenue")}</th><td>{t("restaurantPnl.sales")}</td><td>{money(month.sales)}</td><td>{money(month.sales)}</td></tr>
                    <tr><th rowSpan={3}>{t("restaurantPnl.costOfSales")}</th><td>{t("restaurantPnl.opening")}</td><td>{money(month.openingStock)}</td><td /></tr>
                    <tr><td>{t("restaurantPnl.purchase")}</td><td>{money(month.purchases)}</td><td /></tr>
                    <tr><td>{t("restaurantPnl.ending")}</td><td>{money(month.closingStock)}</td><td /></tr>
                    <tr className="summary"><th>{t("restaurantPnl.costOfSales")}</th><td>{t("restaurantPnl.totalCostOfSales")}</td><td>{money(month.totalCostOfSales)}</td><td>{ratio(month.totalCostOfSales, month.sales)}</td></tr>
                    <tr className="summary gross"><th>{t("restaurantPnl.grossProfit")}</th><td /><td>{money(month.grossProfit)}</td><td>{ratio(month.grossProfit, month.sales)}</td></tr>
                    <tr className="restaurant-pnl-separator" aria-hidden="true"><td colSpan={4} /></tr>
                    {report.categories.map((category) => {
                      const total = category.items.reduce((sum, item) => sum + (month.values[item.key] ?? 0), 0);
                      const discountLead =
                        category.items.length > 1 &&
                        category.items[0]?.name.trim().toLowerCase() === "discount";
                      const categoryLabelIndex = discountLead ? 1 : 0;
                      return (
                        <Fragment key={category.key}>
                          {category.items.map((item, index) => (
                            <tr className={index === category.items.length - 1 ? "category-total" : undefined} key={item.key}>
                              {index < categoryLabelIndex ? <td className="restaurant-pnl-category-placeholder" /> : null}
                              {index === categoryLabelIndex ? <th rowSpan={category.items.length - categoryLabelIndex}>{category.name}</th> : null}
                              <td>{item.name}</td>
                              <td>{money(month.values[item.key] ?? 0)}</td>
                              <td>{index === category.items.length - 1 ? <><strong>{money(total)}</strong><span>{ratio(total, month.sales)}</span></> : null}</td>
                            </tr>
                          ))}
                          {needsSectionSeparator(category.name) ? (
                            <tr className="restaurant-pnl-separator" aria-hidden="true"><td colSpan={4} /></tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                    <tr className="summary operation-total">
                      <th>{t("restaurantPnl.totalOperationCost")}</th>
                      <td />
                      <td>{money(month.totalExpenses)}</td>
                      <td>{ratio(month.totalExpenses, month.grossProfit)}</td>
                    </tr>
                    <tr className="summary draft-profit">
                      <th>{t("restaurantPnl.draftProfit")}</th>
                      <td>{t("restaurantPnl.draftProfit")}</td>
                      <td>{money(month.netProfit)}</td>
                      <td>{ratio(month.netProfit, month.sales)}</td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
