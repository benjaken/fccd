import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, MapPinned, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import {
  archiveDeliveryDistrict,
  createDeliveryDistrict,
  DELIVERY_DISTRICTS_PAGE_SIZE,
  fetchDeliveryDistricts,
  updateDeliveryDistrict,
  type DeliveryDistrict,
  type DeliveryDistrictWriteInput,
} from "@/lib/delivery-districts";

const SKELETON_COLUMNS = [
  { width: "72%" },
  { width: "4.5rem", variant: "action" as const },
];

export function DeliveryDistrictsPage({
  loadDistricts = fetchDeliveryDistricts,
  createDistrict = createDeliveryDistrict,
  updateDistrict = updateDeliveryDistrict,
  archiveDistrict = archiveDeliveryDistrict,
}: {
  loadDistricts?: typeof fetchDeliveryDistricts;
  createDistrict?: typeof createDeliveryDistrict;
  updateDistrict?: typeof updateDeliveryDistrict;
  archiveDistrict?: typeof archiveDeliveryDistrict;
}) {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.districts.edit");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DeliveryDistrict[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<DeliveryDistrict | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<DeliveryDistrict | null>(null);
  const [archiving, setArchiving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / DELIVERY_DISTRICTS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * DELIVERY_DISTRICTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * DELIVERY_DISTRICTS_PAGE_SIZE, total);
  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadDistricts({ page, search });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError(t("settings.districts.loadError"));
    } finally {
      setLoading(false);
    }
  }, [loadDistricts, page, reloadKey, search, t]);

  useEffect(() => { void loadPage(); }, [loadPage]);
  const openEditor = (district: DeliveryDistrict | null) => {
    setEditor(district);
    setName(district?.name ?? "");
    setSaveError("");
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(undefined);
    setSaveError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setSaveError(t("settings.districts.validation"));
      return;
    }
    const input: DeliveryDistrictWriteInput = { name };
    setSaving(true);
    setSaveError("");
    try {
      if (editor) await updateDistrict(editor.ids, input);
      else await createDistrict(input);
      setEditor(undefined);
      setReloadKey((value) => value + 1);
    } catch {
      setSaveError(t("settings.districts.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveDistrict(archiveTarget.ids);
      setArchiveTarget(null);
      setReloadKey((value) => value + 1);
    } catch {
      setError(t("settings.districts.archiveError"));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <section className="orders-page settings-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.districts.title")}</h1>
          <p>{t("settings.districts.description")}</p>
        </div>
        {canEdit ? <Button onClick={() => openEditor(null)}><Plus />{t("settings.districts.add")}</Button> : null}
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="delivery-district-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => { setPage(1); setSearch(draftSearch.trim()); }}
            label={t("settings.districts.search")}
            placeholder={t("settings.districts.searchPlaceholder")}
            submitLabel={t("settings.districts.searchAction")}
          />
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <MapPinned />
            <div><strong>{error}</strong><span>{t("settings.districts.loadErrorDescription")}</span></div>
            <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />{t("settings.retry")}</Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state"><MapPinned /><div><strong>{t("settings.districts.empty")}</strong><span>{t("settings.districts.emptyDescription")}</span></div></div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((value) => value + 1)}
            loading={loading}
            loadingLabel={t("settings.districts.loading")}
            skeletonRows={DELIVERY_DISTRICTS_PAGE_SIZE}
            skeletonColumns={canEdit ? SKELETON_COLUMNS : SKELETON_COLUMNS.slice(0, -1)}
            header={<tr><th>{t("settings.districts.columns.name")}</th>{canEdit ? <th aria-label={t("settings.districts.columns.actions")} /> : null}</tr>}
          >
            {items.map((district) => (
              <tr key={district.id}>
                <td><strong>{district.name}</strong></td>
                {canEdit ? <td className="table-actions-cell"><div className="table-row-actions"><Button size="icon" variant="outline" aria-label={t("settings.districts.edit")} onClick={() => openEditor(district)}><Pencil /></Button><Button size="icon" variant="destructive" aria-label={t("settings.districts.archive")} onClick={() => setArchiveTarget(district)}><Trash2 /></Button></div></td> : null}
              </tr>
            ))}
          </ListTable>
        )}

        <footer className="orders-pagination"><span>{t("settings.pagination", { from: visibleFrom, to: visibleTo, total })}</span><div><Button variant="outline" size="icon" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label={t("settings.previous")}><ChevronLeft /></Button><strong>{page} / {totalPages}</strong><Button variant="outline" size="icon" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label={t("settings.next")}><ChevronRight /></Button></div></footer>
      </article>

      <SidePanel open={editor !== undefined} title={editor ? t("settings.districts.editTitle") : t("settings.districts.addTitle")} onClose={closeEditor} closeLabel={t("common.close")} footer={<><Button type="button" variant="outline" onClick={closeEditor}>{t("common.cancel")}</Button><Button type="submit" form="delivery-district-form" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button></>}>
        <form id="delivery-district-form" className="ingredients-form" onSubmit={(event) => void submit(event)}>
          <label className="ingredients-field"><span>{t("settings.districts.fields.name")}</span><input value={name} required onChange={(event) => setName(event.target.value)} /></label>
          {saveError ? <p role="alert">{saveError}</p> : null}
        </form>
      </SidePanel>

      <ConfirmDialog open={Boolean(archiveTarget)} title={t("settings.districts.archiveTitle")} description={t("settings.districts.archiveDescription", { name: archiveTarget?.name ?? "" })} confirmLabel={t("settings.districts.archiveConfirm")} cancelLabel={t("common.cancel")} closeLabel={t("common.close")} variant="destructive" busy={archiving} busyLabel={t("settings.districts.archiving")} onCancel={() => !archiving && setArchiveTarget(null)} onConfirm={() => void confirmArchive()} />
    </section>
  );
}
