import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, RefreshCw, RefreshCcw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  fetchOrders,
  ORDERS_PAGE_SIZE,
  updateOrderStatusSelections,
  type OrderListFilters,
  type OrderListItem,
  type OrderListResult,
  type OrderPreset,
  type OrderStatusFilter,
} from "@/lib/orders";
import { cancelOrderDelivery, canCancelOrderDelivery } from "@/lib/order-cancellation";
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
import { fetchOrderTags, type OrderTag } from "@/lib/order-tags";
import { fetchOrderStatusCatalog, type ConfiguredOrderStatus } from "@/lib/order-statuses";
import { type OrderListEnhancementFilters } from "@/lib/order-list-enhancement";
import { ORDER_LIST_STATUS_NAMES, OrderListFiltersPanel, OrderRowActionMenu, OrderStatusPicker, OrderTagBadges, type OrderPrintKind } from "@/components/order-list-enhancement";
import { getBrandLogoAlt, getDocumentLogoPath } from "@/lib/brand-logo";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import { CustomerMessagesSidePanel } from "@/components/CustomerMessagesSidePanel";
import { createQuoteCustomerNote, fetchOrderMessages } from "@/lib/quote-customers";
import { DeliveryNoteDocument } from "@/components/DeliveryNoteDocument";
import {
  fetchFactoryOrderJob,
  type FactoryOrderJob,
} from "@/lib/factory-board";

type OrdersLoader = (filters: OrderListFilters) => Promise<OrderListResult>;
type OrderListConfigLoader = typeof fetchOrderListConfigs;
type ShopifySyncLoader = typeof syncShopifyOrders;
type OrderStatusesUpdater = typeof updateOrderStatusSelections;

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
  canManageStatuses = true,
  loadOrders = fetchOrders,
  loadListConfig = fetchOrderListConfigs,
  loadStatusCatalog = fetchOrderStatusCatalog,
  updateStatuses = updateOrderStatusSelections,
  loadCustomerMessages = fetchOrderMessages,
  createCustomerNote = createQuoteCustomerNote,
  syncShopify = syncShopifyOrders,
  cancelDelivery = cancelOrderDelivery,
  loadOrderJob = fetchFactoryOrderJob,
}: {
  preset?: OrderPreset;
  canViewFinance?: boolean;
  /** Server-side RLS remains the authority; callers may hide status editing. */
  canManageStatuses?: boolean;
  loadOrders?: OrdersLoader;
  loadListConfig?: OrderListConfigLoader;
  loadStatusCatalog?: typeof fetchOrderStatusCatalog;
  updateStatuses?: OrderStatusesUpdater;
  loadCustomerMessages?: typeof fetchOrderMessages;
  createCustomerNote?: typeof createQuoteCustomerNote;
  syncShopify?: ShopifySyncLoader;
  cancelDelivery?: typeof cancelOrderDelivery;
  loadOrderJob?: typeof fetchFactoryOrderJob;
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
  const [orderTags, setOrderTags] = useState<OrderTag[]>([]);
  const [orderStatusCatalog, setOrderStatusCatalog] = useState<ConfiguredOrderStatus[]>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [cancelOrder, setCancelOrder] = useState<OrderListItem | null>(null);
  const [cancelText, setCancelText] = useState("");
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [printPreview, setPrintPreview] = useState<{ order: OrderListItem; kind: OrderPrintKind } | null>(null);
  const [deliveryNoteJob, setDeliveryNoteJob] = useState<FactoryOrderJob | null>(null);
  const [deliveryNoteLoading, setDeliveryNoteLoading] = useState(false);
  const [deliveryNoteError, setDeliveryNoteError] = useState(false);
  const [messageOrder, setMessageOrder] = useState<OrderListItem | null>(null);
  const enhancementFilters = useMemo<OrderListEnhancementFilters>(() => ({
    deliveryDate: searchParams.get("deliveryDate") || undefined,
    deliveryStart: searchParams.get("deliveryStart") || undefined,
    deliveryEnd: searchParams.get("deliveryEnd") || undefined,
    brandIds: splitQueryValues(searchParams.get("brands")),
    orderTagIds: splitQueryValues(searchParams.get("tags")),
    manualTodoKeys: splitQueryValues(searchParams.get("todos")),
    deliverySort: searchParams.get("deliverySort") === "asc" ? "asc" : searchParams.get("deliverySort") === "desc" ? "desc" : undefined,
  }), [searchParams]);
  const setEnhancementFilters = (next: OrderListEnhancementFilters) => {
    setPage(1);
    const params = new URLSearchParams(searchParams);
    setOptionalParam(params, "deliveryDate", next.deliveryDate);
    setOptionalParam(params, "deliveryStart", next.deliveryStart);
    setOptionalParam(params, "deliveryEnd", next.deliveryEnd);
    setOptionalParam(params, "brands", next.brandIds?.join(","));
    setOptionalParam(params, "tags", next.orderTagIds?.join(","));
    setOptionalParam(params, "todos", next.manualTodoKeys?.join(","));
    setOptionalParam(params, "deliverySort", next.deliverySort);
    setSearchParams(params, { replace: true });
  };
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

  useEffect(() => {
    if (!printPreview || printPreview.kind !== "delivery-note") {
      setDeliveryNoteJob(null);
      setDeliveryNoteLoading(false);
      setDeliveryNoteError(false);
      return;
    }
    let active = true;
    setDeliveryNoteJob(null);
    setDeliveryNoteLoading(true);
    setDeliveryNoteError(false);
    void loadOrderJob(printPreview.order.id)
      .then((job) => {
        if (active) setDeliveryNoteJob(job);
      })
      .catch(() => {
        if (active) setDeliveryNoteError(true);
      })
      .finally(() => {
        if (active) setDeliveryNoteLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadOrderJob, printPreview]);

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
        ...enhancementFilters,
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
    enhancementFilters,
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

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchOrderTags().catch(() => []),
      import("@/lib/supabase").then(({ supabase }) =>
        supabase.from("channels").select("id,name").is("archived_at", null).order("name"),
      ).catch(() => ({ data: [] })),
    ])
      .then(([tags, brandsResult]) => {
        if (!active) return;
        setOrderTags(tags);
        setBrands((brandsResult.data ?? []).flatMap((row) =>
          row.name ? [{ id: row.id, name: row.name }] : [],
        ));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void loadStatusCatalog()
      .then((statuses) => {
        if (active) setOrderStatusCatalog(statuses);
      })
      .catch(() => {
        if (active) setOrderStatusCatalog([]);
      });
    return () => { active = false; };
  }, [loadStatusCatalog]);

  const openCancel = (order: OrderListItem) => {
    setCancelText("");
    setCancelNotice(null);
    setCancelOrder(order);
  };

  const confirmCancel = async () => {
    if (cancelText.trim().toLowerCase() !== "void") return;
    if (!cancelOrder) return;
    setCancelling(true);
    setCancelNotice(null);
    try {
      await cancelDelivery(cancelOrder.id);
      setCancelOrder(null);
      setReloadKey((value) => value + 1);
    } catch {
      setCancelNotice(t("orders.cancelDialog.error"));
    } finally {
      setCancelling(false);
    }
  };

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
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
            filtersAlwaysInDrawer
            filtersTitle={t("common.filters")}
            filtersActive={Boolean(status || enhancementFilters.deliveryDate || enhancementFilters.deliveryStart || enhancementFilters.brandIds?.length || enhancementFilters.orderTagIds?.length || enhancementFilters.manualTodoKeys?.length)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <>
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
              <OrderListFiltersPanel
                filters={enhancementFilters}
                brands={brands}
                tags={orderTags
                  .filter((tag) => tag.isActive)
                  .map((tag) => ({ id: tag.id, name: tag.name }))}
                onChange={setEnhancementFilters}
              />
              </>
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
              { width: "5rem" },
              { width: "7rem" },
              { width: "6rem" },
              { width: "6rem" },
              { width: "5rem" },
              ...(preset === "kitchen-notes" ? [{ width: "14rem" }] : []),
              ...(canViewFinance
                ? [{ width: "5rem" }, { width: "5rem" }]
                : []),
              { width: "1.75rem", variant: "action" as const },
              { width: "1.75rem", variant: "action" as const },
            ]}
            header={
              <tr>
                <th>{t("orders.columns.brand")}</th>
                <th>{t("orders.columns.number")}</th>
                <th>{t("orders.columns.customer")}</th>
                <th>{t("orders.columns.region")}</th>
                <th>
                  <button
                    type="button"
                    onClick={() => setEnhancementFilters({
                      ...enhancementFilters,
                      deliverySort: enhancementFilters.deliverySort === "asc" ? "desc" : "asc",
                    })}
                  >
                    {t("orders.columns.delivery")} <span aria-hidden="true">›</span>
                  </button>
                </th>
                <th>{t("orders.columns.shipOutAndDelivery")}</th>
                <th>{t("orders.columns.tags")}</th>
                <th>{t("orders.columns.quantity")}</th>
                {preset === "kitchen-notes" && (
                  <th>{t("orders.columns.packingNote")}</th>
                )}
                {canViewFinance && (
                  <th>{t("orders.columns.amount")}</th>
                )}
                {preset === "all" && <th>{t("orders.columns.todos")}</th>}
                <th aria-label={t("orders.columns.actions")} />
              </tr>
            }
          >
            {items.map((order) => {
              const factoryTodoAliases = ["未傳至工場", "未傳送到工場"];
              const todoStatuses = (order.statuses ?? []).filter(
                (status) =>
                  !order.doNotSendToFactory ||
                  !factoryTodoAliases.includes(status.name.trim()),
              );
              const addTodoStatus = (
                aliases: readonly string[],
                fallbackName: string,
                fallbackColor: string,
              ) => {
                if (todoStatuses.some((status) => aliases.includes(status.name.trim()))) return;
                const configured = orderStatusCatalog.find((status) =>
                  aliases.includes(status.name.trim()),
                );
                todoStatuses.push({
                  name: configured?.name ?? fallbackName,
                  color: configured?.color ?? fallbackColor,
                });
              };
              if (canViewFinance && (order.outstanding ?? 0) > 0) {
                addTodoStatus(
                  ["未完成付款", "未付款"],
                  t("orders.todos.paymentIncomplete"),
                  "#ef4444",
                );
              }
              if (!order.isSentToFactory && !order.doNotSendToFactory) {
                addTodoStatus(
                  factoryTodoAliases,
                  t("orders.todos.notSentToFactory"),
                  "#f59e0b",
                );
              }
              if (order.factoryPackingNote?.trim()) {
                addTodoStatus(
                  ["廚房備註"],
                  t("orders.todos.kitchenNote"),
                  "#3b82f6",
                );
              }
              return (
                <tr key={order.id}>
                  <td>{order.channelName || t("common.notSet")}</td>
                  <td>
                    <div className="order-number-cell">
                      <DetailLink className="order-link" to={`/orders/${order.id}`}>
                        {order.orderNumber || t("common.notSet")}
                      </DetailLink>
                      {(() => {
                        const url = shopifyOrderUrl(order);
                        if (!url) return null;
                        const label = t("orders.openInShopify", {
                          order: order.orderNumber || order.id,
                        });
                        return (
                          <a
                            className="shopify-order-icon"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={label}
                            title={label}
                          >
                            <span aria-hidden="true">S</span>
                          </a>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="order-customer-summary">
                    <div>{order.customerName || order.companyName || t("common.notSet")}</div>
                    <div>{order.contactPhone || t("common.notSet")}</div>
                    <div>{order.address || t("common.notSet")}</div>
                  </td>
                  <td>{order.districtName || t("common.notSet")}</td>
                  <td>
                    {order.deliveryAt?.slice(0, 10) || t("common.notSet")}
                  </td>
                  <td>
                    <div>{t("orders.deliveryDetails.shipOut")}</div>
                    <strong>{order.shipOutTime || t("common.notSet")}</strong>
                    <div>{t("orders.deliveryDetails.deliveryTime")}</div>
                    <strong>{order.deliveryTime || t("common.notSet")}</strong>
                    <div>{t("orders.deliveryDetails.status")}</div>
                    <strong>{order.deliveryStatus || t("orders.deliveryDetails.unassigned")}</strong>
                  </td>
                  <td>
                    <OrderTagBadges
                      statuses={order.tags ?? []}
                      manualTodos={[]}
                    />
                  </td>
                  <td>{(order.quantity ?? 0).toLocaleString(i18n.language)}</td>
                  {preset === "kitchen-notes" && (
                    <td className="order-packing-note">
                      {order.factoryPackingNote || t("common.notSet")}
                    </td>
                  )}
                  {canViewFinance && (
                    <td>
                      <strong>
                        {formatAmount(order.grandTotal, order.currency)}
                      </strong>
                    </td>
                  )}
                  {preset === "all" ? (
                    <td>
                      <div className="order-todo-list">
                        <OrderTagBadges
                          statuses={todoStatuses}
                          manualTodos={order.manualTodos ?? []}
                        />
                      </div>
                    </td>
                  ) : null}
                  <td>
                    <OrderRowActionMenu
                      order={order}
                      canCancel={canCancelOrderDelivery(order.deliveryStatus)}
                      onCancel={() => openCancel(order)}
                      onMessages={() => setMessageOrder(order)}
                      onPreview={(kind) => setPrintPreview({ order, kind })}
                      statusPicker={preset === "all" ? (
                        <OrderStatusPicker
                          order={order}
                          options={orderStatusCatalog.filter((status) =>
                            (ORDER_LIST_STATUS_NAMES as readonly string[]).includes(status.name.trim()),
                          )}
                          disabled={!canManageStatuses}
                          onSave={async (legacyIds) => {
                            await updateStatuses(order.id, legacyIds);
                            setReloadKey((key) => key + 1);
                          }}
                        />
                      ) : null}
                    />
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

      <CustomerMessagesSidePanel
        open={Boolean(messageOrder)}
        email={messageOrder?.email ?? null}
        phone={messageOrder?.contactPhone ?? null}
        orderNumber={messageOrder?.orderNumber ?? null}
        defaultOrderId={messageOrder?.id ?? null}
        onClose={() => setMessageOrder(null)}
        loadMessages={loadCustomerMessages}
        createNote={createCustomerNote}
      />

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

      <Modal
        open={Boolean(cancelOrder)}
        title={t("orders.cancelDialog.title")}
        description={t("orders.cancelDialog.description")}
        onClose={() => setCancelOrder(null)}
        closeLabel={t("orders.cancelDialog.closeLabel")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" disabled={cancelling} onClick={() => setCancelOrder(null)}>{t("orders.cancelDialog.close")}</Button>
            <Button type="button" variant="destructive" disabled={cancelling || cancelText.trim().toLowerCase() !== "void"} onClick={() => void confirmCancel()}>{cancelling ? t("orders.cancelDialog.cancelling") : t("orders.cancelDialog.confirm")}</Button>
          </>
        }
      >
        <label className="ingredients-field">
          <span>{t("orders.cancelDialog.prompt")}</span>
          <input value={cancelText} onChange={(event) => setCancelText(event.target.value)} aria-label={t("orders.cancelDialog.inputLabel")} />
        </label>
        {cancelNotice ? <p role="status">{cancelNotice}</p> : null}
      </Modal>

      <SidePanel
        open={printPreview?.kind === "delivery-note"}
        title={t("orders.printPreview.deliveryNoteTitle")}
        description={t("orders.printPreview.description")}
        onClose={() => setPrintPreview(null)}
        closeLabel={t("orders.printPreview.closeLabel")}
        className="order-delivery-note-panel"
        footer={<><Button type="button" variant="outline" onClick={() => setPrintPreview(null)}>{t("common.close")}</Button><Button type="button" disabled={deliveryNoteLoading || deliveryNoteError} onClick={() => window.print()}>{t("orders.printPreview.print")}</Button></>}
      >
        {printPreview?.kind === "delivery-note" ? (
          deliveryNoteLoading ? (
            <div className="order-delivery-note-state">{t("deliveryNotes.loading")}</div>
          ) : deliveryNoteError ? (
            <div className="order-delivery-note-state list-inline-error" role="alert">
              {t("factoryBoard.orderLoadError")}
            </div>
          ) : (
            <div className="order-delivery-note-preview">
              <DeliveryNoteDocument
                order={{
                  ...printPreview.order,
                  customerPhone: printPreview.order.contactPhone,
                  shippingMethodName:
                    printPreview.order.shippingMethodName ?? null,
                }}
                job={deliveryNoteJob}
              />
            </div>
          )
        ) : null}
      </SidePanel>

      <Modal
        open={Boolean(printPreview && printPreview.kind !== "delivery-note")}
        title={printPreview ? t(printTitleKey(printPreview.kind)) : t("orders.printPreview.title")}
        description={t("orders.printPreview.description")}
        onClose={() => setPrintPreview(null)}
        closeLabel={t("orders.printPreview.closeLabel")}
        size="md"
        footer={<><Button type="button" variant="outline" onClick={() => setPrintPreview(null)}>{t("common.close")}</Button><Button type="button" onClick={() => window.print()}>{t("orders.printPreview.print")}</Button></>}
      >
        {printPreview && printPreview.kind !== "delivery-note" ? <div className="order-print-preview">
          <img
            className="order-print-logo"
            src={getDocumentLogoPath(
              printPreview.order.channelName,
              printPreview.order.shopifyStoreDomain,
            )}
            alt={getBrandLogoAlt(
              printPreview.order.channelName,
              printPreview.order.shopifyStoreDomain,
            )}
          />
          <p className="order-print-reference"><strong>{t("orders.printPreview.order")}:</strong> {printPreview.order.orderNumber || t("common.notSet")}</p>
          <p><strong>{t("orders.printPreview.customer")}:</strong> {printPreview.order.companyName || printPreview.order.customerName || t("common.notSet")}</p>
          <p><strong>{t("orders.printPreview.address")}:</strong> {formatDeliveryAddress(
            printPreview.order.address,
            printPreview.order.shippingMethodName,
            t("common.notSet"),
          )}</p>
          <p><strong>{t("orders.printPreview.delivery")}:</strong> {printPreview.order.deliveryAt ? date.format(new Date(printPreview.order.deliveryAt)) : t("common.notSet")}</p>
          <p><strong>{t("orders.printPreview.time")}:</strong> {printPreview.order.deliveryTime || printPreview.order.shipOutTime || t("common.notSet")}</p>
          <p><strong>{t("orders.printPreview.quantity")}:</strong> {(printPreview.order.quantity ?? 0).toLocaleString(i18n.language)}</p>
          {canViewFinance ? <p><strong>{t("orders.printPreview.amount")}:</strong> {formatAmount(printPreview.order.grandTotal, printPreview.order.currency)}</p> : null}
        </div> : null}
      </Modal>
    </section>
  );
}

function splitQueryValues(value: string | null) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function setOptionalParam(params: URLSearchParams, name: string, value: string | undefined) {
  if (value) params.set(name, value);
  else params.delete(name);
}

function printTitleKey(kind: OrderPrintKind) {
  if (kind === "delivery-note") return "orders.printPreview.deliveryNoteTitle" as const;
  if (kind === "receipt") return "orders.printPreview.receiptTitle" as const;
  return "orders.printPreview.invoiceTitle" as const;
}
