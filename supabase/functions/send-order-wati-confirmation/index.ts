import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildOrderNotificationContent,
  resolveOrderNotificationShopName,
} from "../_shared/order-notification-content.ts";
import {
  formatNotificationDeliveryAddress,
  resolveNotificationDeliveryMethod,
} from "../_shared/delivery-address.ts";
import { EMAIL_FROM } from "../_shared/email-sender.ts";
import { settleEnabledNotificationRequests } from "../_shared/notification-channel-requests.ts";
import {
  isNotificationEmailAllowed,
  isNotificationPhoneAllowed,
  isNotificationRecipientPairAllowed,
  notificationRecipientAllowlist,
} from "../_shared/notification-recipient-allowlist.ts";
import {
  loadWatiNotificationControls,
  watiEmergencySwitchAllows,
} from "../_shared/wati-notification-controls.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function requiredEnv(name: string) { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`missing_${name.toLowerCase()}`); return value; }
function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) { const keys = JSON.parse(configured) as Record<string, string>; if (keys.default) return keys.default; }
  throw new Error("missing_supabase_service_role_key");
}
function phoneNumber(value: string | null) { let digits = (value || "").replace(/\D/g, ""); if (digits.startsWith("00")) digits = digits.slice(2); if (digits.length === 8) digits = `852${digits}`; return /^\d{8,15}$/.test(digits) ? digits : ""; }
function hongKongDate(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function displayDate(dateKey: string) { const [year, month, day] = dateKey.split("-"); return `${day}/${month}/${year}`; }
function previousDate(dateKey: string) { const [year, month, day] = dateKey.split("-").map(Number); const value = new Date(Date.UTC(year, month - 1, day)); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }
function addonLink() {
  const explicit = Deno.env.get("WATI_ADD_ON_LINK")?.trim();
  if (explicit) return explicit;
  const base = Deno.env.get("SELF_SERVICE_PUBLIC_URL")?.trim().replace(/\/$/, "");
  return base ? `${base}/self_service_search` : "https://www.foodchannels-delivery.com/self_service_search";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") || "";
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const authClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "unauthorized" }, 401);
    const { orderId } = await request.json().catch(() => ({})) as { orderId?: string };
    if (!orderId) return json({ error: "order_id_required" }, 400);
    const { data: visibleOrder } = await authClient.from("orders").select("id").eq("id", orderId).maybeSingle();
    if (!visibleOrder) return json({ error: "order_not_found" }, 404);

    const admin = createClient(supabaseUrl, serviceRoleKey());
    const controls = await loadWatiNotificationControls(admin);
    const manualWatiEnabled = controls.manualOrderConfirmationEnabled
      && watiEmergencySwitchAllows("WATI_MANUAL_ORDER_CONFIRMATION_ENABLED");
    const manualEmailEnabled = controls.manualOrderConfirmationEmailEnabled
      && watiEmergencySwitchAllows("EMAIL_MANUAL_ORDER_CONFIRMATION_ENABLED");
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,delivery_at,delivery_time,shipping_address_snapshot,channels(name),shipping_methods(name,display_name,requires_address_check)")
      .eq("id", orderId).eq("document_type", "order").is("archived_at", null).single();
    if (orderError || !order) return json({ error: "order_not_found" }, 404);
    const deliveryDate = hongKongDate(order.delivery_at);
    if (!deliveryDate) return json({ error: "delivery_date_missing" }, 400);
    const { data: blockDate, error: blockError } = await admin.from("self_service_addon_block_dates").select("id").eq("block_date", deliveryDate).is("archived_at", null).maybeSingle();
    if (blockError) throw blockError;
    const includesAddonLink = !blockDate;
    const phone = phoneNumber(order.contact_number_a_snapshot || order.contact_number_b_snapshot);
    if (manualWatiEnabled && !phone) return json({ error: "customer_phone_missing" }, 400);
    const email = order.email_snapshot?.trim() || "";
    if (manualEmailEnabled && !email) return json({ error: "customer_email_missing" }, 400);
    const recipientPolicy = notificationRecipientAllowlist();
    const recipientAllowed = manualWatiEnabled && manualEmailEnabled
      ? isNotificationRecipientPairAllowed(recipientPolicy, phone, email)
      : manualWatiEnabled
        ? isNotificationPhoneAllowed(recipientPolicy, phone)
        : manualEmailEnabled
          ? isNotificationEmailAllowed(recipientPolicy, email)
          : true;
    if (!recipientAllowed) {
      return json({
        error: "notification_recipient_not_allowlisted",
        watiSent: false,
        emailSent: false,
      }, 403);
    }
    const name = order.customer_name_snapshot?.trim() || order.company_name_snapshot?.trim() || "Customer";
    const shippingMethod = Array.isArray(order.shipping_methods)
      ? order.shipping_methods[0]
      : order.shipping_methods;
    const deliveryMethod = resolveNotificationDeliveryMethod(
      `${shippingMethod?.name || ""} ${shippingMethod?.display_name || ""}`,
      shippingMethod?.requires_address_check,
    );
    const address = formatNotificationDeliveryAddress(
      order.shipping_address_snapshot,
      deliveryMethod,
    );
    const commonParameters = [
      { name: "name", value: name }, { name: "order_number", value: order.order_number || "-" },
      { name: "date", value: displayDate(deliveryDate) }, { name: "time", value: order.delivery_time?.trim() || "-" },
      { name: "address", value: address },
    ];
    const channel = Array.isArray(order.channels) ? order.channels[0] : order.channels;
    const shopName = resolveOrderNotificationShopName(
      channel && typeof channel === "object" && "name" in channel && typeof channel.name === "string"
        ? channel.name
        : null,
      Deno.env.get("WATI_SHOP_NAME")?.trim(),
    );
    const parameters = includesAddonLink
      ? [...commonParameters, { name: "ao_deadline", value: displayDate(previousDate(deliveryDate)) }, { name: "ao_link", value: addonLink() }, { name: "shop_name", value: shopName }]
      : [...commonParameters, { name: "shop_name", value: shopName }];
    const templateName = includesAddonLink
      ? Deno.env.get("WATI_ORDER_CONFIRMATION_ADDON_TEMPLATE_NAME")?.trim() || "order_confirm_with_action_and_aolink"
      : Deno.env.get("WATI_ORDER_CONFIRMATION_TEMPLATE_NAME")?.trim() || "order_confirm_with_action";
    const notification = buildOrderNotificationContent("delivery_order_confirmed", {
      name,
      order_number: order.order_number || "-",
      date: displayDate(deliveryDate),
      time: order.delivery_time?.trim() || "-",
      address,
      phone: order.contact_number_a_snapshot?.trim() || order.contact_number_b_snapshot?.trim() || "-",
      delivery_method: deliveryMethod,
      ao_deadline: includesAddonLink ? displayDate(previousDate(deliveryDate)) : "",
      ao_link: includesAddonLink ? addonLink() : "",
      shop_name: shopName,
    });
    const [watiResult, emailResult] = await settleEnabledNotificationRequests({
      watiEnabled: manualWatiEnabled,
      emailEnabled: manualEmailEnabled,
      sendWati: () => fetch(`${requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "")}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`, {
        method: "POST", headers: { Authorization: `Bearer ${requiredEnv("WATI_API_TOKEN")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: templateName, broadcast_name: includesAddonLink ? "Confirmed Delivery message with AO" : "Confirmed Delivery message", channel_number: requiredEnv("WATI_CHANNEL_NUMBER"), parameters }),
      }),
      sendEmail: () => fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: [email], subject: notification.subject, html: notification.html }),
      }),
    });
    const providerResponse = watiResult.status === "fulfilled" ? watiResult.value : null;
    const emailResponse = emailResult.status === "fulfilled" ? emailResult.value : null;
    const payload = providerResponse
      ? await providerResponse.json().catch(() => null) as { result?: unknown } | null
      : null;
    const watiSent = Boolean(providerResponse?.ok && payload?.result !== false);
    const watiSkipped = !manualWatiEnabled;
    const watiDone = watiSent || watiSkipped;
    const emailSent = Boolean(emailResponse?.ok);
    const emailSkipped = !manualEmailEnabled;
    const emailDone = emailSent || emailSkipped;
    if (!watiDone || !emailDone) {
      return json({
        error: !watiDone && !emailDone ? "wati_and_email_send_failed" : !watiDone ? "wati_send_failed" : "email_send_failed",
        watiSent,
        watiSkipped,
        emailSent,
        emailSkipped,
        detail: payload,
      }, 502);
    }
    return json({ watiSent, watiSkipped, emailSent, emailSkipped, includesAddonLink, templateName });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "wati_order_confirmation_failed" }, 500); }
});
