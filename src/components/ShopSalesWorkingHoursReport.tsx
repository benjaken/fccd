import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildShopSalesWorkingHoursTables,
  fetchShopReportRestaurants,
  fetchShopSalesWorkingHours,
  type ShopReportRestaurant,
  type ShopSalesWorkingHoursRow,
} from "@/lib/shop-sales-working-hours-report";

function yearToDate() {
  const now = new Date();
  const value = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: value(now),
  };
}

const money = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const hours = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 2 });

function formatMoney(value: number) {
  return money.format(value).replace("HK$", "$");
}

export function ShopSalesWorkingHoursReport({
  loadRestaurants = fetchShopReportRestaurants,
  loadReport = fetchShopSalesWorkingHours,
}: {
  loadRestaurants?: typeof fetchShopReportRestaurants;
  loadReport?: typeof fetchShopSalesWorkingHours;
}) {
  const { t, i18n } = useTranslation();
  const defaults = useMemo(yearToDate, []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [restaurants, setRestaurants] = useState<ShopReportRestaurant[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rows, setRows] = useState<ShopSalesWorkingHoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const selectedRestaurants = useMemo(
    () => restaurants.filter((restaurant) => selectedIds.includes(restaurant.id)),
    [restaurants, selectedIds],
  );
  const tables = useMemo(
    () => buildShopSalesWorkingHoursTables(rows, selectedRestaurants),
    [rows, selectedRestaurants],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadRestaurants()
      .then((items) => {
        if (!active) return;
        setRestaurants(items);
        setSelectedIds(items.map((item) => item.id));
        if (items.length === 0) setLoading(false);
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
    if (!validRange || selectedIds.length === 0) {
      setRows([]);
      if (restaurants.length > 0) setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      void loadReport({ startDate, endDate, restaurantIds: selectedIds })
        .then((items) => {
          if (active) setRows(items);
        })
        .catch((loadError: unknown) => {
          if (!active) return;
          setRows([]);
          setError(
            loadError instanceof Error ? loadError.message : "load_failed",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [endDate, loadReport, restaurants.length, selectedIds, startDate, validRange]);

  const reset = () => {
    setStartDate(defaults.startDate);
    setEndDate(defaults.endDate);
    setSelectedIds(restaurants.map((restaurant) => restaurant.id));
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(new Date(`${value}T00:00:00`));

  return (
    <section className="shop-sales-hours-report">
      <section className="panel shop-sales-hours-filters">
        <DateRangePicker
          startId="shop-sales-hours-start-date"
          endId="shop-sales-hours-end-date"
          startValue={startDate}
          endValue={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          startLabel={t("shopSalesWorkingHours.startDate")}
          endLabel={t("shopSalesWorkingHours.endDate")}
          legend={t("shopSalesWorkingHours.dateRange")}
        />
        <div className="shop-sales-hours-shop-filter">
          <span id="shop-sales-hours-shop-label">
            {t("shopSalesWorkingHours.shops")}
          </span>
          <MultiSelect
            id="shop-sales-hours-shops"
            labelledBy="shop-sales-hours-shop-label"
            options={restaurants}
            value={selectedIds}
            onChange={setSelectedIds}
            placeholder={t("shopSalesWorkingHours.selectShopsPlaceholder")}
            searchPlaceholder={t("shopSalesWorkingHours.searchShopsPlaceholder")}
            emptyLabel={t("shopSalesWorkingHours.noShops")}
          />
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw />
          {t("shopSalesWorkingHours.reset")}
        </Button>
      </section>

      {!validRange ? (
        <section className="panel shop-sales-hours-state">
          {t("shopSalesWorkingHours.invalidRange")}
        </section>
      ) : selectedIds.length === 0 ? (
        <section className="panel shop-sales-hours-state">
          {t("shopSalesWorkingHours.selectAtLeastOne")}
        </section>
      ) : loading ? (
        <PageSkeleton
          compact
          label={t("shopSalesWorkingHours.loading")}
          showSummary={false}
          tableRows={18}
          variant="report"
        />
      ) : error ? (
        <section className="panel shop-sales-hours-state is-error">
          <strong>{t("shopSalesWorkingHours.loadError")}</strong>
          <span>{error}</span>
        </section>
      ) : (
        <div className="shop-sales-hours-content">
          <div className="shop-sales-hours-tables">
            {tables.map((table) => (
              <section className="panel shop-sales-hours-card" key={table.restaurant.id}>
              <header>
                <h2>{table.restaurant.name}</h2>
                <span>
                  {startDate} — {endDate}
                </span>
              </header>
              {table.dates.length === 0 ? (
                <div className="shop-sales-hours-state">
                  {t("shopSalesWorkingHours.shopEmpty")}
                </div>
              ) : (
                <div className="shop-sales-hours-table-scroll">
                  <table className="shop-sales-hours-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} scope="col" className="shop-sales-hours-date">
                          {t("shopSalesWorkingHours.date")}
                        </th>
                        {table.departments.map((department) => (
                          <th colSpan={2} scope="colgroup" key={department.name}>
                            {department.name}
                          </th>
                        ))}
                        <th colSpan={2} scope="colgroup" className="shop-sales-hours-total">
                          {t("shopSalesWorkingHours.total")}
                        </th>
                      </tr>
                      <tr>
                        {[...table.departments, { name: "total", order: 9999 }].flatMap(
                          (department) => [
                            <th scope="col" key={`${department.name}:sales-hours`}>
                              {t("shopSalesWorkingHours.salesAndHours")}
                            </th>,
                            <th scope="col" key={`${department.name}:average`}>
                              {t("shopSalesWorkingHours.salesPerHour")}
                            </th>,
                          ],
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {table.dates.map((date) => (
                        <tr key={date.date}>
                          <th scope="row" className="shop-sales-hours-date">
                            {formatDate(date.date)}
                          </th>
                          {table.departments.flatMap((department) => {
                            const value = date.departments[department.name];
                            return [
                              <td key={`${department.name}:sales-hours`}>
                                <strong>
                                  {formatMoney(value?.sales ?? 0)} / {hours.format(value?.workingHours ?? 0)}
                                  {t("shopSalesWorkingHours.hours")}
                                </strong>
                              </td>,
                              <td key={`${department.name}:average`} className="shop-sales-hours-average">
                                {formatMoney(value?.salesPerWorkingHour ?? 0)} / {t("shopSalesWorkingHours.perHour")}
                              </td>,
                            ];
                          })}
                          <td className="shop-sales-hours-total">
                            <strong>
                              {formatMoney(date.totalSales)} / {hours.format(date.totalWorkingHours)}
                              {t("shopSalesWorkingHours.hours")}
                            </strong>
                          </td>
                          <td className="shop-sales-hours-average shop-sales-hours-total">
                            {formatMoney(date.totalSalesPerWorkingHour)} / {t("shopSalesWorkingHours.perHour")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </section>
            ))}
          </div>
          <aside
            className="shop-sales-hours-summaries"
            aria-label={t("shopSalesWorkingHours.dailySummary")}
          >
            {tables.map((table) => (
              <section
                className="panel shop-sales-hours-summary-card"
                key={table.restaurant.id}
              >
                <h3>{table.restaurant.name}</h3>
                {table.summaries.length === 0 ? (
                  <p>{t("shopSalesWorkingHours.shopEmpty")}</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("shopSalesWorkingHours.department")}</th>
                        <th scope="col">{t("shopSalesWorkingHours.maximum")}</th>
                        <th scope="col">{t("shopSalesWorkingHours.minimum")}</th>
                        <th scope="col">{t("shopSalesWorkingHours.average")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.summaries.map((summary) => (
                        <tr key={summary.departmentName}>
                          <th scope="row">{summary.departmentName}</th>
                          <td>{formatMoney(summary.maximum)}</td>
                          <td>{formatMoney(summary.minimum)}</td>
                          <td>{formatMoney(summary.average)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </aside>
        </div>
      )}
    </section>
  );
}
