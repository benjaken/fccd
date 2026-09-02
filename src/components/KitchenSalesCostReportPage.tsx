import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  ReportAiTrigger,
  useReportAiSnapshot,
} from "@/components/report-ai/ReportAiWorkspace";
import {
  buildKitchenSalesCostYearSummary,
  defaultKitchenSalesCostYears,
  fetchKitchenSalesCostReport,
  kitchenSalesCostCategories,
  kitchenSalesCostYears,
  KITCHEN_SALES_CATEGORY,
  type KitchenSalesCostReport,
  type KitchenSalesCostYearSummary,
} from "@/lib/kitchen-sales-cost-report";

const months = Array.from({ length: 12 }, (_, index) => index + 1);

const currency = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return currency.format(value).replace("HK$", "$");
}

function formatPercent(value: number, base: number) {
  if (base <= 0) return "0%";
  return `${Math.round((value / base) * 100)}%`;
}

function ComparisonValues({
  summaries,
  value,
  base,
  showRatio = true,
  kind = "cost",
}: {
  summaries: KitchenSalesCostYearSummary[];
  value: (summary: KitchenSalesCostYearSummary) => number;
  base: (summary: KitchenSalesCostYearSummary) => number;
  showRatio?: boolean;
  kind?: "sales" | "cost" | "net";
}) {
  return (
    <div className={`kitchen-sales-cost-comparison-values kitchen-sales-cost-comparison-values-${kind}`}>
      {summaries.map((summary, index) => {
        const amount = value(summary);
        return (
          <span
            className={`kitchen-sales-cost-comparison-value${showRatio ? " kitchen-sales-cost-comparison-value-with-ratio" : ""}`}
            data-report-year={summary.year}
            aria-label={`${summary.year} ${formatMoney(amount)}${showRatio ? ` ${formatPercent(amount, base(summary))}` : ""}`}
            style={
              {
                "--year-tone-color": index % 2 === 0 ? "#dc8a19" : "#111827",
              } as CSSProperties
            }
            key={summary.year}
          >
            <b className="sr-only">{summary.year}</b>
            <strong>{formatMoney(amount)}</strong>
            {showRatio ? <small>{formatPercent(amount, base(summary))}</small> : null}
          </span>
        );
      })}
    </div>
  );
}

function CombinedReportTable({
  summaries,
  categories,
}: {
  summaries: KitchenSalesCostYearSummary[];
  categories: string[];
}) {
  return (
    <section className="kitchen-sales-cost-combined panel" aria-label="多年份銷售及成本比較">
      <div className="kitchen-sales-cost-table-toolbar">
        <div className="kitchen-sales-cost-table-toolbar-copy">
          <strong>月份與類型比較</strong>
          <span>每格上排為較早年份，下排為較晚年份</span>
        </div>
        <div className="kitchen-sales-cost-year-legend" aria-label="年份與佔比說明">
          {summaries.map((summary, index) => (
            <span key={summary.year}>
              <i
                className={`kitchen-sales-cost-year-legend-dot kitchen-sales-cost-year-legend-dot-${index % 2 === 0 ? "early" : "late"}`}
                aria-hidden="true"
              />
              {summary.year}
            </span>
          ))}
          <span className="kitchen-sales-cost-ratio-legend">
            <i aria-hidden="true">%</i>
            紅色為佔比
          </span>
        </div>
      </div>
      <div className="kitchen-sales-cost-table-scroll">
        <table className="kitchen-sales-cost-table kitchen-sales-cost-comparison-table">
          <caption className="sr-only">各月份銷售、成本及佔比</caption>
          <thead>
            <tr>
              <th className="kitchen-sales-cost-type-heading" scope="col">類型</th>
              {months.map((month) => (
                <th scope="col" key={month}>{month}月</th>
              ))}
              <th scope="col">加總</th>
            </tr>
          </thead>
          <tbody>
            <tr className="kitchen-sales-cost-data-row kitchen-sales-cost-sales-row">
              <th className="kitchen-sales-cost-type-column" scope="row">{KITCHEN_SALES_CATEGORY}</th>
              {months.map((month, monthIndex) => (
                <td data-report-month={month} key={month}>
                  <ComparisonValues
                    summaries={summaries}
                    value={(summary) => summary.sales[monthIndex]}
                    base={(summary) => summary.sales[monthIndex]}
                    showRatio={false}
                    kind="sales"
                  />
                </td>
              ))}
              <td>
                <ComparisonValues
                  summaries={summaries}
                  value={(summary) => summary.totalSales}
                  base={(summary) => summary.totalSales}
                  showRatio={false}
                  kind="sales"
                />
              </td>
            </tr>
            {categories.map((category) => (
              <tr className="kitchen-sales-cost-data-row" key={category}>
                <th className="kitchen-sales-cost-type-column" scope="row">{category}</th>
                {months.map((month, monthIndex) => (
                  <td data-report-month={month} key={month}>
                    <ComparisonValues
                      summaries={summaries}
                      value={(summary) => summary.costs[category][monthIndex]}
                      base={(summary) => summary.sales[monthIndex]}
                    />
                  </td>
                ))}
                <td>
                  <ComparisonValues
                    summaries={summaries}
                    value={(summary) => summary.costs[category].reduce((total, amount) => total + amount, 0)}
                    base={(summary) => summary.totalSales}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="kitchen-sales-cost-data-row kitchen-sales-cost-net-row">
              <th className="kitchen-sales-cost-type-column" scope="row">銷售淨額</th>
              {months.map((month, monthIndex) => (
                <td className="kitchen-sales-cost-net-column" data-report-month={month} key={month}>
                  <ComparisonValues
                    summaries={summaries}
                    value={(summary) => summary.net[monthIndex]}
                    base={(summary) => summary.sales[monthIndex]}
                    kind="net"
                  />
                </td>
              ))}
              <td className="kitchen-sales-cost-net-column">
                <ComparisonValues
                  summaries={summaries}
                  value={(summary) => summary.totalNet}
                  base={(summary) => summary.totalSales}
                  kind="net"
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function YearSelector({
  years,
  selectedYears,
  onChange,
}: {
  years: number[];
  selectedYears: number[];
  onChange: (years: number[]) => void;
}) {
  const selected = new Set(selectedYears);

  const toggleYear = (year: number) => {
    const next = selected.has(year)
      ? selectedYears.filter((item) => item !== year)
      : [...selectedYears, year];
    onChange(years.filter((item) => next.includes(item)));
  };

  return (
    <section className="kitchen-sales-cost-filter panel" aria-labelledby="kitchen-sales-cost-filter-title">
      <div className="kitchen-sales-cost-filter-copy">
        <span className="kitchen-sales-cost-filter-icon"><CalendarDays /></span>
        <div>
          <h2 id="kitchen-sales-cost-filter-title">選擇報表年份</h2>
          <p>可同時比較多個年份，選項來自目前資料中的年份。</p>
        </div>
      </div>
      <fieldset className="kitchen-sales-cost-years">
        <legend className="sr-only">報表年份</legend>
        {years.map((year) => (
          <label className={`kitchen-sales-cost-year-option${selected.has(year) ? " selected" : ""}`} key={year}>
            <input
              type="checkbox"
              checked={selected.has(year)}
              aria-label={`${year}年`}
              onChange={() => toggleYear(year)}
            />
            <span>{year}</span>
            <small>年</small>
          </label>
        ))}
      </fieldset>
      <div className="kitchen-sales-cost-filter-actions">
        <span>{selectedYears.length ? `已選 ${selectedYears.length} 年` : "尚未選擇年份"}</span>
        <button type="button" onClick={() => onChange(years)}>全選</button>
        <button type="button" onClick={() => onChange([])}>清除</button>
      </div>
    </section>
  );
}

export function KitchenSalesCostReportPage() {
  const [report, setReport] = useState<KitchenSalesCostReport | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenSalesCostReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "暫時無法載入銷售及成本報表");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const years = useMemo(() => kitchenSalesCostYears(report?.rows ?? []), [report]);
  const categories = useMemo(() => kitchenSalesCostCategories(report?.rows ?? []), [report]);

  useEffect(() => {
    if (!report) return;
    setSelectedYears((current) => {
      const valid = current.filter((year) => years.includes(year));
      return valid.length > 0 || current.length === 0
        ? valid.length > 0 ? valid : defaultKitchenSalesCostYears(years)
        : defaultKitchenSalesCostYears(years);
    });
  }, [report, years]);

  const summaries = useMemo(
    () => selectedYears
      .map((year) =>
        buildKitchenSalesCostYearSummary(report?.rows ?? [], year, categories))
      .sort((left, right) => left.year - right.year),
    [categories, report, selectedYears],
  );
  const aiSnapshot = useMemo(
    () =>
      report && !loading
        ? {
            filters: { selectedYears },
            currentAggregates: report.rows
              .filter((row) => selectedYears.includes(row.year))
              .map((row) => ({ ...row })),
            completeness: {
              status: "partial" as const,
              notes: [
                "沒有原始列的月份會在頁面匯總中補為 0；解讀只可把原始列視為已有資料。",
                "銷售按送貨日期、成本按成本月份或節日開始日期歸類。",
              ],
            },
          }
        : null,
    [loading, report, selectedYears],
  );
  useReportAiSnapshot(aiSnapshot);

  return (
    <div className="kitchen-sales-cost-report-page">
      <header className="page-heading kitchen-sales-cost-page-heading">
        <div>
          <span className="eyebrow">中央廚房報表</span>
          <h1>所有銷售及成本</h1>
        </div>
      </header>
      <div className="report-ai-nav-row report-ai-actions-left">
        <ReportAiTrigger />
      </div>

      {loading && !report ? <PageSkeleton label="正在載入銷售及成本報表" variant="report" /> : null}
      {error ? (
        <section className="panel kitchen-sales-cost-error" role="alert">
          <div>
            <strong>載入報表失敗</strong>
            <span>{error}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw /> 重試
          </Button>
        </section>
      ) : null}
      {!loading && !error && !years.length ? (
        <section className="panel kitchen-sales-cost-empty">
          <strong>目前沒有可用的銷售或成本資料</strong>
          <span>資料建立後，年份選項會自動出現在這裡。</span>
        </section>
      ) : null}
      {report && years.length ? (
        <div className="kitchen-sales-cost-report-content">
          <div className="kitchen-sales-cost-workspace">
            <aside className="kitchen-sales-cost-sidebar" aria-label="報表篩選">
              <YearSelector
                years={years}
                selectedYears={selectedYears}
                onChange={setSelectedYears}
              />
            </aside>
            <main className="kitchen-sales-cost-main">
              {selectedYears.length ? (
                <CombinedReportTable summaries={summaries} categories={categories} />
              ) : (
                <section className="panel kitchen-sales-cost-empty">
                  <strong>請選擇至少一個年份</strong>
                  <span>勾選上方年份後，即可查看銷售與成本明細。</span>
                </section>
                )}
            </main>
          </div>
        </div>
      ) : null}
      {loading && report ? <span className="kitchen-sales-cost-refreshing">正在更新資料…</span> : null}
    </div>
  );
}
