import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { CalendarDays, Maximize2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildKitchenChannelSalesYearSummary,
  defaultKitchenChannelSalesYears,
  fetchKitchenChannelSalesReport,
  kitchenChannelSalesChannels,
  kitchenChannelSalesYears,
  type KitchenChannelSalesReport,
  type KitchenChannelSalesYearSummary,
} from "@/lib/kitchen-channel-sales-report";

const months = Array.from({ length: 12 }, (_, index) => index + 1);

const currency = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return currency.format(value).replace("HK$", "$");
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return formatMoney(value);
}

function sumSummaries(summaries: KitchenChannelSalesYearSummary[]) {
  return summaries.reduce((total, summary) => total + summary.totalSales, 0);
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
    <section
      className="kitchen-sales-cost-filter panel"
      aria-labelledby="kitchen-channel-sales-filter-title"
    >
      <div className="kitchen-sales-cost-filter-copy">
        <span className="kitchen-sales-cost-filter-icon">
          <CalendarDays />
        </span>
        <div>
          <h2 id="kitchen-channel-sales-filter-title">選擇報表年份</h2>
          <p>可選擇一個或多個年份，於同一張表格比較各銷售頻道。</p>
        </div>
      </div>
      <fieldset className="kitchen-sales-cost-years">
        <legend className="sr-only">報表年份</legend>
        {years.map((year) => (
          <label
            className={`kitchen-sales-cost-year-option${selected.has(year) ? " selected" : ""}`}
            key={year}
          >
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
        <span>
          {selectedYears.length ? `已選 ${selectedYears.length} 年` : "尚未選擇年份"}
        </span>
        <button type="button" onClick={() => onChange(years)}>
          全選
        </button>
        <button type="button" onClick={() => onChange([])}>
          清除
        </button>
      </div>
    </section>
  );
}

function YearValues({
  summaries,
  value,
}: {
  summaries: KitchenChannelSalesYearSummary[];
  value: (summary: KitchenChannelSalesYearSummary) => number;
}) {
  return (
    <div className="kitchen-channel-sales-cell-values">
      {summaries.map((summary) => (
        <span key={summary.year}>
          <b>{summary.year}</b>
          <strong>{formatMoney(value(summary))}</strong>
        </span>
      ))}
    </div>
  );
}

function ReportTable({
  channels,
  summaries,
}: {
  channels: string[];
  summaries: KitchenChannelSalesYearSummary[];
}) {
  return (
    <section className="kitchen-channel-sales-table-card panel">
      <div className="kitchen-channel-sales-table-scroll">
        <table className="kitchen-channel-sales-table">
          <thead>
            <tr>
              <th scope="col">月份</th>
              {channels.map((channel) => (
                <th scope="col" key={channel}>
                  {channel}
                </th>
              ))}
              <th scope="col">年度月份總數</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month, monthIndex) => (
              <tr key={month}>
                <th scope="row">{month}月</th>
                {channels.map((channel) => (
                  <td key={channel}>
                    <YearValues
                      summaries={summaries}
                      value={(summary) => summary.sales[channel][monthIndex]}
                    />
                  </td>
                ))}
                <td className="kitchen-channel-sales-total-column">
                  <YearValues
                    summaries={summaries}
                    value={(summary) => summary.monthlyTotals[monthIndex]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">總數</th>
              {channels.map((channel) => (
                <td key={channel}>
                  <YearValues
                    summaries={summaries}
                    value={(summary) => summary.channelTotals[channel]}
                  />
                </td>
              ))}
              <td className="kitchen-channel-sales-total-column">
                <YearValues summaries={summaries} value={(summary) => summary.totalSales} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

type ChannelChartSelection = {
  title: string;
  amount: number;
  detail: string;
};

function MonthlyTrendChart({
  summaries,
  onExpand,
  expanded = false,
}: {
  summaries: KitchenChannelSalesYearSummary[];
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const [selectedPoint, setSelectedPoint] = useState<ChannelChartSelection | null>(null);
  const chartWidth = 356;
  const chartHeight = 206;
  const plotLeft = 42;
  const plotTop = 18;
  const plotRight = 10;
  const plotBottom = 174;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const values = summaries.flatMap((summary) => summary.monthlyTotals);
  const maxValue = Math.max(1, ...values);
  const valueToY = (value: number) =>
    plotTop + ((maxValue - value) / maxValue) * plotHeight;
  const slotWidth = plotWidth / months.length;
  const colors = ["#e95b61", "#4267b2", "#ed9c31", "#6c5ce7"];
  const interactive = Boolean(onExpand);
  const selectPoint = (summary: KitchenChannelSalesYearSummary, month: number) => {
    const amount = summary.monthlyTotals[month - 1];
    setSelectedPoint({
      title: `${summary.year}年 ${month}月`,
      amount,
      detail: `當月所有頻道銷售總額 · ${formatMoney(amount)}`,
    });
  };
  const handlePointKeyDown = (
    event: KeyboardEvent<SVGCircleElement>,
    summary: KitchenChannelSalesYearSummary,
    month: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPoint(summary, month);
    }
  };

  return (
    <figure className={`kitchen-channel-sales-chart${expanded ? " is-expanded" : ""}`}>
      <figcaption>
        <div>
          <span className="kitchen-sales-cost-chart-eyebrow">銷售趨勢</span>
          <strong>每月頻道銷售總額</strong>
        </div>
        {interactive ? (
          <button
            type="button"
            className="kitchen-sales-cost-chart-expand"
            aria-label="每月頻道銷售總額，點擊放大"
            onClick={onExpand}
          >
            <Maximize2 aria-hidden="true" />
            放大
          </button>
        ) : (
          <span className="kitchen-sales-cost-chart-caption">放大檢視</span>
        )}
      </figcaption>
      <div className="kitchen-sales-cost-chart-legend" aria-hidden="true">
        {summaries.map((summary, index) => (
          <span key={summary.year}>
            <i style={{ background: colors[index % colors.length] }} />
            {summary.year}
          </span>
        ))}
      </div>
      <svg
        className="kitchen-sales-cost-chart-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="每月頻道銷售總額趨勢圖"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = plotTop + plotHeight * ratio;
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                className="kitchen-sales-cost-chart-grid"
                x1={plotLeft}
                x2={chartWidth - plotRight}
                y1={y}
                y2={y}
              />
              <text
                className="kitchen-sales-cost-chart-axis-label"
                x={plotLeft - 7}
                y={y + 3}
                textAnchor="end"
              >
                {formatCompactMoney(value)}
              </text>
            </g>
          );
        })}
        {months.map((month, index) => (
          <text
            className="kitchen-sales-cost-chart-month"
            x={plotLeft + slotWidth * (index + 0.5)}
            y={chartHeight - 10}
            textAnchor="middle"
            key={month}
          >
            {month}
          </text>
        ))}
        {summaries.map((summary, summaryIndex) => (
          <g key={summary.year}>
            <polyline
              className="kitchen-channel-sales-chart-line"
              stroke={colors[summaryIndex % colors.length]}
              points={summary.monthlyTotals
                .map(
                  (value, index) =>
                    `${plotLeft + slotWidth * (index + 0.5)},${valueToY(value)}`,
                )
                .join(" ")}
            />
            {summary.monthlyTotals.map((value, index) => {
              const month = index + 1;
              const title = `${summary.year}年 ${month}月`;
              return (
                <circle
                  className={`kitchen-channel-sales-chart-point${selectedPoint?.title === title ? " is-selected" : ""}`}
                  cx={plotLeft + slotWidth * (index + 0.5)}
                  cy={valueToY(value)}
                  r="3"
                  role="button"
                  tabIndex={0}
                  aria-label={`${title} ${formatMoney(value)}`}
                  onClick={() => selectPoint(summary, month)}
                  onKeyDown={(event) => handlePointKeyDown(event, summary, month)}
                  key={month}
                >
                  <title>{`${title} ${formatMoney(value)}`}</title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
      <div
        className={`kitchen-sales-cost-chart-selection${selectedPoint ? "" : " is-empty"}`}
        aria-live="polite"
      >
        {selectedPoint ? (
          <>
            <div>
              <span>{selectedPoint.title}</span>
              <strong className="sales">{formatMoney(selectedPoint.amount)}</strong>
            </div>
            <small>{selectedPoint.detail}</small>
          </>
        ) : (
          <span>點擊圖表上的月份查看具體數據</span>
        )}
      </div>
      <div className="kitchen-sales-cost-chart-footer">
        <span>資料單位：HKD</span>
        <strong>{formatMoney(sumSummaries(summaries))}</strong>
      </div>
    </figure>
  );
}

function ChannelMixChart({
  channels,
  summaries,
  onExpand,
  expanded = false,
}: {
  channels: string[];
  summaries: KitchenChannelSalesYearSummary[];
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelChartSelection | null>(null);
  const chartWidth = 356;
  const rowHeight = 24;
  const chartHeight = Math.max(116, channels.length * rowHeight + 20);
  const barX = 116;
  const valueX = chartWidth - 4;
  const barWidth = chartWidth - barX - 60;
  const totals = channels.map((channel) => ({
    channel,
    amount: summaries.reduce(
      (total, summary) => total + summary.channelTotals[channel],
      0,
    ),
  }));
  const maxAmount = Math.max(1, ...totals.map((item) => item.amount));
  const grandTotal = totals.reduce((total, item) => total + item.amount, 0);
  const interactive = Boolean(onExpand);
  const selectChannel = (channel: string, amount: number) => {
    setSelectedChannel({
      title: channel,
      amount,
      detail: `選取年份合計 · ${formatMoney(amount)}`,
    });
  };
  const handleChannelKeyDown = (
    event: KeyboardEvent<SVGRectElement>,
    channel: string,
    amount: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectChannel(channel, amount);
    }
  };

  return (
    <figure
      className={`kitchen-channel-sales-chart kitchen-channel-sales-mix-chart${expanded ? " is-expanded" : ""}`}
    >
      <figcaption>
        <div>
          <span className="kitchen-sales-cost-chart-eyebrow">頻道分布</span>
          <strong>各頻道年度銷售</strong>
        </div>
        {interactive ? (
          <button
            type="button"
            className="kitchen-sales-cost-chart-expand"
            aria-label="各頻道年度銷售，點擊放大"
            onClick={onExpand}
          >
            <Maximize2 aria-hidden="true" />
            放大
          </button>
        ) : (
          <span className="kitchen-sales-cost-chart-caption">放大檢視</span>
        )}
      </figcaption>
      <svg
        className="kitchen-sales-cost-chart-svg kitchen-sales-cost-composition-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="各頻道年度銷售分布圖"
      >
        {totals.map(({ channel, amount }, index) => {
          const y = 7 + index * rowHeight;
          const width = (amount / maxAmount) * barWidth;
          return (
            <g key={channel}>
              <text
                className="kitchen-sales-cost-composition-label"
                x={0}
                y={y + 10}
              >
                {channel}
              </text>
              <rect
                className="kitchen-sales-cost-composition-track"
                x={barX}
                y={y}
                width={barWidth}
                height="12"
                rx="6"
              />
              <rect
                className={`kitchen-channel-sales-mix-bar${selectedChannel?.title === channel ? " is-selected" : ""}`}
                x={barX}
                y={y}
                width={width}
                height="12"
                rx="6"
                role="button"
                tabIndex={0}
                aria-label={`${channel} ${formatMoney(amount)}`}
                onClick={() => selectChannel(channel, amount)}
                onKeyDown={(event) => handleChannelKeyDown(event, channel, amount)}
              />
              <title>{`${channel} ${formatMoney(amount)}`}</title>
              <text
                className="kitchen-sales-cost-composition-value"
                x={valueX}
                y={y + 10}
                textAnchor="end"
              >
                {formatCompactMoney(amount)}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        className={`kitchen-sales-cost-chart-selection${selectedChannel ? "" : " is-empty"}`}
        aria-live="polite"
      >
        {selectedChannel ? (
          <>
            <div>
              <span>{selectedChannel.title}</span>
              <strong className="cost">{formatMoney(selectedChannel.amount)}</strong>
            </div>
            <small>{selectedChannel.detail}</small>
          </>
        ) : (
          <span>點擊圖表上的頻道查看具體數據</span>
        )}
      </div>
      <div className="kitchen-sales-cost-chart-footer">
        <span>共 {channels.length} 個頻道</span>
        <strong>{formatMoney(grandTotal)}</strong>
      </div>
    </figure>
  );
}

function ReportTabs() {
  return (
    <nav className="report-tabs kitchen-sales-cost-tabs" aria-label="中央廚房報表分類">
      <Link to="/reports/kitchen">所有銷售及成本</Link>
      <Link className="active" to="/reports/kitchen/channel-sales">
        頻道銷售
      </Link>
      <Link to="/reports/kitchen/product-sales">產品銷售</Link>
      <button disabled type="button">訂單項別報表</button>
      <Link to="/reports/kitchen/advertising-performance">廣告表現</Link>
    </nav>
  );
}

export function KitchenChannelSalesReportPage() {
  const [report, setReport] = useState<KitchenChannelSalesReport | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedChart, setExpandedChart] = useState<"trend" | "mix" | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenChannelSalesReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "暫時無法載入頻道銷售報表",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const years = useMemo(
    () => kitchenChannelSalesYears(report?.rows ?? []),
    [report],
  );
  const channels = useMemo(
    () => kitchenChannelSalesChannels(report?.rows ?? []),
    [report],
  );

  useEffect(() => {
    if (!report) return;
    setSelectedYears((current) => {
      const valid = current.filter((year) => years.includes(year));
      return valid.length > 0 || current.length === 0
        ? valid.length > 0
          ? valid
          : defaultKitchenChannelSalesYears(years)
        : defaultKitchenChannelSalesYears(years);
    });
  }, [report, years]);

  const summaries = useMemo(
    () =>
      selectedYears.map((year) =>
        buildKitchenChannelSalesYearSummary(report?.rows ?? [], year, channels),
      ),
    [channels, report, selectedYears],
  );

  return (
    <div className="kitchen-sales-cost-report-page kitchen-channel-sales-report-page">
      <header className="page-heading kitchen-sales-cost-page-heading">
        <div>
          <span className="eyebrow">中央廚房報表</span>
          <h1>頻道銷售</h1>
        </div>
      </header>
      <ReportTabs />

      {loading && !report ? (
        <PageSkeleton label="正在載入頻道銷售報表" variant="report" />
      ) : null}
      {error ? (
        <section className="panel kitchen-sales-cost-error" role="alert">
          <div>
            <strong>載入報表失敗</strong>
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw /> 重試
          </Button>
        </section>
      ) : null}
      {!loading && !error && !years.length ? (
        <section className="panel kitchen-sales-cost-empty">
          <strong>目前沒有可用的頻道銷售資料</strong>
          <span>訂單建立後，年份選項會自動出現在這裡。</span>
        </section>
      ) : null}
      {report && years.length ? (
        <>
          <YearSelector
            years={years}
            selectedYears={selectedYears}
            onChange={setSelectedYears}
          />
          {selectedYears.length ? (
            <div className="kitchen-channel-sales-layout">
              <ReportTable channels={channels} summaries={summaries} />
              <aside
                className="kitchen-channel-sales-charts"
                aria-label="頻道銷售圖表"
              >
                <MonthlyTrendChart
                  summaries={summaries}
                  onExpand={() => setExpandedChart("trend")}
                />
                <ChannelMixChart
                  channels={channels}
                  summaries={summaries}
                  onExpand={() => setExpandedChart("mix")}
                />
              </aside>
            </div>
          ) : (
            <section className="panel kitchen-sales-cost-empty">
              <strong>請選擇至少一個年份</strong>
              <span>勾選上方年份後，即可查看頻道銷售明細。</span>
            </section>
          )}
          <Modal
            open={expandedChart !== null}
            title={expandedChart === "mix" ? "各頻道年度銷售分布" : "每月頻道銷售總額"}
            description="圖表已放大顯示；點擊圖表上的資料點或長條，可查看具體金額。"
            onClose={() => setExpandedChart(null)}
            closeLabel="關閉放大圖表"
            size="lg"
            className="kitchen-sales-cost-chart-modal"
          >
            {expandedChart === "mix" ? (
              <ChannelMixChart channels={channels} summaries={summaries} expanded />
            ) : (
              <MonthlyTrendChart summaries={summaries} expanded />
            )}
          </Modal>
        </>
      ) : null}
      {loading && report ? (
        <span className="kitchen-sales-cost-refreshing">正在更新資料…</span>
      ) : null}
    </div>
  );
}
