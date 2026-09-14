import { useEffect, useState, type FormEvent } from "react";
import { BellRing, Mail, MessageCircleMore, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  deleteOrderFirstNotificationRecipient,
  deleteOrderEmailNotificationAddress,
  fetchOrderEmailNotificationUsers,
  fetchOrderFirstNotificationRecipients,
  saveOrderEmailNotificationAddress,
  saveOrderFirstNotificationRecipient,
  setOrderEmailNotificationUser,
  type OrderEmailNotificationUser,
  type OrderFirstNotificationRecipient,
} from "@/lib/order-notification-settings";
import {
  fetchWatiNotificationControls,
  setWatiNotificationControl,
  type WatiNotificationControlKey,
  type WatiNotificationControls,
} from "@/lib/wati-notification-settings";

export function WatiNotificationSettings({
  loadControls = fetchWatiNotificationControls,
  setControl = setWatiNotificationControl,
}: {
  loadControls?: typeof fetchWatiNotificationControls;
  setControl?: typeof setWatiNotificationControl;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings.wati_notifications");
  const [controls, setControls] = useState<WatiNotificationControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [updating, setUpdating] = useState<WatiNotificationControlKey | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void loadControls()
      .then((value) => {
        if (active) setControls(value);
      })
      .catch(() => {
        if (active) {
          setControls(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadControls, reloadKey]);

  const toggle = async (
    key: WatiNotificationControlKey,
    enabled: boolean,
  ) => {
    if (!canManage || updating || !controls) return;
    const previous = controls;
    setUpdating(key);
    setActionError(false);
    const optimisticField: Record<WatiNotificationControlKey, keyof WatiNotificationControls> = {
      automatic_notifications: "automaticNotificationsEnabled",
      automatic_email_notifications: "automaticEmailNotificationsEnabled",
      manual_order_confirmation: "manualOrderConfirmationEnabled",
      manual_order_confirmation_email: "manualOrderConfirmationEmailEnabled",
    };
    setControls({
      ...controls,
      [optimisticField[key]]: enabled,
    });
    try {
      setControls(await setControl(key, enabled));
    } catch {
      setControls(previous);
      setActionError(true);
    } finally {
      setUpdating(null);
    }
  };

  if (loadError) {
    return (
      <div className="orders-state orders-state-error" role="alert">
        <MessageCircleMore />
        <div>
          <strong>{t("orderSettings.watiNotifications.loadError")}</strong>
          <span>{t("orderSettings.watiNotifications.loadErrorDescription")}</span>
        </div>
        <Button type="button" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          {t("orderSettings.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="wati-notification-settings" aria-busy={loading}>
      <p className="wati-notification-settings-description">
        {t("orderSettings.watiNotifications.description")}
      </p>
      {actionError ? (
        <p className="list-inline-error" role="alert">
          {t("orderSettings.watiNotifications.updateError")}
        </p>
      ) : null}
      <div className="wati-notification-settings-list">
        <div className="wati-notification-setting-row">
          <div>
            <strong>{t("orderSettings.watiNotifications.automatic.title")}</strong>
            <span>{t("orderSettings.watiNotifications.automatic.description")}</span>
          </div>
          <Switch
            checked={controls?.automaticNotificationsEnabled ?? false}
            disabled={loading || !canManage || Boolean(updating)}
            aria-label={t("orderSettings.watiNotifications.automatic.toggle")}
            onCheckedChange={(enabled) => void toggle("automatic_notifications", enabled)}
          />
        </div>
        <div className="wati-notification-setting-row">
          <div>
            <strong>{t("orderSettings.watiNotifications.automaticEmail.title")}</strong>
            <span>{t("orderSettings.watiNotifications.automaticEmail.description")}</span>
          </div>
          <Switch
            checked={controls?.automaticEmailNotificationsEnabled ?? false}
            disabled={loading || !canManage || Boolean(updating)}
            aria-label={t("orderSettings.watiNotifications.automaticEmail.toggle")}
            onCheckedChange={(enabled) => void toggle("automatic_email_notifications", enabled)}
          />
        </div>
        <div className="wati-notification-setting-row">
          <div>
            <strong>{t("orderSettings.watiNotifications.manualConfirmation.title")}</strong>
            <span>{t("orderSettings.watiNotifications.manualConfirmation.description")}</span>
          </div>
          <Switch
            checked={controls?.manualOrderConfirmationEnabled ?? false}
            disabled={loading || !canManage || Boolean(updating)}
            aria-label={t("orderSettings.watiNotifications.manualConfirmation.toggle")}
            onCheckedChange={(enabled) => void toggle("manual_order_confirmation", enabled)}
          />
        </div>
        <div className="wati-notification-setting-row">
          <div>
            <strong>{t("orderSettings.watiNotifications.manualConfirmationEmail.title")}</strong>
            <span>{t("orderSettings.watiNotifications.manualConfirmationEmail.description")}</span>
          </div>
          <Switch
            checked={controls?.manualOrderConfirmationEmailEnabled ?? false}
            disabled={loading || !canManage || Boolean(updating)}
            aria-label={t("orderSettings.watiNotifications.manualConfirmationEmail.toggle")}
            onCheckedChange={(enabled) => void toggle("manual_order_confirmation_email", enabled)}
          />
        </div>
      </div>
    </div>
  );
}

export function OrderEmailNotificationSettings({
  loadUsers = fetchOrderEmailNotificationUsers,
  setUserEnabled = setOrderEmailNotificationUser,
  saveAddress = saveOrderEmailNotificationAddress,
  deleteAddress = deleteOrderEmailNotificationAddress,
}: {
  loadUsers?: typeof fetchOrderEmailNotificationUsers;
  setUserEnabled?: typeof setOrderEmailNotificationUser;
  saveAddress?: typeof saveOrderEmailNotificationAddress;
  deleteAddress?: typeof deleteOrderEmailNotificationAddress;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings.email_notifications");
  const [rows, setRows] = useState<OrderEmailNotificationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const [addressDrafts, setAddressDrafts] = useState<Record<string, string>>({});
  const [savingAddressFor, setSavingAddressFor] = useState<string | null>(null);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void loadUsers()
      .then((users) => {
        if (active) setRows(users);
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadUsers, reloadKey]);

  const toggle = async (row: OrderEmailNotificationUser, enabled: boolean) => {
    if (!canManage || updatingIds.has(row.userId)) return;
    setActionError(false);
    setUpdatingIds((current) => new Set(current).add(row.userId));
    setRows((current) => current.map((item) =>
      item.userId === row.userId ? { ...item, enabled } : item));
    try {
      const saved = await setUserEnabled(row.userId, enabled);
      setRows((current) => current.map((item) =>
        item.userId === saved.userId ? saved : item));
    } catch {
      setRows((current) => current.map((item) =>
        item.userId === row.userId ? row : item));
      setActionError(true);
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(row.userId);
        return next;
      });
    }
  };

  const addAddress = async (row: OrderEmailNotificationUser) => {
    const draft = addressDrafts[row.userId]?.trim() ?? "";
    if (!canManage || !draft || savingAddressFor || deletingAddressId) return;
    setActionError(false);
    setSavingAddressFor(row.userId);
    try {
      const saved = await saveAddress(row.userId, draft);
      setRows((current) => current.map((item) => item.userId === row.userId
        ? (() => {
            const addresses = item.additionalEmails ?? [];
            return {
            ...item,
            additionalEmails: addresses.some((address) => address.id === saved.id)
              ? addresses
              : [...addresses, saved],
            };
          })()
        : item));
      setAddressDrafts((current) => ({ ...current, [row.userId]: "" }));
    } catch {
      setActionError(true);
    } finally {
      setSavingAddressFor(null);
    }
  };

  const removeAddress = async (row: OrderEmailNotificationUser, addressId: string) => {
    if (!canManage || savingAddressFor || deletingAddressId) return;
    setActionError(false);
    setDeletingAddressId(addressId);
    try {
      await deleteAddress(addressId);
      setRows((current) => current.map((item) => item.userId === row.userId
        ? { ...item, additionalEmails: (item.additionalEmails ?? []).filter((address) => address.id !== addressId) }
        : item));
    } catch {
      setActionError(true);
    } finally {
      setDeletingAddressId(null);
    }
  };

  if (loadError) {
    return (
      <div className="orders-state orders-state-error" role="alert">
        <Mail />
        <div>
          <strong>{t("orderSettings.emailNotifications.loadError")}</strong>
          <span>{t("orderSettings.emailNotifications.loadErrorDescription")}</span>
        </div>
        <Button type="button" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          {t("orderSettings.retry")}
        </Button>
      </div>
    );
  }

  return (
    <>
      {actionError ? (
        <p className="list-inline-error" role="alert">
          {t("orderSettings.emailNotifications.updateError")}
        </p>
      ) : null}
      <ListTable
        className="order-settings-table-wrap"
        loading={loading}
        loadingLabel={t("orderSettings.emailNotifications.loading")}
        skeletonRows={12}
        skeletonColumns={2}
        onRefresh={() => setReloadKey((key) => key + 1)}
        header={<tr>
          <th>{t("orderSettings.emailNotifications.columns.user")}</th>
          <th>{t("orderSettings.emailNotifications.columns.email")}</th>
        </tr>}
      >
        {rows.map((row) => (
          <tr key={row.userId}>
            <td>
              <div className="order-notification-user-cell">
                <span>{row.userName}</span>
                <Switch
                  checked={row.enabled}
                  disabled={!canManage || updatingIds.has(row.userId)}
                  aria-label={t("orderSettings.emailNotifications.toggle", { name: row.userName })}
                  onCheckedChange={(enabled) => void toggle(row, enabled)}
                />
              </div>
            </td>
            <td>
              <div className="order-notification-email-list">
                <div className="order-notification-email-row">
                  <span>{row.email}</span>
                  <small>{t("orderSettings.emailNotifications.primary")}</small>
                </div>
                {(row.additionalEmails ?? []).map((address) => (
                  <div className="order-notification-email-row" key={address.id}>
                    <span>{address.email}</span>
                    {canManage ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={deletingAddressId === address.id || Boolean(savingAddressFor)}
                        aria-label={t("orderSettings.emailNotifications.deleteAddress", { email: address.email })}
                        onClick={() => void removeAddress(row, address.id)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {canManage ? (
                  <form
                    className="order-notification-email-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addAddress(row);
                    }}
                  >
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={addressDrafts[row.userId] ?? ""}
                      placeholder={t("orderSettings.emailNotifications.additionalPlaceholder")}
                      aria-label={t("orderSettings.emailNotifications.additionalLabel", { name: row.userName })}
                      onChange={(event) => setAddressDrafts((current) => ({
                        ...current,
                        [row.userId]: event.target.value,
                      }))}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!addressDrafts[row.userId]?.trim() || savingAddressFor === row.userId || Boolean(deletingAddressId)}
                    >
                      <Plus />
                      {t("orderSettings.emailNotifications.addAddress")}
                    </Button>
                  </form>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
        {!loading && rows.length === 0 ? (
          <tr><td colSpan={2} className="table-empty-cell">{t("orderSettings.emailNotifications.empty")}</td></tr>
        ) : null}
      </ListTable>
    </>
  );
}

function RecipientPanel({
  open,
  recipient,
  saveRecipient,
  onClose,
  onSaved,
}: {
  open: boolean;
  recipient: OrderFirstNotificationRecipient | null;
  saveRecipient: typeof saveOrderFirstNotificationRecipient;
  onClose: () => void;
  onSaved: (recipient: OrderFirstNotificationRecipient) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delayHours, setDelayHours] = useState("12");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(recipient?.name ?? "");
    setPhone(recipient?.phone ?? "");
    setDelayHours(recipient ? String(recipient.delayHours) : "12");
    setError(null);
  }, [open, recipient]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hours = Number(delayHours);
    if (!name.trim()) return setError("name_required");
    if (!phone.trim()) return setError("phone_required");
    if (delayHours.trim() === "" || !Number.isFinite(hours) || hours < 0) {
      return setError("delay_hours_invalid");
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveRecipient({
        id: recipient?.id,
        name,
        phone,
        delayHours: hours,
      });
      onSaved(saved);
      onClose();
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(recipient
        ? "orderSettings.firstNotificationRecipients.editTitle"
        : "orderSettings.firstNotificationRecipients.createTitle")}
      onClose={onClose}
      closeLabel={t("orderSettings.closePanel")}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>{t("orderSettings.cancel")}</Button>
        <Button type="submit" form="first-notification-recipient-form" disabled={saving}>
          {saving
            ? t("orderSettings.firstNotificationRecipients.saving")
            : t("orderSettings.firstNotificationRecipients.saveAction")}
        </Button>
      </>}
    >
      <form id="first-notification-recipient-form" className="order-settings-form" onSubmit={(event) => void submit(event)}>
        <label className="order-settings-field">
          <span>{t("orderSettings.firstNotificationRecipients.fields.name")}</span>
          <input value={name} autoComplete="name" aria-invalid={error === "name_required"} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="order-settings-field">
          <span>{t("orderSettings.firstNotificationRecipients.fields.phone")}</span>
          <input value={phone} type="tel" autoComplete="tel" aria-invalid={error === "phone_required"} placeholder={t("orderSettings.firstNotificationRecipients.fields.phonePlaceholder")} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="order-settings-field">
          <span>{t("orderSettings.firstNotificationRecipients.fields.delayHours")}</span>
          <input value={delayHours} type="number" min="0" step="0.5" inputMode="decimal" aria-invalid={error === "delay_hours_invalid"} onChange={(event) => setDelayHours(event.target.value)} />
        </label>
        {error ? <p className="list-inline-error" role="alert">
          {t(`orderSettings.firstNotificationRecipients.errors.${error}`)}
        </p> : null}
      </form>
    </SidePanel>
  );
}

export function OrderFirstNotificationRecipientsSettings({
  createOpen,
  onCreateOpenChange,
  loadRecipients = fetchOrderFirstNotificationRecipients,
  saveRecipient = saveOrderFirstNotificationRecipient,
  deleteRecipient = deleteOrderFirstNotificationRecipient,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  loadRecipients?: typeof fetchOrderFirstNotificationRecipients;
  saveRecipient?: typeof saveOrderFirstNotificationRecipient;
  deleteRecipient?: typeof deleteOrderFirstNotificationRecipient;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings.first_notification_recipients");
  const [rows, setRows] = useState<OrderFirstNotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [editing, setEditing] = useState<OrderFirstNotificationRecipient | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void loadRecipients()
      .then((recipients) => {
        if (active) setRows(recipients);
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRecipients, reloadKey]);

  const remove = async (row: OrderFirstNotificationRecipient) => {
    if (!canManage || deletingId) return;
    if (!window.confirm(t("orderSettings.firstNotificationRecipients.deleteConfirm", { name: row.name }))) return;
    setDeletingId(row.id);
    setActionError(false);
    try {
      await deleteRecipient(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch {
      setActionError(true);
    } finally {
      setDeletingId(null);
    }
  };

  if (loadError) {
    return (
      <div className="orders-state orders-state-error" role="alert">
        <BellRing />
        <div>
          <strong>{t("orderSettings.firstNotificationRecipients.loadError")}</strong>
          <span>{t("orderSettings.firstNotificationRecipients.loadErrorDescription")}</span>
        </div>
        <Button type="button" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>{t("orderSettings.retry")}</Button>
      </div>
    );
  }

  return (
    <>
      {actionError ? <p className="list-inline-error" role="alert">{t("orderSettings.firstNotificationRecipients.deleteError")}</p> : null}
      <ListTable
        className="order-settings-table-wrap"
        loading={loading}
        loadingLabel={t("orderSettings.firstNotificationRecipients.loading")}
        skeletonRows={8}
        skeletonColumns={canManage ? 4 : 3}
        onRefresh={() => setReloadKey((key) => key + 1)}
        header={<tr>
          <th>{t("orderSettings.firstNotificationRecipients.columns.name")}</th>
          <th>{t("orderSettings.firstNotificationRecipients.columns.phone")}</th>
          <th>{t("orderSettings.firstNotificationRecipients.columns.delayHours")}</th>
          {canManage ? <th>{t("orderSettings.firstNotificationRecipients.columns.actions")}</th> : null}
        </tr>}
      >
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.phone}</td>
            <td>{row.delayHours}</td>
            {canManage ? <td className="table-actions-cell"><div className="table-row-actions">
              <Button type="button" variant="outline" size="icon" aria-label={t("orderSettings.firstNotificationRecipients.edit", { name: row.name })} onClick={() => setEditing(row)}><Pencil /></Button>
              <Button type="button" variant="destructive" size="icon" disabled={deletingId === row.id} aria-label={t("orderSettings.firstNotificationRecipients.delete", { name: row.name })} onClick={() => void remove(row)}><Trash2 /></Button>
            </div></td> : null}
          </tr>
        ))}
        {!loading && rows.length === 0 ? <tr><td colSpan={canManage ? 4 : 3} className="table-empty-cell">{t("orderSettings.firstNotificationRecipients.empty")}</td></tr> : null}
      </ListTable>
      <RecipientPanel
        open={canManage && (createOpen || Boolean(editing))}
        recipient={editing}
        saveRecipient={saveRecipient}
        onClose={() => {
          setEditing(null);
          onCreateOpenChange(false);
        }}
        onSaved={(saved) => setRows((current) => {
          const exists = current.some((row) => row.id === saved.id);
          return exists
            ? current.map((row) => row.id === saved.id ? saved : row)
            : [...current, saved];
        })}
      />
    </>
  );
}
