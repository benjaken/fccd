import { useEffect, useState, type FormEvent } from "react";
import {
  BellRing,
  ClipboardCheck,
  Factory,
  FileBarChart,
  Mail,
  MessageCircleMore,
  PackageSearch,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
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
  NOTIFICATION_CONTROL_KEYS,
  setNotificationDeliveryControl,
  setNotificationRecipientPolicy,
  setWatiNotificationControl,
  type NotificationChannel,
  type NotificationControlKey,
  type NotificationRecipientMode,
  type WatiNotificationControlKey,
  type WatiNotificationControls,
} from "@/lib/wati-notification-settings";

type NotificationDefinition = {
  key: NotificationControlKey;
  group: "customer" | "operations" | "system";
  icon: typeof Send;
  mode: "automatic" | "manual";
  audience: "customer" | "internal";
  wati: boolean;
  email: boolean;
};

const NOTIFICATION_DEFINITIONS: NotificationDefinition[] = [
  { key: "delivery_today_reminder", group: "customer", icon: Truck, mode: "automatic", audience: "customer", wati: true, email: true },
  { key: "pickup_today_reminder", group: "customer", icon: ShoppingBag, mode: "automatic", audience: "customer", wati: true, email: true },
  { key: "manual_order_confirmation", group: "customer", icon: Send, mode: "manual", audience: "customer", wati: true, email: true },
  { key: "factory_unsent_reminder", group: "operations", icon: Factory, mode: "automatic", audience: "internal", wati: true, email: true },
  { key: "driver_assignment_reminder", group: "operations", icon: Truck, mode: "automatic", audience: "internal", wati: true, email: true },
  { key: "order_reconciliation", group: "operations", icon: ClipboardCheck, mode: "automatic", audience: "internal", wati: true, email: true },
  { key: "enquiry_internal", group: "operations", icon: MessageCircleMore, mode: "automatic", audience: "internal", wati: true, email: true },
  { key: "enquiry_customer_ack", group: "system", icon: Mail, mode: "automatic", audience: "customer", wati: false, email: true },
  { key: "inventory_email_alerts", group: "system", icon: PackageSearch, mode: "automatic", audience: "internal", wati: false, email: true },
  { key: "daily_sales_report", group: "system", icon: FileBarChart, mode: "manual", audience: "internal", wati: false, email: true },
  { key: "manual_wati_utility", group: "system", icon: MessageCircleMore, mode: "manual", audience: "internal", wati: true, email: false },
];

type LegacyWatiNotificationControls = Pick<WatiNotificationControls,
  | "automaticNotificationsEnabled"
  | "automaticEmailNotificationsEnabled"
  | "manualOrderConfirmationEnabled"
  | "manualOrderConfirmationEmailEnabled"
  | "updatedAt"
> & Partial<WatiNotificationControls>;

const DEFAULT_EVENT_CONTROLS = Object.fromEntries(
  NOTIFICATION_CONTROL_KEYS.map((key) => [key, {
    watiEnabled: key !== "enquiry_customer_ack" && key !== "inventory_email_alerts" && key !== "daily_sales_report",
    emailEnabled: key !== "manual_wati_utility",
  }]),
) as WatiNotificationControls["eventControls"];

function completeWatiControls(value: LegacyWatiNotificationControls): WatiNotificationControls {
  const eventControls = { ...DEFAULT_EVENT_CONTROLS, ...(value.eventControls ?? {}) };
  if (!value.eventControls?.manual_order_confirmation) {
    eventControls.manual_order_confirmation = {
      watiEnabled: value.manualOrderConfirmationEnabled,
      emailEnabled: value.manualOrderConfirmationEmailEnabled,
    };
  }
  return {
    ...value,
    recipientMode: value.recipientMode ?? "environment",
    allowedWatiPhones: value.allowedWatiPhones ?? ["8613828747224"],
    allowedEmails: value.allowedEmails ?? ["cfb.app02@chifung.net"],
    eventControls,
    templateStates: value.templateStates ?? {},
  };
}

export function WatiNotificationSettings({
  loadControls = fetchWatiNotificationControls,
  setControl = setWatiNotificationControl,
  setDeliveryControl = setNotificationDeliveryControl,
  saveRecipientPolicy = setNotificationRecipientPolicy,
}: {
  loadControls?: () => Promise<LegacyWatiNotificationControls>;
  setControl?: (
    key: WatiNotificationControlKey,
    enabled: boolean,
  ) => Promise<LegacyWatiNotificationControls>;
  setDeliveryControl?: (
    key: NotificationControlKey,
    channel: NotificationChannel,
    enabled: boolean,
  ) => Promise<LegacyWatiNotificationControls>;
  saveRecipientPolicy?: (input: {
    mode: NotificationRecipientMode;
    allowedWatiPhones: string[];
    allowedEmails: string[];
  }) => Promise<LegacyWatiNotificationControls>;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings.wati_notifications");
  const [controls, setControls] = useState<WatiNotificationControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [updating, setUpdating] = useState<WatiNotificationControlKey | null>(null);
  const [eventUpdating, setEventUpdating] = useState<string | null>(null);
  const [recipientMode, setRecipientMode] = useState<NotificationRecipientMode>("environment");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void loadControls()
      .then((value) => {
        if (active) {
          const completed = completeWatiControls(value);
          setControls(completed);
          setRecipientMode(completed.recipientMode);
          setPhoneDraft(completed.allowedWatiPhones.join("\n"));
          setEmailDraft(completed.allowedEmails.join("\n"));
        }
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
    };
    setControls({
      ...controls,
      [optimisticField[key]]: enabled,
    });
    try {
      setControls(completeWatiControls(await setControl(key, enabled)));
    } catch {
      setControls(previous);
      setActionError(true);
    } finally {
      setUpdating(null);
    }
  };

  const toggleEvent = async (
    key: NotificationControlKey,
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    if (!canManage || updating || eventUpdating || !controls) return;
    const previous = controls;
    setEventUpdating(`${key}:${channel}`);
    setActionError(false);
    setControls({
      ...controls,
      eventControls: {
        ...controls.eventControls,
        [key]: {
          ...controls.eventControls[key],
          [channel === "wati" ? "watiEnabled" : "emailEnabled"]: enabled,
        },
      },
    });
    try {
      setControls(completeWatiControls(await setDeliveryControl(key, channel, enabled)));
    } catch {
      setControls(previous);
      setActionError(true);
    } finally {
      setEventUpdating(null);
    }
  };

  const splitRecipients = (value: string) => value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const savePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || savingPolicy || !controls) return;
    const phones = splitRecipients(phoneDraft);
    const emails = splitRecipients(emailDraft);
    if (recipientMode === "allowlist" && phones.length === 0 && emails.length === 0) {
      setActionError(true);
      return;
    }
    setSavingPolicy(true);
    setActionError(false);
    try {
      const completed = completeWatiControls(await saveRecipientPolicy({
        mode: recipientMode,
        allowedWatiPhones: phones,
        allowedEmails: emails,
      }));
      setControls(completed);
      setRecipientMode(completed.recipientMode);
      setPhoneDraft(completed.allowedWatiPhones.join("\n"));
      setEmailDraft(completed.allowedEmails.join("\n"));
    } catch {
      setActionError(true);
    } finally {
      setSavingPolicy(false);
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
      <header className="notification-center-intro">
        <div>
          <span className="notification-center-kicker">
            <ShieldCheck />
            {t("orderSettings.watiNotifications.kicker")}
          </span>
          <p className="wati-notification-settings-description">
            {t("orderSettings.watiNotifications.description")}
          </p>
        </div>
        <div className="notification-center-summary" aria-label={t("orderSettings.watiNotifications.summaryLabel")}>
          <span><MessageCircleMore /> {t("orderSettings.watiNotifications.summaryWati", {
            count: NOTIFICATION_DEFINITIONS.filter((item) => item.wati && controls?.eventControls[item.key]?.watiEnabled).length,
            total: NOTIFICATION_DEFINITIONS.filter((item) => item.wati).length,
          })}</span>
          <span><Mail /> {t("orderSettings.watiNotifications.summaryEmail", {
            count: NOTIFICATION_DEFINITIONS.filter((item) => item.email && controls?.eventControls[item.key]?.emailEnabled).length,
            total: NOTIFICATION_DEFINITIONS.filter((item) => item.email).length,
          })}</span>
        </div>
      </header>
      {actionError ? (
        <p className="list-inline-error" role="alert">
          {t("orderSettings.watiNotifications.updateError")}
        </p>
      ) : null}
      <section className="notification-master-controls" aria-labelledby="notification-master-title">
        <div className="notification-section-heading">
          <div>
            <h2 id="notification-master-title">{t("orderSettings.watiNotifications.master.title")}</h2>
            <p>{t("orderSettings.watiNotifications.master.description")}</p>
          </div>
        </div>
        <div className="notification-master-grid">
          {(["automatic", "automaticEmail"] as const).map((item) => {
            const isWati = item === "automatic";
            return (
              <div className="notification-master-card" key={item}>
                <span className="notification-master-icon">{isWati ? <MessageCircleMore /> : <Mail />}</span>
                <div>
                  <strong>{t(`orderSettings.watiNotifications.${item}.title`)}</strong>
                  <span>{t(`orderSettings.watiNotifications.${item}.description`)}</span>
                </div>
                <Switch
                  checked={isWati
                    ? controls?.automaticNotificationsEnabled ?? false
                    : controls?.automaticEmailNotificationsEnabled ?? false}
                  disabled={loading || !canManage || Boolean(updating) || Boolean(eventUpdating)}
                  aria-label={t(`orderSettings.watiNotifications.${item}.toggle`)}
                  onCheckedChange={(enabled) => void toggle(
                    isWati ? "automatic_notifications" : "automatic_email_notifications",
                    enabled,
                  )}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="notification-channel-matrix" aria-labelledby="notification-matrix-title">
        <div className="notification-section-heading">
          <div>
            <h2 id="notification-matrix-title">{t("orderSettings.watiNotifications.matrix.title")}</h2>
            <p>{t("orderSettings.watiNotifications.matrix.description")}</p>
          </div>
          <div className="notification-channel-legend" aria-hidden="true">
            <span><MessageCircleMore /> WATI</span>
            <span><Mail /> Email</span>
          </div>
        </div>
        {(["customer", "operations", "system"] as const).map((group) => (
          <div className="notification-group" key={group}>
            <h3>{t(`orderSettings.watiNotifications.groups.${group}`)}</h3>
            <div className="notification-event-list">
              {NOTIFICATION_DEFINITIONS.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const control = controls?.eventControls[item.key] ?? DEFAULT_EVENT_CONTROLS[item.key];
                return (
                  <div className="notification-event-row" key={item.key}>
                    <span className="notification-event-icon"><Icon /></span>
                    <div className="notification-event-copy">
                      <div>
                        <strong>{t(`orderSettings.watiNotifications.events.${item.key}.title`)}</strong>
                        <span className={`notification-mode-badge is-${item.mode}`}>
                          {t(`orderSettings.watiNotifications.modes.${item.mode}`)}
                        </span>
                        <span className="notification-audience-badge">
                          {t(`orderSettings.watiNotifications.audiences.${item.audience}`)}
                        </span>
                      </div>
                      <span>{t(`orderSettings.watiNotifications.events.${item.key}.description`)}</span>
                    </div>
                    <div className="notification-event-channels">
                      {(["wati", "email"] as const).map((channel) => {
                        const supported = channel === "wati" ? item.wati : item.email;
                        if (!supported) return <span className="notification-channel-na" key={channel}>—</span>;
                        const checked = channel === "wati" ? control.watiEnabled : control.emailEnabled;
                        return (
                          <label className="notification-channel-toggle" key={channel}>
                            <span>{channel === "wati" ? "WATI" : "Email"}</span>
                            <Switch
                              checked={checked}
                              disabled={loading || !canManage || Boolean(updating) || Boolean(eventUpdating)}
                              aria-label={t("orderSettings.watiNotifications.eventToggle", {
                                channel: channel === "wati" ? "WATI" : "Email",
                                name: t(`orderSettings.watiNotifications.events.${item.key}.title`),
                              })}
                              onCheckedChange={(enabled) => void toggleEvent(item.key, channel, enabled)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="notification-recipient-policy" aria-labelledby="notification-policy-title">
        <div className="notification-section-heading">
          <div>
            <h2 id="notification-policy-title"><ShieldCheck /> {t("orderSettings.watiNotifications.policy.title")}</h2>
            <p>{t("orderSettings.watiNotifications.policy.description")}</p>
          </div>
        </div>
        <form className="notification-policy-form" onSubmit={(event) => void savePolicy(event)}>
          <fieldset className="notification-policy-modes" disabled={!canManage || savingPolicy}>
            <legend>{t("orderSettings.watiNotifications.policy.modeLabel")}</legend>
            {(["environment", "allowlist", "live"] as const).map((mode) => (
              <label className={recipientMode === mode ? "is-selected" : ""} key={mode}>
                <input
                  type="radio"
                  name="notification-recipient-mode"
                  value={mode}
                  checked={recipientMode === mode}
                  onChange={() => setRecipientMode(mode)}
                />
                <span>
                  <strong>{t(`orderSettings.watiNotifications.policy.modes.${mode}.title`)}</strong>
                  <small>{t(`orderSettings.watiNotifications.policy.modes.${mode}.description`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="notification-allowlist-fields">
            <label>
              <span><MessageCircleMore /> {t("orderSettings.watiNotifications.policy.watiPhones")}</span>
              <textarea
                value={phoneDraft}
                rows={3}
                inputMode="tel"
                disabled={!canManage || savingPolicy}
                placeholder={t("orderSettings.watiNotifications.policy.watiPhonesPlaceholder")}
                onChange={(event) => setPhoneDraft(event.target.value)}
              />
              <small>{t("orderSettings.watiNotifications.policy.onePerLine")}</small>
            </label>
            <label>
              <span><Mail /> {t("orderSettings.watiNotifications.policy.emails")}</span>
              <textarea
                value={emailDraft}
                rows={3}
                inputMode="email"
                disabled={!canManage || savingPolicy}
                placeholder={t("orderSettings.watiNotifications.policy.emailsPlaceholder")}
                onChange={(event) => setEmailDraft(event.target.value)}
              />
              <small>{t("orderSettings.watiNotifications.policy.onePerLine")}</small>
            </label>
          </div>
          {canManage ? (
            <div className="notification-policy-actions">
              <Button type="submit" disabled={savingPolicy}>
                <Save />
                {savingPolicy
                  ? t("orderSettings.watiNotifications.policy.saving")
                  : t("orderSettings.watiNotifications.policy.save")}
              </Button>
            </div>
          ) : null}
        </form>
      </section>
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
