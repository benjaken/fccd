import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleDollarSign, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { KitchenMonthlyFestivalCosts } from "@/components/KitchenMonthlyFestivalCosts";
import { KitchenMonthlyNonFestivalCosts } from "@/components/KitchenMonthlyNonFestivalCosts";
import { KitchenMonthlySupplierRecords } from "@/components/KitchenMonthlySupplierRecords";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  addDays,
  buildKitchenCostWeeks,
  createKitchenAdvertisingCost,
  deleteKitchenAdvertisingCost,
  fetchKitchenAdvertisingCosts,
  fetchKitchenCostReport,
  fetchLatestKitchenAdvertisingCostWeekStart,
  formatWeekRange,
  getKitchenCostCell,
  hongKongDateKey,
  isMonday,
  mondayForDate,
  pastWeekOptions,
  previousCompleteWeekStart,
  updateKitchenAdvertisingCosts,
  type KitchenAdvertisingCostRecord,
  type KitchenCostChannel,
  type KitchenCostReport,
  type KitchenCostType,
  type KitchenCostWeek,
} from "@/lib/kitchen-cost-input";
import { KITCHEN_COST_INPUT_EDIT } from "@/lib/kitchen-action-permissions";

const money = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0,
});

const COST_RECORDS_PAGE_SIZE = 15;

const costPageTabs = [
  { id: "weekly-advertising", label: "每週廣告費" },
  { id: "monthly-non-festival", label: "每月營運費用（非節日）" },
  { id: "monthly-festival", label: "每月營運費用（節日）" },
  { id: "monthly-suppliers", label: "月結供應商紀錄" },
] as const;

type CostPageTab = (typeof costPageTabs)[number]["id"];

const defaultCostPageTab: CostPageTab = "weekly-advertising";

function isCostPageTab(value: string | null): value is CostPageTab {
  return costPageTabs.some((tab) => tab.id === value);
}

const costTypeColors = ["#1683e8", "#5268d9", "#f59e0b", "#8b5cf6"];

function percentage(cost: number, sales: number) {
  if (sales <= 0) return "0%";
  return `${Math.round((cost / sales) * 100)}%`;
}

function CostCell({
  sales,
  costs,
  costTypes,
}: {
  sales: number;
  costs: Record<string, number>;
  costTypes: KitchenCostType[];
}) {
  return (
    <div className="kitchen-cost-cell">
      <div className="kitchen-cost-sales">
        <span>銷售額</span>
        <strong>{money.format(sales)}</strong>
      </div>
      {costTypes.map((type) => {
        const amount = costs[type.id] ?? 0;
        if (amount === 0) return null;
        return (
          <div className="kitchen-cost-line" key={type.id}>
            <span>{type.name}</span>
            <strong>{money.format(amount)}</strong>
            <em>{percentage(amount, sales)}</em>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyCostCharts({
  weeks,
  totals,
  costTypes,
}: {
  weeks: KitchenCostWeek[];
  totals: Array<{ sales: number; costs: Record<string, number> }>;
  costTypes: KitchenCostType[];
}) {
  const maximumSales = Math.max(1, ...totals.map((item) => item.sales));
  const costTotals = totals.map((item) =>
    costTypes.reduce((sum, type) => sum + (item.costs[type.id] ?? 0), 0),
  );
  const maximumCost = Math.max(1, ...costTotals);
  const shortDate = (dateKey: string) => {
    const [, month, day] = dateKey.split("-");
    return `${Number(month)}/${Number(day)}`;
  };

  return (
    <section className="kitchen-cost-charts" aria-label="六週費用圖表">
      <figure className="kitchen-cost-chart-card">
        <figcaption>
          <div><strong>六週銷售額趨勢</strong><span>每週訂單銷售總額</span></div>
          <em>{money.format(totals.reduce((sum, item) => sum + item.sales, 0))}</em>
        </figcaption>
        <div className="kitchen-cost-bar-chart">
          {weeks.map((week, index) => {
            const value = totals[index]?.sales ?? 0;
            return (
              <div className="kitchen-cost-bar-column" key={week.start}>
                <span className="kitchen-cost-bar-value">{money.format(value)}</span>
                <div className="kitchen-cost-bar-track">
                  <i
                    className="kitchen-cost-sales-bar"
                    style={{ height: `${value > 0 ? Math.max(4, (value / maximumSales) * 100) : 0}%` }}
                  />
                </div>
                <small>{shortDate(week.start)}–{shortDate(week.end)}</small>
              </div>
            );
          })}
        </div>
      </figure>

      <figure className="kitchen-cost-chart-card">
        <figcaption>
          <div><strong>六週廣告費用趨勢</strong><span>按廣告類型顯示</span></div>
          <em>{money.format(costTotals.reduce((sum, value) => sum + value, 0))}</em>
        </figcaption>
        <div className="kitchen-cost-chart-legend">
          {costTypes.map((type, index) => (
            <span key={type.id}>
              <i style={{ backgroundColor: costTypeColors[index % costTypeColors.length] }} />
              {type.name}
            </span>
          ))}
        </div>
        <div className="kitchen-cost-bar-chart">
          {weeks.map((week, index) => {
            const total = costTotals[index] ?? 0;
            return (
              <div className="kitchen-cost-bar-column" key={week.start}>
                <span className="kitchen-cost-bar-value">{money.format(total)}</span>
                <div className="kitchen-cost-bar-track">
                  <div
                    className="kitchen-cost-stacked-bar"
                    style={{ height: `${total > 0 ? Math.max(4, (total / maximumCost) * 100) : 0}%` }}
                  >
                    {costTypes.map((type, typeIndex) => {
                      const value = totals[index]?.costs[type.id] ?? 0;
                      return value > 0 ? (
                        <i
                          key={type.id}
                          title={`${type.name}：${money.format(value)}`}
                          style={{
                            height: `${(value / total) * 100}%`,
                            backgroundColor: costTypeColors[typeIndex % costTypeColors.length],
                          }}
                        />
                      ) : null;
                    })}
                  </div>
                </div>
                <small>{shortDate(week.start)}–{shortDate(week.end)}</small>
              </div>
            );
          })}
        </div>
      </figure>
    </section>
  );
}

function WeeklyCostChartsSkeleton() {
  const barHeights = [42, 68, 54, 82, 61, 74];

  return (
    <section
      className="kitchen-cost-charts kitchen-cost-charts-skeleton"
      aria-label="正在載入六週費用圖表"
      aria-busy="true"
    >
      <span className="sr-only">正在載入六週費用圖表</span>
      {[0, 1].map((chart) => (
        <figure className="kitchen-cost-chart-card" key={chart}>
          <figcaption>
            <div>
              <span className="page-skeleton-bone kitchen-cost-chart-skeleton-title" />
              <span className="page-skeleton-bone kitchen-cost-chart-skeleton-copy" />
            </div>
            <span className="page-skeleton-bone kitchen-cost-chart-skeleton-total" />
          </figcaption>
          <div className="kitchen-cost-chart-legend kitchen-cost-chart-skeleton-legend" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <span key={item}>
                <i className="page-skeleton-bone" />
                <b className="page-skeleton-bone" />
              </span>
            ))}
          </div>
          <div className="kitchen-cost-bar-chart" aria-hidden="true">
            {barHeights.map((height, index) => (
              <div className="kitchen-cost-bar-column" key={index}>
                <span className="kitchen-cost-bar-value page-skeleton-bone kitchen-cost-chart-skeleton-value" />
                <div className="kitchen-cost-bar-track">
                  <i
                    className="page-skeleton-bone kitchen-cost-chart-skeleton-bar"
                    style={{ height: `${chart === 0 ? height : barHeights.at(-index - 1)}%` }}
                  />
                </div>
                <span className="page-skeleton-bone kitchen-cost-chart-skeleton-date" />
              </div>
            ))}
          </div>
        </figure>
      ))}
    </section>
  );
}

function AddCostPanel({
  open,
  channels,
  costTypes,
  defaultWeekStart,
  onClose,
  onSaved,
}: {
  open: boolean;
  channels: KitchenCostChannel[];
  costTypes: KitchenCostType[];
  defaultWeekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [channelId, setChannelId] = useState("");
  const [costTypeId, setCostTypeId] = useState("");
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mondayOptions = useMemo(() => pastWeekOptions(), []);

  useEffect(() => {
    if (open) setWeekStart(defaultWeekStart);
  }, [defaultWeekStart, open]);

  const validMonday = isMonday(weekStart);
  const selectedRange = validMonday
    ? formatWeekRange({ start: weekStart, end: addDays(weekStart, 6) })
    : "請選擇星期一";

  const resetAndClose = () => {
    setChannelId("");
    setCostTypeId("");
    setWeekStart(defaultWeekStart);
    setAmount("");
    setRemarks("");
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const channel = channels.find((item) => item.id === channelId);
    const costType = costTypes.find((item) => item.id === costTypeId);
    const numericAmount = Number(amount);
    if (!channel || !costType) {
      setError("請選擇品牌及費用類型");
      return;
    }
    if (!validMonday) {
      setError("日期只能選擇星期一");
      return;
    }
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError("請輸入有效金額");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createKitchenAdvertisingCost({
        channel,
        costType,
        weekStart,
        amount: numericAmount,
        remarks,
      });
      resetAndClose();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存資料失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title="一週廣告成本 - 資料輸入"
      description="日期只接受星期一，系統會自動計算該週星期一至星期日。"
      onClose={resetAndClose}
      closeLabel="關閉新增費用側欄"
      footer={
        <>
          <Button type="button" variant="outline" onClick={resetAndClose}>
            取消
          </Button>
          <Button type="submit" form="kitchen-cost-input-form" disabled={saving}>
            {saving ? "儲存中…" : "確定"}
          </Button>
        </>
      }
    >
      <form
        id="kitchen-cost-input-form"
        className="ingredients-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="ingredients-field">
          <span>品牌</span>
          <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
            <option value="">選擇品牌</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}{channel.shortName ? ` - ${channel.shortName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="ingredients-field">
          <span>類型</span>
          <select value={costTypeId} onChange={(event) => setCostTypeId(event.target.value)}>
            <option value="">選擇廣告類型</option>
            {costTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </label>
        <label className="ingredients-field">
          <span>日期（星期一）</span>
          <select
            value={weekStart}
            aria-invalid={!validMonday}
            onChange={(event) => {
              setWeekStart(event.target.value);
              setError(null);
            }}
          >
            {mondayOptions.map((option) => (
              <option key={option.start} value={option.start}>
                {option.start}（星期一）
              </option>
            ))}
          </select>
          <small className={validMonday ? "" : "kitchen-cost-date-error"}>
            週期：{selectedRange}
          </small>
        </label>
        <label className="ingredients-field">
          <span>金額</span>
          <div className="kitchen-cost-money-input">
            <span aria-hidden="true">HK$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              aria-label="金額（港幣）"
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </label>
        <label className="ingredients-field">
          <span>備註</span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </label>
        {error ? <p className="ingredients-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

function EditCostRecordsPanel({
  open,
  channels,
  costTypes,
  onClose,
  onSaved,
}: {
  open: boolean;
  channels: KitchenCostChannel[];
  costTypes: KitchenCostType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<KitchenAdvertisingCostRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; remarks: string }>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const totalPages = Math.max(1, Math.ceil(total / COST_RECORDS_PAGE_SIZE));
  const channelById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels],
  );
  const costTypeById = useMemo(
    () => new Map(costTypes.map((type) => [type.id, type])),
    [costTypes],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenAdvertisingCosts({ page, pageSize: COST_RECORDS_PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotal(result.total);
        setDrafts((current) => {
          const next = { ...current };
          for (const row of result.items) {
            next[row.id] ??= { amount: String(row.amount), remarks: row.remarks };
          }
          return next;
        });
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取費用記錄失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, page, reloadKey]);

  useEffect(() => {
    if (!open) {
      setPage(1);
      setRows([]);
      setTotal(0);
      setDrafts({});
      setDirtyIds(new Set());
      setError(null);
    }
  }, [open]);

  const changeDraft = (
    id: string,
    field: "amount" | "remarks",
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { amount: "", remarks: "" }), [field]: value },
    }));
    setDirtyIds((current) => new Set(current).add(id));
    setError(null);
  };

  const save = async () => {
    const changes = [...dirtyIds].map((id) => ({
      id,
      amount: Number(drafts[id]?.amount ?? ""),
      remarks: drafts[id]?.remarks ?? "",
    }));
    if (changes.some((change) => !Number.isFinite(change.amount) || change.amount < 0)) {
      setError("請輸入有效金額");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateKitchenAdvertisingCosts(changes);
      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存費用記錄失敗");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KitchenAdvertisingCostRecord) => {
    const channel = row.channelId ? channelById.get(row.channelId)?.name : null;
    if (!window.confirm(`確定刪除 ${channel ?? "此品牌"} 的費用記錄？`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteKitchenAdvertisingCost(row.id);
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
      const nextTotal = Math.max(0, total - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / COST_RECORDS_PAGE_SIZE));
      if (page > nextTotalPages) setPage(nextTotalPages);
      else setReloadKey((value) => value + 1);
      onSaved();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除費用記錄失敗");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SidePanel
      open={open}
      title="編輯費用記錄"
      description="修改費用或備註後按儲存；刪除操作會立即生效。"
      onClose={onClose}
      closeLabel="關閉編輯費用側欄"
      className="side-panel-majority"
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "儲存中…" : "儲存"}
          </Button>
        </>
      }
    >
      {error ? <p className="ingredients-form-error">{error}</p> : null}
      <ListTable
        className="kitchen-cost-records-table-wrap"
        tableClassName="kitchen-cost-records-table"
        loading={loading}
        loadingLabel="正在載入費用記錄"
        skeletonRows={COST_RECORDS_PAGE_SIZE}
        skeletonColumns={6}
        onRefresh={() => setReloadKey((value) => value + 1)}
        header={
          <tr>
            <th>Week</th>
            <th>品牌</th>
            <th>廣告類型</th>
            <th>費用</th>
            <th>備註</th>
            <th aria-label="操作" />
          </tr>
        }
      >
        {rows.map((row) => {
          const channel = row.channelId ? channelById.get(row.channelId) : null;
          const type = row.costTypeId ? costTypeById.get(row.costTypeId) : null;
          const start = hongKongDateKey(row.rangeStart);
          const end = hongKongDateKey(row.rangeEnd) ?? (start ? addDays(start, 6) : null);
          const draft = drafts[row.id] ?? { amount: String(row.amount), remarks: row.remarks };
          return (
            <tr key={row.id}>
              <td>{start && end ? formatWeekRange({ start, end }) : "—"}</td>
              <td>
                <strong>{channel?.name ?? "—"}</strong>
                {channel?.shortName ? <small> - {channel.shortName}</small> : null}
              </td>
              <td>{type?.name ?? "—"}</td>
              <td>
                <div className="kitchen-cost-record-amount">
                  <span>HK$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.amount}
                    aria-label={`${channel?.name ?? "品牌"}費用`}
                    onChange={(event) => changeDraft(row.id, "amount", event.target.value)}
                  />
                </div>
              </td>
              <td>
                <input
                  className="kitchen-cost-record-remarks"
                  value={draft.remarks}
                  title={draft.remarks}
                  aria-label={`${channel?.name ?? "品牌"}備註`}
                  onChange={(event) => changeDraft(row.id, "remarks", event.target.value)}
                />
              </td>
              <td>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  disabled={deletingId === row.id}
                  aria-label="刪除費用記錄"
                  onClick={() => void remove(row)}
                >
                  <Trash2 />
                </Button>
              </td>
            </tr>
          );
        })}
        {!loading && rows.length === 0 ? (
          <tr><td colSpan={6} className="kitchen-cost-empty">暫時沒有費用記錄。</td></tr>
        ) : null}
      </ListTable>
      <TablePagination
        summary={`顯示 ${total ? (page - 1) * COST_RECORDS_PAGE_SIZE + 1 : 0}–${Math.min(page * COST_RECORDS_PAGE_SIZE, total)}，共 ${total} 筆`}
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((value) => Math.max(1, value - 1))}
        onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        onPageChange={setPage}
        previousLabel="上一頁"
        nextLabel="下一頁"
        pageLabel="/"
        jumpLabel="跳至頁面"
      />
    </SidePanel>
  );
}

export function KitchenCostInputPage() {
  const pageAccess = useCurrentPageAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CostPageTab>(() => {
    const tab = searchParams.get("tab");
    return isCostPageTab(tab) ? tab : defaultCostPageTab;
  });
  const [newestWeekStart, setNewestWeekStart] = useState(previousCompleteWeekStart);
  const [initialWeekReady, setInitialWeekReady] = useState(false);
  const [report, setReport] = useState<KitchenCostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const requestedWeekStart = useMemo(() => {
    const requestedWeek = searchParams.get("week");
    // Links from the progress page use Monday.  Accept any date as well, so a
    // deep link always opens the Monday-to-Sunday range containing that date.
    return requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)
      ? mondayForDate(requestedWeek)
      : null;
  }, [searchParams]);
  const weekOptions = useMemo(() => pastWeekOptions(), []);
  const fallbackWeeks = useMemo(
    () => buildKitchenCostWeeks(newestWeekStart),
    [newestWeekStart],
  );
  const canEdit = pageAccess.canAccess(KITCHEN_COST_INPUT_EDIT);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const nextTab = isCostPageTab(requestedTab)
      ? requestedTab
      : defaultCostPageTab;
    setActiveTab(nextTab);

    if (requestedTab && requestedTab !== nextTab) {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("tab", nextTab);
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (requestedWeekStart) setNewestWeekStart(requestedWeekStart);
  }, [requestedWeekStart]);

  const selectTab = (tab: CostPageTab) => {
    setActiveTab(tab);
    setPanelOpen(false);
    setEditPanelOpen(false);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", tab);
    setSearchParams(nextSearchParams);
  };

  useEffect(() => {
    let active = true;
    void fetchLatestKitchenAdvertisingCostWeekStart()
      .then((weekStart) => {
        // An explicit URL is authoritative.  Otherwise the page opens at the
        // most recently entered advertising-cost week.
        if (active && weekStart && !requestedWeekStart) setNewestWeekStart(weekStart);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitialWeekReady(true);
      });
    return () => {
      active = false;
    };
  }, [requestedWeekStart]);

  useEffect(() => {
    if (!initialWeekReady) return;
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenCostReport(newestWeekStart)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取費用資料失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialWeekReady, newestWeekStart, reloadKey]);

  const weeks = report?.weeks ?? fallbackWeeks;
  const channels = report?.channels ?? [];
  const costTypes = report?.costTypes ?? [];
  const totals = weeks.map((week) => {
    const total = { sales: 0, costs: {} as Record<string, number> };
    for (const channel of channels) {
      const cell = getKitchenCostCell(report!, channel.id, week.start);
      total.sales += cell.sales;
      for (const type of costTypes) {
        total.costs[type.id] = (total.costs[type.id] ?? 0) + (cell.costs[type.id] ?? 0);
      }
    }
    return total;
  });

  return (
    <section className="ingredients-page kitchen-cost-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">中央廚房</span>
          <h1>費用輸入</h1>
          <p>檢視最近六個完整星期的銷售及廣告費用比例。</p>
        </div>
        {canEdit && activeTab === "weekly-advertising" ? (
          <div className="heading-actions">
            <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
              <Pencil />編輯費用記錄
            </Button>
            <Button onClick={() => setPanelOpen(true)}>
              <Plus />新增輸入資料
            </Button>
          </div>
        ) : null}
      </header>

      <nav className="kitchen-cost-tabs" role="tablist" aria-label="費用輸入分類">
        {costPageTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`kitchen-cost-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`kitchen-cost-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "weekly-advertising" ? (
      <article
        className="panel ingredients-panel kitchen-cost-panel"
        id="kitchen-cost-panel-weekly-advertising"
        role="tabpanel"
        aria-labelledby="kitchen-cost-tab-weekly-advertising"
      >
        {error ? (
          <div className="products-state products-state-error">
            <CircleDollarSign />
            <div><strong>讀取費用資料失敗</strong><span>{error}</span></div>
            <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw />重試
            </Button>
          </div>
        ) : null}
        {loading && !error ? <WeeklyCostChartsSkeleton /> : null}
        {!loading && !error && channels.length > 0 ? (
          <WeeklyCostCharts weeks={weeks} totals={totals} costTypes={costTypes} />
        ) : null}
        <ListTable
          className="kitchen-cost-table-wrap"
          tableClassName="kitchen-cost-table"
          loading={loading}
          loadingLabel="正在載入每週費用資料"
          skeletonRows={8}
          skeletonColumns={7}
          onRefresh={() => setReloadKey((value) => value + 1)}
          header={
            <>
              <tr className="kitchen-cost-week-labels">
                <th aria-label="品牌" />
                {weeks.map((week, index) => (
                  <th key={week.start}>Week {6 - index}</th>
                ))}
              </tr>
              <tr>
                <th>品牌</th>
                {weeks.map((week, index) => (
                  <th key={week.start}>
                    {index === 0 ? (
                      <select
                        className="kitchen-cost-week-select"
                        value={newestWeekStart}
                        aria-label="選擇第一個星期"
                        onChange={(event) => setNewestWeekStart(event.target.value)}
                      >
                        {weekOptions.map((option) => (
                          <option key={option.start} value={option.start}>
                            {formatWeekRange(option)}
                          </option>
                        ))}
                      </select>
                    ) : formatWeekRange(week)}
                  </th>
                ))}
              </tr>
            </>
          }
        >
          {channels.map((channel) => (
            <tr key={channel.id}>
              <th scope="row">{channel.name}</th>
              {weeks.map((week) => {
                const cell = getKitchenCostCell(report!, channel.id, week.start);
                return (
                  <td key={week.start}>
                    <CostCell sales={cell.sales} costs={cell.costs} costTypes={costTypes} />
                  </td>
                );
              })}
            </tr>
          ))}
          {!loading && channels.length > 0 ? (
            <tr className="kitchen-cost-total-row">
              <th scope="row">總計</th>
              {totals.map((total, index) => (
                <td key={weeks[index].start}>
                  <CostCell sales={total.sales} costs={total.costs} costTypes={costTypes} />
                </td>
              ))}
            </tr>
          ) : null}
          {!loading && !error && channels.length === 0 ? (
            <tr><td colSpan={7} className="kitchen-cost-empty">暫時沒有品牌資料。</td></tr>
          ) : null}
        </ListTable>
      </article>
      ) : activeTab === "monthly-non-festival" ? (
        <KitchenMonthlyNonFestivalCosts canEdit={canEdit} />
      ) : activeTab === "monthly-festival" ? (
        <KitchenMonthlyFestivalCosts canEdit={canEdit} />
      ) : activeTab === "monthly-suppliers" ? (
        <KitchenMonthlySupplierRecords canEdit={canEdit} />
      ) : (
        <article
          className="panel ingredients-panel kitchen-cost-placeholder"
          id={`kitchen-cost-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`kitchen-cost-tab-${activeTab}`}
        >
          <CircleDollarSign />
          <div>
            <strong>{costPageTabs.find((tab) => tab.id === activeTab)?.label}</strong>
            <span>此分類已建立，資料內容將於後續設定。</span>
          </div>
        </article>
      )}

      {activeTab === "weekly-advertising" ? <AddCostPanel
        open={panelOpen}
        channels={channels}
        costTypes={costTypes}
        defaultWeekStart={newestWeekStart}
        onClose={() => setPanelOpen(false)}
        onSaved={() => setReloadKey((value) => value + 1)}
      /> : null}
      {activeTab === "weekly-advertising" ? <EditCostRecordsPanel
        open={editPanelOpen}
        channels={channels}
        costTypes={costTypes}
        onClose={() => setEditPanelOpen(false)}
        onSaved={() => setReloadKey((value) => value + 1)}
      /> : null}
    </section>
  );
}
