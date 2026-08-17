import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CreditCard, Pencil, Plus } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createPaymentMethod,
  fetchPaymentMethods,
  sortPaymentMethods,
  updatePaymentMethod,
  type PaymentMethod,
} from "@/lib/payment-methods";

type MethodsLoader = () => Promise<PaymentMethod[]>;
type MethodCreator = typeof createPaymentMethod;
type MethodUpdater = typeof updatePaymentMethod;

const SKELETON_COLUMNS = [{ width: "70%" }, { width: "4.5rem" }];
const ACTION_SKELETON = { width: "2.5rem", variant: "action" as const };

function PaymentMethodPanel({
  open,
  method,
  onClose,
  onSaved,
  createMethod,
  updateMethod,
}: {
  open: boolean;
  method: PaymentMethod | null;
  onClose: () => void;
  onSaved: (row: PaymentMethod) => void;
  createMethod: MethodCreator;
  updateMethod: MethodUpdater;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(method);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(method?.name ?? "");
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
        ? await updateMethod(method.id, { name, isActive })
        : await createMethod({ name, isActive });
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
          ? t("orderSettings.payments.editTitle")
          : t("orderSettings.payments.createTitle")
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
            form="payment-method-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderSettings.payments.saving")
              : t("orderSettings.payments.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="payment-method-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.payments.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            placeholder={t("orderSettings.payments.fields.namePlaceholder")}
            aria-label={t("orderSettings.payments.fields.name")}
            aria-invalid={Boolean(error)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="order-settings-switch-field">
          <span>{t("orderSettings.payments.columns.active")}</span>
          <Switch
            checked={isActive}
            aria-label={t("orderSettings.payments.columns.active")}
            onCheckedChange={setIsActive}
          />
        </label>
        {error ? (
          <p className="list-inline-error" role="alert">
            {t(`orderSettings.payments.errors.${error}`, {
              defaultValue: t("orderSettings.payments.saveError"),
            })}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderPaymentMethodsTable({
  loadMethods = fetchPaymentMethods,
  createMethod = createPaymentMethod,
  updateMethod = updatePaymentMethod,
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
  const [rows, setRows] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadMethods()
      .then((next) => {
        if (!cancelled) setRows(sortPaymentMethods(next));
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

  const replaceRow = (updated: PaymentMethod) => {
    setRows((current) =>
      sortPaymentMethods(
        current.some((item) => item.id === updated.id)
          ? current.map((item) => (item.id === updated.id ? updated : item))
          : [...current, updated],
      ),
    );
  };

  const handleToggle = useEffectEvent(async (row: PaymentMethod, next: boolean) => {
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
      const updated = await updateMethod(row.id, { isActive: next });
      replaceRow(updated);
    } catch {
      setRows(previous);
      setActionError(t("orderSettings.payments.toggleError"));
    } finally {
      setTogglingId(null);
    }
  });

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
          <CreditCard />
          <div>
            <strong>{t("orderSettings.payments.loadError")}</strong>
            <span>{t("orderSettings.payments.loadErrorDescription")}</span>
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
          <CreditCard />
          <div>
            <strong>{t("orderSettings.payments.empty")}</strong>
            <span>{t("orderSettings.payments.emptyDescription")}</span>
          </div>
          {canManage ? (
            <Button type="button" onClick={() => onCreateOpenChange(true)}>
              <Plus />
              {t("orderSettings.payments.add")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.payments.loading")}
          skeletonRows={12}
          skeletonColumns={
            canManage ? [...SKELETON_COLUMNS, ACTION_SKELETON] : SKELETON_COLUMNS
          }
          header={
            <tr>
              <th>{t("orderSettings.payments.columns.name")}</th>
              <th className="order-settings-active-col">
                {t("orderSettings.payments.columns.active")}
              </th>
              {canManage ? (
                <th aria-label={t("orderSettings.payments.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td className="order-settings-active-col">
                <Switch
                  checked={row.isActive}
                  disabled={!canManage || togglingId === row.id}
                  aria-label={t("orderSettings.payments.toggleActive", {
                    name: row.name,
                  })}
                  onCheckedChange={(checked) => {
                    void handleToggle(row, checked);
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
                      aria-label={t("orderSettings.payments.edit", {
                        name: row.name,
                      })}
                      title={t("orderSettings.payments.edit", {
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

      <PaymentMethodPanel
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
