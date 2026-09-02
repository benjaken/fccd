import { Fragment, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PackagePlus, Plus, ShoppingBasket, Trash2, X } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PackageProductSearch } from "@/components/PackageDetailPage";
import { DICT_TYPE, dictSelectOptions, useDictItems } from "@/lib/dictionaries";
import { createPackage, type PackageCreateInput } from "@/lib/packages";
import {
  createProduct,
  fetchProductEditOptions,
  searchCatalogProducts,
  type CatalogOption,
  type ProductCreateInput,
  type ProductEditOptions,
} from "@/lib/products";

const EMPTY_OPTIONS: ProductEditOptions = {
  channels: [], productTypes: [], cookTypes: [], collections: [],
  packingMaterials: [], packingSupplies: [], catalogIngredients: [],
};

type PendingMaterial = { ingredientId: string; name: string; quantity: number };
type PendingLabel = {
  displayA: string;
  displayB: string;
};

type CatalogKind = "product" | "package";

export type CatalogCreateInitialValues = Partial<{
  sku: string;
  channelId: string;
  name: string;
  chineseName: string;
  price: string;
  status: string;
  description: string;
  productTypeId: string;
  cookTypeId: string;
  collectionIds: string[];
  isBentoRecommended: boolean;
}>;

export type CreatedCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  price: number;
  channelId: string;
};

type PendingPackageProduct = {
  productId: string;
  name: string;
  sku?: string | null;
  quantity: number;
  addonPrice: number;
};

type PendingChoiceSet = {
  id: string;
  name: string;
  maximumChoices: number;
  products: PendingPackageProduct[];
};

export function CatalogCreatePage({
  kind,
  canCreate = false,
  loadOptions = fetchProductEditOptions,
  saveProduct = createProduct,
  savePackage = createPackage,
  searchProducts = searchCatalogProducts,
  embedded = false,
  initialValues,
  onCreated,
  onCancel,
}: {
  kind: CatalogKind;
  canCreate?: boolean;
  loadOptions?: (channelId?: string) => Promise<ProductEditOptions>;
  saveProduct?: (input: ProductCreateInput) => Promise<string>;
  savePackage?: (input: PackageCreateInput) => Promise<string>;
  searchProducts?: (term: string) => Promise<CatalogOption[]>;
  embedded?: boolean;
  initialValues?: CatalogCreateInitialValues;
  onCreated?: (product: CreatedCatalogProduct) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const statusDictionary = useDictItems(DICT_TYPE.catalogStatus);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(() => ({
    sku: "", channelId: "", name: "", chineseName: "", price: "",
    status: "Active", description: "", productTypeId: "", cookTypeId: "",
    collectionIds: [] as string[], isBentoRecommended: false,
    ...initialValues,
  }));
  const [premiumIngredients, setPremiumIngredients] = useState<PendingMaterial[]>([]);
  const [packingSupplies, setPackingSupplies] = useState<PendingMaterial[]>([]);
  const [materialDraft, setMaterialDraft] = useState({
    premiumId: "", premiumQty: "1", packingId: "", packingQty: "1",
  });
  const [labels, setLabels] = useState<PendingLabel[]>([]);
  const [labelDraft, setLabelDraft] = useState({ displayA: "", displayB: "" });
  const [choiceSets, setChoiceSets] = useState<PendingChoiceSet[]>([]);
  const [choiceSetDraft, setChoiceSetDraft] = useState({ name: "", maximumChoices: "1" });
  const [searchingChoiceSetId, setSearchingChoiceSetId] = useState<string | null>(null);

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
    return embedded ? null : <Navigate to={kind === "product" ? "/products" : "/products/packages"} replace />;
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
            premiumIngredients: premiumIngredients.map(({ ingredientId, quantity }) => ({ ingredientId, quantity })),
            packingSupplies: packingSupplies.map(({ ingredientId, quantity }) => ({ ingredientId, quantity })),
            labels: labels.map(({ displayA, displayB }) => ({ displayA, displayB, packingMaterialId: null })),
          })
        : await savePackage({
            sku: form.sku, name: form.name, chineseName: form.chineseName,
            description: form.description, price, status: form.status,
            channelId: form.channelId,
            choiceSets: choiceSets.map(({ name, maximumChoices, products }) => ({
              name,
              maximumChoices,
              products: products.map(({ productId, quantity, addonPrice }) => ({ productId, quantity: Math.max(1, quantity), addonPrice })),
            })),
          });
      if (kind === "product" && onCreated) {
        await onCreated({
          id,
          sku: form.sku.trim(),
          name: form.name.trim(),
          price,
          channelId: form.channelId,
        });
      } else {
        navigate(kind === "product" ? `/products/${id}` : `/products/packages/${id}`, { replace: true });
      }
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

  const addMaterial = (kind: "premium" | "packing") => {
    const ingredientId = kind === "premium" ? materialDraft.premiumId : materialDraft.packingId;
    const rawQuantity = kind === "premium" ? materialDraft.premiumQty : materialDraft.packingQty;
    const quantity = Number.parseFloat(rawQuantity);
    const source = kind === "premium" ? options.catalogIngredients : options.packingSupplies;
    const selected = source.find((item) => item.id === ingredientId);
    if (!selected || !Number.isFinite(quantity) || quantity <= 0) return;
    const setItems = kind === "premium" ? setPremiumIngredients : setPackingSupplies;
    setItems((current) => current.some((item) => item.ingredientId === ingredientId)
      ? current
      : [...current, { ingredientId, name: selected.name, quantity }]);
    setMaterialDraft((current) => kind === "premium"
      ? { ...current, premiumId: "", premiumQty: "1" }
      : { ...current, packingId: "", packingQty: "1" });
  };

  const addPendingLabel = () => {
    if (!labelDraft.displayA.trim() && !labelDraft.displayB.trim()) return;
    setLabels((current) => [...current, {
      displayA: labelDraft.displayA.trim(),
      displayB: labelDraft.displayB.trim(),
    }]);
    setLabelDraft({ displayA: "", displayB: "" });
  };

  const addChoiceSet = () => {
    const name = choiceSetDraft.name.trim();
    const maximumChoices = Number.parseInt(choiceSetDraft.maximumChoices, 10);
    if (!name || !Number.isFinite(maximumChoices) || maximumChoices <= 0) return;
    setChoiceSets((current) => [...current, {
      id: crypto.randomUUID(), name, maximumChoices, products: [],
    }]);
    setChoiceSetDraft({ name: "", maximumChoices: "1" });
  };

  const addChoiceSetProduct = (choiceSetId: string, item: CatalogOption) => {
    setChoiceSets((current) => current.map((choiceSet) => choiceSet.id === choiceSetId
      ? {
          ...choiceSet,
          products: choiceSet.products.some((product) => product.productId === item.id)
            ? choiceSet.products
            : [...choiceSet.products, { productId: item.id, name: item.name, sku: item.sku, quantity: 1, addonPrice: 0 }],
        }
      : choiceSet));
    setSearchingChoiceSetId(null);
  };

  const updateChoiceSetProduct = (choiceSetId: string, productId: string, partial: Partial<PendingPackageProduct>) => {
    setChoiceSets((current) => current.map((choiceSet) => choiceSet.id === choiceSetId
      ? { ...choiceSet, products: choiceSet.products.map((product) => product.productId === productId ? { ...product, ...partial } : product) }
      : choiceSet));
  };

  return (
    <section className={embedded ? "catalog-create-embedded" : "detail-page is-editing"}>
      {!embedded ? <header className="page-heading">
        <div>
          <nav className="detail-breadcrumb" aria-label={t("catalogCreate.breadcrumb")}>
            <Link to={backTo}>{t(kind === "product" ? "productDetail.listCrumb" : "packageDetail.listCrumb")}</Link>
            <span aria-hidden="true">›</span>
            <span>{t(kind === "product" ? "catalogCreate.newProduct" : "catalogCreate.newPackage")}</span>
          </nav>
          <span className="eyebrow">{t("catalogCreate.eyebrow")}</span>
          <h1>{t(kind === "product" ? "catalogCreate.newProduct" : "catalogCreate.newPackage")}</h1>
        </div>
      </header> : null}

      <form className="product-detail-form catalog-create-form is-editing" onSubmit={submit}>
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
        </article>
        {kind === "product" ? (
          <section className="detail-grid product-material-grid">
            <article className="panel detail-card">
              <header className="product-section-header">
                <h2>{form.chineseName || form.name || t("catalogCreate.newProduct")} - {t("productDetail.premiumIngredients")}</h2>
              </header>
              <div className="product-inline-add">
                <label>
                  <span>{t("productDetail.premiumIngredients")}</span>
                  <FilterableSelect value={materialDraft.premiumId} onChange={(event) => setMaterialDraft((current) => ({ ...current, premiumId: event.target.value }))}>
                    <option value="">{t("common.notSet")}</option>
                    {options.catalogIngredients.filter((item) => !premiumIngredients.some((selected) => selected.ingredientId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </FilterableSelect>
                </label>
                <label><span>{t("productDetail.quantity")}</span><input type="number" min="0" step="0.01" value={materialDraft.premiumQty} onChange={(event) => setMaterialDraft((current) => ({ ...current, premiumQty: event.target.value }))} /></label>
                <Button type="button" disabled={!materialDraft.premiumId} onClick={() => addMaterial("premium")}><Plus />{t("productDetail.addIngredient")}</Button>
              </div>
              {premiumIngredients.length ? (
                <div className="table-wrap detail-inline-table"><table><thead><tr><th>{t("productDetail.ingredient")}</th><th>{t("productDetail.quantity")}</th><th>{t("products.columns.actions")}</th></tr></thead><tbody>
                  {premiumIngredients.map((item) => <tr key={item.ingredientId}><td>{item.name}</td><td>{item.quantity}</td><td className="table-actions-cell"><Button type="button" variant="outline" size="icon" aria-label={t("productDetail.removeIngredient")} onClick={() => setPremiumIngredients((current) => current.filter((row) => row.ingredientId !== item.ingredientId))}><Trash2 /></Button></td></tr>)}
                </tbody></table></div>
              ) : <p className="detail-description">{t("productDetail.noIngredients")}</p>}
            </article>

            <article className="panel detail-card">
              <header className="product-section-header">
                <h2>{form.chineseName || form.name || t("catalogCreate.newProduct")} - {t("productDetail.packingSupplies")}</h2>
              </header>
              <div className="product-inline-add">
                <label>
                  <span>{t("productDetail.packingSupply")}</span>
                  <FilterableSelect value={materialDraft.packingId} onChange={(event) => setMaterialDraft((current) => ({ ...current, packingId: event.target.value }))}>
                    <option value="">{t("productDetail.pickPackingSupply")}</option>
                    {options.packingSupplies.filter((item) => !packingSupplies.some((selected) => selected.ingredientId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </FilterableSelect>
                </label>
                <label><span>{t("productDetail.quantity")}</span><input type="number" min="0" step="0.01" value={materialDraft.packingQty} onChange={(event) => setMaterialDraft((current) => ({ ...current, packingQty: event.target.value }))} /></label>
                <Button type="button" disabled={!materialDraft.packingId} onClick={() => addMaterial("packing")}><Plus />{t("productDetail.addPackingSupply")}</Button>
              </div>
              {packingSupplies.length ? (
                <div className="table-wrap detail-inline-table"><table><thead><tr><th>{t("productDetail.packingSupply")}</th><th>{t("productDetail.quantity")}</th><th>{t("products.columns.actions")}</th></tr></thead><tbody>
                  {packingSupplies.map((item) => <tr key={item.ingredientId}><td>{item.name}</td><td>{item.quantity}</td><td className="table-actions-cell"><Button type="button" variant="outline" size="icon" aria-label={t("productDetail.removePackingSupply")} onClick={() => setPackingSupplies((current) => current.filter((row) => row.ingredientId !== item.ingredientId))}><Trash2 /></Button></td></tr>)}
                </tbody></table></div>
              ) : <p className="detail-description">{t("productDetail.noPackingSupplies")}</p>}
            </article>

            <article className="panel detail-card">
              <header className="product-section-header">
                <h2>{form.chineseName || form.name || t("catalogCreate.newProduct")} - {t("productDetail.labels")}</h2>
                <Button type="button" onClick={addPendingLabel} disabled={!labelDraft.displayA.trim() && !labelDraft.displayB.trim()}><Plus />{t("productDetail.addLabel")}</Button>
              </header>
              <div className="product-inline-add">
                <label><span>{t("productDetail.displayA")}</span><input value={labelDraft.displayA} onChange={(event) => setLabelDraft((current) => ({ ...current, displayA: event.target.value }))} /></label>
                <label><span>{t("productDetail.displayB")}</span><input value={labelDraft.displayB} onChange={(event) => setLabelDraft((current) => ({ ...current, displayB: event.target.value }))} /></label>
              </div>
              {labels.length ? (
                <div className="table-wrap detail-inline-table"><table><thead><tr><th>{t("productDetail.displayA")}</th><th>{t("productDetail.displayB")}</th><th>{t("products.columns.actions")}</th></tr></thead><tbody>
                  {labels.map((item, index) => <tr key={`${item.displayA}-${item.displayB}-${index}`}><td>{item.displayA}</td><td>{item.displayB}</td><td className="table-actions-cell"><Button type="button" variant="outline" size="icon" aria-label={t("productDetail.removeLabel")} onClick={() => setLabels((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></Button></td></tr>)}
                </tbody></table></div>
              ) : <p className="detail-description">{t("productDetail.noLabels")}</p>}
            </article>
          </section>
        ) : null}
        {kind === "package" ? (
          <article className="panel detail-card">
            <header className="product-section-header">
              <h2>{form.chineseName || form.name || t("catalogCreate.newPackage")} - {t("packageDetail.options")}</h2>
            </header>
            <div className="product-inline-add">
              <label><span>{t("packageDetail.categoryName")}</span><input type="text" value={choiceSetDraft.name} placeholder={t("packageDetail.categoryNamePlaceholder")} onChange={(event) => setChoiceSetDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span>{t("packageDetail.selectableCount")}</span><input type="number" min="1" step="1" value={choiceSetDraft.maximumChoices} placeholder={t("packageDetail.selectableCountPlaceholder")} onChange={(event) => setChoiceSetDraft((current) => ({ ...current, maximumChoices: event.target.value }))} /></label>
              <Button type="button" disabled={!choiceSetDraft.name.trim()} onClick={addChoiceSet}><Plus />{t("packageDetail.addChoiceSet")}</Button>
            </div>
            {choiceSets.length === 0 ? <p className="detail-description">{t("packageDetail.noChoiceSets")}</p> : (
              <div className="table-wrap detail-inline-table package-options-table">
                <table>
                  <thead><tr><th aria-label={t("packages.columns.index")} /><th>{t("packageDetail.categoryName")}</th><th>{t("packageDetail.productName")}</th><th>{t("packageDetail.addonPrice")}</th><th>{t("packageDetail.productQuantity")}</th><th>{t("packages.columns.actions")}</th><th>{t("packageDetail.selectableCount")}</th><th>{t("packages.columns.actions")}</th></tr></thead>
                  <tbody>
                    {choiceSets.map((choiceSet, choiceSetIndex) => {
                      const searching = searchingChoiceSetId === choiceSet.id;
                      const products: Array<PendingPackageProduct | null> = choiceSet.products.length ? choiceSet.products : [null];
                      const rowSpan = products.length + (searching ? 1 : 0);
                      return <Fragment key={choiceSet.id}>
                        {products.map((product, productIndex) => <tr key={product?.productId || "empty"}>
                          {productIndex === 0 ? <td className="packages-index-cell" rowSpan={rowSpan}>{choiceSetIndex + 1}</td> : null}
                          {productIndex === 0 ? <td className="package-category-cell" rowSpan={rowSpan}>{choiceSet.name}<span className="product-required" aria-hidden="true">*</span></td> : null}
                          {product ? <>
                            <td>{product.name}{product.sku ? <small className="package-create-product-sku">{product.sku}</small> : null}</td>
                            <td><input aria-label={`${product.name} ${t("packageDetail.addonPrice")}`} type="number" min="0" step="0.01" value={product.addonPrice} onChange={(event) => updateChoiceSetProduct(choiceSet.id, product.productId, { addonPrice: Number(event.target.value) || 0 })} /></td>
                            <td><input aria-label={`${product.name} ${t("packageDetail.productQuantity")}`} type="number" min="1" step="1" value={product.quantity} onChange={(event) => updateChoiceSetProduct(choiceSet.id, product.productId, { quantity: Number.parseInt(event.target.value, 10) || 0 })} /></td>
                            <td className="table-actions-cell"><Button type="button" variant="outline" size="icon" aria-label={t("packageDetail.removeProduct")} onClick={() => setChoiceSets((current) => current.map((group) => group.id === choiceSet.id ? { ...group, products: group.products.filter((item) => item.productId !== product.productId) } : group))}><X /></Button></td>
                          </> : <td colSpan={4} className="package-empty-products">{t("packageDetail.noProductsInSet")}</td>}
                          {productIndex === 0 ? <td rowSpan={rowSpan}>{choiceSet.maximumChoices}</td> : null}
                          {productIndex === 0 ? <td className="table-actions-cell package-set-actions" rowSpan={rowSpan}><div className="table-row-actions"><Button type="button" onClick={() => setSearchingChoiceSetId((current) => current === choiceSet.id ? null : choiceSet.id)}><Plus />{t("packageDetail.addProduct")}</Button><Button type="button" variant="outline" size="icon" aria-label={t("packageDetail.removeChoiceSet")} onClick={() => setChoiceSets((current) => current.filter((group) => group.id !== choiceSet.id))}><X /></Button></div></td> : null}
                        </tr>)}
                        {searching ? <tr><td colSpan={4}><PackageProductSearch excludeIds={new Set(choiceSet.products.map((product) => product.productId))} searchProducts={searchProducts} onSelect={(item) => addChoiceSetProduct(choiceSet.id, item)} /></td></tr> : null}
                      </Fragment>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ) : null}
        <footer className="product-edit-actions">
          {saveError ? <div className="settings-side-form-error" role="alert">{t("catalogCreate.saveError")}</div> : null}
          <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : navigate(backTo)} disabled={saving}>{t("catalogCreate.cancel")}</Button>
          <Button type="submit" disabled={saving}>{saving ? t("productDetail.saving") : t("catalogCreate.create")}</Button>
        </footer>
      </form>
    </section>
  );
}
