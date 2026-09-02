import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  ReportAiTrigger,
  useReportAiSnapshot,
} from "@/components/report-ai/ReportAiWorkspace";
import {
  buildKitchenAdvertisingPerformanceYearSummaries,
  defaultKitchenAdvertisingPerformanceYears,
  kitchenAdvertisingPerformanceChannels,
  kitchenAdvertisingPerformanceCostTypes,
  kitchenAdvertisingPerformanceFestivals,
  kitchenAdvertisingPerformanceYears,
  fetchKitchenAdvertisingPerformanceReport,
  type KitchenAdvertisingPerformanceMode,
  type KitchenAdvertisingPerformanceReport,
  type KitchenAdvertisingPerformanceYearSummary,
} from "@/lib/kitchen-advertising-performance-report";
import { DICT_TYPE, useDictItems } from "@/lib/dictionaries";

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
  if (!cell || !hasCellData(summary, channel)) {
    return <span className="kitchen-advertising-performance-empty-cell">—</span>;
  }

  return (
    <div className="kitchen-advertising-performance-year-cell">
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

function PerformanceSection({
  rows,
  mode,
}: {
  rows: KitchenAdvertisingPerformanceReport["rows"];
  mode: KitchenAdvertisingPerformanceMode;
}) {
  const festivalDict = useDictItems(DICT_TYPE.kitchenAdvertisingFestival);
  const preferredFestivals = useMemo(
    () => festivalDict.items.map((item) => item.value),
    [festivalDict.items],
  );
  const festivals = useMemo(
    () => kitchenAdvertisingPerformanceFestivals(rows, preferredFestivals),
    [preferredFestivals, rows],
  );
  const [festival, setFestival] = useState<string>("");
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

  useEffect(() => {
    if (mode === "festival" && !festivals.includes(festival)) {
      setFestival(festivals[0] ?? "");
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
  const aiSnapshot = useMemo(
    () => ({
      filters: { mode, segmentKey, selectedYears },
      currentAggregates: segmentRows
        .filter((row) => selectedYears.includes(row.year))
        .map((row) => ({
          year: row.year,
          segmentKey: row.segmentKey,
          segmentLabel: row.segmentLabel,
          channel: row.channel,
          metric: row.metric,
          amount: row.amount,
        })),
      completeness: {
        status: "partial" as const,
        notes: ["廣告表現只可比較相同節日或相同 non-peak 月份的年度資料。"],
      },
    }),
    [mode, segmentKey, segmentRows, selectedYears],
  );
  useReportAiSnapshot(aiSnapshot, mode);

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
            <FilterableSelect aria-label="節日" value={festival} onChange={(event) => setFestival(event.target.value)}>
              {festivals.map((option) => <option key={option} value={option}>{option}</option>)}
            </FilterableSelect>
          ) : (
            <FilterableSelect aria-label="月份(non-peak)" value={month} onChange={(event) => setMonth(event.target.value)}>
              {monthOptions.map((option) => <option key={option} value={option}>{option}月 non-peak</option>)}
            </FilterableSelect>
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
              <th className="kitchen-advertising-performance-year-heading" scope="col">年份</th>
              {channels.map((channel) => <th scope="col" key={channel}>{channel}</th>)}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr data-advertising-year={summary.year} key={summary.year}>
                <th className="kitchen-advertising-performance-row-year" scope="row">
                  <strong>{summary.year}</strong>
                  <span>{formatMoney(summary.totalSales)}</span>
                </th>
                {channels.map((channel) => (
                  <td key={channel}>
                    <PerformanceCell
                      summary={summary}
                      channel={channel}
                      costTypes={costTypes}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="kitchen-advertising-performance-no-data">目前沒有廣告表現資料。</p>
        ) : null}
      </div>
    </section>
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
      <div className="report-ai-nav-row report-ai-actions-only">
        <ReportAiTrigger />
      </div>

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
