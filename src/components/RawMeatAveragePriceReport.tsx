import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchMonthlyRawMeatAveragePrices,
  type MonthlyRawMeatAveragePriceRow,
} from "@/lib/reports";

type RawMeatPriceRow = {
  id: string;
  name: string;
  months: Map<number, MonthlyRawMeatAveragePriceRow>;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FIRST_DATA_YEAR = 2023;

export function RawMeatAveragePriceReport() {
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<MonthlyRawMeatAveragePriceRow[]>([]);
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
  const quantity = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  );
  const items = useMemo(() => {
    const grouped = new Map<string, RawMeatPriceRow>();
    for (const row of rows) {
      const item = grouped.get(row.rawMeatItemId) ?? {
        id: row.rawMeatItemId,
        name: row.rawMeatName,
        months: new Map(),
      };
      item.months.set(row.monthNumber, row);
      grouped.set(row.rawMeatItemId, item);
    }
    return [...grouped.values()];
  }, [rows]);
  const latestMonth = rows.reduce(
    (latest, row) => Math.max(latest, row.monthNumber),
    0,
  );
  const totalReceipts = rows.reduce(
    (total, row) => total + row.receiptCount,
    0,
  );
  const totalQuantity = rows.reduce(
    (total, row) => total + row.totalQuantityKg,
    0,
  );
  const weightedAverage = totalQuantity
    ? rows.reduce(
        (total, row) =>
          total + row.averagePricePerKg * row.totalQuantityKg,
        0,
      ) / totalQuantity
    : null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchMonthlyRawMeatAveragePrices(year)
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
  }, [t, year]);

  return (
    <>
      <section className="panel raw-meat-price-filter">
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
      {error ? (
        <section className="panel">
          <div className="report-state error">
            <p>{t("reports.loadError")}</p>
            <small>{error}</small>
          </div>
        </section>
      ) : loading ? (
        <section className="panel">
          <div className="report-state">{t("reports.loading")}</div>
        </section>
      ) : !items.length ? (
        <section className="panel">
          <div className="report-state">{t("reports.rawMeatPriceEmpty")}</div>
        </section>
      ) : (
        <>
          <section
            className="raw-meat-price-summary"
            aria-label={t("reports.rawMeatPriceSummary")}
          >
            <article className="panel">
              <span>{t("reports.latestMonth")}</span>
              <strong>{t("reports.month", { month: latestMonth })}</strong>
              <small>{year}</small>
            </article>
            <article className="panel">
              <span>{t("reports.rawMeatTypes")}</span>
              <strong>{items.length}</strong>
              <small>{t("reports.withPurchaseRecords")}</small>
            </article>
            <article className="panel">
              <span>{t("reports.purchaseReceipts")}</span>
              <strong>{totalReceipts}</strong>
              <small>
                {quantity.format(totalQuantity)} {t("reports.kgPurchased")}
              </small>
            </article>
            <article className="panel">
              <span>{t("reports.yearWeightedAverage")}</span>
              <strong>
                {weightedAverage === null
                  ? "—"
                  : `${currency.format(weightedAverage)}/kg`}
              </strong>
              <small>{t("reports.weightedByPurchaseQuantity")}</small>
            </article>
          </section>
          <section className="panel raw-meat-price-report">
            <header>
              <div>
                <h2>{t("reports.tabs.rawMeatAveragePrice")}</h2>
                <p>{t("reports.rawMeatPriceDescription", { year })}</p>
              </div>
            </header>
            <div className="report-table-wrap raw-meat-price-table-wrap">
              <table className="raw-meat-price-table">
                <thead>
                  <tr>
                    <th>{year}</th>
                    {MONTHS.map((month) => (
                      <th key={month}>{t("reports.month", { month })}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.name}</th>
                      {MONTHS.map((month) => {
                        const price = item.months.get(month);
                        return (
                          <td key={month}>
                            {price ? (
                              <span
                                title={t("reports.receiptDetail", {
                                  receipts: price.receiptCount,
                                  quantity: quantity.format(
                                    price.totalQuantityKg,
                                  ),
                                })}
                              >
                                {currency.format(price.averagePricePerKg)}
                              </span>
                            ) : (
                              <span className="price-missing">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
