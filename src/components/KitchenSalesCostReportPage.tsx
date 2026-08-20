import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Maximize2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
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
  if (base === 0) return "0%";
  return `${Math.round((value / base) * 100)}%`;
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return formatMoney(value);
}

function summarizeSelectedYears(
  summaries: KitchenSalesCostYearSummary[],
) {
  return summaries.reduce(
    (total, summary) => ({
      totalSales: total.totalSales + summary.totalSales,
      totalCosts: total.totalCosts + summary.totalCosts,
      totalNet: total.totalNet + summary.totalNet,
    }),
    { totalSales: 0, totalCosts: 0, totalNet: 0 },
  );
}

function AmountCell({
  amount,
  sales,
  kind = "cost",
}: {
  amount: number;
  sales?: number;
  kind?: "sales" | "cost" | "net";
}) {
  return (
    <div className={`kitchen-sales-cost-amount kitchen-sales-cost-amount-${kind}`}>
      <strong>{formatMoney(amount)}</strong>
      {kind !== "sales" && sales !== undefined ? (
        <span>{formatPercent(amount, sales)}</span>
      ) : null}
    </div>
  );
}

type ChartSelection = {
  title: string;
  amount: number;
  detail: string;
  tone: "sales" | "cost" | "net";
};

function YearChart({
  summary,
  categories,
  onExpand,
  expanded = false,
}: {
  summary: KitchenSalesCostYearSummary;
  categories: string[];
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const [selectedPoint, setSelectedPoint] = useState<ChartSelection | null>(null);
  const chartWidth = 356;
  const chartHeight = 206;
  const plotLeft = 42;
  const plotTop = 16;
  const plotRight = 10;
  const plotBottom = 174;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const monthlyCosts = months.map((_, index) =>
    categories.reduce((total, category) => total + (summary.costs[category]?.[index] ?? 0), 0),
  );
  const values = [...summary.sales, ...monthlyCosts, ...summary.net];
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...summary.net);
  const valueToY = (value: number) =>
    plotTop + ((maxValue - value) / (maxValue - minValue || 1)) * plotHeight;
  const zeroY = valueToY(0);
  const slotWidth = plotWidth / months.length;
  const barWidth = Math.min(7, slotWidth * 0.28);
  const linePoints = summary.net
    .map((value, index) => `${plotLeft + slotWidth * (index + 0.5)},${valueToY(value)}`)
    .join(" ");

  const interactive = Boolean(onExpand);
  return (
    <figure
      className={`kitchen-sales-cost-year-chart${expanded ? " is-expanded" : ""}`}
    >
      <figcaption>
        <div>
          <span className="kitchen-sales-cost-chart-eyebrow">年度走勢</span>
          <strong>{summary.year} 月度比較</strong>
        </div>
        {interactive ? (
          <button
            type="button"
            className="kitchen-sales-cost-chart-expand"
            aria-label={`${summary.year} 年度月度走勢，點擊放大`}
            onClick={(event) => {
              event.stopPropagation();
              onExpand?.();
            }}
          >
            <Maximize2 aria-hidden="true" />
            放大
          </button>
        ) : <span className="kitchen-sales-cost-chart-caption">放大檢視</span>}
      </figcaption>
      <div className="kitchen-sales-cost-chart-legend" aria-hidden="true">
        <span><i className="sales" />銷售</span>
        <span><i className="cost" />成本</span>
        <span><i className="net" />淨額</span>
      </div>
      <svg
        className="kitchen-sales-cost-chart-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label={`${summary.year} 年度銷售、成本及淨額圖表`}
      >
        <line className="kitchen-sales-cost-chart-grid" x1={plotLeft} x2={chartWidth - plotRight} y1={plotTop} y2={plotTop} />
        <line className="kitchen-sales-cost-chart-grid" x1={plotLeft} x2={chartWidth - plotRight} y1={zeroY} y2={zeroY} />
        <text className="kitchen-sales-cost-chart-axis-label" x={plotLeft - 7} y={plotTop + 3} textAnchor="end">
          {formatCompactMoney(maxValue)}
        </text>
        <text className="kitchen-sales-cost-chart-axis-label" x={plotLeft - 7} y={Math.min(plotBottom, zeroY + 3)} textAnchor="end">
          {minValue < 0 ? formatCompactMoney(minValue) : "$0"}
        </text>
        {months.map((month, index) => {
          const center = plotLeft + slotWidth * (index + 0.5);
          const salesY = valueToY(summary.sales[index]);
          const costsY = valueToY(monthlyCosts[index]);
          return (
            <g key={month}>
              <rect
                className={`kitchen-sales-cost-chart-bar sales${selectedPoint?.title === `${month}月銷售` ? " is-selected" : ""}`}
                x={center - barWidth - 1}
                y={salesY}
                width={barWidth}
                height={Math.max(0, zeroY - salesY)}
                rx="2"
                role="button"
                tabIndex={0}
                aria-label={`${month}月銷售 ${formatMoney(summary.sales[index])}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedPoint({
                    title: `${month}月銷售`,
                    amount: summary.sales[index],
                    detail: "銷售額基準",
                    tone: "sales",
                  });
                }}
              >
                <title>{`${month}月銷售 ${formatMoney(summary.sales[index])}`}</title>
              </rect>
              <rect
                className={`kitchen-sales-cost-chart-bar cost${selectedPoint?.title === `${month}月成本` ? " is-selected" : ""}`}
                x={center + 1}
                y={costsY}
                width={barWidth}
                height={Math.max(0, zeroY - costsY)}
                rx="2"
                role="button"
                tabIndex={0}
                aria-label={`${month}月成本 ${formatMoney(monthlyCosts[index])}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedPoint({
                    title: `${month}月成本`,
                    amount: monthlyCosts[index],
                    detail: `佔當月銷售 ${formatPercent(monthlyCosts[index], summary.sales[index])}`,
                    tone: "cost",
                  });
                }}
              >
                <title>{`${month}月成本 ${formatMoney(monthlyCosts[index])}`}</title>
              </rect>
              <text className="kitchen-sales-cost-chart-month" x={center} y={chartHeight - 10} textAnchor="middle">
                {month}
              </text>
            </g>
          );
        })}
        <polyline className="kitchen-sales-cost-chart-line" points={linePoints} />
        {summary.net.map((value, index) => (
          <circle
            className={`kitchen-sales-cost-chart-point${selectedPoint?.title === `${months[index]}月淨額` ? " is-selected" : ""}`}
            cx={plotLeft + slotWidth * (index + 0.5)}
            cy={valueToY(value)}
            r="2.6"
            key={`net-${months[index]}`}
            role="button"
            tabIndex={0}
            aria-label={`${months[index]}月淨額 ${formatMoney(value)}`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedPoint({
                title: `${months[index]}月淨額`,
                amount: value,
                detail: `佔當月銷售 ${formatPercent(value, summary.sales[index])}`,
                tone: "net",
              });
            }}
          >
            <title>{`${months[index]}月淨額 ${formatMoney(value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className={`kitchen-sales-cost-chart-selection${selectedPoint ? "" : " is-empty"}`} aria-live="polite">
        {selectedPoint ? (
          <>
            <div>
              <span>{selectedPoint.title}</span>
              <strong className={selectedPoint.tone}>{formatMoney(selectedPoint.amount)}</strong>
            </div>
            <small>{selectedPoint.detail}</small>
          </>
        ) : <span>點擊柱子查看具體數據</span>}
      </div>
      <div className="kitchen-sales-cost-chart-footer">
        <span>成本率 {formatPercent(summary.totalCosts, summary.totalSales)}</span>
        <strong>淨額 {formatMoney(summary.totalNet)}</strong>
      </div>
    </figure>
  );
}

function CostCompositionChart({
  summary,
  categories,
  onExpand,
  expanded = false,
}: {
  summary: KitchenSalesCostYearSummary;
  categories: string[];
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState<ChartSelection | null>(null);
  const chartWidth = 356;
  const rowHeight = 23;
  const chartHeight = Math.max(106, categories.length * rowHeight + 20);
  const labelX = 0;
  const barX = 96;
  const valueX = chartWidth - 4;
  const barWidth = chartWidth - barX - 58;
  const totals = categories.map((category) => ({
    category,
    amount: summary.costs[category]?.reduce((total, value) => total + value, 0) ?? 0,
  }));
  const maxAmount = Math.max(1, ...totals.map((item) => item.amount));
  const topCategory = totals.reduce(
    (current, item) => (item.amount > current.amount ? item : current),
    totals[0] ?? { category: "—", amount: 0 },
  );
  const interactive = Boolean(onExpand);
  return (
    <figure
      className={`kitchen-sales-cost-year-chart kitchen-sales-cost-composition-chart${expanded ? " is-expanded" : ""}`}
    >
      <figcaption>
        <div>
          <span className="kitchen-sales-cost-chart-eyebrow">成本組成</span>
          <strong>{summary.year} 年度成本分布</strong>
        </div>
        {interactive ? (
          <button
            type="button"
            className="kitchen-sales-cost-chart-expand"
            aria-label={`${summary.year} 年度成本組成，點擊放大`}
            onClick={(event) => {
              event.stopPropagation();
              onExpand?.();
            }}
          >
            <Maximize2 aria-hidden="true" />
            放大
          </button>
        ) : <span className="kitchen-sales-cost-chart-caption">放大檢視</span>}
      </figcaption>
      <svg
        className="kitchen-sales-cost-chart-svg kitchen-sales-cost-composition-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label={`${summary.year} 年度各項成本組成圖表`}
      >
        {totals.map(({ category, amount }, index) => {
          const y = 7 + index * rowHeight;
          const width = (amount / maxAmount) * barWidth;
          return (
            <g key={category}>
              <text className="kitchen-sales-cost-composition-label" x={labelX} y={y + 10}>
                {category}
              </text>
              <rect className="kitchen-sales-cost-composition-track" x={barX} y={y} width={barWidth} height="12" rx="6" />
              <rect
                className={`kitchen-sales-cost-composition-bar${selectedCategory?.title === category ? " is-selected" : ""}`}
                x={barX}
                y={y}
                width={width}
                height="12"
                rx="6"
                role="button"
                tabIndex={0}
                aria-label={`${category} ${formatMoney(amount)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedCategory({
                    title: category,
                    amount,
                    detail: `佔全年成本 ${formatPercent(amount, summary.totalCosts)}`,
                    tone: "cost",
                  });
                }}
              />
              <text className="kitchen-sales-cost-composition-value" x={valueX} y={y + 10} textAnchor="end">
                {formatCompactMoney(amount)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={`kitchen-sales-cost-chart-selection${selectedCategory ? "" : " is-empty"}`} aria-live="polite">
        {selectedCategory ? (
          <>
            <div>
              <span>{selectedCategory.title}</span>
              <strong className="cost">{formatMoney(selectedCategory.amount)}</strong>
            </div>
            <small>{selectedCategory.detail}</small>
          </>
        ) : <span>點擊成本柱子查看具體數據</span>}
      </div>
      <div className="kitchen-sales-cost-chart-footer">
        <span>最高成本 {topCategory.category}</span>
        <strong>{formatMoney(summary.totalCosts)}</strong>
      </div>
    </figure>
  );
}

function ReportTable({
  summary,
  categories,
}: {
  summary: KitchenSalesCostYearSummary;
  categories: string[];
}) {
  const [expandedChart, setExpandedChart] = useState<"trend" | "composition" | null>(null);

  return (
    <section className="kitchen-sales-cost-year panel">
      <header className="kitchen-sales-cost-year-heading">
        <div>
          <span className="kitchen-sales-cost-year-badge">{summary.year}</span>
          <div>
            <h2>{summary.year} 年度明細</h2>
            <p>
              淨額 {formatMoney(summary.totalNet)} · 成本率 {formatPercent(summary.totalCosts, summary.totalSales)}
            </p>
          </div>
        </div>
        <strong>{formatCompactMoney(summary.totalSales)} 銷售</strong>
      </header>

      <div className="kitchen-sales-cost-year-body">
        <div className="kitchen-sales-cost-table-scroll">
          <table className="kitchen-sales-cost-table">
          <thead>
            <tr>
              <th scope="col">項目</th>
              {months.map((month) => (
                <th scope="col" key={month}>{month}月</th>
              ))}
              <th scope="col">全年合計</th>
            </tr>
          </thead>
          <tbody>
            <tr className="kitchen-sales-cost-sales-row">
              <th scope="row">
                <span className="kitchen-sales-cost-row-label">
                  <i className="kitchen-sales-cost-dot sales" />
                  {KITCHEN_SALES_CATEGORY}
                </span>
              </th>
              {summary.sales.map((amount, index) => (
                <td key={months[index]}><AmountCell amount={amount} kind="sales" /></td>
              ))}
              <td><AmountCell amount={summary.totalSales} kind="sales" /></td>
            </tr>
            {categories.map((category) => (
              <tr key={category}>
                <th scope="row">
                  <span className="kitchen-sales-cost-row-label">
                    <i className="kitchen-sales-cost-dot cost" />
                    {category}
                  </span>
                </th>
                {summary.costs[category].map((amount, index) => (
                  <td key={months[index]}>
                    <AmountCell amount={amount} sales={summary.sales[index]} />
                  </td>
                ))}
                <td>
                  <AmountCell
                    amount={summary.costs[category].reduce((sum, item) => sum + item, 0)}
                    sales={summary.totalSales}
                  />
                </td>
              </tr>
            ))}
            <tr className="kitchen-sales-cost-net-row">
              <th scope="row">
                <span className="kitchen-sales-cost-row-label">
                  <i className="kitchen-sales-cost-dot net" />
                  {summary.year} 合計
                </span>
              </th>
              {summary.net.map((amount, index) => (
                <td key={months[index]}>
                  <AmountCell amount={amount} sales={summary.sales[index]} kind="net" />
                </td>
              ))}
              <td><AmountCell amount={summary.totalNet} sales={summary.totalSales} kind="net" /></td>
            </tr>
          </tbody>
          </table>
        </div>
        <div className="kitchen-sales-cost-year-charts">
          <YearChart
            summary={summary}
            categories={categories}
            onExpand={() => setExpandedChart("trend")}
          />
          <CostCompositionChart
            summary={summary}
            categories={categories}
            onExpand={() => setExpandedChart("composition")}
          />
        </div>
      </div>
      <Modal
        open={expandedChart !== null}
        title={expandedChart === "composition" ? `${summary.year} 年度成本分布` : `${summary.year} 月度銷售及成本走勢`}
        description="圖表已放大顯示，按 Esc 或右上角按鈕返回報表。"
        onClose={() => setExpandedChart(null)}
        closeLabel="關閉放大圖表"
        size="lg"
        className="kitchen-sales-cost-chart-modal"
      >
        {expandedChart === "composition" ? (
          <CostCompositionChart summary={summary} categories={categories} expanded />
        ) : (
          <YearChart summary={summary} categories={categories} expanded />
        )}
      </Modal>
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

function ReportOverview({ summaries }: { summaries: KitchenSalesCostYearSummary[] }) {
  const totals = summarizeSelectedYears(summaries);
  const costRate = formatPercent(totals.totalCosts, totals.totalSales);
  const positive = totals.totalNet >= 0;

  return (
    <section className="kitchen-sales-cost-overview" aria-label="報表摘要">
      <article className="kitchen-sales-cost-stat sales">
        <div><span>總銷售</span><i><TrendingUp /></i></div>
        <strong>{formatMoney(totals.totalSales)}</strong>
        <small>已選年份合計</small>
      </article>
      <article className="kitchen-sales-cost-stat costs">
        <div><span>總成本</span><i><TrendingDown /></i></div>
        <strong>{formatMoney(totals.totalCosts)}</strong>
        <small>成本率 {costRate}</small>
      </article>
      <article className={`kitchen-sales-cost-stat ${positive ? "net-positive" : "net-negative"}`}>
        <div><span>銷售淨額</span><i>{positive ? <TrendingUp /> : <TrendingDown />}</i></div>
        <strong>{formatMoney(totals.totalNet)}</strong>
        <small>淨利率 {formatPercent(totals.totalNet, totals.totalSales)}</small>
      </article>
      <article className="kitchen-sales-cost-stat years">
        <div><span>比較年份</span><span className="kitchen-sales-cost-stat-count">{summaries.length}</span></div>
        <strong>{summaries.map((summary) => summary.year).join(" · ") || "—"}</strong>
        <small>可從上方自由調整</small>
      </article>
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
    () => selectedYears.map((year) => buildKitchenSalesCostYearSummary(report?.rows ?? [], year, categories)),
    [categories, report, selectedYears],
  );

  return (
    <div className="kitchen-sales-cost-report-page">
      <header className="page-heading kitchen-sales-cost-page-heading">
        <div>
          <span className="eyebrow">中央廚房報表</span>
          <h1>所有銷售及成本</h1>
        </div>
      </header>
      <nav className="report-tabs kitchen-sales-cost-tabs" aria-label="中央廚房報表分類">
        <Link className="active" to="/reports/kitchen">所有銷售及成本</Link>
        <Link to="/reports/kitchen/channel-sales">頻道銷售</Link>
        <Link to="/reports/kitchen/product-sales">產品銷售</Link>
        <button disabled type="button">訂單項別報表</button>
        <Link to="/reports/kitchen/advertising-performance">廣告表現</Link>
      </nav>

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
        <>
          <YearSelector years={years} selectedYears={selectedYears} onChange={setSelectedYears} />
          {selectedYears.length ? <ReportOverview summaries={summaries} /> : null}
          {selectedYears.length ? (
            <div className="kitchen-sales-cost-tables">
              {summaries.map((summary) => (
                <ReportTable key={summary.year} summary={summary} categories={categories} />
              ))}
            </div>
          ) : (
            <section className="panel kitchen-sales-cost-empty">
              <strong>請選擇至少一個年份</strong>
              <span>勾選上方年份後，即可查看銷售與成本明細。</span>
            </section>
          )}
        </>
      ) : null}
      {loading && report ? <span className="kitchen-sales-cost-refreshing">正在更新資料…</span> : null}
    </div>
  );
}
