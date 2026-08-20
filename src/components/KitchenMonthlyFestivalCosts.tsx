import { useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListTable } from "@/components/ui/list-table";
import { MultiSelect } from "@/components/ui/multi-select";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  createKitchenMonthlyFestivalCost,
  deleteKitchenMonthlyCost,
  fetchKitchenFestivals,
  fetchKitchenMonthlyCostChannels,
  fetchKitchenMonthlyCostTypes,
  fetchKitchenMonthlyFestivalCosts,
  updateKitchenMonthlyFestivalCosts,
  type KitchenFestival,
  type KitchenFestivalCostRow,
  type KitchenMonthlyCostChannel,
  type KitchenMonthlyCostType,
} from "@/lib/kitchen-monthly-costs";
import { hongKongDateKey } from "@/lib/kitchen-cost-input";

const PAGE_SIZE = 15;

function shortDate(timestamp: string | null) {
  const key = hongKongDateKey(timestamp);
  if (!key) return "—";
  const [year, month, day] = key.split("-").map(Number);
  return `${String(year).slice(-2)}年${month}月${day}日`;
}

function AddFestivalCostPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [costTypes, setCostTypes] = useState<KitchenMonthlyCostType[]>([]);
  const [channels, setChannels] = useState<KitchenMonthlyCostChannel[]>([]);
  const [festivals, setFestivals] = useState<KitchenFestival[]>([]);
  const [costTypeId, setCostTypeId] = useState("");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [festivalId, setFestivalId] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || (costTypes.length && channels.length && festivals.length)) return;
    let active = true;
    setLoadingOptions(true);
    void Promise.all([
      fetchKitchenMonthlyCostTypes(),
      fetchKitchenMonthlyCostChannels(),
      fetchKitchenFestivals(),
    ])
      .then(([typeItems, channelItems, festivalItems]) => {
        if (!active) return;
        setCostTypes(typeItems);
        setChannels(channelItems);
        setFestivals(festivalItems);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取選項失敗");
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [channels.length, costTypes.length, festivals.length, open]);

  const resetAndClose = () => {
    setCostTypeId("");
    setChannelIds([]);
    setFestivalId("");
    setRangeStart("");
    setRangeEnd("");
    setAmount("");
    setRemarks("");
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const costType = costTypes.find((item) => item.id === costTypeId);
    const selectedChannels = channels.filter((item) => channelIds.includes(item.id));
    const festival = festivals.find((item) => item.id === festivalId);
    const numericAmount = Number(amount);
    if (!costType) return setError("請選擇費用類型");
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return setError("請選擇有效日期範圍");
    if (!festival) return setError("請選擇節日");
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount < 0) {
      return setError("請輸入有效金額");
    }
    setSaving(true);
    setError(null);
    try {
      await createKitchenMonthlyFestivalCost({
        costType,
        channels: selectedChannels,
        festival,
        rangeStart,
        rangeEnd,
        amount: numericAmount,
        remarks,
      });
      resetAndClose();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "新增節日營運費用失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title="每月營運費用（節日）輸入"
      onClose={resetAndClose}
      closeLabel="關閉節日營運費用輸入側欄"
      footer={
        <>
          <Button type="button" variant="outline" onClick={resetAndClose}>取消</Button>
          <Button type="submit" form="monthly-festival-cost-form" disabled={saving || loadingOptions}>
            {saving ? "儲存中…" : "確定"}
          </Button>
        </>
      }
    >
      <form id="monthly-festival-cost-form" className="ingredients-form" onSubmit={(event) => void submit(event)}>
        <label className="ingredients-field">
          <span>類型</span>
          <select value={costTypeId} disabled={loadingOptions} onChange={(event) => setCostTypeId(event.target.value)}>
            <option value="">選擇費用</option>
            {costTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>

        <div className="kitchen-festival-brand-heading">
          <span id="kitchen-festival-brand-label">品牌（選填）</span>
          <Button
            type="button"
            variant="ghost"
            disabled={loadingOptions || !channels.length}
            onClick={() => setChannelIds(channels.map((channel) => channel.id))}
          >
            選擇全部品牌
          </Button>
        </div>
        <MultiSelect
          id="kitchen-festival-brand-select"
          labelledBy="kitchen-festival-brand-label"
          options={channels}
          value={channelIds}
          disabled={loadingOptions}
          placeholder="選擇品牌（可多選）"
          searchPlaceholder="搜尋品牌"
          emptyLabel="沒有符合的品牌"
          onChange={(value) => {
            setChannelIds(value);
            setError(null);
          }}
        />

        <DateRangePicker
          startId="kitchen-festival-range-start"
          endId="kitchen-festival-range-end"
          startValue={rangeStart}
          endValue={rangeEnd}
          onStartChange={setRangeStart}
          onEndChange={setRangeEnd}
          startLabel="開始日期"
          endLabel="結束日期"
          legend="日期範圍"
          disabled={loadingOptions}
        />

        <label className="ingredients-field">
          <span>節日</span>
          <select value={festivalId} disabled={loadingOptions} onChange={(event) => setFestivalId(event.target.value)}>
            <option value="">選擇節日</option>
            {festivals.map((festival) => <option key={festival.id} value={festival.id}>{festival.name}</option>)}
          </select>
        </label>
        <label className="ingredients-field">
          <span>金額</span>
          <div className="kitchen-cost-money-input">
            <span aria-hidden="true">HK$</span>
            <input type="number" min="0" step="0.01" value={amount} placeholder="輸入金額" aria-label="金額（港幣）" onChange={(event) => setAmount(event.target.value)} />
          </div>
        </label>
        <label className="ingredients-field">
          <span>備註</span>
          <textarea value={remarks} placeholder="備註" onChange={(event) => setRemarks(event.target.value)} />
        </label>
        {error ? <p className="ingredients-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function KitchenMonthlyFestivalCosts({ canEdit }: { canEdit: boolean }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<KitchenFestivalCostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; remarks: string }>>({});
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenMonthlyFestivalCosts({ page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotal(result.total);
        setDrafts((current) => {
          const next = { ...current };
          for (const row of result.items) next[row.id] ??= { amount: String(row.amount), remarks: row.remarks };
          return next;
        });
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取節日營運費用失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, reloadKey]);

  const changeDraft = (id: string, field: "amount" | "remarks", value: string) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? { amount: "", remarks: "" }), [field]: value } }));
    setError(null);
  };

  const saveRow = async (id: string, amountValue: string, remarks: string) => {
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount < 0) return setError("請輸入有效金額");
    setError(null);
    try {
      await updateKitchenMonthlyFestivalCosts([{ id, amount, remarks }]);
      setRows((current) => current.map((row) => row.id === id ? { ...row, amount, remarks } : row));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存節日營運費用失敗");
    }
  };

  const remove = async (row: KitchenFestivalCostRow) => {
    if (!window.confirm(`確定刪除 ${row.festivalName} 的營運費用記錄？`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteKitchenMonthlyCost(row.id);
      const nextTotalPages = Math.max(1, Math.ceil(Math.max(0, total - 1) / PAGE_SIZE));
      if (page > nextTotalPages) setPage(nextTotalPages); else setReloadKey((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除節日營運費用失敗");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <article className="panel ingredients-panel kitchen-monthly-cost-panel" id="kitchen-cost-panel-monthly-festival" role="tabpanel" aria-labelledby="kitchen-cost-tab-monthly-festival">
      <header className="kitchen-monthly-cost-toolbar kitchen-festival-cost-toolbar">
        {canEdit ? <div className="kitchen-monthly-cost-actions">
          <Button variant="outline" onClick={() => setAddPanelOpen(true)}><Plus />新增輸入資料</Button>
        </div> : null}
      </header>
      {error ? <div className="list-inline-error" role="alert"><span>{error}</span><Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重試</Button></div> : null}
      <ListTable className="kitchen-monthly-cost-table-wrap" tableClassName="kitchen-monthly-cost-table kitchen-festival-cost-table" loading={loading} loadingLabel="正在載入節日營運費用" skeletonRows={PAGE_SIZE} skeletonColumns={7} onRefresh={() => setReloadKey((value) => value + 1)} header={<tr><th>日期</th><th>節日</th><th>品牌</th><th>費用類別</th><th>金額</th><th>備註</th><th>操作</th></tr>}>
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { amount: String(row.amount), remarks: row.remarks };
          return <tr key={row.id}>
            <td><strong>{shortDate(row.rangeStart)} ～ {shortDate(row.rangeEnd)}</strong></td>
            <td>{row.festivalName}</td>
            <td className="kitchen-monthly-cost-brands">{row.channelNames.join(", ") || "—"}</td>
            <td><strong>{row.costTypeName}</strong></td>
            <td>{canEdit ? <div className="kitchen-cost-record-amount"><span>HK$</span><input type="number" min="0" step="0.01" value={draft.amount} aria-label={`${row.costTypeName}節日金額`} onChange={(event) => changeDraft(row.id, "amount", event.target.value)} onBlur={(event) => void saveRow(row.id, event.currentTarget.value, draft.remarks)} /></div> : `HK$${row.amount.toLocaleString("zh-HK", { maximumFractionDigits: 2 })}`}</td>
            <td>{canEdit ? <input className="kitchen-monthly-cost-remarks" value={draft.remarks} title={draft.remarks} placeholder="備註" aria-label={`${row.costTypeName}節日備註`} onChange={(event) => changeDraft(row.id, "remarks", event.target.value)} onBlur={(event) => void saveRow(row.id, draft.amount, event.currentTarget.value)} /> : row.remarks || "—"}</td>
            <td>{canEdit ? <Button type="button" variant="destructive" size="icon" disabled={deletingId === row.id} aria-label="刪除節日營運費用記錄" onClick={() => void remove(row)}><Trash2 /></Button> : null}</td>
          </tr>;
        })}
        {!loading && rows.length === 0 ? <tr><td colSpan={7} className="kitchen-cost-empty">暫時沒有節日營運費用。</td></tr> : null}
      </ListTable>
      <TablePagination summary={`顯示 ${total ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)}，共 ${total} 筆`} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} onPageChange={setPage} previousLabel="上一頁" nextLabel="下一頁" pageLabel="/" jumpLabel="跳至頁面" />
      <AddFestivalCostPanel open={addPanelOpen} onClose={() => setAddPanelOpen(false)} onSaved={() => { setPage(1); setReloadKey((value) => value + 1); }} />
    </article>
  );
}
