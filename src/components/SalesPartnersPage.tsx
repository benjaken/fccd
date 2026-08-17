import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Handshake, Pencil, Plus, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { ORDER_ACTION_PERMISSION_KEYS } from "@/lib/order-action-permissions";
import {
  archiveSalesPartner,
  createSalesPartner,
  fetchSalesPartners,
  readErrorMessage,
  updateSalesPartner,
  type SalesPartnerFilters,
  type SalesPartnerRow,
} from "@/lib/sales-partners";

type PartnersLoader = (
  filters?: SalesPartnerFilters,
) => Promise<SalesPartnerRow[]>;
type PartnerCreator = typeof createSalesPartner;
type PartnerUpdater = typeof updateSalesPartner;
type PartnerDeleter = typeof archiveSalesPartner;

const SALE_PARTNER_SKELETON_COLUMNS = [
  { width: "12rem" },
  { width: "10rem" },
  { width: "8rem" },
];
const SALE_PARTNER_ACTION_SKELETON = {
  width: "4.5rem",
  variant: "action" as const,
};

function SalesPartnerFormPanel({
  open,
  partner,
  onClose,
  onSaved,
  createPartner,
  updatePartner,
}: {
  open: boolean;
  partner: SalesPartnerRow | null;
  onClose: () => void;
  onSaved: (row: SalesPartnerRow, mode: "create" | "edit") => void;
  createPartner: PartnerCreator;
  updatePartner: PartnerUpdater;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const editing = Boolean(partner);

  useEffect(() => {
    if (!open) return;
    setName(partner?.name ?? "");
    setPhone(partner?.phone ?? "");
    setError(null);
    setNameError(null);
    setPhoneError(null);
  }, [open, partner]);

  const closeAndReset = () => {
    setError(null);
    setNameError(null);
    setPhoneError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    const nextPhone = phone.trim();
    const nextNameError = nextName
      ? null
      : t("salePartners.validation.nameRequired");
    const nextPhoneError = nextPhone
      ? null
      : t("salePartners.validation.phoneRequired");
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    if (nextNameError || nextPhoneError) return;

    setSubmitting(true);
    setError(null);
    try {
      const row = partner
        ? await updatePartner(partner.id, { name: nextName, phone: nextPhone })
        : await createPartner({ name: nextName, phone: nextPhone });
      onSaved(row, partner ? "edit" : "create");
      closeAndReset();
    } catch (saveError) {
      setError(
        readErrorMessage(
          saveError,
          t(editing ? "salePartners.editError" : "salePartners.createError"),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(editing ? "salePartners.editTitle" : "salePartners.createTitle")}
      description={t(
        editing
          ? "salePartners.editDescription"
          : "salePartners.createDescription",
      )}
      onClose={closeAndReset}
      closeLabel={t("salePartners.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("salePartners.cancel")}
          </Button>
          <Button
            type="submit"
            form="sale-partner-form"
            disabled={submitting}
          >
            {submitting
              ? t("salePartners.creating")
              : t("salePartners.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="sale-partner-form"
        className="sale-partners-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="sale-partners-field">
          <span>{t("salePartners.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("salePartners.fields.namePlaceholder")}
            autoComplete="name"
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="sale-partners-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="sale-partners-field">
          <span>{t("salePartners.fields.phone")}</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("salePartners.fields.phonePlaceholder")}
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={Boolean(phoneError)}
          />
          {phoneError ? (
            <em className="sale-partners-field-error">{phoneError}</em>
          ) : null}
        </label>
        {error ? <p className="sale-partners-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function SalesPartnersPage({
  loadPartners = fetchSalesPartners,
  createPartner = createSalesPartner,
  updatePartner = updateSalesPartner,
  deletePartner = archiveSalesPartner,
  canCreate: canCreateProp,
  canEdit: canEditProp,
  canDelete: canDeleteProp,
}: {
  loadPartners?: PartnersLoader;
  createPartner?: PartnerCreator;
  updatePartner?: PartnerUpdater;
  deletePartner?: PartnerDeleter;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canCreate =
    canCreateProp ??
    pageAccess.canAccess(ORDER_ACTION_PERMISSION_KEYS.salePartners.create);
  const canEdit =
    canEditProp ??
    pageAccess.canAccess(ORDER_ACTION_PERMISSION_KEYS.salePartners.edit);
  const canDelete =
    canDeleteProp ??
    pageAccess.canAccess(ORDER_ACTION_PERMISSION_KEYS.salePartners.delete);
  const showRowActions = canEdit || canDelete;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );
  const [rows, setRows] = useState<SalesPartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<SalesPartnerRow | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPartners({ search: appliedSearch })
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("salePartners.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedSearch, loadPartners, reloadKey, t]);

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const openCreate = () => {
    if (!canCreate) return;
    setEditingPartner(null);
    setPanelOpen(true);
  };

  const openEdit = (row: SalesPartnerRow) => {
    if (!canEdit) return;
    setEditingPartner(row);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingPartner(null);
  };

  const handleDelete = async (row: SalesPartnerRow) => {
    if (!canDelete || deletingId) return;
    const confirmed = window.confirm(t("salePartners.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deletePartner(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      setActionError(
        readErrorMessage(saveError, t("salePartners.deleteError")),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const panelAllowed = panelOpen && (editingPartner ? canEdit : canCreate);

  return (
    <section className="sale-partners-page">
      <header className="page-heading sale-partners-heading">
        <div>
          <span className="eyebrow">{t("salePartners.eyebrow")}</span>
          <h1>{t("salePartners.title")}</h1>
        </div>
        {canCreate ? (
          <Button type="button" onClick={openCreate}>
            <Plus />
            {t("salePartners.add")}
          </Button>
        ) : null}
      </header>

      <article className="panel sale-partners-panel">
        <header className="sale-partners-toolbar">
          <ListSearchBar
            id="sale-partners-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => setAppliedSearch(draftSearch.trim())}
            label={t("salePartners.search")}
            placeholder={t("salePartners.searchPlaceholder")}
            submitLabel={t("salePartners.searchAction")}
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("salePartners.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              {t("salePartners.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Handshake />
            <div>
              <strong>{t("salePartners.empty")}</strong>
              <span>{t("salePartners.emptyDescription")}</span>
            </div>
            {canCreate ? (
              <Button type="button" onClick={openCreate}>
                <Plus />
                {t("salePartners.add")}
              </Button>
            ) : null}
          </div>
        ) : (
          <ListTable
            className="sale-partners-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("salePartners.loading")}
            skeletonRows={8}
            skeletonColumns={
              showRowActions
                ? [...SALE_PARTNER_SKELETON_COLUMNS, SALE_PARTNER_ACTION_SKELETON]
                : SALE_PARTNER_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("salePartners.columns.name")}</th>
                <th>{t("salePartners.columns.phone")}</th>
                <th>{t("salePartners.columns.created")}</th>
                {showRowActions ? (
                  <th aria-label={t("salePartners.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{display(row.phone)}</td>
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
                          aria-label={t("salePartners.edit")}
                          title={t("salePartners.edit")}
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
                          aria-label={t("salePartners.delete")}
                          title={t("salePartners.delete")}
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

      <SalesPartnerFormPanel
        open={panelAllowed}
        partner={editingPartner}
        onClose={closePanel}
        createPartner={createPartner}
        updatePartner={updatePartner}
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
