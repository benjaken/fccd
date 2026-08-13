import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MonthlyTrendChart } from "@/components/reports/MonthlyTrendChart";
import { ReportItemSelector } from "@/components/reports/ReportItemSelector";
import { ReportSummaryCards } from "@/components/reports/ReportSummaryCards";
import { ReportYearFilter } from "@/components/reports/ReportYearFilter";
import { ReportSkeleton } from "@/components/ui/content-skeletons";
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
        <ReportSkeleton label={t("reports.loading")} analysis />
      ) : !items.length ? (
        <section className="panel">
          <div className="report-state">{t("reports.rawMeatPriceEmpty")}</div>
        </section>
      ) : (
        <>
          <ReportSummaryCards
            ariaLabel={t("reports.rawMeatPriceSummary")}
            cards={[
              {
                label: t("reports.latestMonth"),
                value: t("reports.month", { month: latestMonth }),
                caption: year,
              },
              {
                label: t("reports.rawMeatTypes"),
                value: items.length,
                caption: t("reports.withPurchaseRecords"),
              },
              {
                label: t("reports.purchaseReceipts"),
                value: totalReceipts,
                caption: `${quantity.format(totalQuantity)} ${t("reports.kgPurchased")}`,
              },
              {
                label: t("reports.yearWeightedAverage"),
                value:
                  weightedAverage === null
                    ? "—"
                    : `${currency.format(weightedAverage)}/kg`,
                caption: t("reports.weightedByPurchaseQuantity"),
              },
            ]}
          />
          <section className="meat-price-analysis-grid">
            <ReportItemSelector
              eyebrow={t("reports.rawMeatList")}
              title={t("reports.selectRawMeat")}
              items={itemSnapshots.map(({ item, latest, change }) => ({
                id: item.id,
                name: item.name,
                updateLabel: latest
                  ? t("reports.dataUpdatedThrough", {
                      month: latest.monthNumber,
                    })
                  : "—",
                value: latest
                  ? currency.format(latest.averagePricePerKg)
                  : "—",
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
              }))}
              selectedId={selectedItem?.id}
              onSelect={setSelectedItemId}
            />
            <MonthlyTrendChart
              eyebrow={t("reports.rawMeatPriceTrend")}
              title={selectedItem?.name}
              badge={t("reports.perKg")}
              ariaLabel={t("reports.rawMeatProductPriceTrend", {
                product: selectedItem?.name,
              })}
              points={trendPoints}
              formatValue={currency.format}
            />
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
