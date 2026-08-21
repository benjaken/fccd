import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, FileImage, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  createQuotePdfPage,
  deleteQuotePdfPage,
  fetchQuotePdfBrands,
  fetchQuotePdfPages,
  QUOTE_PDF_PAGE_ACCEPT,
  QUOTE_PDF_PAGES_PAGE_SIZE,
  updateQuotePdfPage,
  type QuotePdfBrand,
  type QuotePdfPage,
  type QuotePdfPagePlacement,
} from "@/lib/quote-pdf-pages";

type PageLoader = typeof fetchQuotePdfPages;
type BrandLoader = typeof fetchQuotePdfBrands;

const SKELETON_COLUMNS = [
  { width: "4rem" },
  { width: "8rem" },
  { width: "45%" },
  { width: "6rem" },
  { width: "5rem", variant: "badge" as const },
  { width: "8rem" },
];

type PageForm = {
  channelId: string;
  placement: QuotePdfPagePlacement;
  title: string;
  sortOrder: string;
  isActive: boolean;
  file: File | null;
};

function emptyForm(channelId: string): PageForm {
  return {
    channelId,
    placement: "front",
    title: "",
    sortOrder: "0",
    isActive: true,
    file: null,
  };
}

export function QuotePdfPagesSettingsPage({
  loadBrands = fetchQuotePdfBrands,
  loadPages = fetchQuotePdfPages,
  createPage = createQuotePdfPage,
  updatePage = updateQuotePdfPage,
  removePage = deleteQuotePdfPage,
}: {
  loadBrands?: BrandLoader;
  loadPages?: PageLoader;
  createPage?: typeof createQuotePdfPage;
  updatePage?: typeof updateQuotePdfPage;
  removePage?: typeof deleteQuotePdfPage;
}) {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canManage = access.canManage("quotes.pdf_pages");
  const [brands, setBrands] = useState<QuotePdfBrand[]>([]);
  const [placement, setPlacement] = useState<QuotePdfPagePlacement | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<QuotePdfPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<QuotePdfPage | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<PageForm>(emptyForm(""));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / QUOTE_PDF_PAGES_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * QUOTE_PDF_PAGES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * QUOTE_PDF_PAGES_PAGE_SIZE, total);

  useEffect(() => {
    let active = true;
    void loadBrands()
      .then((rows) => {
        if (!active) return;
        setBrands(rows);
      })
      .catch(() => {
        if (active) setError("brands");
      });
    return () => {
      active = false;
    };
  }, [loadBrands]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadPages({ page, placement });
      setItems(result.items);
      setTotal(result.total);
      if (page > Math.max(1, Math.ceil(result.total / QUOTE_PDF_PAGES_PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(result.total / QUOTE_PDF_PAGES_PAGE_SIZE)));
      }
    } catch {
      setItems([]);
      setTotal(0);
      setError("pages");
    } finally {
      setLoading(false);
    }
  }, [loadPages, page, placement, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextSortOrder = useMemo(
    () => (items.length ? Math.max(...items.map((item) => item.sortOrder)) + 1 : 1),
    [items],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(brands[0]?.id || ""), sortOrder: String(nextSortOrder) });
    setFormError(null);
    setPanelOpen(true);
  };

  const openEdit = (item: QuotePdfPage) => {
    setEditing(item);
    setForm({
      channelId: item.channelId,
      placement: item.placement,
      title: item.title,
      sortOrder: String(item.sortOrder),
      isActive: item.isActive,
      file: null,
    });
    setFormError(null);
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (submitting) return;
    setPanelOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sortOrder = Number.parseInt(form.sortOrder, 10);
    if (!form.channelId || !form.title.trim() || !Number.isFinite(sortOrder)) {
      setFormError(t("quotes.pdfPages.validation.required"));
      return;
    }
    if (!editing && !form.file) {
      setFormError(t("quotes.pdfPages.validation.fileRequired"));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updatePage(editing.id, {
          channelId: form.channelId,
          placement: form.placement,
          title: form.title,
          sortOrder,
          isActive: form.isActive,
        });
      } else if (form.file) {
        await createPage({
          channelId: form.channelId,
          placement: form.placement,
          title: form.title,
          sortOrder,
          isActive: form.isActive,
          file: form.file,
        });
      }
      setPanelOpen(false);
      setEditing(null);
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "";
      const key = code === "quote_pdf_page_too_large"
        ? "tooLarge"
        : code === "quote_pdf_page_type_not_allowed"
          ? "typeNotAllowed"
          : "saveFailed";
      setFormError(t(`quotes.pdfPages.validation.${key}`));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: QuotePdfPage) => {
    if (!window.confirm(t("quotes.pdfPages.deleteConfirm", { title: item.title }))) return;
    setDeletingId(item.id);
    setError(null);
    try {
      await removePage(item);
      setReloadKey((key) => key + 1);
    } catch {
      setError("delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="orders-page quote-pdf-pages-settings-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("quotes.eyebrow")}</span>
          <h1>{t("quotes.pdfPages.title")}</h1>
          <p>{t("quotes.pdfPages.description")}</p>
        </div>
        {canManage ? (
          <Button onClick={openCreate} disabled={!brands.length}>
            <Plus />
            {t("quotes.pdfPages.create")}
          </Button>
        ) : null}
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar quote-pdf-pages-toolbar">
          <label className="orders-status-filter">
            <span>{t("quotes.pdfPages.placement")}</span>
            <select
              value={placement}
              onChange={(event) => {
                setPage(1);
                setPlacement(event.target.value as QuotePdfPagePlacement | "");
              }}
            >
              <option value="">{t("quotes.pdfPages.allPlacements")}</option>
              <option value="front">{t("quotes.pdfPages.front")}</option>
              <option value="back">{t("quotes.pdfPages.back")}</option>
            </select>
          </label>
          <Button variant="outline" size="icon" onClick={() => setReloadKey((key) => key + 1)} aria-label={t("quotes.pdfPages.refresh")}>
            <RefreshCw />
          </Button>
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <FileImage />
            <div>
              <strong>{t("quotes.pdfPages.loadError")}</strong>
              <span>{t("quotes.pdfPages.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />{t("quotes.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <FileImage />
            <div>
              <strong>{t("quotes.pdfPages.empty")}</strong>
              <span>{t("quotes.pdfPages.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap quote-pdf-pages-table"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("quotes.pdfPages.loading")}
            skeletonRows={QUOTE_PDF_PAGES_PAGE_SIZE}
            skeletonColumns={SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("quotes.pdfPages.columns.preview")}</th>
                <th>{t("quotes.pdfPages.columns.brand")}</th>
                <th>{t("quotes.pdfPages.columns.title")}</th>
                <th>{t("quotes.pdfPages.columns.placement")}</th>
                <th>{t("quotes.pdfPages.columns.order")}</th>
                <th>{t("quotes.pdfPages.columns.status")}</th>
                <th aria-label={t("quotes.pdfPages.columns.actions")} />
              </tr>
            }
          >
            {items.map((item) => (
              <tr key={item.id}>
                <td><img className="quote-pdf-page-thumbnail" src={item.previewUrl} alt="" /></td>
                <td>{item.channelName}</td>
                <td><strong>{item.title}</strong><small>{item.originalFilename}</small></td>
                <td><span className={`status-badge ${item.placement === "front" ? "blue" : "gray"}`}>{t(`quotes.pdfPages.${item.placement}`)}</span></td>
                <td>{item.sortOrder}</td>
                <td><span className={`status-badge ${item.isActive ? "green" : "gray"}`}>{t(item.isActive ? "quotes.pdfPages.active" : "quotes.pdfPages.inactive")}</span></td>
                <td>
                  <div className="table-actions">
                    <Button variant="ghost" size="icon" onClick={() => window.open(item.previewUrl, "_blank", "noopener,noreferrer")} aria-label={t("quotes.pdfPages.previewAction", { title: item.title })}><Eye /></Button>
                    {canManage ? <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label={t("quotes.pdfPages.editAction", { title: item.title })}><Pencil /></Button> : null}
                    {canManage ? <Button variant="ghost" size="icon" disabled={deletingId === item.id} onClick={() => void remove(item)} aria-label={t("quotes.pdfPages.deleteAction", { title: item.title })}><Trash2 /></Button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("quotes.pagination", { from: visibleFrom, to: visibleTo, total })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          previousLabel={t("quotes.previous")}
          nextLabel={t("quotes.next")}
          pageLabel={t("quotes.pageOf")}
          jumpLabel={t("quotes.jumpToPage")}
          onPageChange={setPage}
        />
      </article>

      <SidePanel
        open={panelOpen}
        title={t(editing ? "quotes.pdfPages.editTitle" : "quotes.pdfPages.createTitle")}
        description={t("quotes.pdfPages.formDescription")}
        onClose={closePanel}
        closeLabel={t("quotes.pdfPages.close")}
        footer={
          <>
            <Button variant="outline" onClick={closePanel} disabled={submitting}>{t("quotes.pdfPages.cancel")}</Button>
            <Button type="submit" form="quote-pdf-page-form" disabled={submitting}>{t(submitting ? "quotes.pdfPages.saving" : "quotes.pdfPages.save")}</Button>
          </>
        }
      >
        <form id="quote-pdf-page-form" className="quote-pdf-page-form" onSubmit={(event) => void submit(event)}>
          <label><span>{t("quotes.pdfPages.brand")}</span><select value={form.channelId} onChange={(event) => setForm((current) => ({ ...current, channelId: event.target.value }))}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label><span>{t("quotes.pdfPages.fields.title")}</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label><span>{t("quotes.pdfPages.placement")}</span><select value={form.placement} onChange={(event) => setForm((current) => ({ ...current, placement: event.target.value as QuotePdfPagePlacement }))}><option value="front">{t("quotes.pdfPages.front")}</option><option value="back">{t("quotes.pdfPages.back")}</option></select></label>
          <label><span>{t("quotes.pdfPages.fields.order")}</span><input type="number" min="0" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} /></label>
          {!editing ? <label><span>{t("quotes.pdfPages.fields.file")}</span><input type="file" accept={QUOTE_PDF_PAGE_ACCEPT} onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} /><small>{t("quotes.pdfPages.fields.fileHint")}</small></label> : null}
          <label className="quote-pdf-page-active-field"><span><strong>{t("quotes.pdfPages.fields.active")}</strong><small>{t("quotes.pdfPages.fields.activeHint")}</small></span><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} aria-label={t("quotes.pdfPages.fields.active")} /></label>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        </form>
      </SidePanel>
    </section>
  );
}
