import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Pencil, RefreshCw, Store, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  KITCHEN_SUPPLIERS_DELETE,
  KITCHEN_SUPPLIERS_EDIT,
  KITCHEN_SUPPLIERS_VIEW_DETAIL,
} from "@/lib/kitchen-action-permissions";
import {
  archiveSupplier,
  createSupplier,
  fetchSuppliers,
  updateSupplier,
  type SupplierLinkedItem,
  type SupplierRow,
  type SupplierStatusFilter,
  type SupplierWriteInput,
} from "@/lib/suppliers";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import { cn } from "@/lib/utils";

type SuppliersLoader = (filters?: {
  search?: string;
  status?: SupplierStatusFilter;
}) => Promise<SupplierRow[]>;
type SupplierCreator = typeof createSupplier;
type SupplierUpdater = typeof updateSupplier;
type SupplierDeleter = typeof archiveSupplier;

const SUPPLIER_SKELETON_COLUMNS = [
  { width: "9rem" },
  { width: "6rem" },
  { width: "7rem" },
  { width: "14rem" },
  { width: "14rem" },
  { width: "14rem" },
  { width: "7rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "5rem" },
];
const SUPPLIER_ACTION_SKELETON = {
  width: "8rem",
  variant: "action" as const,
};

const STATUS_OPTIONS: Array<{ value: SupplierStatusFilter; labelKey: string }> = [
  { value: "", labelKey: "suppliers.allStatuses" },
  { value: "active", labelKey: "suppliers.statuses.active" },
  { value: "inactive", labelKey: "suppliers.statuses.inactive" },
];

/** First three linked names, then a "more" button that opens the detail panel. */
function LinkedItemsCell({
  items,
  moreLabel,
  onMore,
}: {
  items: SupplierLinkedItem[];
  moreLabel: string;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  if (!items?.length) {
    return <span aria-label={t("suppliers.none")}>{t("suppliers.no")}</span>;
  }
  const visible = items.slice(0, 3);
  return (
    <div className="suppliers-linked-cell">
      <div className="suppliers-linked-names">
        {visible.map((item) => (
          <span className="suppliers-linked-name" key={item.id} title={item.name}>
            {item.name}
          </span>
        ))}
      </div>
      {items.length > 3 ? (
        <button
          type="button"
          className="suppliers-linked-more"
          onClick={onMore}
          aria-label={moreLabel}
        >
          +{items.length - 3} {t("suppliers.more")}
        </button>
      ) : null}
    </div>
  );
}

function LinkedItemList({
  title,
  items,
}: {
  title: string;
  items: SupplierLinkedItem[];
}) {
  const { t } = useTranslation();
  if (!items.length) {
    return (
      <div className="suppliers-detail-group">
        <h3>{title}</h3>
        <p className="suppliers-detail-empty">{t("suppliers.noLinkedItems")}</p>
      </div>
    );
  }
  return (
    <div className="suppliers-detail-group">
      <h3>{title}</h3>
      <ul className="suppliers-detail-list">
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}

function SupplierDetailPanel({
  open,
  supplier,
  onClose,
  closeLabel,
}: {
  open: boolean;
  supplier: SupplierRow | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const { t } = useTranslation();
  if (!supplier) return null;

  const notSet = t("common.notSet");
  const rows: Array<{ label: string; value: string | null; wide?: boolean }> = [
    { label: t("suppliers.columns.companyName"), value: supplier.companyName },
    {
      label: t("suppliers.columns.contactPerson"),
      value: supplier.contactPerson,
    },
    {
      label: t("suppliers.columns.phoneNumber"),
      value: supplier.phoneNumber,
    },
    { label: t("suppliers.columns.comment"), value: supplier.comment, wide: true },
    {
      label: t("suppliers.columns.deliverySchedule"),
      value: supplier.deliverySchedule,
    },
    {
      label: t("suppliers.columns.paymentSchedule"),
      value: supplier.paymentSchedule,
    },
    {
      label: t("suppliers.columns.status"),
      value: supplier.isActive
        ? t("suppliers.statuses.active")
        : t("suppliers.statuses.inactive"),
    },
  ];

  return (
    <SidePanel
      open={open}
      title={supplier.companyName}
      description={t("suppliers.detailDescription")}
      onClose={onClose}
      closeLabel={closeLabel}
      half
    >
      <dl className="suppliers-detail-fields">
        {rows.map((row) => (
          <div
            className={cn(
              "suppliers-detail-field",
              row.wide && "suppliers-detail-field-wide",
            )}
            key={row.label}
          >
            <dt>{row.label}</dt>
            <dd>{row.value?.trim() ? row.value : notSet}</dd>
          </div>
        ))}
      </dl>
      <div className="suppliers-linked-groups">
        <LinkedItemList
          title={t("suppliers.columns.cateringIngredients")}
          items={supplier.cateringIngredients}
        />
        <LinkedItemList
          title={t("suppliers.columns.rawMeatItems")}
          items={supplier.rawMeatItems}
        />
        <LinkedItemList
          title={t("suppliers.columns.restaurantIngredients")}
          items={supplier.restaurantIngredients}
        />
      </div>
    </SidePanel>
  );
}

function SupplierFormPanel({
  open,
  supplier,
  onClose,
  onSaved,
  createSupplier,
  updateSupplier,
}: {
  open: boolean;
  supplier: SupplierRow | null;
  onClose: () => void;
  onSaved: (row: SupplierRow, mode: "create" | "edit") => void;
  createSupplier: SupplierCreator;
  updateSupplier: SupplierUpdater;
}) {
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [deliverySchedule, setDeliverySchedule] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [comment, setComment] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const editing = Boolean(supplier);

  useEffect(() => {
    if (!open) return;
    setCompanyName(supplier?.companyName ?? "");
    setContactPerson(supplier?.contactPerson ?? "");
    setPhoneNumber(supplier?.phoneNumber ?? "");
    setDeliverySchedule(supplier?.deliverySchedule ?? "");
    setPaymentSchedule(supplier?.paymentSchedule ?? "");
    setComment(supplier?.comment ?? "");
    setIsActive(supplier?.isActive ?? true);
    setError(null);
    setNameError(null);
  }, [open, supplier]);

  const closeAndReset = () => {
    setError(null);
    setNameError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyName.trim()) {
      setNameError(t("suppliers.validation.companyNameRequired"));
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setError(null);
    const payload: SupplierWriteInput = {
      companyName,
      contactPerson: contactPerson || null,
      phoneNumber: phoneNumber || null,
      deliverySchedule: deliverySchedule || null,
      paymentSchedule: paymentSchedule || null,
      comment: comment || null,
      isActive,
    };
    try {
      const row = supplier
        ? await updateSupplier(supplier.id, payload)
        : await createSupplier(payload);
      onSaved(row, supplier ? "edit" : "create");
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(editing ? "suppliers.editError" : "suppliers.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(
        editing ? "suppliers.editTitle" : "suppliers.createTitle",
      )}
      description={t(
        editing ? "suppliers.editDescription" : "suppliers.createDescription",
      )}
      onClose={closeAndReset}
      closeLabel={t("suppliers.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("suppliers.cancel")}
          </Button>
          <Button
            type="submit"
            form="supplier-form"
            disabled={submitting}
          >
            {submitting
              ? t("suppliers.saving")
              : t("suppliers.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="supplier-form"
        className="suppliers-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="suppliers-field">
          <span>{t("suppliers.fields.companyName")}</span>
          <input
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder={t("suppliers.fields.companyNamePlaceholder")}
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="suppliers-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="suppliers-field">
          <span>{t("suppliers.fields.contactPerson")}</span>
          <input
            value={contactPerson}
            onChange={(event) => setContactPerson(event.target.value)}
            placeholder={t("suppliers.fields.contactPlaceholder")}
          />
        </label>
        <label className="suppliers-field">
          <span>{t("suppliers.fields.phoneNumber")}</span>
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder={t("suppliers.fields.phonePlaceholder")}
          />
        </label>
        <label className="suppliers-field">
          <span>{t("suppliers.fields.deliverySchedule")}</span>
          <input
            value={deliverySchedule}
            onChange={(event) => setDeliverySchedule(event.target.value)}
            placeholder={t("suppliers.fields.deliveryPlaceholder")}
          />
        </label>
        <label className="suppliers-field">
          <span>{t("suppliers.fields.paymentSchedule")}</span>
          <input
            value={paymentSchedule}
            onChange={(event) => setPaymentSchedule(event.target.value)}
            placeholder={t("suppliers.fields.paymentPlaceholder")}
          />
        </label>
        <label className="suppliers-field">
          <span>{t("suppliers.fields.comment")}</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("suppliers.fields.commentPlaceholder")}
            rows={3}
          />
        </label>
        <label className="suppliers-field suppliers-field-switch">
          <span>{t("suppliers.fields.isActive")}</span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        </label>
        {error ? <p className="suppliers-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function SuppliersPage({
  loadSuppliers = fetchSuppliers,
  createSupplier: createSupplierProp = createSupplier,
  updateSupplier: updateSupplierProp = updateSupplier,
  deleteSupplier = archiveSupplier,
  canViewDetail: canViewDetailProp,
  canEdit: canEditProp,
  canDelete: canDeleteProp,
}: {
  loadSuppliers?: SuppliersLoader;
  createSupplier?: SupplierCreator;
  updateSupplier?: SupplierUpdater;
  deleteSupplier?: SupplierDeleter;
  canViewDetail?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canViewDetail =
    canViewDetailProp ?? pageAccess.canAccess(KITCHEN_SUPPLIERS_VIEW_DETAIL);
  const canEdit =
    canEditProp ?? pageAccess.canAccess(KITCHEN_SUPPLIERS_EDIT);
  const canDelete =
    canDeleteProp ?? pageAccess.canAccess(KITCHEN_SUPPLIERS_DELETE);
  const showRowActions = canViewDetail || canEdit || canDelete;

  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<SupplierStatusFilter>("");
  const statusFilter = useDeferredFilter(status, setStatus);
  const [detailSupplier, setDetailSupplier] = useState<SupplierRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const applied = useMemo(
    () => ({ search: appliedSearch, status }),
    [appliedSearch, status],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadSuppliers(applied)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("suppliers.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied, loadSuppliers, reloadKey, t]);

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
  };

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const openDetail = (row: SupplierRow) => {
    if (!canViewDetail) return;
    setDetailSupplier(row);
  };

  const openCreate = () => {
    if (!canEdit) return;
    setEditingSupplier(null);
    setPanelOpen(true);
  };

  const openEdit = (row: SupplierRow) => {
    if (!canEdit) return;
    setEditingSupplier(row);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingSupplier(null);
  };

  const handleDelete = async (row: SupplierRow) => {
    if (!canDelete || deletingId) return;
    const confirmed = window.confirm(
      t("suppliers.deleteConfirm", { supplier: row.companyName }),
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteSupplier(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("suppliers.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (row: SupplierRow, next: boolean) => {
    if (!canEdit || row.isActive === next) return;
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, isActive: next } : item,
      ),
    );
    setActionError(null);
    try {
      const updated = await updateSupplierProp(row.id, {
        companyName: row.companyName,
        contactPerson: row.contactPerson,
        phoneNumber: row.phoneNumber,
        deliverySchedule: row.deliverySchedule,
        paymentSchedule: row.paymentSchedule,
        comment: row.comment,
        isActive: next,
      });
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, isActive: updated.isActive } : item,
        ),
      );
    } catch (saveError) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, isActive: row.isActive } : item,
        ),
      );
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("suppliers.toggleStatusError"),
      );
    }
  };

  const mergeRow = (row: SupplierRow, mode: "create" | "edit") => {
    setRows((current) =>
      mode === "create"
        ? [row, ...current.filter((item) => item.id !== row.id)]
        : current.map((item) => (item.id === row.id ? row : item)),
    );
  };

  return (
    <section className="suppliers-page">
      <header className="page-heading suppliers-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t("suppliers.title")}</h1>
          <p>{t("suppliers.description")}</p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openCreate}>
            <Pencil />
            {t("suppliers.add")}
          </Button>
        ) : null}
      </header>

      <article className="panel suppliers-panel">
        <header className="suppliers-toolbar">
          <ListSearchBar
            id="suppliers-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("suppliers.search")}
            placeholder={t("suppliers.searchPlaceholder")}
            submitLabel={t("suppliers.searchAction")}
            filtersActive={Boolean(status)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <label className="suppliers-status-filter">
                <span>{t("suppliers.statusFilter")}</span>
                <select
                  value={statusFilter.value}
                  onChange={(event) =>
                    statusFilter.setValue(
                      event.target.value as SupplierStatusFilter,
                    )
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("suppliers.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              <RefreshCw />
              {t("suppliers.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Store />
            <div>
              <strong>{t("suppliers.empty")}</strong>
              <span>{t("suppliers.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="suppliers-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("suppliers.loading")}
            skeletonRows={8}
            skeletonColumns={
              showRowActions
                ? [...SUPPLIER_SKELETON_COLUMNS, SUPPLIER_ACTION_SKELETON]
                : SUPPLIER_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("suppliers.columns.companyName")}</th>
                <th>{t("suppliers.columns.contactPerson")}</th>
                <th>{t("suppliers.columns.phoneNumber")}</th>
                <th>{t("suppliers.columns.cateringIngredients")}</th>
                <th>{t("suppliers.columns.rawMeatItems")}</th>
                <th>{t("suppliers.columns.restaurantIngredients")}</th>
                <th>{t("suppliers.columns.deliverySchedule")}</th>
                <th>{t("suppliers.columns.paymentSchedule")}</th>
                <th>{t("suppliers.columns.status")}</th>
                {showRowActions ? (
                  <th aria-label={t("suppliers.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.companyName}</strong>
                </td>
                <td>{display(row.contactPerson)}</td>
                <td>{display(row.phoneNumber)}</td>
                <td>
                  <LinkedItemsCell
                    items={row.cateringIngredients}
                    moreLabel={t("suppliers.viewDetail", {
                      supplier: row.companyName,
                    })}
                    onMore={() => openDetail(row)}
                  />
                </td>
                <td>
                  <LinkedItemsCell
                    items={row.rawMeatItems}
                    moreLabel={t("suppliers.viewDetail", {
                      supplier: row.companyName,
                    })}
                    onMore={() => openDetail(row)}
                  />
                </td>
                <td>
                  <LinkedItemsCell
                    items={row.restaurantIngredients}
                    moreLabel={t("suppliers.viewDetail", {
                      supplier: row.companyName,
                    })}
                    onMore={() => openDetail(row)}
                  />
                </td>
                <td>{display(row.deliverySchedule)}</td>
                <td>{display(row.paymentSchedule)}</td>
                <td>
                  <div className="suppliers-status-cell">
                    <Switch
                      checked={row.isActive}
                      disabled={!canEdit}
                      onCheckedChange={(next) => {
                        void handleToggleStatus(row, next);
                      }}
                      aria-label={t(
                        row.isActive
                          ? "suppliers.toggleStatusToInactive"
                          : "suppliers.toggleStatusToActive",
                        { supplier: row.companyName },
                      )}
                    />
                    <span
                      className={
                        row.isActive
                          ? "suppliers-status-text suppliers-status-text-active"
                          : "suppliers-status-text suppliers-status-text-inactive"
                      }
                    >
                      {row.isActive
                        ? t("suppliers.statuses.active")
                        : t("suppliers.statuses.inactive")}
                    </span>
                  </div>
                </td>
                {showRowActions ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      {canViewDetail ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={t("suppliers.viewDetailTitle")}
                          title={t("suppliers.viewDetailTitle")}
                          onClick={() => openDetail(row)}
                        >
                          <Eye />
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={t("suppliers.edit")}
                          title={t("suppliers.edit")}
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
                          aria-label={t("suppliers.delete")}
                          title={t("suppliers.delete")}
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

      <SupplierDetailPanel
        open={Boolean(detailSupplier)}
        supplier={detailSupplier}
        onClose={() => setDetailSupplier(null)}
        closeLabel={t("suppliers.closePanel")}
      />

      <SupplierFormPanel
        open={panelOpen && (!editingSupplier || canEdit)}
        supplier={editingSupplier}
        onClose={closePanel}
        createSupplier={createSupplierProp}
        updateSupplier={updateSupplierProp}
        onSaved={(row, mode) => {
          mergeRow(row, mode);
          closePanel();
        }}
      />
    </section>
  );
}
