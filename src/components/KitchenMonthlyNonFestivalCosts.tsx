import { useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  createKitchenMonthlyNonFestivalCost,
  deleteKitchenMonthlyCost,
  fetchKitchenMonthlyNonFestivalCosts,
  fetchKitchenMonthlyCostTypes,
  updateKitchenMonthlyNonFestivalCosts,
  type KitchenMonthlyCostType,
  type KitchenMonthlyCostRow,
} from "@/lib/kitchen-monthly-costs";

const PAGE_SIZE = 15;

function currentHongKongMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}`;
}

function monthDetails(timestamp: string | null) {
  if (!timestamp) return { month: "—", quarter: "—" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(timestamp));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!year || !month) return { month: "—", quarter: "—" };
  return {
    month: `${String(year).slice(-2)}年${month}月`,
    quarter: `Q${Math.ceil(month / 3)}`,
  };
}

function AddMonthlyNonFestivalCostPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const maximumMonth = currentHongKongMonth();
  const [costTypes, setCostTypes] = useState<KitchenMonthlyCostType[]>([]);
  const [costTypeId, setCostTypeId] = useState("");
  const [month, setMonth] = useState(maximumMonth);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || costTypes.length > 0) return;
    let active = true;
    setLoadingTypes(true);
    void fetchKitchenMonthlyCostTypes()
      .then((items) => {
        if (active) setCostTypes(items);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取費用類型失敗");
      })
      .finally(() => {
        if (active) setLoadingTypes(false);
      });
    return () => {
      active = false;
    };
  }, [costTypes.length, open]);

  const resetAndClose = () => {
    setCostTypeId("");
    setMonth(maximumMonth);
    setAmount("");
    setRemarks("");
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const costType = costTypes.find((item) => item.id === costTypeId);
    const numericAmount = Number(amount);
    if (!costType) {
      setError("請選擇費用類型");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month) || month > maximumMonth) {
      setError("月份只能選擇目前月份或過往月份");
      return;
    }
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError("請輸入有效金額");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createKitchenMonthlyNonFestivalCost({
        costType,
        month,
        amount: numericAmount,
        remarks,
      });
      resetAndClose();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "新增每月營運費用失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title="每月營運費用（非節日）輸入"
      description="此部份數據將展示在 P&L 報告"
      onClose={resetAndClose}
      closeLabel="關閉每月營運費用輸入側欄"
      className="kitchen-monthly-cost-add-panel"
      footer={
        <>
          <Button type="button" variant="outline" onClick={resetAndClose}>取消</Button>
          <Button type="submit" form="monthly-non-festival-cost-form" disabled={saving || loadingTypes}>
            {saving ? "儲存中…" : "確定"}
          </Button>
        </>
      }
    >
      <form
        id="monthly-non-festival-cost-form"
        className="ingredients-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="ingredients-field">
          <span>類型</span>
          <select value={costTypeId} disabled={loadingTypes} onChange={(event) => setCostTypeId(event.target.value)}>
            <option value="">{loadingTypes ? "正在載入費用…" : "選擇費用"}</option>
            {costTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>
        <label className="ingredients-field">
          <span>月份</span>
          <input
            type="month"
            max={maximumMonth}
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setError(null);
            }}
          />
          <small>只可選擇目前月份或過往月份</small>
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
              placeholder="輸入金額"
              aria-label="金額（港幣）"
              onChange={(event) => setAmount(event.target.value)}
            />
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

export function KitchenMonthlyNonFestivalCosts({ canEdit }: { canEdit: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMonth = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
    ? searchParams.get("month")
    : null;
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<KitchenMonthlyCostRow[]>([]);
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
    void fetchKitchenMonthlyNonFestivalCosts({ page: selectedMonth ? 1 : page, pageSize: selectedMonth ? 500 : PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        const items = selectedMonth
          ? result.items.filter((row) => row.monthAt?.slice(0, 7) === selectedMonth)
          : result.items;
        setRows(items);
        setTotal(selectedMonth ? items.length : result.total);
        setDrafts((current) => {
          const next = { ...current };
          for (const row of items) {
            next[row.id] ??= { amount: String(row.amount), remarks: row.remarks };
          }
          return next;
        });
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取每月營運費用失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, reloadKey, selectedMonth]);

  const changeDraft = (id: string, field: "amount" | "remarks", value: string) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { amount: "", remarks: "" }), [field]: value },
    }));
    setError(null);
  };

  const saveRow = async (id: string, amountValue: string, remarks: string) => {
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("請輸入有效金額");
      return;
    }
    setError(null);
    try {
      await updateKitchenMonthlyNonFestivalCosts([{ id, amount, remarks }]);
      setRows((current) => current.map((row) => (
        row.id === id ? { ...row, amount, remarks } : row
      )));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存每月營運費用失敗");
    }
  };

  const remove = async (row: KitchenMonthlyCostRow) => {
    if (!window.confirm(`確定刪除 ${row.costTypeName} 的營運費用記錄？`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteKitchenMonthlyCost(row.id);
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      const nextTotal = Math.max(0, total - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      if (page > nextTotalPages) setPage(nextTotalPages);
      else setReloadKey((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除每月營運費用失敗");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <article
      className="panel ingredients-panel kitchen-monthly-cost-panel"
      id="kitchen-cost-panel-monthly-non-festival"
      role="tabpanel"
      aria-labelledby="kitchen-cost-tab-monthly-non-festival"
    >
      <header className="kitchen-monthly-cost-toolbar has-pnl-notice">
        <p className="kitchen-monthly-cost-pnl-notice">
          此部份數據將展示在 P&amp;L 報告
        </p>
        <label className="kitchen-monthly-cost-month-filter">
          <span>篩選月份</span>
          <input
            type="month"
            max={currentHongKongMonth()}
            value={selectedMonth ?? ""}
            aria-label="篩選月份"
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set("month", event.target.value);
              else next.delete("month");
              setPage(1);
              setSearchParams(next);
            }}
          />
        </label>
        {canEdit ? (
          <div className="kitchen-monthly-cost-actions">
            <Button variant="outline" onClick={() => setAddPanelOpen(true)}>
              <Plus />新增輸入資料
            </Button>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="list-inline-error" role="alert">
          <span>{error}</span>
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw />重試
          </Button>
        </div>
      ) : null}

      <ListTable
        className="kitchen-monthly-cost-table-wrap"
        tableClassName="kitchen-monthly-cost-table"
        loading={loading}
        loadingLabel="正在載入每月營運費用"
        skeletonRows={PAGE_SIZE}
        skeletonColumns={7}
        onRefresh={() => setReloadKey((value) => value + 1)}
        header={
          <tr>
            <th>月份</th>
            <th>年度季度</th>
            <th>品牌</th>
            <th>費用類別</th>
            <th>金額</th>
            <th>備註</th>
            <th>操作</th>
          </tr>
        }
      >
        {rows.map((row) => {
          const date = monthDetails(row.monthAt);
          const draft = drafts[row.id] ?? { amount: String(row.amount), remarks: row.remarks };
          return (
            <tr key={row.id}>
              <td><strong>{date.month}</strong></td>
              <td>{date.quarter}</td>
              <td className="kitchen-monthly-cost-brands">{row.channelNames.join(", ") || "—"}</td>
              <td><strong>{row.costTypeName}</strong></td>
              <td>
                {canEdit ? (
                  <div className="kitchen-cost-record-amount">
                    <span>HK$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.amount}
                      aria-label={`${row.costTypeName}金額`}
                      onChange={(event) => changeDraft(row.id, "amount", event.target.value)}
                      onBlur={(event) => void saveRow(row.id, event.currentTarget.value, draft.remarks)}
                    />
                  </div>
                ) : `HK$${row.amount.toLocaleString("zh-HK", { maximumFractionDigits: 2 })}`}
              </td>
              <td>
                {canEdit ? (
                  <input
                    className="kitchen-monthly-cost-remarks"
                    value={draft.remarks}
                    title={draft.remarks}
                    placeholder="備註"
                    aria-label={`${row.costTypeName}備註`}
                    onChange={(event) => changeDraft(row.id, "remarks", event.target.value)}
                    onBlur={(event) => void saveRow(row.id, draft.amount, event.currentTarget.value)}
                  />
                ) : row.remarks || "—"}
              </td>
              <td>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={deletingId === row.id}
                    aria-label="刪除營運費用記錄"
                    onClick={() => void remove(row)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </td>
            </tr>
          );
        })}
        {!loading && rows.length === 0 ? (
          <tr><td colSpan={7} className="kitchen-cost-empty">暫時沒有非節日營運費用。</td></tr>
        ) : null}
      </ListTable>

      <TablePagination
        summary={`顯示 ${total ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)}，共 ${total} 筆`}
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
      <AddMonthlyNonFestivalCostPanel
        open={addPanelOpen}
        onClose={() => setAddPanelOpen(false)}
        onSaved={() => {
          setPage(1);
          setReloadKey((value) => value + 1);
        }}
      />
    </article>
  );
}
