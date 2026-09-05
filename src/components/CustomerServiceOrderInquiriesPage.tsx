import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, MessageCircleMore, RotateCcw, UserRoundCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchCustomerServiceOrderInquiries,
  updateCustomerServiceOrderInquiry,
  type CustomerServiceOrderInquiry,
  type CustomerServiceOrderInquiryStatus,
} from "@/lib/customer-service-order-inquiries";

import "./customer-service-order-inquiries.css";

const STATUS_OPTIONS: Array<CustomerServiceOrderInquiryStatus | ""> = [
  "", "pending", "notified", "processing", "in_progress", "failed", "resolved",
];
const PAGE_SIZE = 25;
const WATI_INBOX_URL = "https://live.wati.io/2552";

const SKELETON_COLUMNS = [
  { width: "7rem" }, { width: "9rem" }, { width: "8rem" },
  { width: "18rem" }, { width: "9rem" }, { width: "10rem" },
  { width: "12rem" }, { width: "8rem", variant: "action" as const },
];

export function CustomerServiceOrderInquiriesPage({
  canManage = false,
  loadItems = fetchCustomerServiceOrderInquiries,
  updateItem = updateCustomerServiceOrderInquiry,
  openWati = () => window.open(WATI_INBOX_URL, "_blank", "noopener,noreferrer"),
}: {
  canManage?: boolean;
  loadItems?: typeof fetchCustomerServiceOrderInquiries;
  updateItem?: typeof updateCustomerServiceOrderInquiry;
  openWati?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<CustomerServiceOrderInquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerServiceOrderInquiryStatus | "">("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [resolveTarget, setResolveTarget] = useState<CustomerServiceOrderInquiry | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Hong_Kong",
  }), [i18n.language]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadItems({
        status: status || null,
        search,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError(t("customerServiceOrderInquiries.loadError"));
    } finally {
      setLoading(false);
    }
  }, [loadItems, page, reloadKey, search, status, t]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (
    item: CustomerServiceOrderInquiry,
    action: "claim" | "reopen",
  ) => {
    if (!canManage || busyId) return;
    setBusyId(item.id);
    setActionError("");
    try {
      await updateItem(item.id, action);
      setReloadKey((value) => value + 1);
      if (action === "claim") openWati();
    } catch (cause) {
      console.error("customer service order inquiry status update failed", cause);
      setActionError(t("customerServiceOrderInquiries.actionError"));
    } finally {
      setBusyId("");
    }
  };

  const resolve = async () => {
    if (!resolveTarget || !resolutionNote.trim() || busyId) return;
    setBusyId(resolveTarget.id);
    setActionError("");
    try {
      await updateItem(resolveTarget.id, "resolve", resolutionNote);
      setResolveTarget(null);
      setResolutionNote("");
      setReloadKey((value) => value + 1);
    } catch (cause) {
      console.error("customer service order inquiry resolution failed", cause);
      setActionError(t("customerServiceOrderInquiries.actionError"));
    } finally {
      setBusyId("");
    }
  };

  const statusLabel = (value: CustomerServiceOrderInquiryStatus) =>
    t(`customerServiceOrderInquiries.statuses.${value}`);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleFrom = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const visibleTo = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="orders-page customer-service-order-inquiries-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("customerServiceOrderInquiries.eyebrow")}</span>
          <h1>{t("customerServiceOrderInquiries.title")}</h1>
          <p>{t("customerServiceOrderInquiries.description")}</p>
        </div>
      </header>

      <article className="panel orders-panel customer-service-order-inquiries-panel">
        <header className="customer-service-order-inquiries-toolbar">
          <ListSearchBar
            id="customer-service-order-inquiries-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => {
              setPage(1);
              setSearch(draftSearch.trim());
            }}
            label={t("customerServiceOrderInquiries.search")}
            placeholder={t("customerServiceOrderInquiries.searchPlaceholder")}
            submitLabel={t("customerServiceOrderInquiries.searchAction")}
            filtersActive={Boolean(status)}
            filtersTitle={t("customerServiceOrderInquiries.statusFilter")}
            filters={
              <label className="customer-service-order-inquiries-filter">
                <span>{t("customerServiceOrderInquiries.statusFilter")}</span>
                <select value={status} onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value as typeof status);
                }}>
                  {STATUS_OPTIONS.map((value) => (
                    <option key={value || "all"} value={value}>
                      {value ? statusLabel(value) : t("customerServiceOrderInquiries.allStatuses")}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>

        {actionError ? <p className="list-inline-error" role="alert">{actionError}</p> : null}
        {error ? (
          <OperationalListState
            icon={MessageCircleMore}
            title={error}
            description={t("customerServiceOrderInquiries.retryDescription")}
            retryLabel={t("customerServiceOrderInquiries.retry")}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : !loading && items.length === 0 ? (
          <OperationalListState
            icon={MessageCircleMore}
            title={t("customerServiceOrderInquiries.empty")}
            description={t("customerServiceOrderInquiries.emptyDescription")}
          />
        ) : (
          <ListTable
            className="customer-service-order-inquiries-table-wrap"
            onRefresh={() => setReloadKey((value) => value + 1)}
            loading={loading}
            loadingLabel={t("customerServiceOrderInquiries.loading")}
            skeletonColumns={SKELETON_COLUMNS}
            header={<tr>
              <th>{t("customerServiceOrderInquiries.columns.status")}</th>
              <th>{t("customerServiceOrderInquiries.columns.customer")}</th>
              <th>{t("customerServiceOrderInquiries.columns.order")}</th>
              <th>{t("customerServiceOrderInquiries.columns.inquiry")}</th>
              <th>{t("customerServiceOrderInquiries.columns.received")}</th>
              <th>{t("customerServiceOrderInquiries.columns.handler")}</th>
              <th>{t("customerServiceOrderInquiries.columns.record")}</th>
              <th>{t("customerServiceOrderInquiries.columns.actions")}</th>
            </tr>}
          >
            {items.map((item) => (
              <tr key={item.id}>
                <td><span className={`customer-inquiry-status status-${item.status}`}>{statusLabel(item.status)}</span></td>
                <td><strong>{item.phone}</strong><small>{item.messageCount} {t("customerServiceOrderInquiries.messages")}</small></td>
                <td>{item.orderId && item.orderNumber ? <Link className="order-link" to={`/orders/${item.orderId}`}>{item.orderNumber}</Link> : item.orderNumber || "—"}</td>
                <td className="customer-inquiry-summary"><strong>{item.summary}</strong>{item.questions.length > 1 ? <small>{item.questions.at(-1)?.text}</small> : null}</td>
                <td>{dateFormatter.format(new Date(item.lastCustomerMessageAt))}</td>
                <td>{item.resolvedByName || item.claimedByName || "—"}</td>
                <td className="customer-inquiry-record">
                  {item.resolvedAt ? <><strong>{dateFormatter.format(new Date(item.resolvedAt))}</strong><small>{item.resolutionNote || "—"}</small></> : item.claimedAt ? <><strong>{dateFormatter.format(new Date(item.claimedAt))}</strong><small>{t("customerServiceOrderInquiries.processing")}</small></> : "—"}
                </td>
                <td className="table-actions-cell">
                  {canManage && ["pending", "processing", "notified", "failed"].includes(item.status) ? <Button size="sm" disabled={busyId === item.id} onClick={() => void runAction(item, "claim")}><UserRoundCheck />{t("customerServiceOrderInquiries.claim")}</Button> : null}
                  {canManage && item.status === "in_progress" ? <Button size="sm" disabled={busyId === item.id} onClick={() => { setResolveTarget(item); setResolutionNote(""); }}><Check />{t("customerServiceOrderInquiries.resolve")}</Button> : null}
                  {canManage && item.status === "resolved" ? <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void runAction(item, "reopen")}><RotateCcw />{t("customerServiceOrderInquiries.reopen")}</Button> : null}
                </td>
              </tr>
            ))}
          </ListTable>
        )}
        {!error && total > 0 ? (
          <TablePagination
            summary={t("customerServiceOrderInquiries.pagination", {
              from: visibleFrom,
              to: visibleTo,
              total,
            })}
            page={page}
            totalPages={totalPages}
            loading={loading}
            onPrevious={() => setPage((value) => Math.max(1, value - 1))}
            onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
            onPageChange={setPage}
            previousLabel={t("customerServiceOrderInquiries.previous")}
            nextLabel={t("customerServiceOrderInquiries.next")}
            pageLabel={t("customerServiceOrderInquiries.pageOf")}
            jumpLabel={t("customerServiceOrderInquiries.jumpToPage")}
          />
        ) : null}
      </article>

      <SidePanel
        open={Boolean(resolveTarget)}
        title={t("customerServiceOrderInquiries.resolveTitle")}
        description={t("customerServiceOrderInquiries.resolveDescription")}
        closeLabel={t("common.close")}
        onClose={() => { if (!busyId) { setResolveTarget(null); setResolutionNote(""); } }}
        footer={<>
          <Button variant="outline" disabled={Boolean(busyId)} onClick={() => { setResolveTarget(null); setResolutionNote(""); }}>{t("common.cancel")}</Button>
          <Button disabled={!resolutionNote.trim() || Boolean(busyId)} onClick={() => void resolve()}><Check />{t("customerServiceOrderInquiries.confirmResolve")}</Button>
        </>}
      >
        <label className="customer-service-order-inquiries-resolution">
          <span>{t("customerServiceOrderInquiries.resolutionNote")}</span>
          <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder={t("customerServiceOrderInquiries.resolutionNotePlaceholder")} rows={6} />
        </label>
      </SidePanel>
    </section>
  );
}
