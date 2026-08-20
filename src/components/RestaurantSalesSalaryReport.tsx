import { RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildRestaurantSalesSalaryTable,
  defaultSalesSalaryMonths,
  fetchRestaurantSalesSalaryReport,
  type RestaurantSalesSalaryRow,
} from "@/lib/restaurant-sales-salary-report";
import {
  fetchShopReportRestaurants,
  type ShopReportRestaurant,
} from "@/lib/shop-sales-working-hours-report";

const money = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return money.format(value).replace("HK$", "$");
}

export function RestaurantSalesSalaryReport({
  loadRestaurants = fetchShopReportRestaurants,
  loadReport = fetchRestaurantSalesSalaryReport,
}: {
  loadRestaurants?: () => Promise<ShopReportRestaurant[]>;
  loadReport?: (input: {
    startMonth: string;
    endMonth: string;
    restaurantIds: string[];
  }) => Promise<RestaurantSalesSalaryRow[]>;
}) {
  const { t, i18n } = useTranslation();
  const defaults = useMemo(defaultSalesSalaryMonths, []);
  const [startMonth, setStartMonth] = useState(defaults.startMonth);
  const [endMonth, setEndMonth] = useState(defaults.endMonth);
  const [restaurants, setRestaurants] = useState<ShopReportRestaurant[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rows, setRows] = useState<RestaurantSalesSalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = useState<number>();
  const validRange = Boolean(startMonth && endMonth && startMonth <= endMonth);
  const selectedRestaurants = useMemo(
    () => restaurants.filter((item) => selectedIds.includes(item.id)),
    [restaurants, selectedIds],
  );
  const report = useMemo(
    () => buildRestaurantSalesSalaryTable(rows, selectedRestaurants),
    [rows, selectedRestaurants],
  );

  useLayoutEffect(() => {
    const tableScroll = tableScrollRef.current;
    if (!tableScroll) return;

    const updateHeight = () => {
      const top = tableScroll.getBoundingClientRect().top;
      const pageMain = tableScroll.closest("main");
      const pageBottomPadding = pageMain
        ? Number.parseFloat(window.getComputedStyle(pageMain).paddingBottom) || 0
        : 0;
      const bottomClearance = pageBottomPadding + 2;
      setTableMaxHeight(
        Math.max(
          180,
          Math.floor(window.innerHeight - top - bottomClearance),
        ),
      );
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [loading, report.months.length, selectedIds.length]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadRestaurants()
      .then((items) => {
        if (!active) return;
        setRestaurants(items);
        setSelectedIds(items.map((item) => item.id));
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
    if (!validRange || selectedIds.length === 0) {
      setRows([]);
      if (restaurants.length) setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      void loadReport({ startMonth, endMonth, restaurantIds: selectedIds })
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
  }, [endMonth, loadReport, restaurants.length, selectedIds, startMonth, validRange]);

  const reset = () => {
    setStartMonth(defaults.startMonth);
    setEndMonth(defaults.endMonth);
    setSelectedIds(restaurants.map((item) => item.id));
  };
  const monthLabel = (value: string) => {
    const [year, month] = value.slice(0, 7).split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language, {
      year: "numeric",
      month: "long",
    }).format(new Date(year, month - 1, 1));
  };

  return (
    <section className="restaurant-sales-salary-report">
      <section className="panel restaurant-sales-salary-filters">
        <label>
          <span>{t("restaurantSalesSalary.startMonth")}</span>
          <input
            aria-label={t("restaurantSalesSalary.startMonth")}
            type="month"
            value={startMonth}
            onChange={(event) => setStartMonth(event.target.value)}
          />
        </label>
        <label>
          <span>{t("restaurantSalesSalary.endMonth")}</span>
          <input
            aria-label={t("restaurantSalesSalary.endMonth")}
            type="month"
            value={endMonth}
            onChange={(event) => setEndMonth(event.target.value)}
          />
        </label>
        <div className="restaurant-sales-salary-shop-filter">
          <span id="restaurant-sales-salary-shop-label">
            {t("restaurantSalesSalary.restaurants")}
          </span>
          <MultiSelect
            id="restaurant-sales-salary-shops"
            labelledBy="restaurant-sales-salary-shop-label"
            options={restaurants}
            value={selectedIds}
            onChange={setSelectedIds}
            placeholder={t("restaurantSalesSalary.selectRestaurantsPlaceholder")}
            searchPlaceholder={t("restaurantSalesSalary.searchRestaurantsPlaceholder")}
            emptyLabel={t("restaurantSalesSalary.noRestaurants")}
          />
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw />
          {t("restaurantSalesSalary.reset")}
        </Button>
      </section>

      {!validRange ? (
        <section className="panel restaurant-sales-salary-state">
          {t("restaurantSalesSalary.invalidRange")}
        </section>
      ) : selectedIds.length === 0 ? (
        <section className="panel restaurant-sales-salary-state">
          {t("restaurantSalesSalary.selectAtLeastOne")}
        </section>
      ) : loading ? (
        <PageSkeleton
          compact
          showSummary={false}
          label={t("restaurantSalesSalary.loading")}
          variant="report"
        />
      ) : error ? (
        <section className="panel restaurant-sales-salary-state is-error">
          <strong>{t("restaurantSalesSalary.loadError")}</strong>
          <span>{error}</span>
        </section>
      ) : report.months.length === 0 ? (
        <section className="panel restaurant-sales-salary-state">
          {t("restaurantSalesSalary.empty")}
        </section>
      ) : (
        <section className="panel restaurant-sales-salary-card">
          <div
            className="restaurant-sales-salary-table-scroll"
            ref={tableScrollRef}
            style={tableMaxHeight ? { maxHeight: tableMaxHeight } : undefined}
          >
            <table className="restaurant-sales-salary-table">
              <thead>
                <tr>
                  <th aria-label={t("restaurantSalesSalary.month")} />
                  {report.restaurants.map((restaurant) => (
                    <th colSpan={3} scope="colgroup" key={restaurant.id}>
                      {restaurant.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th scope="col">{t("restaurantSalesSalary.month")}</th>
                  {report.restaurants.flatMap((restaurant) => [
                    <th scope="col" key={`${restaurant.id}:sales`}>
                      {t("restaurantSalesSalary.sales")}
                    </th>,
                    <th scope="col" key={`${restaurant.id}:salary`}>
                      {t("restaurantSalesSalary.salary")}
                    </th>,
                    <th scope="col" key={`${restaurant.id}:ratio`}>
                      {t("restaurantSalesSalary.ratio")}
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {report.months.map((month) => (
                  <tr key={month}>
                    <th scope="row">{monthLabel(month)}</th>
                    {report.restaurants.flatMap((restaurant) => {
                      const value = report.value(month, restaurant.id);
                      return [
                        <td key={`${restaurant.id}:sales`}>
                          {formatMoney(value?.sales ?? 0)}
                        </td>,
                        <td key={`${restaurant.id}:salary`}>
                          {value?.salary == null
                            ? t("restaurantSalesSalary.noSalary")
                            : formatMoney(value.salary)}
                        </td>,
                        <td key={`${restaurant.id}:ratio`}>
                          {value?.salaryToSalesPercent == null
                            ? "—"
                            : `${percent.format(value.salaryToSalesPercent)}%`}
                        </td>,
                      ];
                    })}
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
