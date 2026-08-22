import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { Modal } from "@/components/ui/modal";
import {
  createRestaurantStocktake,
  deleteRestaurantStocktake,
  fetchRestaurantStocktakeItems,
  fetchRestaurantStocktakeMasters,
  fetchRestaurantStocktakeRecords,
  RESTAURANT_STOCKTAKES_PAGE_SIZE,
  updateRestaurantStocktakeQuantity,
  type RestaurantStocktakeItem,
  type RestaurantStocktakeMasters,
  type RestaurantStocktakeRecord,
} from "@/lib/restaurant-stocktakes";

type Services = {
  loadMasters: typeof fetchRestaurantStocktakeMasters;
  loadRecords: typeof fetchRestaurantStocktakeRecords;
  loadItems: typeof fetchRestaurantStocktakeItems;
  createRecord: typeof createRestaurantStocktake;
  saveQuantity: typeof updateRestaurantStocktakeQuantity;
  deleteRecord: typeof deleteRestaurantStocktake;
};

const DEFAULT_SERVICES: Services = {
  loadMasters: fetchRestaurantStocktakeMasters,
  loadRecords: fetchRestaurantStocktakeRecords,
  loadItems: fetchRestaurantStocktakeItems,
  createRecord: createRestaurantStocktake,
  saveQuantity: updateRestaurantStocktakeQuantity,
  deleteRecord: deleteRestaurantStocktake,
};

function recordKey(record: Pick<RestaurantStocktakeRecord, "month" | "restaurantId" | "departmentName">) {
  return `${record.month}:${record.restaurantId}:${record.departmentName}`;
}

function hongKongMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}`;
}

function formatMonth(month: string, locale: string) {
  const date = new Date(`${month}-01T00:00:00+08:00`);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(date);
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function money(value: number) {
  return new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(value);
}

function supplierRowSpans(rows: RestaurantStocktakeItem[]) {
  const spans = new Map<number, number>();
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    while (end < rows.length && rows[end].supplierName === rows[start].supplierName) end += 1;
    spans.set(start, end - start);
    start = end;
  }
  return spans;
}

function RestaurantStocktakesSkeleton({ label }: { label: string }) {
  return (
    <section className="ingredients-page restaurant-stocktakes-page restaurant-stocktakes-page-skeleton" aria-busy="true">
      <span className="sr-only" role="status">{label}</span>
      <header className="page-heading ingredients-heading" aria-hidden="true">
        <div className="restaurant-stocktakes-loading-heading">
          <span className="page-skeleton-bone" />
          <span className="page-skeleton-bone" />
          <span className="page-skeleton-bone" />
        </div>
      </header>
      <div className="stocktake-records-layout" aria-hidden="true">
        <aside className="stocktake-date-list">
          <header className="stocktake-date-list-header"><span className="page-skeleton-bone" style={{ width: 90, height: 14 }} /></header>
          <div className="stocktake-date-list-options restaurant-stocktakes-loading-list">
            {Array.from({ length: 7 }, (_, index) => <div key={index}><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /><span className="page-skeleton-bone" /></div>)}
          </div>
        </aside>
        <article className="panel ingredients-panel stocktake-records-panel restaurant-stocktake-record-panel">
          <div className="stocktake-records-content restaurant-stocktakes-loading-record">
            <header className="restaurant-stocktake-summary">
              <div><span className="page-skeleton-bone" style={{ width: 260, height: 15 }} /><span className="page-skeleton-bone" style={{ width: 150, height: 13 }} /></div>
              <span className="page-skeleton-bone restaurant-stocktakes-loading-summary-action" />
            </header>
            <header className="ingredients-toolbar restaurant-stocktakes-loading-toolbar"><span className="page-skeleton-bone" /></header>
            <div className="restaurant-stocktakes-loading-table">{Array.from({ length: 8 }, (_, row) => <div key={row}>{Array.from({ length: 6 }, (_, column) => <span key={column} className="page-skeleton-bone" />)}</div>)}</div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function RestaurantStocktakesPage({
  services: serviceOverrides,
  canEdit: canEditOverride,
  canDelete: canDeleteOverride,
}: {
  services?: Partial<Services>;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const access = useCurrentPageAccess();
  const services = useMemo(() => ({ ...DEFAULT_SERVICES, ...serviceOverrides }), [serviceOverrides]);
  const canEdit = canEditOverride ?? access.canAccess("restaurant.inventory.edit");
  const canDelete = canDeleteOverride ?? access.canAccess("restaurant.inventory.delete");

  const [masters, setMasters] = useState<RestaurantStocktakeMasters>({ restaurants: [], departments: [] });
  const [records, setRecords] = useState<RestaurantStocktakeRecord[]>([]);
  const [selected, setSelected] = useState<RestaurantStocktakeRecord | null>(null);
  const [items, setItems] = useState<RestaurantStocktakeItem[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(hongKongMonth());
  const [newRestaurantId, setNewRestaurantId] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecords(true);
    void Promise.all([services.loadMasters(), services.loadRecords()])
      .then(([nextMasters, nextRecords]) => {
        if (cancelled) return;
        setMasters(nextMasters);
        setRecords(nextRecords);
        setSelected((current) => current && nextRecords.some((record) => recordKey(record) === recordKey(current)) ? current : (nextRecords[0] ?? null));
      })
      .catch(() => { if (!cancelled) setError("loadError"); })
      .finally(() => { if (!cancelled) setLoadingRecords(false); });
    return () => { cancelled = true; };
  }, [reloadKey, services]);

  useEffect(() => {
    if (!selected) {
      setItems([]); setInventoryValue(0); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    void services.loadItems({
      month: selected.month,
      restaurantId: selected.restaurantId,
      departmentName: selected.departmentName,
      search: appliedSearch,
      page: 1,
    }).then((result) => {
      if (cancelled) return;
      setItems(result.items);
      setInventoryValue(result.inventoryValue);
      setDrafts(Object.fromEntries(result.items.map((item) => [item.id, item.quantity == null ? "" : String(item.quantity)])));
      setEditMode(false);
    }).catch(() => { if (!cancelled) setError("loadError"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appliedSearch, reloadKey, selected, services]);

  const existingKeys = useMemo(() => new Set(records.map(recordKey)), [records]);
  const selectedCombinationExists = Boolean(newMonth && newRestaurantId && newDepartment && existingKeys.has(recordKey({ month: newMonth, restaurantId: newRestaurantId, departmentName: newDepartment })));
  const restaurantUnavailableFor = (month: string, restaurantId: string) => masters.departments.length > 0 && masters.departments.every((department) => existingKeys.has(recordKey({ month, restaurantId, departmentName: department.name })));
  const restaurantUnavailable = (restaurantId: string) => restaurantUnavailableFor(newMonth, restaurantId);
  const departmentUnavailable = (departmentName: string) => Boolean(newMonth && newRestaurantId && existingKeys.has(recordKey({ month: newMonth, restaurantId: newRestaurantId, departmentName })));
  const spans = useMemo(() => supplierRowSpans(items), [items]);
  const dirtyItems = items.filter((item) => drafts[item.id] !== (item.quantity == null ? "" : String(item.quantity)));
  const displayedInventoryValue = items.reduce((sum, item) => {
    const original = item.totalCost;
    const draft = drafts[item.id]?.trim();
    const next = editMode && draft !== "" && Number.isFinite(Number(draft)) ? Number(draft) * item.unitCost : original;
    return sum + next - original;
  }, inventoryValue);

  const openCreate = () => {
    const month = selected?.month ?? hongKongMonth();
    setNewMonth(month);
    const preferredRestaurant = selected?.restaurantId && !restaurantUnavailableFor(month, selected.restaurantId) ? selected.restaurantId : "";
    setNewRestaurantId(preferredRestaurant);
    setNewDepartment("");
    setCreateError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!newMonth || !newRestaurantId || !newDepartment || selectedCombinationExists || creating) return;
    setCreating(true); setCreateError(null);
    try {
      await services.createRecord(newMonth, newRestaurantId, newDepartment);
      const restaurant = masters.restaurants.find((option) => option.id === newRestaurantId);
      const created: RestaurantStocktakeRecord = {
        month: newMonth,
        restaurantId: newRestaurantId,
        restaurantName: restaurant?.name ?? "",
        departmentName: newDepartment,
        updatedAt: new Date().toISOString(),
      };
      setRecords((current) => [created, ...current]);
      setSelected(created);
      setAppliedSearch("");
      setSearch("");
      setCreateOpen(false);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setCreateError(message.includes("record_exists") ? "recordExists" : message.includes("no_items") ? "noItems" : "createError");
    } finally { setCreating(false); }
  };

  const save = async () => {
    if (saving) return;
    if (!dirtyItems.length) {
      setEditMode(false);
      return;
    }
    const invalid = dirtyItems.some((item) => {
      const value = drafts[item.id]?.trim() ?? "";
      return value === "" || !Number.isFinite(Number(value)) || Number(value) < 0;
    });
    if (invalid) { setError("quantityInvalid"); return; }
    setSaving(true); setError(null);
    try {
      await Promise.all(dirtyItems.map((item) => services.saveQuantity(item.id, Number(drafts[item.id]))));
      setReloadKey((value) => value + 1);
    } catch { setError("saveError"); }
    finally { setSaving(false); }
  };

  const removeRecord = async (record: RestaurantStocktakeRecord) => {
    const key = recordKey(record);
    if (deletingKey || !window.confirm(t("restaurantStocktakes.deleteConfirm", { month: formatMonth(record.month, i18n.language), restaurant: record.restaurantName, department: record.departmentName }))) return;
    setDeletingKey(key);
    try {
      await services.deleteRecord(record.month, record.restaurantId, record.departmentName);
      const next = records.filter((item) => recordKey(item) !== key);
      setRecords(next);
      if (selected && recordKey(selected) === key) setSelected(next[0] ?? null);
    } catch { setError("deleteError"); }
    finally { setDeletingKey(null); }
  };

  if (loadingRecords && records.length === 0) return <RestaurantStocktakesSkeleton label={t("restaurantStocktakes.loading")} />;

  return (
    <section className="ingredients-page restaurant-stocktakes-page">
      <header className="page-heading ingredients-heading">
        <div><span className="eyebrow">{t("navigation.restaurant")}</span><h1>{t("restaurantStocktakes.title")}</h1><p>{t("restaurantStocktakes.description")}</p></div>
      </header>
      <div className="stocktake-records-layout">
        <aside className="stocktake-date-list" aria-label={t("restaurantStocktakes.recordList")}>
          <header className="stocktake-date-list-header"><strong>{t("restaurantStocktakes.recordList")}</strong>{canEdit ? <div className="stocktake-date-list-actions"><Button type="button" size="icon" variant="ghost" aria-label={t("restaurantStocktakes.add")} onClick={openCreate}><Plus /></Button></div> : null}</header>
          <div className="stocktake-date-list-options">
            {loadingRecords ? <span>{t("restaurantStocktakes.loading")}</span> : records.length === 0 ? <span>{t("restaurantStocktakes.noRecords")}</span> : records.map((record) => {
              const key = recordKey(record); const active = selected ? key === recordKey(selected) : false;
              return <div key={key} className={active ? "stocktake-date-item is-active" : "stocktake-date-item"}><button type="button" data-stocktake-record={key} onClick={() => setSelected(record)}><strong>{record.restaurantName} · {record.departmentName}</strong><span>{formatMonth(record.month, i18n.language)}</span><small>{t("restaurantStocktakes.updatedAt", { time: formatDateTime(record.updatedAt, i18n.language) })}</small></button>{canDelete ? <Button type="button" size="icon" variant="ghost" disabled={deletingKey === key} aria-label={t("restaurantStocktakes.deleteRecord", { restaurant: record.restaurantName, department: record.departmentName, month: formatMonth(record.month, i18n.language) })} onClick={() => void removeRecord(record)}><Trash2 /></Button> : null}</div>;
            })}
          </div>
        </aside>
        <article className="panel ingredients-panel stocktake-records-panel restaurant-stocktake-record-panel">
          <div className="stocktake-records-content">
            {selected ? <>
              <header className="restaurant-stocktake-summary">
                <div><strong>{formatMonth(selected.month, i18n.language)} · {selected.restaurantName} · {selected.departmentName}</strong><span>{t("restaurantStocktakes.inventoryValue", { value: money(displayedInventoryValue) })}</span></div>
                {canEdit ? <div className="restaurant-stocktake-actions"><Button type="button" variant="outline" disabled={editMode || loading} onClick={() => setEditMode(true)}><Pencil />{t("restaurantStocktakes.edit")}</Button><Button type="button" disabled={!editMode || saving} onClick={() => void save()}><Save />{saving ? t("restaurantStocktakes.saving") : t("restaurantStocktakes.save")}</Button></div> : null}
              </header>
              <header className="ingredients-toolbar"><ListSearchBar id="restaurant-stocktake-search" value={search} onChange={setSearch} onSubmit={() => setAppliedSearch(search.trim())} label={t("restaurantStocktakes.search")} placeholder={t("restaurantStocktakes.searchPlaceholder")} submitLabel={t("restaurantStocktakes.searchAction")} /></header>
              {error ? <p className="list-inline-error">{t(`restaurantStocktakes.${error}`)}</p> : null}
              {!loading && !error && items.length === 0 ? <div className="products-state products-state-empty"><ClipboardList /><div><strong>{t("restaurantStocktakes.empty")}</strong><span>{t("restaurantStocktakes.emptyDescription")}</span></div></div> : error && items.length === 0 ? <div className="products-state products-state-error"><div><strong>{t("restaurantStocktakes.loadError")}</strong><span>{t("restaurantStocktakes.loadErrorDescription")}</span></div><Button type="button" variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />{t("restaurantStocktakes.retry")}</Button></div> : <ListTable className="ingredients-table-wrap restaurant-stocktake-table" loading={loading} loadingLabel={t("restaurantStocktakes.loading")} skeletonRows={RESTAURANT_STOCKTAKES_PAGE_SIZE} skeletonColumns={6} header={<tr><th>{t("restaurantStocktakes.columns.supplier")}</th><th>{t("restaurantStocktakes.columns.name")}</th><th>{t("restaurantStocktakes.columns.unit")}</th><th>{t("restaurantStocktakes.columns.unitCost")}</th><th>{t("restaurantStocktakes.columns.quantity")}</th><th>{t("restaurantStocktakes.columns.total")}</th></tr>}>
                {items.map((item, index) => {
                  const draft = drafts[item.id] ?? "";
                  const quantity = draft.trim() === "" ? null : Number(draft);
                  const totalCost = editMode && quantity !== null && Number.isFinite(quantity) ? quantity * item.unitCost : item.totalCost;
                  return <tr key={item.id}>{spans.has(index) ? <td rowSpan={spans.get(index)}><strong>{item.supplierName || t("restaurantStocktakes.noSupplier")}</strong></td> : null}<td><strong>{item.name}</strong></td><td>{item.unit || "—"}</td><td>{money(item.unitCost)}</td><td>{editMode ? <input className="stocktake-quantity-input" type="number" min="0" step="0.001" value={draft} aria-label={t("restaurantStocktakes.editQuantity", { item: item.name })} placeholder={t("restaurantStocktakes.quantityPlaceholder")} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} /> : item.quantity == null ? <span className="stocktake-not-counted">{t("restaurantStocktakes.notCounted")}</span> : item.quantity}</td><td>{money(totalCost)}</td></tr>;
                })}
              </ListTable>}
            </> : <div className="products-state products-state-empty"><ClipboardList /><div><strong>{t("restaurantStocktakes.selectRecord")}</strong><span>{t("restaurantStocktakes.selectRecordDescription")}</span></div></div>}
          </div>
        </article>
      </div>
      <Modal open={createOpen} title={t("restaurantStocktakes.createTitle")} description={t("restaurantStocktakes.createDescription")} onClose={() => !creating && setCreateOpen(false)} closeLabel={t("restaurantStocktakes.close")} size="sm" footer={<><Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>{t("restaurantStocktakes.cancel")}</Button><Button type="button" disabled={!newMonth || !newRestaurantId || !newDepartment || selectedCombinationExists || creating} onClick={() => void submitCreate()}>{creating ? t("restaurantStocktakes.creating") : t("restaurantStocktakes.continueAction")}</Button></>}>
        <div className="ingredients-form restaurant-stocktake-create-form">
          <label className="ingredients-field"><span>{t("restaurantStocktakes.month")}</span><input type="month" value={newMonth} onChange={(event) => { setNewMonth(event.target.value); setNewDepartment(""); setCreateError(null); }} /></label>
          <label className="ingredients-field"><span>{t("restaurantStocktakes.restaurant")}</span><select value={newRestaurantId} onChange={(event) => { setNewRestaurantId(event.target.value); setNewDepartment(""); setCreateError(null); }}><option value="">{t("restaurantStocktakes.restaurantPlaceholder")}</option>{masters.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id} disabled={restaurantUnavailable(restaurant.id)}>{restaurant.name}{restaurantUnavailable(restaurant.id) ? t("restaurantStocktakes.allRecordedSuffix") : ""}</option>)}</select></label>
          <label className="ingredients-field"><span>{t("restaurantStocktakes.department")}</span><select value={newDepartment} disabled={!newRestaurantId} onChange={(event) => { setNewDepartment(event.target.value); setCreateError(null); }}><option value="">{t("restaurantStocktakes.departmentPlaceholder")}</option>{masters.departments.map((department) => <option key={department.id} value={department.name} disabled={departmentUnavailable(department.name)}>{department.name}{departmentUnavailable(department.name) ? t("restaurantStocktakes.recordedSuffix") : ""}</option>)}</select></label>
          {selectedCombinationExists ? <p className="list-inline-error">{t("restaurantStocktakes.recordExists")}</p> : null}
          {createError ? <p className="list-inline-error">{t(`restaurantStocktakes.${createError}`)}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
