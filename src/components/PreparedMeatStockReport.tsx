import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MonthlyTrendChart } from "@/components/reports/MonthlyTrendChart";
import { ReportItemSelector } from "@/components/reports/ReportItemSelector";
import { ReportSummaryCards } from "@/components/reports/ReportSummaryCards";
import { ReportYearFilter } from "@/components/reports/ReportYearFilter";
import {
  fetchMonthlyPreparedMeatStock,
  fetchMonthlyRawMeatStock,
  type MonthlyPreparedMeatStockRow,
  type MonthlyRawMeatStockRow,
} from "@/lib/reports";

type StockKind = "prepared" | "raw";

type MonthlyStockRow = {
  itemId: string;
  itemName: string;
  productUnit: string | null;
  monthNumber: number;
  monthEndStock: number;
  monthlyNetStock: number;
};

type StockItem = {
  id: string;
  name: string;
  unit: string | null;
  months: Map<number, MonthlyStockRow>;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FIRST_DATA_YEAR = 2023;

function normalizePreparedStock(
  row: MonthlyPreparedMeatStockRow,
): MonthlyStockRow {
  return {
    itemId: row.preparedMeatItemId,
    itemName: row.preparedMeatName,
    productUnit: row.productUnit,
    monthNumber: row.monthNumber,
    monthEndStock: row.monthEndPackages,
    monthlyNetStock: row.monthlyNetPackages,
  };
}

function normalizeRawStock(row: MonthlyRawMeatStockRow): MonthlyStockRow {
  return {
    itemId: row.rawMeatItemId,
    itemName: row.rawMeatName,
    productUnit: row.productUnit,
    monthNumber: row.monthNumber,
    monthEndStock: row.monthEndKg,
    monthlyNetStock: row.monthlyNetKg,
  };
}

async function fetchMonthlyStock(kind: StockKind, year: number) {
  if (kind === "raw") {
    return (await fetchMonthlyRawMeatStock(year)).map(normalizeRawStock);
  }
  return (await fetchMonthlyPreparedMeatStock(year)).map(
    normalizePreparedStock,
  );
}

function MeatStockReport({ kind }: { kind: StockKind }) {
  const { t, i18n } = useTranslation();
  const isRaw = kind === "raw";
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<MonthlyStockRow[]>([]);
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
    const grouped = new Map<string, StockItem>();
    for (const row of rows) {
      const item = grouped.get(row.itemId) ?? {
        id: row.itemId,
        name: row.itemName,
        unit: row.productUnit,
        months: new Map(),
      };
      item.months.set(row.monthNumber, row);
      grouped.set(row.itemId, item);
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
    (total, row) => total + row.monthEndStock,
    0,
  );
  const negativeStockItems = latestRows.filter(
    (row) => row.monthEndStock < 0,
  ).length;
  const zeroStockItems = latestRows.filter(
    (row) => row.monthEndStock === 0,
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
        ? [{ month, value: stock.monthEndStock }]
        : [];
    });
  }, [selectedItem]);

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
    void fetchMonthlyStock(kind, year)
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
  }, [kind, t, year]);

  return (
    <>
      <ReportYearFilter
        label={t("reports.year")}
        year={year}
        years={years}
        onYearChange={setYear}
      />
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
          <div className="report-state">
            {t(
              isRaw
                ? "reports.rawStockEmpty"
                : "reports.preparedStockEmpty",
            )}
          </div>
        </section>
      ) : (
        <>
          <ReportSummaryCards
            ariaLabel={t(
              isRaw
                ? "reports.rawStockSummary"
                : "reports.preparedStockSummary",
            )}
            cards={[
              {
                label: t("reports.latestMonth"),
                value: t("reports.month", { month: latestMonth }),
                caption: year,
              },
              {
                label: t(
                  isRaw
                    ? "reports.rawMeatTypes"
                    : "reports.preparedProductTypes",
                ),
                value: items.length,
                caption: t(
                  isRaw
                    ? "reports.trackedRawMeat"
                    : "reports.trackedProducts",
                ),
              },
              {
                label: t(
                  isRaw
                    ? "reports.totalMonthEndRawStock"
                    : "reports.totalMonthEndStock",
                ),
                value: number.format(totalStock),
                caption: t(
                  isRaw
                    ? "reports.allRawMeatCombined"
                    : "reports.allPreparedProducts",
                ),
              },
              {
                label: t("reports.stockExceptions"),
                value: negativeStockItems,
                valueClassName: negativeStockItems
                  ? "stock-negative"
                  : undefined,
                caption: t("reports.negativeAndZeroStock", {
                  negative: negativeStockItems,
                  zero: zeroStockItems,
                }),
              },
            ]}
          />
          <section className="meat-price-analysis-grid">
            <ReportItemSelector
              eyebrow={t(
                isRaw
                  ? "reports.rawMeatList"
                  : "reports.preparedProductList",
              )}
              title={t(
                isRaw
                  ? "reports.selectRawMeatStock"
                  : "reports.selectPreparedProduct",
              )}
              items={itemSnapshots.map(({ item, latest }) => ({
                id: item.id,
                name: item.name,
                updateLabel: t("reports.dataUpdatedThrough", {
                  month: latestMonth,
                }),
                value: latest
                  ? `${number.format(latest.monthEndStock)} ${item.unit ?? t(isRaw ? "reports.kg" : "reports.package")}`
                  : "—",
                valueClassName:
                  latest && latest.monthEndStock < 0
                    ? "stock-negative"
                    : undefined,
                status: latest
                  ? `${latest.monthlyNetStock > 0 ? "↑ +" : latest.monthlyNetStock < 0 ? "↓ " : "— "}${number.format(latest.monthlyNetStock)}`
                  : undefined,
                statusClassName:
                  latest && latest.monthlyNetStock > 0
                    ? "stock-positive"
                    : latest && latest.monthlyNetStock < 0
                      ? "stock-negative"
                      : undefined,
              }))}
              selectedId={selectedItem?.id}
              onSelect={setSelectedItemId}
            />
            <MonthlyTrendChart
              eyebrow={t(
                isRaw
                  ? "reports.rawStockTrend"
                  : "reports.preparedStockTrend",
              )}
              title={selectedItem?.name}
              badge={
                selectedItem?.unit ??
                t(isRaw ? "reports.kg" : "reports.package")
              }
              ariaLabel={t(
                isRaw
                  ? "reports.rawMeatStockTrend"
                  : "reports.preparedProductStockTrend",
                { product: selectedItem?.name },
              )}
              points={trendPoints}
              formatValue={number.format}
            />
          </section>
          <details className="panel meat-price-detail" open>
            <summary>
              <div>
                <h2>
                  {t(
                    isRaw
                      ? "reports.tabs.rawMeatStock"
                      : "reports.tabs.preparedMeatStock",
                  )}
                </h2>
                <p>
                  {t(
                    isRaw
                      ? "reports.rawStockDescription"
                      : "reports.preparedStockDescription",
                    { year },
                  )}
                </p>
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
                                  stock.monthEndStock < 0
                                    ? "stock-negative"
                                    : undefined
                                }
                                title={t("reports.stockMovementDetail", {
                                  net: number.format(stock.monthlyNetStock),
                                })}
                              >
                                {number.format(stock.monthEndStock)}
                                {item.unit ??
                                  t(
                                    isRaw
                                      ? "reports.kg"
                                      : "reports.package",
                                  )}
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

export function PreparedMeatStockReport() {
  return <MeatStockReport kind="prepared" />;
}

export function RawMeatStockReport() {
  return <MeatStockReport kind="raw" />;
}
