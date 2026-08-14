import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Package,
  Pencil,
  RefreshCw,
  ShoppingBasket,
  Tags,
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ProductRecommendStar } from "@/components/ProductRecommendStar";
import { ProductTagList } from "@/components/ProductTagList";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  fetchProductDetail,
  fetchProductEditOptions,
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

type ProductFormState = {
  name: string;
  chineseName: string;
  sku: string;
  description: string;
  price: string;
  priceMin: string;
  priceMax: string;
  status: string;
  isBentoRecommended: boolean;
  channelId: string;
  productTypeId: string;
  cookTypeId: string;
  bentoMainTypeId: string;
  bentoColumnTypeId: string;
  mainIngredientIds: string[];
  specialRequestIds: string[];
};

const EMPTY_OPTIONS: ProductEditOptions = {
  channels: [],
  productTypes: [],
  cookTypes: [],
  bentoMainTypes: [],
  bentoColumnTypes: [],
  mainIngredients: [],
  specialRequests: [],
};

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-field">
      <span>{label}</span>
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
    priceMin: product.priceMin === null ? "" : String(product.priceMin),
    priceMax: product.priceMax === null ? "" : String(product.priceMax),
    status: product.status ?? "",
    isBentoRecommended: product.isBentoRecommended,
    channelId: product.channelId ?? "",
    productTypeId: product.productTypeId ?? "",
    cookTypeId: product.cookTypeId ?? "",
    bentoMainTypeId: product.bentoMainTypeId ?? "",
    bentoColumnTypeId: product.bentoColumnTypeId ?? "",
    mainIngredientIds: product.mainIngredients.map((item) => item.id),
    specialRequestIds: product.specialRequests.map((item) => item.id),
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
}: {
  canEdit?: boolean;
  loadDetail?: DetailLoader;
  loadEditOptions?: OptionsLoader;
  saveProduct?: ProductSaver;
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

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Hong_Kong",
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

  const patchForm = (partial: Partial<ProductFormState>) => {
    setForm((current) => (current ? { ...current, ...partial } : current));
  };

  const toggleId = (key: "mainIngredientIds" | "specialRequestIds", idValue: string) => {
    setForm((current) => {
      if (!current) return current;
      const selected = current[key];
      return {
        ...current,
        [key]: selected.includes(idValue)
          ? selected.filter((item) => item !== idValue)
          : [...selected, idValue],
      };
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      nextErrors.name = t("productDetail.validation.nameRequired");
    }
    const price = parseMoney(form.price);
    const priceMin = parseMoney(form.priceMin);
    const priceMax = parseMoney(form.priceMax);
    if (Number.isNaN(price)) nextErrors.price = t("productDetail.validation.priceInvalid");
    if (Number.isNaN(priceMin)) nextErrors.priceMin = t("productDetail.validation.priceInvalid");
    if (Number.isNaN(priceMax)) nextErrors.priceMax = t("productDetail.validation.priceInvalid");
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
        priceMin,
        priceMax,
        status: form.status,
        isActive: form.status !== "Inactive",
        isBentoRecommended: form.isBentoRecommended,
        channelId: form.channelId || null,
        productTypeId: form.productTypeId || null,
        cookTypeId: form.cookTypeId || null,
        bentoMainTypeId: form.bentoMainTypeId || null,
        bentoColumnTypeId: form.bentoColumnTypeId || null,
        mainIngredientIds: form.mainIngredientIds,
        specialRequestIds: form.specialRequestIds,
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
  ) => (
    <label className="detail-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("common.notSet")}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );

  const textField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    errorKey?: string,
    type = "text",
  ) => (
    <label className="detail-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {errorKey && fieldErrors[errorKey] ? <em>{fieldErrors[errorKey]}</em> : null}
    </label>
  );

  return (
    <section className="detail-page">
      <header className="page-heading">
        <div>
          <Link className="detail-back" to="/products">
            <ChevronLeft />
            {t("productDetail.back")}
          </Link>
          <span className="eyebrow">
            {editing ? t("productDetail.editEyebrow") : t("productDetail.eyebrow")}
          </span>
          <h1>{displayName}</h1>
          <p>{product.sku || t("common.notSet")}</p>
        </div>
        <div className="heading-actions">
          <span className={cn("status-badge", statusTone)}>{statusLabel}</span>
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
        <section className="detail-grid detail-grid-two">
          <article className="panel detail-card">
            <header>
              <ShoppingBasket />
              <h2>{t("productDetail.basics")}</h2>
            </header>
            <div className="detail-fields">
              {editing ? (
                <>
                  {textField(
                    t("productDetail.chineseName"),
                    form.chineseName,
                    (value) => patchForm({ chineseName: value }),
                  )}
                  {textField(
                    t("productDetail.name"),
                    form.name,
                    (value) => patchForm({ name: value }),
                    "name",
                  )}
                  {textField(
                    t("productDetail.sku"),
                    form.sku,
                    (value) => patchForm({ sku: value }),
                  )}
                  {selectField(
                    t("productDetail.channel"),
                    form.channelId,
                    (value) =>
                      patchForm({ channelId: value, productTypeId: "" }),
                    options.channels,
                  )}
                  {selectField(
                    t("productDetail.type"),
                    form.productTypeId,
                    (value) => patchForm({ productTypeId: value }),
                    options.productTypes,
                  )}
                  {selectField(
                    t("productDetail.cookType"),
                    form.cookTypeId,
                    (value) => patchForm({ cookTypeId: value }),
                    options.cookTypes,
                  )}
                </>
              ) : (
                <>
                  <DetailField label={t("productDetail.name")}>
                    {product.name || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.chineseName")}>
                    {product.chineseName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.sku")}>
                    {product.sku || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.channel")}>
                    {product.channelName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.type")}>
                    {product.productTypeName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.cookType")}>
                    {product.cookTypeName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.updated")}>
                    {date.format(new Date(product.updatedAt))}
                  </DetailField>
                </>
              )}
            </div>
          </article>

          <article className="panel detail-card">
            <header>
              <Tags />
              <h2>{t("productDetail.pricing")}</h2>
            </header>
            <div className="detail-fields">
              {editing ? (
                <>
                  {textField(
                    t("productDetail.price"),
                    form.price,
                    (value) => patchForm({ price: value }),
                    "price",
                    "number",
                  )}
                  {textField(
                    t("productDetail.priceMin"),
                    form.priceMin,
                    (value) => patchForm({ priceMin: value }),
                    "priceMin",
                    "number",
                  )}
                  {textField(
                    t("productDetail.priceMax"),
                    form.priceMax,
                    (value) => patchForm({ priceMax: value }),
                    "priceMax",
                    "number",
                  )}
                  {selectField(
                    t("productDetail.bentoMain"),
                    form.bentoMainTypeId,
                    (value) => patchForm({ bentoMainTypeId: value }),
                    options.bentoMainTypes,
                  )}
                  {selectField(
                    t("productDetail.bentoColumn"),
                    form.bentoColumnTypeId,
                    (value) => patchForm({ bentoColumnTypeId: value }),
                    options.bentoColumnTypes,
                  )}
                  <label className="detail-field">
                    <span>{t("productDetail.status")}</span>
                    <select
                      value={form.status}
                      onChange={(event) => patchForm({ status: event.target.value })}
                    >
                      <option value="">{t("products.statusUnset")}</option>
                      <option value="Active">{t("products.statusActive")}</option>
                      <option value="Inactive">{t("products.statusInactive")}</option>
                    </select>
                  </label>
                  <div className="detail-field">
                    <span>{t("productDetail.bentoRecommended")}</span>
                    <div className="product-recommend-edit">
                      <ProductRecommendStar
                        recommended={form.isBentoRecommended}
                        label={
                          form.isBentoRecommended
                            ? t("products.recommendedOn")
                            : t("products.recommendedOff")
                        }
                        onToggle={() =>
                          patchForm({
                            isBentoRecommended: !form.isBentoRecommended,
                          })
                        }
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <DetailField label={t("productDetail.price")}>
                    {money(product.price)}
                  </DetailField>
                  <DetailField label={t("productDetail.priceMin")}>
                    {money(product.priceMin)}
                  </DetailField>
                  <DetailField label={t("productDetail.priceMax")}>
                    {money(product.priceMax)}
                  </DetailField>
                  <DetailField label={t("productDetail.bentoMain")}>
                    {product.bentoMainTypeName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.bentoColumn")}>
                    {product.bentoColumnTypeName || t("common.notSet")}
                  </DetailField>
                  <DetailField label={t("productDetail.bentoRecommended")}>
                    <ProductRecommendStar
                      recommended={product.isBentoRecommended}
                      label={
                        product.isBentoRecommended
                          ? t("products.recommendedOn")
                          : t("products.recommendedOff")
                      }
                    />
                  </DetailField>
                  <DetailField label={t("productDetail.collections")}>
                    {product.collections.length > 0
                      ? product.collections.join(" · ")
                      : t("common.notSet")}
                  </DetailField>
                </>
              )}
            </div>
          </article>
        </section>

        <article className="panel detail-card">
          <header>
            <Tags />
            <h2>{t("productDetail.attributes")}</h2>
          </header>
          <div className="detail-fields product-attribute-fields">
            <div className="detail-field">
              <span>{t("productDetail.ingredients")}</span>
              {editing ? (
                <ProductTagList
                  tags={options.mainIngredients}
                  empty={t("common.notSet")}
                  selectable
                  selectedIds={form.mainIngredientIds}
                  onToggle={(tagId) => toggleId("mainIngredientIds", tagId)}
                />
              ) : (
                <ProductTagList
                  tags={product.mainIngredients}
                  empty={t("common.notSet")}
                />
              )}
            </div>
            <div className="detail-field">
              <span>{t("productDetail.specialRequests")}</span>
              {editing ? (
                <ProductTagList
                  tags={options.specialRequests}
                  empty={t("common.notSet")}
                  selectable
                  selectedIds={form.specialRequestIds}
                  onToggle={(tagId) => toggleId("specialRequestIds", tagId)}
                />
              ) : (
                <ProductTagList
                  tags={product.specialRequests}
                  empty={t("common.notSet")}
                />
              )}
            </div>
          </div>
        </article>

      <article className="panel detail-card">
        <header>
          <Package />
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

        <article className="panel detail-card">
          <header>
            <ShoppingBasket />
            <h2>{t("productDetail.description")}</h2>
          </header>
          {editing ? (
            <label className="detail-field">
              <span>{t("productDetail.description")}</span>
              <textarea
                rows={5}
                value={form.description}
                onChange={(event) => patchForm({ description: event.target.value })}
              />
            </label>
          ) : (
            <p className="detail-description">
              {product.description || t("common.notSet")}
            </p>
          )}
          {product.imageUrl ? (
            <img
              className="product-detail-image"
              src={product.imageUrl}
              alt={displayName}
            />
          ) : null}
        </article>

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
              onClick={() => navigate(`/products/${product.id}`)}
              disabled={saving}
            >
              {t("productDetail.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("productDetail.saving") : t("productDetail.save")}
            </Button>
          </footer>
        ) : null}
      </form>
    </section>
  );
}
