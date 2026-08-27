import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildOrderNotificationContent,
  type OrderNotificationEvent,
  type OrderNotificationValues,
} from "../_shared/order-notification-content.ts";

type ParameterRule = { name?: unknown; source?: unknown; value?: unknown };
type QueueRow = {
  id: string;
  attempts: number;
  wati_sent_at: string | null;
  wati_skipped_at: string | null;
  email_sent_at: string | null;
  email_skipped_at: string | null;
  template: unknown;
  order: unknown;
};
type TemplateRow = {
  event_key: OrderNotificationEvent;
  template_name: string;
  broadcast_name: string;
  parameters: ParameterRule[];
};
type OrderRow = {
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  email_snapshot: string | null;
  contact_number_a_snapshot: string | null;
  contact_number_b_snapshot: string | null;
  delivery_at: string | null;
  delivery_time: string | null;
  shipping_address_snapshot: string | null;
  shipping_methods: unknown;
};

const jsonHeaders = { "Content-Type": "application/json" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}

function relation<T>(value: unknown): T | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? item as T : null;
}

export function normalizeWhatsAppNumber(value: string | null | undefined) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `852${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : "";
}

function formatHongKongDate(value: string | null, subtractDays = 0) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  date.setUTCDate(date.getUTCDate() - subtractDays);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong", day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("day")}/${part("month")}/${part("year")}`;
}

function isPickup(order: OrderRow) {
  const method = relation<{ name?: unknown; display_name?: unknown; requires_address_check?: unknown }>(
    order.shipping_methods,
  );
  const label = `${String(method?.name || "")} ${String(method?.display_name || "")}`;
  return method?.requires_address_check === false || /(自取|pickup)/i.test(label);
}

function valuesFor(order: OrderRow): OrderNotificationValues {
  const deadlineSetting = Deno.env.get("WATI_ADD_ON_DEADLINE_DAYS_BEFORE")?.trim() || "";
  const deadlineDays = deadlineSetting ? Number(deadlineSetting) : Number.NaN;
  const pickup = isPickup(order);
  return {
    name: order.customer_name_snapshot?.trim() || order.company_name_snapshot?.trim() || "Customer",
    order_number: order.order_number?.trim() || "-",
    date: formatHongKongDate(order.delivery_at),
    time: order.delivery_time?.trim() || "-",
    address: order.shipping_address_snapshot?.trim() || "-",
    delivery_method: pickup ? "門市自取" : "送貨上門",
    ao_deadline: Number.isFinite(deadlineDays) && deadlineDays >= 0
      ? formatHongKongDate(order.delivery_at, deadlineDays)
      : "",
    ao_link: Deno.env.get("WATI_ADD_ON_LINK")?.trim() || "",
    shop_name: Deno.env.get("WATI_SHOP_NAME")?.trim() || "Food Channels Catering",
  };
}

export function renderWatiParameters(rules: ParameterRule[], values: OrderNotificationValues) {
  return rules.map((rule) => {
    const name = String(rule.name || "").trim();
    if (!name) throw new Error("invalid_wati_parameter_name");
    const source = String(rule.source || "").trim() as keyof OrderNotificationValues;
    const resolved = source && source in values ? values[source] : rule.value;
    if ((source === "ao_deadline" || source === "ao_link") && !String(resolved ?? "").trim()) {
      throw new Error(`missing_wati_${source}`);
    }
    return { name, value: String(resolved ?? "") };
  });
}

async function responseJson(providerResponse: Response) {
  const text = await providerResponse.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text.slice(0, 2000) }; }
}

function providerMessageId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const receivers = (payload as { receivers?: unknown }).receivers;
  if (!Array.isArray(receivers)) return "";
  const first = receivers[0];
  return first && typeof first === "object"
    ? String((first as { localMessageId?: unknown }).localMessageId || "")
    : "";
}

async function sendWati(phone: string, template: TemplateRow, parameters: Array<{ name: string; value: string }>) {
  const endpoint = requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "");
  const providerResponse = await fetch(
    `${endpoint}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("WATI_API_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_name: template.template_name,
        broadcast_name: template.broadcast_name,
        channel_number: requiredEnv("WATI_CHANNEL_NUMBER"),
        parameters,
      }),
    },
  );
  const payload = await responseJson(providerResponse);
  const reportedFailure = payload && typeof payload === "object" && (payload as { result?: unknown }).result === false;
  if (!providerResponse.ok || reportedFailure) {
    throw new Error(`wati_send_failed:${providerResponse.status}:${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return { payload, messageId: providerMessageId(payload) };
}

async function sendEmail(to: string, subject: string, html: string) {
  const providerResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: requiredEnv("ORDER_NOTIFICATION_EMAIL_FROM"),
      to: [to],
      subject,
      html,
    }),
  });
  const payload = await responseJson(providerResponse);
  if (!providerResponse.ok) {
    throw new Error(`email_send_failed:${providerResponse.status}:${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  try {
    const expectedSecret = requiredEnv("WATI_ORDER_CRON_SECRET");
    if (request.headers.get("x-cron-secret") !== expectedSecret) {
      return response({ error: "unauthorized" }, 401);
    }

    const input = await request.json().catch(() => ({})) as { limit?: unknown };
    const requestedLimit = Number(input.limit || 20);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 20;
    const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());

    const { error: reminderError } = await admin.rpc("enqueue_due_wati_order_reminders", {
      p_now: new Date().toISOString(),
    });
    if (reminderError) throw new Error(`reminder_enqueue_failed:${reminderError.message}`);

    const { data: claimed, error: claimError } = await admin.rpc("claim_wati_order_notifications", {
      p_limit: limit,
    });
    if (claimError) throw new Error(`notification_claim_failed:${claimError.message}`);
    const claimedRows = (claimed || []) as Array<{ id: string }>;
    if (!claimedRows.length) return response({ processed: 0, sent: 0, failed: 0 });

    const { data: jobs, error: jobsError } = await admin
      .from("wati_order_notification_outbox")
      .select("id,attempts,wati_sent_at,wati_skipped_at,email_sent_at,email_skipped_at,template:wati_order_notification_templates(event_key,template_name,broadcast_name,parameters),order:orders(order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,delivery_at,delivery_time,shipping_address_snapshot,shipping_methods(name,display_name,requires_address_check))")
      .in("id", claimedRows.map((row) => row.id));
    if (jobsError) throw new Error(`notification_load_failed:${jobsError.message}`);

    let sent = 0;
    let failed = 0;
    for (const job of (jobs || []) as QueueRow[]) {
      const template = relation<TemplateRow>(job.template);
      const order = relation<OrderRow>(job.order);
      if (!template || !order) {
        await admin.from("wati_order_notification_outbox").update({
          status: "skipped", last_error: "notification_context_missing", locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }

      let values: OrderNotificationValues;
      let parameters: Array<{ name: string; value: string }>;
      let notification: ReturnType<typeof buildOrderNotificationContent>;
      try {
        values = valuesFor(order);
        parameters = renderWatiParameters(template.parameters || [], values);
        notification = buildOrderNotificationContent(template.event_key, values);
      } catch (error) {
        const message = error instanceof Error ? error.message : "notification_render_failed";
        const retryMinutes = Math.min(60, 2 ** Math.max(0, job.attempts - 1));
        await admin.from("wati_order_notification_outbox").update({
          status: "failed", last_error: message, locked_at: null,
          next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        failed += 1;
        continue;
      }
      const phone = normalizeWhatsAppNumber(
        order.contact_number_a_snapshot || order.contact_number_b_snapshot,
      );
      const email = order.email_snapshot?.trim() || "";
      let watiDone = Boolean(job.wati_sent_at || job.wati_skipped_at);
      let emailDone = Boolean(job.email_sent_at || job.email_skipped_at);
      const errors: string[] = [];

      if (!watiDone && !phone) {
        await admin.from("wati_order_notification_outbox").update({
          wati_skipped_at: new Date().toISOString(), wati_error: "recipient_phone_missing",
          recipient_phone: null, rendered_parameters: parameters,
        }).eq("id", job.id);
        watiDone = true;
      } else if (!watiDone) {
        try {
          const wati = await sendWati(phone, template, parameters);
          await admin.from("wati_order_notification_outbox").update({
            wati_sent_at: new Date().toISOString(), wati_message_id: wati.messageId || null,
            wati_provider_response: wati.payload, wati_error: null,
            recipient_phone: phone, rendered_parameters: parameters,
          }).eq("id", job.id);
          watiDone = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "wati_send_failed";
          errors.push(message);
          await admin.from("wati_order_notification_outbox").update({ wati_error: message }).eq("id", job.id);
        }
      }

      if (!emailDone && !email) {
        await admin.from("wati_order_notification_outbox").update({
          email_skipped_at: new Date().toISOString(), email_error: "recipient_email_missing",
        }).eq("id", job.id);
        emailDone = true;
      } else if (!emailDone) {
        try {
          const emailPayload = await sendEmail(email, notification.subject, notification.html);
          await admin.from("wati_order_notification_outbox").update({
            email_sent_at: new Date().toISOString(), email_provider_response: emailPayload, email_error: null,
          }).eq("id", job.id);
          emailDone = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "email_send_failed";
          errors.push(message);
          await admin.from("wati_order_notification_outbox").update({ email_error: message }).eq("id", job.id);
        }
      }

      const bothSkipped = !phone && !email;
      const done = watiDone && emailDone;
      const retryMinutes = Math.min(60, 2 ** Math.max(0, job.attempts - 1));
      const finalStatus = done ? (bothSkipped ? "skipped" : "sent") : "failed";
      const { error: finalError } = await admin.from("wati_order_notification_outbox").update({
        status: finalStatus,
        sent_at: done && !bothSkipped ? new Date().toISOString() : null,
        last_error: errors.join(" | ") || null,
        next_attempt_at: done
          ? new Date().toISOString()
          : new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (finalError) throw new Error(`notification_finalize_failed:${finalError.message}`);
      if (done) sent += 1; else failed += 1;
    }

    return response({ processed: (jobs || []).length, sent, failed });
  } catch (error) {
    return response({
      error: error instanceof Error ? error.message : "wati_order_notification_failed",
    }, 500);
  }
});
