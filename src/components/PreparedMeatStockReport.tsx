import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchMonthlyPreparedMeatStock,
  type MonthlyPreparedMeatStockRow,
} from "@/lib/reports";

type PreparedStockItem = {
  id: string;
  name: string;
  unit: string | null;
  months: Map<number, MonthlyPreparedMeatStockRow>;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FIRST_DATA_YEAR = 2023;

export function PreparedMeatStockReport() {
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<MonthlyPreparedMeatStockRow[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const years = Array.from(
    { length: currentYear - FIRST_DATA_YEAR + 1 },
    (_, index) => currentYear - index,
  );
  const number = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );
  const items = useMemo(() => {
    const grouped = new Map<string, PreparedStockItem>();
    for (const row of rows) {
      const item = grouped.get(row.preparedMeatItemId) ?? {
        id: row.preparedMeatItemId,
        name: row.preparedMeatName,
        unit: row.productUnit,
        months: new Map(),
      };
      item.months.set(row.monthNumber, row);
      grouped.set(row.preparedMeatItemId, item);
    }
    return [...grouped.values()];
  }, [rows]);
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0];
  const latestMonth = rows.reduce(
    (latest, row) => Math.max(latest, row.monthNumber),
    0,
  );
  const latestRows = rows.filter((row) => row.monthNumber === latestMonth);
  const totalStock = latestRows.reduce(
    (total, row) => total + row.monthEndPackages,
    0,
  );
  const negativeStockItems = latestRows.filter(
    (row) => row.monthEndPackages < 0,
  ).length;
  const zeroStockItems = latestRows.filter(
    (row) => row.monthEndPackages === 0,
  ).length;
  const itemSnapshots = useMemo(
    () =>
      items.map((item) => {
        const latest = item.months.get(latestMonth);
        return { item, latest };
      }),
    [items, latestMonth],
  );
  const trendPoints = useMemo(() => {
    if (!selectedItem) return [];
    return MONTHS.flatMap((month) => {
      const stock = selectedItem.months.get(month);
      return stock
        ? [{ month, value: stock.monthEndPackages }]
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
    void fetchMonthlyPreparedMeatStock(year)
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
          <div className="report-state">{t("reports.preparedStockEmpty")}</div>
        </section>
      ) : (
        <>
          <section
            className="raw-meat-price-summary"
            aria-label={t("reports.preparedStockSummary")}
          >
            <article className="panel">
              <span>{t("reports.latestMonth")}</span>
              <strong>{t("reports.month", { month: latestMonth })}</strong>
              <small>{year}</small>
            </article>
            <article className="panel">
              <span>{t("reports.preparedProductTypes")}</span>
              <strong>{items.length}</strong>
              <small>{t("reports.trackedProducts")}</small>
            </article>
            <article className="panel">
              <span>{t("reports.totalMonthEndStock")}</span>
              <strong>{number.format(totalStock)}</strong>
              <small>{t("reports.allPreparedProducts")}</small>
            </article>
            <article className="panel">
              <span>{t("reports.stockExceptions")}</span>
              <strong className={negativeStockItems ? "stock-negative" : undefined}>
                {negativeStockItems}
              </strong>
              <small>
                {t("reports.negativeAndZeroStock", {
                  negative: negativeStockItems,
                  zero: zeroStockItems,
                })}
              </small>
            </article>
          </section>
          <section className="meat-price-analysis-grid">
            <section className="panel meat-price-product-browser">
              <header>
                <div>
                  <span>{t("reports.preparedProductList")}</span>
                  <h2>{t("reports.selectPreparedProduct")}</h2>
                </div>
                <strong>{items.length}</strong>
              </header>
              <div className="meat-price-product-list">
                {itemSnapshots.map(({ item, latest }) => (
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
                      <small>{t("reports.month", { month: latestMonth })}</small>
                    </span>
                    <span>
                      <strong
                        className={
                          latest && latest.monthEndPackages < 0
                            ? "stock-negative"
                            : undefined
                        }
                      >
                        {latest
                          ? `${number.format(latest.monthEndPackages)} ${item.unit ?? t("reports.package")}`
                          : "—"}
                      </strong>
                      {latest && (
                        <small
                          className={
                            latest.monthlyNetPackages > 0
                              ? "stock-positive"
                              : latest.monthlyNetPackages < 0
                                ? "stock-negative"
                                : undefined
                          }
                        >
                          {latest.monthlyNetPackages > 0 ? "↑ +" : latest.monthlyNetPackages < 0 ? "↓ " : "— "}
                          {number.format(latest.monthlyNetPackages)}
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
                  <span>{t("reports.preparedStockTrend")}</span>
                  <h2>{selectedItem?.name}</h2>
                </div>
                <strong>{selectedItem?.unit ?? t("reports.package")}</strong>
              </header>
              <div className="meat-price-chart">
                <svg
                  aria-label={t("reports.preparedProductStockTrend", {
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
                        {number.format(point.value)}
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
                <h2>{t("reports.tabs.preparedMeatStock")}</h2>
                <p>{t("reports.preparedStockDescription", { year })}</p>
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
                        const stock = item.months.get(month);
                        return (
                          <td key={month}>
                            {stock ? (
                              <span
                                className={
                                  stock.monthEndPackages < 0
                                    ? "stock-negative"
                                    : undefined
                                }
                                title={t("reports.stockMovementDetail", {
                                  net: number.format(stock.monthlyNetPackages),
                                })}
                              >
                                {number.format(stock.monthEndPackages)}
                                {item.unit ?? t("reports.package")}
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
