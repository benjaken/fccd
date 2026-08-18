import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, ClipboardList, ExternalLink, Plus, RefreshCw, RefreshCcw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  fetchOrders,
  operationalOrderStatus,
  operationalOrderStatusTone,
  ORDERS_PAGE_SIZE,
  type OrderListFilters,
  type OrderListItem,
  type OrderListResult,
  type OrderPreset,
  type OrderStatusFilter,
} from "@/lib/orders";
import {
  fetchOrderListConfigs,
  ORDER_LIST_I18N_KEYS,
  type OrderListConfigPreset,
  type OrderListConfigRow,
} from "@/lib/order-list-configs";
import {
  syncShopifyOrders,
  type ShopifySyncResult,
} from "@/lib/shopify-sync";
import { cn } from "@/lib/utils";

type OrdersLoader = (filters: OrderListFilters) => Promise<OrderListResult>;
type OrderListConfigLoader = typeof fetchOrderListConfigs;
type ShopifySyncLoader = typeof syncShopifyOrders;

const STATUS_FILTERS: OrderStatusFilter[] = [
  "",
  "confirmed",
  "preparing",
  "ready",
  "shipping",
  "completed",
];

const ORDER_SKELETON_COLUMNS = [
  { width: "6rem" },
  { width: "72%" },
  { width: "7rem" },
  { width: "5rem" },
  { width: "4.5rem", variant: "badge" as const },
];
export function OrdersListPage({
  preset = "all",
  canViewFinance = true,
  loadOrders = fetchOrders,
  loadListConfig = fetchOrderListConfigs,
  syncShopify = syncShopifyOrders,
}: {
  preset?: OrderPreset;
  canViewFinance?: boolean;
  loadOrders?: OrdersLoader;
  loadListConfig?: OrderListConfigLoader;
  syncShopify?: ShopifySyncLoader;
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
  const [listConfig, setListConfig] = useState<OrderListConfigRow | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<ShopifySyncResult | null>(null);
  const setStatus = (nextStatus: OrderStatusFilter) => {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (nextStatus) next.set("status", nextStatus);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  };
  const statusFilter = useDeferredFilter(status, setStatus);
  const financeRestricted =
    !canViewFinance &&
    (preset === "unpaid" || preset === "delivered-unpaid");

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * ORDERS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * ORDERS_PAGE_SIZE, total);
  const copyKeys =
    ORDER_LIST_I18N_KEYS[preset as OrderListConfigPreset] ??
    ORDER_LIST_I18N_KEYS.all;
  const title = listConfig?.title.trim() || t(`orders.${copyKeys.title}`);
  const description =
    listConfig?.description.trim() || t(`orders.${copyKeys.description}`);

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

  const openSyncConfirm = () => {
    setSyncError(null);
    setSyncResult(null);
    setSyncConfirmOpen(true);
  };

  const closeSyncConfirm = () => {
    if (syncing) return;
    setSyncConfirmOpen(false);
    setSyncError(null);
    setSyncResult(null);
  };

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const result = await syncShopify();
      setSyncResult(result);
      setReloadKey((key) => key + 1);
    } catch (syncFailure) {
      const code =
        syncFailure instanceof Error
          ? syncFailure.message
          : "shopify_sync_failed";
      setSyncError(code);
    } finally {
      setSyncing(false);
    }
  }, [syncShopify, syncing]);

  const syncDone = Boolean(syncResult);
  const syncFailed = Boolean(syncError);

  useEffect(() => {
    let cancelled = false;
    void loadListConfig()
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((row) => row.presetKey === preset) ?? null;
        setListConfig(match);
      })
      .catch(() => {
        if (!cancelled) setListConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadListConfig, preset]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const statusLabels = {
    confirmed: t("orders.statuses.confirmed"),
    preparing: t("orders.statuses.preparing"),
    ready: t("orders.statuses.ready"),
    pickedUp: t("orders.statuses.pickedUp"),
    awaitingDriver: t("orders.statuses.awaitingDriver"),
    shipping: t("orders.statuses.shipping"),
    completed: t("orders.statuses.completed"),
  };

  const formatAmount = (value: number | null, currencyCode: string) => {
    if (value === null) return t("common.notSet");
    return currencyCode === "HKD"
      ? currency.format(value)
      : `${currencyCode} ${value.toLocaleString(i18n.language)}`;
  };

  const shopifyOrderUrl = (order: OrderListItem): string | null => {
    if (!order.shopifyOrderId || !order.shopifyStoreDomain) return null;
    const shop = order.shopifyStoreDomain.replace(/\.myshopify\.com$/, "");
    return `https://admin.shopify.com/store/${shop}/orders/${order.shopifyOrderId}`;
  };

  return (
    <section className="orders-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("orders.eyebrow")}</span>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="heading-actions">
          {preset === "shopify-pending" ? (
            <Button
              variant="outline"
              onClick={openSyncConfirm}
              disabled={syncing}
              aria-label={t("orders.syncShopify")}
            >
              {syncing ? <RefreshCw className="spin" /> : <RefreshCcw />}
              {syncing
                ? t("orders.syncing")
                : t("orders.syncShopify")}
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/orders/new">
              <Plus />
              {t("orders.create")}
            </Link>
          </Button>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="orders-search"
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
                      event.target.value as OrderStatusFilter,
                    )
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
            }
          />
        </header>

        {financeRestricted ? (
          <div className="orders-state orders-state-error" role="alert">
            <ClipboardList />
            <div>
              <strong>{t("orders.financeRestricted")}</strong>
              <span>{t("orders.financeRestrictedDescription")}</span>
            </div>
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
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <ClipboardList />
            <div>
              <strong>{t("orders.empty")}</strong>
              <span>{t("orders.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("orders.loading")}
            skeletonRows={ORDERS_PAGE_SIZE}
            skeletonColumns={[
              ...ORDER_SKELETON_COLUMNS,
              ...(canViewFinance
                ? [{ width: "5rem" }, { width: "5rem" }]
                : []),
              { width: "1.75rem", variant: "action" as const },
              { width: "1.75rem", variant: "action" as const },
            ]}
            header={
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
                <th>{t("orders.columns.shopify")}</th>
                <th aria-label={t("orders.columns.actions")} />
              </tr>
            }
          >
            {items.map((order) => {
              const statusView =
                preset === "pending"
                  ? {
                      label: t("orders.statuses.pending"),
                      tone: "amber",
                    }
                  : (() => {
                      const statusKey = operationalOrderStatus(order);
                      return {
                        label: statusLabels[statusKey],
                        tone: operationalOrderStatusTone(statusKey),
                      };
                    })();
              return (
                <tr key={order.id}>
                  <td>
                    <DetailLink className="order-link" to={`/orders/${order.id}`}>
                      {order.orderNumber || t("common.notSet")}
                    </DetailLink>
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
                      {order.deliveryTime ? (
                        <small className="order-delivery-time">
                          {order.deliveryTime}
                        </small>
                      ) : null}
                    </span>
                  </td>
                  <td>{order.shipOutTime || t("common.notSet")}</td>
                  <td>
                    <span className={cn("status-badge", statusView.tone)}>
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
                          (order.outstanding ?? 0) > 0 && "order-outstanding",
                        )}
                      >
                        {formatAmount(order.outstanding, order.currency)}
                      </td>
                    </>
                  )}
                  <td>
                    {(() => {
                      const url = shopifyOrderUrl(order);
                      if (!url) return <span aria-hidden="true">—</span>;
                      return (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          aria-label={t("orders.openInShopify", {
                            order: order.orderNumber || order.id,
                          })}
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink />
                          </a>
                        </Button>
                      );
                    })()}
                  </td>
                  <td>
                    <Button variant="ghost" size="icon" asChild>
                      <DetailLink
                        to={`/orders/${order.id}`}
                        aria-label={`${t("orders.open")} ${
                          order.orderNumber || order.id
                        }`}
                      >
                        <ChevronRight />
                      </DetailLink>
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

      {preset === "shopify-pending" ? (
        <ConfirmDialog
          open={syncConfirmOpen}
          title={
            syncDone
              ? t("orders.syncCompleteTitle")
              : syncFailed
                ? t("orders.syncFailedTitle")
                : t("orders.syncConfirmTitle")
          }
          description={
            syncDone
              ? undefined
              : t("orders.syncConfirmDescription")
          }
          confirmLabel={
            syncDone
              ? t("orders.syncDone")
              : syncFailed
                ? t("orders.syncRetry")
                : t("orders.syncConfirmAction")
          }
          cancelLabel={t("orders.syncCancel")}
          closeLabel={t("orders.syncCancel")}
          busy={syncing}
          busyLabel={t("orders.syncing")}
          onConfirm={() => {
            if (syncDone || syncFailed) closeSyncConfirm();
            else void runSync();
          }}
          onCancel={closeSyncConfirm}
        >
          {syncDone && syncResult ? (
            <div className="modal-result">
              <p className="modal-result-summary" role="status">
                {t("orders.syncSummary", {
                  fetched: syncResult.fetched,
                  inserted: syncResult.inserted,
                  updated: syncResult.updatedShopify,
                  linked: syncResult.linkedExisting,
                  issues: syncResult.issueCount,
                })}
              </p>
              {syncResult.issueCount > 0 ? (
                <p className="modal-result-issues" role="alert">
                  {t("orders.syncIssuesWarning", {
                    issues: syncResult.issueCount,
                  })}
                </p>
              ) : null}
            </div>
          ) : syncError ? (
            <p className="list-inline-error" role="alert">
              {syncError === "shopify_sync_failed" ||
              syncError === "unauthorized" ||
              syncError === "page_access_required" ||
              syncError === "invalid_authorization"
                ? t("orders.syncErrorDescription")
                : syncError}
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
