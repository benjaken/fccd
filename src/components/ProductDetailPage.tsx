import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ProductRecommendStar } from "@/components/ProductRecommendStar";
import { ProductTagList } from "@/components/ProductTagList";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  addProductLabel,
  addProductPremiumIngredient,
  fetchProductDetail,
  fetchProductEditOptions,
  productIngredientCost,
  removeProductLabel,
  removeProductPremiumIngredient,
  searchProductIngredients,
  updateProduct,
  type CatalogOption,
  type ProductDetail,
  type ProductEditOptions,
  type ProductUpdateInput,
} from "@/lib/products";
import { cn } from "@/lib/utils";

type DetailLoader = (id: string) => Promise<ProductDetail | null>;
type OptionsLoader = (channelId?: string) => Promise<ProductEditOptions>;
type ProductSaver = (id: string, input: ProductUpdateInput) => Promise<void>;
type IngredientSearcher = (term: string) => Promise<CatalogOption[]>;

type ProductFormState = {
  name: string;
  chineseName: string;
  sku: string;
  description: string;
  price: string;
  status: string;
  isBentoRecommended: boolean;
  channelId: string;
  productTypeId: string;
  cookTypeId: string;
  collectionIds: string[];
};

const EMPTY_OPTIONS: ProductEditOptions = {
  channels: [],
  productTypes: [],
  cookTypes: [],
  collections: [],
  packingMaterials: [],
  catalogIngredients: [],
};

function RequiredMark() {
  return (
    <span className="product-required" aria-hidden="true">
      *
    </span>
  );
}

function DetailField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="detail-field">
      <span>
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <strong>{children}</strong>
    </div>
  );
}

function formFromProduct(product: ProductDetail): ProductFormState {
  return {
    name: product.name ?? "",
    chineseName: product.chineseName ?? "",
    sku: product.sku ?? "",
    description: product.description ?? "",
    price: product.price === null ? "" : String(product.price),
    status: product.status ?? "",
    isBentoRecommended: product.isBentoRecommended,
    channelId: product.channelId ?? "",
    productTypeId: product.productTypeId ?? "",
    cookTypeId: product.cookTypeId ?? "",
    collectionIds: product.collections.map((item) => item.id),
  };
}

function parseMoney(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function ProductDetailPage({
  canEdit = false,
  loadDetail = fetchProductDetail,
  loadEditOptions = fetchProductEditOptions,
  saveProduct = updateProduct,
  searchIngredients = searchProductIngredients,
  addIngredient = addProductPremiumIngredient,
  removeIngredient = removeProductPremiumIngredient,
  addLabel = addProductLabel,
  removeLabel = removeProductLabel,
}: {
  canEdit?: boolean;
  loadDetail?: DetailLoader;
  loadEditOptions?: OptionsLoader;
  saveProduct?: ProductSaver;
  searchIngredients?: IngredientSearcher;
  addIngredient?: typeof addProductPremiumIngredient;
  removeIngredient?: typeof removeProductPremiumIngredient;
  addLabel?: typeof addProductLabel;
  removeLabel?: typeof removeProductLabel;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams();
  const editing = location.pathname.endsWith("/edit");
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [options, setOptions] = useState<ProductEditOptions>(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [ingredientId, setIngredientId] = useState("");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientQty, setIngredientQty] = useState("1");
  const [ingredientResults, setIngredientResults] = useState<CatalogOption[]>([]);
  const [ingredientMenuOpen, setIngredientMenuOpen] = useState(false);
  const [ingredientHighlight, setIngredientHighlight] = useState(0);
  const [searchingIngredients, setSearchingIngredients] = useState(false);
  const ingredientSearchRef = useRef<HTMLDivElement>(null);
  const [labelDisplayA, setLabelDisplayA] = useState("");
  const [labelDisplayB, setLabelDisplayB] = useState("");
  const [labelPackingId, setLabelPackingId] = useState("");
  const [adding, setAdding] = useState<"ingredient" | "label" | null>(null);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await loadDetail(id);
      setProduct(detail);
      if (detail) setForm(formFromProduct(detail));
    } catch (loadError) {
      setError(
        typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
          ? loadError.code
          : "product_detail_failed",
      );
      setProduct(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [id, loadDetail, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing || !canEdit) return;
    let active = true;
    void loadEditOptions(form?.channelId || product?.channelId || "")
      .then((next) => {
        if (active) setOptions(next);
      })
      .catch(() => {
        if (active) setOptions(EMPTY_OPTIONS);
      });
    return () => {
      active = false;
    };
  }, [canEdit, editing, form?.channelId, loadEditOptions, product?.channelId]);

  const addedIngredientIds = useMemo(
    () => new Set((product?.premiumIngredients ?? []).map((item) => item.ingredientId)),
    [product],
  );

  useEffect(() => {
    if (!editing || ingredientId) return;

    const term = ingredientQuery.trim();
    if (!term) {
      setIngredientResults([]);
      setSearchingIngredients(false);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearchingIngredients(true);
      void searchIngredients(term)
        .then((rows) => {
          if (!active) return;
          setIngredientResults(rows.filter((row) => !addedIngredientIds.has(row.id)));
        })
        .catch(() => {
          if (!active) return;
          setIngredientResults([]);
        })
        .finally(() => {
          if (active) setSearchingIngredients(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [addedIngredientIds, editing, ingredientId, ingredientQuery, searchIngredients]);

  useEffect(() => {
    setIngredientHighlight(0);
  }, [ingredientResults]);

  useEffect(() => {
    if (!ingredientMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ingredientSearchRef.current?.contains(event.target as Node)) {
        setIngredientMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ingredientMenuOpen]);

  if (editing && !canEdit) {
    return <Navigate to={`/products/${id}`} replace />;
  }

  if (loading) {
    return (
      <PageSkeleton
        cards={2}
        label={t("productDetail.loading")}
        variant="detail"
      />
    );
  }

  if (error || !product || !form) {
    return (
      <div className="detail-state detail-state-error" role="alert">
        <ShoppingBasket />
        <div>
          <strong>{t("productDetail.notFound")}</strong>
          <span>{t("productDetail.notFoundDescription")}</span>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw />
          {t("productDetail.retry")}
        </Button>
      </div>
    );
  }

  const money = (value: number | null) =>
    value === null ? t("common.notSet") : currency.format(value);
  const displayName = product.chineseName || product.name;
  const statusLabel =
    product.status === "Active"
      ? t("products.statusActive")
      : product.status === "Inactive"
        ? t("products.statusInactive")
        : product.status || t("products.statusUnset");
  const statusTone =
    product.status === "Active"
      ? "green"
      : product.status === "Inactive"
        ? "amber"
        : "blue";
  const ingredientCost = productIngredientCost(product.premiumIngredients);

  const refreshDetail = async () => {
    const detail = await loadDetail(id);
    setProduct(detail);
    if (detail) setForm(formFromProduct(detail));
  };

  const patchForm = (partial: Partial<ProductFormState>) => {
    setForm((current) => (current ? { ...current, ...partial } : current));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.sku.trim()) nextErrors.sku = t("productDetail.validation.skuRequired");
    if (!form.name.trim()) nextErrors.name = t("productDetail.validation.nameRequired");
    if (!form.channelId) nextErrors.channelId = t("productDetail.validation.channelRequired");
    if (!form.productTypeId) nextErrors.productTypeId = t("productDetail.validation.typeRequired");
    if (!form.status) nextErrors.status = t("productDetail.validation.statusRequired");
    const price = parseMoney(form.price);
    if (price === null || Number.isNaN(price)) {
      nextErrors.price = t("productDetail.validation.priceInvalid");
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setSaveError(null);
    try {
      await saveProduct(product.id, {
        name: form.name,
        chineseName: form.chineseName,
        sku: form.sku,
        description: form.description,
        price,
        status: form.status,
        isActive: form.status !== "Inactive",
        isBentoRecommended: form.isBentoRecommended,
        channelId: form.channelId || null,
        productTypeId: form.productTypeId || null,
        cookTypeId: form.cookTypeId || null,
        collectionIds: form.collectionIds,
      });
      navigate(`/products/${product.id}`);
    } catch (submitError) {
      const code =
        typeof submitError === "object" &&
        submitError &&
        "code" in submitError &&
        typeof submitError.code === "string"
          ? submitError.code
          : "save_failed";
      setSaveError(code);
    } finally {
      setSaving(false);
    }
  };

  const selectField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    items: CatalogOption[],
    errorKey?: string,
    required = false,
  ) => (
    <label className="detail-field">
      <span>
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("common.notSet")}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {errorKey && fieldErrors[errorKey] ? <em>{fieldErrors[errorKey]}</em> : null}
    </label>
  );

  const textField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    errorKey?: string,
    type = "text",
    required = false,
  ) => (
    <label className="detail-field">
      <span>
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {errorKey && fieldErrors[errorKey] ? <em>{fieldErrors[errorKey]}</em> : null}
    </label>
  );

  const selectIngredient = (item: CatalogOption) => {
    setIngredientId(item.id);
    setIngredientQuery(item.name);
    setIngredientResults([item]);
    setIngredientMenuOpen(false);
  };

  const handleIngredientSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIngredientMenuOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIngredientMenuOpen(true);
      setIngredientHighlight((index) =>
        ingredientResults.length === 0
          ? 0
          : Math.min(index + 1, ingredientResults.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIngredientHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const item = ingredientResults[ingredientHighlight];
      if (ingredientMenuOpen && item) {
        event.preventDefault();
        selectIngredient(item);
      }
    }
  };

  const handleAddIngredient = async () => {
    if (!ingredientId) return;
    const quantity = Number.parseFloat(ingredientQty);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setAdding("ingredient");
    try {
      await addIngredient(product.id, ingredientId, quantity);
      setIngredientId("");
      setIngredientQuery("");
      setIngredientResults([]);
      setIngredientQty("1");
      await refreshDetail();
    } finally {
      setAdding(null);
    }
  };

  const handleAddLabel = async () => {
    if (!labelDisplayA.trim() && !labelDisplayB.trim()) return;
    setAdding("label");
    try {
      await addLabel(product.id, {
        displayA: labelDisplayA,
        displayB: labelDisplayB,
        packingMaterialId: labelPackingId || null,
      });
      setLabelDisplayA("");
      setLabelDisplayB("");
      setLabelPackingId("");
      await refreshDetail();
    } finally {
      setAdding(null);
    }
  };

  return (
    <section className={cn("detail-page", editing && "is-editing")}>
      <header className="page-heading">
        <div>
          <nav className="detail-breadcrumb" aria-label={t("productDetail.breadcrumb")}>
            <Link to="/products">{t("productDetail.listCrumb")}</Link>
            <span aria-hidden="true">›</span>
            <span>{displayName}</span>
          </nav>
          <span className="eyebrow">
            {editing ? t("productDetail.editEyebrow") : t("productDetail.eyebrow")}
          </span>
          <h1>{displayName}</h1>
          <p>{product.sku || t("common.notSet")}</p>
        </div>
        <div className="heading-actions">
          <span className={cn("status-badge", statusTone)}>{statusLabel}</span>
          <ProductRecommendStar
            recommended={
              editing ? form.isBentoRecommended : product.isBentoRecommended
            }
            label={
              (editing ? form.isBentoRecommended : product.isBentoRecommended)
                ? t("products.recommendedOn")
                : t("products.recommendedOff")
            }
            onToggle={
              editing
                ? () =>
                    patchForm({ isBentoRecommended: !form.isBentoRecommended })
                : undefined
            }
          />
          {canEdit && !editing ? (
            <Button asChild>
              <Link to={`/products/${product.id}/edit`}>
                <Pencil />
                {t("productDetail.editAction")}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <form
        id="product-edit-form"
        className={cn("product-detail-form", editing && "is-editing")}
        onSubmit={submit}
      >
        <article className="panel detail-card">
          <header className="product-section-header">
            <h2>{t("productDetail.basics")}</h2>
          </header>
          <div className="product-basics-grid">
            <div className="detail-fields">
              {editing ? (
                <>
                  {textField(
                    t("productDetail.sku"),
                    form.sku,
                    (value) => patchForm({ sku: value }),
                    "sku",
                    "text",
                    true,
                  )}
                  {selectField(
                    t("productDetail.channel"),
                    form.channelId,
                    (value) =>
                      patchForm({ channelId: value, productTypeId: "" }),
                    options.channels,
                    "channelId",
                    true,
                  )}
                  {textField(
                    t("productDetail.name"),
                    form.name,
                    (value) => patchForm({ name: value }),
                    "name",
                    "text",
                    true,
                  )}
                  {textField(
                    t("productDetail.chineseName"),
                    form.chineseName,
                    (value) => patchForm({ chineseName: value }),
                  )}
                  {textField(
                    t("productDetail.price"),
                    form.price,
                    (value) => patchForm({ price: value }),
                    "price",
                    "number",
                    true,
                  )}
                </>
              ) : (
                <>
                  <DetailField label={t("productDetail.sku")} required>
                    {product.sku || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.channel")} required>
                    {product.channelName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.name")} required>
                    {product.name || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.chineseName")}>
                    {product.chineseName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.price")} required>
                    {money(product.price)}
                  </DetailField>
                </>
              )}
            </div>
            <div className="detail-fields">
              {editing ? (
                <>
                  {selectField(
                    t("productDetail.type"),
                    form.productTypeId,
                    (value) => patchForm({ productTypeId: value }),
                    options.productTypes,
                    "productTypeId",
                    true,
                  )}
                  <div className="detail-field">
                    <span id="product-collections-label">
                      {t("productDetail.collections")}
                      <RequiredMark />
                    </span>
                    <MultiSelect
                      id="product-collections"
                      labelledBy="product-collections-label"
                      options={options.collections}
                      value={form.collectionIds}
                      onChange={(collectionIds) => patchForm({ collectionIds })}
                      placeholder={t("productDetail.collectionsPlaceholder")}
                      searchPlaceholder={t("productDetail.collectionsSearch")}
                      emptyLabel={t("productDetail.noCollectionResults")}
                    />
                  </div>
                  <label className="detail-field">
                    <span>
                      {t("productDetail.status")}
                      <RequiredMark />
                    </span>
                    <select
                      value={form.status}
                      onChange={(event) => patchForm({ status: event.target.value })}
                    >
                      <option value="">{t("products.statusUnset")}</option>
                      <option value="Active">{t("products.statusActive")}</option>
                      <option value="Inactive">{t("products.statusInactive")}</option>
                    </select>
                    {fieldErrors.status ? <em>{fieldErrors.status}</em> : null}
                  </label>
                  <label className="detail-field">
                    <span>{t("productDetail.remarks")}</span>
                    <textarea
                      rows={4}
                      value={form.description}
                      placeholder={t("productDetail.remarksPlaceholder")}
                      onChange={(event) =>
                        patchForm({ description: event.target.value })
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <DetailField label={t("productDetail.type")} required>
                    {product.productTypeName || t("common.notSet")}
                  </DetailField>
                  <div className="detail-field">
                    <span>
                      {t("productDetail.collections")}
                      <RequiredMark />
                    </span>
                    <ProductTagList
                      tags={product.collections}
                      empty={t("common.notSet")}
                    />
                  </div>
                  <DetailField label={t("productDetail.status")} required>
                    {statusLabel}
                  </DetailField>
                  <DetailField label={t("productDetail.remarks")}>
                    {product.description || t("common.notSet")}
                  </DetailField>
                </>
              )}
            </div>
          </div>
          {editing ? (
            <footer className="product-edit-actions">
              {saveError ? (
                <div className="settings-side-form-error" role="alert">
                  {t("productDetail.saveError")}
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm(formFromProduct(product));
                  setFieldErrors({});
                  setSaveError(null);
                }}
                disabled={saving}
              >
                {t("productDetail.reset")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("productDetail.saving") : t("productDetail.confirmChanges")}
              </Button>
            </footer>
          ) : null}
        </article>
      </form>

      <section className="detail-grid detail-grid-two">
        <article className="panel detail-card">
          <header className="product-section-header">
            <h2>
              {displayName} - {t("productDetail.premiumIngredients")}
            </h2>
            <strong className="product-ingredient-cost">
              {t("productDetail.ingredientCost")}: {currency.format(ingredientCost)}
            </strong>
          </header>
          {editing ? (
            <div className="product-inline-add">
              <div className="product-ingredient-search" ref={ingredientSearchRef}>
                <label>
                  <span>{t("productDetail.premiumIngredients")}</span>
                  <input
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={ingredientMenuOpen}
                    aria-controls="product-ingredient-results"
                    aria-activedescendant={
                      ingredientMenuOpen && ingredientResults[ingredientHighlight]
                        ? `product-ingredient-option-${ingredientResults[ingredientHighlight].id}`
                        : undefined
                    }
                    value={ingredientQuery}
                    placeholder={t("productDetail.searchIngredient")}
                    autoComplete="off"
                    onChange={(event) => {
                      setIngredientQuery(event.target.value);
                      setIngredientId("");
                      setIngredientMenuOpen(true);
                    }}
                    onFocus={() => setIngredientMenuOpen(true)}
                    onKeyDown={handleIngredientSearchKey}
                  />
                </label>
                {ingredientMenuOpen && ingredientQuery.trim() ? (
                  <ul
                    id="product-ingredient-results"
                    className="product-ingredient-results"
                    role="listbox"
                  >
                    {searchingIngredients && ingredientResults.length === 0 ? (
                      <li className="product-ingredient-empty">
                        {t("productDetail.searchingIngredients")}
                      </li>
                    ) : ingredientResults.length === 0 ? (
                      <li className="product-ingredient-empty">
                        {t("productDetail.noIngredientResults")}
                      </li>
                    ) : (
                      ingredientResults.map((item, index) => (
                        <li key={item.id} role="presentation">
                          <button
                            type="button"
                            id={`product-ingredient-option-${item.id}`}
                            role="option"
                            aria-selected={index === ingredientHighlight}
                            className="product-ingredient-option"
                            onMouseEnter={() => setIngredientHighlight(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectIngredient(item)}
                          >
                            <span>{item.name}</span>
                            {item.sku ? <small>{item.sku}</small> : null}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              <label>
                <span>{t("productDetail.quantity")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ingredientQty}
                  onChange={(event) => setIngredientQty(event.target.value)}
                />
              </label>
              <Button
                type="button"
                disabled={!ingredientId || adding === "ingredient"}
                onClick={() => void handleAddIngredient()}
              >
                <Plus />
                {t("productDetail.addIngredient")}
              </Button>
            </div>
          ) : null}
          {product.premiumIngredients.length === 0 ? (
            <p className="detail-description">{t("productDetail.noIngredients")}</p>
          ) : (
            <div className="table-wrap detail-inline-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("productDetail.ingredient")}</th>
                    <th>{t("productDetail.quantity")}</th>
                    {editing ? <th>{t("products.columns.actions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {product.premiumIngredients.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.quantity ?? t("common.notSet")}</td>
                      {editing ? (
                        <td className="table-actions-cell">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t("productDetail.removeIngredient")}
                            onClick={() => {
                              void removeIngredient(item.id).then(() =>
                                refreshDetail(),
                              );
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel detail-card">
          <header className="product-section-header">
            <h2>
              {displayName} - {t("productDetail.labels")}
            </h2>
            {editing ? (
              <Button
                type="button"
                disabled={adding === "label"}
                onClick={() => void handleAddLabel()}
              >
                <Plus />
                {t("productDetail.addLabel")}
              </Button>
            ) : null}
          </header>
          {editing ? (
            <div className="product-inline-add">
              <label>
                <span>{t("productDetail.displayA")}</span>
                <input
                  value={labelDisplayA}
                  onChange={(event) => setLabelDisplayA(event.target.value)}
                />
              </label>
              <label>
                <span>{t("productDetail.displayB")}</span>
                <input
                  value={labelDisplayB}
                  onChange={(event) => setLabelDisplayB(event.target.value)}
                />
              </label>
              <label>
                <span>{t("productDetail.packing")}</span>
                <select
                  value={labelPackingId}
                  onChange={(event) => setLabelPackingId(event.target.value)}
                >
                  <option value="">{t("common.notSet")}</option>
                  {options.packingMaterials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {product.labels.length === 0 ? (
            <p className="detail-description">{t("productDetail.noLabels")}</p>
          ) : (
            <div className="table-wrap detail-inline-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("productDetail.displayA")}</th>
                    <th>{t("productDetail.displayB")}</th>
                    <th>{t("productDetail.packing")}</th>
                    {editing ? <th>{t("products.columns.actions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {product.labels.map((label) => (
                    <tr key={label.id}>
                      <td>{label.displayA || t("common.notSet")}</td>
                      <td>{label.displayB || t("common.notSet")}</td>
                      <td>{label.packingName || t("common.notSet")}</td>
                      {editing ? (
                        <td className="table-actions-cell">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t("productDetail.removeLabel")}
                            onClick={() => {
                              void removeLabel(label.id).then(() =>
                                refreshDetail(),
                              );
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <article className="panel detail-card">
        <header className="product-section-header">
          <h2>
            {displayName} - {t("productDetail.stoveCategory")}
          </h2>
        </header>
        {editing ? (
          selectField(
            t("productDetail.stoveCategory"),
            form.cookTypeId,
            (value) => patchForm({ cookTypeId: value }),
            options.cookTypes,
          )
        ) : (
          <DetailField label={t("productDetail.stoveCategory")}>
            {product.cookTypeName || t("common.notSet")}
          </DetailField>
        )}
      </article>

      <article className="panel detail-card">
        <header className="product-section-header">
          <h2>{t("productDetail.relatedPackages")}</h2>
        </header>
        {product.packages.length === 0 ? (
          <p className="detail-description">
            {t("productDetail.noRelatedPackages")}
          </p>
        ) : (
          <PullToRefresh
            className="table-wrap detail-inline-table"
            onRefresh={() => setReloadKey((key) => key + 1)}
            refreshing={loading}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("productDetail.relatedPackageSku")}</th>
                  <th>{t("productDetail.relatedPackageName")}</th>
                </tr>
              </thead>
              <tbody>
                {product.packages.map((pkg) => (
                  <tr key={pkg.id}>
                    <td>{pkg.sku || t("common.notSet")}</td>
                    <td>
                      <Link
                        className="order-link"
                        to={`/products/packages/${pkg.id}`}
                      >
                        {pkg.chineseName || pkg.name}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PullToRefresh>
        )}
      </article>

      {product.imageUrl ? (
        <img
          className="product-detail-image"
          src={product.imageUrl}
          alt={displayName}
        />
      ) : null}
    </section>
  );
}
