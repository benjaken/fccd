import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { FileText, Pencil, Plus } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createOrderQuoteOption,
  fetchOrderQuoteOptions,
  filterOrderQuoteOptions,
  isLongTextOrderQuoteOption,
  updateOrderQuoteOption,
  type OrderQuoteOption,
  type OrderQuoteOptionInput,
  type OrderQuoteOptionKind,
} from "@/lib/order-quote-option-settings";

type OptionsLoader = (kind: OrderQuoteOptionKind) => Promise<OrderQuoteOption[]>;
type OptionCreator = (
  kind: OrderQuoteOptionKind,
  input: OrderQuoteOptionInput,
) => Promise<OrderQuoteOption>;
type OptionUpdater = (
  kind: OrderQuoteOptionKind,
  id: string,
  input: Partial<OrderQuoteOptionInput>,
) => Promise<OrderQuoteOption>;

function OptionPanel({
  kind,
  option,
  open,
  createOption,
  updateOption,
  onClose,
  onSaved,
}: {
  kind: OrderQuoteOptionKind;
  option: OrderQuoteOption | null;
  open: boolean;
  createOption: OptionCreator;
  updateOption: OptionUpdater;
  onClose: () => void;
  onSaved: (option: OrderQuoteOption) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const longText = isLongTextOrderQuoteOption(kind);

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
        ? await updateOption(kind, option.id, input)
        : await createOption(kind, input);
      onSaved(saved);
      onClose();
    } catch {
      setError(option ? "update_failed" : "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldProps = {
    value: name,
    placeholder: t(`orderSettings.optionPages.${kind}.placeholder`),
    "aria-label": t(`orderSettings.optionPages.${kind}.field`),
    "aria-invalid": error === "name_required",
    onChange: (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setName(event.target.value),
  };

  return (
    <SidePanel
      open={open}
      title={t(
        `orderSettings.optionSettings.${option ? "editTitle" : "createTitle"}`,
        { name: t(`orderSettings.optionPages.${kind}.title`) },
      )}
      onClose={onClose}
      closeLabel={t("orderSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("orderSettings.cancel")}
          </Button>
          <Button type="submit" form="order-quote-option-form" disabled={submitting}>
            {submitting
              ? t("orderSettings.optionSettings.saving")
              : t("orderSettings.optionSettings.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="order-quote-option-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t(`orderSettings.optionPages.${kind}.field`)}</span>
          {longText ? <textarea rows={8} {...fieldProps} /> : <input {...fieldProps} />}
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
            {t(`orderSettings.optionSettings.errors.${error}`)}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderQuoteOptionSettingsTable({
  kind,
  loadOptions = fetchOrderQuoteOptions,
  createOption = createOrderQuoteOption,
  updateOption = updateOrderQuoteOption,
  createOpen,
  onCreateOpenChange,
}: {
  kind: OrderQuoteOptionKind;
  loadOptions?: OptionsLoader;
  createOption?: OptionCreator;
  updateOption?: OptionUpdater;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const [rows, setRows] = useState<OrderQuoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OrderQuoteOption | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const visibleRows = useMemo(
    () => filterOrderQuoteOptions(rows, appliedSearch),
    [appliedSearch, rows],
  );
  const hasSearch = Boolean(appliedSearch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void loadOptions(kind)
      .then((next) => {
        if (!cancelled) setRows(next);
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
  }, [kind, loadOptions, reloadKey]);

  useEffect(() => {
    setEditing(null);
  }, [kind]);

  const replaceRow = (saved: OrderQuoteOption) => {
    setRows((current) =>
      current.some((row) => row.id === saved.id)
        ? current.map((row) => (row.id === saved.id ? saved : row))
        : [...current, saved],
    );
  };

  const handleToggle = useEffectEvent(
    async (row: OrderQuoteOption, next: boolean) => {
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
        replaceRow(await updateOption(kind, row.id, { isActive: next }));
      } catch {
        setRows(previous);
        setActionError(t("orderSettings.optionSettings.toggleError"));
      } finally {
        setTogglingId(null);
      }
    },
  );

  const title = t(`orderSettings.optionPages.${kind}.title`);

  return (
    <>
      <header className="order-settings-toolbar">
        <ListSearchBar
          id={`${kind}-search`}
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => setAppliedSearch(draftSearch.trim())}
          label={t("orderSettings.optionSettings.search")}
          placeholder={t("orderSettings.optionSettings.searchPlaceholder", { name: title })}
          submitLabel={t("orderSettings.optionSettings.searchAction")}
        />
      </header>

      {actionError ? <p className="list-inline-error" role="alert">{actionError}</p> : null}

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <FileText />
          <div>
            <strong>{t("orderSettings.optionSettings.loadError", { name: title })}</strong>
            <span>{t("orderSettings.optionSettings.loadErrorDescription")}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            {t("orderSettings.retry")}
          </Button>
        </div>
      ) : !loading && visibleRows.length === 0 ? (
        <div className="orders-state">
          <FileText />
          <div>
            <strong>
              {hasSearch
                ? t("orderSettings.optionSettings.emptySearch", { name: title })
                : t("orderSettings.optionSettings.empty", { name: title })}
            </strong>
            <span>{t("orderSettings.optionSettings.emptyDescription")}</span>
          </div>
          {canManage && !hasSearch ? (
            <Button onClick={() => onCreateOpenChange(true)}><Plus />{t("orderSettings.optionSettings.add")}</Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.optionSettings.loading", { name: title })}
          skeletonRows={12}
          skeletonColumns={canManage ? [{ width: "82%" }, { width: "6.5rem" }, { width: "2.5rem", variant: "action" }] : [{ width: "88%" }, { width: "6.5rem" }]}
          header={<tr><th>{title}</th><th className="order-settings-active-col">{t("orderSettings.active")}</th>{canManage ? <th aria-label={t("orderSettings.optionSettings.actions")} /> : null}</tr>}
        >
          {visibleRows.map((row) => (
            <tr key={row.id}>
              <td className={isLongTextOrderQuoteOption(kind) ? "order-settings-long-text" : undefined}>{row.name}</td>
              <td className="order-settings-active-col">
                <Switch checked={row.isActive} disabled={!canManage || togglingId === row.id} aria-label={t("orderSettings.optionSettings.toggleActive", { name: row.name })} onCheckedChange={(checked) => void handleToggle(row, checked)} />
              </td>
              {canManage ? <td className="table-actions-cell"><div className="table-row-actions"><Button type="button" variant="outline" size="icon" aria-label={t("orderSettings.optionSettings.edit", { name: row.name })} onClick={() => { onCreateOpenChange(false); setEditing(row); }}><Pencil /></Button></div></td> : null}
            </tr>
          ))}
        </ListTable>
      )}

      <OptionPanel kind={kind} option={editing} open={createOpen || Boolean(editing)} createOption={createOption} updateOption={updateOption} onSaved={replaceRow} onClose={() => { onCreateOpenChange(false); setEditing(null); }} />
    </>
  );
}
