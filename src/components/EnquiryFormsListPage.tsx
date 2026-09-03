import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import {
  createEnquiryForm,
  deleteEnquiryForm,
  duplicateEnquiryForm,
  fetchEnquiryForms,
  type EnquiryFormListItem,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

const FORM_SKELETON_COLUMNS = [
  { width: "12rem" },
  { width: "22%" },
  { width: "5rem", variant: "badge" as const },
  { width: "4rem" },
  { width: "12rem" },
  { width: "10rem" },
  { width: "4.5rem", variant: "action" as const },
];

function statusLabel(status: EnquiryFormListItem["status"]) {
  if (status === "published") return "已發佈";
  if (status === "disabled") return "已停用";
  return "草稿";
}

export function EnquiryFormsListPage({
  canManage = false,
  loadForms = fetchEnquiryForms,
  createForm = createEnquiryForm,
  duplicateForm = duplicateEnquiryForm,
  deleteForm = deleteEnquiryForm,
}: {
  canManage?: boolean;
  loadForms?: () => Promise<EnquiryFormListItem[]>;
  createForm?: typeof createEnquiryForm;
  duplicateForm?: typeof duplicateEnquiryForm;
  deleteForm?: typeof deleteEnquiryForm;
} = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<EnquiryFormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnquiryFormListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nav = searchParams.get("nav");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadForms());
    } catch {
      setItems([]);
      setError("無法載入表單列表");
    } finally {
      setLoading(false);
    }
  }, [loadForms, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.internalName, item.publicTitle, item.slug].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    );
  }, [items, search]);

  const editTo = (id: string) =>
    `/quotes/enquiry-forms/${id}/edit${nav ? `?nav=${encodeURIComponent(nav)}` : ""}`;

  const createNewForm = async () => {
    setCreating(true);
    setActionError(null);
    try {
      const id = await createForm({ internalName: "未命名表單", publicTitle: "未命名表單" });
      navigate(editTo(id));
    } catch {
      setActionError("無法新增表單");
    } finally {
      setCreating(false);
    }
  };

  const copyForm = async (item: EnquiryFormListItem) => {
    setCopyingId(item.id);
    setActionError(null);
    try {
      const id = await duplicateForm(item.id);
      navigate(editTo(id));
    } catch {
      setActionError("無法複製表單");
    } finally {
      setCopyingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteForm(deleteTarget.id);
      setDeleteTarget(null);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code === "enquiry_form_default_protected") {
        setActionError(t("quotes.deleteDefaultForm"));
      } else if (code === "enquiry_form_has_submissions") {
        setActionError(t("quotes.deleteFormHasSubmissions"));
      } else {
        setActionError(t("quotes.deleteFormError"));
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="orders-page enquiry-builder-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">到會 · 報價單</span>
          <h1>Enquiry 表單</h1>
          <p>維護公開查詢表單。第一份預設表單已對照現行 EmailMeForm。</p>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="quotes-toolbar">
          <ListSearchBar
            id="enquiry-forms-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => setSearch(draftSearch.trim())}
            label={t("quotes.enquiryFormsSearch")}
            placeholder={t("quotes.enquiryFormsSearchPlaceholder")}
            submitLabel={t("quotes.searchAction")}
            actions={
              canManage ? (
                <Button type="button" disabled={creating} onClick={() => void createNewForm()}>
                  <Plus />
                  {t("quotes.createForm")}
                </Button>
              ) : null
            }
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
        ) : !loading && visible.length === 0 ? (
          <OperationalListState
            icon={FileText}
            title={items.length === 0 ? "尚未有表單" : "沒有符合的表單"}
            description={items.length === 0 ? "請新增，或確認種子表單已載入。" : "請改用其他關鍵字搜尋。"}
          />
        ) : (
          <ListTable
            className="quotes-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel="載入表單"
            skeletonColumns={canManage ? FORM_SKELETON_COLUMNS : FORM_SKELETON_COLUMNS.slice(0, -1)}
            header={
              <tr>
                <th>內部名稱</th>
                <th>公開標題</th>
                <th>狀態</th>
                <th>題目</th>
                <th>公開連結</th>
                <th>更新</th>
                {canManage ? <th aria-label={t("quotes.columns.actions")} /> : null}
              </tr>
            }
          >
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  <DetailLink to={editTo(item.id)}>{item.internalName}</DetailLink>
                </td>
                <td>{item.publicTitle}</td>
                <td className={`enquiry-status-${item.status}`}>{statusLabel(item.status)}</td>
                <td>{item.questionCount}</td>
                <td>
                  {item.status === "published" ? (
                    <Link to={item.isDefault ? "/quote-inquiry" : `/quote-inquiry/${item.slug}`} target="_blank" rel="noopener noreferrer">
                      /quote-inquiry{item.isDefault ? "" : `/${item.slug}`}
                    </Link>
                  ) : "—"}
                </td>
                <td>{new Date(item.updatedAt).toLocaleString("zh-HK")}</td>
                {canManage ? (
                  <td className="table-actions-cell">
                    <div className="order-row-actions enquiry-row-actions">
                      <Link to={editTo(item.id)} aria-label={t("quotes.actions.edit")} title={t("quotes.actions.edit")}>
                        <Pencil />
                      </Link>
                      <button
                        type="button"
                        aria-label={t("quotes.actions.copy")}
                        title={t("quotes.actions.copy")}
                        disabled={copyingId === item.id}
                        onClick={() => void copyForm(item)}
                      >
                        <Copy />
                      </button>
                      {item.isDefault ? null : (
                        <button
                          type="button"
                          aria-label={t("quotes.actions.delete")}
                          title={t("quotes.actions.delete")}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}
      </article>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("quotes.deleteFormTitle")}
        description={t("quotes.deleteFormDescription", { name: deleteTarget?.internalName ?? "" })}
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
