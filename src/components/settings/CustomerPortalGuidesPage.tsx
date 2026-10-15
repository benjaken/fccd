import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePenLine, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Input } from "@/components/ui/input";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { CornerNotice } from "@/components/ui/corner-notice";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { deletePortalGuide, fetchPortalGuideDrafts, savePortalGuide, type PortalGuide } from "@/lib/customer-portal-guides";
import "@/components/customer-portal.css";
import "@/lib/customer-portal-i18n";

export function CustomerPortalGuidesPage() {
  const { t } = useTranslation();
  const canEdit = useCurrentPageAccess().canAccess("settings.customer_portal.edit");
  const [guides, setGuides] = useState<PortalGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<PortalGuide | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PortalGuide | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      setGuides(await fetchPortalGuideDrafts());
    } catch {
      setLoadFailed(true);
      setError(t("portalGuides.operationFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  function open(guide: PortalGuide) {
    setEditing(guide);
    setTitle(guide.title);
    setBody(guide.body);
    setPublished(guide.isPublished !== false);
    setError("");
    setNotice("");
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deletePortalGuide(pendingDelete.slug);
      setGuides(current => current.filter(guide => guide.slug !== pendingDelete.slug));
      if (editing?.slug === pendingDelete.slug) setEditing(null);
      setNotice(t("portalGuides.deleted"));
      setPendingDelete(null);
    } catch {
      setError(t("portalGuides.operationFailed"));
    } finally {
      setDeleting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle.length > 40 || body.length > 8000) {
      setError(t("portalGuides.invalid"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      setGuides(await savePortalGuide({ slug: editing.slug, title: nextTitle, body, isPublished: published }));
      setEditing(null);
      setNotice(t("portalGuides.saved"));
    } catch {
      setError(t("portalGuides.operationFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="orders-page customer-portal-ops">
      <div className="portal-ops-list-intro">
        <header className="page-heading orders-heading">
          <div>
            <h1>{t("portalGuides.title")}</h1>
            <p>{t("portalGuides.description")}</p>
          </div>
        </header>
        {notice ? <CornerNotice message={notice} onDismiss={() => setNotice("")} /> : null}
        {error && !loadFailed ? <p className="portal-ops-alert" role="alert">{error}</p> : null}
      </div>
      <article className="panel orders-panel orders-panel-no-toolbar">
        {loadFailed ? (
          <div className="orders-state orders-state-error" role="alert">
            <FilePenLine />
            <div><strong>{error}</strong></div>
            <Button variant="outline" onClick={() => void load()}><RefreshCw />{t("portal.retry")}</Button>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            loading={loading}
            loadingLabel={t("portalGuides.loading")}
            skeletonColumns={3}
            skeletonRows={5}
            onRefresh={load}
            header={<tr>
              <th>{t("portalGuides.titleField")}</th>
              <th>{t("portalGuides.published")}</th>
              <th className="table-actions-cell">{t("orders.columns.actions")}</th>
            </tr>}
          >
            {guides.map(guide => (
              <tr key={guide.slug}>
                <td>{guide.title}</td>
                <td>{guide.isPublished === false ? t("portalGuides.hidden") : t("portalGuides.visible")}</td>
                <td className="table-actions-cell">
                  {canEdit ? (
                    <div className="order-row-actions quote-row-actions">
                      <button type="button" onClick={() => open(guide)} aria-label={t("portalGuides.edit")} title={t("portalGuides.edit")}>
                        <Pencil aria-hidden="true" />
                      </button>
                      <button type="button" className="is-row-delete" disabled={deleting} onClick={() => setPendingDelete(guide)} aria-label={t("portalGuides.delete")} title={t("portalGuides.delete")}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </ListTable>
        )}
        <TablePagination
          summary={loading || loadFailed ? "" : t("settings.pagination", { from: guides.length ? 1 : 0, to: guides.length, total: guides.length })}
          page={1}
          totalPages={1}
          loading={loading}
          onPrevious={() => undefined}
          onNext={() => undefined}
          onPageChange={() => undefined}
          previousLabel={t("settings.previous")}
          nextLabel={t("settings.next")}
          pageLabel={t("orders.pageOf")}
          jumpLabel={t("orders.jumpToPage")}
        />
      </article>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("portalGuides.deleteTitle", { name: pendingDelete?.title ?? "" })}
        description={t("portalGuides.deleteDescription")}
        confirmLabel={t("portalGuides.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        variant="destructive"
        busy={deleting}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => void confirmDelete()}
      />
      <SidePanel
        half
        open={Boolean(editing)}
        onClose={() => { if (!saving) setEditing(null); }}
        title={t("portalGuides.edit")}
        closeLabel={t("portal.closeMenu")}
        footer={<Button type="submit" form="portal-guide-form" disabled={saving}>{t("portal.save")}</Button>}
      >
        {error ? <p role="alert">{error}</p> : null}
        <form id="portal-guide-form" className="portal-guide-form" onSubmit={event => void submit(event)}>
          <label>
            {t("portalGuides.titleField")}
            <Input value={title} maxLength={40} onChange={event => setTitle(event.target.value)} />
          </label>
          <div className="portal-guide-content-field">
            <span>{t("portalGuides.body")}</span>
            <RichTextEditor value={body} onChange={setBody} label={t("portalGuides.body")} disabled={saving} />
          </div>
          <label className="portal-guide-publish">
            <Switch checked={published} onCheckedChange={setPublished} />
            {t("portalGuides.published")}
          </label>
        </form>
      </SidePanel>
    </section>
  );
}
