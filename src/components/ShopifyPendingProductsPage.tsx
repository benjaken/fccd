import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, History, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchShopifyPendingItems,
  fetchShopifyStores,
  fetchShopifySyncRuns,
  SHOPIFY_PENDING_PAGE_SIZE,
  startShopifyCatalogSync,
  type ShopifyPendingItem,
  type ShopifyStoreOption,
  type ShopifySyncMode,
  type ShopifySyncRun,
} from "@/lib/shopify-product-approvals";

function syncModeKey(run: ShopifySyncRun): string {
  if (run.mode === "specific_product") return run.runCount > 1 ? "specificBatch" : "specific";
  if (run.mode === "retry_failed") return "retry";
  return run.mode;
}

function ShopifySyncLogPanel({
  open,
  runs,
  loading,
  date,
  onClose,
}: {
  open: boolean;
  runs: ShopifySyncRun[];
  loading: boolean;
  date: Intl.DateTimeFormat;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SidePanel
      open={open}
      wide
      className="shopify-sync-log-panel"
      title={t("shopifyCatalog.syncLogTitle")}
      description={t("shopifyCatalog.syncLogDescription")}
      closeLabel={t("common.close")}
      onClose={onClose}
    >
      <div className="shopify-sync-log-list" aria-busy={loading}>
        {!loading && runs.length === 0 ? <p className="shopify-sync-log-empty">{t("shopifyCatalog.noSyncLogs")}</p> : null}
        {runs.map((run) => (
          <article className="shopify-sync-log-item" key={run.id}>
            <header>
              <div>
                <strong>{run.storeDomain ?? t("shopifyCatalog.allStores")}</strong>
                <span>{t(`shopifyCatalog.modes.${syncModeKey(run)}`, { count: run.runCount })}</span>
              </div>
              <span className={`status-badge shopify-sync-run-${run.status}`}>
                {t(`shopifyCatalog.runStatus.${run.status}`, { defaultValue: run.status })}
              </span>
            </header>
            <dl className="shopify-sync-log-counts">
              <div><dt>{t("shopifyCatalog.syncCounts.fetched")}</dt><dd>{run.totalFetched}</dd></div>
              <div><dt>{t("shopifyCatalog.syncCounts.products")}</dt><dd>{run.products}</dd></div>
              <div><dt>{t("shopifyCatalog.syncCounts.packages")}</dt><dd>{run.packages}</dd></div>
              <div><dt>{t("shopifyCatalog.syncCounts.pending")}</dt><dd>{run.pending}</dd></div>
              <div><dt>{t("shopifyCatalog.syncCounts.conflicts")}</dt><dd>{run.conflicts}</dd></div>
              <div><dt>{t("shopifyCatalog.syncCounts.failed")}</dt><dd>{run.failed}</dd></div>
            </dl>
            {run.errors.length ? (
              <div className="shopify-sync-log-errors">
                {run.errors.map((item, index) => (
                  <div key={`${item.code}-${item.createdAt}-${index}`}>
                    <AlertTriangle />
                    <span>
                      <strong>{item.code}</strong>
                      {item.message && item.message !== item.code ? <small>{item.message}</small> : null}
                      {item.shopifyProductId ? <small>Shopify Product #{item.shopifyProductId}</small> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <footer>
              <span>{t("shopifyCatalog.startedAt")}: {date.format(new Date(run.createdAt))}</span>
              <span>{t("shopifyCatalog.finishedAt")}: {run.finishedAt ? date.format(new Date(run.finishedAt)) : "—"}</span>
            </footer>
          </article>
        ))}
      </div>
    </SidePanel>
  );
}

export function ShopifyPendingProductsPage({ canManage = false }: { canManage?: boolean }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<ShopifyPendingItem[]>([]);
  const [stores, setStores] = useState<ShopifyStoreOption[]>([]);
  const [runs, setRuns] = useState<ShopifySyncRun[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState("");
  const [catalogType, setCatalogType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<ShopifySyncMode>("incremental");
  const [syncStoreId, setSyncStoreId] = useState("");
  const [productId, setProductId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncLogOpen, setSyncLogOpen] = useState(false);
  const pages = Math.max(1, Math.ceil(total / SHOPIFY_PENDING_PAGE_SIZE));
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Hong_Kong" }),
    [i18n.language],
  );

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    void fetchShopifyStores().then((rows) => active && setStores(rows)).catch(() => active && setStores([]));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      fetchShopifyPendingItems({ page, search, storeId, status, catalogType }),
      fetchShopifySyncRuns(30),
    ]).then(([result, runRows]) => {
      if (!active) return;
      setItems(result.items);
      setTotal(result.total);
      setRuns(runRows);
    }).catch(() => active && setError(t("shopifyCatalog.loadError")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [page, search, storeId, status, catalogType, reloadKey, t]);

  const runSync = async () => {
    const numericProductId = productId.trim() ? Number(productId) : undefined;
    if (syncMode === "specific_product" && (!Number.isSafeInteger(numericProductId) || Number(numericProductId) <= 0)) {
      setSyncError(t("shopifyCatalog.productIdRequired"));
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      await startShopifyCatalogSync({ mode: syncMode, storeId: syncStoreId || undefined, productId: numericProductId });
      setSyncDialogOpen(false);
      reload();
    } catch {
      setSyncError(t("shopifyCatalog.syncError"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="shopify-catalog-page shopify-catalog-list-page">
      <header className="page-heading shopify-catalog-heading">
        <div>
          <span className="eyebrow">Shopify</span>
          <h1>{t("shopifyCatalog.title")}</h1>
        </div>
      </header>
      <article className="panel shopify-catalog-table-panel">
        <header className="shopify-catalog-toolbar">
          <ListSearchBar
            id="shopify-product-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => { setPage(1); setSearch(draftSearch.trim()); }}
            label={t("shopifyCatalog.search")}
            placeholder={t("shopifyCatalog.searchPlaceholder")}
            submitLabel={t("shopifyCatalog.searchAction")}
            filtersAlwaysInDrawer
            filtersActive={Boolean(storeId || status || catalogType)}
            filtersTitle={t("common.filters")}
            filters={
              <div className="shopify-catalog-filter-fields">
                <label><span>{t("shopifyCatalog.store")}</span><FilterableSelect value={storeId} onChange={(event) => { setPage(1); setStoreId(event.target.value); }}><option value="">{t("shopifyCatalog.allStores")}</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.domain}</option>)}</FilterableSelect></label>
                <label><span>{t("shopifyCatalog.status")}</span><FilterableSelect value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">{t("shopifyCatalog.actionable")}</option>{["pending", "change_pending", "dependency_pending", "conflict", "approved", "rejected", "ignored", "deleted"].map((value) => <option key={value} value={value}>{t(`shopifyCatalog.statuses.${value}`)}</option>)}</FilterableSelect></label>
                <label><span>{t("shopifyCatalog.type")}</span><FilterableSelect value={catalogType} onChange={(event) => { setPage(1); setCatalogType(event.target.value); }}><option value="">{t("shopifyCatalog.allTypes")}</option>{["product", "fixed_package", "configurable_package"].map((value) => <option key={value} value={value}>{t(`shopifyCatalog.types.${value}`)}</option>)}</FilterableSelect></label>
              </div>
            }
          />
          <div className="shopify-catalog-toolbar-actions">
            {canManage ? (
              <Button onClick={() => { setSyncError(null); setSyncDialogOpen(true); }} disabled={syncing}>
                {syncing ? t("shopifyCatalog.syncing") : t("shopifyCatalog.sync")}
              </Button>
            ) : null}
          </div>
        </header>
        {error ? (
          <div className="products-state products-state-error" role="alert">
            <AlertTriangle />
            <span>{error}</span>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="products-state products-state-empty">
            <ShoppingBag />
            <strong>{t("shopifyCatalog.empty")}</strong>
          </div>
        ) : (
          <div className="shopify-catalog-table-block">
            <ListTable
              className="shopify-catalog-table-wrap"
              onRefresh={reload}
              loading={loading}
              loadingLabel={t("shopifyCatalog.loading")}
              skeletonColumns={9}
              header={<tr><th aria-label="#" /><th>{t("shopifyCatalog.store")}</th><th>{t("shopifyCatalog.product")}</th><th>{t("shopifyCatalog.type")}</th><th>SKU</th><th>{t("shopifyCatalog.variants")}</th><th>{t("shopifyCatalog.status")}</th><th>{t("shopifyCatalog.issues")}</th><th>{t("shopifyCatalog.receivedAt")}</th></tr>}
            >
              {items.map((item, index) => <tr key={item.id} className="table-row-clickable"><td className="shopify-catalog-index-cell">{(page - 1) * SHOPIFY_PENDING_PAGE_SIZE + index + 1}</td><td>{item.storeDomain}</td><td><Link className="order-link" to={`/products/shopify-pending/${item.id}`}><strong>{item.title}</strong><small>#{item.shopifyProductId}</small></Link></td><td>{t(`shopifyCatalog.types.${item.catalogType}`)}</td><td><span className="shopify-catalog-sku-list" title={item.skus.join(", ") || undefined}>{item.skus.join(", ") || "—"}</span></td><td>{item.variantCount}</td><td><span className={`status-badge shopify-status-${item.status}`}>{t(`shopifyCatalog.statuses.${item.status}`)}</span></td><td>{item.blockingReasons.length ? <span className="shopify-warning"><AlertTriangle />{item.blockingReasons.join(", ")}</span> : "—"}</td><td>{date.format(new Date(item.updatedAt))}</td></tr>)}
            </ListTable>
          </div>
        )}
        <TablePagination summary={t("shopifyCatalog.pagination", { from: total ? (page - 1) * SHOPIFY_PENDING_PAGE_SIZE + 1 : 0, to: Math.min(page * SHOPIFY_PENDING_PAGE_SIZE, total), total })} page={page} totalPages={pages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(pages, value + 1))} onPageChange={setPage} previousLabel={t("shopifyCatalog.previous")} nextLabel={t("shopifyCatalog.next")} pageLabel={t("shopifyCatalog.pageOf")} jumpLabel={t("shopifyCatalog.jumpToPage")} />
      </article>
      <Modal
        open={syncDialogOpen}
        title={t("shopifyCatalog.syncTitle")}
        description={t("shopifyCatalog.syncDescription")}
        closeLabel={t("common.close")}
        onClose={() => setSyncDialogOpen(false)}
        className="shopify-sync-modal"
        footer={
          <>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)} disabled={syncing}>{t("common.cancel")}</Button>
            <Button onClick={() => void runSync()} disabled={syncing}>{syncing ? t("shopifyCatalog.syncing") : t("shopifyCatalog.sync")}</Button>
          </>
        }
      >
        <div className="shopify-sync-form">
          {syncError ? <div className="shopify-sync-form-error" role="alert"><AlertTriangle />{syncError}</div> : null}
          <label>
            <span>{t("shopifyCatalog.store")}</span>
            <FilterableSelect aria-label={t("shopifyCatalog.store")} value={syncStoreId} onChange={(event) => setSyncStoreId(event.target.value)}>
              <option value="">{t("shopifyCatalog.allStores")}</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.domain}</option>)}
            </FilterableSelect>
          </label>
          <label>
            <span>{t("shopifyCatalog.syncMode")}</span>
            <select aria-label={t("shopifyCatalog.syncMode")} value={syncMode} onChange={(event) => setSyncMode(event.target.value as ShopifySyncMode)}>
              <option value="incremental">{t("shopifyCatalog.modes.incremental")}</option>
              <option value="full">{t("shopifyCatalog.modes.full")}</option>
              <option value="specific_product">{t("shopifyCatalog.modes.specific")}</option>
              <option value="retry_failed">{t("shopifyCatalog.modes.retry")}</option>
            </select>
          </label>
          {syncMode === "specific_product" ? (
            <label>
              <span>{t("shopifyCatalog.productId")}</span>
              <input aria-label={t("shopifyCatalog.productId")} placeholder={t("shopifyCatalog.productIdPlaceholder")} inputMode="numeric" value={productId} onChange={(event) => setProductId(event.target.value)} />
            </label>
          ) : null}
          <button
            type="button"
            className="shopify-sync-log-trigger shopify-sync-modal-log-trigger"
            onClick={() => { setSyncDialogOpen(false); setSyncLogOpen(true); }}
          >
            <History />
            <span>{t("shopifyCatalog.syncLogTitle")}</span>
            {runs[0] ? <small>{runs[0].storeDomain ?? t("shopifyCatalog.allStores")} · {t(`shopifyCatalog.runStatus.${runs[0].status}`, { defaultValue: runs[0].status })}</small> : null}
          </button>
        </div>
      </Modal>
      <ShopifySyncLogPanel open={syncLogOpen} runs={runs} loading={loading} date={date} onClose={() => setSyncLogOpen(false)} />
    </section>
  );
}
