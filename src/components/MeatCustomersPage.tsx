import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createMeatCustomer,
  fetchMeatCustomers,
  type MeatCustomerFilters,
  type MeatCustomerRow,
} from "@/lib/meat-customers";

type CustomersLoader = (
  filters?: MeatCustomerFilters,
) => Promise<MeatCustomerRow[]>;
type CustomerCreator = typeof createMeatCustomer;

type FilterDraft = {
  search: string;
  customerCode: string;
  name: string;
  phone: string;
};

const EMPTY_FILTERS: FilterDraft = {
  search: "",
  customerCode: "",
  name: "",
  phone: "",
};

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
      description={t("meatCustomers.createDescription")}
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
}: {
  loadCustomers?: CustomersLoader;
  createCustomer?: CustomerCreator;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MeatCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);

  const filtersActive = useMemo(
    () =>
      Boolean(
        applied.search ||
          applied.customerCode ||
          applied.name ||
          applied.phone,
      ),
    [applied],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadCustomers({
      search: applied.search,
      customerCode: applied.customerCode,
      name: applied.name,
      phone: applied.phone,
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
  }, [applied, loadCustomers, reloadKey, t]);

  const applyFilters = () => {
    setApplied({ ...draft });
  };

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  return (
    <section className="page-shell meat-customers-page">
      <div className="page-heading meat-customers-heading">
        <div>
          <p className="eyebrow">{t("meatCustomers.eyebrow")}</p>
          <h2>{t("meatCustomers.title")}</h2>
          <p>{t("meatCustomers.description")}</p>
        </div>
        <div className="meat-customers-heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw />
            {t("meatCustomers.refresh")}
          </Button>
        </div>
      </div>

      <div className="meat-customers-toolbar">
        <label className="meat-customers-search">
          <span className="sr-only">{t("meatCustomers.search")}</span>
          <Search aria-hidden="true" />
          <input
            value={draft.search}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
            placeholder={t("meatCustomers.searchPlaceholder")}
            aria-label={t("meatCustomers.search")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
              }
            }}
          />
        </label>
        <label className="meat-customers-filter">
          <span>{t("meatCustomers.fields.customerCode")}</span>
          <input
            value={draft.customerCode}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                customerCode: event.target.value,
              }))
            }
            aria-label={t("meatCustomers.fields.customerCode")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
              }
            }}
          />
        </label>
        <label className="meat-customers-filter">
          <span>{t("meatCustomers.fields.name")}</span>
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            aria-label={t("meatCustomers.fields.name")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
              }
            }}
          />
        </label>
        <label className="meat-customers-filter">
          <span>{t("meatCustomers.fields.phone")}</span>
          <input
            value={draft.phone}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                phone: event.target.value,
              }))
            }
            aria-label={t("meatCustomers.fields.phone")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
              }
            }}
          />
        </label>
        <Button type="button" variant="secondary" onClick={applyFilters}>
          {t("meatCustomers.searchAction")}
        </Button>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          {t("meatCustomers.add")}
        </Button>
      </div>

      {filtersActive ? (
        <p className="meat-customers-filter-hint">
          {t("meatCustomers.filtersActive")}
        </p>
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
      ) : loading ? (
        <div className="products-state">
          <Users />
          <strong>{t("meatCustomers.loading")}</strong>
        </div>
      ) : rows.length === 0 ? (
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
        <div className="meat-customers-table-wrap panel">
          <table className="meat-customers-table">
            <thead>
              <tr>
                <th>{t("meatCustomers.columns.customerCode")}</th>
                <th>{t("meatCustomers.columns.name")}</th>
                <th>{t("meatCustomers.columns.contactPerson")}</th>
                <th>{t("meatCustomers.columns.phone")}</th>
                <th>{t("meatCustomers.columns.address")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{display(row.customerCode)}</td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{display(row.contactPerson)}</td>
                  <td>{display(row.phone)}</td>
                  <td>{display(row.address)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
