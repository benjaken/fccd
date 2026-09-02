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

function ComparisonValues({
  summaries,
  value,
  kind = "cost",
}: {
  summaries: KitchenSalesCostYearSummary[];
  value: (summary: KitchenSalesCostYearSummary) => number;
  kind?: "sales" | "cost" | "net";
}) {
  return (
    <div className={`kitchen-sales-cost-comparison-values kitchen-sales-cost-comparison-values-${kind}`}>
      {summaries.map((summary, index) => {
        const amount = value(summary);
        return (
          <span
            className="kitchen-sales-cost-comparison-value"
            data-report-year={summary.year}
            style={
              {
                "--year-tone-color": index % 2 === 0 ? "#dc8a19" : "#111827",
              } as CSSProperties
            }
            key={summary.year}
          >
            <b>{summary.year}</b>
            <strong>{formatMoney(amount)}</strong>
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
      <div className="kitchen-sales-cost-table-scroll">
        <table className="kitchen-sales-cost-table kitchen-sales-cost-comparison-table">
          <thead>
            <tr>
              <th scope="col">月份</th>
              <th scope="col">{KITCHEN_SALES_CATEGORY}</th>
              {categories.map((category) => (
                <th scope="col" key={category}>{category}</th>
              ))}
              <th scope="col">銷售淨額</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month, monthIndex) => (
              <tr data-report-month={month} key={month}>
                <th scope="row">{month}月</th>
                <td>
                  <ComparisonValues
                    summaries={summaries}
                    value={(summary) => summary.sales[monthIndex]}
                    kind="sales"
                  />
                </td>
                {categories.map((category) => (
                  <td key={category}>
                    <ComparisonValues
                      summaries={summaries}
                      value={(summary) => summary.costs[category][monthIndex]}
                    />
                  </td>
                ))}
                <td className="kitchen-sales-cost-net-column">
                  <ComparisonValues
                    summaries={summaries}
                    value={(summary) => summary.net[monthIndex]}
                    kind="net"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">全年合計</th>
              <td>
                <ComparisonValues summaries={summaries} value={(summary) => summary.totalSales} kind="sales" />
              </td>
              {categories.map((category) => (
                <td key={category}>
                  <ComparisonValues
                    summaries={summaries}
                    value={(summary) => summary.costs[category].reduce((total, amount) => total + amount, 0)}
                  />
                </td>
              ))}
              <td className="kitchen-sales-cost-net-column">
                <ComparisonValues
                  summaries={summaries}
                  value={(summary) => summary.totalNet}
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
          <YearSelector years={years} selectedYears={selectedYears} onChange={setSelectedYears} />
          {selectedYears.length ? (
            <CombinedReportTable summaries={summaries} categories={categories} />
          ) : (
            <section className="panel kitchen-sales-cost-empty">
              <strong>請選擇至少一個年份</strong>
              <span>勾選上方年份後，即可查看銷售與成本明細。</span>
            </section>
          )}
        </div>
      ) : null}
      {loading && report ? <span className="kitchen-sales-cost-refreshing">正在更新資料…</span> : null}
    </div>
  );
}
