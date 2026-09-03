import { useCallback, useEffect, useState } from "react";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import {
  deleteEnquirySubmission,
  fetchPendingEnquirySubmissions,
  type EnquirySubmissionListItem,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

const PENDING_SKELETON_COLUMNS = [
  { width: "9rem" },
  { width: "10rem" },
  { width: "16rem" },
  { width: "8rem" },
  { width: "22%" },
  { width: "4rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "4.5rem", variant: "action" as const },
];

function dash(value: string) {
  return value.trim() || "—";
}

function statusText(kind: "internal" | "ack" | "asana", value: string) {
  if (kind === "internal") {
    if (value === "sent") return "已通知";
    if (value === "failed") return "通知失敗";
    if (value === "sending") return "寄送中";
    return "尚未通知";
  }
  if (kind === "ack") {
    if (value === "sent") return "已寄出";
    if (value === "failed") return "失敗";
    if (value === "no_email") return "無電郵";
    if (value === "sending") return "寄送中";
    return "尚未寄出";
  }
  if (value === "created") return "已建立";
  if (value === "failed") return "失敗";
  return "尚未建立";
}

export function EnquiryPendingListPage({
  canManage = false,
  loadSubmissions = fetchPendingEnquirySubmissions,
  deleteSubmission = deleteEnquirySubmission,
}: {
  canManage?: boolean;
  loadSubmissions?: (search?: string) => Promise<EnquirySubmissionListItem[]>;
  deleteSubmission?: typeof deleteEnquirySubmission;
} = {}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<EnquirySubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<EnquirySubmissionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nav = searchParams.get("nav");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadSubmissions(search));
    } catch {
      setItems([]);
      setError("無法載入待報價");
    } finally {
      setLoading(false);
    }
  }, [loadSubmissions, reloadKey, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const detailTo = (id: string) =>
    `/quotes/pending/${id}${nav ? `?nav=${encodeURIComponent(nav)}` : ""}`;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteSubmission(deleteTarget.id);
      setDeleteTarget(null);
      setReloadKey((key) => key + 1);
    } catch {
      setActionError(t("quotes.deletePendingError"));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="orders-page enquiry-pending-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">到會 · 報價單</span>
          <h1>待報價</h1>
          <p>公開 Enquiry Form 提交、尚未轉成報價單的查詢。</p>
        </div>
      </header>
      <article className="panel orders-panel">
        <header className="quotes-toolbar">
          <ListSearchBar
            id="enquiry-pending-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => setSearch(draftSearch.trim())}
            label={t("quotes.pendingSearch")}
            placeholder={t("quotes.pendingSearchPlaceholder")}
            submitLabel={t("quotes.searchAction")}
          />
        </header>
        {actionError ? <p className="enquiry-list-action-error" role="alert">{actionError}</p> : null}
        {error ? (
          <OperationalListState
            icon={FileText}
            title={error}
            description="請稍後再試，或重新整理列表。"
            retryLabel="重試"
            onRetry={() => {
              setError(null);
              setReloadKey((key) => key + 1);
            }}
          />
        ) : !loading && items.length === 0 ? (
          <OperationalListState
            icon={FileText}
            title="暫無待報價查詢"
            description={search.trim() ? "請改用其他關鍵字搜尋。" : "公開表單提交後會出現在這裡。"}
          />
        ) : (
          <ListTable
            className="quotes-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel="載入待報價"
            skeletonColumns={canManage ? PENDING_SKELETON_COLUMNS : PENDING_SKELETON_COLUMNS.slice(0, -1)}
            header={
              <tr>
                <th>{t("quotes.columns.enquiryNumber")}</th>
                <th>建立時間</th>
                <th>客戶</th>
                <th>日期</th>
                <th>描述</th>
                <th>人數</th>
                <th>內部通知</th>
                <th>內部 WhatsApp</th>
                <th>對客確認</th>
                <th>Asana</th>
                {canManage ? <th aria-label={t("quotes.columns.actions")} /> : null}
              </tr>
            }
          >
            {items.map((item) => {
              const to = detailTo(item.id);
              const displayName = `${item.salutation}${item.customerName}`.trim() || item.companyName || item.formTitle;
              return (
                <tr key={item.id}>
                  <td>
                    <DetailLink className="order-link" to={to}>
                      {item.referenceCode || "—"}
                    </DetailLink>
                  </td>
                  <td>
                    {new Date(item.createdAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
                  </td>
                  <td>
                    <div>{dash(`${item.salutation}${item.customerName}`)}</div>
                    <div>{dash(item.companyName)}</div>
                    <div>{dash(item.phone)}</div>
                    <small>{item.formTitle || "Enquiry Form"}</small>
                  </td>
                  <td>{dash(item.deliveryDateRaw)}</td>
                  <td>{dash(item.quoteDescription)}</td>
                  <td>{dash(item.headcount)}</td>
                  <td>{statusText("internal", item.internalEmailStatus)}</td>
                  <td>{statusText("internal", item.internalWatiStatus)}</td>
                  <td>{statusText("ack", item.ackEmailStatus)}</td>
                  <td>
                    {item.asanaLink ? (
                      <a className="order-link" href={item.asanaLink} target="_blank" rel="noopener noreferrer">Asana Link</a>
                    ) : (
                      statusText("asana", item.asanaStatus)
                    )}
                  </td>
                  {canManage ? (
                    <td className="table-actions-cell">
                      <div className="order-row-actions quote-row-actions">
                        <Link to={to} aria-label={t("quotes.actions.edit")} title={t("quotes.actions.edit")}>
                          <Pencil />
                        </Link>
                        <button
                          type="button"
                          aria-label={`${t("quotes.actions.delete")} ${displayName}`}
                          title={t("quotes.actions.delete")}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </ListTable>
        )}
      </article>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("quotes.deletePendingTitle")}
        description={t("quotes.deletePendingDescription", {
          name: `${deleteTarget?.salutation ?? ""}${deleteTarget?.customerName ?? ""}`.trim() || deleteTarget?.companyName || "",
        })}
        confirmLabel={t("quotes.actions.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        variant="destructive"
        busy={deleting}
        busyLabel={t("quotes.actions.deleting")}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
