import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, MessageSquare, RefreshCw, Send, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  createQuoteCustomerNote,
  documentPath,
  emptyQuoteCustomerMessages,
  fetchQuoteCustomerHistory,
  fetchQuoteCustomerMessages,
  fetchQuoteCustomers,
  QUOTE_CUSTOMER_MESSAGE_TABS,
  QUOTE_CUSTOMER_ORDERS_PAGE_SIZE,
  QUOTE_CUSTOMERS_PAGE_SIZE,
  namedQuoteCustomerCompanies,
  summarizeCompanies,
  type CreateQuoteCustomerNoteInput,
  type QuoteCustomerCompany,
  type QuoteCustomerHistory,
  type QuoteCustomerHistoryFilters,
  type QuoteCustomerListFilters,
  type QuoteCustomerListItem,
  type QuoteCustomerListResult,
  type QuoteCustomerMessage,
  type QuoteCustomerMessages,
  type QuoteCustomerMessageTab,
} from "@/lib/quote-customers";
import { cn } from "@/lib/utils";

type CustomersLoader = (
  filters: QuoteCustomerListFilters,
) => Promise<QuoteCustomerListResult>;
type HistoryLoader = (
  filters: QuoteCustomerHistoryFilters,
) => Promise<QuoteCustomerHistory>;
type MessagesLoader = (email: string) => Promise<QuoteCustomerMessages>;
type NoteCreator = (
  input: CreateQuoteCustomerNoteInput,
) => Promise<QuoteCustomerMessage>;

type OpenPanel =
  | { kind: "companies"; email: string }
  | { kind: "messages"; email: string };

const CUSTOMER_SKELETON_COLUMNS = [
  { width: "14rem" },
  { width: "18%" },
  { width: "36%" },
  { width: "5rem" },
  { width: "7rem" },
  { width: "1.75rem", variant: "action" as const },
];

const ORDER_SKELETON_COLUMNS = [
  { width: "28%" },
  { width: "18%" },
  { width: "22%" },
  { width: "16%" },
];

function formatMoney(
  amount: number | null,
  currency: string,
  formatter: Intl.NumberFormat,
  unset: string,
  locale = "zh-HK",
) {
  if (amount === null) return unset;
  if (currency === "HKD") return formatter.format(amount);
  return `${currency} ${amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  const named = namedQuoteCustomerCompanies(companies);
  const summary = summarizeCompanies(named, unset);
  const first = named[0];

  if (!first) return unset;

  if (summary.total === 1) {
    return (
      <>
        <strong>{first.companyName}</strong>
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

function MessageBubble({
  message,
  timestamp,
  replyLabel,
  onReply,
}: {
  message: QuoteCustomerMessage;
  timestamp: string;
  replyLabel?: string;
  onReply?: (message: QuoteCustomerMessage) => void;
}) {
  return (
    <article className="quote-customers-message">
      {message.authorName ? <span>{message.authorName}</span> : null}
      <div className="quote-customers-message-bubble">
        <strong>{message.body}</strong>
        {message.orderId ? (
          <Link
            className="order-link"
            to={documentPath(message.documentType, message.orderId)}
          >
            {message.orderNumber}
          </Link>
        ) : message.orderNumber ? (
          <small>{message.orderNumber}</small>
        ) : null}
      </div>
      <div className="quote-customers-message-meta">
        <time dateTime={message.createdAt}>{timestamp}</time>
        {onReply && replyLabel ? (
          <button
            type="button"
            className="quote-customers-message-reply"
            onClick={() => onReply(message)}
          >
            {replyLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function QuoteCustomersPage({
  loadCustomers = fetchQuoteCustomers,
  loadHistory = fetchQuoteCustomerHistory,
  loadMessages = fetchQuoteCustomerMessages,
  createNote = createQuoteCustomerNote,
}: {
  loadCustomers?: CustomersLoader;
  loadHistory?: HistoryLoader;
  loadMessages?: MessagesLoader;
  createNote?: NoteCreator;
}) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortAscending, setSortAscending] = useState(false);
  const [items, setItems] = useState<QuoteCustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [panel, setPanel] = useState<OpenPanel | null>(null);
  const [history, setHistory] = useState<QuoteCustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersDraftSearch, setOrdersDraftSearch] = useState("");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);
  const [messages, setMessages] = useState<QuoteCustomerMessages | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messageTab, setMessageTab] =
    useState<QuoteCustomerMessageTab>("note");
  const [draftNote, setDraftNote] = useState("");
  const [replyTarget, setReplyTarget] = useState<QuoteCustomerMessage | null>(
    null,
  );
  const [sendingNote, setSendingNote] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messageFeedRef = useRef<HTMLDivElement>(null);

  const selectedEmail = panel?.email ?? null;
  const totalPages = Math.max(1, Math.ceil(total / QUOTE_CUSTOMERS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * QUOTE_CUSTOMERS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * QUOTE_CUSTOMERS_PAGE_SIZE, total);
  const ordersTotal = history?.total ?? 0;
  const ordersTotalPages = Math.max(
    1,
    Math.ceil(ordersTotal / QUOTE_CUSTOMER_ORDERS_PAGE_SIZE),
  );
  const ordersFrom =
    ordersTotal === 0
      ? 0
      : (ordersPage - 1) * QUOTE_CUSTOMER_ORDERS_PAGE_SIZE + 1;
  const ordersTo = Math.min(
    ordersPage * QUOTE_CUSTOMER_ORDERS_PAGE_SIZE,
    ordersTotal,
  );

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

  const messageTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Hong_Kong",
      }),
    [],
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
    if (panel?.kind !== "companies") {
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      setOrdersPage(1);
      setOrdersDraftSearch("");
      setOrdersSearch("");
      return;
    }

    let active = true;
    setHistoryError(null);
    setHistoryLoading(true);
    void loadHistory({
      email: panel.email,
      page: ordersPage,
      search: ordersSearch,
    })
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
        setHistory({ orders: [], total: 0, remarks: [] });
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadHistory, ordersPage, ordersReloadKey, ordersSearch, panel]);

  useEffect(() => {
    if (panel?.kind !== "messages") {
      setMessages(null);
      setMessagesError(null);
      setMessagesLoading(false);
      setDraftNote("");
      setSendError(null);
      setReplyTarget(null);
      return;
    }

    let active = true;
    setMessages(null);
    setMessagesError(null);
    setMessagesLoading(true);
    setMessageTab("note");
    setDraftNote("");
    setSendError(null);
    setReplyTarget(null);
    void loadMessages(panel.email)
      .then((result) => {
        if (!active) return;
        setMessages(result);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const code =
          typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
            ? loadError.code
            : "quote_customers_messages_failed";
        setMessagesError(code);
        setMessages(emptyQuoteCustomerMessages());
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadMessages, panel]);

  useEffect(() => {
    if (messageTab !== "note") return;
    const feed = messageFeedRef.current;
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  }, [messageTab, messages?.note.length]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const refresh = () => setReloadKey((key) => key + 1);

  const toggleSort = () => {
    setPage(1);
    setSortAscending((current) => !current);
  };

  const closePanel = () => setPanel(null);

  const openOrdersPanel = (email: string) => {
    setOrdersPage(1);
    setOrdersDraftSearch("");
    setOrdersSearch("");
    setPanel({ kind: "companies", email });
  };

  const submitOrdersSearch = () => {
    setOrdersPage(1);
    setOrdersSearch(ordersDraftSearch.trim());
  };

  const refreshOrders = () => setOrdersReloadKey((key) => key + 1);

  const sendNote = async () => {
    if (!panel || panel.kind !== "messages" || sendingNote) return;
    const body = draftNote.trim();
    if (!body) return;

    setSendingNote(true);
    setSendError(null);
    try {
      const message = await createNote({
        email: panel.email,
        body,
        authorName: profile?.user_name || profile?.email || null,
        orderId: replyTarget?.orderId ?? null,
      });
      setMessages((current) => ({
        ...(current ?? emptyQuoteCustomerMessages()),
        note: [...(current?.note ?? []), message],
      }));
      setDraftNote("");
      setReplyTarget(null);
    } catch (noteError: unknown) {
      const code =
        typeof noteError === "object" &&
        noteError &&
        "code" in noteError &&
        typeof noteError.code === "string"
          ? noteError.code
          : "quote_customers_note_failed";
      setSendError(code);
    } finally {
      setSendingNote(false);
    }
  };

  const visibleMessages = messages?.[messageTab] ?? [];

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
                <th
                  aria-sort={sortAscending ? "ascending" : "descending"}
                >
                  <button
                    type="button"
                    className="quote-customers-sort"
                    onClick={toggleSort}
                    aria-label={t("quoteCustomers.sortByTotal")}
                    title={t("quoteCustomers.sortByTotal")}
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
                  <button
                    type="button"
                    className="quote-customers-company-summary"
                    onClick={() => openOrdersPanel(customer.email)}
                    aria-label={`${t("quoteCustomers.openOrders")} ${
                      customer.customerName || customer.email
                    }`}
                  >
                    <strong>
                      {customer.customerName || t("common.notSet")}
                    </strong>
                  </button>
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
                      total: summarizeCompanies(customer.companies).total,
                    })}
                    openLabel={`${t("quoteCustomers.openCompanies")} ${customer.email}`}
                    onOpen={() => openOrdersPanel(customer.email)}
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
                      i18n.language,
                    )}
                  </strong>
                </td>
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setPanel({ kind: "messages", email: customer.email })
                      }
                      aria-label={`${t("quoteCustomers.messagesAction")} ${customer.email}`}
                      title={t("quoteCustomers.messagesAction")}
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
        open={panel?.kind === "companies"}
        className="side-panel-majority"
        title={t("quoteCustomers.historyTitle")}
        description={panel?.kind === "companies" ? panel.email : undefined}
        onClose={closePanel}
        closeLabel={t("quoteCustomers.closePanel")}
      >
        <article className="panel quotes-panel quote-customers-orders-panel">
          <header className="quotes-toolbar">
            <ListSearchBar
              id="quote-customer-orders-search"
              value={ordersDraftSearch}
              onChange={setOrdersDraftSearch}
              onSubmit={submitOrdersSearch}
              label={t("quoteCustomers.ordersSearch")}
              placeholder={t("quoteCustomers.ordersSearchPlaceholder")}
              submitLabel={t("quoteCustomers.searchAction")}
              disabled={historyLoading}
            />
          </header>
          {historyError ? (
            <div className="quotes-state quotes-state-error" role="alert">
              <Users />
              <div>
                <strong>{t("quoteCustomers.historyError")}</strong>
                <span>{t("quoteCustomers.loadErrorDescription")}</span>
              </div>
              <Button variant="outline" onClick={refreshOrders}>
                <RefreshCw />
                {t("quoteCustomers.retry")}
              </Button>
            </div>
          ) : (
            <ListTable
              className="quotes-table-wrap"
              onRefresh={refreshOrders}
              loading={historyLoading}
              loadingLabel={t("quoteCustomers.historyLoading")}
              skeletonRows={QUOTE_CUSTOMER_ORDERS_PAGE_SIZE}
              skeletonColumns={ORDER_SKELETON_COLUMNS}
              header={
                <tr>
                  <th>{t("quoteCustomers.columns.company")}</th>
                  <th>{t("quoteCustomers.columns.orderNumber")}</th>
                  <th>{t("quoteCustomers.columns.date")}</th>
                  <th>{t("quoteCustomers.columns.amount")}</th>
                </tr>
              }
            >
              {(history?.orders ?? []).map((order) => (
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
                        i18n.language,
                      )}
                    </strong>
                  </td>
                </tr>
              ))}
            </ListTable>
          )}
          <TablePagination
            summary={t("quoteCustomers.ordersPagination", {
              from: ordersFrom,
              to: ordersTo,
              total: ordersTotal,
            })}
            page={ordersPage}
            totalPages={ordersTotalPages}
            loading={historyLoading}
            onPrevious={() =>
              setOrdersPage((current) => Math.max(1, current - 1))
            }
            onNext={() => setOrdersPage((current) => current + 1)}
            onPageChange={setOrdersPage}
            previousLabel={t("quoteCustomers.previous")}
            nextLabel={t("quoteCustomers.next")}
            pageLabel={t("quoteCustomers.pageOf")}
            jumpLabel={t("quoteCustomers.jumpToPage")}
          />
        </article>
      </SidePanel>

      <SidePanel
        open={panel?.kind === "messages"}
        className="side-panel-messages"
        title={t("quoteCustomers.messagesTitle")}
        description={panel?.kind === "messages" ? panel.email : undefined}
        onClose={closePanel}
        closeLabel={t("quoteCustomers.closePanel")}
        footer={
          messageTab === "note" ? (
            <div className="quote-customers-message-composer-wrap">
              {replyTarget ? (
                <div className="quote-customers-reply-target">
                  <span>
                    {t("quoteCustomers.replyTo", {
                      order:
                        replyTarget.orderNumber || t("quoteCustomers.thisNote"),
                    })}
                    {` · ${replyTarget.body}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                  >
                    {t("quoteCustomers.cancelReply")}
                  </button>
                </div>
              ) : null}
              <form
                className="quote-customers-message-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendNote();
                }}
              >
                <label className="sr-only" htmlFor="quote-customer-note">
                  {t("quoteCustomers.notePlaceholder")}
                </label>
                <input
                  id="quote-customer-note"
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder={t("quoteCustomers.notePlaceholder")}
                  disabled={messagesLoading || sendingNote}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={messagesLoading || sendingNote || !draftNote.trim()}
                  aria-label={t("quoteCustomers.sendNote")}
                >
                  <Send />
                </Button>
              </form>
            </div>
          ) : undefined
        }
      >
        <div className="quote-customers-messages">
          <div
            className="quote-customers-message-tabs"
            role="tablist"
            aria-label={t("quoteCustomers.messagesTitle")}
          >
            {QUOTE_CUSTOMER_MESSAGE_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={messageTab === tab}
                className={cn(messageTab === tab && "is-active")}
                onClick={() => {
                  setMessageTab(tab);
                  setReplyTarget(null);
                }}
              >
                {t(`quoteCustomers.tabs.${tab}`, {
                  total: messages?.[tab].length ?? 0,
                })}
              </button>
            ))}
          </div>
          <div ref={messageFeedRef} className="quote-customers-message-feed">
            {messagesLoading ? (
              <p className="quote-customers-history-status">
                {t("quoteCustomers.messagesLoading")}
              </p>
            ) : messagesError ? (
              <p className="quote-customers-history-error" role="alert">
                {t("quoteCustomers.messagesError")}
              </p>
            ) : !visibleMessages.length ? (
              <p className="quote-customers-history-status">
                {t(`quoteCustomers.emptyTabs.${messageTab}`)}
              </p>
            ) : (
              visibleMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  timestamp={messageTimeFormatter.format(
                    new Date(message.createdAt),
                  )}
                  replyLabel={
                    messageTab === "note"
                      ? t("quoteCustomers.reply")
                      : undefined
                  }
                  onReply={
                    messageTab === "note" ? setReplyTarget : undefined
                  }
                />
              ))
            )}
            {sendError ? (
              <p className="quote-customers-history-error" role="alert">
                {t("quoteCustomers.sendError")}
              </p>
            ) : null}
          </div>
        </div>
      </SidePanel>
    </section>
  );
}
