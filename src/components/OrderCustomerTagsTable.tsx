import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Tags } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SearchSelect } from "@/components/ui/search-select";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createCustomerTag,
  fetchCustomerTags,
  fetchCustomerTagTypes,
  filterCustomerTags,
  sortCustomerTags,
  updateCustomerTag,
  type CustomerTag,
  type CustomerTagInput,
  type CustomerTagType,
} from "@/lib/customer-tags";

type TagsLoader = () => Promise<CustomerTag[]>;
type TypesLoader = () => Promise<CustomerTagType[]>;
type TagCreator = (input: CustomerTagInput) => Promise<CustomerTag>;
type TagUpdater = (
  id: string,
  input: Partial<CustomerTagInput>,
) => Promise<CustomerTag>;

const SKELETON_COLUMNS = [
  { width: "32%" },
  { width: "48%" },
  { width: "4.5rem" },
];
const ACTION_SKELETON = { width: "2.5rem", variant: "action" as const };

function CustomerTagPanel({
  open,
  tag,
  types,
  onClose,
  onSaved,
  createTag,
  updateTag,
}: {
  open: boolean;
  tag: CustomerTag | null;
  types: CustomerTagType[];
  onClose: () => void;
  onSaved: (tag: CustomerTag) => void;
  createTag: TagCreator;
  updateTag: TagUpdater;
}) {
  const { t } = useTranslation();
  const [typeId, setTypeId] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTypeId(tag?.typeId ?? types.find((type) => type.isActive)?.id ?? "");
    setName(tag?.name ?? "");
    setIsActive(tag?.isActive ?? true);
    setError(null);
  }, [open, tag, types]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!typeId) {
      setError("type_required");
      return;
    }
    if (!name.trim()) {
      setError("name_required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved = tag
        ? await updateTag(tag.id, { typeId, name, isActive })
        : await createTag({ typeId, name, isActive });
      onSaved(saved);
      onClose();
    } catch {
      setError(tag ? "update_failed" : "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={
        tag
          ? t("orderSettings.customerTags.editTitle")
          : t("orderSettings.customerTags.createTitle")
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
            form="customer-tag-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderSettings.customerTags.saving")
              : t("orderSettings.customerTags.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="customer-tag-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.customerTags.fields.type")}</span>
          <SearchSelect
            id="customer-tag-type"
            value={typeId}
            label={t("orderSettings.customerTags.fields.type")}
            options={types.map((type) => ({ id: type.id, name: type.name }))}
            placeholder={t("orderSettings.customerTags.fields.typePlaceholder")}
            searchPlaceholder={t("orderSettings.customerTags.fields.typeSearchPlaceholder")}
            emptyLabel={t("orderSettings.customerTags.fields.typeEmpty")}
            required
            invalid={error === "type_required"}
            onChange={(option) => setTypeId(option.id)}
          />
        </label>
        <label className="order-settings-field">
          <span>{t("orderSettings.customerTags.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            placeholder={t("orderSettings.customerTags.fields.namePlaceholder")}
            aria-label={t("orderSettings.customerTags.fields.name")}
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
            {t(`orderSettings.customerTags.errors.${error}`)}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderCustomerTagsTable({
  loadTags = fetchCustomerTags,
  loadTypes = fetchCustomerTagTypes,
  createTag = createCustomerTag,
  updateTag = updateCustomerTag,
  createOpen,
  onCreateOpenChange,
}: {
  loadTags?: TagsLoader;
  loadTypes?: TypesLoader;
  createTag?: TagCreator;
  updateTag?: TagUpdater;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const [rows, setRows] = useState<CustomerTag[]>([]);
  const [types, setTypes] = useState<CustomerTagType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerTag | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const visibleRows = useMemo(
    () => filterCustomerTags(rows, appliedSearch),
    [appliedSearch, rows],
  );
  const hasSearch = Boolean(appliedSearch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void Promise.all([loadTags(), loadTypes()])
      .then(([nextRows, nextTypes]) => {
        if (cancelled) return;
        setRows(sortCustomerTags(nextRows));
        setTypes(nextTypes);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setTypes([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTags, loadTypes, reloadKey]);

  useEffect(() => {
    if (createOpen) setEditing(null);
  }, [createOpen]);

  const replaceRow = (saved: CustomerTag) => {
    setRows((current) =>
      sortCustomerTags(
        current.some((row) => row.id === saved.id)
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved],
      ),
    );
  };

  const handleToggle = useEffectEvent(async (row: CustomerTag, next: boolean) => {
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
      replaceRow(await updateTag(row.id, { isActive: next }));
    } catch {
      setRows(previous);
      setActionError(t("orderSettings.customerTags.toggleError"));
    } finally {
      setTogglingId(null);
    }
  });

  return (
    <>
      <header className="order-settings-toolbar">
        <ListSearchBar
          id="customer-tags-search"
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => setAppliedSearch(draftSearch.trim())}
          label={t("orderSettings.customerTags.search")}
          placeholder={t("orderSettings.customerTags.searchPlaceholder")}
          submitLabel={t("orderSettings.customerTags.searchAction")}
        />
      </header>

      {actionError ? (
        <p className="list-inline-error" role="alert">{actionError}</p>
      ) : null}

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <Tags />
          <div>
            <strong>{t("orderSettings.customerTags.loadError")}</strong>
            <span>{t("orderSettings.customerTags.loadErrorDescription")}</span>
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
          <Tags />
          <div>
            <strong>
              {hasSearch
                ? t("orderSettings.customerTags.emptySearch")
                : t("orderSettings.customerTags.empty")}
            </strong>
            <span>
              {hasSearch
                ? t("orderSettings.customerTags.emptySearchDescription")
                : t("orderSettings.customerTags.emptyDescription")}
            </span>
          </div>
          {canManage && !hasSearch && types.length > 0 ? (
            <Button type="button" onClick={() => onCreateOpenChange(true)}>
              <Plus />
              {t("orderSettings.customerTags.add")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.customerTags.loading")}
          skeletonRows={12}
          skeletonColumns={
            canManage ? [...SKELETON_COLUMNS, ACTION_SKELETON] : SKELETON_COLUMNS
          }
          header={
            <tr>
              <th>{t("orderSettings.customerTags.columns.type")}</th>
              <th>{t("orderSettings.customerTags.columns.name")}</th>
              <th className="order-settings-active-col">
                {t("orderSettings.active")}
              </th>
              {canManage ? (
                <th aria-label={t("orderSettings.customerTags.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {visibleRows.map((row) => (
            <tr key={row.id}>
              <td>{row.typeName || "—"}</td>
              <td>{row.name}</td>
              <td className="order-settings-active-col">
                <Switch
                  checked={row.isActive}
                  disabled={!canManage || togglingId === row.id}
                  aria-label={t("orderSettings.customerTags.toggleActive", {
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
                      aria-label={t("orderSettings.customerTags.edit", {
                        name: row.name,
                      })}
                      title={t("orderSettings.customerTags.edit", {
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

      <CustomerTagPanel
        open={createOpen || Boolean(editing)}
        tag={editing}
        types={types}
        createTag={createTag}
        updateTag={updateTag}
        onSaved={replaceRow}
        onClose={() => {
          onCreateOpenChange(false);
          setEditing(null);
        }}
      />
    </>
  );
}
