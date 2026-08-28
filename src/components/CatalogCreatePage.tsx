import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PackagePlus, ShoppingBasket } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { DICT_TYPE, dictSelectOptions, useDictItems } from "@/lib/dictionaries";
import { createPackage, type PackageCreateInput } from "@/lib/packages";
import {
  createProduct,
  fetchProductEditOptions,
  type ProductCreateInput,
  type ProductEditOptions,
} from "@/lib/products";

const EMPTY_OPTIONS: ProductEditOptions = {
  channels: [], productTypes: [], cookTypes: [], collections: [],
  packingMaterials: [], packingSupplies: [], catalogIngredients: [],
};

type CatalogKind = "product" | "package";

export function CatalogCreatePage({
  kind,
  canCreate = false,
  loadOptions = fetchProductEditOptions,
  saveProduct = createProduct,
  savePackage = createPackage,
}: {
  kind: CatalogKind;
  canCreate?: boolean;
  loadOptions?: (channelId?: string) => Promise<ProductEditOptions>;
  saveProduct?: (input: ProductCreateInput) => Promise<string>;
  savePackage?: (input: PackageCreateInput) => Promise<string>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const statusDictionary = useDictItems(DICT_TYPE.catalogStatus);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    sku: "", channelId: "", name: "", chineseName: "", price: "",
    status: "Active", description: "", productTypeId: "", cookTypeId: "",
    collectionIds: [] as string[], isBentoRecommended: false,
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadOptions(form.channelId)
      .then((value) => { if (active) setOptions(value); })
      .catch(() => { if (active) setOptions(EMPTY_OPTIONS); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [form.channelId, loadOptions]);

  if (!canCreate) {
    return <Navigate to={kind === "product" ? "/products" : "/products/packages"} replace />;
  }
  if (loading && options.channels.length === 0) {
    return <PageSkeleton label={t("catalogCreate.loading")} variant="detail" detailLayout="product" />;
  }

  const patch = (value: Partial<typeof form>) => setForm((current) => ({ ...current, ...value }));
  const backTo = kind === "product" ? "/products" : "/products/packages";
  const icon = kind === "product" ? <ShoppingBasket /> : <PackagePlus />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = Number.parseFloat(form.price);
    const nextErrors = {
      sku: !form.sku.trim(), channelId: !form.channelId, name: !form.name.trim(),
      price: !Number.isFinite(price), status: !form.status,
      productTypeId: kind === "product" && !form.productTypeId,
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    setSaveError(false);
    try {
      const id = kind === "product"
        ? await saveProduct({
            name: form.name, chineseName: form.chineseName, sku: form.sku,
            description: form.description, price, status: form.status,
            isActive: form.status !== "Inactive",
            isBentoRecommended: form.isBentoRecommended,
            channelId: form.channelId, productTypeId: form.productTypeId,
            cookTypeId: form.cookTypeId || null, collectionIds: form.collectionIds,
          })
        : await savePackage({
            sku: form.sku, name: form.name, chineseName: form.chineseName,
            description: form.description, price, status: form.status,
            channelId: form.channelId,
          });
      navigate(kind === "product" ? `/products/${id}` : `/products/packages/${id}`, { replace: true });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: "sku" | "name" | "chineseName" | "price", label: string, required = false) => (
    <label className="detail-field">
      <span>{label}{required ? <span className="product-required">*</span> : null}</span>
      <input
        type={key === "price" ? "number" : "text"}
        min={key === "price" ? "0" : undefined}
        step={key === "price" ? "0.01" : undefined}
        value={form[key]}
        aria-invalid={fieldErrors[key] || undefined}
        onChange={(event) => patch({ [key]: event.target.value })}
      />
      {fieldErrors[key] ? <em>{t("catalogCreate.required")}</em> : null}
    </label>
  );

  return (
    <section className="detail-page is-editing">
      <header className="page-heading">
        <div>
          <nav className="detail-breadcrumb" aria-label={t("catalogCreate.breadcrumb")}>
            <Link to={backTo}>{t(kind === "product" ? "productDetail.listCrumb" : "packageDetail.listCrumb")}</Link>
            <span aria-hidden="true">›</span>
            <span>{t(kind === "product" ? "catalogCreate.newProduct" : "catalogCreate.newPackage")}</span>
          </nav>
          <span className="eyebrow">{t("catalogCreate.eyebrow")}</span>
          <h1>{t(kind === "product" ? "catalogCreate.newProduct" : "catalogCreate.newPackage")}</h1>
        </div>
      </header>

      <form className="product-detail-form is-editing" onSubmit={submit}>
        <article className="panel detail-card">
          <header className="product-section-header"><h2>{icon}{t("productDetail.basics")}</h2></header>
          <div className="product-basics-grid">
            <div className="detail-fields">
              {field("sku", t(kind === "product" ? "productDetail.sku" : "packageDetail.sku"), true)}
              <label className="detail-field">
                <span>{t(kind === "product" ? "productDetail.channel" : "packageDetail.channel")}<span className="product-required">*</span></span>
                <FilterableSelect value={form.channelId} aria-invalid={fieldErrors.channelId || undefined} onChange={(event) => patch({ channelId: event.target.value, productTypeId: "" })}>
                  <option value="">{t("common.notSet")}</option>
                  {options.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </FilterableSelect>
                {fieldErrors.channelId ? <em>{t("catalogCreate.required")}</em> : null}
              </label>
              {field("name", t(kind === "product" ? "productDetail.name" : "packageDetail.name"), true)}
              {field("chineseName", t(kind === "product" ? "productDetail.chineseName" : "packageDetail.chineseName"))}
              {field("price", t(kind === "product" ? "productDetail.price" : "packageDetail.price"), true)}
            </div>
            <div className="detail-fields">
              {kind === "product" ? <>
                <label className="detail-field">
                  <span>{t("productDetail.type")}<span className="product-required">*</span></span>
                  <FilterableSelect value={form.productTypeId} aria-invalid={fieldErrors.productTypeId || undefined} onChange={(event) => patch({ productTypeId: event.target.value })}>
                    <option value="">{t("common.notSet")}</option>
                    {options.productTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </FilterableSelect>
                  {fieldErrors.productTypeId ? <em>{t("catalogCreate.required")}</em> : null}
                </label>
                <label className="detail-field">
                  <span>{t("productDetail.cookType")}</span>
                  <FilterableSelect value={form.cookTypeId} onChange={(event) => patch({ cookTypeId: event.target.value })}>
                    <option value="">{t("common.notSet")}</option>
                    {options.cookTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </FilterableSelect>
                </label>
                <div className="detail-field">
                  <span id="create-product-collections-label">{t("productDetail.collections")}</span>
                  <MultiSelect id="create-product-collections" labelledBy="create-product-collections-label" options={options.collections} value={form.collectionIds} onChange={(collectionIds) => patch({ collectionIds })} placeholder={t("productDetail.collectionsPlaceholder")} searchPlaceholder={t("productDetail.collectionsSearchPlaceholder")} emptyLabel={t("productDetail.noCollectionResults")} />
                </div>
              </> : null}
              <label className="detail-field">
                <span>{t("productDetail.status")}<span className="product-required">*</span></span>
                <FilterableSelect value={form.status} onChange={(event) => patch({ status: event.target.value })}>
                  {dictSelectOptions(statusDictionary.items, i18n.language, form.status).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </FilterableSelect>
              </label>
              <label className="detail-field">
                <span>{t("productDetail.remarks")}</span>
                <textarea rows={4} value={form.description} onChange={(event) => patch({ description: event.target.value })} />
              </label>
            </div>
          </div>
          <footer className="product-edit-actions">
            {saveError ? <div className="settings-side-form-error" role="alert">{t("catalogCreate.saveError")}</div> : null}
            <Button type="button" variant="outline" onClick={() => navigate(backTo)} disabled={saving}>{t("catalogCreate.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? t("productDetail.saving") : t("catalogCreate.create")}</Button>
          </footer>
        </article>
      </form>
    </section>
  );
}
