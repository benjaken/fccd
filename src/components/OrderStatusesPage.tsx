import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Pencil, Plus, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { ORDER_ACTION_PERMISSION_KEYS } from "@/lib/order-action-permissions";
import {
  archiveOrderStatus,
  colorInputValue,
  createOrderStatus,
  DEFAULT_ORDER_STATUS_COLOR,
  fetchOrderStatuses,
  parseHexColor,
  updateOrderStatus,
  type OrderStatusFilters,
  type OrderStatusRow,
} from "@/lib/order-statuses";

type StatusesLoader = (
  filters?: OrderStatusFilters,
) => Promise<OrderStatusRow[]>;
type StatusCreator = typeof createOrderStatus;
type StatusUpdater = typeof updateOrderStatus;
type StatusDeleter = typeof archiveOrderStatus;

const ORDER_STATUS_SKELETON_COLUMNS = [
  { width: "12rem" },
  { width: "10rem" },
  { width: "8rem" },
];
const ORDER_STATUS_ACTION_SKELETON = {
  width: "4.5rem",
  variant: "action" as const,
};

function OrderStatusFormPanel({
  open,
  status,
  onClose,
  onSaved,
  createStatus,
  updateStatus,
}: {
  open: boolean;
  status: OrderStatusRow | null;
  onClose: () => void;
  onSaved: (row: OrderStatusRow, mode: "create" | "edit") => void;
  createStatus: StatusCreator;
  updateStatus: StatusUpdater;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_ORDER_STATUS_COLOR);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const editing = Boolean(status);

  useEffect(() => {
    if (!open) return;
    setName(status?.name ?? "");
    setColor(status?.color ?? DEFAULT_ORDER_STATUS_COLOR);
    setError(null);
    setNameError(null);
    setColorError(null);
  }, [open, status]);

  const closeAndReset = () => {
    setError(null);
    setNameError(null);
    setColorError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    const nextColor = parseHexColor(color);
    const nextNameError = nextName
      ? null
      : t("orderStatuses.validation.nameRequired");
    const nextColorError = nextColor
      ? null
      : t("orderStatuses.validation.colorRequired");
    setNameError(nextNameError);
    setColorError(nextColorError);
    if (nextNameError || nextColorError || !nextColor) return;

    setSubmitting(true);
    setError(null);
    try {
      const row = status
        ? await updateStatus(status.id, { name: nextName, color: nextColor })
        : await createStatus({ name: nextName, color: nextColor });
      onSaved(row, status ? "edit" : "create");
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(editing ? "orderStatuses.editError" : "orderStatuses.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(
        editing ? "orderStatuses.editTitle" : "orderStatuses.createTitle",
      )}
      description={t(
        editing
          ? "orderStatuses.editDescription"
          : "orderStatuses.createDescription",
      )}
      onClose={closeAndReset}
      closeLabel={t("orderStatuses.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("orderStatuses.cancel")}
          </Button>
          <Button
            type="submit"
            form="order-status-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderStatuses.creating")
              : t("orderStatuses.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="order-status-form"
        className="order-statuses-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-statuses-field">
          <span>{t("orderStatuses.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("orderStatuses.fields.namePlaceholder")}
            autoComplete="off"
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="order-statuses-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="order-statuses-field">
          <span>{t("orderStatuses.fields.color")}</span>
          <div className="order-statuses-color-row">
            <input
              type="color"
              value={colorInputValue(color)}
              aria-label={t("orderStatuses.fields.color")}
              onChange={(event) => setColor(event.target.value)}
            />
            <input
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder={t("orderStatuses.fields.colorPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(colorError)}
            />
          </div>
          {colorError ? (
            <em className="order-statuses-field-error">{colorError}</em>
          ) : null}
        </label>
        {error ? <p className="order-statuses-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function OrderStatusesPage({
  loadStatuses = fetchOrderStatuses,
  createStatus = createOrderStatus,
  updateStatus = updateOrderStatus,
  deleteStatus = archiveOrderStatus,
  canCreate: canCreateProp,
  canEdit: canEditProp,
  canDelete: canDeleteProp,
}: {
  loadStatuses?: StatusesLoader;
  createStatus?: StatusCreator;
  updateStatus?: StatusUpdater;
  deleteStatus?: StatusDeleter;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canCreate =
    canCreateProp ??
    pageAccess.canAccess(ORDER_ACTION_PERMISSION_KEYS.statuses.create);
  const canEdit =
    canEditProp ??
    pageAccess.canAccess(ORDER_ACTION_PERMISSION_KEYS.statuses.edit);
  const canDelete =
    canDeleteProp ??
    pageAccess.canAccess(ORDER_ACTION_PERMISSION_KEYS.statuses.delete);
  const showRowActions = canEdit || canDelete;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );
  const [rows, setRows] = useState<OrderStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<OrderStatusRow | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadStatuses({ search: appliedSearch })
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("orderStatuses.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedSearch, loadStatuses, reloadKey, t]);

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const openCreate = () => {
    if (!canCreate) return;
    setEditingStatus(null);
    setPanelOpen(true);
  };

  const openEdit = (row: OrderStatusRow) => {
    if (!canEdit) return;
    setEditingStatus(row);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingStatus(null);
  };

  const handleDelete = async (row: OrderStatusRow) => {
    if (!canDelete || deletingId) return;
    const confirmed = window.confirm(t("orderStatuses.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteStatus(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("orderStatuses.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const panelAllowed = panelOpen && (editingStatus ? canEdit : canCreate);

  return (
    <section className="order-statuses-page">
      <header className="page-heading order-statuses-heading">
        <div>
          <span className="eyebrow">{t("orderStatuses.eyebrow")}</span>
          <h1>{t("orderStatuses.title")}</h1>
        </div>
        {canCreate ? (
          <Button type="button" onClick={openCreate}>
            <Plus />
            {t("orderStatuses.add")}
          </Button>
        ) : null}
      </header>

      <article className="panel order-statuses-panel">
        <header className="order-statuses-toolbar">
          <ListSearchBar
            id="order-statuses-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => setAppliedSearch(draftSearch.trim())}
            label={t("orderStatuses.search")}
            placeholder={t("orderStatuses.searchPlaceholder")}
            submitLabel={t("orderStatuses.searchAction")}
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("orderStatuses.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              {t("orderStatuses.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Palette />
            <div>
              <strong>{t("orderStatuses.empty")}</strong>
              <span>{t("orderStatuses.emptyDescription")}</span>
            </div>
            {canCreate ? (
              <Button type="button" onClick={openCreate}>
                <Plus />
                {t("orderStatuses.add")}
              </Button>
            ) : null}
          </div>
        ) : (
          <ListTable
            className="order-statuses-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("orderStatuses.loading")}
            skeletonRows={8}
            skeletonColumns={
              showRowActions
                ? [...ORDER_STATUS_SKELETON_COLUMNS, ORDER_STATUS_ACTION_SKELETON]
                : ORDER_STATUS_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("orderStatuses.columns.name")}</th>
                <th>{t("orderStatuses.columns.color")}</th>
                <th>{t("orderStatuses.columns.created")}</th>
                {showRowActions ? (
                  <th aria-label={t("orderStatuses.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>
                  <span className="order-statuses-swatch">
                    <span
                      className="order-statuses-swatch-dot"
                      style={{ background: row.color || "transparent" }}
                      aria-hidden="true"
                    />
                    {display(row.color)}
                  </span>
                </td>
                <td>{dateFormatter.format(new Date(row.createdAt))}</td>
                {showRowActions ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={deletingId === row.id}
                          aria-label={t("orderStatuses.edit")}
                          title={t("orderStatuses.edit")}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={deletingId === row.id}
                          aria-label={t("orderStatuses.delete")}
                          title={t("orderStatuses.delete")}
                          onClick={() => {
                            void handleDelete(row);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}
      </article>

      <OrderStatusFormPanel
        open={panelAllowed}
        status={editingStatus}
        onClose={closePanel}
        createStatus={createStatus}
        updateStatus={updateStatus}
        onSaved={(row, mode) => {
          setRows((current) =>
            mode === "create"
              ? [row, ...current.filter((item) => item.id !== row.id)]
              : current.map((item) => (item.id === row.id ? row : item)),
          );
          closePanel();
        }}
      />
    </section>
  );
}
