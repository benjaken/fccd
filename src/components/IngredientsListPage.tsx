import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Leaf,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  KITCHEN_INGREDIENTS_EDIT,
  KITCHEN_INGREDIENTS_DELETE,
} from "@/lib/kitchen-action-permissions";
import {
  INGREDIENTS_PAGE_SIZE,
  archiveIngredient,
  createIngredient,
  fetchIngredients,
  fetchSupplierOptions,
  updateIngredient,
  type IngredientListItem,
  type IngredientStatusFilter,
  type IngredientWriteInput,
} from "@/lib/ingredients";
import { useDeferredFilter } from "@/lib/use-deferred-filter";

type IngredientsLoader = (filters: {
  page: number;
  search: string;
  status: IngredientStatusFilter;
  sortField: "name" | "sku" | "cost" | "createdAt";
  sortAscending: boolean;
}) => Promise<{ items: IngredientListItem[]; total: number }>;
type SupplierOptionsLoader = () => Promise<Array<{ id: string; name: string }>>;
type IngredientCreator = typeof createIngredient;
type IngredientUpdater = typeof updateIngredient;
type IngredientDeleter = typeof archiveIngredient;

const INGREDIENT_SKELETON_COLUMNS = [
  { width: "6rem" },
  { width: "10rem" },
  { width: "6rem" },
  { width: "7rem" },
  { width: "7rem" },
  { width: "8rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "6rem" },
];
const INGREDIENT_ACTION_SKELETON = {
  width: "8rem",
  variant: "action" as const,
};

const STATUS_OPTIONS: Array<{
  value: IngredientStatusFilter;
  labelKey: string;
}> = [
  { value: "", labelKey: "ingredients.allStatuses" },
  { value: "active", labelKey: "ingredients.statuses.active" },
  { value: "inactive", labelKey: "ingredients.statuses.inactive" },
];

function IngredientFormPanel({
  open,
  ingredient,
  onClose,
  onSaved,
  supplierOptions,
  createIngredient,
  updateIngredient,
}: {
  open: boolean;
  ingredient: IngredientListItem | null;
  onClose: () => void;
  onSaved: (row: IngredientListItem, mode: "create" | "edit") => void;
  supplierOptions: Array<{ id: string; name: string }>;
  createIngredient: IngredientCreator;
  updateIngredient: IngredientUpdater;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ingredientType, setIngredientType] = useState("");
  const [productUnit, setProductUnit] = useState("");
  const [stocktakeUnit, setStocktakeUnit] = useState("");
  const [description, setDescription] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [costPerProductUnit, setCostPerProductUnit] = useState("");
  const [costPerStocktakeUnit, setCostPerStocktakeUnit] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isIngredientStocktake, setIsIngredientStocktake] = useState(false);
  const [isPackingStocktake, setIsPackingStocktake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const editing = Boolean(ingredient);

  useEffect(() => {
    if (!open) return;
    setName(ingredient?.name ?? "");
    setSku(ingredient?.sku ?? "");
    setIngredientType(ingredient?.ingredientType ?? "");
    setProductUnit(ingredient?.productUnit ?? "");
    setStocktakeUnit(ingredient?.stocktakeUnit ?? "");
    setDescription(ingredient?.description ?? "");
    setProductQuantity(
      ingredient?.productQuantity != null
        ? String(ingredient.productQuantity)
        : "",
    );
    setCostPerProductUnit(
      ingredient?.costPerProductUnit != null
        ? String(ingredient.costPerProductUnit)
        : "",
    );
    setCostPerStocktakeUnit(
      ingredient?.costPerStocktakeUnit != null
        ? String(ingredient.costPerStocktakeUnit)
        : "",
    );
    setSupplierId(ingredient?.supplierId ?? "");
    setIsActive(ingredient?.isActive ?? true);
    setIsIngredientStocktake(
      ingredient?.isIngredientStocktake ?? false,
    );
    setIsPackingStocktake(ingredient?.isPackingStocktake ?? false);
    setError(null);
    setNameError(null);
  }, [open, ingredient]);

  const closeAndReset = () => {
    setError(null);
    setNameError(null);
    onClose();
  };

  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t("ingredients.validation.nameRequired"));
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setError(null);
    const payload: IngredientWriteInput = {
      name,
      sku: sku || null,
      ingredientType: ingredientType || null,
      productUnit: productUnit || null,
      stocktakeUnit: stocktakeUnit || null,
      description: description || null,
      productQuantity: parseOptionalNumber(productQuantity),
      costPerProductUnit: parseOptionalNumber(costPerProductUnit),
      costPerStocktakeUnit: parseOptionalNumber(costPerStocktakeUnit),
      supplierId: supplierId || null,
      isActive,
      isIngredientStocktake,
      isPackingStocktake,
    };
    try {
      const row = ingredient
        ? await updateIngredient(ingredient.id, payload)
        : await createIngredient(payload);
      onSaved(row, ingredient ? "edit" : "create");
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(editing ? "ingredients.editError" : "ingredients.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(
        editing ? "ingredients.editTitle" : "ingredients.createTitle",
      )}
      description={t(
        editing ? "ingredients.editDescription" : "ingredients.createDescription",
      )}
      onClose={closeAndReset}
      closeLabel={t("ingredients.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("ingredients.cancel")}
          </Button>
          <Button type="submit" form="ingredient-form" disabled={submitting}>
            {submitting
              ? t("ingredients.saving")
              : t("ingredients.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="ingredient-form"
        className="ingredients-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="ingredients-field">
          <span>{t("ingredients.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("ingredients.fields.namePlaceholder")}
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="ingredients-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="ingredients-field">
          <span>{t("ingredients.fields.sku")}</span>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder={t("ingredients.fields.skuPlaceholder")}
          />
        </label>
        <label className="ingredients-field">
          <span>{t("ingredients.fields.ingredientType")}</span>
          <input
            value={ingredientType}
            onChange={(event) => setIngredientType(event.target.value)}
            placeholder={t("ingredients.fields.ingredientTypePlaceholder")}
          />
        </label>
        <div className="ingredients-field-row">
          <label className="ingredients-field">
            <span>{t("ingredients.fields.productUnit")}</span>
            <input
              value={productUnit}
              onChange={(event) => setProductUnit(event.target.value)}
              placeholder={t("ingredients.fields.productUnitPlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("ingredients.fields.stocktakeUnit")}</span>
            <input
              value={stocktakeUnit}
              onChange={(event) => setStocktakeUnit(event.target.value)}
              placeholder={t("ingredients.fields.stocktakeUnitPlaceholder")}
            />
          </label>
        </div>
        <label className="ingredients-field">
          <span>{t("ingredients.fields.supplier")}</span>
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">{t("ingredients.fields.noSupplier")}</option>
            {supplierOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ingredients-field-row">
          <label className="ingredients-field">
            <span>{t("ingredients.fields.productQuantity")}</span>
            <input
              value={productQuantity}
              onChange={(event) => setProductQuantity(event.target.value)}
              placeholder={t("ingredients.fields.productQuantityPlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("ingredients.fields.costPerProductUnit")}</span>
            <input
              value={costPerProductUnit}
              onChange={(event) => setCostPerProductUnit(event.target.value)}
              placeholder={t("ingredients.fields.costPlaceholder")}
            />
          </label>
        </div>
        <label className="ingredients-field">
          <span>{t("ingredients.fields.costPerStocktakeUnit")}</span>
          <input
            value={costPerStocktakeUnit}
            onChange={(event) => setCostPerStocktakeUnit(event.target.value)}
            placeholder={t("ingredients.fields.costPlaceholder")}
          />
        </label>
        <label className="ingredients-field">
          <span>{t("ingredients.fields.description")}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("ingredients.fields.descriptionPlaceholder")}
            rows={3}
          />
        </label>
        <label className="ingredients-field ingredients-field-switch">
          <span>{t("ingredients.fields.isActive")}</span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        </label>
        <label className="ingredients-field ingredients-field-switch">
          <span>{t("ingredients.fields.isIngredientStocktake")}</span>
          <input
            type="checkbox"
            checked={isIngredientStocktake}
            onChange={(event) =>
              setIsIngredientStocktake(event.target.checked)
            }
          />
        </label>
        <label className="ingredients-field ingredients-field-switch">
          <span>{t("ingredients.fields.isPackingStocktake")}</span>
          <input
            type="checkbox"
            checked={isPackingStocktake}
            onChange={(event) => setIsPackingStocktake(event.target.checked)}
          />
        </label>
        {error ? <p className="ingredients-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function IngredientsListPage({
  loadIngredients = fetchIngredients,
  loadSupplierOptions = fetchSupplierOptions,
  createIngredient: createIngredientProp = createIngredient,
  updateIngredient: updateIngredientProp = updateIngredient,
  deleteIngredient = archiveIngredient,
  canEdit: canEditProp,
  canDelete: canDeleteProp,
}: {
  loadIngredients?: IngredientsLoader;
  loadSupplierOptions?: SupplierOptionsLoader;
  createIngredient?: IngredientCreator;
  updateIngredient?: IngredientUpdater;
  deleteIngredient?: IngredientDeleter;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canEdit = canEditProp ?? pageAccess.canAccess(KITCHEN_INGREDIENTS_EDIT);
  const canDelete =
    canDeleteProp ?? pageAccess.canAccess(KITCHEN_INGREDIENTS_DELETE);
  const showRowActions = canEdit || canDelete;

  const [rows, setRows] = useState<IngredientListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<IngredientStatusFilter>("");
  const statusFilter = useDeferredFilter(status, setStatus);
  const [sortField, setSortField] = useState<
    "name" | "sku" | "cost" | "createdAt"
  >("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [supplierOptions, setSupplierOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }),
    [i18n.language],
  );

  useEffect(() => {
    let cancelled = false;
    void loadSupplierOptions()
      .then((options) => {
        if (cancelled) return;
        setSupplierOptions(options);
      })
      .catch(() => {
        if (cancelled) return;
        setSupplierOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSupplierOptions]);

  const applied = useMemo(
    () => ({ search: appliedSearch, status }),
    [appliedSearch, status],
  );

  useEffect(() => {
    setPage(1);
  }, [applied]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadIngredients({
      page,
      search: appliedSearch,
      status,
      sortField,
      sortAscending,
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        const code =
          typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
            ? loadError.code
            : "ingredients_load_failed";
        setError(code);
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    appliedSearch,
    loadIngredients,
    page,
    reloadKey,
    sortAscending,
    sortField,
    status,
  ]);

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
  };

  const toggleSort = (field: "name" | "sku" | "cost" | "createdAt") => {
    setPage(1);
    if (sortField === field) {
      setSortAscending((current) => !current);
      return;
    }
    setSortField(field);
    setSortAscending(true);
  };

  const sortIcon = (field: "name" | "sku" | "cost" | "createdAt") => {
    if (sortField !== field) return null;
    return sortAscending ? <ArrowUp /> : <ArrowDown />;
  };

  const openCreate = () => {
    if (!canEdit) return;
    setEditingIngredient(null);
    setPanelOpen(true);
  };

  const openEdit = (row: IngredientListItem) => {
    if (!canEdit) return;
    setEditingIngredient(row);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingIngredient(null);
  };

  const handleDelete = async (row: IngredientListItem) => {
    if (!canDelete || deletingId) return;
    const confirmed = window.confirm(
      t("ingredients.deleteConfirm", { ingredient: row.name }),
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteIngredient(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setTotal((current) => Math.max(0, current - 1));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("ingredients.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (row: IngredientListItem, next: boolean) => {
    if (!canEdit || row.isActive === next) return;
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, isActive: next } : item,
      ),
    );
    setActionError(null);
    try {
      const updated = await updateIngredientProp(row.id, {
        name: row.name,
        sku: row.sku,
        ingredientType: row.ingredientType,
        productUnit: row.productUnit,
        stocktakeUnit: row.stocktakeUnit,
        description: row.description,
        productQuantity: row.productQuantity,
        costPerProductUnit: row.costPerProductUnit,
        costPerStocktakeUnit: row.costPerStocktakeUnit,
        supplierId: row.supplierId,
        isActive: next,
        isIngredientStocktake: row.isIngredientStocktake,
        isPackingStocktake: row.isPackingStocktake,
      });
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, isActive: updated.isActive }
            : item,
        ),
      );
    } catch (saveError) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, isActive: row.isActive } : item,
        ),
      );
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("ingredients.toggleStatusError"),
      );
    }
  };

  const mergeRow = (row: IngredientListItem, mode: "create" | "edit") => {
    setRows((current) =>
      mode === "create"
        ? [row, ...current.filter((item) => item.id !== row.id)]
        : current.map((item) => (item.id === row.id ? row : item)),
    );
    setTotal((current) => (mode === "create" ? current + 1 : current));
  };

  const totalPages = Math.max(1, Math.ceil(total / INGREDIENTS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * INGREDIENTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * INGREDIENTS_PAGE_SIZE, total);

  const formatCost = (value: number | null) =>
    value === null ? t("common.notSet") : currencyFormatter.format(value);

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t("ingredients.title")}</h1>
          <p>{t("ingredients.description")}</p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openCreate}>
            <Pencil />
            {t("ingredients.add")}
          </Button>
        ) : null}
      </header>

      <article className="panel ingredients-panel">
        <header className="ingredients-toolbar">
          <ListSearchBar
            id="ingredients-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("ingredients.search")}
            placeholder={t("ingredients.searchPlaceholder")}
            submitLabel={t("ingredients.searchAction")}
            filtersActive={Boolean(status)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <label className="ingredients-status-filter">
                <span>{t("ingredients.statusFilter")}</span>
                <select
                  value={statusFilter.value}
                  onChange={(event) =>
                    statusFilter.setValue(
                      event.target.value as IngredientStatusFilter,
                    )
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>
                {error === "42P01"
                  ? t("ingredients.migrationPending")
                  : t("ingredients.loadError")}
              </strong>
              <span>{t("ingredients.loadErrorDescription")}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              <RefreshCw />
              {t("ingredients.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Leaf />
            <div>
              <strong>{t("ingredients.empty")}</strong>
              <span>{t("ingredients.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="ingredients-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("ingredients.loading")}
            skeletonRows={INGREDIENTS_PAGE_SIZE}
            skeletonColumns={
              showRowActions
                ? [...INGREDIENT_SKELETON_COLUMNS, INGREDIENT_ACTION_SKELETON]
                : INGREDIENT_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => toggleSort("sku")}
                  >
                    {t("ingredients.columns.sku")}
                    {sortIcon("sku")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => toggleSort("name")}
                  >
                    {t("ingredients.columns.name")}
                    {sortIcon("name")}
                  </button>
                </th>
                <th>{t("ingredients.columns.productUnit")}</th>
                <th>{t("ingredients.columns.stocktakeUnit")}</th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => toggleSort("cost")}
                  >
                    {t("ingredients.columns.costPerStocktakeUnit")}
                    {sortIcon("cost")}
                  </button>
                </th>
                <th>{t("ingredients.columns.supplier")}</th>
                <th>{t("ingredients.columns.type")}</th>
                <th>{t("ingredients.columns.status")}</th>
                <th>{t("ingredients.columns.isIngredientStocktake")}</th>
                <th>{t("ingredients.columns.isPackingStocktake")}</th>
                {showRowActions ? (
                  <th aria-label={t("ingredients.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.sku || t("common.notSet")}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{row.productUnit || t("common.notSet")}</td>
                <td>{row.stocktakeUnit || t("common.notSet")}</td>
                <td>{formatCost(row.costPerStocktakeUnit)}</td>
                <td>{row.supplierName || t("common.notSet")}</td>
                <td>{row.ingredientType || t("common.notSet")}</td>
                <td>
                  <div className="ingredients-status-cell">
                    <Switch
                      checked={row.isActive}
                      disabled={!canEdit}
                      onCheckedChange={(next) => {
                        void handleToggleStatus(row, next);
                      }}
                      aria-label={t(
                        row.isActive
                          ? "ingredients.toggleStatusToInactive"
                          : "ingredients.toggleStatusToActive",
                        { ingredient: row.name },
                      )}
                    />
                    <span
                      className={
                        row.isActive
                          ? "ingredients-status-text ingredients-status-text-active"
                          : "ingredients-status-text ingredients-status-text-inactive"
                      }
                    >
                      {row.isActive
                        ? t("ingredients.statuses.active")
                        : t("ingredients.statuses.inactive")}
                    </span>
                  </div>
                </td>
                <td>{row.isIngredientStocktake ? "✓" : "—"}</td>
                <td>{row.isPackingStocktake ? "✓" : "—"}</td>
                {showRowActions ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={t("ingredients.edit")}
                          title={t("ingredients.edit")}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={deletingId === row.id}
                          aria-label={t("ingredients.delete")}
                          title={t("ingredients.delete")}
                          onClick={() => {
                            void handleDelete(row);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("ingredients.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
          })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          onPageChange={setPage}
          previousLabel={t("ingredients.previous")}
          nextLabel={t("ingredients.next")}
          pageLabel={t("ingredients.pageOf")}
          jumpLabel={t("ingredients.jumpToPage")}
        />
      </article>

      <IngredientFormPanel
        open={panelOpen && (!editingIngredient || canEdit)}
        ingredient={editingIngredient}
        onClose={closePanel}
        supplierOptions={supplierOptions}
        createIngredient={createIngredientProp}
        updateIngredient={updateIngredientProp}
        onSaved={(row, mode) => {
          mergeRow(row, mode);
          closePanel();
        }}
      />
    </section>
  );
}
