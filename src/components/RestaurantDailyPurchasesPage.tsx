import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListTable } from "@/components/ui/list-table";
import { MultiSelect } from "@/components/ui/multi-select";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  deleteRestaurantDailyPurchaseEntry,
  fetchRestaurantDailyPurchaseEntries,
  fetchRestaurantDailyPurchaseRecords,
  fetchRestaurantPurchaseRestaurants,
  fetchRestaurantPurchaseSuppliers,
  fetchRestaurantPurchaseTypes,
  saveRestaurantDailyPurchaseRecord,
  updateRestaurantDailyPurchaseEntry,
  type RestaurantDailyPurchaseEntry,
  type RestaurantDailyPurchaseFilters,
  type RestaurantDailyPurchaseRecord,
  type RestaurantPurchaseOption,
} from "@/lib/restaurant-daily-purchases";

const MAIN_ROW_LIMIT = 100;
const EDITOR_PAGE_SIZE = 20;
export const RESTAURANT_DAILY_PURCHASES_EDIT = "restaurant.daily_purchases.edit";

export type RestaurantDailyPurchaseServices = {
  loadRestaurants: typeof fetchRestaurantPurchaseRestaurants;
  loadSuppliers: typeof fetchRestaurantPurchaseSuppliers;
  loadPurchaseTypes: typeof fetchRestaurantPurchaseTypes;
  loadRecords: typeof fetchRestaurantDailyPurchaseRecords;
  saveRecord: typeof saveRestaurantDailyPurchaseRecord;
  loadEntries: typeof fetchRestaurantDailyPurchaseEntries;
  updateEntry: typeof updateRestaurantDailyPurchaseEntry;
  deleteEntry: typeof deleteRestaurantDailyPurchaseEntry;
};

const defaultServices: RestaurantDailyPurchaseServices = {
  loadRestaurants: fetchRestaurantPurchaseRestaurants,
  loadSuppliers: fetchRestaurantPurchaseSuppliers,
  loadPurchaseTypes: fetchRestaurantPurchaseTypes,
  loadRecords: fetchRestaurantDailyPurchaseRecords,
  saveRecord: saveRestaurantDailyPurchaseRecord,
  loadEntries: fetchRestaurantDailyPurchaseEntries,
  updateEntry: updateRestaurantDailyPurchaseEntry,
  deleteEntry: deleteRestaurantDailyPurchaseEntry,
};

function formatDate(value: string, language: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(Date.UTC(year, month - 1, day, 4)));
}

function money(value: number, language: string) {
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function PurchaseRecordPanel({
  open,
  restaurants,
  suppliers,
  purchaseTypes,
  loadingOptions,
  saveRecord,
  onClose,
  onSaved,
}: {
  open: boolean;
  restaurants: RestaurantPurchaseOption[];
  suppliers: RestaurantPurchaseOption[];
  purchaseTypes: RestaurantPurchaseOption[];
  loadingOptions: boolean;
  saveRecord: RestaurantDailyPurchaseServices["saveRecord"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate("");
    setRestaurantId("");
    setSupplierId("");
    setAmounts(Object.fromEntries(purchaseTypes.map((type) => [type.id, "0"])));
    setError(null);
  }, [open, purchaseTypes]);

  const total = useMemo(
    () => purchaseTypes.reduce((sum, type) => sum + (Number(amounts[type.id]) || 0), 0),
    [amounts, purchaseTypes],
  );
  const readyForAmounts = Boolean(date && restaurantId && supplierId);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!date) return setError(t("restaurantDailyPurchases.validation.date"));
    if (!restaurantId) return setError(t("restaurantDailyPurchases.validation.restaurant"));
    if (!supplierId) return setError(t("restaurantDailyPurchases.validation.supplier"));
    const values = purchaseTypes.map((type) => ({
      purchaseTypeId: type.id,
      amount: Number(amounts[type.id] ?? 0),
    }));
    if (values.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) {
      return setError(t("restaurantDailyPurchases.validation.amount"));
    }
    setSaving(true);
    setError(null);
    try {
      await saveRecord({ date, restaurantId, supplierId, amounts: values });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("restaurantDailyPurchases.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("restaurantDailyPurchases.addTitle")}
      description={t("restaurantDailyPurchases.addDescription")}
      onClose={onClose}
      closeLabel={t("restaurantDailyPurchases.closeAdd")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="restaurant-daily-purchase-form" disabled={saving || loadingOptions || !readyForAmounts}>
            {saving ? t("restaurantDailyPurchases.saving") : t("common.confirm")}
          </Button>
        </>
      }
    >
      <form id="restaurant-daily-purchase-form" className="ingredients-form" onSubmit={(event) => void submit(event)}>
        <label className="ingredients-field">
          <span>{t("restaurantDailyPurchases.date")}</span>
          <input aria-label={t("restaurantDailyPurchases.date")} type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} />
        </label>
        <label className="ingredients-field">
          <span>{t("restaurantDailyPurchases.supplier")}</span>
          <select aria-label={t("restaurantDailyPurchases.supplier")} value={supplierId} disabled={loadingOptions} onChange={(event) => { setSupplierId(event.target.value); setError(null); }}>
            <option value="">{t("restaurantDailyPurchases.supplierPlaceholder")}</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
        <label className="ingredients-field">
          <span>{t("restaurantDailyPurchases.restaurant")}</span>
          <select aria-label={t("restaurantDailyPurchases.restaurant")} value={restaurantId} disabled={loadingOptions} onChange={(event) => { setRestaurantId(event.target.value); setError(null); }}>
            <option value="">{t("restaurantDailyPurchases.restaurantPlaceholder")}</option>
            {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
          </select>
        </label>

        {readyForAmounts ? (
          <section className="kitchen-supplier-category-form" aria-label={t("restaurantDailyPurchases.categories")}>
            <div className="kitchen-supplier-category-form-heading"><strong>{t("restaurantDailyPurchases.category")}</strong><strong>{t("restaurantDailyPurchases.amount")}</strong></div>
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
                    aria-label={t("restaurantDailyPurchases.categoryAmount", { category: type.name })}
                    onChange={(event) => {
                      setAmounts((current) => ({ ...current, [type.id]: event.target.value }));
                      setError(null);
                    }}
                  />
                </div>
              </label>
            ))}
            <div className="kitchen-supplier-category-total"><strong>{t("restaurantDailyPurchases.total")}</strong><strong>{money(total, i18n.language)}</strong></div>
          </section>
        ) : <p className="kitchen-supplier-form-hint">{t("restaurantDailyPurchases.formHint")}</p>}
        {error ? <p className="ingredients-form-error" role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

function PurchaseEntriesPanel({
  open,
  filters,
  services,
  onClose,
  onChanged,
}: {
  open: boolean;
  filters: RestaurantDailyPurchaseFilters;
  services: RestaurantDailyPurchaseServices;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RestaurantDailyPurchaseEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / EDITOR_PAGE_SIZE));

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void services.loadEntries({ filters, page, pageSize: EDITOR_PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotal(result.total);
        setDrafts(Object.fromEntries(result.items.map((row) => [row.id, String(row.amount)])));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t("restaurantDailyPurchases.entriesLoadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, open, page, reloadKey, services, t]);

  useEffect(() => {
    if (open) setPage(1);
  }, [filters, open]);

  const saveAmount = async (row: RestaurantDailyPurchaseEntry, value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return setError(t("restaurantDailyPurchases.validation.amount"));
    if (amount === row.amount) return;
    setError(null);
    try {
      await services.updateEntry(row.id, amount);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, amount } : item));
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("restaurantDailyPurchases.saveError"));
    }
  };

  const remove = async (row: RestaurantDailyPurchaseEntry) => {
    if (!window.confirm(t("restaurantDailyPurchases.deleteConfirm", {
      date: formatDate(row.date, i18n.language),
      restaurant: row.restaurantName,
      supplier: row.supplierName,
      category: row.purchaseTypeName,
    }))) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await services.deleteEntry(row.id);
      const nextTotal = Math.max(0, total - 1);
      const nextPages = Math.max(1, Math.ceil(nextTotal / EDITOR_PAGE_SIZE));
      if (page > nextPages) setPage(nextPages);
      else setReloadKey((value) => value + 1);
      onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("restaurantDailyPurchases.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const from = total ? (page - 1) * EDITOR_PAGE_SIZE + 1 : 0;
  const to = Math.min(page * EDITOR_PAGE_SIZE, total);

  return (
    <SidePanel
      open={open}
      title={t("restaurantDailyPurchases.editEntries")}
      description={t("restaurantDailyPurchases.editDescription")}
      onClose={onClose}
      closeLabel={t("restaurantDailyPurchases.closeEdit")}
      className="side-panel-majority kitchen-supplier-entry-panel"
    >
      {error ? <div className="list-inline-error" role="alert"><span>{error}</span><Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />{t("common.retry")}</Button></div> : null}
      <ListTable
        className="kitchen-supplier-entry-table-wrap"
        tableClassName="kitchen-supplier-entry-table restaurant-purchase-entry-table"
        loading={loading}
        loadingLabel={t("restaurantDailyPurchases.entriesLoading")}
        skeletonRows={EDITOR_PAGE_SIZE}
        skeletonColumns={6}
        onRefresh={() => setReloadKey((value) => value + 1)}
        header={<tr><th>{t("restaurantDailyPurchases.date")}</th><th>{t("restaurantDailyPurchases.supplier")}</th><th>{t("restaurantDailyPurchases.restaurant")}</th><th>{t("restaurantDailyPurchases.category")}</th><th>{t("restaurantDailyPurchases.amount")}</th><th>{t("restaurantDailyPurchases.actions")}</th></tr>}
      >
        {rows.map((row) => (
          <tr key={row.id}>
            <td><strong>{formatDate(row.date, i18n.language)}</strong></td>
            <td>{row.supplierName}</td>
            <td>{row.restaurantName}</td>
            <td><strong>{row.purchaseTypeName}</strong></td>
            <td><div className="kitchen-cost-record-amount"><span>HK$</span><input type="number" min="0" step="0.01" value={drafts[row.id] ?? String(row.amount)} aria-label={t("restaurantDailyPurchases.entryAmount", { restaurant: row.restaurantName, supplier: row.supplierName, category: row.purchaseTypeName })} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onBlur={(event) => void saveAmount(row, event.currentTarget.value)} /></div></td>
            <td className="table-actions-cell"><Button type="button" size="icon" variant="destructive" disabled={deletingId === row.id} aria-label={t("restaurantDailyPurchases.deleteEntry")} onClick={() => void remove(row)}><Trash2 /></Button></td>
          </tr>
        ))}
        {!loading && rows.length === 0 ? <tr><td colSpan={6} className="kitchen-cost-empty">{t("restaurantDailyPurchases.entriesEmpty")}</td></tr> : null}
      </ListTable>
      <TablePagination
        summary={t("restaurantDailyPurchases.pagination", { from, to, total })}
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((value) => Math.max(1, value - 1))}
        onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        onPageChange={setPage}
        previousLabel={t("common.previous")}
        nextLabel={t("common.next")}
        pageLabel="/"
        jumpLabel={t("restaurantDailyPurchases.jumpToPage")}
      />
    </SidePanel>
  );
}

export function RestaurantDailyPurchasesPage({
  services = defaultServices,
  canEdit: canEditOverride,
}: {
  services?: RestaurantDailyPurchaseServices;
  canEdit?: boolean;
} = {}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canEdit = canEditOverride ?? pageAccess.canAccess(RESTAURANT_DAILY_PURCHASES_EDIT);
  const [filters, setFilters] = useState<RestaurantDailyPurchaseFilters>({
    mode: "range",
    singleDate: "",
    startDate: "",
    endDate: "",
    restaurantIds: [],
    supplierIds: [],
  });
  const [rows, setRows] = useState<RestaurantDailyPurchaseRecord[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantPurchaseOption[]>([]);
  const [suppliers, setSuppliers] = useState<RestaurantPurchaseOption[]>([]);
  const [purchaseTypes, setPurchaseTypes] = useState<RestaurantPurchaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [entriesPanelOpen, setEntriesPanelOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);
    void Promise.all([services.loadRestaurants(), services.loadSuppliers(), services.loadPurchaseTypes()])
      .then(([restaurantItems, supplierItems, typeItems]) => {
        if (!active) return;
        setRestaurants(restaurantItems);
        setSuppliers(supplierItems);
        setPurchaseTypes(typeItems);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t("restaurantDailyPurchases.optionsLoadError"));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => { active = false; };
  }, [services, t]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void services.loadRecords({ filters, page: 1, pageSize: MAIN_ROW_LIMIT })
      .then((result) => {
        if (active) setRows(result.items);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t("restaurantDailyPurchases.loadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, reloadKey, services, t]);

  const updateFilters = (next: Partial<RestaurantDailyPurchaseFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  };
  const filterDate = filters.mode === "single" && filters.singleDate
    ? formatDate(filters.singleDate, i18n.language)
    : filters.mode === "range" && filters.startDate && filters.endDate
      ? t("restaurantDailyPurchases.rangeLabel", { start: formatDate(filters.startDate, i18n.language), end: formatDate(filters.endDate, i18n.language) })
      : filters.mode === "range" && filters.startDate
        ? t("restaurantDailyPurchases.fromLabel", { date: formatDate(filters.startDate, i18n.language) })
        : filters.mode === "range" && filters.endDate
          ? t("restaurantDailyPurchases.throughLabel", { date: formatDate(filters.endDate, i18n.language) })
          : t("restaurantDailyPurchases.unfilteredDate");

  return (
    <section className="ingredients-page restaurant-daily-purchases-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("restaurantDailyPurchases.eyebrow")}</span>
          <h1>{t("restaurantDailyPurchases.title")}</h1>
          <p>{t("restaurantDailyPurchases.description")}</p>
        </div>
      </header>

      <article className="panel ingredients-panel kitchen-supplier-record-panel restaurant-purchase-panel">
        <header className="kitchen-supplier-record-toolbar">
          <div className="kitchen-supplier-record-filters restaurant-purchase-filters">
            <label>
              <span>{t("restaurantDailyPurchases.dateMode")}</span>
              <select aria-label={t("restaurantDailyPurchases.dateMode")} value={filters.mode} onChange={(event) => updateFilters({ mode: event.target.value as "single" | "range" })}>
                <option value="single">{t("restaurantDailyPurchases.singleDay")}</option>
                <option value="range">{t("restaurantDailyPurchases.multipleDays")}</option>
              </select>
            </label>
            {filters.mode === "single" ? (
              <label><span>{t("restaurantDailyPurchases.date")}</span><input aria-label={t("restaurantDailyPurchases.date")} type="date" value={filters.singleDate} onChange={(event) => updateFilters({ singleDate: event.target.value })} /></label>
            ) : (
              <DateRangePicker
                startId="restaurant-purchase-filter-start"
                endId="restaurant-purchase-filter-end"
                startValue={filters.startDate}
                endValue={filters.endDate}
                onStartChange={(value) => updateFilters({ startDate: value })}
                onEndChange={(value) => updateFilters({ endDate: value })}
                startLabel={t("restaurantDailyPurchases.startDate")}
                endLabel={t("restaurantDailyPurchases.endDate")}
                legend={t("restaurantDailyPurchases.dateRange")}
              />
            )}
            <label className="kitchen-supplier-filter-select">
              <span id="restaurant-purchase-supplier-filter-label">{t("restaurantDailyPurchases.supplier")}</span>
              <MultiSelect id="restaurant-purchase-supplier-filter" labelledBy="restaurant-purchase-supplier-filter-label" options={suppliers} value={filters.supplierIds} disabled={loadingOptions} placeholder={t("restaurantDailyPurchases.supplierFilterPlaceholder")} searchPlaceholder={t("restaurantDailyPurchases.supplierSearchPlaceholder")} emptyLabel={t("restaurantDailyPurchases.supplierEmpty")} onChange={(supplierIds) => updateFilters({ supplierIds })} />
            </label>
            <label className="kitchen-supplier-filter-select">
              <span id="restaurant-purchase-restaurant-filter-label">{t("restaurantDailyPurchases.restaurant")}</span>
              <MultiSelect id="restaurant-purchase-restaurant-filter" labelledBy="restaurant-purchase-restaurant-filter-label" options={restaurants} value={filters.restaurantIds} disabled={loadingOptions} placeholder={t("restaurantDailyPurchases.restaurantFilterPlaceholder")} searchPlaceholder={t("restaurantDailyPurchases.restaurantSearchPlaceholder")} emptyLabel={t("restaurantDailyPurchases.restaurantEmpty")} onChange={(restaurantIds) => updateFilters({ restaurantIds })} />
            </label>
          </div>
          {canEdit ? <div className="kitchen-monthly-cost-actions"><Button variant="outline" onClick={() => setEntriesPanelOpen(true)}><Pencil />{t("restaurantDailyPurchases.editEntries")}</Button><Button onClick={() => setPanelOpen(true)}><Plus />{t("restaurantDailyPurchases.add")}</Button></div> : null}
        </header>

        {error ? <div className="list-inline-error" role="alert"><span>{error}</span><Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />{t("common.retry")}</Button></div> : null}

        <ListTable
          className="kitchen-monthly-cost-table-wrap"
          tableClassName="kitchen-supplier-record-table restaurant-purchase-record-table"
          loading={loading}
          loadingLabel={t("restaurantDailyPurchases.loading")}
          skeletonRows={8}
          skeletonColumns={5}
          onRefresh={() => setReloadKey((value) => value + 1)}
          header={<tr><th>{t("restaurantDailyPurchases.date")}</th><th>{t("restaurantDailyPurchases.supplier")}</th><th>{t("restaurantDailyPurchases.restaurant")}</th><th>{t("restaurantDailyPurchases.category")}</th><th>{t("restaurantDailyPurchases.total")}</th></tr>}
        >
          {rows.map((row) => (
            <tr key={`${row.restaurantId}:${row.supplierId}`}>
              <td><strong>{row.date ? formatDate(row.date, i18n.language) : filterDate}</strong></td>
              <td><strong>{row.supplierName}</strong></td>
              <td><strong>{row.restaurantName}</strong></td>
              <td><div className="kitchen-supplier-category-list">{purchaseTypes.map((type) => { const amount = row.categories.find((category) => category.id === type.id)?.amount ?? 0; return <div key={type.id}><span>{type.name}</span><strong>{money(amount, i18n.language)}</strong></div>; })}</div></td>
              <td><strong>{money(row.total, i18n.language)}</strong></td>
            </tr>
          ))}
          {!loading && rows.length === 0 ? <tr><td colSpan={5} className="kitchen-cost-empty">{t("restaurantDailyPurchases.empty")}</td></tr> : null}
        </ListTable>
      </article>

      <PurchaseRecordPanel open={panelOpen} restaurants={restaurants} suppliers={suppliers} purchaseTypes={purchaseTypes} loadingOptions={loadingOptions} saveRecord={services.saveRecord} onClose={() => setPanelOpen(false)} onSaved={() => { setPanelOpen(false); setReloadKey((value) => value + 1); }} />
      <PurchaseEntriesPanel open={entriesPanelOpen} filters={filters} services={services} onClose={() => setEntriesPanelOpen(false)} onChanged={() => setReloadKey((value) => value + 1)} />
    </section>
  );
}
