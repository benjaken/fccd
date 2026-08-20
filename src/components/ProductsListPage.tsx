import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Pencil, RefreshCw, ShoppingBasket } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ProductRecommendStar } from "@/components/ProductRecommendStar";
import { ProductTagList } from "@/components/ProductTagList";
import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { detailFromLocation } from "@/lib/detail-navigation";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  fetchBentoColumnTypes,
  fetchBentoMainTypes,
  fetchCatalogCookTypes,
  fetchProductChannels,
  fetchProductTypes,
  fetchProducts,
  PRODUCTS_PAGE_SIZE,
  updateProductRecommendation,
  type CatalogOption,
  type ProductListFilters,
  type ProductListItem,
  type ProductListResult,
  type ProductPreset,
  type ProductPriceRange,
  type ProductSortField,
  type ProductStatusFilter,
} from "@/lib/products";

const PRODUCT_SKELETON_COLUMNS = [
  { width: "5.5rem" },
  { width: "5.5rem" },
  { width: "72%" },
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
  { width: "3.5rem" },
  { width: "7rem" },
  { width: "8rem" },
  { width: "4.5rem" },
  { width: "2.5rem" },
  { width: "3.5rem", variant: "badge" as const },
];

type ProductsLoader = (filters: ProductListFilters) => Promise<ProductListResult>;
type ChannelsLoader = () => Promise<CatalogOption[]>;
type ProductTypesLoader = (channelId?: string) => Promise<CatalogOption[]>;
type StaplesLoader = () => Promise<CatalogOption[]>;
type CompartmentsLoader = () => Promise<CatalogOption[]>;
type CookTypesLoader = () => Promise<CatalogOption[]>;
type RecommendUpdater = typeof updateProductRecommendation;

export function ProductsListPage({
  preset = "all",
  canEdit = false,
  loadProducts = fetchProducts,
  loadChannels = fetchProductChannels,
  loadProductTypes = fetchProductTypes,
  loadBentoMainTypes = fetchBentoMainTypes,
  loadBentoColumnTypes = fetchBentoColumnTypes,
  loadCookTypes = fetchCatalogCookTypes,
  updateRecommendation = updateProductRecommendation,
}: {
  preset?: ProductPreset;
  canEdit?: boolean;
  loadProducts?: ProductsLoader;
  loadChannels?: ChannelsLoader;
  loadProductTypes?: ProductTypesLoader;
  loadBentoMainTypes?: StaplesLoader;
  loadBentoColumnTypes?: CompartmentsLoader;
  loadCookTypes?: CookTypesLoader;
  updateRecommendation?: RecommendUpdater;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState(
    () => searchParams.get("channel") ?? "",
  );
  const [productTypeName, setProductTypeName] = useState(
    () => searchParams.get("type") ?? "",
  );
  const [bentoMainTypeId, setBentoMainTypeId] = useState(
    () => searchParams.get("staple") ?? "",
  );
  const [bentoColumnTypeId, setBentoColumnTypeId] = useState(
    () => searchParams.get("compartments") ?? "",
  );
  const [cookTypeId, setCookTypeId] = useState(
    () => searchParams.get("cook") ?? "",
  );
  const [status, setStatus] = useState<ProductStatusFilter>("");
  const [priceRange, setPriceRange] = useState<ProductPriceRange>("");
  const priceFilter = useDeferredFilter(priceRange, (value) => {
    setPage(1);
    setPriceRange(value);
  });
  const channelFilter = useDeferredFilter(channelId, (value) => {
    setPage(1);
    setChannelId(value);
  });
  const typeFilter = useDeferredFilter(productTypeName, (value) => {
    setPage(1);
    setProductTypeName(value);
  });
  const stapleFilter = useDeferredFilter(bentoMainTypeId, (value) => {
    setPage(1);
    setBentoMainTypeId(value);
  });
  const compartmentFilter = useDeferredFilter(bentoColumnTypeId, (value) => {
    setPage(1);
    setBentoColumnTypeId(value);
  });
  const cookFilter = useDeferredFilter(cookTypeId, (value) => {
    setPage(1);
    setCookTypeId(value);
  });
  const statusFilter = useDeferredFilter(status, (value) => {
    setPage(1);
    setStatus(value);
  });
  const [channels, setChannels] = useState<CatalogOption[]>([]);
  const [productTypes, setProductTypes] = useState<CatalogOption[]>([]);
  const [bentoMainTypes, setBentoMainTypes] = useState<CatalogOption[]>([]);
  const [bentoColumnTypes, setBentoColumnTypes] = useState<CatalogOption[]>([]);
  const [cookTypes, setCookTypes] = useState<CatalogOption[]>([]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingRecommendId, setPendingRecommendId] = useState<string | null>(
    null,
  );
  const [sortField, setSortField] = useState<ProductSortField>("sku");
  const [sortAscending, setSortAscending] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * PRODUCTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * PRODUCTS_PAGE_SIZE, total);
  const skeletonColumns = [
    ...PRODUCT_SKELETON_COLUMNS,
    ...(canEdit ? [{ width: "2.75rem", variant: "action" as const }] : []),
  ];

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    void loadChannels()
      .then((channelOptions) => {
        if (active) setChannels(channelOptions);
      })
      .catch(() => {
        if (active) setChannels([]);
      });
    return () => {
      active = false;
    };
  }, [loadChannels]);

  useEffect(() => {
    let active = true;
    void loadBentoMainTypes()
      .then((stapleOptions) => {
        if (active) setBentoMainTypes(stapleOptions);
      })
      .catch(() => {
        if (active) setBentoMainTypes([]);
      });
    return () => {
      active = false;
    };
  }, [loadBentoMainTypes]);

  useEffect(() => {
    let active = true;
    void loadBentoColumnTypes()
      .then((compartmentOptions) => {
        if (active) setBentoColumnTypes(compartmentOptions);
      })
      .catch(() => {
        if (active) setBentoColumnTypes([]);
      });
    return () => {
      active = false;
    };
  }, [loadBentoColumnTypes]);

  useEffect(() => {
    let active = true;
    void loadCookTypes()
      .then((cookOptions) => {
        if (active) setCookTypes(cookOptions);
      })
      .catch(() => {
        if (active) setCookTypes([]);
      });
    return () => {
      active = false;
    };
  }, [loadCookTypes]);

  useEffect(() => {
    let active = true;
    void loadProductTypes(channelFilter.value)
      .then((typeOptions) => {
        if (!active) return;
        setProductTypes(typeOptions);
        if (
          typeFilter.value &&
          !typeOptions.some((option) => option.name === typeFilter.value)
        ) {
          typeFilter.setValue("");
        }
      })
      .catch(() => {
        if (!active) return;
        setProductTypes([]);
        typeFilter.setValue("");
      });
    return () => {
      active = false;
    };
  }, [
    channelFilter.value,
    loadProductTypes,
    typeFilter.setValue,
    typeFilter.value,
  ]);

  useEffect(() => {
    const nextChannel = searchParams.get("channel") ?? "";
    const nextType = searchParams.get("type") ?? "";
    const nextStaple = searchParams.get("staple") ?? "";
    const nextCompartments = searchParams.get("compartments") ?? "";
    const nextCook = searchParams.get("cook") ?? "";
    setChannelId((current) => (current === nextChannel ? current : nextChannel));
    setProductTypeName((current) => (current === nextType ? current : nextType));
    setBentoMainTypeId((current) =>
      current === nextStaple ? current : nextStaple,
    );
    setBentoColumnTypeId((current) =>
      current === nextCompartments ? current : nextCompartments,
    );
    setCookTypeId((current) => (current === nextCook ? current : nextCook));
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (channelId) next.set("channel", channelId);
    if (productTypeName) next.set("type", productTypeName);
    if (bentoMainTypeId) next.set("staple", bentoMainTypeId);
    if (bentoColumnTypeId) next.set("compartments", bentoColumnTypeId);
    if (cookTypeId) next.set("cook", cookTypeId);
    const current = searchParams.toString();
    const upcoming = next.toString();
    if (current !== upcoming) {
      setSearchParams(next, { replace: true });
    }
  }, [
    bentoColumnTypeId,
    bentoMainTypeId,
    channelId,
    cookTypeId,
    productTypeName,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    setPage(1);
    setChannelId("");
    setProductTypeName("");
    setBentoMainTypeId("");
    setBentoColumnTypeId("");
    setCookTypeId("");
    setStatus("");
    setPriceRange("");
    setSortField("sku");
    setSortAscending(true);
  }, [preset]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadProducts({
        page,
        search,
        channelId,
        productTypeName,
        bentoMainTypeId,
        bentoColumnTypeId,
        cookTypeId,
        status,
        priceRange,
        sortField,
        sortAscending,
        preset,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "products_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [
    channelId,
    loadProducts,
    page,
    preset,
    priceRange,
    productTypeName,
    bentoColumnTypeId,
    bentoMainTypeId,
    cookTypeId,
    reloadKey,
    search,
    sortAscending,
    sortField,
    status,
  ]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const toggleSort = (field: ProductSortField) => {
    setPage(1);
    if (sortField === field) {
      setSortAscending((current) => !current);
      return;
    }
    setSortField(field);
    setSortAscending(true);
  };

  const sortIcon = (field: ProductSortField) => {
    if (sortField !== field) return null;
    return sortAscending ? <ArrowUp /> : <ArrowDown />;
  };

  const titleKey =
    preset === "catering"
      ? "cateringTitle"
      : preset === "lunchbox"
        ? "lunchboxTitle"
        : preset === "ala-carte"
          ? "alaCarteTitle"
          : "title";

  const formatPrice = (product: ProductListItem) => {
    if (product.price === null) return t("common.notSet");
    return currencyFormatter.format(product.price);
  };

  const formatRange = (product: ProductListItem) => {
    if (product.priceMin === null && product.priceMax === null) {
      return t("common.notSet");
    }
    const min =
      product.priceMin === null
        ? t("common.notSet")
        : currencyFormatter.format(product.priceMin);
    const max =
      product.priceMax === null
        ? t("common.notSet")
        : currencyFormatter.format(product.priceMax);
    return `${min} – ${max}`;
  };

  const displayName = (product: ProductListItem) =>
    product.chineseName || product.name || t("common.notSet");

  const statusLabel = (product: ProductListItem) => {
    if (product.status === "Active") return t("products.statusActive");
    if (product.status === "Inactive") return t("products.statusInactive");
    if (product.status) return product.status;
    return t("products.statusUnset");
  };

  const statusTone = (product: ProductListItem) => {
    if (product.status === "Active") return "green";
    if (product.status === "Inactive") return "amber";
    return "blue";
  };

  const recommendLabel = (recommended: boolean) =>
    recommended
      ? t("products.recommendedOn")
      : t("products.recommendedOff");

  const openProduct = (productId: string) => {
    navigate(`/products/${productId}`, {
      state: detailFromLocation(location),
    });
  };

  const toggleRecommend = async (product: ProductListItem) => {
    if (!canEdit || pendingRecommendId) return;
    const next = !product.isBentoRecommended;
    setPendingRecommendId(product.id);
    setItems((current) =>
      current.map((item) =>
        item.id === product.id ? { ...item, isBentoRecommended: next } : item,
      ),
    );
    try {
      await updateRecommendation(product.id, next);
    } catch {
      setItems((current) =>
        current.map((item) =>
          item.id === product.id
            ? { ...item, isBentoRecommended: product.isBentoRecommended }
            : item,
        ),
      );
    } finally {
      setPendingRecommendId(null);
    }
  };

  return (
    <section className="products-page">
      <header className="page-heading products-heading">
        <div>
          <span className="eyebrow">{t("products.eyebrow")}</span>
          <h1>{t(`products.${titleKey}`)}</h1>
        </div>
      </header>

      <article className="panel products-panel">
        <header className="products-toolbar">
          <ListSearchBar
            id="products-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("products.search")}
            placeholder={t("products.searchPlaceholder")}
            submitLabel={t("products.searchAction")}
            filtersAlwaysInDrawer
            filtersActive={Boolean(
              priceRange ||
                channelId ||
                productTypeName ||
                bentoMainTypeId ||
                bentoColumnTypeId ||
                cookTypeId ||
                status,
            )}
            onConfirmFilters={() => {
              priceFilter.confirm();
              channelFilter.confirm();
              typeFilter.confirm();
              stapleFilter.confirm();
              compartmentFilter.confirm();
              cookFilter.confirm();
              statusFilter.confirm();
            }}
            onDismissFilters={() => {
              priceFilter.revert();
              channelFilter.revert();
              typeFilter.revert();
              stapleFilter.revert();
              compartmentFilter.revert();
              cookFilter.revert();
              statusFilter.revert();
            }}
            filters={
              <div className="products-filters">
                <label className="products-status-filter">
                  <span>{t("products.priceRangeFilter")}</span>
                  <select
                    value={priceFilter.value}
                    onChange={(event) => {
                      priceFilter.setValue(
                        event.target.value as ProductPriceRange,
                      );
                    }}
                  >
                    <option value="">{t("products.allPriceRanges")}</option>
                    <option value="under-100">{t("products.priceRanges.under100")}</option>
                    <option value="100-299">{t("products.priceRanges.r100to299")}</option>
                    <option value="300-799">{t("products.priceRanges.r300to799")}</option>
                    <option value="800-1999">{t("products.priceRanges.r800to1999")}</option>
                    <option value="2000-plus">{t("products.priceRanges.r2000Plus")}</option>
                  </select>
                </label>

                <label className="products-status-filter">
                  <span>{t("products.channelFilter")}</span>
                  <select
                    value={channelFilter.value}
                    onChange={(event) => {
                      channelFilter.setValue(event.target.value);
                      typeFilter.setValue("");
                    }}
                  >
                    <option value="">{t("products.allChannels")}</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-status-filter">
                  <span>{t("products.typeFilter")}</span>
                  <select
                    value={typeFilter.value}
                    onChange={(event) => {
                      typeFilter.setValue(event.target.value);
                    }}
                  >
                    <option value="">{t("products.allTypes")}</option>
                    {productTypes.map((productType) => (
                      <option key={productType.name} value={productType.name}>
                        {productType.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-status-filter">
                  <span>{t("products.stapleFilter")}</span>
                  <select
                    value={stapleFilter.value}
                    onChange={(event) => {
                      stapleFilter.setValue(event.target.value);
                    }}
                  >
                    <option value="">{t("products.allStaples")}</option>
                    {bentoMainTypes.map((staple) => (
                      <option key={staple.id} value={staple.id}>
                        {staple.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-status-filter">
                  <span>{t("products.compartmentFilter")}</span>
                  <select
                    value={compartmentFilter.value}
                    onChange={(event) => {
                      compartmentFilter.setValue(event.target.value);
                    }}
                  >
                    <option value="">{t("products.allCompartments")}</option>
                    {bentoColumnTypes.map((compartment) => (
                      <option key={compartment.id} value={compartment.id}>
                        {compartment.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-status-filter">
                  <span>{t("products.cookFilter")}</span>
                  <select
                    value={cookFilter.value}
                    onChange={(event) => {
                      cookFilter.setValue(event.target.value);
                    }}
                  >
                    <option value="">{t("products.allCookTypes")}</option>
                    {cookTypes.map((cookType) => (
                      <option key={cookType.id} value={cookType.id}>
                        {cookType.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-status-filter">
                  <span>{t("products.statusFilter")}</span>
                  <select
                    value={statusFilter.value}
                    onChange={(event) => {
                      statusFilter.setValue(
                        event.target.value as ProductStatusFilter,
                      );
                    }}
                  >
                    <option value="">{t("products.allStatuses")}</option>
                    <option value="Active">{t("products.statusActive")}</option>
                    <option value="Inactive">{t("products.statusInactive")}</option>
                    <option value="unset">{t("products.statusUnset")}</option>
                  </select>
                </label>
              </div>
            }
          />
        </header>

        {error ? (
          <div className="products-state products-state-error" role="alert">
            <ShoppingBasket />
            <div>
              <strong>
                {error === "42P01"
                  ? t("products.migrationPending")
                  : t("products.loadError")}
              </strong>
              <span>{t("products.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />
              {t("products.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="products-state products-state-empty">
            <ShoppingBasket />
            <div>
              <strong>{t("products.empty")}</strong>
              <span>{t("products.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="products-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("products.loading")}
            skeletonRows={PRODUCTS_PAGE_SIZE}
            skeletonColumns={skeletonColumns}
            header={
              <tr>
                <th>{t("products.columns.channel")}</th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => toggleSort("sku")}
                  >
                    {t("products.columns.sku")}
                    {sortIcon("sku")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => toggleSort("name")}
                  >
                    {t("products.columns.name")}
                    {sortIcon("name")}
                  </button>
                </th>
                <th>{t("products.columns.type")}</th>
                <th>{t("products.columns.staple")}</th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => toggleSort("price")}
                  >
                    {t("products.columns.price")}
                    {sortIcon("price")}
                  </button>
                </th>
                <th>{t("products.columns.range")}</th>
                <th>{t("products.columns.compartments")}</th>
                <th>{t("products.columns.ingredients")}</th>
                <th>{t("products.columns.specialRequests")}</th>
                <th>{t("products.columns.cookMethod")}</th>
                <th>{t("products.columns.recommended")}</th>
                <th>{t("products.columns.status")}</th>
                {canEdit ? <th>{t("products.columns.actions")}</th> : null}
              </tr>
            }
          >
            {items.map((product) => (
              <tr
                key={product.id}
                className="table-row-clickable"
                onClick={() => openProduct(product.id)}
              >
                <td>{product.channelName || t("common.notSet")}</td>
                <td>{product.sku || t("common.notSet")}</td>
                <td>
                  <DetailLink
                    className="order-link"
                    to={`/products/${product.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <strong>{displayName(product)}</strong>
                  </DetailLink>
                  {product.chineseName &&
                    product.name !== product.chineseName && (
                      <small className="quote-company">{product.name}</small>
                    )}
                </td>
                <td>{product.productTypeName || t("common.notSet")}</td>
                <td>{product.bentoMainTypeName || t("common.notSet")}</td>
                <td>
                  <strong>{formatPrice(product)}</strong>
                </td>
                <td>{formatRange(product)}</td>
                <td>{product.bentoColumnTypeName || t("common.notSet")}</td>
                <td>
                  <ProductTagList
                    tags={product.mainIngredients.map((name) => ({ name }))}
                    empty={t("common.notSet")}
                  />
                </td>
                <td>
                  <ProductTagList
                    tags={product.specialRequests.map((name) => ({ name }))}
                    empty={t("common.notSet")}
                  />
                </td>
                <td>{product.cookTypeName || t("common.notSet")}</td>
                <td className="product-recommend-cell">
                  <ProductRecommendStar
                    recommended={product.isBentoRecommended}
                    label={recommendLabel(product.isBentoRecommended)}
                    disabled={pendingRecommendId === product.id}
                    onToggle={
                      canEdit ? () => void toggleRecommend(product) : undefined
                    }
                  />
                </td>
                <td>
                  <span className={`status-badge ${statusTone(product)}`}>
                    {statusLabel(product)}
                  </span>
                </td>
                {canEdit ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/products/${product.id}/edit`, {
                            state: detailFromLocation(location),
                          });
                        }}
                        aria-label={t("products.editAction")}
                        title={t("products.editAction")}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("products.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
          })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
          onPageChange={setPage}
          previousLabel={t("products.previous")}
          nextLabel={t("products.next")}
          pageLabel={t("products.pageOf")}
          jumpLabel={t("products.jumpToPage")}
        />
      </article>
    </section>
  );
}
