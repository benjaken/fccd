import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchQuotes,
  QUOTES_PAGE_SIZE,
  type QuoteListFilters,
  type QuoteListItem,
  type QuoteListResult,
  type QuotePreset,
} from "@/lib/quotes";

type QuotesLoader = (filters: QuoteListFilters) => Promise<QuoteListResult>;

export function QuotesListPage({
  preset = "all",
  loadQuotes = fetchQuotes,
}: {
  preset?: QuotePreset;
  loadQuotes?: QuotesLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<QuoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
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
      const result = await loadQuotes({ page, search, status, preset });
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
  }, [loadQuotes, page, preset, reloadKey, search, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const availableStatuses = useMemo(
    () =>
      [
        ...new Set(
          [status, ...items.map((quote) => quote.quoteStatus)].filter(Boolean),
        ),
      ].sort((left, right) => String(left).localeCompare(String(right))) as string[],
    [items, status],
  );

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const formatAmount = (quote: QuoteListItem) => {
    if (quote.grandTotal === null) return t("common.notSet");
    if (quote.currency === "HKD") return currencyFormatter.format(quote.grandTotal);
    return `${quote.currency} ${quote.grandTotal.toLocaleString(i18n.language)}`;
  };
  const titleKey =
    preset === "high-chance"
      ? "highChanceTitle"
      : preset === "large"
        ? "largeTitle"
        : preset === "follow-up"
          ? "followUpTitle"
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
          />

          <label className="quotes-status-filter">
            <span>{t("quotes.statusFilter")}</span>
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">{t("quotes.allStatuses")}</option>
              {availableStatuses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </header>

        {loading ? (
          <div className="quotes-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("quotes.loading")}</span>
          </div>
        ) : error ? (
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
        ) : items.length === 0 ? (
          <div className="quotes-state quotes-state-empty">
            <FileText />
            <div>
              <strong>{t("quotes.empty")}</strong>
              <span>{t("quotes.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="table-wrap quotes-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("quotes.columns.number")}</th>
                  <th>{t("quotes.columns.customer")}</th>
                  <th>{t("quotes.columns.delivery")}</th>
                  <th>{t("quotes.columns.status")}</th>
                  <th>{t("quotes.columns.amount")}</th>
                  <th>{t("quotes.columns.updated")}</th>
                  <th aria-label={t("quotes.columns.actions")} />
                </tr>
              </thead>
              <tbody>
                {items.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <Link className="order-link" to={`/quotes/${quote.id}`}>
                        {quote.orderNumber || t("common.notSet")}
                      </Link>
                    </td>
                    <td>
                      <strong>
                        {quote.customerName ||
                          quote.companyName ||
                          t("common.notSet")}
                      </strong>
                      {quote.customerName && quote.companyName && (
                        <small className="quote-company">{quote.companyName}</small>
                      )}
                    </td>
                    <td>
                      <span className="quote-date">
                        <CalendarDays />
                        {quote.deliveryAt
                          ? dateFormatter.format(new Date(quote.deliveryAt))
                          : t("common.notSet")}
                      </span>
                    </td>
                    <td>
                      <span className="status-badge amber">
                        {quote.quoteStatus || t("quotes.draft")}
                      </span>
                    </td>
                    <td>
                      <strong>{formatAmount(quote)}</strong>
                    </td>
                    <td>{dateTimeFormatter.format(new Date(quote.updatedAt))}</td>
                    <td>
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          to={`/quotes/${quote.id}`}
                          aria-label={`${t("quotes.open")} ${
                            quote.orderNumber || quote.id
                          }`}
                        >
                          <ChevronRight />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </section>
  );
}
