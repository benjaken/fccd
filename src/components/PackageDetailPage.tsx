import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, X } from "lucide-react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  addPackageChoiceSet,
  addPackageProduct,
  fetchPackageDetail,
  removePackageChoiceSet,
  removePackageProduct,
  type PackageChoiceSet,
  type PackageDetail,
  type PackageMember,
} from "@/lib/packages";
import {
  searchCatalogProducts,
  type CatalogOption,
} from "@/lib/products";
import { cn } from "@/lib/utils";

type DetailLoader = (id: string) => Promise<PackageDetail | null>;
type ProductSearcher = (term: string) => Promise<CatalogOption[]>;

function productLabel(item: PackageMember, fallback: string) {
  return item.productChineseName || item.productName || fallback;
}

function PackageProductSearch({
  excludeIds,
  searchProducts,
  onSelect,
}: {
  excludeIds: Set<string>;
  searchProducts: ProductSearcher;
  onSelect: (item: CatalogOption) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogOption[]>([]);
  const [open, setOpen] = useState(true);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      void searchProducts(term)
        .then((rows) => {
          if (!active) return;
          setResults(rows.filter((row) => !excludeIds.has(row.id)));
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [excludeIds, query, searchProducts]);

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) =>
        results.length === 0 ? 0 : Math.min(index + 1, results.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const item = results[highlight];
      if (open && item) {
        event.preventDefault();
        onSelect(item);
      }
    }
  };

  return (
    <div className="package-product-search">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="package-product-results"
        aria-label={t("packageDetail.searchProductPlaceholder")}
        value={query}
        placeholder={t("packageDetail.searchProductPlaceholder")}
        autoComplete="off"
        autoFocus
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
      />
      {open && query.trim() ? (
        <ul
          id="package-product-results"
          className="product-ingredient-results"
          role="listbox"
        >
          {searching && results.length === 0 ? (
            <li className="product-ingredient-empty">
              {t("packageDetail.searchingProducts")}
            </li>
          ) : results.length === 0 ? (
            <li className="product-ingredient-empty">
              {t("packageDetail.noProductResults")}
            </li>
          ) : (
            results.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  className="product-ingredient-option"
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(item)}
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
  );
}

export function PackageDetailPage({
  canEdit = false,
  loadDetail = fetchPackageDetail,
  searchProducts = searchCatalogProducts,
  addChoiceSet = addPackageChoiceSet,
  removeChoiceSet = removePackageChoiceSet,
  addProduct = addPackageProduct,
  removeProduct = removePackageProduct,
}: {
  canEdit?: boolean;
  loadDetail?: DetailLoader;
  searchProducts?: ProductSearcher;
  addChoiceSet?: typeof addPackageChoiceSet;
  removeChoiceSet?: typeof removePackageChoiceSet;
  addProduct?: typeof addPackageProduct;
  removeProduct?: typeof removePackageProduct;
}) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { id = "" } = useParams();
  const editing = location.pathname.endsWith("/edit");
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [categoryName, setCategoryName] = useState("");
  const [categoryMax, setCategoryMax] = useState("1");
  const [categoryNameError, setCategoryNameError] = useState(false);
  const [addingChoiceSet, setAddingChoiceSet] = useState(false);
  const [searchingChoiceSetId, setSearchingChoiceSetId] = useState<string | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPkg(await loadDetail(id));
    } catch (loadError) {
      setError(
        typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
          ? loadError.code
          : "package_detail_failed",
      );
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }, [id, loadDetail, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing && !canEdit) {
    return <Navigate to={`/products/packages/${id}`} replace />;
  }

  if (loading) {
    return (
      <PageSkeleton
        cards={2}
        label={t("packageDetail.loading")}
        variant="detail"
      />
    );
  }

  if (error || !pkg) {
    return (
      <div className="detail-state detail-state-error" role="alert">
        <div>
          <strong>{t("packageDetail.notFound")}</strong>
          <span>{t("packageDetail.notFoundDescription")}</span>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw />
          {t("packageDetail.retry")}
        </Button>
      </div>
    );
  }

  const displayName = pkg.chineseName || pkg.name;
  const money = (value: number | null) =>
    value === null ? t("common.notSet") : currency.format(value);

  const groups: PackageChoiceSet[] = [
    ...pkg.choiceSets,
    ...(pkg.ungroupedProducts.length > 0
      ? [
          {
            id: "ungrouped",
            legacyId: "",
            name: t("packageDetail.ungrouped"),
            maximumChoices: null,
            products: pkg.ungroupedProducts,
          },
        ]
      : []),
  ];

  const refreshDetail = async () => {
    const detail = await loadDetail(id);
    setPkg(detail);
  };

  const handleAddChoiceSet = async () => {
    const name = categoryName.trim();
    if (!name) {
      setCategoryNameError(true);
      return;
    }
    const maximumChoices = Number.parseFloat(categoryMax);
    if (!Number.isFinite(maximumChoices) || maximumChoices <= 0) return;
    setAddingChoiceSet(true);
    try {
      await addChoiceSet(pkg.id, name, maximumChoices);
      setCategoryName("");
      setCategoryMax("1");
      setCategoryNameError(false);
      await refreshDetail();
    } finally {
      setAddingChoiceSet(false);
    }
  };

  const handleSelectProduct = async (
    choiceSet: PackageChoiceSet,
    item: CatalogOption,
  ) => {
    setPendingAction(`add-${choiceSet.id}`);
    try {
      await addProduct(pkg.id, choiceSet.legacyId || null, item.id);
      setSearchingChoiceSetId(null);
      await refreshDetail();
    } finally {
      setPendingAction(null);
    }
  };

  const renderGroupRows = (group: PackageChoiceSet, groupIndex: number) => {
    const searching = editing && searchingChoiceSetId === group.id;
    const productRows = group.products.length > 0 ? group.products : [null];
    const span = productRows.length + (searching ? 1 : 0);
    const excludeIds = new Set(
      group.products
        .map((item) => item.productId)
        .filter((item): item is string => Boolean(item)),
    );
    const canAddToGroup = editing && group.id !== "ungrouped";

    return productRows.map((product, rowIndex) => (
      <tr key={`${group.id}-${product?.id ?? "empty"}-${rowIndex}`}>
        {rowIndex === 0 ? (
          <td className="packages-index-cell" rowSpan={span}>
            {groupIndex + 1}
          </td>
        ) : null}
        {rowIndex === 0 ? (
          <td className="package-category-cell" rowSpan={span}>
            {group.name || t("common.notSet")}
            {group.id !== "ungrouped" ? (
              <span className="product-required" aria-hidden="true">
                *
              </span>
            ) : null}
          </td>
        ) : null}
        {product ? (
          <>
            <td>
              {product.productId ? (
                <Link className="order-link" to={`/products/${product.productId}`}>
                  {productLabel(product, t("common.notSet"))}
                </Link>
              ) : (
                productLabel(product, t("common.notSet"))
              )}
            </td>
            <td>{money(product.addonPrice)}</td>
            <td>{product.quantity ?? t("common.notSet")}</td>
            {editing ? (
              <td className="table-actions-cell">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("packageDetail.removeProduct")}
                  disabled={pendingAction === product.id}
                  onClick={() => {
                    setPendingAction(product.id);
                    void removeProduct(product.id)
                      .then(() => refreshDetail())
                      .finally(() => setPendingAction(null));
                  }}
                >
                  <X />
                </Button>
              </td>
            ) : null}
          </>
        ) : (
          <td colSpan={editing ? 4 : 3} className="package-empty-products">
            {t("packageDetail.noProductsInSet")}
          </td>
        )}
        {rowIndex === 0 ? (
          <td rowSpan={span}>{group.maximumChoices ?? t("common.notSet")}</td>
        ) : null}
        {rowIndex === 0 && editing ? (
          <td className="table-actions-cell package-set-actions" rowSpan={span}>
            <div className="table-row-actions">
              {canAddToGroup ? (
                <Button
                  type="button"
                  disabled={pendingAction === `add-${group.id}`}
                  onClick={() =>
                    setSearchingChoiceSetId((current) =>
                      current === group.id ? null : group.id,
                    )
                  }
                >
                  <Plus />
                  {t("packageDetail.addProduct")}
                </Button>
              ) : null}
              {group.id !== "ungrouped" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("packageDetail.removeChoiceSet")}
                  disabled={pendingAction === group.id}
                  onClick={() => {
                    setPendingAction(group.id);
                    void removeChoiceSet(group.id, group.legacyId)
                      .then(() => refreshDetail())
                      .finally(() => setPendingAction(null));
                  }}
                >
                  <X />
                </Button>
              ) : null}
            </div>
          </td>
        ) : null}
      </tr>
    )).concat(
      searching
        ? [
            <tr key={`${group.id}-search`}>
              <td colSpan={4}>
                <PackageProductSearch
                  excludeIds={excludeIds}
                  searchProducts={searchProducts}
                  onSelect={(item) => void handleSelectProduct(group, item)}
                />
              </td>
            </tr>,
          ]
        : [],
    );
  };

  return (
    <section className={cn("detail-page", editing && "is-editing")}>
      <header className="page-heading">
        <div>
          <nav className="detail-breadcrumb" aria-label={t("packageDetail.breadcrumb")}>
            <Link to="/products/packages">{t("packageDetail.listCrumb")}</Link>
            <span aria-hidden="true">›</span>
            <span>{displayName}</span>
          </nav>
          <span className="eyebrow">
            {editing ? t("packageDetail.editEyebrow") : t("packageDetail.eyebrow")}
          </span>
          <h1>{displayName}</h1>
          <p>{pkg.sku || t("common.notSet")}</p>
        </div>
        <div className="heading-actions">
          <span className={cn("status-badge", pkg.isActive ? "green" : "neutral")}>
            {pkg.isActive ? t("packages.active") : pkg.status || t("packages.inactive")}
          </span>
          {canEdit && !editing ? (
            <Button asChild>
              <Link to={`/products/packages/${pkg.id}/edit`}>
                <Pencil />
                {t("packageDetail.editAction")}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <article className="panel detail-card">
        <header className="product-section-header">
          <h2>
            {displayName} - {t("packageDetail.options")}
          </h2>
        </header>

        {editing ? (
          <div className="product-inline-add">
            <label>
              <span>{t("packageDetail.categoryName")}</span>
              <input
                type="text"
                value={categoryName}
                placeholder={t("packageDetail.categoryNamePlaceholder")}
                className={cn(categoryNameError && !categoryName.trim() && "is-invalid")}
                onChange={(event) => {
                  setCategoryName(event.target.value);
                  if (event.target.value.trim()) setCategoryNameError(false);
                }}
              />
            </label>
            <label>
              <span>{t("packageDetail.selectableCount")}</span>
              <input
                type="number"
                min="1"
                step="1"
                value={categoryMax}
                placeholder={t("packageDetail.selectableCountPlaceholder")}
                onChange={(event) => setCategoryMax(event.target.value)}
              />
            </label>
            <Button
              type="button"
              disabled={addingChoiceSet}
              onClick={() => void handleAddChoiceSet()}
            >
              <Plus />
              {t("packageDetail.addChoiceSet")}
            </Button>
          </div>
        ) : null}

        {groups.length === 0 ? (
          <p className="detail-description">{t("packageDetail.noChoiceSets")}</p>
        ) : (
          <PullToRefresh
            className="table-wrap detail-inline-table package-options-table"
            onRefresh={() => setReloadKey((key) => key + 1)}
            refreshing={loading}
          >
            <table>
              <thead>
                <tr>
                  <th aria-label={t("packages.columns.index")} />
                  <th>{t("packageDetail.categoryName")}</th>
                  <th>{t("packageDetail.productName")}</th>
                  <th>{t("packageDetail.addonPrice")}</th>
                  <th>{t("packageDetail.productQuantity")}</th>
                  {editing ? <th>{t("packages.columns.actions")}</th> : null}
                  <th>{t("packageDetail.selectableCount")}</th>
                  {editing ? <th>{t("packages.columns.actions")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((group, index) => renderGroupRows(group, index))}
              </tbody>
            </table>
          </PullToRefresh>
        )}
      </article>
    </section>
  );
}
