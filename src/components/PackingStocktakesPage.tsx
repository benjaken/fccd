import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createRoot } from "react-dom/client";
import { ClipboardList, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Modal } from "@/components/ui/modal";
import { writeStocktakePrintWindow } from "@/lib/stocktake-print";
import { KITCHEN_INGREDIENT_STOCKTAKES_DELETE, KITCHEN_INGREDIENT_STOCKTAKES_EDIT, KITCHEN_PACKING_STOCKTAKES_DELETE, KITCHEN_PACKING_STOCKTAKES_EDIT } from "@/lib/kitchen-action-permissions";
import {
  fetchPackingStocktakes,
  createPackingStocktake,
  createIngredientStocktake,
  fetchPackingStocktakeSheet,
  fetchStocktakeDates,
  deleteStocktakeDate,
  PACKING_STOCKTAKES_PAGE_SIZE,
  updatePackingStocktakeQuantity,
  type PackingStocktakeItem,
  type StocktakeKind,
  type StocktakeDateItem,
} from "@/lib/packing-stocktakes";

const SKELETON_COLUMNS = [
  { width: "10rem" }, { width: "8rem" }, { width: "8rem" },
  { width: "18rem" }, { width: "8rem" }, { width: "5rem" },
];

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function formatQuantity(value: number | null, notCounted: string) {
  return value == null ? notCounted : new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 3 }).format(value);
}

export function PackingStocktakesPage({
  loadRows,
  createStocktake,
  loadPrintRows,
  saveQuantity,
  loadDates,
  deleteDate,
  canEdit: canEditProp,
  kind = "packing",
}: {
  loadRows?: (filters: { page: number; search: string; stocktakeDate: string | null }) => Promise<{ items: PackingStocktakeItem[]; total: number }>;
  createStocktake?: (date: string) => Promise<number>;
  loadPrintRows?: (date: string) => Promise<PackingStocktakeItem[]>;
  saveQuantity?: (id: string, quantity: number) => Promise<number>;
  loadDates?: () => Promise<StocktakeDateItem[]>;
  deleteDate?: (date: string) => Promise<void>;
  canEdit?: boolean;
  kind?: StocktakeKind;
}) {
  const { t, i18n } = useTranslation();
  const copy = kind === "ingredient" ? "ingredientStocktakes" : "packingStocktakes";
  const copyKey = (key: string) => `${copy}.${key}`;
  const placeholder = kind === "ingredient"
    ? t("ingredientStocktakes.searchPlaceholder")
    : t("packingStocktakes.searchPlaceholder");
  const effectiveLoadRows = useMemo(() => loadRows ?? ((filters: { page: number; search: string; stocktakeDate: string | null }) => fetchPackingStocktakes({ ...filters, kind })), [kind, loadRows]);
  const effectiveCreateStocktake = useMemo(() => createStocktake ?? (kind === "ingredient" ? createIngredientStocktake : createPackingStocktake), [createStocktake, kind]);
  const effectiveLoadPrintRows = useMemo(() => loadPrintRows ?? ((date: string) => fetchPackingStocktakeSheet(date, kind)), [kind, loadPrintRows]);
  const effectiveSaveQuantity = useMemo(() => saveQuantity ?? ((id: string, quantity: number) => updatePackingStocktakeQuantity(id, quantity, kind)), [kind, saveQuantity]);
  const effectiveLoadDates = useMemo(() => loadDates ?? (() => fetchStocktakeDates(kind)), [kind, loadDates]);
  const effectiveDeleteDate = useMemo(() => deleteDate ?? ((date: string) => deleteStocktakeDate(date, kind)), [deleteDate, kind]);
  const pageAccess = useCurrentPageAccess();
  const canEdit = canEditProp ?? pageAccess.canAccess(kind === "ingredient" ? KITCHEN_INGREDIENT_STOCKTAKES_EDIT : KITCHEN_PACKING_STOCKTAKES_EDIT);
  const canDelete = pageAccess.canAccess(kind === "ingredient" ? KITCHEN_INGREDIENT_STOCKTAKES_DELETE : KITCHEN_PACKING_STOCKTAKES_DELETE);
  const [rows, setRows] = useState<PackingStocktakeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [stocktakeDate, setStocktakeDate] = useState<string | null>(null);
  const [dates, setDates] = useState<StocktakeDateItem[]>([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / PACKING_STOCKTAKES_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * PACKING_STOCKTAKES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * PACKING_STOCKTAKES_PAGE_SIZE, total);

  useEffect(() => { setPage(1); }, [appliedSearch]);
  useEffect(() => {
    let cancelled = false;
    void effectiveLoadDates()
      .then((items) => { if (!cancelled) setDates(items); })
      .catch(() => { if (!cancelled) setDates([]); })
      .finally(() => { if (!cancelled) setDatesLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveLoadDates, reloadKey]);
  useEffect(() => {
    if (!stocktakeDate) {
      setRows([]); setTotal(0); setLoading(false); setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    void effectiveLoadRows({ page, search: appliedSearch, stocktakeDate })
      .then(({ items, total: nextTotal }) => {
        if (!cancelled) { setRows(items); setTotal(nextTotal); }
      })
        .catch(() => { if (!cancelled) setError("load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appliedSearch, effectiveLoadRows, page, reloadKey, stocktakeDate]);

  const openCreate = () => {
    setNewDate(stocktakeDate ?? new Date().toISOString().slice(0, 10));
    setCreateError(null);
    setCreateOpen(true);
  };
  const createForDate = async () => {
    if (!newDate || creating) return;
    setCreating(true); setCreateError(null);
    try {
      await effectiveCreateStocktake(newDate);
      setDates((current) => current.some((item) => item.date === newDate) ? current : [{ date: newDate, updatedAt: new Date().toISOString() }, ...current]);
      setStocktakeDate(newDate); setPage(1); setCreateOpen(false);
    } catch { setCreateError("createError"); }
    finally { setCreating(false); }
  };
  const removeDate = async (date: string) => {
    if (deletingDate || !window.confirm(t(copyKey("deleteConfirm"), { date: formatDate(`${date}T00:00:00+08:00`, i18n.language) }))) return;
    setDeletingDate(date);
    try {
      await effectiveDeleteDate(date);
      setDates((current) => current.filter((item) => item.date !== date));
      if (stocktakeDate === date) setStocktakeDate(null);
    } catch { setError("deleteError"); }
    finally { setDeletingDate(null); }
  };
  const openPrintPreview = async () => {
    if (!stocktakeDate || printLoading) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setError("printPopupBlocked"); return; }
    printWindow.opener = null;
    printWindow.document.write(`<p style="font-family:sans-serif;padding:24px">${t(copyKey("loading"))}</p>`);
    setPrintLoading(true);
    try {
      const printRows = await effectiveLoadPrintRows(stocktakeDate);
      writeStocktakePrintWindow(printWindow, printRows, t(copyKey("printSheet")), t(copyKey("print")));
      const actionHost = printWindow.document.getElementById("stocktake-print-action");
      if (actionHost) {
        createRoot(actionHost).render(
          <Button type="button" onClick={() => printWindow.print()}><Printer />{t(copyKey("print"))}</Button>,
        );
      }
    } catch {
      printWindow.close();
      setError("printLoadError");
    } finally { setPrintLoading(false); }
  };

  const beginEdit = (row: PackingStocktakeItem) => {
    if (!canEdit || savingId) return;
    setEditingId(row.id);
    setDraftQuantity(row.quantity == null ? "" : String(row.quantity));
  };
  const save = async (row: PackingStocktakeItem) => {
    if (editingId !== row.id || savingId) return;
    const quantity = Number(draftQuantity);
    if (!draftQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
      setError("quantityInvalid");
      return;
    }
    setSavingId(row.id); setError(null);
    try {
      const saved = await effectiveSaveQuantity(row.id, quantity);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, quantity: saved } : item));
      setEditingId(null);
    } catch { setError("saveError"); }
    finally { setSavingId(null); }
  };

  return (
    <section className="ingredients-page packing-stocktakes-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t(copyKey("title"))}</h1>
          <p>{t(copyKey("description"))}</p>
        </div>
        <div className="packing-stocktakes-heading-actions">
          <Button type="button" variant="outline" disabled={!stocktakeDate || rows.length === 0 || printLoading} onClick={() => void openPrintPreview()}><Printer />{t(copyKey("printSheet"))}</Button>
        </div>
      </header>
      <div className="stocktake-records-layout">
        <aside className="stocktake-date-list" aria-label={t(copyKey("dateList"))}>
          <header className="stocktake-date-list-header">
            <strong>{t(copyKey("dateList"))}</strong>
            <div className="stocktake-date-list-actions">
              {canEdit ? <Button type="button" variant="ghost" size="icon" aria-label={t(copyKey("add"))} onClick={openCreate}><Plus /></Button> : null}
            </div>
          </header>
          <div className="stocktake-date-list-options">
            {datesLoading ? <span>{t(copyKey("loading"))}</span> : dates.length === 0 ? <span>{t(copyKey("noDates"))}</span> : dates.map((item) => <div key={item.date} className={item.date === stocktakeDate ? "stocktake-date-item is-active" : "stocktake-date-item"}><button type="button" onClick={() => { setStocktakeDate(item.date); setPage(1); }}><strong>{formatDate(`${item.date}T00:00:00+08:00`, i18n.language)}</strong><small>{t(copyKey("updatedAt"), { time: formatDateTime(item.updatedAt, i18n.language) })}</small></button>{canDelete ? <Button type="button" variant="ghost" size="icon" disabled={deletingDate === item.date} aria-label={t(copyKey("deleteDate"), { date: formatDate(`${item.date}T00:00:00+08:00`, i18n.language) })} onClick={() => void removeDate(item.date)}><Trash2 /></Button> : null}</div>)}
          </div>
        </aside>
        <article className="panel ingredients-panel stocktake-records-panel">
        <div className="stocktake-records-content">
        {stocktakeDate ? <>
        <header className="ingredients-toolbar">
          <ListSearchBar id="packing-stocktakes-search" value={search} onChange={setSearch}
            onSubmit={() => setAppliedSearch(search.trim())} label={t(copyKey("search"))}
            placeholder={placeholder} submitLabel={t(copyKey("searchAction"))} />
        </header>
        {error ? <p className="list-inline-error">{t(copyKey(error))}</p> : null}
        {!loading && rows.length === 0 && !error ? (
          <div className="products-state products-state-empty"><ClipboardList /><div><strong>{t(copyKey("empty"))}</strong><span>{t(copyKey("emptyDescription"))}</span></div></div>
        ) : error && rows.length === 0 ? (
          <div className="products-state products-state-error"><div><strong>{t(copyKey("loadError"))}</strong><span>{t(copyKey("loadErrorDescription"))}</span></div><Button type="button" variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />{t(copyKey("searchAction"))}</Button></div>
        ) : (
          <ListTable className="ingredients-table-wrap" onRefresh={() => setReloadKey((value) => value + 1)} loading={loading} loadingLabel={t(copyKey("loading"))} skeletonRows={PACKING_STOCKTAKES_PAGE_SIZE} skeletonColumns={SKELETON_COLUMNS}
            header={<tr><th>{t(copyKey("columns.date"))}</th><th>{t(copyKey("columns.sku"))}</th><th>{t(copyKey("columns.type"))}</th><th>{t(copyKey("columns.name"))}</th><th>{t(copyKey("columns.quantity"))}</th><th>{t(copyKey("columns.unit"))}</th></tr>}>
            {rows.map((row) => <tr key={row.id}><td>{formatDate(row.stocktakeAt, i18n.language)}</td><td>{row.sku || "—"}</td><td>{row.ingredientType || "—"}</td><td><strong>{row.name || "—"}</strong></td><td>
              {editingId === row.id ? <input autoFocus className="stocktake-quantity-input" type="number" min="0" step="0.001" value={draftQuantity} disabled={savingId === row.id} aria-label={t(copyKey("editQuantity"), { item: row.name ?? row.sku ?? "" })} onChange={(event) => setDraftQuantity(event.target.value)} onBlur={() => void save(row)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingId(null); }} /> : <button type="button" className="stocktake-quantity-value" disabled={!canEdit} onClick={() => beginEdit(row)} aria-label={t(copyKey("editQuantity"), { item: row.name ?? row.sku ?? "" })}>{formatQuantity(row.quantity, t(copyKey("notCounted")))}</button>}
            </td><td>{row.unit || "—"}</td></tr>)}
          </ListTable>
        )}
        {!loading && !error && total > 0 ? <TablePagination summary={t(copyKey("pagination"), { from: visibleFrom, to: visibleTo, total })} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => Math.min(totalPages, current + 1))} onPageChange={setPage} previousLabel={t(copyKey("previous"))} nextLabel={t(copyKey("next"))} pageLabel={t(copyKey("pageOf"))} jumpLabel={t(copyKey("jumpToPage"))} /> : null}
        </> : <div className="products-state products-state-empty"><ClipboardList /><div><strong>{t(copyKey("selectDate"))}</strong><span>{t(copyKey("selectDateDescription"))}</span></div></div>}
        </div>
        </article>
      </div>
      <Modal open={createOpen} title={t(copyKey("createTitle"))} description={t(copyKey("createDescription"))} onClose={() => !creating && setCreateOpen(false)} closeLabel={t(copyKey("closePanel"))} size="sm" footer={<><Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>{t(copyKey("cancel"))}</Button><Button type="button" disabled={!newDate || creating} onClick={() => void createForDate()}>{creating ? t(copyKey("checking")) : t(copyKey("continueAction"))}</Button></>}>
        <label className="ingredients-field"><span>{t(copyKey("stocktakeDate"))}</span><input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
        {createError ? <p className="list-inline-error">{t(copyKey(createError))}</p> : null}
      </Modal>
    </section>
  );
}
