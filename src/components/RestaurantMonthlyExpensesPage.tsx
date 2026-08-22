import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, CheckCircle2, CircleDollarSign, Eye, Pencil, Save, Search, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { PdfAutoResizeTextarea } from "@/components/PdfAutoResizeTextarea";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import {
  emptyRestaurantMonthlyExpenseRecord,
  deleteRestaurantMonthlyExpense,
  fetchRecentRestaurantMonthlyExpenses,
  fetchRestaurantMonthlyExpense,
  fetchRestaurantMonthlyExpenseMasters,
  restaurantMonthlyExpenseExists,
  saveRestaurantMonthlyExpense,
  setRestaurantMonthlyExpensePnlStatus,
  type RestaurantMonthlyExpenseRecord,
} from "@/lib/restaurant-monthly-expenses";
import { cn } from "@/lib/utils";

type TextValues = Record<string, string>;

function money(value: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
  }).format(value).replace("HK$", "$");
}

function numberValue(value: string | undefined) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentHongKongMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
}

function toTextValues(values: Record<string, number>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ? String(value) : ""]));
}

function RestaurantMonthlyExpensesSkeleton({ label }: { label: string }) {
  return (
    <section className="restaurant-monthly-expenses-page monthly-expenses-page-skeleton" aria-busy="true">
      <span className="sr-only" role="status">{label}</span>
      <header className="page-heading monthly-expenses-heading" aria-hidden="true">
        <div className="monthly-expenses-skeleton-heading">
          <span className="page-skeleton-bone monthly-expenses-skeleton-eyebrow" />
          <span className="page-skeleton-bone monthly-expenses-skeleton-title" />
          <span className="page-skeleton-bone monthly-expenses-skeleton-description" />
        </div>
        <span className="page-skeleton-bone monthly-expenses-skeleton-button" />
      </header>
      <div className="monthly-expenses-workspace" aria-hidden="true">
        <aside className="panel monthly-expenses-history">
          <div className="monthly-expenses-skeleton-search">
            <span className="page-skeleton-bone" />
            <span className="page-skeleton-bone" />
          </div>
          <div className="monthly-expenses-skeleton-history-list">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index}>
                <span className="page-skeleton-bone" />
                <span className="page-skeleton-bone" />
                <span className="page-skeleton-bone" />
              </div>
            ))}
          </div>
        </aside>
        <main className="monthly-expenses-editor">
          <section className="panel monthly-expenses-empty monthly-expenses-skeleton-empty">
            <span className="page-skeleton-bone monthly-expenses-skeleton-empty-icon" />
            <span className="page-skeleton-bone monthly-expenses-skeleton-empty-title" />
            <span className="page-skeleton-bone monthly-expenses-skeleton-empty-copy" />
          </section>
        </main>
      </div>
    </section>
  );
}

export function RestaurantMonthlyExpensesPage({
  loadMasters = fetchRestaurantMonthlyExpenseMasters,
  loadRecent = fetchRecentRestaurantMonthlyExpenses,
  loadRecord = fetchRestaurantMonthlyExpense,
  checkRecordExists = restaurantMonthlyExpenseExists,
  saveRecord = saveRestaurantMonthlyExpense,
  setPnlStatus = setRestaurantMonthlyExpensePnlStatus,
  deleteRecord = deleteRestaurantMonthlyExpense,
  canEdit: canEditOverride,
}: {
  loadMasters?: typeof fetchRestaurantMonthlyExpenseMasters;
  loadRecent?: typeof fetchRecentRestaurantMonthlyExpenses;
  loadRecord?: typeof fetchRestaurantMonthlyExpense;
  checkRecordExists?: typeof restaurantMonthlyExpenseExists;
  saveRecord?: typeof saveRestaurantMonthlyExpense;
  setPnlStatus?: typeof setRestaurantMonthlyExpensePnlStatus;
  deleteRecord?: typeof deleteRestaurantMonthlyExpense;
  canEdit?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = canEditOverride ?? access.canAccess("restaurant.monthly_expenses.edit");
  const [masters, setMasters] = useState<Awaited<ReturnType<typeof loadMasters>> | null>(null);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof loadRecent>>>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [month, setMonth] = useState("");
  const [amounts, setAmounts] = useState<TextValues>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [canProceedPnl, setCanProceedPnl] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [draftRestaurantId, setDraftRestaurantId] = useState("");
  const [draftMonth, setDraftMonth] = useState("");
  const [checkingNewRecord, setCheckingNewRecord] = useState(false);
  const [newRecordExists, setNewRecordExists] = useState(false);
  const [newRecordCheckError, setNewRecordCheckError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatingPnl, setUpdatingPnl] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const applyRecord = (record: RestaurantMonthlyExpenseRecord) => {
    setAmounts(toTextValues(record.amounts));
    setRemarks(record.remarks);
    setCanProceedPnl(record.canProceedPnl);
  };

  const refreshRecent = async () => {
    const items = await loadRecent();
    setRecent(items);
    return items;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([loadMasters(), loadRecent()])
      .then(([nextMasters, nextRecent]) => {
        if (!active) return;
        setMasters(nextMasters);
        setRecent(nextRecent);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "load_failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadMasters, loadRecent]);

  useEffect(() => {
    if (!newDialogOpen || !draftRestaurantId || !draftMonth) {
      setNewRecordExists(false);
      setNewRecordCheckError(false);
      return;
    }
    let active = true;
    const knownExisting = recent.some((item) => item.restaurantId === draftRestaurantId && item.month === draftMonth);
    if (knownExisting) {
      setNewRecordExists(true);
      setNewRecordCheckError(false);
      setCheckingNewRecord(false);
      return () => { active = false; };
    }
    setCheckingNewRecord(true);
    setNewRecordCheckError(false);
    void checkRecordExists(draftRestaurantId, draftMonth)
      .then((exists) => { if (active) setNewRecordExists(exists); })
      .catch(() => {
        if (!active) return;
        setNewRecordExists(false);
        setNewRecordCheckError(true);
      })
      .finally(() => { if (active) setCheckingNewRecord(false); });
    return () => { active = false; };
  }, [checkRecordExists, draftMonth, draftRestaurantId, newDialogOpen, recent]);

  const selectedRestaurant = masters?.restaurants.find((restaurant) => restaurant.id === restaurantId) ?? null;
  const monthLabel = useMemo(() => month ? new Intl.DateTimeFormat(i18n.language, {
    year: "numeric",
    month: "long",
  }).format(new Date(`${month}-15T12:00:00+08:00`)) : "", [i18n.language, month]);
  const filteredRecent = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return recent;
    return recent.filter((item) => `${item.restaurantName} ${item.month}`.toLocaleLowerCase().includes(query));
  }, [recent, search]);
  const groupedCosts = useMemo(() => {
    const groups: Array<{ name: string; items: NonNullable<typeof masters>["costs"] }> = [];
    for (const cost of masters?.costs ?? []) {
      const last = groups.at(-1);
      if (!last || last.name !== cost.categoryName) groups.push({ name: cost.categoryName, items: [cost] });
      else last.items.push(cost);
    }
    return groups;
  }, [masters]);
  const total = (masters?.costs ?? []).reduce((sum, cost) => sum + numberValue(amounts[cost.id]), 0);
  const isEditing = isNew || editing;

  const selectRecord = async (nextRestaurantId: string, nextMonth: string) => {
    setRestaurantId(nextRestaurantId);
    setMonth(nextMonth);
    setIsNew(false);
    setEditing(false);
    setSaved(false);
    setError(null);
    setLoadingRecord(true);
    try {
      applyRecord(await loadRecord(nextRestaurantId, nextMonth));
    } catch (loadError) {
      applyRecord(emptyRestaurantMonthlyExpenseRecord());
      setError(loadError instanceof Error ? loadError.message : "load_failed");
    } finally {
      setLoadingRecord(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || !isEditing || !restaurantId || !month || !masters) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveRecord({
        restaurantId,
        month,
        costs: masters.costs,
        amounts: Object.fromEntries(masters.costs.map((cost) => [cost.id, numberValue(amounts[cost.id])])),
        remarks,
        canProceedPnl,
      });
      await refreshRecent();
      setIsNew(false);
      setEditing(false);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const changePnlStatus = async (nextStatus: boolean) => {
    if (!restaurantId || !month || isNew || isEditing || !canEdit) return;
    setUpdatingPnl(true);
    setSaved(false);
    setError(null);
    try {
      await setPnlStatus(restaurantId, month, nextStatus);
      setCanProceedPnl(nextStatus);
      await refreshRecent();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "pnl_status_failed");
    } finally {
      setUpdatingPnl(false);
    }
  };

  const removeRecord = async (item: (typeof recent)[number]) => {
    const key = `${item.restaurantId}:${item.month}`;
    if (deletingKey || !canEdit || !window.confirm(t("restaurantMonthlyExpenses.deleteConfirm", {
      restaurant: item.restaurantName,
      month: item.month,
    }))) return;
    setDeletingKey(key);
    setError(null);
    try {
      await deleteRecord(item.restaurantId, item.month);
      setRecent((current) => current.filter((record) => `${record.restaurantId}:${record.month}` !== key));
      if (restaurantId === item.restaurantId && month === item.month && !isNew) {
        setRestaurantId("");
        setMonth("");
        setAmounts({});
        setRemarks({});
        setCanProceedPnl(false);
        setEditing(false);
        setSaved(false);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "delete_failed");
    } finally {
      setDeletingKey(null);
    }
  };

  if (loading) return <RestaurantMonthlyExpensesSkeleton label={t("restaurantMonthlyExpenses.loading")} />;

  return (
    <section className="restaurant-monthly-expenses-page">
      <header className="page-heading monthly-expenses-heading">
        <div>
          <span className="eyebrow">{t("navigation.restaurant")}</span>
          <h1>{t("restaurantMonthlyExpenses.title")}</h1>
          <p>{t("restaurantMonthlyExpenses.description")}</p>
        </div>
        <Button variant="outline" disabled={!canEdit} onClick={() => {
          const defaultRestaurant = masters?.restaurants.find((restaurant) => /將軍澳|将军澳|\bTKO\b/i.test(restaurant.name));
          setDraftRestaurantId(defaultRestaurant?.id ?? "");
          setDraftMonth(currentHongKongMonth());
          setNewRecordExists(false);
          setNewDialogOpen(true);
        }}><CalendarDays />{t("restaurantMonthlyExpenses.newRecord")}</Button>
      </header>

      {error ? <div className="monthly-expenses-message is-error" role="alert">{t("restaurantMonthlyExpenses.operationError")}</div> : null}

      <form className="monthly-expenses-workspace" onSubmit={submit}>
        <aside className="panel monthly-expenses-history">
          <label className="monthly-expenses-search">
            <span>{t("restaurantMonthlyExpenses.search")}</span>
            <div><Search aria-hidden="true" /><input aria-label={t("restaurantMonthlyExpenses.search")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("restaurantMonthlyExpenses.searchPlaceholder")} /></div>
          </label>
          <div className="monthly-expenses-history-list">
            {filteredRecent.length ? filteredRecent.map((item) => {
              const key = `${item.restaurantId}:${item.month}`;
              const active = item.restaurantId === restaurantId && item.month === month && !isNew;
              const modifiedAt = item.modifiedAt ? new Intl.DateTimeFormat(i18n.language, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(item.modifiedAt)) : t("restaurantMonthlyExpenses.unknownEditTime");
              return (
                <div key={key} className={cn("monthly-expenses-history-item", active && "active")}>
                  <button
                    type="button"
                    className="monthly-expenses-history-record"
                    onClick={() => void selectRecord(item.restaurantId, item.month)}
                  >
                    <span>{item.restaurantName}</span>
                    <strong>{item.month}</strong>
                    <small>{money(item.total)} · {item.canProceedPnl ? t("restaurantMonthlyExpenses.generated") : t("restaurantMonthlyExpenses.draft")}</small>
                    <small className="monthly-expenses-history-updated">{t("restaurantMonthlyExpenses.updatedAt", { time: modifiedAt })}</small>
                  </button>
                  {canEdit ? <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="monthly-expenses-history-delete"
                    disabled={deletingKey === key}
                    aria-label={t("restaurantMonthlyExpenses.deleteRecord", { restaurant: item.restaurantName, month: item.month })}
                    onClick={() => void removeRecord(item)}
                  ><Trash2 /></Button> : null}
                </div>
              );
            }) : <p>{t("restaurantMonthlyExpenses.noRecords")}</p>}
          </div>
        </aside>

        {!restaurantId || !month ? (
          <main className="monthly-expenses-editor">
            <section className="panel monthly-expenses-empty">
              <CircleDollarSign aria-hidden="true" />
              <h2>{t("restaurantMonthlyExpenses.emptyTitle")}</h2>
              <p>{t("restaurantMonthlyExpenses.emptyDescription")}</p>
            </section>
          </main>
        ) : (
          <main className="monthly-expenses-editor">
            <section className="panel monthly-expenses-summary">
              <div><span>{selectedRestaurant?.name}</span><h2>{monthLabel}</h2></div>
              <div className={cn("monthly-expenses-status", canProceedPnl && "is-generated")}>
                {canProceedPnl ? <CheckCircle2 /> : <CircleDollarSign />}
                <span>{canProceedPnl ? t("restaurantMonthlyExpenses.generatedStatus") : t("restaurantMonthlyExpenses.draftStatus")}</span>
                <strong>{money(total)}</strong>
              </div>
            </section>

            <section className="panel monthly-expenses-actions">
              {!isNew ? <div className={cn("monthly-expenses-mode-actions", editing && "is-editing")} role="group" aria-label={t("restaurantMonthlyExpenses.recordMode")}>
                <button type="button" className={cn(!editing && "active")} aria-pressed={!editing} onClick={() => { setEditing(false); setSaved(false); void selectRecord(restaurantId, month); }}><Eye />{t("restaurantMonthlyExpenses.view")}</button>
                <button type="button" className={cn(editing && "active")} aria-pressed={editing} disabled={!canEdit} onClick={() => setEditing(true)}><Pencil />{t("restaurantMonthlyExpenses.edit")}</button>
              </div> : <span className="monthly-expenses-new-badge">{t("restaurantMonthlyExpenses.newDraft")}</span>}
              <div className="monthly-expenses-action-buttons">
                {saved ? <span className="is-success"><Check />{t("restaurantMonthlyExpenses.saved")}</span> : null}
                {isEditing ? <Button type="submit" disabled={!canEdit || saving || loadingRecord}><Save />{saving ? t("restaurantMonthlyExpenses.saving") : t("restaurantMonthlyExpenses.save")}</Button> : null}
                {!isNew && !isEditing && (canProceedPnl ? (
                  <Button type="button" variant="destructive" disabled={!canEdit || updatingPnl} onClick={() => void changePnlStatus(false)}><XCircle />{updatingPnl ? t("restaurantMonthlyExpenses.updatingPnl") : t("restaurantMonthlyExpenses.cancelPnl")}</Button>
                ) : (
                  <Button type="button" disabled={!canEdit || updatingPnl} onClick={() => void changePnlStatus(true)}><CheckCircle2 />{updatingPnl ? t("restaurantMonthlyExpenses.updatingPnl") : t("restaurantMonthlyExpenses.confirmPnl")}</Button>
                ))}
              </div>
            </section>

            {loadingRecord ? (
              <section className="panel monthly-expenses-table-panel monthly-expenses-table-skeleton" aria-busy="true">
                <span className="sr-only" role="status">{t("restaurantMonthlyExpenses.loadingRecord")}</span>
                <div className="monthly-expenses-table-scroll" aria-hidden="true">
                  <table className="monthly-expenses-table">
                    <colgroup><col className="category" /><col className="expense" /><col className="amount" /><col className="remarks" /></colgroup>
                    <thead><tr><th>{t("restaurantMonthlyExpenses.category")}</th><th>{t("restaurantMonthlyExpenses.expense")}</th><th>{t("restaurantMonthlyExpenses.amount")}</th><th>{t("restaurantMonthlyExpenses.remarks")}</th></tr></thead>
                    <tbody><TableSkeletonRows rows={10} columns={[{ width: "72%" }, { width: "68%" }, { width: "58%" }, { width: "84%" }]} /></tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="panel monthly-expenses-table-panel">
                <div className="monthly-expenses-table-scroll">
                  <table className="monthly-expenses-table">
                    <colgroup><col className="category" /><col className="expense" /><col className="amount" /><col className="remarks" /></colgroup>
                    <thead><tr><th>{t("restaurantMonthlyExpenses.category")}</th><th>{t("restaurantMonthlyExpenses.expense")}</th><th>{t("restaurantMonthlyExpenses.amount")}</th><th>{t("restaurantMonthlyExpenses.remarks")}</th></tr></thead>
                    <tbody>
                      {groupedCosts.map((group) => group.items.map((cost, index) => (
                        <tr key={cost.id}>
                          {index === 0 ? <th rowSpan={group.items.length} scope="rowgroup">{group.name}</th> : null}
                          <th scope="row">{cost.name}</th>
                          <td>{isEditing ? <div className="monthly-expenses-amount"><span>$</span><input aria-label={`${cost.name} ${t("restaurantMonthlyExpenses.amount")}`} type="number" step="0.01" value={amounts[cost.id] ?? ""} onChange={(event) => { setAmounts((current) => ({ ...current, [cost.id]: event.target.value })); setSaved(false); }} disabled={!canEdit || saving} placeholder={t("restaurantMonthlyExpenses.amountPlaceholder")} /></div> : <output aria-label={`${cost.name} ${t("restaurantMonthlyExpenses.amount")}`}>{money(numberValue(amounts[cost.id]))}</output>}</td>
                          <td>{isEditing ? <PdfAutoResizeTextarea aria-label={`${cost.name} ${t("restaurantMonthlyExpenses.remarks")}`} value={remarks[cost.id] ?? ""} onChange={(event) => { setRemarks((current) => ({ ...current, [cost.id]: event.target.value })); setSaved(false); }} disabled={!canEdit || saving} /> : <output aria-label={`${cost.name} ${t("restaurantMonthlyExpenses.remarks")}`}>{remarks[cost.id] || "—"}</output>}</td>
                        </tr>
                      )))}
                    </tbody>
                    <tfoot><tr><th colSpan={2}>{t("restaurantMonthlyExpenses.total")}</th><td>{money(total)}</td><td /></tr></tfoot>
                  </table>
                </div>
              </section>
            )}

          </main>
        )}
      </form>

      <Modal
        open={newDialogOpen}
        title={t("restaurantMonthlyExpenses.newModalTitle")}
        description={t("restaurantMonthlyExpenses.newModalDescription")}
        closeLabel={t("common.close")}
        onClose={() => setNewDialogOpen(false)}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setNewDialogOpen(false)}>{t("common.cancel")}</Button><Button disabled={!draftRestaurantId || !draftMonth || checkingNewRecord || newRecordExists || newRecordCheckError} onClick={() => {
          setRestaurantId(draftRestaurantId);
          setMonth(draftMonth);
          setIsNew(true);
          setEditing(true);
          setSaved(false);
          applyRecord(emptyRestaurantMonthlyExpenseRecord());
          setNewDialogOpen(false);
        }}>{t("restaurantMonthlyExpenses.startInput")}</Button></>}
      >
        <div className="monthly-expenses-new-form">
          <label><span>{t("restaurantMonthlyExpenses.restaurant")}</span><select aria-label={t("restaurantMonthlyExpenses.restaurant")} value={draftRestaurantId} onChange={(event) => setDraftRestaurantId(event.target.value)}><option value="">{t("restaurantMonthlyExpenses.restaurantPlaceholder")}</option>{masters?.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
          <label><span>{t("restaurantMonthlyExpenses.month")}</span><input aria-label={t("restaurantMonthlyExpenses.month")} type="month" value={draftMonth} onChange={(event) => setDraftMonth(event.target.value)} /></label>
          {checkingNewRecord ? <p>{t("restaurantMonthlyExpenses.checkingMonth")}</p> : newRecordExists ? <p className="is-error" role="alert">{t("restaurantMonthlyExpenses.recordExists")}</p> : newRecordCheckError ? <p className="is-error" role="alert">{t("restaurantMonthlyExpenses.checkMonthError")}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
