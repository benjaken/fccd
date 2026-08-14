import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
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

const MEAT_CUSTOMERS_SKELETON_COLUMNS = [
  { width: "6rem" },
  { width: "10rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "14rem" },
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
      Boolean(applied.customerCode || applied.name || applied.phone),
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

  const submitSearch = () => {
    setApplied({
      ...draft,
      search: draft.search.trim(),
    });
  };

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

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
            value={draft.search}
            onChange={(value) =>
              setDraft((current) => ({ ...current, search: value }))
            }
            onSubmit={submitSearch}
            label={t("meatCustomers.search")}
            placeholder={t("meatCustomers.searchPlaceholder")}
            submitLabel={t("meatCustomers.searchAction")}
            filtersActive={filtersActive}
            onConfirmFilters={() => {
              setApplied((current) => ({
                ...draft,
                search: current.search,
              }));
            }}
            onDismissFilters={() => {
              setDraft((current) => ({
                ...applied,
                search: current.search,
              }));
            }}
            filters={
              <div className="meat-customers-filters">
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
                  />
                </label>
              </div>
            }
          />
        </header>

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
                <th>{t("meatCustomers.columns.address")}</th>
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
