import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePenLine, Pencil, RefreshCw } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Input } from "@/components/ui/input";
import { ListTable } from "@/components/ui/list-table";
import { CornerNotice } from "@/components/ui/corner-notice";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { fetchPortalGuideDrafts, savePortalGuide, type PortalGuide } from "@/lib/customer-portal-guides";
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
      <div className="portal-ops-scroll">
        {loadFailed ? (
          <div className="panel">
            <div className="orders-state orders-state-error" role="alert">
              <FilePenLine />
              <div><strong>{error}</strong></div>
              <Button variant="outline" onClick={() => void load()}><RefreshCw />{t("portal.retry")}</Button>
            </div>
          </div>
        ) : (
          <ListTable
            className="panel"
            loading={loading}
            loadingLabel={t("portalGuides.loading")}
            skeletonColumns={3}
            skeletonRows={5}
            onRefresh={load}
            header={<tr>
              <th>{t("portalGuides.titleField")}</th>
              <th>{t("portalGuides.published")}</th>
              <th />
            </tr>}
          >
            {guides.map(guide => (
              <tr key={guide.slug}>
                <td>{guide.title}</td>
                <td>{guide.isPublished === false ? t("portalGuides.hidden") : t("portalGuides.visible")}</td>
                <td>{canEdit ? <Button variant="outline" size="sm" onClick={() => open(guide)}><Pencil /> {t("portalGuides.edit")}</Button> : null}</td>
              </tr>
            ))}
          </ListTable>
        )}
      </div>
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
