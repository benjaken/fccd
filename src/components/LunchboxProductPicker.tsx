import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  fetchLunchboxPickerFilterOptions,
  fetchProducts,
  type LunchboxPickerFilterOptions,
  type ProductListFilters,
  type ProductListItem,
} from "@/lib/products";
import { cn } from "@/lib/utils";

const EMPTY_FILTER_OPTIONS: LunchboxPickerFilterOptions = {
  staples: [],
  compartments: [],
  cookTypes: [],
  mainIngredients: [],
  specialRequests: [],
};

type PickerFilters = Pick<
  ProductListFilters,
  | "bentoMainTypeId"
  | "bentoColumnTypeId"
  | "cookTypeId"
  | "mainIngredientId"
  | "specialRequestId"
> & {
  priceMin: string;
  priceMax: string;
};

const EMPTY_FILTERS: PickerFilters = {
  priceMin: "",
  priceMax: "",
  bentoMainTypeId: "",
  bentoColumnTypeId: "",
  cookTypeId: "",
  mainIngredientId: "",
  specialRequestId: "",
};

function numericPrice(value: string) {
  if (!value.trim()) return undefined;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function itemName(item: ProductListItem) {
  return item.name || item.chineseName || item.sku || "—";
}

export function LunchboxProductPicker({
  open,
  onClose,
  onConfirm,
  initialSelectedProductIds = [],
  loadProducts = fetchProducts,
  loadFilterOptions = fetchLunchboxPickerFilterOptions,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: ProductListItem[]) => void;
  initialSelectedProductIds?: string[];
  loadProducts?: typeof fetchProducts;
  loadFilterOptions?: typeof fetchLunchboxPickerFilterOptions;
}) {
  const { t } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<PickerFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [recommended, setRecommended] = useState<ProductListItem[]>([]);
  const [moreProducts, setMoreProducts] = useState<ProductListItem[]>([]);
  const [moreTotal, setMoreTotal] = useState(0);
  const [morePage, setMorePage] = useState(1);
  const [selected, setSelected] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const initialSelectedProductIdsKey = initialSelectedProductIds.join("|");

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setDraftSearch("");
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
    setMorePage(1);
  }, [open]);

  useEffect(() => {
    if (!open || !initialSelectedProductIds.length) return;
    let active = true;
    void loadProducts({
      page: 1,
      pageSize: Math.min(100, initialSelectedProductIds.length),
      search: "",
      channelId: "",
      productTypeName: "",
      status: "",
      priceRange: "",
      preset: "lunchbox",
      sortField: "name",
      sortAscending: true,
      productIds: initialSelectedProductIds,
    })
      .then((result) => { if (active) setSelected(result.items); })
      .catch(() => { if (active) setSelected([]); });
    return () => { active = false; };
  }, [initialSelectedProductIdsKey, loadProducts, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadFilterOptions()
      .then((options) => { if (active) setFilterOptions(options); })
      .catch(() => { if (active) setFilterOptions(EMPTY_FILTER_OPTIONS); });
    return () => { active = false; };
  }, [loadFilterOptions, open]);

  const requestFilters = useMemo(() => ({
    search,
    channelId: "",
    productTypeName: "",
    status: "",
    preset: "lunchbox" as const,
    sortField: "name" as const,
    sortAscending: true,
    priceRange: "",
    priceMin: numericPrice(filters.priceMin),
    priceMax: numericPrice(filters.priceMax),
    bentoMainTypeId: filters.bentoMainTypeId,
    bentoColumnTypeId: filters.bentoColumnTypeId,
    cookTypeId: filters.cookTypeId,
    mainIngredientId: filters.mainIngredientId,
    specialRequestId: filters.specialRequestId,
  }), [filters, search]);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [recommendedResult, moreResult] = await Promise.all([
        loadProducts({
          ...requestFilters,
          page: 1,
          pageSize: 6,
          recommended: true,
        }),
        loadProducts({
          ...requestFilters,
          page: 1,
          pageSize: 24,
          recommended: false,
        }),
      ]);
      setRecommended(recommendedResult.items);
      setMoreProducts(moreResult.items);
      setMoreTotal(moreResult.total);
      setMorePage(1);
    } catch {
      setRecommended([]);
      setMoreProducts([]);
      setMoreTotal(0);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loadProducts, requestFilters]);

  useEffect(() => {
    if (open) void loadFirstPage();
  }, [loadFirstPage, open]);

  const loadMore = async () => {
    const nextPage = morePage + 1;
    setLoadingMore(true);
    try {
      const result = await loadProducts({
        ...requestFilters,
        page: nextPage,
        pageSize: 24,
        recommended: false,
      });
      setMoreProducts((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setMorePage(nextPage);
      setMoreTotal(result.total);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);
  const toggle = (item: ProductListItem) => {
    setSelected((current) => current.some((selectedItem) => selectedItem.id === item.id)
      ? current.filter((selectedItem) => selectedItem.id !== item.id)
      : [...current, item]);
  };

  const activeFilters = useMemo(() => {
    const optionLabel = (items: Array<{ id: string; name: string }>, id: string | undefined) =>
      items.find((item) => item.id === id)?.name;
    const priceLabel = filters.priceMin && filters.priceMax
      ? `HK$${filters.priceMin} – HK$${filters.priceMax}`
      : filters.priceMin
        ? `HK$${filters.priceMin}+`
        : filters.priceMax
          ? `≤ HK$${filters.priceMax}`
          : "";
    return [
      priceLabel ? { keys: ["priceMin", "priceMax"] as Array<keyof PickerFilters>, label: priceLabel } : null,
      filters.bentoMainTypeId ? { keys: ["bentoMainTypeId"] as Array<keyof PickerFilters>, label: optionLabel(filterOptions.staples, filters.bentoMainTypeId) } : null,
      filters.bentoColumnTypeId ? { keys: ["bentoColumnTypeId"] as Array<keyof PickerFilters>, label: optionLabel(filterOptions.compartments, filters.bentoColumnTypeId) } : null,
      filters.mainIngredientId ? { keys: ["mainIngredientId"] as Array<keyof PickerFilters>, label: optionLabel(filterOptions.mainIngredients, filters.mainIngredientId) } : null,
      filters.specialRequestId ? { keys: ["specialRequestId"] as Array<keyof PickerFilters>, label: optionLabel(filterOptions.specialRequests, filters.specialRequestId) } : null,
      filters.cookTypeId ? { keys: ["cookTypeId"] as Array<keyof PickerFilters>, label: optionLabel(filterOptions.cookTypes, filters.cookTypeId) } : null,
    ].filter((item): item is { keys: Array<keyof PickerFilters>; label: string } => Boolean(item?.label));
  }, [filterOptions, filters]);

  const renderProduct = (item: ProductListItem, isRecommended: boolean) => {
    const checked = selectedIds.has(item.id);
    const tags = [
      item.bentoMainTypeName,
      item.bentoColumnTypeName,
      ...item.mainIngredients,
      ...item.specialRequests,
      item.cookTypeName,
    ].filter((value): value is string => Boolean(value));
    const range = item.priceMin !== null || item.priceMax !== null
      ? `${item.priceMin === null ? "—" : `HK$${item.priceMin}`} – ${item.priceMax === null ? "—" : `HK$${item.priceMax}`}`
      : null;
    return (
      <button
        type="button"
        key={item.id}
        className={cn("lunchbox-picker-product", checked && "is-selected", isRecommended && "is-recommended")}
        aria-pressed={checked}
        aria-label={t(checked ? "quoteEditor.items.lunchboxUnselect" : "quoteEditor.items.lunchboxSelect", { name: itemName(item) })}
        onClick={() => toggle(item)}
      >
        <span className="lunchbox-picker-check" aria-hidden="true">{checked ? <Check /> : null}</span>
        <span className="lunchbox-picker-product-copy">
          <span className="lunchbox-picker-product-heading">
            <span><small>{item.sku || "—"}</small><strong>{itemName(item)}</strong></span>
            {isRecommended ? <em><Star fill="currentColor" />{t("quoteEditor.items.lunchboxRecommendedBadge")}</em> : null}
          </span>
          {tags.length ? <span className="lunchbox-picker-tags">{tags.slice(0, 6).map((tag) => <small key={tag}>{tag}</small>)}</span> : null}
        </span>
        <span className="lunchbox-picker-price">
          <strong>{item.price === null ? "—" : `HK$${item.price}`}</strong>
          {range ? <small>{range}</small> : null}
        </span>
      </button>
    );
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={t("quoteEditor.items.lunchboxTitle")}
      description={t("quoteEditor.items.lunchboxDescription")}
      closeLabel={t("quoteEditor.items.lunchboxClose")}
      className="side-panel-majority lunchbox-picker-panel"
      footer={(
        <div className="lunchbox-picker-footer">
          <span>{t("quoteEditor.items.lunchboxSelectedCount", { count: selected.length })}</span>
          <div>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="button" disabled={!selected.length} onClick={() => onConfirm(selected)}>
              <Check />{t("quoteEditor.items.lunchboxConfirm", { count: selected.length })}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="lunchbox-picker-workspace">
        <form className="lunchbox-picker-search" onSubmit={(event) => { event.preventDefault(); setSearch(draftSearch.trim()); }}>
          <label>
            <span className="sr-only">{t("quoteEditor.items.lunchboxSearch")}</span>
            <Search />
            <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder={t("quoteEditor.items.lunchboxSearchPlaceholder")} />
          </label>
          <Button type="submit">{t("quoteEditor.items.lunchboxSearchAction")}</Button>
          <Button type="button" variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
            <SlidersHorizontal />{t("quoteEditor.items.lunchboxFilters")}{activeFilters.length ? <span>{activeFilters.length}</span> : null}
          </Button>
        </form>

        {activeFilters.length ? (
          <div className="lunchbox-picker-active-filters" aria-label={t("quoteEditor.items.lunchboxActiveFilters")}>
            {activeFilters.map((filter) => (
              <button type="button" key={filter.keys.join("-")} onClick={() => setFilters((current) => filter.keys.reduce((next, key) => ({ ...next, [key]: "" }), current))}>
                {filter.label}<X />
              </button>
            ))}
            <button type="button" className="is-clear" onClick={() => setFilters(EMPTY_FILTERS)}>{t("quoteEditor.items.lunchboxClearFilters")}</button>
          </div>
        ) : null}

        {filtersOpen ? (
          <div className="lunchbox-picker-filters">
            <div className="lunchbox-picker-price-filter">
              <span>{t("products.priceRangeFilter")}</span>
              <div>
                <label><span>{t("quoteEditor.items.lunchboxPriceMin")}</span><input type="number" min="0" step="any" inputMode="decimal" value={filters.priceMin} onChange={(event) => setFilters((current) => ({ ...current, priceMin: event.target.value }))} placeholder={t("quoteEditor.items.lunchboxPriceMinPlaceholder")} /></label>
                <label><span>{t("quoteEditor.items.lunchboxPriceMax")}</span><input type="number" min="0" step="any" inputMode="decimal" value={filters.priceMax} onChange={(event) => setFilters((current) => ({ ...current, priceMax: event.target.value }))} placeholder={t("quoteEditor.items.lunchboxPriceMaxPlaceholder")} /></label>
              </div>
            </div>
            <label><span>{t("products.stapleFilter")}</span><FilterableSelect value={filters.bentoMainTypeId} onChange={(event) => setFilters((current) => ({ ...current, bentoMainTypeId: event.target.value }))}><option value="">{t("products.allStaples")}</option>{filterOptions.staples.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
            <label><span>{t("products.compartmentFilter")}</span><FilterableSelect value={filters.bentoColumnTypeId} onChange={(event) => setFilters((current) => ({ ...current, bentoColumnTypeId: event.target.value }))}><option value="">{t("products.allCompartments")}</option>{filterOptions.compartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
            <label><span>{t("quoteEditor.items.lunchboxIngredient")}</span><FilterableSelect value={filters.mainIngredientId} onChange={(event) => setFilters((current) => ({ ...current, mainIngredientId: event.target.value }))}><option value="">{t("quoteEditor.items.lunchboxAllIngredients")}</option>{filterOptions.mainIngredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
            <label><span>{t("quoteEditor.items.lunchboxSpecialRequest")}</span><FilterableSelect value={filters.specialRequestId} onChange={(event) => setFilters((current) => ({ ...current, specialRequestId: event.target.value }))}><option value="">{t("quoteEditor.items.lunchboxAllSpecialRequests")}</option>{filterOptions.specialRequests.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
            <label><span>{t("products.cookFilter")}</span><FilterableSelect value={filters.cookTypeId} onChange={(event) => setFilters((current) => ({ ...current, cookTypeId: event.target.value }))}><option value="">{t("products.allCookTypes")}</option>{filterOptions.cookTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
          </div>
        ) : null}

        <div className="lunchbox-picker-content">
          <div className="lunchbox-picker-selected-column">
            <header className="lunchbox-picker-column-heading"><div><h3>{t("quoteEditor.items.lunchboxSelected")}</h3><span>{selected.length}</span></div>{selected.length ? <button type="button" onClick={() => setSelected([])}>{t("quoteEditor.items.lunchboxClearSelected")}</button> : null}</header>
            <section className="lunchbox-picker-selected">
              {selected.length ? <div>{selected.map((item) => <button type="button" key={item.id} onClick={() => toggle(item)}><span><small>{item.sku || "—"}</small><strong>{itemName(item)}</strong></span><X /></button>)}</div> : <p>{t("quoteEditor.items.lunchboxSelectedEmpty")}</p>}
            </section>
          </div>

          <div className="lunchbox-picker-catalog">
            {loadError ? <div className="lunchbox-picker-state is-error"><strong>{t("quoteEditor.items.lunchboxLoadError")}</strong><Button type="button" variant="outline" onClick={() => void loadFirstPage()}>{t("common.retry")}</Button></div> : loading ? <div className="lunchbox-picker-state"><LoaderCircle className="spin" /><span>{t("quoteEditor.items.lunchboxLoading")}</span></div> : (
              <>
                <section className="lunchbox-picker-section">
                  <header><div><Star /><h3>{t("quoteEditor.items.lunchboxRecommended")}</h3></div><span>{recommended.length}</span></header>
                  {recommended.length ? <div className="lunchbox-picker-product-grid">{recommended.map((item) => renderProduct(item, true))}</div> : <p className="lunchbox-picker-empty">{t("quoteEditor.items.lunchboxRecommendedEmpty")}</p>}
                </section>
                <section className="lunchbox-picker-section is-more">
                  <header><div><h3>{t("quoteEditor.items.lunchboxMore")}</h3></div><span>{moreTotal}</span></header>
                  {moreProducts.length ? <div className="lunchbox-picker-product-grid">{moreProducts.map((item) => renderProduct(item, false))}</div> : <p className="lunchbox-picker-empty">{t("quoteEditor.items.lunchboxMoreEmpty")}</p>}
                  {moreProducts.length < moreTotal ? <Button type="button" variant="outline" className="lunchbox-picker-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className="spin" /> : null}{t("quoteEditor.items.lunchboxLoadMore")}</Button> : null}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
