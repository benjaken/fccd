import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, MessageSquare, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  documentPath,
  fetchQuoteCustomerHistory,
  fetchQuoteCustomers,
  formatLabeledValue,
  QUOTE_CUSTOMERS_PAGE_SIZE,
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
  { width: "2.5rem" },
  { width: "14rem" },
  { width: "10rem" },
  { width: "28%" },
  { width: "4.5rem" },
  { width: "7rem" },
  { width: "9rem", variant: "action" as const },
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
  const selectedCustomer =
    items.find((item) => item.email === selectedEmail) ?? null;

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
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
    <section className="quotes-page quote-customers-page">
      <header className="page-heading quotes-heading">
        <div>
          <span className="eyebrow">{t("quoteCustomers.eyebrow")}</span>
          <h1>{t("quoteCustomers.title")}</h1>
        </div>
      </header>

      <article className="panel quotes-panel">
        <header className="quotes-toolbar quote-customers-toolbar">
          <div className="quote-customers-result-count">
            <strong>
              {t("quoteCustomers.resultCount", { total })}
            </strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={refresh}
              aria-label={t("quoteCustomers.refresh")}
              title={t("quoteCustomers.refresh")}
            >
              <RefreshCw />
            </Button>
          </div>
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
          <OperationalListState
            icon={Users}
            title={
              error === "42P01" || error === "42883"
                ? t("quoteCustomers.migrationPending")
                : t("quoteCustomers.loadError")
            }
            description={t("quoteCustomers.loadErrorDescription")}
            retryLabel={t("quoteCustomers.retry")}
            onRetry={refresh}
          />
        ) : !loading && items.length === 0 ? (
          <OperationalListState
            icon={Users}
            title={t("quoteCustomers.empty")}
            description={t("quoteCustomers.emptyDescription")}
          />
        ) : (
          <ListTable
            className="quotes-table-wrap quote-customers-table-wrap"
            tableClassName="quote-customers-table"
            onRefresh={refresh}
            loading={loading}
            loadingLabel={t("quoteCustomers.loading")}
            skeletonRows={QUOTE_CUSTOMERS_PAGE_SIZE}
            skeletonColumns={CUSTOMER_SKELETON_COLUMNS}
            header={
              <tr>
                <th className="quote-customers-index-cell" aria-label="#" />
                <th>{t("quoteCustomers.columns.email")}</th>
                <th>{t("quoteCustomers.columns.customerOrder")}</th>
                <th className="quote-customers-company-cell">
                  {t("quoteCustomers.columns.companyTag")}
                </th>
                <th className="quote-customers-numeric-cell">
                  {t("quoteCustomers.columns.orderCount")}
                </th>
                <th className="quote-customers-numeric-cell">
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
                <th
                  className="table-actions-cell"
                  aria-label={t("quoteCustomers.columns.actions")}
                />
              </tr>
            }
          >
            {items.map((customer, index) => (
              <tr
                key={customer.email}
                className={cn(
                  "quote-customers-row",
                  selectedEmail === customer.email && "is-selected",
                  customer.hasRemarks && "has-remarks",
                )}
              >
                <td className="quote-customers-index-cell">
                  {visibleFrom + index}
                </td>
                <td>
                  <strong>{customer.email}</strong>
                </td>
                <td>
                  {customer.latestOrderId ? (
                    <Link
                      className="order-link"
                      to={documentPath(
                        customer.latestDocumentType,
                        customer.latestOrderId,
                      )}
                    >
                      {formatLabeledValue(
                        customer.customerName,
                        customer.latestOrderNumber,
                      )}
                    </Link>
                  ) : (
                    formatLabeledValue(
                      customer.customerName,
                      customer.latestOrderNumber,
                    )
                  )}
                </td>
                <td className="quote-customers-company-cell">
                  {customer.companies.length === 0 ? (
                    t("common.notSet")
                  ) : (
                    <ul className="quote-customer-companies">
                      {customer.companies.map((company, companyIndex) => (
                        <li
                          key={`${company.orderId ?? company.tag ?? company.companyName}-${companyIndex}`}
                        >
                          {company.orderId ? (
                            <Link
                              className="order-link"
                              to={documentPath(
                                company.documentType,
                                company.orderId,
                              )}
                            >
                              {formatLabeledValue(company.companyName, company.tag)}
                            </Link>
                          ) : (
                            formatLabeledValue(company.companyName, company.tag)
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="quote-customers-numeric-cell">
                  {customer.orderCount.toLocaleString(i18n.language)}
                </td>
                <td className="quote-customers-numeric-cell">
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
                      className="quote-customers-history-action"
                      onClick={() => setSelectedEmail(customer.email)}
                    >
                      <MessageSquare />
                      {t("quoteCustomers.historyAction")}
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
        wide
        title={t("quoteCustomers.historyTitle")}
        description={selectedEmail ?? selectedCustomer?.email}
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
                <ul>
                  {history.orders.map((order) => (
                    <li key={order.id}>
                      <Link
                        className="order-link"
                        to={documentPath(order.documentType, order.id)}
                      >
                        {formatLabeledValue(
                          order.companyName || order.customerName,
                          order.orderNumber,
                        )}
                      </Link>
                      <span>
                        {dateTimeFormatter.format(new Date(order.createdAt))}
                      </span>
                      <strong>
                        {formatMoney(
                          order.grandTotal,
                          order.currency,
                          currencyFormatter,
                          t("common.notSet"),
                        )}
                      </strong>
                    </li>
                  ))}
                </ul>
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
