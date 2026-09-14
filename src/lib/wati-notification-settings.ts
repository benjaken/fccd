import { supabase } from "@/lib/supabase";

export type WatiNotificationControlKey =
  | "automatic_notifications"
  | "automatic_email_notifications";

export type NotificationRecipientMode = "environment" | "allowlist" | "live";
export type NotificationChannel = "wati" | "email";

export const NOTIFICATION_CONTROL_KEYS = [
  "delivery_today_reminder",
  "pickup_today_reminder",
  "manual_order_confirmation",
  "factory_unsent_reminder",
  "driver_assignment_reminder",
  "order_reconciliation",
  "enquiry_internal",
  "enquiry_customer_ack",
  "inventory_email_alerts",
  "daily_sales_report",
  "manual_wati_utility",
] as const;

export type NotificationControlKey = (typeof NOTIFICATION_CONTROL_KEYS)[number];

export type NotificationDeliveryControl = {
  watiEnabled: boolean;
  emailEnabled: boolean;
};

export type WatiTemplateState = {
  templateName: string;
  active: boolean;
  parameterCount: number;
};

export type WatiNotificationControls = {
  automaticNotificationsEnabled: boolean;
  automaticEmailNotificationsEnabled: boolean;
  manualOrderConfirmationEnabled: boolean;
  manualOrderConfirmationEmailEnabled: boolean;
  recipientMode: NotificationRecipientMode;
  allowedWatiPhones: string[];
  allowedEmails: string[];
  eventControls: Record<string, NotificationDeliveryControl>;
  templateStates: Record<string, WatiTemplateState>;
  updatedAt: string;
};

type ControlsRow = {
  automatic_notifications_enabled: boolean;
  automatic_email_notifications_enabled: boolean;
  manual_order_confirmation_enabled: boolean;
  manual_order_confirmation_email_enabled: boolean;
  updated_at: string;
};

type ControlCenterRow = {
  automatic_notifications_enabled: boolean;
  automatic_email_notifications_enabled: boolean;
  recipient_mode: string;
  allowed_wati_phones: string[] | null;
  allowed_emails: string[] | null;
  event_controls: Record<string, NotificationDeliveryControl> | null;
  template_states: Record<string, WatiTemplateState> | null;
  updated_at: string;
};

const DEFAULT_EVENT_CONTROLS = Object.fromEntries(
  NOTIFICATION_CONTROL_KEYS.map((key) => [key, {
    watiEnabled: key !== "enquiry_customer_ack" && key !== "inventory_email_alerts" && key !== "daily_sales_report",
    emailEnabled: key !== "manual_wati_utility",
  }]),
) as Record<NotificationControlKey, NotificationDeliveryControl>;

function mapControls(row: ControlsRow): WatiNotificationControls {
  return {
    automaticNotificationsEnabled: Boolean(row.automatic_notifications_enabled),
    automaticEmailNotificationsEnabled: Boolean(row.automatic_email_notifications_enabled),
    manualOrderConfirmationEnabled: Boolean(row.manual_order_confirmation_enabled),
    manualOrderConfirmationEmailEnabled: Boolean(row.manual_order_confirmation_email_enabled),
    recipientMode: "environment",
    allowedWatiPhones: ["8613828747224"],
    allowedEmails: ["cfb.app02@chifung.net"],
    eventControls: DEFAULT_EVENT_CONTROLS,
    templateStates: {},
    updatedAt: row.updated_at,
  };
}

function mapControlCenter(row: ControlCenterRow): WatiNotificationControls {
  const mode = row.recipient_mode;
  return {
    automaticNotificationsEnabled: Boolean(row.automatic_notifications_enabled),
    automaticEmailNotificationsEnabled: Boolean(row.automatic_email_notifications_enabled),
    manualOrderConfirmationEnabled: Boolean(row.event_controls?.manual_order_confirmation?.watiEnabled),
    manualOrderConfirmationEmailEnabled: Boolean(row.event_controls?.manual_order_confirmation?.emailEnabled),
    recipientMode: mode === "allowlist" || mode === "live" ? mode : "environment",
    allowedWatiPhones: row.allowed_wati_phones ?? [],
    allowedEmails: row.allowed_emails ?? [],
    eventControls: { ...DEFAULT_EVENT_CONTROLS, ...(row.event_controls ?? {}) },
    templateStates: row.template_states ?? {},
    updatedAt: row.updated_at,
  };
}

export async function fetchWatiNotificationControls() {
  const center = await supabase.rpc("notification_control_center_get");
  if (!center.error) {
    const row = (center.data as ControlCenterRow[] | null)?.[0];
    if (row) return mapControlCenter(row);
  }

  const legacy = await supabase.rpc("wati_notification_controls_get");
  if (legacy.error) throw center.error || legacy.error;
  const row = (legacy.data as ControlsRow[] | null)?.[0];
  if (!row) throw new Error("wati_notification_controls_missing");
  return mapControls(row);
}

export async function setWatiNotificationControl(
  control: WatiNotificationControlKey,
  enabled: boolean,
) {
  const { data, error } = await supabase.rpc("wati_notification_control_set", {
    p_control: control,
    p_enabled: enabled,
  });
  if (error) throw error;
  if (!(data as ControlsRow[] | null)?.[0]) {
    throw new Error("wati_notification_controls_missing");
  }
  return fetchWatiNotificationControls();
}

export async function setNotificationDeliveryControl(
  notificationKey: NotificationControlKey,
  channel: NotificationChannel,
  enabled: boolean,
) {
  const { error } = await supabase.rpc("notification_delivery_control_set", {
    p_notification_key: notificationKey,
    p_channel: channel,
    p_enabled: enabled,
  });
  if (error) throw error;
  return fetchWatiNotificationControls();
}

export async function setNotificationRecipientPolicy(input: {
  mode: NotificationRecipientMode;
  allowedWatiPhones: string[];
  allowedEmails: string[];
}) {
  const { error } = await supabase.rpc("notification_recipient_policy_set", {
    p_recipient_mode: input.mode,
    p_allowed_wati_phones: input.allowedWatiPhones,
    p_allowed_emails: input.allowedEmails,
  });
  if (error) throw error;
  return fetchWatiNotificationControls();
}
