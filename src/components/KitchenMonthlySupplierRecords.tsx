import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListTable } from "@/components/ui/list-table";
import { MultiSelect } from "@/components/ui/multi-select";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  deleteKitchenSupplierCostEntry,
  fetchKitchenSupplierCostEntries,
  fetchKitchenSupplierOptions,
  fetchKitchenSupplierPurchaseTypes,
  fetchKitchenSupplierRecords,
  saveKitchenSupplierRecord,
  updateKitchenSupplierCostEntry,
  type KitchenSupplierCostEntry,
  type KitchenSupplierOption,
  type KitchenSupplierPurchaseType,
  type KitchenSupplierRecord,
  type KitchenSupplierRecordFilters,
} from "@/lib/kitchen-supplier-records";

const MAIN_ROW_LIMIT = 100;

function formatRecordDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatFilterDate(filters: KitchenSupplierRecordFilters) {
  if (filters.mode === "single" && filters.singleDate) return formatRecordDate(filters.singleDate);
  if (filters.mode === "range") {
    if (filters.startDate && filters.endDate) {
      return `${formatRecordDate(filters.startDate)} ～ ${formatRecordDate(filters.endDate)}`;
    }
    if (filters.startDate) return `${formatRecordDate(filters.startDate)}起`;
    if (filters.endDate) return `截至${formatRecordDate(filters.endDate)}`;
  }
  return "未篩選日期";
}

function currency(value: number) {
  return `HK$${value.toLocaleString("zh-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function SupplierRecordPanel({
  open,
  editing,
  suppliers,
  purchaseTypes,
  loadingOptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: KitchenSupplierRecord | null;
  suppliers: KitchenSupplierOption[];
  purchaseTypes: KitchenSupplierPurchaseType[];
  loadingOptions: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? "");
    setSupplierId(editing?.supplierId ?? "");
    setAmounts(Object.fromEntries(
      purchaseTypes.map((type) => [
        type.id,
        String(editing?.categories.find((category) => category.id === type.id)?.amount ?? 0),
      ]),
    ));
    setError(null);
  }, [editing, open, purchaseTypes]);

  const total = useMemo(
    () => purchaseTypes.reduce((sum, type) => sum + (Number(amounts[type.id]) || 0), 0),
    [amounts, purchaseTypes],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!date) return setError("請選擇日期");
    if (!supplierId) return setError("請選擇供應商");
    const values = purchaseTypes.map((type) => ({
      purchaseTypeId: type.id,
      amount: Number(amounts[type.id] ?? 0),
    }));
    if (values.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) {
      return setError("請輸入有效金額");
    }
    setSaving(true);
    setError(null);
    try {
      await saveKitchenSupplierRecord({
        date,
        supplierId,
        amounts: values,
        original: editing?.date ? { date: editing.date, supplierId: editing.supplierId } : null,
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存月結供應商記錄失敗");
    } finally {
      setSaving(false);
    }
  };

  const readyForAmounts = Boolean(date && supplierId);

  return (
    <SidePanel
      open={open}
      title={editing ? "編輯月結供應商記錄" : "新增月結供應商記錄"}
      onClose={onClose}
      closeLabel="關閉月結供應商記錄側欄"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" form="kitchen-supplier-record-form" disabled={saving || loadingOptions || !readyForAmounts}>
            {saving ? "儲存中…" : "確定"}
          </Button>
        </>
      }
    >
      <form id="kitchen-supplier-record-form" className="ingredients-form" onSubmit={(event) => void submit(event)}>
        <label className="ingredients-field">
          <span>日期</span>
          <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} />
        </label>
        <label className="ingredients-field">
          <span>供應商</span>
          <select value={supplierId} disabled={loadingOptions} onChange={(event) => { setSupplierId(event.target.value); setError(null); }}>
            <option value="">選擇供應商</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>

        {readyForAmounts ? (
          <section className="kitchen-supplier-category-form" aria-label="供應商費用分類">
            <div className="kitchen-supplier-category-form-heading"><strong>分類</strong><strong>金額</strong></div>
            {purchaseTypes.map((type) => (
              <label key={type.id}>
                <span>{type.name}</span>
                <div className="kitchen-cost-money-input">
                  <span aria-hidden="true">HK$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amounts[type.id] ?? "0"}
                    aria-label={`${type.name}金額`}
                    onChange={(event) => {
                      setAmounts((current) => ({ ...current, [type.id]: event.target.value }));
                      setError(null);
                    }}
                  />
                </div>
              </label>
            ))}
            <div className="kitchen-supplier-category-total"><strong>總數</strong><strong>{currency(total)}</strong></div>
          </section>
        ) : (
          <p className="kitchen-supplier-form-hint">請先選擇日期及供應商，再填寫費用分類。</p>
        )}
        {error ? <p className="ingredients-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

function SupplierCostEntriesPanel({
  open,
  filters,
  onClose,
  onChanged,
}: {
  open: boolean;
  filters: KitchenSupplierRecordFilters;
  onClose: () => void;
  onChanged: () => void;
}) {
  const editorPageSize = 20;
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<KitchenSupplierCostEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / editorPageSize));

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenSupplierCostEntries({ filters, page, pageSize: editorPageSize })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotal(result.total);
        setDrafts(Object.fromEntries(result.items.map((row) => [row.id, String(row.amount)])));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取供應商費用記錄失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, open, page, reloadKey]);

  useEffect(() => {
    if (open) setPage(1);
  }, [filters, open]);

  const saveAmount = async (row: KitchenSupplierCostEntry, value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return setError("請輸入有效金額");
    if (amount === row.amount) return;
    setError(null);
    try {
      await updateKitchenSupplierCostEntry(row.id, amount);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, amount } : item));
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存供應商費用失敗");
    }
  };

  const remove = async (row: KitchenSupplierCostEntry) => {
    if (!window.confirm(`確定刪除 ${formatRecordDate(row.date)}「${row.supplierName}」的 ${row.purchaseTypeName} 費用？`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteKitchenSupplierCostEntry(row.id);
      const nextTotal = Math.max(0, total - 1);
      const nextPages = Math.max(1, Math.ceil(nextTotal / editorPageSize));
      if (page > nextPages) setPage(nextPages);
      else setReloadKey((value) => value + 1);
      onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除供應商費用失敗");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SidePanel
      open={open}
      title="編輯費用記錄"
      description="金額修改完成後會自動儲存。"
      onClose={onClose}
      closeLabel="關閉編輯費用記錄側欄"
      className="side-panel-majority kitchen-supplier-entry-panel"
    >
      {error ? <div className="list-inline-error" role="alert"><span>{error}</span><Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重試</Button></div> : null}
      <ListTable
        className="kitchen-supplier-entry-table-wrap"
        tableClassName="kitchen-supplier-entry-table"
        loading={loading}
        loadingLabel="正在載入供應商費用記錄"
        skeletonRows={editorPageSize}
        skeletonColumns={5}
        onRefresh={() => setReloadKey((value) => value + 1)}
        header={<tr><th>日期</th><th>供應商</th><th>分類</th><th>金額</th><th>操作</th></tr>}
      >
        {rows.map((row) => (
          <tr key={row.id}>
            <td><strong>{formatRecordDate(row.date)}</strong></td>
            <td>{row.supplierName}</td>
            <td><strong>{row.purchaseTypeName}</strong></td>
            <td>
              <div className="kitchen-cost-record-amount">
                <span>HK$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={drafts[row.id] ?? String(row.amount)}
                  aria-label={`${row.supplierName}${row.purchaseTypeName}金額`}
                  onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                  onBlur={(event) => void saveAmount(row, event.currentTarget.value)}
                />
              </div>
            </td>
            <td className="table-actions-cell">
              <Button type="button" size="icon" variant="destructive" disabled={deletingId === row.id} aria-label="刪除供應商費用記錄" onClick={() => void remove(row)}><Trash2 /></Button>
            </td>
          </tr>
        ))}
        {!loading && rows.length === 0 ? <tr><td colSpan={5} className="kitchen-cost-empty">沒有符合篩選條件的費用記錄。</td></tr> : null}
      </ListTable>
      <TablePagination
        summary={`顯示 ${total ? (page - 1) * editorPageSize + 1 : 0}–${Math.min(page * editorPageSize, total)}，共 ${total} 筆`}
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

export function KitchenMonthlySupplierRecords({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<KitchenSupplierRecordFilters>({
    mode: "range",
    singleDate: "",
    startDate: "",
    endDate: "",
    supplierIds: [],
  });
  const [rows, setRows] = useState<KitchenSupplierRecord[]>([]);
  const [suppliers, setSuppliers] = useState<KitchenSupplierOption[]>([]);
  const [purchaseTypes, setPurchaseTypes] = useState<KitchenSupplierPurchaseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [entriesPanelOpen, setEntriesPanelOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);
    void Promise.all([fetchKitchenSupplierOptions(), fetchKitchenSupplierPurchaseTypes()])
      .then(([supplierItems, typeItems]) => {
        if (!active) return;
        setSuppliers(supplierItems);
        setPurchaseTypes(typeItems);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取供應商選項失敗");
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchKitchenSupplierRecords({ filters, page: 1, pageSize: MAIN_ROW_LIMIT })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "讀取月結供應商記錄失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, reloadKey]);

  const updateFilters = (next: Partial<KitchenSupplierRecordFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  };

  const openNew = () => {
    setPanelOpen(true);
  };

  return (
    <article className="panel ingredients-panel kitchen-monthly-cost-panel kitchen-supplier-record-panel" id="kitchen-cost-panel-monthly-suppliers" role="tabpanel" aria-labelledby="kitchen-cost-tab-monthly-suppliers">
      <header className="kitchen-supplier-record-toolbar">
        <div className="kitchen-supplier-record-filters">
          <label>
            <span>日期模式</span>
            <select value={filters.mode} onChange={(event) => updateFilters({ mode: event.target.value as "single" | "range" })}>
              <option value="single">單日</option>
              <option value="range">多日</option>
            </select>
          </label>
          {filters.mode === "single" ? (
            <label>
              <span>日期</span>
              <input type="date" value={filters.singleDate} onChange={(event) => updateFilters({ singleDate: event.target.value })} />
            </label>
          ) : (
            <DateRangePicker
              startId="kitchen-supplier-filter-start"
              endId="kitchen-supplier-filter-end"
              startValue={filters.startDate}
              endValue={filters.endDate}
              onStartChange={(value) => updateFilters({ startDate: value })}
              onEndChange={(value) => updateFilters({ endDate: value })}
              startLabel="開始日期"
              endLabel="結束日期"
              legend="日期範圍"
            />
          )}
          <label className="kitchen-supplier-filter-select">
            <span id="kitchen-supplier-filter-label">供應商</span>
            <MultiSelect
              id="kitchen-supplier-filter-select"
              labelledBy="kitchen-supplier-filter-label"
              options={suppliers}
              value={filters.supplierIds}
              disabled={loadingOptions}
              placeholder={t("kitchenMonthlySupplierRecords.supplierPlaceholder")}
              searchPlaceholder={t("kitchenMonthlySupplierRecords.supplierSearchPlaceholder")}
              emptyLabel="沒有符合的供應商"
              onChange={(supplierIds) => updateFilters({ supplierIds })}
            />
          </label>
        </div>
        {canEdit ? <div className="kitchen-monthly-cost-actions">
          <Button variant="outline" onClick={() => setEntriesPanelOpen(true)}><Pencil />編輯費用記錄</Button>
          <Button onClick={openNew}><Plus />新增記錄</Button>
        </div> : null}
      </header>

      {error ? <div className="list-inline-error" role="alert"><span>{error}</span><Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重試</Button></div> : null}

      <ListTable
        className="kitchen-monthly-cost-table-wrap"
        tableClassName="kitchen-supplier-record-table"
        loading={loading}
        loadingLabel="正在載入月結供應商記錄"
        skeletonRows={8}
        skeletonColumns={4}
        onRefresh={() => setReloadKey((value) => value + 1)}
        header={<tr><th>日期</th><th>供應商</th><th>分類</th><th>總額</th></tr>}
      >
        {rows.map((row) => {
          const key = `${row.date}:${row.supplierId}`;
          return (
            <tr key={key}>
              <td><strong>{formatFilterDate(filters)}</strong></td>
              <td><strong>{row.supplierName}</strong></td>
              <td>
                <div className="kitchen-supplier-category-list">
                  {purchaseTypes.map((type) => {
                    const amount = row.categories.find((category) => category.id === type.id)?.amount ?? 0;
                    return <div key={type.id}><span>{type.name}</span><strong>{currency(amount)}</strong></div>;
                  })}
                </div>
              </td>
              <td><strong>{currency(row.total)}</strong></td>
            </tr>
          );
        })}
        {!loading && rows.length === 0 ? <tr><td colSpan={4} className="kitchen-cost-empty">沒有符合篩選條件的月結供應商記錄。</td></tr> : null}
      </ListTable>

      <SupplierRecordPanel
        open={panelOpen}
        editing={null}
        suppliers={suppliers}
        purchaseTypes={purchaseTypes}
        loadingOptions={loadingOptions}
        onClose={() => setPanelOpen(false)}
        onSaved={() => {
          setPanelOpen(false);
          setReloadKey((value) => value + 1);
        }}
      />
      <SupplierCostEntriesPanel
        open={entriesPanelOpen}
        filters={filters}
        onClose={() => setEntriesPanelOpen(false)}
        onChanged={() => setReloadKey((value) => value + 1)}
      />
    </article>
  );
}
