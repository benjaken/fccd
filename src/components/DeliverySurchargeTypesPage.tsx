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
  createDeliverySurchargeType,
  fetchDeliverySurchargeTypes,
  filterDeliverySurchargeTypes,
  sortDeliverySurchargeTypes,
  updateDeliverySurchargeType,
  type DeliverySurchargeType,
  type DeliverySurchargeTypeInput,
} from "@/lib/delivery-surcharge-types";

type TypesLoader = () => Promise<DeliverySurchargeType[]>;
type TypeCreator = (
  input: DeliverySurchargeTypeInput,
) => Promise<DeliverySurchargeType>;
type TypeUpdater = (
  id: string,
  input: Partial<DeliverySurchargeTypeInput>,
) => Promise<DeliverySurchargeType>;

function DeliverySurchargeTypePanel({
  open,
  type,
  createType,
  updateType,
  onClose,
  onSaved,
}: {
  open: boolean;
  type: DeliverySurchargeType | null;
  createType: TypeCreator;
  updateType: TypeUpdater;
  onClose: () => void;
  onSaved: (type: DeliverySurchargeType) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(type?.name ?? "");
    setIsActive(type?.isActive ?? true);
    setError(null);
  }, [open, type]);

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
      const saved = type
        ? await updateType(type.id, input)
        : await createType(input);
      onSaved(saved);
      onClose();
    } catch {
      setError(type ? "update_failed" : "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={
        type
          ? t("deliverySurchargeSettings.editTitle")
          : t("deliverySurchargeSettings.createTitle")
      }
      onClose={onClose}
      closeLabel={t("deliverySurchargeSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("deliverySurchargeSettings.cancel")}
          </Button>
          <Button
            type="submit"
            form="delivery-surcharge-type-form"
            disabled={submitting}
          >
            {submitting
              ? t("deliverySurchargeSettings.saving")
              : t("deliverySurchargeSettings.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="delivery-surcharge-type-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("deliverySurchargeSettings.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            placeholder={t("deliverySurchargeSettings.fields.namePlaceholder")}
            aria-label={t("deliverySurchargeSettings.fields.name")}
            aria-invalid={error === "name_required"}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="order-settings-switch-field">
          <span>{t("deliverySurchargeSettings.active")}</span>
          <Switch
            checked={isActive}
            aria-label={t("deliverySurchargeSettings.active")}
            onCheckedChange={setIsActive}
          />
        </label>
        {error ? (
          <p className="list-inline-error" role="alert">
            {t(`deliverySurchargeSettings.errors.${error}`)}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function DeliverySurchargeTypesPage({
  loadTypes = fetchDeliverySurchargeTypes,
  createType = createDeliverySurchargeType,
  updateType = updateDeliverySurchargeType,
}: {
  loadTypes?: TypesLoader;
  createType?: TypeCreator;
  updateType?: TypeUpdater;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("delivery");
  const [rows, setRows] = useState<DeliverySurchargeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeliverySurchargeType | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const visibleRows = useMemo(
    () => filterDeliverySurchargeTypes(rows, appliedSearch),
    [appliedSearch, rows],
  );
  const hasSearch = Boolean(appliedSearch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void loadTypes()
      .then((next) => {
        if (!cancelled) setRows(sortDeliverySurchargeTypes(next));
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
  }, [loadTypes, reloadKey]);

  const replaceRow = (saved: DeliverySurchargeType) => {
    setRows((current) =>
      sortDeliverySurchargeTypes(
        current.some((row) => row.id === saved.id)
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved],
      ),
    );
  };

  const handleToggle = useEffectEvent(
    async (row: DeliverySurchargeType, next: boolean) => {
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
        replaceRow(await updateType(row.id, { isActive: next }));
      } catch {
        setRows(previous);
        setActionError(t("deliverySurchargeSettings.toggleError"));
      } finally {
        setTogglingId(null);
      }
    },
  );

  return (
    <section className="order-settings-page">
      <header className="page-heading order-settings-heading">
        <div>
          <span className="eyebrow">{t("navigation.delivery")}</span>
          <h1>{t("deliverySurchargeSettings.title")}</h1>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("deliverySurchargeSettings.add")}
          </Button>
        ) : null}
      </header>

      <article className="panel order-settings-panel">
        <header className="order-settings-toolbar">
          <ListSearchBar
            id="delivery-surcharge-types-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => setAppliedSearch(draftSearch.trim())}
            label={t("deliverySurchargeSettings.search")}
            placeholder={t("deliverySurchargeSettings.searchPlaceholder")}
            submitLabel={t("deliverySurchargeSettings.searchAction")}
          />
        </header>

        {actionError ? (
          <p className="list-inline-error" role="alert">{actionError}</p>
        ) : null}

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <CircleDollarSign />
            <div>
              <strong>{t("deliverySurchargeSettings.loadError")}</strong>
              <span>{t("deliverySurchargeSettings.loadErrorDescription")}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {t("deliverySurchargeSettings.retry")}
            </Button>
          </div>
        ) : !loading && visibleRows.length === 0 ? (
          <div className="orders-state">
            <CircleDollarSign />
            <div>
              <strong>
                {hasSearch
                  ? t("deliverySurchargeSettings.emptySearch")
                  : t("deliverySurchargeSettings.empty")}
              </strong>
              <span>
                {hasSearch
                  ? t("deliverySurchargeSettings.emptySearchDescription")
                  : t("deliverySurchargeSettings.emptyDescription")}
              </span>
            </div>
          </div>
        ) : (
          <ListTable
            className="order-settings-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("deliverySurchargeSettings.loading")}
            skeletonRows={10}
            skeletonColumns={
              canManage
                ? [
                    { width: "82%" },
                    { width: "6.5rem" },
                    { width: "2.5rem", variant: "action" },
                  ]
                : [{ width: "88%" }, { width: "6.5rem" }]
            }
            header={
              <tr>
                <th>{t("deliverySurchargeSettings.columns.name")}</th>
                <th className="order-settings-active-col">
                  {t("deliverySurchargeSettings.active")}
                </th>
                {canManage ? (
                  <th aria-label={t("deliverySurchargeSettings.columns.actions")} />
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
                    aria-label={t("deliverySurchargeSettings.toggleActive", {
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
                        aria-label={t("deliverySurchargeSettings.edit", {
                          name: row.name,
                        })}
                        onClick={() => setEditing(row)}
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
      </article>

      <DeliverySurchargeTypePanel
        open={createOpen || Boolean(editing)}
        type={editing}
        createType={createType}
        updateType={updateType}
        onSaved={replaceRow}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
      />
    </section>
  );
}
