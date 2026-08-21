import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { QuoteFilesSidePanel } from "@/components/QuoteFilesSidePanel";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  fetchQuoteBrands,
  fetchQuotes,
  QUOTES_PAGE_SIZE,
  QUOTE_STATUS_OPTIONS,
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

const QUOTE_SKELETON_COLUMNS = [
  { width: "6rem", variant: "badge" as const },
  { width: "7rem" },
  { width: "7rem" },
  { width: "10rem" },
  { width: "12rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "6rem", variant: "badge" as const },
  { width: "1.75rem", variant: "action" as const },
];

export function QuotesListPage({
  preset = "all",
  loadQuotes = fetchQuotes,
  loadBrands = fetchQuoteBrands,
  saveDescription = updateQuoteDescription,
}: {
  preset?: QuotePreset;
  loadQuotes?: QuotesLoader;
  loadBrands?: QuoteBrandsLoader;
  saveDescription?: QuoteDescriptionUpdater;
}) {
  const { t, i18n } = useTranslation();
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
    setLoading(true);
    setError(null);

    try {
      const result = await loadQuotes({
        page,
        search,
        status,
        preset,
        ...(brandId ? { brandId } : {}),
        ...(createdSort ? { createdSort } : {}),
        ...(orderNumberSort ? { orderNumberSort } : {}),
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
          : "quotes_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [brandId, createdSort, loadQuotes, orderNumberSort, page, preset, reloadKey, search, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

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
            ...QUOTE_STATUS_OPTIONS,
            ...(status && status !== QUOTE_STATUS_UNSET ? [status] : []),
            ...items.map((quote) => quote.quoteStatus),
          ].filter(Boolean),
        ),
      ] as string[],
    [items, status],
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
    preset === "high-chance"
      ? "highChanceTitle"
      : preset === "large"
        ? "largeTitle"
        : preset === "follow-up"
          ? "followUpTitle"
          : preset === "pending"
            ? "pendingTitle"
            : preset === "upcoming"
              ? "upcomingTitle"
              : "title";

  return (
    <section className="quotes-page">
      <header className="page-heading quotes-heading">
        <div>
          <span className="eyebrow">{t("quotes.eyebrow")}</span>
          <h1>{t(`quotes.${titleKey}`)}</h1>
        </div>
        <Button asChild>
          <Link to="/quotes/new">
            <Plus />
            {t("quotes.create")}
          </Link>
        </Button>
      </header>

      <article className="panel quotes-panel">
        <header className="quotes-toolbar">
          <ListSearchBar
            id="quotes-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("quotes.search")}
            placeholder={t("quotes.searchPlaceholder")}
            submitLabel={t("quotes.searchAction")}
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
                        {option}
                      </option>
                    ))}
                    <option value={QUOTE_STATUS_UNSET}>
                      {t("quotes.unsetStatus")}
                    </option>
                  </select>
                </label>
                <label className="quotes-status-filter">
                  <span>{t("quotes.brandFilter")}</span>
                  <select
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
                  </select>
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
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("quotes.loading")}
            skeletonRows={QUOTES_PAGE_SIZE}
            skeletonColumns={QUOTE_SKELETON_COLUMNS}
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
                <th>{t("quotes.columns.customer")}</th>
                <th>{t("quotes.columns.description")}</th>
                <th>{t("quotes.columns.amount")}</th>
                <th>{t("quotes.columns.generatedOrder")}</th>
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
                  <DetailLink className="order-link" to={`/quotes/${quote.id}`}>
                    {quote.orderNumber || t("common.notSet")}
                  </DetailLink>
                </td>
                <td className="order-customer-summary">
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
                  <div>{quote.contactPhone || ""}</div>
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
                  <div>{t("quotes.customerDetails.deliveryDate")}: {quote.deliveryAt?.slice(0, 10) || ""}</div>
                  <div>{t("quotes.customerDetails.deliveryTime")}: {quote.deliveryTime || ""}</div>
                  <div>{t("quotes.customerDetails.shipOutTime")}: {quote.shipOutTime || ""}</div>
                  <div>{t("quotes.customerDetails.quantity")}: {(quote.quantity ?? 0).toLocaleString(i18n.language)}</div>
                  {quote.asanaLink && (
                    <a href={quote.asanaLink} target="_blank" rel="noopener noreferrer">Asana Link</a>
                  )}
                </td>
                <td className="quote-description-cell">
                  <textarea
                    rows={3}
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
                <td className="quote-generated-order-cell">
                  {quote.generatedOrderId ? (
                    <DetailLink className="order-link" to={`/orders/${quote.generatedOrderId}`}>
                      {quote.generatedOrderNumber || t("quotes.actions.openOrder")}
                    </DetailLink>
                  ) : "—"}
                </td>
                <td>
                  <span className="status-badge amber">
                    {quote.quoteStatus || t("quotes.draft")}
                  </span>
                </td>
                <td>
                  <div className="order-row-actions quote-row-actions">
                    <Link
                      to={`/quotes/${quote.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("quotes.actions.pdf")}
                      title={t("quotes.actions.pdf")}
                    ><FileText /></Link>
                    <Link to={`/quotes/${quote.id}/edit`} aria-label={t("quotes.actions.edit")} title={t("quotes.actions.edit")}><Pencil /></Link>
                    <button
                      type="button"
                      aria-label={t("quotes.actions.file")}
                      title={t("quotes.actions.file")}
                      onClick={() => setFilesQuote(quote)}
                    ><Paperclip /></button>
                    <Link to={`/quotes/new?copyFrom=${encodeURIComponent(quote.id)}`} aria-label={t("quotes.actions.copy")} title={t("quotes.actions.copy")}><Copy /></Link>
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
        onClose={() => setFilesQuote(null)}
      />
    </section>
  );
}
