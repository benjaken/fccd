import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Receipt } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createSupplierExpenseOption,
  fetchSupplierExpenseOptions,
  filterSupplierExpenseOptions,
  sortSupplierExpenseOptions,
  updateSupplierExpenseOption,
  type SupplierExpenseOption,
  type SupplierExpenseOptionInput,
} from "@/lib/supplier-expense-options";

type OptionsLoader = () => Promise<SupplierExpenseOption[]>;
type OptionCreator = (
  input: SupplierExpenseOptionInput,
) => Promise<SupplierExpenseOption>;
type OptionUpdater = (
  id: string,
  input: Partial<SupplierExpenseOptionInput>,
) => Promise<SupplierExpenseOption>;

const SKELETON_COLUMNS = [{ width: "82%" }, { width: "6.5rem" }];
const ACTION_SKELETON = { width: "2.5rem", variant: "action" as const };

function SupplierExpenseOptionPanel({
  open,
  option,
  createOption,
  updateOption,
  onClose,
  onSaved,
}: {
  open: boolean;
  option: SupplierExpenseOption | null;
  createOption: OptionCreator;
  updateOption: OptionUpdater;
  onClose: () => void;
  onSaved: (option: SupplierExpenseOption) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(option?.name ?? "");
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
      const input = { name, isActive };
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
          ? t("orderSettings.supplierExpenses.editTitle")
          : t("orderSettings.supplierExpenses.createTitle")
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
            form="supplier-expense-option-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderSettings.supplierExpenses.saving")
              : t("orderSettings.supplierExpenses.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="supplier-expense-option-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.supplierExpenses.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            placeholder={t("orderSettings.supplierExpenses.fields.namePlaceholder")}
            aria-label={t("orderSettings.supplierExpenses.fields.name")}
            aria-invalid={error === "name_required"}
            onChange={(event) => setName(event.target.value)}
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
            {t(`orderSettings.supplierExpenses.errors.${error}`)}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderSupplierExpenseOptionsTable({
  loadOptions = fetchSupplierExpenseOptions,
  createOption = createSupplierExpenseOption,
  updateOption = updateSupplierExpenseOption,
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
  const [rows, setRows] = useState<SupplierExpenseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupplierExpenseOption | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const visibleRows = useMemo(
    () => filterSupplierExpenseOptions(rows, appliedSearch),
    [appliedSearch, rows],
  );
  const hasSearch = Boolean(appliedSearch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void loadOptions()
      .then((next) => {
        if (!cancelled) setRows(sortSupplierExpenseOptions(next));
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

  const replaceRow = (saved: SupplierExpenseOption) => {
    setRows((current) =>
      sortSupplierExpenseOptions(
        current.some((row) => row.id === saved.id)
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved],
      ),
    );
  };

  const handleToggle = useEffectEvent(
    async (row: SupplierExpenseOption, next: boolean) => {
      if (!canManage || togglingId) return;
      setTogglingId(row.id);
      setActionError(null);
      const previous = rows;
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, isActive: next } : item,
        ),
      );
      try {
        replaceRow(await updateOption(row.id, { isActive: next }));
      } catch {
        setRows(previous);
        setActionError(t("orderSettings.supplierExpenses.toggleError"));
      } finally {
        setTogglingId(null);
      }
    },
  );

  return (
    <>
      <header className="order-settings-toolbar">
        <ListSearchBar
          id="supplier-expenses-search"
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => setAppliedSearch(draftSearch.trim())}
          label={t("orderSettings.supplierExpenses.search")}
          placeholder={t("orderSettings.supplierExpenses.searchPlaceholder")}
          submitLabel={t("orderSettings.supplierExpenses.searchAction")}
        />
      </header>

      {actionError ? (
        <p className="list-inline-error" role="alert">{actionError}</p>
      ) : null}

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <Receipt />
          <div>
            <strong>{t("orderSettings.supplierExpenses.loadError")}</strong>
            <span>{t("orderSettings.supplierExpenses.loadErrorDescription")}</span>
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
          <Receipt />
          <div>
            <strong>
              {hasSearch
                ? t("orderSettings.supplierExpenses.emptySearch")
                : t("orderSettings.supplierExpenses.empty")}
            </strong>
            <span>
              {hasSearch
                ? t("orderSettings.supplierExpenses.emptySearchDescription")
                : t("orderSettings.supplierExpenses.emptyDescription")}
            </span>
          </div>
          {canManage && !hasSearch ? (
            <Button type="button" onClick={() => onCreateOpenChange(true)}>
              <Plus />
              {t("orderSettings.supplierExpenses.add")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.supplierExpenses.loading")}
          skeletonRows={12}
          skeletonColumns={
            canManage ? [...SKELETON_COLUMNS, ACTION_SKELETON] : SKELETON_COLUMNS
          }
          header={
            <tr>
              <th>{t("orderSettings.supplierExpenses.columns.name")}</th>
              <th className="order-settings-active-col">
                {t("orderSettings.active")}
              </th>
              {canManage ? (
                <th aria-label={t("orderSettings.supplierExpenses.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {visibleRows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td className="order-settings-active-col">
                <Switch
                  checked={row.isActive}
                  disabled={!canManage || togglingId === row.id}
                  aria-label={t("orderSettings.supplierExpenses.toggleActive", {
                    name: row.name,
                  })}
                  onCheckedChange={(checked) => void handleToggle(row, checked)}
                />
              </td>
              {canManage ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("orderSettings.supplierExpenses.edit", {
                        name: row.name,
                      })}
                      title={t("orderSettings.supplierExpenses.edit", {
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

      <SupplierExpenseOptionPanel
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
