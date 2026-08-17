import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, ClipboardList, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  KITCHEN_STATUS_FILTERS,
  kitchenOperationalStatus,
  kitchenOperationalStatusTone,
  kitchenOrderHref,
  type KitchenOrderStatusFilter,
} from "@/lib/kitchen-orders";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  fetchOrders,
  ORDERS_PAGE_SIZE,
  type OrderListFilters,
  type OrderListItem,
  type OrderListResult,
} from "@/lib/orders";
import { cn } from "@/lib/utils";

type KitchenOrdersLoader = (filters: OrderListFilters) => Promise<OrderListResult>;

const KITCHEN_SKELETON_COLUMNS = [
  { width: "6rem" },
  { width: "72%" },
  { width: "7rem" },
  { width: "7rem" },
  { width: "6.5rem", variant: "badge" as const },
  { width: "1.75rem", variant: "action" as const },
];

export function KitchenOrdersPage({
  loadOrders = fetchOrders,
}: {
  loadOrders?: KitchenOrdersLoader;
}) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("status") ?? "";
  const status = KITCHEN_STATUS_FILTERS.includes(
    requestedStatus as KitchenOrderStatusFilter,
  )
    ? (requestedStatus as KitchenOrderStatusFilter)
    : "";
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const setStatus = (nextStatus: KitchenOrderStatusFilter) => {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (nextStatus) next.set("status", nextStatus);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  };
  const statusFilter = useDeferredFilter(status, setStatus);

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * ORDERS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * ORDERS_PAGE_SIZE, total);

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadOrders({
        page,
        search,
        status,
        preset: "kitchen",
        canViewFinance: false,
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
          : "kitchen_orders_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [loadOrders, page, reloadKey, search, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const statusLabels = {
    preparing: t("orders.statuses.preparing"),
    ready: t("orders.statuses.ready"),
    pickedUp: t("orders.statuses.pickedUp"),
    awaitingDriver: t("orders.statuses.awaitingDriver"),
    shipping: t("orders.statuses.shipping"),
    completed: t("orders.statuses.completed"),
  };

  return (
    <section className="orders-page kitchen-orders-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t("kitchenOrders.title")}</h1>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="kitchen-orders-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("orders.search")}
            placeholder={t("orders.searchPlaceholder")}
            submitLabel={t("orders.searchAction")}
            filtersActive={Boolean(status)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <label className="orders-status-filter">
                <span>{t("orders.statusFilter")}</span>
                <select
                  value={statusFilter.value}
                  onChange={(event) =>
                    statusFilter.setValue(
                      event.target.value as KitchenOrderStatusFilter,
                    )
                  }
                >
                  {KITCHEN_STATUS_FILTERS.map((option) => (
                    <option key={option || "all"} value={option}>
                      {option
                        ? t(`orders.statuses.${option}`)
                        : t("orders.allStatuses")}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <ClipboardList />
            <div>
              <strong>{t("kitchenOrders.loadError")}</strong>
              <span>{t("kitchenOrders.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw />
              {t("kitchenOrders.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <ClipboardList />
            <div>
              <strong>{t("kitchenOrders.empty")}</strong>
              <span>{t("kitchenOrders.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("kitchenOrders.loading")}
            skeletonRows={ORDERS_PAGE_SIZE}
            skeletonColumns={KITCHEN_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("orders.columns.number")}</th>
                <th>{t("orders.columns.customer")}</th>
                <th>{t("details.factoryDate")}</th>
                <th>{t("orders.columns.delivery")}</th>
                <th>{t("orders.columns.status")}</th>
                <th aria-label={t("orders.columns.actions")} />
              </tr>
            }
          >
            {items.map((order) => {
              const statusKey = kitchenOperationalStatus(order);
              return (
              <tr key={order.id}>
                <td>
                  <Link className="order-link" to={kitchenOrderHref(order.id)}>
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
                    {order.factoryDate
                      ? date.format(new Date(order.factoryDate))
                      : t("common.notSet")}
                  </span>
                </td>
                <td>
                  <span className="order-date">
                    <CalendarDays />
                    {order.deliveryAt
                      ? date.format(new Date(order.deliveryAt))
                      : t("common.notSet")}
                  </span>
                </td>
                <td>
                  <span
                    className={cn(
                      "status-badge",
                      kitchenOperationalStatusTone(statusKey),
                    )}
                  >
                    {statusLabels[statusKey]}
                  </span>
                </td>
                <td>
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to={kitchenOrderHref(order.id)}
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
          </ListTable>
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
