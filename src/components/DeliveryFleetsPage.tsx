import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, Truck } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createDeliveryFleet,
  fetchDeliveryFleets,
  updateDeliveryFleet,
  type DeliveryFleet,
} from "@/lib/delivery-fleets";

const emptyForm = {
  name: "",
  shortName: "",
  contactPerson: "",
  contactNumber: "",
  isActive: true,
  loginCode: "",
};

export function DeliveryFleetsPage() {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("delivery.fleets");
  const [rows, setRows] = useState<DeliveryFleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [editing, setEditing] = useState<DeliveryFleet | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [nameError, setNameError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void fetchDeliveryFleets(appliedSearch)
      .then((next) => {
        if (active) setRows(next);
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedSearch, reloadKey]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setNameError(false);
    setSaveError(false);
    setPanelOpen(true);
  };

  const openEdit = (fleet: DeliveryFleet) => {
    setEditing(fleet);
    setForm({
      name: fleet.name,
      shortName: fleet.shortName ?? "",
      contactPerson: fleet.contactPerson ?? "",
      contactNumber: fleet.contactNumber ?? "",
      isActive: fleet.isActive,
      loginCode: "",
    });
    setNameError(false);
    setSaveError(false);
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
    setEditing(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setNameError(true);
      return;
    }
    if (!editing && !form.loginCode.trim()) {
      setSaveError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      const saved = editing
        ? await updateDeliveryFleet(editing.id, form)
        : await createDeliveryFleet(form);
      setRows((current) =>
        editing
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [saved, ...current],
      );
      setPanelOpen(false);
      setEditing(null);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (fleet: DeliveryFleet, checked: boolean) => {
    if (updatingId) return;
    setUpdatingId(fleet.id);
    setSaveError(false);
    try {
      const saved = await updateDeliveryFleet(fleet.id, {
        name: fleet.name,
        shortName: fleet.shortName ?? "",
        contactPerson: fleet.contactPerson ?? "",
        contactNumber: fleet.contactNumber ?? "",
        isActive: checked,
      });
      setRows((current) =>
        current.map((row) => (row.id === saved.id ? saved : row)),
      );
    } catch {
      setSaveError(true);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="ingredients-page delivery-fleets-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("deliveryFleets.eyebrow")}</span>
          <h1>{t("deliveryFleets.title")}</h1>
          <p>{t("deliveryFleets.description")}</p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus />
            {t("deliveryFleets.add")}
          </Button>
        ) : null}
      </header>

      <article className="panel ingredients-panel">
        <header className="ingredients-toolbar">
          <ListSearchBar
            id="delivery-fleets-search"
            value={search}
            onChange={setSearch}
            onSubmit={() => setAppliedSearch(search.trim())}
            label={t("deliveryFleets.search")}
            placeholder={t("deliveryFleets.searchPlaceholder")}
            submitLabel={t("deliveryFleets.searchAction")}
          />
        </header>
        {saveError && !panelOpen ? (
          <p className="list-inline-error">{t("deliveryFleets.updateError")}</p>
        ) : null}
        {loadError ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("deliveryFleets.loadError")}</strong>
              <span>{t("deliveryFleets.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />{t("deliveryFleets.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Truck />
            <div>
              <strong>{t("deliveryFleets.empty")}</strong>
              <span>{t("deliveryFleets.emptyDescription")}</span>
            </div>
            {canManage && !appliedSearch ? (
              <Button onClick={openCreate}><Plus />{t("deliveryFleets.add")}</Button>
            ) : null}
          </div>
        ) : (
          <ListTable
            className="ingredients-table-wrap"
            loading={loading}
            loadingLabel={t("deliveryFleets.loading")}
            skeletonRows={8}
            skeletonColumns={canManage ? 7 : 6}
            onRefresh={() => setReloadKey((key) => key + 1)}
            header={<tr>
              <th>{t("deliveryFleets.columns.name")}</th>
              <th>{t("deliveryFleets.columns.shortName")}</th>
              <th>{t("deliveryFleets.columns.contact")}</th>
              <th>{t("deliveryFleets.columns.phone")}</th>
              <th>{t("deliveryFleets.columns.loginCode")}</th>
              <th>{t("deliveryFleets.columns.status")}</th>
              {canManage ? <th aria-label={t("deliveryFleets.columns.actions")} /> : null}
            </tr>}
          >
            {rows.map((fleet) => <tr key={fleet.id}>
              <td><strong>{fleet.name}</strong></td>
              <td>{fleet.shortName || "—"}</td>
              <td>{fleet.contactPerson || "—"}</td>
              <td>{fleet.contactNumber || "—"}</td>
              <td><span className={fleet.hasLoginCode ? "status-badge tone-green" : "status-badge tone-slate"}>{t(fleet.hasLoginCode ? "deliveryFleets.loginCodeSet" : "deliveryFleets.loginCodeMissing")}</span></td>
              <td>
                {canManage ? <div className="delivery-fleet-status">
                  <Switch
                    checked={fleet.isActive}
                    disabled={updatingId === fleet.id}
                    onCheckedChange={(checked) => void toggleActive(fleet, checked)}
                    aria-label={t("deliveryFleets.toggleStatus", { name: fleet.name })}
                  />
                  <span>{t(fleet.isActive ? "deliveryFleets.active" : "deliveryFleets.inactive")}</span>
                </div> : t(fleet.isActive ? "deliveryFleets.active" : "deliveryFleets.inactive")}
              </td>
              {canManage ? <td className="table-actions-cell"><Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => openEdit(fleet)}
                aria-label={t("deliveryFleets.edit", { name: fleet.name })}
              ><Pencil /></Button></td> : null}
            </tr>)}
          </ListTable>
        )}
      </article>

      <SidePanel
        open={panelOpen && canManage}
        title={t(editing ? "deliveryFleets.editTitle" : "deliveryFleets.addTitle")}
        description={t("deliveryFleets.formDescription")}
        onClose={closePanel}
        closeLabel={t("deliveryFleets.close")}
        footer={<>
          <Button type="button" variant="outline" onClick={closePanel}>{t("deliveryFleets.cancel")}</Button>
          <Button type="submit" form="delivery-fleet-form" disabled={saving}>
            {t(saving ? "deliveryFleets.saving" : "deliveryFleets.save")}
          </Button>
        </>}
      >
        <form id="delivery-fleet-form" className="ingredients-form" onSubmit={(event) => void submit(event)}>
          <label className="ingredients-field">
            <span>{t("deliveryFleets.fields.name")}</span>
            <input autoFocus value={form.name} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setNameError(false); }} aria-invalid={nameError} />
            {nameError ? <em className="order-statuses-field-error">{t("deliveryFleets.nameRequired")}</em> : null}
          </label>
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.shortName")}</span><input value={form.shortName} onChange={(event) => setForm((current) => ({ ...current, shortName: event.target.value }))} /></label>
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.contact")}</span><input value={form.contactPerson} onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label>
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.phone")}</span><input type="tel" value={form.contactNumber} onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))} /></label>
          <label className="ingredients-field" htmlFor="delivery-fleet-login-code">
            <span>{t(editing ? "deliveryFleets.fields.newLoginCode" : "deliveryFleets.fields.loginCode")}</span>
            <input id="delivery-fleet-login-code" type="password" autoComplete="new-password" value={form.loginCode} onChange={(event) => { setForm((current) => ({ ...current, loginCode: event.target.value })); setSaveError(false); }} required={!editing} />
            <small>{t(editing ? "deliveryFleets.loginCodeEditHint" : "deliveryFleets.loginCodeCreateHint")}</small>
          </label>
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.status")}</span><div className="delivery-fleet-status"><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} /><span>{t(form.isActive ? "deliveryFleets.active" : "deliveryFleets.inactive")}</span></div></label>
          {saveError ? <p className="order-statuses-form-error">{t("deliveryFleets.saveError")}</p> : null}
        </form>
      </SidePanel>
    </section>
  );
}
