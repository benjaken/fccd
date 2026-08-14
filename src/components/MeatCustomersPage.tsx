import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import {
  archiveMeatCustomer,
  createMeatCustomer,
  fetchMeatCustomers,
  type MeatCustomerFilters,
  type MeatCustomerRow,
} from "@/lib/meat-customers";

type CustomersLoader = (
  filters?: MeatCustomerFilters,
) => Promise<MeatCustomerRow[]>;
type CustomerCreator = typeof createMeatCustomer;
type CustomerDeleter = typeof archiveMeatCustomer;

const MEAT_CUSTOMERS_SKELETON_COLUMNS = [
  { width: "6rem" },
  { width: "10rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "28rem" },
  { width: "2.5rem", variant: "action" as const },
];

function CreateMeatCustomerPanel({
  open,
  onClose,
  onCreated,
  createCustomer,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: MeatCustomerRow) => void;
  createCustomer: CustomerCreator;
}) {
  const { t } = useTranslation();
  const [customerCode, setCustomerCode] = useState("");
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const closeAndReset = () => {
    setCustomerCode("");
    setName("");
    setContactPerson("");
    setPhone("");
    setAddress("");
    setError(null);
    setNameError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t("meatCustomers.validation.nameRequired"));
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setError(null);
    try {
      const row = await createCustomer({
        customerCode,
        name,
        contactPerson,
        phone,
        address,
      });
      onCreated(row);
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("meatCustomers.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("meatCustomers.createTitle")}
      onClose={closeAndReset}
      closeLabel={t("meatCustomers.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("meatCustomers.cancel")}
          </Button>
          <Button
            type="submit"
            form="create-meat-customer-form"
            disabled={submitting}
          >
            {submitting
              ? t("meatCustomers.creating")
              : t("meatCustomers.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="create-meat-customer-form"
        className="meat-customers-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="meat-customers-field">
          <span>{t("meatCustomers.fields.customerCode")}</span>
          <input
            value={customerCode}
            onChange={(event) => setCustomerCode(event.target.value)}
            placeholder={t("meatCustomers.fields.customerCodePlaceholder")}
          />
        </label>
        <label className="meat-customers-field">
          <span>{t("meatCustomers.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("meatCustomers.fields.namePlaceholder")}
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="meat-customers-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="meat-customers-field">
          <span>{t("meatCustomers.fields.contactPerson")}</span>
          <input
            value={contactPerson}
            onChange={(event) => setContactPerson(event.target.value)}
            placeholder={t("meatCustomers.fields.contactPlaceholder")}
          />
        </label>
        <label className="meat-customers-field">
          <span>{t("meatCustomers.fields.phone")}</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("meatCustomers.fields.phonePlaceholder")}
          />
        </label>
        <label className="meat-customers-field">
          <span>{t("meatCustomers.fields.address")}</span>
          <textarea
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t("meatCustomers.fields.addressPlaceholder")}
            rows={3}
          />
        </label>
        {error ? <p className="meat-customers-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function MeatCustomersPage({
  loadCustomers = fetchMeatCustomers,
  createCustomer = createMeatCustomer,
  deleteCustomer = archiveMeatCustomer,
}: {
  loadCustomers?: CustomersLoader;
  createCustomer?: CustomerCreator;
  deleteCustomer?: CustomerDeleter;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MeatCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadCustomers({
      search: appliedSearch,
    })
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("meatCustomers.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedSearch, loadCustomers, reloadKey, t]);

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
  };

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const handleDelete = async (row: MeatCustomerRow) => {
    if (deletingId) return;
    const confirmed = window.confirm(t("meatCustomers.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteCustomer(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("meatCustomers.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="meat-customers-page">
      <header className="page-heading meat-customers-heading">
        <div>
          <span className="eyebrow">{t("meatCustomers.eyebrow")}</span>
          <h1>{t("meatCustomers.title")}</h1>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          {t("meatCustomers.add")}
        </Button>
      </header>

      <article className="panel meat-customers-panel">
        <header className="meat-customers-toolbar">
          <ListSearchBar
            id="meat-customers-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("meatCustomers.search")}
            placeholder={t("meatCustomers.searchPlaceholder")}
            submitLabel={t("meatCustomers.searchAction")}
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("meatCustomers.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              {t("meatCustomers.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Users />
            <div>
              <strong>{t("meatCustomers.empty")}</strong>
              <span>{t("meatCustomers.emptyDescription")}</span>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("meatCustomers.add")}
            </Button>
          </div>
        ) : (
          <ListTable
            className="meat-customers-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("meatCustomers.loading")}
            skeletonRows={8}
            skeletonColumns={MEAT_CUSTOMERS_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("meatCustomers.columns.customerCode")}</th>
                <th>{t("meatCustomers.columns.name")}</th>
                <th>{t("meatCustomers.columns.contactPerson")}</th>
                <th>{t("meatCustomers.columns.phone")}</th>
                <th className="meat-customers-address-cell">
                  {t("meatCustomers.columns.address")}
                </th>
                <th aria-label={t("meatCustomers.columns.actions")} />
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{display(row.customerCode)}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{display(row.contactPerson)}</td>
                <td>{display(row.phone)}</td>
                <td className="meat-customers-address-cell">
                  {display(row.address)}
                </td>
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={deletingId === row.id}
                      aria-label={t("meatCustomers.delete")}
                      title={t("meatCustomers.delete")}
                      onClick={() => {
                        void handleDelete(row);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </ListTable>
        )}
      </article>

      <CreateMeatCustomerPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        createCustomer={createCustomer}
        onCreated={(row) => {
          setRows((current) => [row, ...current]);
          setCreateOpen(false);
        }}
      />
    </section>
  );
}
