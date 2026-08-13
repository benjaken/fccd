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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0];
  const itemSnapshots = useMemo(
    () =>
      items.map((item) => {
        const available = [...item.months.values()].sort(
          (left, right) => right.monthNumber - left.monthNumber,
        );
        const latest = available[0];
        const previous = available[1];
        const change =
          latest && previous && previous.averagePricePerKg
            ? ((latest.averagePricePerKg - previous.averagePricePerKg) /
                previous.averagePricePerKg) *
              100
            : null;
        return { item, latest, change };
      }),
    [items],
  );
  const trendPoints = useMemo(() => {
    if (!selectedItem) return [];
    return MONTHS.flatMap((month) => {
      const price = selectedItem.months.get(month);
      return price
        ? [{ month, value: price.averagePricePerKg }]
        : [];
    });
  }, [selectedItem]);
  const chart = useMemo(() => {
    if (!trendPoints.length) return { points: "", plotted: [] };
    const values = trendPoints.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    const plotted = trendPoints.map((point) => ({
      ...point,
      x: 48 + ((point.month - 1) / 11) * 644,
      y: 24 + ((maximum - point.value) / range) * 136,
    }));
    return {
      points: plotted.map((point) => `${point.x},${point.y}`).join(" "),
      plotted,
    };
  }, [trendPoints]);
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
    if (
      items.length &&
      !items.some((item) => item.id === selectedItemId)
    ) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

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
          <section className="meat-price-analysis-grid">
            <section className="panel meat-price-product-browser">
              <header>
                <div>
                  <span>{t("reports.rawMeatList")}</span>
                  <h2>{t("reports.selectRawMeat")}</h2>
                </div>
                <strong>{items.length}</strong>
              </header>
              <div className="meat-price-product-list">
                {itemSnapshots.map(({ item, latest, change }) => (
                  <button
                    className={
                      selectedItem?.id === item.id ? "selected" : undefined
                    }
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {latest
                          ? t("reports.dataUpdatedThrough", {
                              month: latest.monthNumber,
                            })
                          : "—"}
                      </small>
                    </span>
                    <span>
                      <strong>
                        {latest
                          ? currency.format(latest.averagePricePerKg)
                          : "—"}
                      </strong>
                      {change !== null && (
                        <small
                          className={
                            change > 0
                              ? "price-up"
                              : change < 0
                                ? "price-down"
                                : undefined
                          }
                        >
                          {change > 0 ? "↑" : change < 0 ? "↓" : "—"}{" "}
                          {Math.abs(change).toFixed(1)}%
                        </small>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel meat-price-trend">
              <header>
                <div>
                  <span>{t("reports.rawMeatPriceTrend")}</span>
                  <h2>{selectedItem?.name}</h2>
                </div>
                <strong>{t("reports.perKg")}</strong>
              </header>
              <div className="meat-price-chart">
                <svg
                  aria-label={t("reports.rawMeatProductPriceTrend", {
                    product: selectedItem?.name,
                  })}
                  role="img"
                  viewBox="0 0 740 210"
                >
                  {[24, 92, 160].map((y) => (
                    <line
                      className="price-chart-grid"
                      key={y}
                      x1="48"
                      x2="692"
                      y1={y}
                      y2={y}
                    />
                  ))}
                  <polyline className="price-chart-line" points={chart.points} />
                  {chart.plotted.map((point) => (
                    <g key={point.month}>
                      <circle
                        className="price-chart-point"
                        cx={point.x}
                        cy={point.y}
                        r="5"
                      />
                      <title>
                        {t("reports.month", { month: point.month })}:{" "}
                        {currency.format(point.value)}
                      </title>
                    </g>
                  ))}
                  {MONTHS.map((month) => (
                    <text
                      className="price-chart-month"
                      key={month}
                      x={48 + ((month - 1) / 11) * 644}
                      y="192"
                      textAnchor="middle"
                    >
                      {month}
                    </text>
                  ))}
                </svg>
              </div>
            </section>
          </section>
          <details className="panel meat-price-detail" open>
            <summary>
              <div>
                <h2>{t("reports.tabs.rawMeatAveragePrice")}</h2>
                <p>{t("reports.rawMeatPriceDescription", { year })}</p>
              </div>
              <span>{t("reports.expandMonthlyMatrix")}</span>
            </summary>
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
          </details>
        </>
      )}
    </>
  );
}
