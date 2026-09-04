import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  ReportAiTrigger,
  useReportAiSnapshot,
} from "@/components/report-ai/ReportAiWorkspace";
import {
  buildFestivalOrderMonthSummaries,
  buildFestivalOrderYearSummaries,
  buildFestivalOrderYearTotals,
  defaultFestivalOrderGenerationYears,
  festivalOrderGenerationCsv,
  festivalOrderGenerationFestivals,
  festivalOrderGenerationYears,
  fetchFestivalOrderGenerationReport,
  type FestivalOrderGenerationReport,
  type FestivalYearCell,
} from "@/lib/festival-order-generation-report";

const countFormat = new Intl.NumberFormat("zh-HK");

function formatCount(value: number) {
  return countFormat.format(value);
}

function formatChange(cell: FestivalYearCell) {
  if (cell.delta == null) return "—";
  const sign = cell.delta > 0 ? "+" : "";
  if (cell.percent == null) {
    return `${sign}${formatCount(cell.delta)}`;
  }
  return `${sign}${formatCount(cell.delta)}（${sign}${cell.percent.toFixed(1)}%）`;
}

function changeKind(cell: FestivalYearCell) {
  if (cell.delta == null || cell.delta === 0) return "flat";
  return cell.delta > 0 ? "up" : "down";
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
      aria-labelledby="festival-order-generation-filter-title"
    >
      <div className="kitchen-sales-cost-filter-copy">
        <span className="kitchen-sales-cost-filter-icon">
          <CalendarDays />
        </span>
        <div>
          <h2 id="festival-order-generation-filter-title">選擇報表年份</h2>
          <p>可同時比較多個年份，數字為該年生成的節日訂單筆數。</p>
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
        <span>{selectedYears.length ? `已選 ${selectedYears.length} 年` : "尚未選擇年份"}</span>
        <button type="button" onClick={() => onChange(years)}>全選</button>
        <button type="button" onClick={() => onChange([])}>清除</button>
      </div>
    </section>
  );
}

function downloadCsv(summaries: ReturnType<typeof buildFestivalOrderYearSummaries>, totals: FestivalYearCell[]) {
  const csv = festivalOrderGenerationCsv(summaries, totals);
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `festival-order-generation-${totals.map((cell) => cell.year).join("-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function FestivalOrderGenerationReportPage() {
  const [report, setReport] = useState<FestivalOrderGenerationReport | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedFestivalKey, setSelectedFestivalKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchFestivalOrderGenerationReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "節日訂單報表載入失敗");
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
    () => festivalOrderGenerationYears(report?.rows ?? []),
    [report],
  );
  const festivals = useMemo(
    () => festivalOrderGenerationFestivals(report?.rows ?? []),
    [report],
  );

  useEffect(() => {
    if (!report) return;
    setSelectedYears((current) => {
      const valid = current.filter((year) => years.includes(year));
      return valid.length > 0
        ? valid
        : defaultFestivalOrderGenerationYears(years);
    });
  }, [report, years]);

  const summaries = useMemo(
    () =>
      buildFestivalOrderYearSummaries(
        report?.rows ?? [],
        selectedYears,
        festivals,
      ),
    [festivals, report, selectedYears],
  );
  const totals = useMemo(
    () => buildFestivalOrderYearTotals(summaries, selectedYears),
    [selectedYears, summaries],
  );
  const selectedFestival =
    summaries.find((summary) => summary.festivalKey === selectedFestivalKey) ??
    summaries.find((summary) => summary.festivalLabel === "中秋節") ??
    summaries[0] ??
    null;
  const monthSummaries = useMemo(
    () =>
      selectedFestival
        ? buildFestivalOrderMonthSummaries(
            report?.rows ?? [],
            selectedFestival.festivalKey,
            selectedYears,
          )
        : [],
    [report, selectedFestival, selectedYears],
  );

  const aiSnapshot = useMemo(
    () =>
      report && !loading
        ? {
            filters: { selectedYears, selectedFestivalKey: selectedFestival?.festivalKey ?? "" },
            currentAggregates: summaries.flatMap((summary) =>
              summary.cells.map((cell) => ({
                festival: summary.festivalLabel,
                year: cell.year,
                orderCount: cell.orderCount,
                delta: cell.delta,
                percent: cell.percent,
              })),
            ),
            completeness: {
              status: "partial" as const,
              notes: [
                "只統計已指定節日、未封存的正式訂單。",
                "生成年份以香港時間的訂單建立日期計算。",
              ],
            },
          }
        : null,
    [loading, report, selectedFestival, selectedYears, summaries],
  );
  useReportAiSnapshot(aiSnapshot);

  return (
    <div className="festival-order-generation-page kitchen-sales-cost-report-page">
      <header className="page-heading kitchen-sales-cost-page-heading">
        <div>
          <span className="eyebrow">中央廚房報表</span>
          <h1>節日訂單生成數量</h1>
          <p>以香港時間訂單生成日期統計，比較每年每個節日的訂單筆數。</p>
        </div>
      </header>
      <div className="report-ai-nav-row report-ai-actions-left">
        <ReportAiTrigger />
        {summaries.length ? (
          <Button
            variant="outline"
            onClick={() => downloadCsv(summaries, totals)}
          >
            <Download aria-hidden="true" /> 下載 CSV
          </Button>
        ) : null}
      </div>

      {loading && !report ? (
        <PageSkeleton label="正在載入節日訂單報表" variant="report" />
      ) : null}
      {error ? (
        <section className="panel kitchen-sales-cost-error" role="alert">
          <div>
            <strong>節日訂單報表載入失敗</strong>
            <span>{error}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw aria-hidden="true" /> 重試
          </Button>
        </section>
      ) : null}
      {!loading && !error && !years.length ? (
        <section className="panel kitchen-sales-cost-empty">
          <strong>目前沒有節日訂單資料</strong>
          <span>有指定節日的正式訂單後，年份選項會自動出現。</span>
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
                <>
                  <section
                    className="festival-order-generation-year-totals"
                    aria-label="各年訂單合計"
                  >
                    {totals.map((cell) => (
                      <article className="panel" key={cell.year}>
                        <span>{cell.year} 年</span>
                        <strong>{formatCount(cell.orderCount)}</strong>
                        <small className={`festival-order-generation-change is-${changeKind(cell)}`}>
                          {cell.delta == null ? "基準年" : `較上年 ${formatChange(cell)}`}
                        </small>
                      </article>
                    ))}
                  </section>

                  <section className="panel festival-order-generation-table-wrap">
                    <div className="festival-order-generation-table-copy">
                      <strong>每年每個節日</strong>
                      <span>點選節日可查看該節日的每月生成數量。括號為較所選上一年度的變化。</span>
                    </div>
                    <div className="festival-order-generation-table-scroll">
                      <table className="festival-order-generation-table">
                        <caption className="sr-only">每年每個節日的訂單生成數量</caption>
                        <thead>
                          <tr>
                            <th scope="col">節日</th>
                            {selectedYears.map((year) => (
                              <th scope="col" key={year}>{year}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {summaries.map((summary) => (
                            <tr
                              className={
                                summary.festivalKey === selectedFestival?.festivalKey
                                  ? "is-selected"
                                  : undefined
                              }
                              data-festival={summary.festivalLabel}
                              key={summary.festivalKey}
                            >
                              <th scope="row">
                                <button
                                  type="button"
                                  onClick={() => setSelectedFestivalKey(summary.festivalKey)}
                                >
                                  {summary.festivalLabel}
                                </button>
                              </th>
                              {summary.cells.map((cell) => (
                                <td data-report-year={cell.year} key={cell.year}>
                                  <strong>{formatCount(cell.orderCount)}</strong>
                                  <small className={`festival-order-generation-change is-${changeKind(cell)}`}>
                                    {formatChange(cell)}
                                  </small>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th scope="row">合計</th>
                            {totals.map((cell) => (
                              <td data-report-year={cell.year} key={cell.year}>
                                <strong>{formatCount(cell.orderCount)}</strong>
                                <small className={`festival-order-generation-change is-${changeKind(cell)}`}>
                                  {formatChange(cell)}
                                </small>
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>

                  {selectedFestival ? (
                    <section className="panel festival-order-generation-table-wrap">
                      <div className="festival-order-generation-table-copy">
                        <strong>{selectedFestival.festivalLabel} — 每月生成數量</strong>
                        <span>比較所選年份在同一月份的訂單生成筆數。</span>
                      </div>
                      <div className="festival-order-generation-table-scroll">
                        <table className="festival-order-generation-table">
                          <caption className="sr-only">
                            {selectedFestival.festivalLabel}每月訂單生成數量
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">月份</th>
                              {selectedYears.map((year) => (
                                <th scope="col" key={year}>{year}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {monthSummaries.map((summary) => (
                              <tr data-report-month={summary.month} key={summary.month}>
                                <th scope="row">{summary.month}月</th>
                                {summary.cells.map((cell) => (
                                  <td data-report-year={cell.year} key={cell.year}>
                                    <strong>{formatCount(cell.orderCount)}</strong>
                                    <small className={`festival-order-generation-change is-${changeKind(cell)}`}>
                                      {formatChange(cell)}
                                    </small>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}
                </>
              ) : (
                <section className="panel kitchen-sales-cost-empty">
                  <strong>請選擇至少一個年份</strong>
                  <span>勾選年份後，即可比較各節日的訂單生成數量。</span>
                </section>
              )}
            </main>
          </div>
        </div>
      ) : null}
      {loading && report ? (
        <span className="kitchen-sales-cost-refreshing">正在更新資料…</span>
      ) : null}
    </div>
  );
}