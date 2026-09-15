import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from "@/lib/notifications";
import "@/components/settings/notification-settings.css";

const DEFAULTS: NotificationSettings = {
  quoteDeliveryDays: [7, 3, 0],
  factoryUnsentDays: [7, 3, 1],
  deliveredUnpaidDays: [1, 3, 7, 14],
  deliveryAttentionHours: [24, 4, 1],
  urgentFactoryChangeHours: 24,
  normalChangeMergeMinutes: 5,
};

export function parseReminderNumbers(value: string): number[] | null {
  const values = value
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(Number);
  if (!values.length || values.some((entry) => !Number.isInteger(entry) || entry < 0)) return null;
  return [...new Set(values)];
}

function listValue(values: number[]) {
  return values.join(", ");
}

export function NotificationSettingsPage({
  loadSettings = fetchNotificationSettings,
  saveSettings = saveNotificationSettings,
}: {
  loadSettings?: typeof fetchNotificationSettings;
  saveSettings?: typeof saveNotificationSettings;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULTS);
  const [quoteDays, setQuoteDays] = useState(listValue(DEFAULTS.quoteDeliveryDays));
  const [factoryDays, setFactoryDays] = useState(listValue(DEFAULTS.factoryUnsentDays));
  const [paymentDays, setPaymentDays] = useState(listValue(DEFAULTS.deliveredUnpaidDays));
  const [deliveryHours, setDeliveryHours] = useState(listValue(DEFAULTS.deliveryAttentionHours));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [, setSuccess] = useState(false);

  useEffect(() => {
    void loadSettings()
      .then((next) => {
        setSettings(next);
        setQuoteDays(listValue(next.quoteDeliveryDays));
        setFactoryDays(listValue(next.factoryUnsentDays));
        setPaymentDays(listValue(next.deliveredUnpaidDays));
        setDeliveryHours(listValue(next.deliveryAttentionHours));
      })
      .catch(() => setError(t("notificationSettings.loadError")))
      .finally(() => setLoading(false));
  }, [loadSettings, t]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess(false);
    const parsed = {
      quoteDeliveryDays: parseReminderNumbers(quoteDays),
      factoryUnsentDays: parseReminderNumbers(factoryDays),
      deliveredUnpaidDays: parseReminderNumbers(paymentDays),
      deliveryAttentionHours: parseReminderNumbers(deliveryHours),
    };
    if (Object.values(parsed).some((value) => value === null)) {
      setError(t("notificationSettings.validation"));
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        ...settings,
        quoteDeliveryDays: parsed.quoteDeliveryDays!,
        factoryUnsentDays: parsed.factoryUnsentDays!,
        deliveredUnpaidDays: parsed.deliveredUnpaidDays!,
        deliveryAttentionHours: parsed.deliveryAttentionHours!,
      });
      setSuccess(true);
    } catch {
      setError(t("notificationSettings.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="content-page notification-settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("navigation.promotion")}</span>
          <h1>{t("notificationSettings.title")}</h1>
          <p>{t("notificationSettings.description")}</p>
        </div>
      </header>
      <form className="panel notification-settings-form" onSubmit={submit} aria-busy={loading || saving}>
        <div className="notification-settings-grid">
          <label>
            <span>{t("notificationSettings.quoteDays")}</span>
            <input disabled={loading} value={quoteDays} onChange={(event) => setQuoteDays(event.target.value)} />
            <small>{t("notificationSettings.quoteDaysHint")}</small>
          </label>
          <label>
            <span>{t("notificationSettings.factoryDays")}</span>
            <input disabled={loading} value={factoryDays} onChange={(event) => setFactoryDays(event.target.value)} />
            <small>{t("notificationSettings.factoryDaysHint")}</small>
          </label>
          <label>
            <span>{t("notificationSettings.paymentDays")}</span>
            <input disabled={loading} value={paymentDays} onChange={(event) => setPaymentDays(event.target.value)} />
            <small>{t("notificationSettings.paymentDaysHint")}</small>
          </label>
          <label>
            <span>{t("notificationSettings.deliveryHours")}</span>
            <input disabled={loading} value={deliveryHours} onChange={(event) => setDeliveryHours(event.target.value)} />
            <small>{t("notificationSettings.deliveryHoursHint")}</small>
          </label>
          <label>
            <span>{t("notificationSettings.urgentChangeHours")}</span>
            <input type="number" min="0" disabled={loading} value={settings.urgentFactoryChangeHours} onChange={(event) => setSettings((current) => ({ ...current, urgentFactoryChangeHours: Number(event.target.value) }))} />
          </label>
          <label>
            <span>{t("notificationSettings.mergeMinutes")}</span>
            <input type="number" min="0" disabled={loading} value={settings.normalChangeMergeMinutes} onChange={(event) => setSettings((current) => ({ ...current, normalChangeMergeMinutes: Number(event.target.value) }))} />
          </label>
        </div>
        {error ? <p className="notification-settings-message is-error" role="alert">{error}</p> : null}
        <footer>
          <Button type="submit" disabled={loading || saving}>
            <Save />{saving ? t("common.saving") : t("common.save")}
          </Button>
        </footer>
      </form>
    </section>
  );
}
