import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MonthlyTrendChart } from "@/components/reports/MonthlyTrendChart";
import { ReportItemSelector } from "@/components/reports/ReportItemSelector";
import { ReportSummaryCards } from "@/components/reports/ReportSummaryCards";
import { ReportYearFilter } from "@/components/reports/ReportYearFilter";
import {
  fetchMonthlyPreparedMeatPrices,
  type MeatPriceMode,
  type MonthlyPreparedMeatPriceRow,
} from "@/lib/reports";

type ProductPriceRow = {
  id: string;
  name: string;
  unit: string | null;
  prices: Map<number, MonthlyPreparedMeatPriceRow>;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FIRST_DATA_YEAR = 2023;
type PriceUnit = "kg" | "package";

function getPrice(row: MonthlyPreparedMeatPriceRow, unit: PriceUnit) {
  return unit === "kg" ? row.pricePerKg : row.pricePerPackage;
}

export function MeatPriceReport({ mode }: { mode: MeatPriceMode }) {
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [unit, setUnit] = useState<PriceUnit>("kg");
  const [rows, setRows] = useState<MonthlyPreparedMeatPriceRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
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
        unit: row.productUnit,
        prices: new Map(),
      };
      product.prices.set(row.monthNumber, row);
      grouped.set(row.productId, product);
    }
    return [...grouped.values()];
  }, [rows]);
  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ?? products[0];
  const latestMonth = rows.reduce(
    (latest, row) => Math.max(latest, row.monthNumber),
    0,
  );
  const latestPricedProducts = products.filter((product) =>
    product.prices.has(latestMonth),
  ).length;
  const missingPrices = products.length * MONTHS.length - rows.length;
  const averageMonthlyChange = useMemo(() => {
    if (latestMonth < 2) return null;
    const changes = products.flatMap((product) => {
      const current = product.prices.get(latestMonth);
      const previous = product.prices.get(latestMonth - 1);
      if (!current || !previous) return [];
      const previousPrice = getPrice(previous, unit);
      if (!previousPrice) return [];
      return [
        ((getPrice(current, unit) - previousPrice) / previousPrice) * 100,
      ];
    });
    if (!changes.length) return null;
    return changes.reduce((total, change) => total + change, 0) / changes.length;
  }, [latestMonth, products, unit]);
  const trendPoints = useMemo(() => {
    if (!selectedProduct) return [];
    return MONTHS.flatMap((month) => {
      const price = selectedProduct.prices.get(month);
      return price ? [{ month, value: getPrice(price, unit) }] : [];
    });
  }, [selectedProduct, unit]);
  const productSnapshots = useMemo(
    () =>
      products.map((product) => {
        const available = [...product.prices.values()].sort(
          (left, right) => right.monthNumber - left.monthNumber,
        );
        const latest = available[0];
        const previous = available[1];
        const latestValue = latest ? getPrice(latest, unit) : null;
        const previousValue = previous ? getPrice(previous, unit) : null;
        const change =
          latestValue !== null && previousValue
            ? ((latestValue - previousValue) / previousValue) * 100
            : null;
        return { product, latest, latestValue, change };
      }),
    [products, unit],
  );

  useEffect(() => {
    if (
      products.length &&
      !products.some((product) => product.id === selectedProductId)
    ) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

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
      <ReportYearFilter
        className="meat-price-filter"
        label={t("reports.year")}
        year={year}
        years={years}
        onYearChange={setYear}
      >
        <div
          className="meat-price-unit-toggle"
          aria-label={t("reports.priceUnit")}
          role="group"
        >
          <button
            className={unit === "kg" ? "active" : undefined}
            type="button"
            onClick={() => setUnit("kg")}
          >
            {t("reports.perKg")}
          </button>
          <button
            className={unit === "package" ? "active" : undefined}
            type="button"
            onClick={() => setUnit("package")}
          >
            {t("reports.perPackage")}
          </button>
        </div>
      </ReportYearFilter>
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
      ) : !products.length ? (
        <section className="panel">
          <div className="report-state">{t("reports.meatPriceEmpty")}</div>
        </section>
      ) : (
        <>
          <ReportSummaryCards
            ariaLabel={t("reports.summary")}
            className="meat-price-summary"
            cards={[
              {
                label: t("reports.latestMonth"),
                value: t("reports.month", { month: latestMonth }),
                caption: year,
              },
              {
                label: t("reports.pricedProducts"),
                value: `${latestPricedProducts} / ${products.length}`,
                caption: t("reports.latestMonthCoverage"),
              },
              {
                label: t("reports.averageMonthlyChange"),
                value:
                  averageMonthlyChange === null
                    ? "—"
                    : `${averageMonthlyChange > 0 ? "↑ " : averageMonthlyChange < 0 ? "↓ " : ""}${Math.abs(averageMonthlyChange).toFixed(1)}%`,
                valueClassName:
                  averageMonthlyChange === null
                    ? undefined
                    : averageMonthlyChange > 0
                      ? "price-up"
                      : averageMonthlyChange < 0
                        ? "price-down"
                        : undefined,
                caption: t("reports.comparedWithPreviousMonth"),
              },
              {
                label: t("reports.missingPrices"),
                value: missingPrices,
                caption: t("reports.outOfYearCells", {
                  total: products.length * 12,
                }),
              },
            ]}
          />
          <section className="meat-price-analysis-grid">
            <ReportItemSelector
              eyebrow={t("reports.products")}
              title={t("reports.selectProduct")}
              items={productSnapshots.map(
                ({ product, latest, latestValue, change }) => ({
                  id: product.id,
                  name: product.name,
                  updateLabel: latest
                    ? t("reports.dataUpdatedThrough", {
                        month: latest.monthNumber,
                      })
                    : "—",
                  value:
                    latestValue === null
                      ? "—"
                      : currency.format(latestValue),
                  status:
                    change === null
                      ? undefined
                      : `${change > 0 ? "↑" : change < 0 ? "↓" : "—"} ${Math.abs(change).toFixed(1)}%`,
                  statusClassName:
                    change === null
                      ? undefined
                      : change > 0
                        ? "price-up"
                        : change < 0
                          ? "price-down"
                          : undefined,
                }),
              )}
              selectedId={selectedProduct?.id}
              onSelect={setSelectedProductId}
            />
            <MonthlyTrendChart
              eyebrow={t("reports.priceTrend")}
              title={selectedProduct?.name}
              badge={
                unit === "kg"
                  ? t("reports.perKg")
                  : `${t("reports.perPackage")} · ${selectedProduct?.unit ?? t("reports.package")}`
              }
              ariaLabel={t("reports.productPriceTrend", {
                product: selectedProduct?.name,
              })}
              points={trendPoints}
              formatValue={currency.format}
            />
          </section>
          <details className="panel meat-price-detail" open>
            <summary>
              <div>
                <h2>
                  {mode === "shop"
                    ? t("reports.tabs.averageSupplyPrice")
                    : t("reports.tabs.productionCostPrice")}
                </h2>
                <p>{t("reports.compactMatrixDescription")}</p>
              </div>
              <span>{t("reports.expandMonthlyMatrix")}</span>
            </summary>
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
                  <tr
                    className={
                      selectedProduct?.id === product.id ? "selected" : undefined
                    }
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                  >
                    <th scope="row">
                      <button type="button">{product.name}</button>
                    </th>
                    {MONTHS.map((month) => {
                      const price = product.prices.get(month);
                      const previous = product.prices.get(month - 1);
                      const value = price ? getPrice(price, unit) : null;
                      const previousValue = previous
                        ? getPrice(previous, unit)
                        : null;
                      const change =
                        value !== null && previousValue
                          ? ((value - previousValue) / previousValue) * 100
                          : null;
                      return (
                        <td key={month}>
                          {value !== null ? (
                            <>
                              <strong>{currency.format(value)}</strong>
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
                            </>
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
