import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchMonthlyPreparedMeatPrices,
  type MeatPriceMode,
  type MonthlyPreparedMeatPriceRow,
} from "@/lib/reports";

type ProductPriceRow = {
  id: string;
  name: string;
  prices: Map<number, MonthlyPreparedMeatPriceRow>;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FIRST_DATA_YEAR = 2023;

export function MeatPriceReport({ mode }: { mode: MeatPriceMode }) {
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<MonthlyPreparedMeatPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const years = Array.from(
    { length: currentYear - FIRST_DATA_YEAR + 1 },
    (_, index) => currentYear - index,
  );
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const products = useMemo(() => {
    const grouped = new Map<string, ProductPriceRow>();
    for (const row of rows) {
      const product = grouped.get(row.productId) ?? {
        id: row.productId,
        name: row.productName,
        prices: new Map(),
      };
      product.prices.set(row.monthNumber, row);
      grouped.set(row.productId, product);
    }
    return [...grouped.values()];
  }, [rows]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchMonthlyPreparedMeatPrices({ year, mode })
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("reports.loadError"),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, year, t]);

  return (
    <>
      <section className="panel meat-price-filter">
        <label>
          <span>{t("reports.year")}</span>
          <select
            aria-label={t("reports.year")}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="panel meat-price-report">
        <header>
          <div>
            <h2>
              {t("reports.tabs.averageSupplyPrice")} /{" "}
              {t("reports.tabs.productionCostPrice")}
            </h2>
            <p>{t("reports.meatPriceDescription", { year })}</p>
          </div>
        </header>
        {error ? (
          <div className="report-state error">
            <p>{t("reports.loadError")}</p>
            <small>{error}</small>
          </div>
        ) : loading ? (
          <div className="report-state">{t("reports.loading")}</div>
        ) : !products.length ? (
          <div className="report-state">{t("reports.meatPriceEmpty")}</div>
        ) : (
          <div className="report-table-wrap meat-price-table-wrap">
            <table className="meat-price-table">
              <thead>
                <tr>
                  <th>{year}</th>
                  {MONTHS.map((month) => (
                    <th key={month}>{t("reports.month", { month })}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <th scope="row">{product.name}</th>
                    {MONTHS.map((month) => {
                      const price = product.prices.get(month);
                      return (
                        <td key={month}>
                          {price ? (
                            <>
                              <span>
                                {currency.format(price.pricePerKg)}/kg
                              </span>
                              <span>
                                {currency.format(price.pricePerPackage)}/
                                {price.productUnit ?? t("reports.package")}
                              </span>
                            </>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
