import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, MessageSquare, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  documentPath,
  fetchQuoteCustomerHistory,
  fetchQuoteCustomers,
  QUOTE_CUSTOMERS_PAGE_SIZE,
  sortOrdersByCompany,
  summarizeCompanies,
  type QuoteCustomerCompany,
  type QuoteCustomerHistory,
  type QuoteCustomerListFilters,
  type QuoteCustomerListItem,
  type QuoteCustomerListResult,
} from "@/lib/quote-customers";
import { cn } from "@/lib/utils";

type CustomersLoader = (
  filters: QuoteCustomerListFilters,
) => Promise<QuoteCustomerListResult>;
type HistoryLoader = (email: string) => Promise<QuoteCustomerHistory>;

const CUSTOMER_SKELETON_COLUMNS = [
  { width: "14rem" },
  { width: "18%" },
  { width: "36%" },
  { width: "5rem" },
  { width: "7rem" },
  { width: "1.75rem", variant: "action" as const },
];

function formatMoney(
  amount: number | null,
  currency: string,
  formatter: Intl.NumberFormat,
  unset: string,
) {
  if (amount === null) return unset;
  if (currency === "HKD") return formatter.format(amount);
  return `${currency} ${amount.toLocaleString()}`;
}

function CompanyCell({
  companies,
  unset,
  companyCountLabel,
  openLabel,
  onOpen,
}: {
  companies: QuoteCustomerCompany[];
  unset: string;
  companyCountLabel: string;
  openLabel: string;
  onOpen: () => void;
}) {
  if (companies.length === 0) return unset;

  const first = companies[0];
  const summary = summarizeCompanies(companies, unset);

  if (companies.length === 1) {
    return (
      <>
        <strong>{first.companyName || unset}</strong>
        {first.orderId ? (
          <small className="quote-company">
            <Link
              className="order-link"
              to={documentPath(first.documentType, first.orderId)}
            >
              {first.tag || unset}
            </Link>
          </small>
        ) : first.tag ? (
          <small className="quote-company">{first.tag}</small>
        ) : null}
      </>
    );
  }

  return (
    <button
      type="button"
      className="quote-customers-company-summary"
      onClick={onOpen}
      aria-label={openLabel}
    >
      <strong>{summary.primaryName}</strong>
      <small className="quote-company">{companyCountLabel}</small>
    </button>
  );
}

export function QuoteCustomersPage({
  loadCustomers = fetchQuoteCustomers,
  loadHistory = fetchQuoteCustomerHistory,
}: {
  loadCustomers?: CustomersLoader;
  loadHistory?: HistoryLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortAscending, setSortAscending] = useState(false);
  const [items, setItems] = useState<QuoteCustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<QuoteCustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / QUOTE_CUSTOMERS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * QUOTE_CUSTOMERS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * QUOTE_CUSTOMERS_PAGE_SIZE, total);

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
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadCustomers({
        page,
        search,
        sort: "order_total",
        ascending: sortAscending,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError: unknown) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "quote_customers_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [loadCustomers, page, reloadKey, search, sortAscending]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!selectedEmail) {
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }

    let active = true;
    setHistory(null);
    setHistoryError(null);
    setHistoryLoading(true);
    void loadHistory(selectedEmail)
      .then((result) => {
        if (!active) return;
        setHistory(result);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const code =
          typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
            ? loadError.code
            : "quote_customers_history_failed";
        setHistoryError(code);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadHistory, selectedEmail]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const refresh = () => setReloadKey((key) => key + 1);

  const toggleSort = () => {
    setPage(1);
    setSortAscending((current) => !current);
  };

  return (
    <section className="quotes-page">
      <header className="page-heading quotes-heading">
        <div>
          <span className="eyebrow">{t("quoteCustomers.eyebrow")}</span>
          <h1>{t("quoteCustomers.title")}</h1>
        </div>
      </header>

      <article className="panel quotes-panel">
        <header className="quotes-toolbar">
          <ListSearchBar
            id="quote-customers-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("quoteCustomers.search")}
            placeholder={t("quoteCustomers.searchPlaceholder")}
            submitLabel={t("quoteCustomers.searchAction")}
          />
        </header>

        {error ? (
          <div className="quotes-state quotes-state-error" role="alert">
            <Users />
            <div>
              <strong>
                {error === "42P01" || error === "42883"
                  ? t("quoteCustomers.migrationPending")
                  : t("quoteCustomers.loadError")}
              </strong>
              <span>{t("quoteCustomers.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw />
              {t("quoteCustomers.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="quotes-state quotes-state-empty">
            <Users />
            <div>
              <strong>{t("quoteCustomers.empty")}</strong>
              <span>{t("quoteCustomers.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="quotes-table-wrap"
            onRefresh={refresh}
            loading={loading}
            loadingLabel={t("quoteCustomers.loading")}
            skeletonRows={QUOTE_CUSTOMERS_PAGE_SIZE}
            skeletonColumns={CUSTOMER_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("quoteCustomers.columns.email")}</th>
                <th>{t("quoteCustomers.columns.customer")}</th>
                <th>{t("quoteCustomers.columns.company")}</th>
                <th>{t("quoteCustomers.columns.orderCount")}</th>
                <th>
                  <button
                    type="button"
                    className="quote-customers-sort"
                    onClick={toggleSort}
                    aria-label={t("quoteCustomers.sortByTotal")}
                  >
                    {t("quoteCustomers.columns.orderTotal")}
                    {sortAscending ? <ArrowUp /> : <ArrowDown />}
                  </button>
                </th>
                <th aria-label={t("quoteCustomers.columns.actions")} />
              </tr>
            }
          >
            {items.map((customer) => (
              <tr
                key={customer.email}
                className={cn(
                  selectedEmail === customer.email && "quote-customers-row-selected",
                )}
              >
                <td>
                  <strong>{customer.email}</strong>
                </td>
                <td>
                  <strong>
                    {customer.customerName || t("common.notSet")}
                  </strong>
                  {customer.latestOrderId ? (
                    <small className="quote-company">
                      <Link
                        className="order-link"
                        to={documentPath(
                          customer.latestDocumentType,
                          customer.latestOrderId,
                        )}
                      >
                        {customer.latestOrderNumber || t("common.notSet")}
                      </Link>
                    </small>
                  ) : customer.latestOrderNumber ? (
                    <small className="quote-company">
                      {customer.latestOrderNumber}
                    </small>
                  ) : null}
                </td>
                <td className="quote-customers-company-cell">
                  <CompanyCell
                    companies={customer.companies}
                    unset={t("common.notSet")}
                    companyCountLabel={t("quoteCustomers.companyCount", {
                      total: customer.companies.length,
                    })}
                    openLabel={`${t("quoteCustomers.openCompanies")} ${customer.email}`}
                    onOpen={() => setSelectedEmail(customer.email)}
                  />
                </td>
                <td>{customer.orderCount.toLocaleString(i18n.language)}</td>
                <td>
                  <strong>
                    {formatMoney(
                      customer.orderTotal,
                      customer.currency,
                      currencyFormatter,
                      t("common.notSet"),
                    )}
                  </strong>
                </td>
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedEmail(customer.email)}
                      aria-label={`${t("quoteCustomers.historyAction")} ${customer.email}`}
                      title={t("quoteCustomers.historyAction")}
                    >
                      <MessageSquare />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("quoteCustomers.pagination", {
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
          previousLabel={t("quoteCustomers.previous")}
          nextLabel={t("quoteCustomers.next")}
          pageLabel={t("quoteCustomers.pageOf")}
          jumpLabel={t("quoteCustomers.jumpToPage")}
        />
      </article>

      <SidePanel
        open={Boolean(selectedEmail)}
        extraWide
        title={t("quoteCustomers.historyTitle")}
        description={selectedEmail ?? undefined}
        onClose={() => setSelectedEmail(null)}
        closeLabel={t("quoteCustomers.closePanel")}
      >
        {historyLoading ? (
          <p className="quote-customers-history-status">
            {t("quoteCustomers.historyLoading")}
          </p>
        ) : historyError ? (
          <p className="quote-customers-history-error" role="alert">
            {t("quoteCustomers.historyError")}
          </p>
        ) : (
          <div className="quote-customers-history">
            <section>
              <h3>{t("quoteCustomers.pastOrders")}</h3>
              {!history?.orders.length ? (
                <p>{t("quoteCustomers.pastOrdersEmpty")}</p>
              ) : (
                <div className="quote-customers-history-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("quoteCustomers.columns.company")}</th>
                        <th>{t("quoteCustomers.columns.orderNumber")}</th>
                        <th>{t("quoteCustomers.columns.date")}</th>
                        <th>{t("quoteCustomers.columns.amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortOrdersByCompany(history.orders).map((order) => (
                        <tr key={order.id}>
                          <td>
                            <strong>
                              {order.companyName || t("common.notSet")}
                            </strong>
                          </td>
                          <td>
                            <Link
                              className="order-link"
                              to={documentPath(order.documentType, order.id)}
                            >
                              {order.orderNumber || t("common.notSet")}
                            </Link>
                          </td>
                          <td>
                            {dateTimeFormatter.format(new Date(order.createdAt))}
                          </td>
                          <td>
                            <strong>
                              {formatMoney(
                                order.grandTotal,
                                order.currency,
                                currencyFormatter,
                                t("common.notSet"),
                              )}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section>
              <h3>{t("quoteCustomers.remarks")}</h3>
              {!history?.remarks.length ? (
                <p>{t("quoteCustomers.remarksEmpty")}</p>
              ) : (
                <ul>
                  {history.remarks.map((remark) => (
                    <li key={remark.id}>
                      {remark.orderNumber ? (
                        <small>{remark.orderNumber}</small>
                      ) : null}
                      <span>{remark.body}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SidePanel>
    </section>
  );
}
