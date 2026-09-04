import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  FileText,
  Paperclip,
  Eye,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { QuoteFilesSidePanel } from "@/components/QuoteFilesSidePanel";
import { DICT_TYPE, dictItemLabel, useDictItems } from "@/lib/dictionaries";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import { useMediaQuery } from "@/lib/use-media-query";
import { hongKongDateKey } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import {
  fetchQuoteBrands,
  fetchQuotes,
  QUOTES_PAGE_SIZE,
  QUOTE_STATUS_UNSET,
  updateQuoteDescription,
  type QuoteBrandOption,
  type QuoteListFilters,
  type QuoteListItem,
  type QuoteListResult,
  type QuotePreset,
} from "@/lib/quotes";

type QuotesLoader = (filters: QuoteListFilters) => Promise<QuoteListResult>;
type QuoteBrandsLoader = () => Promise<QuoteBrandOption[]>;
type QuoteDescriptionUpdater = typeof updateQuoteDescription;

const QUOTE_QUEUE_TABS = ["large", "recent-open"] as const satisfies readonly QuotePreset[];
const QUOTE_CONTEXT_PRESETS = new Set<QuotePreset>([
  ...QUOTE_QUEUE_TABS,
  "pending",
]);

const QUOTE_SKELETON_COLUMNS = [
  { width: "6rem", variant: "badge" as const },
  { width: "7rem" },
  { width: "7rem" },
  { width: "18rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "12rem" },
  { width: "6rem" },
  { width: "6rem", variant: "badge" as const },
  { width: "1.75rem", variant: "action" as const },
];

export function QuotesListPage({
  preset = "all",
  canManage = false,
  loadQuotes = fetchQuotes,
  loadBrands = fetchQuoteBrands,
  saveDescription = updateQuoteDescription,
}: {
  preset?: QuotePreset;
  canManage?: boolean;
  loadQuotes?: QuotesLoader;
  loadBrands?: QuoteBrandsLoader;
  saveDescription?: QuoteDescriptionUpdater;
}) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedQueue = searchParams.get("tab");
  const selectedQueue =
    preset === "all" &&
    QUOTE_CONTEXT_PRESETS.has(requestedQueue as QuotePreset)
      ? (requestedQueue as QuotePreset)
      : null;
  const effectivePreset: QuotePreset = selectedQueue ?? preset;
  const quoteStatusDict = useDictItems(DICT_TYPE.quoteStatus);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<QuoteBrandOption[]>([]);
  const [page, setPage] = useState(1);
  const statusFilter = useDeferredFilter(status, (value) => {
    setPage(1);
    setStatus(value);
  });
  const [items, setItems] = useState<QuoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createdSort, setCreatedSort] = useState<
    "ascending" | "descending" | null
  >(null);
  const [orderNumberSort, setOrderNumberSort] = useState<
    "ascending" | "descending" | null
  >(null);
  const [descriptionDrafts, setDescriptionDrafts] = useState<
    Record<string, string>
  >({});
  const [savingDescriptionId, setSavingDescriptionId] = useState<string | null>(
    null,
  );
  const [descriptionErrorId, setDescriptionErrorId] = useState<string | null>(
    null,
  );
  const [filesQuote, setFilesQuote] = useState<QuoteListItem | null>(null);
  const isMobileList = useMediaQuery("(max-width: 760px)");
  const previousMobileListRef = useRef(isMobileList);

  const totalPages = Math.max(1, Math.ceil(total / QUOTES_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * QUOTES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * QUOTES_PAGE_SIZE, total);

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

  const loadPage = useCallback(async () => {
    const appending = isMobileList && page > 1;
    if (appending) {
      setLoadingMore(true);
      setLoadMoreError(false);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const result = await loadQuotes({
        page,
        search,
        status,
        preset: effectivePreset,
        ...(brandId ? { brandId } : {}),
        ...(createdSort ? { createdSort } : {}),
        ...(orderNumberSort ? { orderNumberSort } : {}),
      });
      setItems((current) => {
        if (!appending) return result.items;
        const next = new Map(current.map((item) => [item.id, item]));
        result.items.forEach((item) => next.set(item.id, item));
        return [...next.values()];
      });
      setTotal(result.total);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "quotes_load_failed";
      if (appending) {
        setLoadMoreError(true);
      } else {
        setItems([]);
        setTotal(0);
        setError(code);
      }
    } finally {
      if (appending) setLoadingMore(false);
      else setLoading(false);
    }
  }, [brandId, createdSort, effectivePreset, isMobileList, loadQuotes, orderNumberSort, page, reloadKey, search, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (previousMobileListRef.current === isMobileList) return;
    previousMobileListRef.current = isMobileList;
    setItems([]);
    setPage(1);
    setLoadMoreError(false);
  }, [isMobileList]);

  useEffect(() => {
    let active = true;
    void loadBrands()
      .then((options) => {
        if (active) setBrands(options);
      })
      .catch(() => {
        if (active) setBrands([]);
      });
    return () => {
      active = false;
    };
  }, [loadBrands]);

  const availableStatuses = useMemo(
    () =>
      [
        ...new Set(
          [
            ...quoteStatusDict.items.map((item) => item.value),
            ...(status && status !== QUOTE_STATUS_UNSET ? [status] : []),
            ...items.map((quote) => quote.quoteStatus),
          ].filter(Boolean),
        ),
      ] as string[],
    [items, quoteStatusDict.items, status],
  );
  const statusLabels = useMemo(
    () => new Map(quoteStatusDict.items.map((item) => [item.value, dictItemLabel(item, i18n.language)])),
    [i18n.language, quoteStatusDict.items],
  );
  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const toggleCreatedSort = () => {
    setPage(1);
    setOrderNumberSort(null);
    setCreatedSort((current) =>
      current === "ascending" ? "descending" : "ascending",
    );
  };

  const toggleOrderNumberSort = () => {
    setPage(1);
    setCreatedSort(null);
    setOrderNumberSort((current) =>
      current === "ascending" ? "descending" : "ascending",
    );
  };

  const formatAmount = (quote: QuoteListItem) => {
    if (quote.grandTotal === null) return t("common.notSet");
    if (quote.currency === "HKD") return currencyFormatter.format(quote.grandTotal);
    return `${quote.currency} ${quote.grandTotal.toLocaleString(i18n.language)}`;
  };

  const saveQuoteDescription = async (quote: QuoteListItem) => {
    if (!canManage) return;
    const draft = descriptionDrafts[quote.id];
    if (draft === undefined || draft === (quote.quoteDescription ?? "")) return;

    const description = draft.trim();
    setSavingDescriptionId(quote.id);
    setDescriptionErrorId(null);
    try {
      await saveDescription(quote.id, description);
      setItems((current) =>
        current.map((item) =>
          item.id === quote.id
            ? { ...item, quoteDescription: description || null }
            : item,
        ),
      );
      setDescriptionDrafts((current) => {
        const next = { ...current };
        delete next[quote.id];
        return next;
      });
    } catch {
      setDescriptionErrorId(quote.id);
    } finally {
      setSavingDescriptionId(null);
    }
  };
  const titleKey =
    effectivePreset === "high-chance"
      ? "highChanceTitle"
      : effectivePreset === "large"
        ? "largeTitle"
        : effectivePreset === "recent-open"
          ? "recentOpenTitle"
          : effectivePreset === "upcoming"
            ? "upcomingTitle"
            : "title";
  const chinese = i18n.language.toLowerCase().startsWith("zh");
  const title = effectivePreset === "all"
    ? (chinese ? "所有報價" : "All Quotes")
    : effectivePreset === "pending"
      ? (chinese ? "未結束報價" : "Open Quotes")
    : effectivePreset === "large"
      ? (chinese ? "大單 100K 投標" : "Large 100K Bids")
      : t(`quotes.${titleKey}`);
  const toggleQueue = (nextPreset: (typeof QUOTE_QUEUE_TABS)[number]) => {
    setPage(1);
    setItems([]);
    setLoading(true);
    const next = new URLSearchParams(searchParams);
    if (selectedQueue === nextPreset) next.delete("tab");
    else next.set("tab", nextPreset);
    setSearchParams(next, { replace: true });
  };

  return (
    <section className="quotes-page">
      <header className="page-heading quotes-heading">
        <div>
          <span className="eyebrow">{t("quotes.eyebrow")}</span>
          <h1>{title}</h1>
        </div>
      </header>

      <article className="panel quotes-panel responsive-card-list-panel">
        {preset === "all" ? (
          <div className="orders-queue-tabs quotes-queue-tabs" role="group" aria-label={t("quotes.eyebrow")}>
            <button
              type="button"
              className={cn("orders-queue-tab", selectedQueue === "large" && "is-active")}
              aria-pressed={selectedQueue === "large"}
              onClick={() => toggleQueue("large")}
            >
              {chinese ? "大單 100K 投標" : "Large 100K Bids"}
            </button>
            <button
              type="button"
              className={cn("orders-queue-tab", selectedQueue === "recent-open" && "is-active")}
              aria-pressed={selectedQueue === "recent-open"}
              onClick={() => toggleQueue("recent-open")}
            >
              {t("navigation.recentOpenQuotes")}
            </button>
          </div>
        ) : null}
        <header className="quotes-toolbar">
          <ListSearchBar
            id="quotes-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("quotes.search")}
            placeholder={t("quotes.searchPlaceholder")}
            submitLabel={t("quotes.searchAction")}
            actions={canManage ? <Button asChild><Link to="/quotes/new"><Plus />{t("quotes.create")}</Link></Button> : null}
            filtersAlwaysInDrawer
            filtersTitle={t("common.filters")}
            filtersActive={Boolean(status || brandId)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <div className="quotes-filter-group">
                <label className="quotes-status-filter">
                  <span>{t("quotes.statusFilter")}</span>
                  <select
                    value={statusFilter.value}
                    onChange={(event) => {
                      statusFilter.setValue(event.target.value);
                    }}
                  >
                    <option value="">{t("quotes.allStatuses")}</option>
                    {availableStatuses.map((option) => (
                      <option key={option} value={option}>
                        {statusLabels.get(option) ?? option}
                      </option>
                    ))}
                    <option value={QUOTE_STATUS_UNSET}>
                      {t("quotes.unsetStatus")}
                    </option>
                  </select>
                </label>
                <label className="quotes-status-filter">
                  <span>{t("quotes.brandFilter")}</span>
                  <FilterableSelect
                    value={brandId}
                    onChange={(event) => {
                      setPage(1);
                      setBrandId(event.target.value);
                    }}
                  >
                    <option value="">{t("quotes.allBrands")}</option>
                    {brands.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </FilterableSelect>
                </label>
              </div>
            }
          />
        </header>

        {error ? (
          <div className="quotes-state quotes-state-error" role="alert">
            <FileText />
            <div>
              <strong>
                {error === "42P01"
                  ? t("quotes.migrationPending")
                  : t("quotes.loadError")}
              </strong>
              <span>{t("quotes.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />
              {t("quotes.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="quotes-state quotes-state-empty">
            <FileText />
            <div>
              <strong>{t("quotes.empty")}</strong>
              <span>{t("quotes.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="quotes-table-wrap"
            onRefresh={() => {
              if (isMobileList && page !== 1) setPage(1);
              else setReloadKey((key) => key + 1);
            }}
            loading={loading}
            loadingLabel={t("quotes.loading")}
            skeletonRows={QUOTES_PAGE_SIZE}
            skeletonColumns={QUOTE_SKELETON_COLUMNS}
            mobileHasMore={items.length < total}
            mobileLoadingMore={loadingMore}
            mobileLoadError={loadMoreError}
            onMobileLoadMore={() => {
              if (loadingMore) return;
              if (loadMoreError) setReloadKey((key) => key + 1);
              else setPage((current) => current + 1);
            }}
            mobileLoadingMoreLabel={t("quotes.loading")}
            mobileRetryLabel={t("quotes.retry")}
            mobileEndLabel={t("quotes.pagination", {
              from: total ? 1 : 0,
              to: Math.min(items.length, total),
              total,
            })}
            mobileContent={isMobileList ? (
              <div className="mobile-card-list quote-mobile-list" role="list" aria-label={title}>
                {items.map((quote) => (
                  <article className="mobile-list-card order-mobile-card quote-mobile-card" role="listitem" key={quote.id}>
                    <header>
                      <div className="order-mobile-title">
                        <DetailLink to={`/quotes/${quote.id}`} target="_blank" rel="noopener noreferrer">
                          {quote.orderNumber || t("common.notSet")}
                        </DetailLink>
                        <span>{quote.brandName || t("common.notSet")} · {dateTimeFormatter.format(new Date(quote.createdAt))}</span>
                      </div>
                      <span className="status-badge amber">
                        {quote.quoteStatus || t("quotes.draft")}
                      </span>
                    </header>

                    <div className="order-mobile-customer">
                      <strong>{quote.customerName || quote.companyName || t("common.notSet")}</strong>
                      {quote.customerName && quote.companyName ? <span>{quote.companyName}</span> : null}
                      {quote.contactPhone ? <a href={`tel:${quote.contactPhone}`}>{quote.contactPhone}</a> : null}
                      {quote.shippingMethodName || quote.districtName ? (
                        <span>{[quote.shippingMethodName ? `(${quote.shippingMethodName})` : "", quote.districtName || ""].filter(Boolean).join(" ")}</span>
                      ) : null}
                      {quote.address ? <span>{quote.address}</span> : null}
                    </div>

                    <dl className="order-mobile-facts">
                      <div>
                        <dt>{t("quotes.customerDetails.deliveryDate")} / {t("quotes.customerDetails.deliveryTime")}</dt>
                        <dd>{hongKongDateKey(quote.deliveryAt) || t("common.notSet")} · {quote.deliveryTime || t("common.notSet")}</dd>
                      </div>
                      <div>
                        <dt>{t("quotes.customerDetails.quantity")}</dt>
                        <dd>{(quote.quantity ?? 0).toLocaleString(i18n.language)}</dd>
                      </div>
                      <div>
                        <dt>{t("quotes.columns.amount")}</dt>
                        <dd>{formatAmount(quote)}</dd>
                      </div>
                      <div>
                        <dt>{t("quotes.columns.generatedOrder")}</dt>
                        <dd>{quote.generatedOrderId ? (
                          <DetailLink to={`/orders/${quote.generatedOrderId}`}>
                            {quote.generatedOrderNumber || t("quotes.actions.openOrder")}
                          </DetailLink>
                        ) : "—"}</dd>
                      </div>
                    </dl>

                    <label className="quote-mobile-description">
                      <span>{t("quotes.columns.description")}</span>
                      <textarea
                        rows={2}
                        readOnly={!canManage}
                        value={descriptionDrafts[quote.id] ?? quote.quoteDescription ?? ""}
                        placeholder={t("quotes.descriptionPlaceholder")}
                        aria-label={t("quotes.editDescription", { number: quote.orderNumber || quote.id })}
                        aria-invalid={descriptionErrorId === quote.id || undefined}
                        disabled={savingDescriptionId === quote.id}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDescriptionDrafts((current) => ({ ...current, [quote.id]: value }));
                        }}
                        onBlur={() => void saveQuoteDescription(quote)}
                      />
                      {descriptionErrorId === quote.id ? <small role="alert">{t("quotes.descriptionSaveError")}</small> : null}
                    </label>

                    <footer>
                      <div className="order-row-actions quote-row-actions">
                        {canManage ? <Link to={`/quotes/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer" aria-label={t("quotes.actions.pdf")} title={t("quotes.actions.pdf")}><FileText /></Link> : null}
                        {canManage ? <Link to={`/quotes/${quote.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("quotes.actions.view")} title={t("quotes.actions.view")}><Eye /></Link> : null}
                        <button type="button" aria-label={t("quotes.actions.file")} title={t("quotes.actions.file")} onClick={() => setFilesQuote(quote)}><Paperclip /></button>
                        {canManage ? <Link to={`/quotes/new?copyFrom=${encodeURIComponent(quote.id)}`} aria-label={t("quotes.actions.copy")} title={t("quotes.actions.copy")}><Copy /></Link> : null}
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            ) : undefined}
            header={
              <tr>
                <th>{t("quotes.columns.brand")}</th>
                <th aria-sort={createdSort ?? undefined}>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={toggleCreatedSort}
                  >
                    {t("quotes.columns.created")}
                    {createdSort === "ascending" ? (
                      <ArrowUp />
                    ) : createdSort === "descending" ? (
                      <ArrowDown />
                    ) : (
                      <ArrowUpDown />
                    )}
                  </button>
                </th>
                <th aria-sort={orderNumberSort ?? undefined}>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={toggleOrderNumberSort}
                  >
                    {t("quotes.columns.number")}
                    {orderNumberSort === "ascending" ? (
                      <ArrowUp />
                    ) : orderNumberSort === "descending" ? (
                      <ArrowDown />
                    ) : (
                      <ArrowUpDown />
                    )}
                  </button>
                </th>
                <th>
                  {t("quotes.columns.customer")} / {t("orders.columns.region")} / {t("orders.columns.address")}
                </th>
                <th>
                  {t("quotes.customerDetails.deliveryDate")} /{" "}
                  {t("quotes.customerDetails.deliveryTime")}
                </th>
                <th>{t("quotes.customerDetails.quantity")}</th>
                <th>{t("quotes.columns.description")}</th>
                <th>{t("quotes.columns.amount")}</th>
                <th>{t("quotes.columns.status")}</th>
                <th>{t("quotes.columns.actions")}</th>
              </tr>
            }
          >
            {items.map((quote) => (
              <tr key={quote.id}>
                <td>{quote.brandName || t("common.notSet")}</td>
                <td>{dateTimeFormatter.format(new Date(quote.createdAt))}</td>
                <td>
                  <DetailLink className="order-link" to={`/quotes/${quote.id}`} target="_blank" rel="noopener noreferrer">
                    {quote.orderNumber || t("common.notSet")}
                  </DetailLink>
                </td>
                <td className="order-customer-summary quote-customer-location-summary">
                  <strong>
                    {quote.customerName ||
                      quote.companyName ||
                      ""}
                  </strong>
                  {quote.customerName && quote.companyName && (
                    <small className="quote-company">{quote.companyName}</small>
                  )}
                  {quote.sourceSystem === "emailmeform" && (
                    <span className="status-badge green quote-source-badge">
                      {t("quotes.emailMeFormSource")}
                    </span>
                  )}
                  {quote.sourceSystem === "whatsapp" && (
                    <span className="status-badge blue quote-source-badge">
                      {t("quotes.whatsappSource")}
                    </span>
                  )}
                  <div>{quote.contactPhone || ""}</div>
                  {quote.asanaLink && (
                    <a href={quote.asanaLink} target="_blank" rel="noopener noreferrer">Asana Link</a>
                  )}
                  {quote.shippingMethodName || quote.districtName || quote.address ? (
                    <div className="quote-customer-location">
                      <div>
                      {[
                        quote.shippingMethodName
                          ? `(${quote.shippingMethodName})`
                          : "",
                        quote.districtName || "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      </div>
                      {quote.address ? (
                        <div className="quote-address-line" title={quote.address}>
                          {quote.address}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td>
                  <div>{hongKongDateKey(quote.deliveryAt)}</div>
                  <div>{quote.deliveryTime || ""}</div>
                </td>
                <td>{(quote.quantity ?? 0).toLocaleString(i18n.language)}</td>
                <td className="quote-description-cell">
                  <textarea
                    rows={2}
                    readOnly={!canManage}
                    value={
                      descriptionDrafts[quote.id] ?? quote.quoteDescription ?? ""
                    }
                    placeholder={t("quotes.descriptionPlaceholder")}
                    aria-label={t("quotes.editDescription", {
                      number: quote.orderNumber || quote.id,
                    })}
                    aria-invalid={descriptionErrorId === quote.id || undefined}
                    disabled={savingDescriptionId === quote.id}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDescriptionDrafts((current) => ({
                        ...current,
                        [quote.id]: value,
                      }));
                    }}
                    onBlur={() => void saveQuoteDescription(quote)}
                  />
                  {descriptionErrorId === quote.id && (
                    <small role="alert">{t("quotes.descriptionSaveError")}</small>
                  )}
                </td>
                <td>
                  <strong>{formatAmount(quote)}</strong>
                </td>
                <td>
                  <span className="status-badge amber">
                    {quote.quoteStatus || t("quotes.draft")}
                  </span>
                </td>
                <td className="table-actions-cell">
                  <div className="order-row-actions quote-row-actions">
                    {canManage ? <Link
                      to={`/quotes/${quote.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("quotes.actions.pdf")}
                      title={t("quotes.actions.pdf")}
                    ><FileText /></Link> : null}
                    {canManage ? <Link to={`/quotes/${quote.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("quotes.actions.view")} title={t("quotes.actions.view")}><Eye /></Link> : null}
                    <button
                      type="button"
                      aria-label={t("quotes.actions.file")}
                      title={t("quotes.actions.file")}
                      onClick={() => setFilesQuote(quote)}
                    ><Paperclip /></button>
                    {canManage ? <Link to={`/quotes/new?copyFrom=${encodeURIComponent(quote.id)}`} aria-label={t("quotes.actions.copy")} title={t("quotes.actions.copy")}><Copy /></Link> : null}
                  </div>
                </td>
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("quotes.pagination", {
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
          previousLabel={t("quotes.previous")}
          nextLabel={t("quotes.next")}
          pageLabel={t("quotes.pageOf")}
          jumpLabel={t("quotes.jumpToPage")}
        />
      </article>
      <QuoteFilesSidePanel
        quote={filesQuote}
        canUpload={canManage}
        onClose={() => setFilesQuote(null)}
      />
    </section>
  );
}
