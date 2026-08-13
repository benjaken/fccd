import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, ClipboardList, Plus, RefreshCw, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchOrders,
  ORDERS_PAGE_SIZE,
  type OrderListFilters,
  type OrderListItem,
  type OrderListResult,
  type OrderPreset,
  type OrderStatusFilter,
} from "@/lib/orders";
import { cn } from "@/lib/utils";

type OrdersLoader = (filters: OrderListFilters) => Promise<OrderListResult>;

const STATUS_FILTERS: OrderStatusFilter[] = [
  "",
  "confirmed",
  "preparing",
  "ready",
  "shipping",
  "completed",
];

function orderStatus(
  order: OrderListItem,
  labels: Record<Exclude<OrderStatusFilter, "">, string>,
) {
  if (
    order.deliveryStatus === "己送達" ||
    order.deliveryStatus === "已送達"
  ) {
    return { label: labels.completed, tone: "green" };
  }
  if (order.deliveryStatus === "送貨途中") {
    return { label: labels.shipping, tone: "blue" };
  }
  if (order.deliveryStatus === "待取貨") {
    return { label: labels.ready, tone: "green" };
  }
  if (
    order.deliveryStatus === "待接單" ||
    order.deliveryStatus === "未派車隊"
  ) {
    return { label: labels.confirmed, tone: "blue" };
  }
  if (order.isSentToFactory) {
    return { label: labels.preparing, tone: "amber" };
  }
  return { label: labels.confirmed, tone: "blue" };
}

export function OrdersListPage({
  preset = "all",
  canViewFinance = true,
  loadOrders = fetchOrders,
}: {
  preset?: OrderPreset;
  canViewFinance?: boolean;
  loadOrders?: OrdersLoader;
}) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("status") ?? "";
  const status = STATUS_FILTERS.includes(
    requestedStatus as OrderStatusFilter,
  )
    ? (requestedStatus as OrderStatusFilter)
    : "";
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const financeRestricted =
    !canViewFinance &&
    (preset === "unpaid" || preset === "delivered-unpaid");

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * ORDERS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * ORDERS_PAGE_SIZE, total);
  const titleKey =
    preset === "pending"
      ? "pendingTitle"
      : preset === "unpaid"
        ? "unpaidTitle"
        : preset === "delivered-unpaid"
          ? "deliveredUnpaidTitle"
          : "title";

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const loadPage = useCallback(async () => {
    if (financeRestricted) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await loadOrders({
        page,
        search,
        status,
        preset,
        canViewFinance,
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
          : "orders_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [
    canViewFinance,
    financeRestricted,
    loadOrders,
    page,
    preset,
    reloadKey,
    search,
    status,
  ]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const setStatus = (nextStatus: OrderStatusFilter) => {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (nextStatus) next.set("status", nextStatus);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  };

  const statusLabels = {
    confirmed: t("orders.statuses.confirmed"),
    preparing: t("orders.statuses.preparing"),
    ready: t("orders.statuses.ready"),
    shipping: t("orders.statuses.shipping"),
    completed: t("orders.statuses.completed"),
  };

  const formatAmount = (value: number | null, currencyCode: string) => {
    if (value === null) return t("common.notSet");
    return currencyCode === "HKD"
      ? currency.format(value)
      : `${currencyCode} ${value.toLocaleString(i18n.language)}`;
  };

  return (
    <section className="orders-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("orders.eyebrow")}</span>
          <h1>{t(`orders.${titleKey}`)}</h1>
        </div>
        <Button asChild>
          <Link to="/orders/new">
            <Plus />
            {t("orders.create")}
          </Link>
        </Button>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <form className="orders-search" onSubmit={submitSearch}>
            <label className="orders-search-field" htmlFor="orders-search">
              <Search aria-hidden="true" />
              <span className="sr-only">{t("orders.search")}</span>
              <input
                id="orders-search"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder={t("orders.searchPlaceholder")}
              />
            </label>
            <Button type="submit" variant="outline">
              {t("orders.searchAction")}
            </Button>
          </form>

          <label className="orders-status-filter">
            <span>{t("orders.statusFilter")}</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as OrderStatusFilter)
              }
              disabled={preset === "delivered-unpaid"}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option || "all"} value={option}>
                  {option
                    ? t(`orders.statuses.${option}`)
                    : t("orders.allStatuses")}
                </option>
              ))}
            </select>
          </label>
        </header>

        {financeRestricted ? (
          <div className="orders-state orders-state-error" role="alert">
            <ClipboardList />
            <div>
              <strong>{t("orders.financeRestricted")}</strong>
              <span>{t("orders.financeRestrictedDescription")}</span>
            </div>
          </div>
        ) : loading ? (
          <div className="orders-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("orders.loading")}</span>
          </div>
        ) : error ? (
          <div className="orders-state orders-state-error" role="alert">
            <ClipboardList />
            <div>
              <strong>{t("orders.loadError")}</strong>
              <span>{t("orders.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw />
              {t("orders.retry")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="orders-state">
            <ClipboardList />
            <div>
              <strong>{t("orders.empty")}</strong>
              <span>{t("orders.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="table-wrap orders-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("orders.columns.number")}</th>
                  <th>{t("orders.columns.customer")}</th>
                  <th>{t("orders.columns.delivery")}</th>
                  <th>{t("orders.columns.shipOut")}</th>
                  <th>{t("orders.columns.status")}</th>
                  {canViewFinance && (
                    <>
                      <th>{t("orders.columns.amount")}</th>
                      <th>{t("orders.columns.outstanding")}</th>
                    </>
                  )}
                  <th aria-label={t("orders.columns.actions")} />
                </tr>
              </thead>
              <tbody>
                {items.map((order) => {
                  const statusView =
                    preset === "pending"
                      ? {
                          label: t("orders.statuses.pending"),
                          tone: "amber",
                        }
                      : orderStatus(order, statusLabels);
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link className="order-link" to={`/orders/${order.id}`}>
                          {order.orderNumber || t("common.notSet")}
                        </Link>
                      </td>
                      <td>
                        <strong>
                          {order.companyName ||
                            order.customerName ||
                            t("common.notSet")}
                        </strong>
                        {order.companyName && order.customerName && (
                          <small className="order-customer-name">
                            {order.customerName}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="order-date">
                          <CalendarDays />
                          {order.deliveryAt
                            ? date.format(new Date(order.deliveryAt))
                            : t("common.notSet")}
                        </span>
                      </td>
                      <td>{order.shipOutTime || t("common.notSet")}</td>
                      <td>
                        <span
                          className={cn(
                            "status-badge",
                            statusView.tone,
                          )}
                        >
                          {statusView.label}
                        </span>
                      </td>
                      {canViewFinance && (
                        <>
                          <td>
                            <strong>
                              {formatAmount(order.grandTotal, order.currency)}
                            </strong>
                          </td>
                          <td
                            className={cn(
                              (order.outstanding ?? 0) > 0 &&
                                "order-outstanding",
                            )}
                          >
                            {formatAmount(order.outstanding, order.currency)}
                          </td>
                        </>
                      )}
                      <td>
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to={`/orders/${order.id}`}
                            aria-label={`${t("orders.open")} ${
                              order.orderNumber || order.id
                            }`}
                          >
                            <ChevronRight />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          summary={t("orders.pagination", {
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
          previousLabel={t("orders.previous")}
          nextLabel={t("orders.next")}
          pageLabel={t("orders.pageOf")}
          jumpLabel={t("orders.jumpToPage")}
        />
      </article>
    </section>
  );
}
