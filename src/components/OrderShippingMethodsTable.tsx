import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Truck } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createShippingMethod,
  fetchShippingMethods,
  sortShippingMethods,
  updateShippingMethod,
  type ShippingMethod,
} from "@/lib/shipping-methods";

type MethodsLoader = () => Promise<ShippingMethod[]>;
type MethodCreator = typeof createShippingMethod;
type MethodUpdater = typeof updateShippingMethod;

const SKELETON_COLUMNS = [
  { width: "2.5rem" },
  { width: "55%" },
  { width: "4.5rem" },
  { width: "4.5rem" },
];
const ACTION_SKELETON = { width: "2.5rem", variant: "action" as const };

function ShippingMethodPanel({
  open,
  method,
  onClose,
  onSaved,
  createMethod,
  updateMethod,
}: {
  open: boolean;
  method: ShippingMethod | null;
  onClose: () => void;
  onSaved: (row: ShippingMethod) => void;
  createMethod: MethodCreator;
  updateMethod: MethodUpdater;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(method);
  const nameLocked = isEdit && !method?.isEditable;
  const [name, setName] = useState("");
  const [requiresAddress, setRequiresAddress] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(method?.displayName ?? "");
    setRequiresAddress(method?.requiresAddressCheck ?? false);
    setIsActive(method?.isActive ?? true);
    setError(null);
  }, [method, open]);

  const closeAndReset = () => {
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("name_required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved = method
        ? await updateMethod(method.id, {
            name: nameLocked ? undefined : name,
            requiresAddressCheck: requiresAddress,
            isActive,
          })
        : await createMethod({
            name,
            requiresAddressCheck: requiresAddress,
            isActive,
          });
      onSaved(saved);
      onClose();
    } catch {
      setError(isEdit ? "update_failed" : "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={
        isEdit
          ? t("orderSettings.shipping.editTitle")
          : t("orderSettings.shipping.createTitle")
      }
      onClose={closeAndReset}
      closeLabel={t("orderSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("orderSettings.cancel")}
          </Button>
          <Button
            type="submit"
            form="shipping-method-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderSettings.shipping.saving")
              : t("orderSettings.shipping.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="shipping-method-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.shipping.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            disabled={nameLocked}
            placeholder={t("orderSettings.shipping.fields.namePlaceholder")}
            aria-label={t("orderSettings.shipping.fields.name")}
            aria-invalid={Boolean(error)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {nameLocked ? (
          <p className="order-settings-locked-hint">
            {t("orderSettings.shipping.lockedHint")}
          </p>
        ) : null}
        <label className="order-settings-switch-field">
          <span>{t("orderSettings.shipping.fields.address")}</span>
          <Switch
            checked={requiresAddress}
            aria-label={t("orderSettings.shipping.fields.address")}
            onCheckedChange={setRequiresAddress}
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
            {t(`orderSettings.shipping.errors.${error}`, {
              defaultValue: t("orderSettings.shipping.saveError"),
            })}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderShippingMethodsTable({
  loadMethods = fetchShippingMethods,
  createMethod = createShippingMethod,
  updateMethod = updateShippingMethod,
  createOpen,
  onCreateOpenChange,
}: {
  loadMethods?: MethodsLoader;
  createMethod?: MethodCreator;
  updateMethod?: MethodUpdater;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const [rows, setRows] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShippingMethod | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadMethods()
      .then((next) => {
        if (!cancelled) setRows(sortShippingMethods(next));
      })
      .catch(() => {
        if (!cancelled) {
          setError("load_failed");
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMethods, reloadKey]);

  useEffect(() => {
    if (createOpen) setEditing(null);
  }, [createOpen]);

  const replaceRow = (updated: ShippingMethod) => {
    setRows((current) =>
      sortShippingMethods(
        current.some((item) => item.id === updated.id)
          ? current.map((item) => (item.id === updated.id ? updated : item))
          : [...current, updated],
      ),
    );
  };

  const handleToggle = useEffectEvent(
    async (
      row: ShippingMethod,
      field: "requiresAddressCheck" | "isActive",
      next: boolean,
    ) => {
      if (!canManage || togglingId) return;
      setTogglingId(row.id);
      setActionError(null);
      const previous = rows;
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, [field]: next } : item,
        ),
      );
      try {
        const updated = await updateMethod(row.id, { [field]: next });
        replaceRow(updated);
      } catch {
        setRows(previous);
        setActionError(t("orderSettings.shipping.toggleError"));
      } finally {
        setTogglingId(null);
      }
    },
  );

  const panelOpen = createOpen || Boolean(editing);

  return (
    <>
      {actionError ? (
        <p className="list-inline-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <Truck />
          <div>
            <strong>{t("orderSettings.shipping.loadError")}</strong>
            <span>{t("orderSettings.shipping.loadErrorDescription")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("orderSettings.retry")}
          </Button>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="orders-state">
          <Truck />
          <div>
            <strong>{t("orderSettings.shipping.empty")}</strong>
            <span>{t("orderSettings.shipping.emptyDescription")}</span>
          </div>
          {canManage ? (
            <Button type="button" onClick={() => onCreateOpenChange(true)}>
              <Plus />
              {t("orderSettings.shipping.add")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.shipping.loading")}
          skeletonRows={8}
          skeletonColumns={
            canManage ? [...SKELETON_COLUMNS, ACTION_SKELETON] : SKELETON_COLUMNS
          }
          header={
            <tr>
              <th
                className="order-settings-index-col"
                aria-label={t("orderSettings.shipping.columns.index")}
              />
              <th>{t("orderSettings.shipping.columns.name")}</th>
              <th className="order-settings-active-col">
                {t("orderSettings.shipping.columns.address")}
              </th>
              <th className="order-settings-active-col">
                {t("orderSettings.active")}
              </th>
              {canManage ? (
                <th aria-label={t("orderSettings.shipping.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td className="order-settings-index-col">{index + 1}</td>
              <td>{row.displayName}</td>
              <td className="order-settings-active-col">
                <Switch
                  checked={row.requiresAddressCheck}
                  disabled={!canManage || togglingId === row.id}
                  aria-label={t("orderSettings.shipping.toggleAddress", {
                    name: row.displayName,
                  })}
                  onCheckedChange={(checked) => {
                    void handleToggle(row, "requiresAddressCheck", checked);
                  }}
                />
              </td>
              <td className="order-settings-active-col">
                <Switch
                  checked={row.isActive}
                  disabled={!canManage || togglingId === row.id}
                  aria-label={t("orderSettings.shipping.toggleActive", {
                    name: row.displayName,
                  })}
                  onCheckedChange={(checked) => {
                    void handleToggle(row, "isActive", checked);
                  }}
                />
              </td>
              {canManage ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("orderSettings.shipping.edit", {
                        name: row.displayName,
                      })}
                      title={t("orderSettings.shipping.edit", {
                        name: row.displayName,
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

      <ShippingMethodPanel
        open={panelOpen}
        method={editing}
        createMethod={createMethod}
        updateMethod={updateMethod}
        onClose={() => {
          onCreateOpenChange(false);
          setEditing(null);
        }}
        onSaved={replaceRow}
      />
    </>
  );
}
