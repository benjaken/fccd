import { useEffect, useMemo, useState } from "react";
import { Maximize2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  buildKitchenAdvertisingPerformanceYearSummaries,
  defaultKitchenAdvertisingPerformanceYears,
  KITCHEN_ADVERTISING_FESTIVAL_OPTIONS,
  kitchenAdvertisingPerformanceChannels,
  kitchenAdvertisingPerformanceCostTypes,
  kitchenAdvertisingPerformanceFestivals,
  kitchenAdvertisingPerformanceYears,
  fetchKitchenAdvertisingPerformanceReport,
  type KitchenAdvertisingPerformanceMode,
  type KitchenAdvertisingPerformanceReport,
  type KitchenAdvertisingPerformanceYearSummary,
} from "@/lib/kitchen-advertising-performance-report";

const money = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0,
});

const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

function formatMoney(value: number) {
  return money.format(value).replace("HK$", "$");
}

function formatPercent(value: number, base: number) {
  if (base <= 0) return "0%";
  return `${Math.round((value / base) * 100)}%`;
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
    <fieldset className="kitchen-advertising-performance-years">
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
      <div className="kitchen-advertising-performance-year-actions">
        <span>{selectedYears.length ? `已選 ${selectedYears.length} 年` : "尚未選擇年份"}</span>
        <button type="button" onClick={() => onChange(years)}>全選</button>
        <button type="button" onClick={() => onChange([])}>清除</button>
      </div>
    </fieldset>
  );
}

function hasCellData(summary: KitchenAdvertisingPerformanceYearSummary, channel: string) {
  const cell = summary.cells[channel];
  return Boolean(
    cell &&
      (cell.sales !== 0 || Object.values(cell.costs).some((amount) => amount !== 0)),
  );
}

function PerformanceCell({
  summary,
  channel,
  costTypes,
}: {
  summary: KitchenAdvertisingPerformanceYearSummary;
  channel: string;
  costTypes: string[];
}) {
  const cell = summary.cells[channel];
  if (!cell || !hasCellData(summary, channel)) return null;

  return (
    <div className="kitchen-advertising-performance-year-cell">
      <strong className="kitchen-advertising-performance-year">{summary.year}</strong>
      <div className="kitchen-advertising-performance-line">
        <span>Sales</span>
        <b>{formatMoney(cell.sales)}</b>
      </div>
      {costTypes.map((costType) => {
        const amount = cell.costs[costType] ?? 0;
        if (amount === 0) return null;
        return (
          <div className="kitchen-advertising-performance-line cost" key={costType}>
            <span>{costType}</span>
            <b>{formatMoney(amount)}</b>
            <em>{formatPercent(amount, cell.sales)}</em>
          </div>
        );
      })}
    </div>
  );
}

type ChartSelection = {
  year: number;
  kind: "sales" | "advertising";
  amount: number;
  sales: number;
  advertising: number;
  channels: Array<{ channel: string; sales: number; advertising: number }>;
};

function AdvertisingPerformanceChart({
  segmentLabel,
  summaries,
  channels,
  costTypes,
  onExpand,
  expanded = false,
}: {
  segmentLabel: string;
  summaries: KitchenAdvertisingPerformanceYearSummary[];
  channels: string[];
  costTypes: string[];
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  const chartWidth = 360;
  const chartHeight = 224;
  const plotLeft = 48;
  const plotTop = 18;
  const plotRight = 10;
  const plotBottom = 178;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const totals = summaries.map((summary) => {
    const advertising = channels.reduce(
      (total, channel) =>
        total + costTypes.reduce((sum, costType) => sum + (summary.cells[channel]?.costs[costType] ?? 0), 0),
      0,
    );
    return { summary, advertising };
  });
  const maxValue = Math.max(1, ...totals.flatMap(({ summary, advertising }) => [summary.totalSales, advertising]));
  const valueToY = (value: number) => plotTop + ((maxValue - value) / maxValue) * plotHeight;
  const slotWidth = plotWidth / Math.max(1, totals.length);
  const barWidth = Math.min(18, Math.max(7, slotWidth * 0.22));
  const interactive = Boolean(onExpand);

  const selectPoint = (summary: KitchenAdvertisingPerformanceYearSummary, advertising: number, kind: ChartSelection["kind"]) => {
    setSelected({
      year: summary.year,
      kind,
      amount: kind === "sales" ? summary.totalSales : advertising,
      sales: summary.totalSales,
      advertising,
      channels: channels
        .map((channel) => {
          const cell = summary.cells[channel];
          return {
            channel,
            sales: cell?.sales ?? 0,
            advertising: costTypes.reduce((total, costType) => total + (cell?.costs[costType] ?? 0), 0),
          };
        })
        .filter((item) => item.sales !== 0 || item.advertising !== 0),
    });
  };

  const handlePointKeyDown = (
    event: React.KeyboardEvent<SVGRectElement>,
    summary: KitchenAdvertisingPerformanceYearSummary,
    advertising: number,
    kind: ChartSelection["kind"],
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPoint(summary, advertising, kind);
    }
  };

  return (
    <figure className={`kitchen-advertising-performance-chart${expanded ? " is-expanded" : ""}`}>
      <figcaption>
        <div>
          <span className="kitchen-advertising-performance-chart-eyebrow">年度比較</span>
          <strong>{segmentLabel}廣告表現</strong>
        </div>
        {interactive ? (
          <button
            type="button"
            className="kitchen-advertising-performance-chart-expand"
            aria-label={`${segmentLabel}廣告表現圖表，點擊放大`}
            onClick={() => onExpand?.()}
          >
            <Maximize2 aria-hidden="true" />
            放大
          </button>
        ) : <span className="kitchen-advertising-performance-chart-caption">放大檢視</span>}
      </figcaption>
      <div className="kitchen-advertising-performance-chart-legend" aria-hidden="true">
        <span><i className="sales" />銷售</span>
        <span><i className="advertising" />廣告費</span>
      </div>
      <svg
        className="kitchen-advertising-performance-chart-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label={`${segmentLabel}年度銷售及廣告費圖表`}
      >
        {[0, 0.5, 1].map((ratio) => {
          const value = maxValue * ratio;
          const y = valueToY(value);
          return (
            <g key={ratio}>
              <line className="kitchen-advertising-performance-chart-grid" x1={plotLeft} x2={chartWidth - plotRight} y1={y} y2={y} />
              <text className="kitchen-advertising-performance-chart-axis-label" x={plotLeft - 7} y={y + 3} textAnchor="end">
                {value === 0 ? "$0" : formatCompactMoney(value)}
              </text>
            </g>
          );
        })}
        {totals.map(({ summary, advertising }, index) => {
          const center = plotLeft + slotWidth * (index + 0.5);
          const salesY = valueToY(summary.totalSales);
          const advertisingY = valueToY(advertising);
          return (
            <g key={summary.year}>
              <rect
                className={`kitchen-advertising-performance-chart-bar sales tone-${index % 5}${selected?.year === summary.year && selected.kind === "sales" ? " is-selected" : ""}`}
                x={center - barWidth - 1}
                y={salesY}
                width={barWidth}
                height={Math.max(0, plotBottom - salesY)}
                rx="2"
                role="button"
                tabIndex={0}
                aria-label={`${summary.year}年銷售 ${formatMoney(summary.totalSales)}`}
                onClick={() => selectPoint(summary, advertising, "sales")}
                onKeyDown={(event) => handlePointKeyDown(event, summary, advertising, "sales")}
              >
                <title>{`${summary.year}年銷售 ${formatMoney(summary.totalSales)}`}</title>
              </rect>
              <rect
                className={`kitchen-advertising-performance-chart-bar advertising tone-${index % 5}${selected?.year === summary.year && selected.kind === "advertising" ? " is-selected" : ""}`}
                x={center + 1}
                y={advertisingY}
                width={barWidth}
                height={Math.max(0, plotBottom - advertisingY)}
                rx="2"
                role="button"
                tabIndex={0}
                aria-label={`${summary.year}年廣告費 ${formatMoney(advertising)}`}
                onClick={() => selectPoint(summary, advertising, "advertising")}
                onKeyDown={(event) => handlePointKeyDown(event, summary, advertising, "advertising")}
              >
                <title>{`${summary.year}年廣告費 ${formatMoney(advertising)}`}</title>
              </rect>
              <text className="kitchen-advertising-performance-chart-year" x={center} y={chartHeight - 22} textAnchor="middle">
                {summary.year}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={`kitchen-advertising-performance-chart-details${selected ? "" : " is-empty"}`} aria-live="polite">
        {selected ? (
          <>
            <div className="kitchen-advertising-performance-chart-detail-heading">
              <span>{selected.year} {selected.kind === "sales" ? "銷售" : "廣告費"}</span>
              <strong className={selected.kind}>{formatMoney(selected.amount)}</strong>
            </div>
            <small>廣告費率 {formatPercent(selected.advertising, selected.sales)}</small>
            <div className="kitchen-advertising-performance-channel-details">
              {selected.channels.map((item) => (
                <span key={item.channel}>
                  <b>{item.channel}</b>
                  <em>{formatMoney(selected.kind === "sales" ? item.sales : item.advertising)}</em>
                </span>
              ))}
            </div>
          </>
        ) : <span>點擊柱狀圖查看年度及品牌詳情</span>}
      </div>
      <div className="kitchen-advertising-performance-chart-footer">
        <span>已選 {summaries.length} 年</span>
        <strong>{formatMoney(totals.reduce((total, item) => total + item.advertising, 0))}</strong>
      </div>
    </figure>
  );
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return formatMoney(value);
}

function PerformanceSection({
  rows,
  mode,
}: {
  rows: KitchenAdvertisingPerformanceReport["rows"];
  mode: KitchenAdvertisingPerformanceMode;
}) {
  const festivals = useMemo(() => kitchenAdvertisingPerformanceFestivals(rows), [rows]);
  const [festival, setFestival] = useState<string>(KITCHEN_ADVERTISING_FESTIVAL_OPTIONS[0]);
  const [month, setMonth] = useState("1");
  const segmentKey = mode === "festival" ? festival : month;
  const segmentRows = useMemo(
    () => rows.filter((row) => row.mode === mode && row.segmentKey === segmentKey),
    [mode, rows, segmentKey],
  );
  const years = useMemo(
    () => kitchenAdvertisingPerformanceYears(rows, mode, segmentKey),
    [mode, rows, segmentKey],
  );
  const channels = useMemo(
    () => kitchenAdvertisingPerformanceChannels(segmentRows),
    [segmentRows],
  );
  const costTypes = useMemo(
    () => kitchenAdvertisingPerformanceCostTypes(segmentRows, mode, segmentKey),
    [mode, segmentKey, segmentRows],
  );
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [chartExpanded, setChartExpanded] = useState(false);

  useEffect(() => {
    if (mode === "festival" && !festivals.includes(festival)) {
      setFestival(festivals[0] ?? KITCHEN_ADVERTISING_FESTIVAL_OPTIONS[0]);
    }
  }, [festival, festivals, mode]);

  useEffect(() => {
    setSelectedYears(defaultKitchenAdvertisingPerformanceYears(years));
  }, [segmentKey, mode, rows, years]);

  const summaries = useMemo(
    () =>
      buildKitchenAdvertisingPerformanceYearSummaries(
        rows,
        mode,
        segmentKey,
        selectedYears,
        channels,
      ),
    [channels, mode, rows, segmentKey, selectedYears],
  );
  const totalSales = summaries.reduce((total, summary) => total + summary.totalSales, 0);
  const label = mode === "festival" ? festival : `${month}月 non-peak`;
  const title = mode === "festival" ? "節日" : "月份(non-peak)";

  return (
    <section className="kitchen-advertising-performance-section panel">
      <aside className="kitchen-advertising-performance-sidebar">
        <div className="kitchen-advertising-performance-sidebar-heading">
          <strong>{title}</strong>
          <span aria-hidden="true">⌄</span>
        </div>
        <label className="kitchen-advertising-performance-select">
          <span className="sr-only">選擇{title}</span>
          {mode === "festival" ? (
            <select aria-label="節日" value={festival} onChange={(event) => setFestival(event.target.value)}>
              {festivals.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <select aria-label="月份(non-peak)" value={month} onChange={(event) => setMonth(event.target.value)}>
              {monthOptions.map((option) => <option key={option} value={option}>{option}月 non-peak</option>)}
            </select>
          )}
        </label>
        <YearSelector years={years} selectedYears={selectedYears} onChange={setSelectedYears} />
        <div className="kitchen-advertising-performance-annual-summary">
          <h2>年度{mode === "festival" ? "節日" : "非節日"}銷售總數:</h2>
          {summaries.length ? summaries.map((summary) => (
            <div key={summary.year}>
              <strong>{summary.year}</strong>
              <b>{formatMoney(summary.totalSales)}</b>
            </div>
          )) : <p>沒有可用資料</p>}
        </div>
      </aside>

      <div className="kitchen-advertising-performance-table-wrap">
        <table className="kitchen-advertising-performance-table">
          <caption className="sr-only">{label}廣告表現</caption>
          <thead>
            <tr>
              {channels.map((channel) => <th scope="col" key={channel}>{channel}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {channels.map((channel) => (
                <td key={channel}>
                  {summaries.some((summary) => hasCellData(summary, channel)) ? (
                    summaries.map((summary) => (
                      <PerformanceCell
                        key={summary.year}
                        summary={summary}
                        channel={channel}
                        costTypes={costTypes}
                      />
                    ))
                  ) : <span className="kitchen-advertising-performance-empty-cell">—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {!rows.length ? (
          <p className="kitchen-advertising-performance-no-data">目前沒有廣告表現資料。</p>
        ) : null}
      </div>
      <aside className="kitchen-advertising-performance-chart-panel" aria-label={`${label}圖表`}>
        <AdvertisingPerformanceChart
          segmentLabel={label}
          summaries={summaries}
          channels={channels}
          costTypes={costTypes}
          onExpand={() => setChartExpanded(true)}
        />
      </aside>
      <Modal
        open={chartExpanded}
        title={`${label}廣告表現圖表`}
        description="點擊銷售或廣告費柱狀圖，可查看該年度及品牌詳情。"
        onClose={() => setChartExpanded(false)}
        closeLabel="關閉廣告表現放大圖表"
        size="lg"
        className="kitchen-advertising-performance-chart-modal"
      >
        <AdvertisingPerformanceChart
          segmentLabel={label}
          summaries={summaries}
          channels={channels}
          costTypes={costTypes}
          expanded
        />
      </Modal>
    </section>
  );
}

function ReportTabs() {
  return (
    <nav className="report-tabs kitchen-sales-cost-tabs" aria-label="中央廚房報表分類">
      <Link to="/reports/kitchen">所有銷售及成本</Link>
      <Link to="/reports/kitchen/channel-sales">頻道銷售</Link>
      <Link to="/reports/kitchen/product-sales">產品銷售</Link>
      <button disabled type="button">訂單項別報表</button>
      <Link className="active" to="/reports/kitchen/advertising-performance">廣告表現</Link>
    </nav>
  );
}

export function KitchenAdvertisingPerformanceReportPage() {
  const [report, setReport] = useState<KitchenAdvertisingPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenAdvertisingPerformanceReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "廣告表現報表載入失敗");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <div className="kitchen-advertising-performance-page kitchen-sales-cost-report-page">
      <header className="page-heading kitchen-sales-cost-page-heading">
        <div>
          <span className="eyebrow">中央廚房報表</span>
          <h1>廣告表現</h1>
        </div>
      </header>
      <ReportTabs />

      {loading && !report ? <PageSkeleton label="正在載入廣告表現報表" variant="report" /> : null}
      {error ? (
        <section className="panel kitchen-advertising-performance-error" role="alert">
          <div>
            <strong>廣告表現報表載入失敗</strong>
            <span>{error}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw aria-hidden="true" /> 重試
          </Button>
        </section>
      ) : null}

      {report ? (
        <div className="kitchen-advertising-performance-sections">
          <PerformanceSection rows={report.rows} mode="festival" />
          <PerformanceSection rows={report.rows} mode="non_peak" />
        </div>
      ) : null}
      {loading && report ? <span className="kitchen-sales-cost-refreshing">正在更新資料…</span> : null}
    </div>
  );
}
