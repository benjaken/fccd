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
import { Switch } from "@/components/ui/switch";
import { enquiryFormEditorPath, enquiryPublicPath, NEW_ENQUIRY_FORM_ID } from "@/lib/enquiry-form";
import {
  deleteEnquiryForm,
  duplicateEnquiryForm,
  fetchEnquiryForms,
  setEnquiryFormStatus,
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

export function EnquiryFormsListPage({
  canManage = false,
  loadForms = fetchEnquiryForms,
  duplicateForm = duplicateEnquiryForm,
  deleteForm = deleteEnquiryForm,
  setFormStatus = setEnquiryFormStatus,
}: {
  canManage?: boolean;
  loadForms?: () => Promise<EnquiryFormListItem[]>;
  duplicateForm?: typeof duplicateEnquiryForm;
  deleteForm?: typeof deleteEnquiryForm;
  setFormStatus?: typeof setEnquiryFormStatus;
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
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
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

  const editTo = (id: string) => enquiryFormEditorPath(id, nav);

  const createNewForm = () => {
    navigate(editTo(NEW_ENQUIRY_FORM_ID));
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

  const togglePublished = async (item: EnquiryFormListItem, enabled: boolean) => {
    const nextStatus = enabled ? "published" : "disabled";
    if (item.status === nextStatus) return;
    if (enabled && item.questionCount === 0) {
      setActionError(t("quotes.enableFormNeedQuestions"));
      return;
    }
    const previous = item.status;
    setTogglingId(item.id);
    setActionError(null);
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row)),
    );
    try {
      await setFormStatus(item.id, nextStatus);
    } catch {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, status: previous } : row)),
      );
      setActionError(t("quotes.enableFormError"));
    } finally {
      setTogglingId(null);
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
      if (code === "enquiry_form_has_submissions") {
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
                <Button type="button" onClick={createNewForm}>
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
                <th>{t("quotes.enquiryEnabled")}</th>
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
                  <DetailLink className="order-link" to={editTo(item.id)}>{item.internalName}</DetailLink>
                </td>
                <td>{item.publicTitle}</td>
                <td>
                  <div className="enquiry-status-cell">
                    <Switch
                      checked={item.status === "published"}
                      disabled={!canManage || togglingId === item.id}
                      onCheckedChange={(enabled) => void togglePublished(item, enabled)}
                      aria-label={t(
                        item.status === "published" ? "quotes.toggleFormOff" : "quotes.toggleFormOn",
                        { name: item.internalName },
                      )}
                    />
                    <span>
                      {item.status === "published" ? t("quotes.enquiryEnabled") : t("quotes.enquiryDisabled")}
                    </span>
                  </div>
                </td>
                <td>{item.questionCount}</td>
                <td>
                  {item.status === "published" ? (
                    <Link className="order-link" to={enquiryPublicPath(item.id)} target="_blank" rel="noopener noreferrer">
                      {enquiryPublicPath(item.id)}
                    </Link>
                  ) : "—"}
                </td>
                <td>{new Date(item.updatedAt).toLocaleString("zh-HK")}</td>
                {canManage ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button size="icon" variant="outline" asChild>
                        <Link to={editTo(item.id)} aria-label={t("quotes.actions.edit")} title={t("quotes.actions.edit")}>
                          <Pencil />
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("quotes.actions.copy")}
                        title={t("quotes.actions.copy")}
                        disabled={copyingId === item.id}
                        onClick={() => void copyForm(item)}
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={`${t("quotes.actions.delete")} ${item.internalName}`}
                        title={t("quotes.actions.delete")}
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 />
                      </Button>
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
