import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Banknote, ChevronLeft, ChevronRight, MapPinned, Pencil, Plus, RefreshCw, Truck } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { SearchSelect } from "@/components/ui/search-select";
import { Switch } from "@/components/ui/switch";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  createDeliveryFleet,
  fetchDeliveryFleetFees,
  fetchDeliveryFleets,
  updateDeliveryFleetFee,
  updateDeliveryFleet,
  type DeliveryFleet,
  type DeliveryFleetFee,
} from "@/lib/delivery-fleets";

const emptyForm = {
  name: "",
  shortName: "",
  contactPerson: "",
  contactNumber: "",
  bankAccount: "",
  isActive: true,
  driverPanelEnabled: true,
  loginCode: "",
};

function fleetFeeKey(row: Pick<DeliveryFleetFee, "fleetId" | "districtId">) {
  return `${row.fleetId}:${row.districtId}`;
}

const FEE_PAGE_SIZE = 15;

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
  const [feeFleet, setFeeFleet] = useState<DeliveryFleet | null>(null);
  const [feeRows, setFeeRows] = useState<DeliveryFleetFee[]>([]);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState(false);
  const [savingFeeIds, setSavingFeeIds] = useState<Set<string>>(() => new Set());
  const [feeFleetFilter, setFeeFleetFilter] = useState("");
  const [feeDistrictFilter, setFeeDistrictFilter] = useState("");
  const [feeDraftSearch, setFeeDraftSearch] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const [feePage, setFeePage] = useState(1);
  const feeFleetControl = useDeferredFilter(feeFleetFilter, (value) => { setFeeFleetFilter(value); setFeePage(1); });
  const feeDistrictControl = useDeferredFilter(feeDistrictFilter, (value) => { setFeeDistrictFilter(value); setFeePage(1); });

  const feeDistrictOptions = useMemo(() => [...new Set(feeRows.map((row) => row.districtName))].sort((left, right) => left.localeCompare(right, "zh-HK")).map((district) => ({ id: district, name: district })), [feeRows]);
  const feeFleetOptions = useMemo(() => [...new Map(feeRows.map((row) => [row.fleetId, row.fleetName])).entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "zh-HK")), [feeRows]);

  const filteredFeeRows = useMemo(() => {
    const search = feeSearch.trim().toLocaleLowerCase("zh-HK");
    return feeRows.filter((row) =>
      (!feeFleetFilter || row.fleetId === feeFleetFilter) &&
      (!feeDistrictFilter || row.districtName === feeDistrictFilter) &&
      (!search || `${row.fleetName} ${row.districtName}`.toLocaleLowerCase("zh-HK").includes(search))
    );
  }, [feeDistrictFilter, feeFleetFilter, feeRows, feeSearch]);
  const feeTotalPages = Math.max(1, Math.ceil(filteredFeeRows.length / FEE_PAGE_SIZE));
  const visibleFeeRows = filteredFeeRows.slice(
    (feePage - 1) * FEE_PAGE_SIZE,
    feePage * FEE_PAGE_SIZE,
  );
  const feeFrom = filteredFeeRows.length === 0 ? 0 : (feePage - 1) * FEE_PAGE_SIZE + 1;
  const feeTo = Math.min(feePage * FEE_PAGE_SIZE, filteredFeeRows.length);

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
      bankAccount: fleet.bankAccount ?? "",
      isActive: fleet.isActive,
      driverPanelEnabled: fleet.driverPanelEnabled,
      loginCode: "",
    });
    setNameError(false);
    setSaveError(false);
    setPanelOpen(true);
  };

  const openFees = async (fleet: DeliveryFleet) => {
    setFeeFleet(fleet);
    setFeeRows([]);
    setFeeDrafts({});
    setFeeFleetFilter(fleet.id);
    setFeeDistrictFilter("");
    setFeeDraftSearch("");
    setFeeSearch("");
    setFeePage(1);
    setFeesLoading(true);
    setFeesError(false);
    try {
      const next = await fetchDeliveryFleetFees(null);
      setFeeRows(next);
      setFeeDrafts(Object.fromEntries(next.map((row) => [fleetFeeKey(row), String(row.fee)])));
    } catch {
      setFeesError(true);
    } finally {
      setFeesLoading(false);
    }
  };

  const saveFee = async (row: DeliveryFleetFee) => {
    const rowKey = fleetFeeKey(row);
    const fee = Number(feeDrafts[rowKey]);
    if (!Number.isFinite(fee) || fee < 0) {
      setFeesError(true);
      setFeeDrafts((current) => ({ ...current, [rowKey]: String(row.fee) }));
      return;
    }
    if (fee === row.fee || savingFeeIds.has(rowKey)) return;
    setSavingFeeIds((current) => new Set(current).add(rowKey));
    setFeesError(false);
    try {
      const saved = await updateDeliveryFleetFee(row.fleetId, row.districtId, fee);
      const savedKey = fleetFeeKey(saved);
      setFeeRows((current) => current.map((item) => fleetFeeKey(item) === savedKey ? saved : item));
      setFeeDrafts((current) => ({ ...current, [savedKey]: String(saved.fee) }));
    } catch {
      setFeesError(true);
      setFeeDrafts((current) => ({ ...current, [rowKey]: String(row.fee) }));
    } finally {
      setSavingFeeIds((current) => {
        const next = new Set(current);
        next.delete(rowKey);
        return next;
      });
    }
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
        bankAccount: fleet.bankAccount ?? "",
        isActive: checked,
        driverPanelEnabled: fleet.driverPanelEnabled,
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

  const toggleDriverPanel = async (fleet: DeliveryFleet, checked: boolean) => {
    if (updatingId) return;
    setUpdatingId(fleet.id);
    setSaveError(false);
    try {
      const saved = await updateDeliveryFleet(fleet.id, {
        name: fleet.name,
        shortName: fleet.shortName ?? "",
        contactPerson: fleet.contactPerson ?? "",
        contactNumber: fleet.contactNumber ?? "",
        bankAccount: fleet.bankAccount ?? "",
        isActive: fleet.isActive,
        driverPanelEnabled: checked,
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
            skeletonColumns={9}
            onRefresh={() => setReloadKey((key) => key + 1)}
            header={<tr>
              <th>{t("deliveryFleets.columns.name")}</th>
              <th>{t("deliveryFleets.columns.shortName")}</th>
              <th>{t("deliveryFleets.columns.contact")}</th>
              <th>{t("deliveryFleets.columns.phone")}</th>
              <th>{t("deliveryFleets.columns.bankAccount")}</th>
              <th>{t("deliveryFleets.columns.loginCode")}</th>
              <th>{t("deliveryFleets.columns.driverPanel")}</th>
              <th>{t("deliveryFleets.columns.status")}</th>
              <th>{t("deliveryFleets.columns.actions")}</th>
            </tr>}
          >
            {rows.map((fleet) => <tr key={fleet.id}>
              <td><strong>{fleet.name}</strong></td>
              <td>{fleet.shortName || "—"}</td>
              <td>{fleet.contactPerson || "—"}</td>
              <td>{fleet.contactNumber || "—"}</td>
              <td>{fleet.bankAccount || "—"}</td>
              <td><span className={fleet.hasLoginCode ? "status-badge tone-green" : "status-badge tone-slate"}>{t(fleet.hasLoginCode ? "deliveryFleets.loginCodeSet" : "deliveryFleets.loginCodeMissing")}</span></td>
              <td>
                {canManage ? <div className="delivery-fleet-status">
                  <Switch
                    checked={fleet.driverPanelEnabled}
                    disabled={updatingId === fleet.id}
                    onCheckedChange={(checked) => void toggleDriverPanel(fleet, checked)}
                    aria-label={t("deliveryFleets.toggleDriverPanel", { name: fleet.name })}
                  />
                  <span>{t(fleet.driverPanelEnabled ? "deliveryFleets.driverPanelEnabled" : "deliveryFleets.driverPanelDisabled")}</span>
                </div> : t(fleet.driverPanelEnabled ? "deliveryFleets.driverPanelEnabled" : "deliveryFleets.driverPanelDisabled")}
              </td>
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
              <td className="table-actions-cell"><div className="table-row-actions">
                {canManage ? <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => openEdit(fleet)}
                  aria-label={t("deliveryFleets.edit", { name: fleet.name })}
                ><Pencil /></Button> : null}
                <Button type="button" variant="outline" onClick={() => void openFees(fleet)}><Banknote />{t("deliveryFleets.feeManagement.action")}</Button>
              </div></td>
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
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.bankAccount")}</span><input value={form.bankAccount} onChange={(event) => setForm((current) => ({ ...current, bankAccount: event.target.value }))} /></label>
          <label className="ingredients-field" htmlFor="delivery-fleet-login-code">
            <span>{t(editing ? "deliveryFleets.fields.newLoginCode" : "deliveryFleets.fields.loginCode")}</span>
            <input id="delivery-fleet-login-code" type="password" autoComplete="new-password" value={form.loginCode} onChange={(event) => { setForm((current) => ({ ...current, loginCode: event.target.value })); setSaveError(false); }} required={!editing} />
            <small>{t(editing ? "deliveryFleets.loginCodeEditHint" : "deliveryFleets.loginCodeCreateHint")}</small>
          </label>
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.driverPanel")}</span><div className="delivery-fleet-status"><Switch checked={form.driverPanelEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, driverPanelEnabled: checked }))} /><span>{t(form.driverPanelEnabled ? "deliveryFleets.driverPanelEnabled" : "deliveryFleets.driverPanelDisabled")}</span></div><small>{t("deliveryFleets.driverPanelHint")}</small></label>
          <label className="ingredients-field"><span>{t("deliveryFleets.fields.status")}</span><div className="delivery-fleet-status"><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} /><span>{t(form.isActive ? "deliveryFleets.active" : "deliveryFleets.inactive")}</span></div></label>
          {saveError ? <p className="order-statuses-form-error">{t("deliveryFleets.saveError")}</p> : null}
        </form>
      </SidePanel>

      <SidePanel
        open={Boolean(feeFleet)}
        title={t("deliveryFleets.feeManagement.title", { name: feeFleet?.name ?? "" })}
        description={t("deliveryFleets.feeManagement.description")}
        onClose={() => { if (savingFeeIds.size === 0) setFeeFleet(null); }}
        closeLabel={t("deliveryFleets.feeManagement.close")}
        className="side-panel-majority"
      >
        <div className="delivery-fleet-fee-panel">
          <div className="delivery-fleet-fee-toolbar">
            {feesError ? <p className="list-inline-error" role="alert">{t("deliveryFleets.feeManagement.error")}</p> : null}
            <ListSearchBar
              id="delivery-fleet-fee-search"
              value={feeDraftSearch}
              onChange={setFeeDraftSearch}
              onSubmit={() => { setFeeSearch(feeDraftSearch.trim()); setFeePage(1); }}
              label={t("deliveryFleets.feeManagement.search")}
              placeholder={t("deliveryFleets.feeManagement.searchPlaceholder")}
              submitLabel={t("deliveryFleets.feeManagement.searchAction")}
              className="delivery-fleet-fee-search"
              filtersActive={Boolean(feeFleetFilter || feeDistrictFilter)}
              filtersTitle={t("common.filters")}
              onConfirmFilters={() => { feeFleetControl.confirm(); feeDistrictControl.confirm(); }}
              onDismissFilters={() => { feeFleetControl.revert(); feeDistrictControl.revert(); }}
              filters={<div className="delivery-fleet-fee-filters">
                <label>
                  <span>{t("deliveryFleets.feeManagement.filters.driver")}</span>
                  <FilterableSelect value={feeFleetControl.value} onChange={(event) => feeFleetControl.setValue(event.target.value)}>
                    <option value="">{t("deliveryFleets.feeManagement.filters.allDrivers")}</option>
                    {feeFleetOptions.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}
                  </FilterableSelect>
                </label>
                <label>
                  <span>{t("deliveryFleets.feeManagement.filters.district")}</span>
                  <SearchSelect id="delivery-fleet-fee-district" label={t("deliveryFleets.feeManagement.filters.district")} value={feeDistrictControl.value} options={[{ id: "", name: t("deliveryFleets.feeManagement.filters.allDistricts") }, ...feeDistrictOptions]} placeholder={t("deliveryFleets.feeManagement.filters.allDistrictsPlaceholder")} onChange={(option) => feeDistrictControl.setValue(option.id)} />
                </label>
              </div>}
            />
          </div>
          {!feesLoading && !feesError && feeRows.length === 0 ? (
            <div className="products-state products-state-empty"><MapPinned /><div><strong>{t("deliveryFleets.feeManagement.empty")}</strong><span>{t("deliveryFleets.feeManagement.emptyDescription")}</span></div></div>
          ) : (
            <ListTable
              className="ingredients-table-wrap"
              loading={feesLoading}
              loadingLabel={t("deliveryFleets.feeManagement.loading")}
              skeletonRows={8}
              skeletonColumns={3}
              header={<tr><th>{t("deliveryFleets.feeManagement.columns.fleet")}</th><th>{t("deliveryFleets.feeManagement.columns.district")}</th><th>{t("deliveryFleets.feeManagement.columns.fee")}</th></tr>}
            >
              {visibleFeeRows.map((row) => {
                const rowKey = fleetFeeKey(row);
                return <tr key={rowKey}>
                <td><strong>{row.fleetName}</strong></td>
                <td>{row.districtName}</td>
                <td>{canManage ? <label className="delivery-fleet-fee-input"><span aria-hidden="true">HK$</span><input aria-label={t("deliveryFleets.feeManagement.feeLabel", { district: row.districtName })} type="number" min="0" step="0.01" value={feeDrafts[rowKey] ?? ""} disabled={savingFeeIds.has(rowKey)} onChange={(event) => setFeeDrafts((current) => ({ ...current, [rowKey]: event.target.value }))} onBlur={() => void saveFee(row)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label> : `HK$${row.fee.toLocaleString("zh-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
              </tr>})}
            </ListTable>
          )}
          {!feesLoading && !feesError && filteredFeeRows.length > 0 ? <footer className="orders-pagination">
            <span>{t("deliveryFleets.feeManagement.pagination", { from: feeFrom, to: feeTo, total: filteredFeeRows.length })}</span>
            <div>
              <Button type="button" variant="outline" size="icon" disabled={feePage <= 1} onClick={() => setFeePage((page) => Math.max(1, page - 1))} aria-label={t("deliveryFleets.feeManagement.previous")}><ChevronLeft /></Button>
              <strong>{feePage} / {feeTotalPages}</strong>
              <Button type="button" variant="outline" size="icon" disabled={feePage >= feeTotalPages} onClick={() => setFeePage((page) => Math.min(feeTotalPages, page + 1))} aria-label={t("deliveryFleets.feeManagement.next")}><ChevronRight /></Button>
            </div>
          </footer> : <div />}
        </div>
      </SidePanel>
    </section>
  );
}
