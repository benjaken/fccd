import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Copy, Leaf, Pencil, Plus, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SearchSelect } from "@/components/ui/search-select";
import {
  CollapsibleRecordSidebar,
  RecordSidebarToggle,
} from "@/components/ui/collapsible-record-sidebar";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { FROZEN_ACTION_PERMISSION_KEYS } from "@/lib/frozen-action-permissions";
import { coerceMeatQuantityInput } from "@/lib/meat-quantity";
import {
  calculateSeasoningLineCost,
  coerceGramsInput,
  deleteSeasoningRecipe,
  fetchSeasoningRecipeProducts,
  fetchSeasoningRecipes,
  fetchSeasoningRecipeSpices,
  filterSeasoningRecipeProducts,
  filterSeasoningRecipes,
  nextCopiedVersionCode,
  parseVersionCode,
  saveSeasoningRecipe,
  setSeasoningRecipeApplied,
  todaySeasoningVersionCode,
  type SeasoningRecipeLineInput,
  type SeasoningRecipeProduct,
  type SeasoningRecipeRow,
  type SeasoningRecipeSpice,
} from "@/lib/seasoning-recipes";
import { cn } from "@/lib/utils";

type ProductsLoader = () => Promise<SeasoningRecipeProduct[]>;
type RecipesLoader = () => Promise<SeasoningRecipeRow[]>;
type SpicesLoader = () => Promise<SeasoningRecipeSpice[]>;
type RecipeSaver = typeof saveSeasoningRecipe;
type RecipeDeleter = typeof deleteSeasoningRecipe;
type RecipeAppliedSaver = typeof setSeasoningRecipeApplied;

const ALL_PRODUCTS_ID = "all";
const RECIPE_SKELETON_COLUMNS = [
  { width: "5rem" },
  { width: "8rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "5rem" },
  { width: "6rem" },
  { width: "12rem" },
  { width: "4rem" },
  { width: "4rem" },
];
const RECIPE_ACTION_SKELETON = { width: "4.5rem", variant: "action" as const };

type DraftLine = {
  key: string;
  seasoningId: string;
  grams: string;
};

function newLineKey() {
  return `line-${crypto.randomUUID()}`;
}

function RecipeFormPanel({
  open,
  editing,
  products,
  spices,
  defaultProductId,
  onClose,
  onSaved,
  saveRecipe,
}: {
  open: boolean;
  editing: SeasoningRecipeRow | null;
  products: SeasoningRecipeProduct[];
  spices: SeasoningRecipeSpice[];
  defaultProductId: string | null;
  onClose: () => void;
  onSaved: () => void;
  saveRecipe: RecipeSaver;
}) {
  const { t, i18n } = useTranslation();
  const [preparedMeatItemId, setPreparedMeatItemId] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [productionKg, setProductionKg] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [draftSeasoningId, setDraftSeasoningId] = useState("");
  const [draftGrams, setDraftGrams] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const spiceById = useMemo(
    () => new Map(spices.map((spice) => [spice.id, spice])),
    [spices],
  );

  const reset = (nextEditing: SeasoningRecipeRow | null, productId: string | null) => {
    setPreparedMeatItemId(nextEditing?.preparedMeatItemId ?? productId ?? "");
    setVersionCode(
      String(nextEditing?.versionCode ?? todaySeasoningVersionCode()),
    );
    setProductionKg(
      nextEditing ? String(nextEditing.productionRawMeatKg) : "",
    );
    setLines(
      nextEditing
        ? nextEditing.lines.map((line) => ({
            key: line.id,
            seasoningId: line.seasoningId,
            grams: String(line.quantityGrams),
          }))
        : [],
    );
    setDraftSeasoningId("");
    setDraftGrams("");
    setError(null);
    setFieldErrors({});
  };

  useEffect(() => {
    if (!open) return;
    reset(editing, defaultProductId);
  }, [defaultProductId, editing, open]);

  const draftSpice = spiceById.get(draftSeasoningId) ?? null;
  const draftCost = calculateSeasoningLineCost(
    Number.parseFloat(draftGrams),
    draftSpice?.costPerGram ?? null,
  );

  const addDraftLine = () => {
    const nextErrors: Record<string, string> = {};
    if (!draftSeasoningId) {
      nextErrors.draftSeasoning = t("seasoningRecipes.validation.spiceRequired");
    }
    const grams = Number.parseFloat(draftGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      nextErrors.draftGrams = t("seasoningRecipes.validation.gramsRequired");
    }
    if (draftSeasoningId && lines.some((line) => line.seasoningId === draftSeasoningId)) {
      nextErrors.draftSeasoning = t("seasoningRecipes.validation.spiceDuplicate");
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLines((current) => [
      ...current,
      { key: newLineKey(), seasoningId: draftSeasoningId, grams: draftGrams },
    ]);
    setDraftSeasoningId("");
    setDraftGrams("");
  };

  const closeAndReset = () => {
    reset(null, null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!preparedMeatItemId) {
      nextErrors.product = t("seasoningRecipes.validation.productRequired");
    }
    const code = parseVersionCode(versionCode);
    if (code === null) {
      nextErrors.versionCode = t("seasoningRecipes.validation.codeInvalid");
    }
    const kg = Number.parseFloat(productionKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      nextErrors.productionKg = t("seasoningRecipes.validation.kgRequired");
    }
    const recipeLines: SeasoningRecipeLineInput[] = [];
    if (lines.length === 0) {
      nextErrors.lines = t("seasoningRecipes.validation.linesRequired");
    }
    for (const line of lines) {
      const grams = Number.parseFloat(line.grams);
      if (!line.seasoningId || !Number.isFinite(grams) || grams <= 0) {
        nextErrors.lines = t("seasoningRecipes.validation.lineIncomplete");
        break;
      }
      recipeLines.push({ seasoningId: line.seasoningId, quantityGrams: grams });
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length || code === null) return;

    setSubmitting(true);
    setError(null);
    try {
      await saveRecipe({
        preparedMeatItemId,
        versionCode: code,
        productionRawMeatKg: kg,
        lines: recipeLines,
        previousVersionCode: editing?.versionCode ?? null,
      });
      onSaved();
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(editing ? "seasoningRecipes.editError" : "seasoningRecipes.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(editing ? "seasoningRecipes.editTitle" : "seasoningRecipes.createTitle")}
      description={t(
        editing
          ? "seasoningRecipes.editDescription"
          : "seasoningRecipes.createDescription",
      )}
      onClose={closeAndReset}
      closeLabel={t("seasoningRecipes.closePanel")}
      wide
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("seasoningRecipes.cancel")}
          </Button>
          <Button type="submit" form="seasoning-recipe-form" disabled={submitting}>
            {submitting
              ? t("seasoningRecipes.saving")
              : t("seasoningRecipes.save")}
          </Button>
        </>
      }
    >
      <form
        id="seasoning-recipe-form"
        className="seasoning-cost-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="seasoning-cost-field">
          <span>{t("seasoningRecipes.fields.product")}</span>
          <SearchSelect
            id="seasoning-recipe-product"
            label={t("seasoningRecipes.fields.product")}
            value={preparedMeatItemId}
            options={products}
            placeholder={t("seasoningRecipes.fields.productPlaceholder")}
            searchPlaceholder={t("seasoningRecipes.searchProductPlaceholder")}
            emptyLabel={t("seasoningRecipes.emptyProducts")}
            required
            disabled={Boolean(editing)}
            invalid={Boolean(fieldErrors.product)}
            onChange={(option) => setPreparedMeatItemId(option.id)}
          />
          {fieldErrors.product ? (
            <em className="seasoning-cost-field-error">{fieldErrors.product}</em>
          ) : null}
        </label>

        <label className="seasoning-cost-field">
          <span>{t("seasoningRecipes.fields.code")}</span>
          <input
            value={versionCode}
            onChange={(event) =>
              setVersionCode(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder={t("seasoningRecipes.fields.codePlaceholder")}
            inputMode="numeric"
            aria-invalid={Boolean(fieldErrors.versionCode)}
          />
          {fieldErrors.versionCode ? (
            <em className="seasoning-cost-field-error">
              {fieldErrors.versionCode}
            </em>
          ) : (
            <small>{t("seasoningRecipes.fields.codeHint")}</small>
          )}
        </label>

        <label className="seasoning-cost-field">
          <span>{t("seasoningRecipes.fields.productionKg")}</span>
          <input
            value={productionKg}
            onChange={(event) =>
              setProductionKg(coerceMeatQuantityInput(event.target.value))
            }
            placeholder={t("seasoningRecipes.fields.productionKgPlaceholder")}
            inputMode="decimal"
            aria-invalid={Boolean(fieldErrors.productionKg)}
          />
          {fieldErrors.productionKg ? (
            <em className="seasoning-cost-field-error">
              {fieldErrors.productionKg}
            </em>
          ) : null}
        </label>

        <section className="seasoning-recipe-spice-editor">
          <header>
            <strong>{t("seasoningRecipes.fields.spices")}</strong>
            <span>{lines.length}</span>
          </header>

          {lines.length === 0 ? (
            <p className="seasoning-recipe-spice-empty">
              {t("seasoningRecipes.emptyDraftLines")}
            </p>
          ) : (
            <ul className="seasoning-recipe-draft-list">
              {lines.map((line, index) => {
                const spice = spiceById.get(line.seasoningId);
                const cost = calculateSeasoningLineCost(
                  Number.parseFloat(line.grams),
                  spice?.costPerGram ?? null,
                );
                return (
                  <li key={line.key} className="seasoning-recipe-draft-line">
                    <span className="seasoning-recipe-spice-index">
                      {index + 1}
                    </span>
                    <div>
                      <strong>{spice?.name ?? t("common.notSet")}</strong>
                      <small>
                        {line.grams}g
                        {cost === null ? "" : ` · ${money.format(cost)}`}
                      </small>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("seasoningRecipes.removeSpice")}
                      title={t("seasoningRecipes.removeSpice")}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((item) => item.key !== line.key),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {fieldErrors.lines ? (
            <em className="seasoning-cost-field-error">{fieldErrors.lines}</em>
          ) : null}

          <div className="seasoning-recipe-add-spice">
            <label className="seasoning-cost-field">
              <span>{t("seasoningRecipes.fields.spice")}</span>
              <SearchSelect
                id="seasoning-recipe-spice"
                label={t("seasoningRecipes.fields.spice")}
                value={draftSeasoningId}
                options={spices.filter(
                  (spice) =>
                    !lines.some((line) => line.seasoningId === spice.id),
                )}
                placeholder={t("seasoningRecipes.fields.spicePlaceholder")}
                searchPlaceholder={t("seasoningRecipes.searchSpicePlaceholder")}
                emptyLabel={t("seasoningRecipes.emptySpices")}
                invalid={Boolean(fieldErrors.draftSeasoning)}
                onChange={(option) => setDraftSeasoningId(option.id)}
              />
              {fieldErrors.draftSeasoning ? (
                <em className="seasoning-cost-field-error">
                  {fieldErrors.draftSeasoning}
                </em>
              ) : null}
            </label>
            <label className="seasoning-cost-field">
              <span>{t("seasoningRecipes.fields.grams")}</span>
              <input
                value={draftGrams}
                onChange={(event) =>
                  setDraftGrams(coerceGramsInput(event.target.value))
                }
                placeholder={t("seasoningRecipes.fields.gramsPlaceholder")}
                inputMode="decimal"
                aria-invalid={Boolean(fieldErrors.draftGrams)}
              />
              {fieldErrors.draftGrams ? (
                <em className="seasoning-cost-field-error">
                  {fieldErrors.draftGrams}
                </em>
              ) : null}
            </label>
            <label className="seasoning-cost-field">
              <span>{t("seasoningRecipes.fields.cost")}</span>
              <input
                value={draftCost === null ? "" : money.format(draftCost)}
                readOnly
                placeholder={t("seasoningRecipes.fields.costPlaceholder")}
              />
            </label>
            <Button type="button" variant="outline" onClick={addDraftLine}>
              <Plus />
              {t("seasoningRecipes.addSpice")}
            </Button>
          </div>
        </section>

        {error ? <p className="seasoning-cost-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function SeasoningRecipesPage({
  loadProducts = fetchSeasoningRecipeProducts,
  loadRecipes = fetchSeasoningRecipes,
  loadSpices = fetchSeasoningRecipeSpices,
  saveRecipe = saveSeasoningRecipe,
  deleteRecipe = deleteSeasoningRecipe,
  setRecipeApplied = setSeasoningRecipeApplied,
  canEdit: canEditProp,
  canDelete: canDeleteProp,
}: {
  loadProducts?: ProductsLoader;
  loadRecipes?: RecipesLoader;
  loadSpices?: SpicesLoader;
  saveRecipe?: RecipeSaver;
  deleteRecipe?: RecipeDeleter;
  setRecipeApplied?: RecipeAppliedSaver;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canEdit =
    canEditProp ??
    pageAccess.canAccess(FROZEN_ACTION_PERMISSION_KEYS.seasoningRecipes.edit);
  const canDelete =
    canDeleteProp ??
    pageAccess.canAccess(FROZEN_ACTION_PERMISSION_KEYS.seasoningRecipes.delete);
  const showRowActions = canEdit || canDelete;

  const [products, setProducts] = useState<SeasoningRecipeProduct[]>([]);
  const [recipes, setRecipes] = useState<SeasoningRecipeRow[]>([]);
  const [spices, setSpices] = useState<SeasoningRecipeSpice[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    ALL_PRODUCTS_ID,
  );
  const [productSearch, setProductSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [appliedRecipeSearch, setAppliedRecipeSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<SeasoningRecipeRow | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [copyingKey, setCopyingKey] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = () => setSidebarCollapsed((value) => !value);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const kg = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([loadProducts(), loadRecipes(), loadSpices()])
      .then(([nextProducts, nextRecipes, nextSpices]) => {
        if (cancelled) return;
        setProducts(nextProducts);
        setRecipes(nextRecipes);
        setSpices(nextSpices);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("seasoningRecipes.loadError"),
        );
        setProducts([]);
        setRecipes([]);
        setSpices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProducts, loadRecipes, loadSpices, reloadKey, t]);

  const visibleProducts = useMemo(
    () => filterSeasoningRecipeProducts(products, productSearch),
    [productSearch, products],
  );

  const selectedProductIdOrNull =
    selectedProductId && selectedProductId !== ALL_PRODUCTS_ID
      ? selectedProductId
      : null;

  const visibleRecipes = useMemo(
    () =>
      filterSeasoningRecipes(
        recipes,
        selectedProductIdOrNull,
        appliedRecipeSearch,
      ),
    [appliedRecipeSearch, recipes, selectedProductIdOrNull],
  );

  const selectedProduct =
    products.find((item) => item.id === selectedProductIdOrNull) ?? null;

  const openCreate = () => {
    setEditing(null);
    setPanelOpen(true);
    setActionError(null);
  };

  const openEdit = (row: SeasoningRecipeRow) => {
    setEditing(row);
    setPanelOpen(true);
    setActionError(null);
  };

  const handleToggle = useEffectEvent(async (
    row: SeasoningRecipeRow,
    checked: boolean,
  ) => {
    if (!canEdit || togglingKey) return;
    setTogglingKey(row.key);
    setActionError(null);
    try {
      await setRecipeApplied(row.preparedMeatItemId, row.versionCode, checked);
      setRecipes((current) =>
        current.map((item) => {
          if (item.preparedMeatItemId !== row.preparedMeatItemId) return item;
          if (item.key === row.key) return { ...item, isApplied: checked };
          return checked ? { ...item, isApplied: false } : item;
        }),
      );
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("seasoningRecipes.applyError"),
      );
    } finally {
      setTogglingKey(null);
    }
  });

  const handleDelete = useEffectEvent(async (row: SeasoningRecipeRow) => {
    if (!canDelete || deletingKey) return;
    if (!window.confirm(t("seasoningRecipes.deleteConfirm"))) return;
    setDeletingKey(row.key);
    setActionError(null);
    try {
      await deleteRecipe(row.preparedMeatItemId, row.versionCode);
      setRecipes((current) => current.filter((item) => item.key !== row.key));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("seasoningRecipes.deleteError"),
      );
    } finally {
      setDeletingKey(null);
    }
  });

  const handleCopy = useEffectEvent(async (row: SeasoningRecipeRow) => {
    if (!canEdit || copyingKey) return;
    setCopyingKey(row.key);
    setActionError(null);
    try {
      const siblingCodes = recipes
        .filter((item) => item.preparedMeatItemId === row.preparedMeatItemId)
        .map((item) => item.versionCode);
      await saveRecipe({
        preparedMeatItemId: row.preparedMeatItemId,
        versionCode: nextCopiedVersionCode(siblingCodes),
        productionRawMeatKg: row.productionRawMeatKg,
        lines: row.lines.map((line) => ({
          seasoningId: line.seasoningId,
          quantityGrams: line.quantityGrams,
        })),
      });
      setReloadKey((current) => current + 1);
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("seasoningRecipes.copyError"),
      );
    } finally {
      setCopyingKey(null);
    }
  });

  return (
    <section className="seasoning-recipes-page">
      <header className="page-heading seasoning-recipes-heading">
        <div>
          <span className="eyebrow">{t("seasoningRecipes.eyebrow")}</span>
          <h1>{t("seasoningRecipes.title")}</h1>
        </div>
      </header>

      {error ? (
        <div className="products-state products-state-error">
          <div>
            <strong>{t("seasoningRecipes.loadError")}</strong>
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {t("seasoningRecipes.retry")}
          </Button>
        </div>
      ) : (
        <div className="seasoning-recipes-layout">
          <CollapsibleRecordSidebar
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            hideLabel={t("common.hideSidebar")}
            showLabel={t("common.showSidebar")}
            className="spice-usage-sidebar seasoning-recipes-sidebar panel"
            aria-label={t("seasoningRecipes.products")}
          >
            <div className="spice-usage-sidebar-header">
              <strong>{t("seasoningRecipes.products")}</strong>
              <div className="seasoning-recipes-sidebar-actions">
                <span>{products.length}</span>
                <RecordSidebarToggle
                  collapsed={sidebarCollapsed}
                  onToggle={toggleSidebar}
                  hideLabel={t("common.hideSidebar")}
                  showLabel={t("common.showSidebar")}
                />
              </div>
            </div>
            <div className="seasoning-recipes-product-search">
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder={t("seasoningRecipes.searchProductPlaceholder")}
                aria-label={t("seasoningRecipes.searchProductPlaceholder")}
              />
            </div>
            {loading && products.length === 0 ? (
              <ul className="spice-usage-side-list" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <li key={`product-skeleton-${index}`}>
                    <span className="spice-usage-side-item is-skeleton">
                      <span
                        className="table-skeleton-bone spice-usage-skeleton-side"
                        style={{ width: `${58 + ((index * 13) % 28)}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="spice-usage-side-list">
                <li>
                  <button
                    type="button"
                    className={cn(
                      "spice-usage-side-item",
                      selectedProductId === ALL_PRODUCTS_ID && "active",
                    )}
                    aria-current={
                      selectedProductId === ALL_PRODUCTS_ID ? "true" : undefined
                    }
                    onClick={() => setSelectedProductId(ALL_PRODUCTS_ID)}
                  >
                    {t("seasoningRecipes.allProducts")}
                  </button>
                </li>
                {visibleProducts.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className={cn(
                        "spice-usage-side-item",
                        selectedProductId === product.id && "active",
                      )}
                      aria-current={
                        selectedProductId === product.id ? "true" : undefined
                      }
                      onClick={() => setSelectedProductId(product.id)}
                    >
                      {product.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleRecordSidebar>

          <article className="seasoning-recipes-main panel">
            <header className="seasoning-cost-toolbar">
              <ListSearchBar
                id="seasoning-recipe-search"
                value={recipeSearch}
                onChange={setRecipeSearch}
                onSubmit={() => setAppliedRecipeSearch(recipeSearch.trim())}
                label={t("seasoningRecipes.search")}
                placeholder={t("seasoningRecipes.searchPlaceholder")}
                submitLabel={t("seasoningRecipes.searchAction")}
                actions={
                  canEdit ? (
                    <Button type="button" onClick={openCreate}>
                      <Plus />
                      {t("seasoningRecipes.add")}
                    </Button>
                  ) : null
                }
              />
            </header>

            {actionError ? <p className="list-inline-error">{actionError}</p> : null}

            {selectedProduct ? (
              <p className="seasoning-recipes-filter-label">
                {t("seasoningRecipes.showingProduct", {
                  name: selectedProduct.name,
                })}
              </p>
            ) : null}

            <ListTable
              className="seasoning-recipes-table-wrap"
              onRefresh={() => setReloadKey((current) => current + 1)}
              loading={loading}
              loadingLabel={t("seasoningRecipes.loading")}
              skeletonRows={6}
              skeletonColumns={
                showRowActions
                  ? [...RECIPE_SKELETON_COLUMNS, RECIPE_ACTION_SKELETON]
                  : RECIPE_SKELETON_COLUMNS
              }
              header={
                <tr>
                  <th>{t("seasoningRecipes.columns.code")}</th>
                  <th>{t("seasoningRecipes.columns.product")}</th>
                  <th>{t("seasoningRecipes.columns.totalCost")}</th>
                  <th>{t("seasoningRecipes.columns.productionKg")}</th>
                  <th>{t("seasoningRecipes.columns.seasoningPerKg")}</th>
                  <th>{t("seasoningRecipes.columns.rawMeat")}</th>
                  <th>{t("seasoningRecipes.columns.spices")}</th>
                  {canEdit ? (
                    <th>{t("seasoningRecipes.columns.copy")}</th>
                  ) : null}
                  <th>{t("seasoningRecipes.columns.status")}</th>
                  {showRowActions ? (
                    <th aria-label={t("seasoningRecipes.columns.actions")} />
                  ) : null}
                </tr>
              }
            >
              {visibleRecipes.map((row) => (
                <tr key={row.key}>
                  <td>{row.versionCode}</td>
                  <td>
                    <strong>{row.preparedMeatName}</strong>
                  </td>
                  <td>{money.format(row.totalCost)}</td>
                  <td>{`${kg.format(row.productionRawMeatKg)} kg`}</td>
                  <td>
                    {row.seasoningPerKg === null
                      ? t("common.notSet")
                      : money.format(row.seasoningPerKg)}
                  </td>
                  <td>{row.rawMeatName || t("common.notSet")}</td>
                  <td className="seasoning-recipe-spice-cell">
                    <div className="seasoning-recipe-spice-list">
                      {row.lines.map((line, index) => (
                        <article
                          key={line.id}
                          className="seasoning-recipe-spice-card"
                        >
                          <strong>
                            <span className="seasoning-recipe-spice-index">
                              {index + 1}.
                            </span>
                            {line.seasoningName}
                          </strong>
                          <small>{`${line.quantityGrams}g`}</small>
                          <small>{money.format(line.totalCost)}</small>
                        </article>
                      ))}
                    </div>
                  </td>
                  {canEdit ? (
                    <td>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={copyingKey === row.key}
                        aria-label={t("seasoningRecipes.copy")}
                        title={t("seasoningRecipes.copy")}
                        onClick={() => {
                          void handleCopy(row);
                        }}
                      >
                        <Copy />
                      </Button>
                    </td>
                  ) : null}
                  <td>
                    <Switch
                      checked={row.isApplied}
                      disabled={!canEdit || togglingKey === row.key}
                      aria-label={t("seasoningRecipes.toggleStatus", {
                        name: row.preparedMeatName,
                        code: row.versionCode,
                      })}
                      onCheckedChange={(checked) => {
                        void handleToggle(row, checked);
                      }}
                    />
                  </td>
                  {showRowActions ? (
                    <td className="table-actions-cell">
                      <div className="table-row-actions">
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t("seasoningRecipes.edit")}
                            title={t("seasoningRecipes.edit")}
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
                            disabled={deletingKey === row.key}
                            aria-label={t("seasoningRecipes.delete")}
                            title={t("seasoningRecipes.delete")}
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

            {!loading && visibleRecipes.length === 0 ? (
              <div className="products-state products-state-empty">
                <Leaf />
                <div>
                  <strong>{t("seasoningRecipes.empty")}</strong>
                  <span>{t("seasoningRecipes.emptyDescription")}</span>
                </div>
                {canEdit ? (
                  <Button type="button" onClick={openCreate}>
                    <Plus />
                    {t("seasoningRecipes.add")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        </div>
      )}

      <RecipeFormPanel
        open={panelOpen}
        editing={editing}
        products={products}
        spices={spices}
        defaultProductId={selectedProductIdOrNull}
        onClose={() => {
          setPanelOpen(false);
          setEditing(null);
        }}
        onSaved={() => setReloadKey((current) => current + 1)}
        saveRecipe={saveRecipe}
      />
    </section>
  );
}
