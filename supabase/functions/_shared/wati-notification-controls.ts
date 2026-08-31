import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WatiNotificationControls = {
  automaticNotificationsEnabled: boolean;
  automaticEmailNotificationsEnabled: boolean;
  manualOrderConfirmationEnabled: boolean;
  manualOrderConfirmationEmailEnabled: boolean;
  manualQuoteConfirmationEnabled: boolean;
  manualQuoteConfirmationEmailEnabled: boolean;
};

export async function loadWatiNotificationControls(
  admin: SupabaseClient,
): Promise<WatiNotificationControls> {
  const { data, error } = await admin
    .from("wati_notification_controls")
    .select("automatic_notifications_enabled,automatic_email_notifications_enabled,manual_order_confirmation_enabled,manual_order_confirmation_email_enabled,manual_quote_confirmation_enabled,manual_quote_confirmation_email_enabled")
    .eq("id", "global")
    .maybeSingle();
  if (error || !data) {
    console.error("WATI notification controls unavailable", {
      code: error?.code,
      message: error?.message,
    });
    return {
      automaticNotificationsEnabled: false,
      automaticEmailNotificationsEnabled: false,
      manualOrderConfirmationEnabled: false,
      manualOrderConfirmationEmailEnabled: false,
      manualQuoteConfirmationEnabled: false,
      manualQuoteConfirmationEmailEnabled: false,
    };
  }
  return {
    automaticNotificationsEnabled: data.automatic_notifications_enabled === true,
    automaticEmailNotificationsEnabled: data.automatic_email_notifications_enabled === true,
    manualOrderConfirmationEnabled: data.manual_order_confirmation_enabled === true,
    manualOrderConfirmationEmailEnabled: data.manual_order_confirmation_email_enabled === true,
    manualQuoteConfirmationEnabled: data.manual_quote_confirmation_enabled === true,
    manualQuoteConfirmationEmailEnabled: data.manual_quote_confirmation_email_enabled === true,
  };
}

export function watiEmergencySwitchAllows(name: string) {
  return Deno.env.get(name)?.trim().toLowerCase() !== "false";
}
