import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleDollarSign, Pencil, Plus } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createCostOption,
  fetchCostOptions,
  filterCostOptions,
  sortCostOptions,
  updateCostOption,
  type CostOption,
  type CostOptionInput,
} from "@/lib/cost-options";

type OptionsLoader = () => Promise<CostOption[]>;
type OptionCreator = (input: CostOptionInput) => Promise<CostOption>;
type OptionUpdater = (
  id: string,
  input: Partial<CostOptionInput>,
) => Promise<CostOption>;

const SKELETON_COLUMNS = [
  { width: "3rem" },
  { width: "44%" },
  { width: "7rem" },
  { width: "7rem" },
  { width: "7rem" },
];
const ACTION_SKELETON = { width: "2.5rem", variant: "action" as const };

function CostOptionPanel({
  open,
  option,
  createOption,
  updateOption,
  onClose,
  onSaved,
}: {
  open: boolean;
  option: CostOption | null;
  createOption: OptionCreator;
  updateOption: OptionUpdater;
  onClose: () => void;
  onSaved: (option: CostOption) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [isBrand, setIsBrand] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(option?.name ?? "");
    setIsAdvertising(option?.isAdvertising ?? false);
    setIsBrand(option?.isBrand ?? false);
    setIsActive(option?.isActive ?? true);
    setError(null);
  }, [open, option]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("name_required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = { name, isAdvertising, isBrand, isActive };
      const saved = option
        ? await updateOption(option.id, input)
        : await createOption(input);
      onSaved(saved);
      onClose();
    } catch {
      setError(option ? "update_failed" : "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={
        option
          ? t("orderSettings.costOptions.editTitle")
          : t("orderSettings.costOptions.createTitle")
      }
      onClose={onClose}
      closeLabel={t("orderSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("orderSettings.cancel")}
          </Button>
          <Button
            type="submit"
            form="cost-option-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderSettings.costOptions.saving")
              : t("orderSettings.costOptions.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="cost-option-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.costOptions.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            placeholder={t("orderSettings.costOptions.fields.namePlaceholder")}
            aria-label={t("orderSettings.costOptions.fields.name")}
            aria-invalid={error === "name_required"}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="order-settings-switch-field">
          <span>{t("orderSettings.costOptions.fields.advertising")}</span>
          <Switch
            checked={isAdvertising}
            aria-label={t("orderSettings.costOptions.fields.advertising")}
            onCheckedChange={setIsAdvertising}
          />
        </label>
        <label className="order-settings-switch-field">
          <span>{t("orderSettings.costOptions.fields.brand")}</span>
          <Switch
            checked={isBrand}
            aria-label={t("orderSettings.costOptions.fields.brand")}
            onCheckedChange={setIsBrand}
          />
        </label>
        <label className="order-settings-switch-field">
          <span>{t("orderSettings.active")}</span>
          <Switch
            checked={isActive}
            aria-label={t("orderSettings.active")}
            onCheckedChange={setIsActive}
          />
        </label>
        {error ? (
          <p className="list-inline-error" role="alert">
            {t(`orderSettings.costOptions.errors.${error}`)}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderCostOptionsTable({
  loadOptions = fetchCostOptions,
  createOption = createCostOption,
  updateOption = updateCostOption,
  createOpen,
  onCreateOpenChange,
}: {
  loadOptions?: OptionsLoader;
  createOption?: OptionCreator;
  updateOption?: OptionUpdater;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const [rows, setRows] = useState<CostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editing, setEditing] = useState<CostOption | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const visibleRows = useMemo(
    () => filterCostOptions(rows, appliedSearch),
    [appliedSearch, rows],
  );
  const hasSearch = Boolean(appliedSearch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void loadOptions()
      .then((next) => {
        if (!cancelled) setRows(sortCostOptions(next));
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOptions, reloadKey]);

  useEffect(() => {
    if (createOpen) setEditing(null);
  }, [createOpen]);

  const replaceRow = (saved: CostOption) => {
    setRows((current) =>
      sortCostOptions(
        current.some((row) => row.id === saved.id)
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved],
      ),
    );
  };

  const handleToggle = useEffectEvent(
    async (
      row: CostOption,
      field: "isAdvertising" | "isBrand" | "isActive",
      next: boolean,
    ) => {
      if (!canManage || savingField) return;
      setSavingField(`${row.id}:${field}`);
      setActionError(null);
      const previous = rows;
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, [field]: next } : item,
        ),
      );
      try {
        replaceRow(await updateOption(row.id, { [field]: next }));
      } catch {
        setRows(previous);
        setActionError(t("orderSettings.costOptions.toggleError"));
      } finally {
        setSavingField(null);
      }
    },
  );

  const toggle = (
    row: CostOption,
    field: "isAdvertising" | "isBrand" | "isActive",
  ) => (
    <Switch
      checked={row[field]}
      disabled={!canManage || Boolean(savingField)}
      aria-label={t(`orderSettings.costOptions.toggle.${field}`, {
        name: row.name,
      })}
      onCheckedChange={(checked) => void handleToggle(row, field, checked)}
    />
  );

  return (
    <>
      <header className="order-settings-toolbar">
        <ListSearchBar
          id="cost-options-search"
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => setAppliedSearch(draftSearch.trim())}
          label={t("orderSettings.costOptions.search")}
          placeholder={t("orderSettings.costOptions.searchPlaceholder")}
          submitLabel={t("orderSettings.costOptions.searchAction")}
        />
      </header>

      {actionError ? (
        <p className="list-inline-error" role="alert">{actionError}</p>
      ) : null}

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <CircleDollarSign />
          <div>
            <strong>{t("orderSettings.costOptions.loadError")}</strong>
            <span>{t("orderSettings.costOptions.loadErrorDescription")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("orderSettings.retry")}
          </Button>
        </div>
      ) : !loading && visibleRows.length === 0 ? (
        <div className="orders-state">
          <CircleDollarSign />
          <div>
            <strong>
              {hasSearch
                ? t("orderSettings.costOptions.emptySearch")
                : t("orderSettings.costOptions.empty")}
            </strong>
            <span>
              {hasSearch
                ? t("orderSettings.costOptions.emptySearchDescription")
                : t("orderSettings.costOptions.emptyDescription")}
            </span>
          </div>
          {canManage && !hasSearch ? (
            <Button type="button" onClick={() => onCreateOpenChange(true)}>
              <Plus />
              {t("orderSettings.costOptions.add")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.costOptions.loading")}
          skeletonRows={12}
          skeletonColumns={
            canManage ? [...SKELETON_COLUMNS, ACTION_SKELETON] : SKELETON_COLUMNS
          }
          header={
            <tr>
              <th className="order-settings-index-col">#</th>
              <th>{t("orderSettings.costOptions.columns.name")}</th>
              <th className="order-settings-active-col">
                {t("orderSettings.costOptions.columns.advertising")}
              </th>
              <th className="order-settings-active-col">
                {t("orderSettings.costOptions.columns.brand")}
              </th>
              <th className="order-settings-active-col">
                {t("orderSettings.active")}
              </th>
              {canManage ? (
                <th aria-label={t("orderSettings.costOptions.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {visibleRows.map((row, index) => (
            <tr key={row.id}>
              <td className="order-settings-index-col">{index + 1}</td>
              <td>{row.name}</td>
              <td className="order-settings-active-col">
                {toggle(row, "isAdvertising")}
              </td>
              <td className="order-settings-active-col">
                {toggle(row, "isBrand")}
              </td>
              <td className="order-settings-active-col">
                {toggle(row, "isActive")}
              </td>
              {canManage ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("orderSettings.costOptions.edit", {
                        name: row.name,
                      })}
                      title={t("orderSettings.costOptions.edit", {
                        name: row.name,
                      })}
                      onClick={() => {
                        onCreateOpenChange(false);
                        setEditing(row);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </ListTable>
      )}

      <CostOptionPanel
        open={createOpen || Boolean(editing)}
        option={editing}
        createOption={createOption}
        updateOption={updateOption}
        onSaved={replaceRow}
        onClose={() => {
          onCreateOpenChange(false);
          setEditing(null);
        }}
      />
    </>
  );
}
