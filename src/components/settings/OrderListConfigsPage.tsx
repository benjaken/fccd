import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ListFilter, Pencil } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  canHideOrderList,
  fetchOrderListConfigs,
  filterOrderListConfigs,
  updateOrderListConfig,
  type OrderListConfigFilters,
  type OrderListConfigRow,
} from "@/lib/order-list-configs";

type ConfigsLoader = (
  filters?: OrderListConfigFilters,
) => Promise<OrderListConfigRow[]>;
type ConfigUpdater = typeof updateOrderListConfig;

const ORDER_LIST_CONFIG_SKELETON_COLUMNS = [
  { width: "8rem" },
  { width: "72%" },
  { width: "4.5rem", variant: "badge" as const },
];
const ORDER_LIST_CONFIG_ACTION_SKELETON = {
  width: "2.5rem",
  variant: "action" as const,
};

function OrderListConfigFormPanel({
  open,
  config,
  onClose,
  onSaved,
  updateConfig,
}: {
  open: boolean;
  config: OrderListConfigRow | null;
  onClose: () => void;
  onSaved: (row: OrderListConfigRow) => void;
  updateConfig: ConfigUpdater;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !config) return;
    setTitle(config.title);
    setDescription(config.description);
    setIsVisible(config.isVisible);
    setError(null);
    setTitleError(null);
  }, [config, open]);

  const closeAndReset = () => {
    setError(null);
    setTitleError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitleError(t("settings.orderLists.validation.titleRequired"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const row = await updateConfig(config.id, {
        title: nextTitle,
        description,
        isVisible: canHideOrderList(config.presetKey) ? isVisible : true,
      });
      onSaved(row);
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message === "title_required"
          ? t("settings.orderLists.validation.titleRequired")
          : t("settings.orderLists.saveError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("settings.orderLists.editTitle")}
      description={t("settings.orderLists.editDescription")}
      onClose={closeAndReset}
      closeLabel={t("settings.orderLists.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("settings.orderLists.cancel")}
          </Button>
          <Button type="submit" form="order-list-config-form" disabled={submitting}>
            {submitting
              ? t("settings.orderLists.saving")
              : t("settings.orderLists.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="order-list-config-form"
        className="order-list-configs-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-list-configs-field">
          <span>{t("settings.orderLists.fields.title")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label={t("settings.orderLists.fields.title")}
            aria-invalid={Boolean(titleError)}
          />
          {titleError ? (
            <em className="order-list-configs-field-error">{titleError}</em>
          ) : null}
        </label>
        <label className="order-list-configs-field">
          <span>{t("settings.orderLists.fields.description")}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            aria-label={t("settings.orderLists.fields.description")}
          />
        </label>
        {config && canHideOrderList(config.presetKey) ? (
          <div className="order-list-configs-field">
            <span>{t("settings.orderLists.fields.visible")}</span>
            <Switch
              checked={isVisible}
              onCheckedChange={setIsVisible}
              aria-label={t("settings.orderLists.fields.visible")}
            />
          </div>
        ) : null}
        {error ? <p className="order-list-configs-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function OrderListConfigsPage({
  loadConfigs = fetchOrderListConfigs,
  updateConfig = updateOrderListConfig,
  canEdit: canEditProp,
}: {
  loadConfigs?: ConfigsLoader;
  updateConfig?: ConfigUpdater;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canEdit =
    canEditProp ?? pageAccess.canAccess("settings.order_lists.edit");
  const [rows, setRows] = useState<OrderListConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<OrderListConfigRow | null>(
    null,
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadConfigs({ search: appliedSearch })
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("settings.orderLists.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedSearch, loadConfigs, reloadKey, t]);

  const openEdit = (row: OrderListConfigRow) => {
    if (!canEdit) return;
    setEditingConfig(row);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingConfig(null);
  };

  const toggleVisible = async (row: OrderListConfigRow, next: boolean) => {
    if (!canEdit || togglingId || !canHideOrderList(row.presetKey)) return;
    setTogglingId(row.id);
    setError(null);
    try {
      const updated = await updateConfig(row.id, {
        title: row.title,
        description: row.description,
        isVisible: next,
      });
      setRows((current) =>
        filterOrderListConfigs(
          current.map((item) => (item.id === updated.id ? updated : item)),
          { search: appliedSearch },
        ),
      );
    } catch {
      setError(t("settings.orderLists.saveError"));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <section className="order-list-configs-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.orderLists.title")}</h1>
          <p>{t("settings.orderLists.description")}</p>
        </div>
      </header>

      <article className="panel order-list-configs-panel">
        <header className="order-list-configs-toolbar">
          <ListSearchBar
            id="order-list-configs-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => setAppliedSearch(draftSearch.trim())}
            label={t("settings.orderLists.search")}
            placeholder={t("settings.orderLists.searchPlaceholder")}
            submitLabel={t("settings.orderLists.searchAction")}
          />
        </header>

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("settings.orderLists.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              {t("settings.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <ListFilter />
            <div>
              <strong>{t("settings.orderLists.empty")}</strong>
              <span>{t("settings.orderLists.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="order-list-configs-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("settings.orderLists.loading")}
            skeletonRows={8}
            skeletonColumns={
              canEdit
                ? [
                    ...ORDER_LIST_CONFIG_SKELETON_COLUMNS,
                    ORDER_LIST_CONFIG_ACTION_SKELETON,
                  ]
                : ORDER_LIST_CONFIG_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("settings.orderLists.columns.title")}</th>
                <th>{t("settings.orderLists.columns.description")}</th>
                <th>{t("settings.orderLists.columns.visible")}</th>
                {canEdit ? (
                  <th aria-label={t("settings.orderLists.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                </td>
                <td>{row.description || t("common.notSet")}</td>
                <td>
                  {canHideOrderList(row.presetKey) ? (
                    <Switch
                      checked={row.isVisible}
                      disabled={!canEdit || togglingId === row.id}
                      onCheckedChange={(checked) => {
                        void toggleVisible(row, checked);
                      }}
                      aria-label={t("settings.orderLists.toggleVisible", {
                        title: row.title,
                      })}
                    />
                  ) : (
                    t("common.yes")
                  )}
                </td>
                {canEdit ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={t("settings.orderLists.edit")}
                        title={t("settings.orderLists.edit")}
                        onClick={() => openEdit(row)}
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

      <OrderListConfigFormPanel
        open={panelOpen && canEdit}
        config={editingConfig}
        onClose={closePanel}
        onSaved={(row) => {
          setRows((current) =>
            filterOrderListConfigs(
              current.map((item) => (item.id === row.id ? row : item)),
              { search: appliedSearch },
            ),
          );
        }}
        updateConfig={updateConfig}
      />
    </section>
  );
}
