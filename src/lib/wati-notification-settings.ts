import { supabase } from "@/lib/supabase";

export type WatiNotificationControlKey =
  | "automatic_notifications"
  | "automatic_email_notifications"
  | "manual_order_confirmation"
  | "manual_order_confirmation_email";

export type WatiNotificationControls = {
  automaticNotificationsEnabled: boolean;
  automaticEmailNotificationsEnabled: boolean;
  manualOrderConfirmationEnabled: boolean;
  manualOrderConfirmationEmailEnabled: boolean;
  updatedAt: string;
};

type ControlsRow = {
  automatic_notifications_enabled: boolean;
  automatic_email_notifications_enabled: boolean;
  manual_order_confirmation_enabled: boolean;
  manual_order_confirmation_email_enabled: boolean;
  updated_at: string;
};

function mapControls(row: ControlsRow): WatiNotificationControls {
  return {
    automaticNotificationsEnabled: Boolean(row.automatic_notifications_enabled),
    automaticEmailNotificationsEnabled: Boolean(row.automatic_email_notifications_enabled),
    manualOrderConfirmationEnabled: Boolean(row.manual_order_confirmation_enabled),
    manualOrderConfirmationEmailEnabled: Boolean(row.manual_order_confirmation_email_enabled),
    updatedAt: row.updated_at,
  };
}

export async function fetchWatiNotificationControls() {
  const { data, error } = await supabase.rpc("wati_notification_controls_get");
  if (error) throw error;
  const row = (data as ControlsRow[] | null)?.[0];
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
  const row = (data as ControlsRow[] | null)?.[0];
  if (!row) throw new Error("wati_notification_controls_missing");
  return mapControls(row);
}
