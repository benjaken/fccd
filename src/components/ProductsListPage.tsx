import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  Search,
  ShoppingBasket,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchProductChannels,
  fetchProducts,
  PRODUCTS_PAGE_SIZE,
  type CatalogOption,
  type ProductListFilters,
  type ProductListItem,
  type ProductListResult,
  type ProductPreset,
  type ProductPriceRange,
  type ProductStatusFilter,
} from "@/lib/products";

type ProductsLoader = (filters: ProductListFilters) => Promise<ProductListResult>;
type ChannelsLoader = () => Promise<CatalogOption[]>;

export function ProductsListPage({
  preset = "all",
  loadProducts = fetchProducts,
  loadChannels = fetchProductChannels,
}: {
  preset?: ProductPreset;
  loadProducts?: ProductsLoader;
  loadChannels?: ChannelsLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState("");
  const [status, setStatus] = useState<ProductStatusFilter>("");
  const [priceRange, setPriceRange] = useState<ProductPriceRange>("");
  const [channels, setChannels] = useState<CatalogOption[]>([]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * PRODUCTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * PRODUCTS_PAGE_SIZE, total);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    void loadChannels()
      .then((options) => {
        if (active) setChannels(options);
      })
      .catch(() => {
        if (active) setChannels([]);
      });
    return () => {
      active = false;
    };
  }, [loadChannels]);

  useEffect(() => {
    setPage(1);
    setChannelId("");
    setStatus("");
    setPriceRange("");
  }, [preset]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadProducts({
        page,
        search,
        channelId,
        status,
        priceRange,
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
  }, [channelId, loadProducts, page, preset, priceRange, reloadKey, search, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
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
          <form className="products-search" onSubmit={submitSearch}>
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="products-search">
              {t("products.search")}
            </label>
            <input
              id="products-search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder={t("products.searchPlaceholder")}
            />
            <Button type="submit" variant="outline">
              {t("products.searchAction")}
            </Button>
          </form>

          <div className="products-filters">
            <label className="products-status-filter">
              <span>{t("products.priceRangeFilter")}</span>
              <select
                value={priceRange}
                onChange={(event) => {
                  setPage(1);
                  setPriceRange(event.target.value as ProductPriceRange);
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
                value={channelId}
                onChange={(event) => {
                  setPage(1);
                  setChannelId(event.target.value);
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
              <span>{t("products.statusFilter")}</span>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value as ProductStatusFilter);
                }}
              >
                <option value="">{t("products.allStatuses")}</option>
                <option value="Active">{t("products.statusActive")}</option>
                <option value="Inactive">{t("products.statusInactive")}</option>
                <option value="unset">{t("products.statusUnset")}</option>
              </select>
            </label>
          </div>
        </header>

        {loading ? (
          <div className="products-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("products.loading")}</span>
          </div>
        ) : error ? (
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
        ) : items.length === 0 ? (
          <div className="products-state products-state-empty">
            <ShoppingBasket />
            <div>
              <strong>{t("products.empty")}</strong>
              <span>{t("products.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="table-wrap products-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("products.columns.sku")}</th>
                  <th>{t("products.columns.name")}</th>
                  <th>{t("products.columns.channel")}</th>
                  <th>{t("products.columns.type")}</th>
                  <th>{t("products.columns.price")}</th>
                  <th>{t("products.columns.status")}</th>
                  <th>{t("products.columns.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr key={product.id}>
                    <td>{product.sku || t("common.notSet")}</td>
                    <td>
                      <Link className="order-link" to={`/products/${product.id}`}>
                        <strong>{displayName(product)}</strong>
                      </Link>
                      {product.chineseName && product.name !== product.chineseName && (
                        <small className="quote-company">{product.name}</small>
                      )}
                    </td>
                    <td>{product.channelName || t("common.notSet")}</td>
                    <td>{product.productTypeName || t("common.notSet")}</td>
                    <td>
                      <strong>{formatPrice(product)}</strong>
                    </td>
                    <td>
                      <span className={`status-badge ${statusTone(product)}`}>
                        {statusLabel(product)}
                      </span>
                    </td>
                    <td>
                      {dateTimeFormatter.format(new Date(product.updatedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
