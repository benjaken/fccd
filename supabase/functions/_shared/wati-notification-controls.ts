import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WatiNotificationControls = {
  automaticNotificationsEnabled: boolean;
  automaticEmailNotificationsEnabled: boolean;
  manualOrderConfirmationEnabled: boolean;
  manualOrderConfirmationEmailEnabled: boolean;
  recipientPolicy: NotificationRecipientPolicy;
  deliveryControls: Record<string, NotificationDeliveryControl>;
};

export type NotificationRecipientMode = "environment" | "allowlist" | "live";

export type NotificationRecipientPolicy = {
  mode: NotificationRecipientMode;
  allowedWatiPhones: string[];
  allowedEmails: string[];
};

export type NotificationDeliveryControl = {
  watiEnabled: boolean;
  emailEnabled: boolean;
};

const DEFAULT_RECIPIENT_POLICY: NotificationRecipientPolicy = {
  mode: "environment",
  allowedWatiPhones: ["8613828747224"],
  allowedEmails: ["cfb.app02@chifung.net"],
};

function fallbackControls(): WatiNotificationControls {
  return {
    automaticNotificationsEnabled: false,
    automaticEmailNotificationsEnabled: false,
    manualOrderConfirmationEnabled: false,
    manualOrderConfirmationEmailEnabled: false,
    recipientPolicy: DEFAULT_RECIPIENT_POLICY,
    deliveryControls: {},
  };
}

export async function loadWatiNotificationControls(
  admin: SupabaseClient,
): Promise<WatiNotificationControls> {
  const [{ data, error }, policyResult, deliveryResult] = await Promise.all([
    admin
      .from("wati_notification_controls")
      .select("automatic_notifications_enabled,automatic_email_notifications_enabled,manual_order_confirmation_enabled,manual_order_confirmation_email_enabled")
      .eq("id", "global")
      .maybeSingle(),
    admin
      .from("notification_recipient_policy")
      .select("recipient_mode,allowed_wati_phones,allowed_emails")
      .eq("singleton", true)
      .maybeSingle(),
    admin
      .from("notification_delivery_controls")
      .select("notification_key,wati_enabled,email_enabled"),
  ]);
  if (error || !data) {
    console.error("WATI notification controls unavailable", {
      code: error?.code,
      message: error?.message,
    });
    return fallbackControls();
  }
  if (policyResult.error) {
    console.error("Notification recipient policy unavailable", {
      code: policyResult.error.code,
      message: policyResult.error.message,
    });
  }
  if (deliveryResult.error) {
    console.error("Notification delivery controls unavailable", {
      code: deliveryResult.error.code,
      message: deliveryResult.error.message,
    });
  }
  const policy = policyResult.data as {
    recipient_mode?: string;
    allowed_wati_phones?: string[] | null;
    allowed_emails?: string[] | null;
  } | null;
  const mode = policy?.recipient_mode;
  const recipientMode: NotificationRecipientMode =
    mode === "allowlist" || mode === "live" ? mode : "environment";
  const deliveryControls = Object.fromEntries(
    ((deliveryResult.data || []) as Array<{
      notification_key: string;
      wati_enabled: boolean;
      email_enabled: boolean;
    }>).map((row) => [row.notification_key, {
      watiEnabled: row.wati_enabled === true,
      emailEnabled: row.email_enabled === true,
    }]),
  );
  return {
    automaticNotificationsEnabled: data.automatic_notifications_enabled === true,
    automaticEmailNotificationsEnabled: data.automatic_email_notifications_enabled === true,
    manualOrderConfirmationEnabled: data.manual_order_confirmation_enabled === true,
    manualOrderConfirmationEmailEnabled: data.manual_order_confirmation_email_enabled === true,
    recipientPolicy: {
      mode: recipientMode,
      allowedWatiPhones: policy?.allowed_wati_phones || DEFAULT_RECIPIENT_POLICY.allowedWatiPhones,
      allowedEmails: policy?.allowed_emails || DEFAULT_RECIPIENT_POLICY.allowedEmails,
    },
    deliveryControls,
  };
}

export function notificationChannelEnabled(
  controls: WatiNotificationControls,
  notificationKey: string,
  channel: "wati" | "email",
) {
  const control = controls.deliveryControls[notificationKey];
  if (!control) return true;
  return channel === "wati" ? control.watiEnabled : control.emailEnabled;
}

export function watiEmergencySwitchAllows(name: string) {
  return Deno.env.get(name)?.trim().toLowerCase() !== "false";
}
