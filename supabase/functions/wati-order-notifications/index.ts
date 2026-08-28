import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFactoryUnsentReminderContent,
  buildOrderNotificationContent,
  buildUnassignedDriverReminderContent,
  supportsOrderEmailNotification,
  type InternalOrderNotificationValues,
  type OrderNotificationEvent,
  type OrderNotificationValues,
  type UnassignedDriverReminderOrder,
} from "../_shared/order-notification-content.ts";
import { EMAIL_FROM } from "../_shared/email-sender.ts";

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
type InternalQueueRow = {
  id: string;
  attempts: number;
  channel: "email" | "whatsapp";
  recipient_name: string;
  recipient_address: string;
  order: unknown;
};
type DriverAssignmentReminderJob = {
  id: string;
  attempts: number;
  reminder_date: string;
  channel: "email" | "whatsapp";
  recipient_name: string;
  recipient_address: string;
};
type TemplateRow = {
  event_key: OrderNotificationEvent;
  template_name: string;
  broadcast_name: string;
  parameters: ParameterRule[];
  is_active?: boolean;
};
type OrderRow = {
  id?: string;
  document_type?: string | null;
  archived_at?: string | null;
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
  created_at: string;
  is_sent_to_factory?: boolean | null;
  do_not_send_to_factory?: boolean | null;
};
type DriverReminderOrderRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  document_type: string | null;
  archived_at: string | null;
  delivery_time: string | null;
  delivery_status: string | null;
  shipping_methods: unknown;
};
type DriverReminderDeliveryRow = {
  delivery_at: string | null;
  delivery_time: string | null;
  delivery_status: string | null;
  shipping_methods: unknown;
  order: unknown;
};

const jsonHeaders = { "Content-Type": "application/json" };
const defaultActivationAt = "2026-08-31T00:00:00+08:00";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function notificationActivation() {
  const configured = Deno.env.get("WATI_NOTIFICATIONS_ACTIVATE_AT")?.trim()
    || defaultActivationAt;
  const timestamp = Date.parse(configured);
  if (Number.isNaN(timestamp)) throw new Error("invalid_wati_notifications_activate_at");
  return { configured, timestamp };
}

function hongKongDateAndHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

function driverReminderDate(now = new Date()) {
  const configured = Number(Deno.env.get("DRIVER_ASSIGNMENT_REMINDER_HOUR_HK")?.trim() || "9");
  if (!Number.isInteger(configured) || configured < 0 || configured > 23) {
    throw new Error("invalid_driver_assignment_reminder_hour_hk");
  }
  const local = hongKongDateAndHour(now);
  return local.hour >= configured ? local.date : null;
}

function nextDateKey(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function deliveryStartAt(order: OrderRow) {
  if (!order.delivery_at) return null;
  const deliveryDate = new Date(order.delivery_at);
  if (Number.isNaN(deliveryDate.valueOf())) return null;
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(deliveryDate);
  const datePart = (type: string) =>
    dateParts.find((entry) => entry.type === type)?.value || "";
  const dateKey = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const timeMatch = order.delivery_time?.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!timeMatch) return deliveryDate;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || "0");
  const meridiem = timeMatch[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return deliveryDate;
  return new Date(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`,
  );
}

function factoryUnsentReminderAt(order: OrderRow) {
  const deliveryStart = deliveryStartAt(order);
  return deliveryStart
    ? new Date(deliveryStart.getTime() - 12 * 60 * 60_000)
    : null;
}

function isCancelledStatus(value: string | null | undefined) {
  return /(取消|cancelled)/i.test(value || "");
}

function unassignedDriverReminderOrders(
  rows: DriverReminderDeliveryRow[],
  baseUrl: string,
): UnassignedDriverReminderOrder[] {
  const orders = new Map<string, UnassignedDriverReminderOrder>();
  for (const row of rows) {
    const order = relation<DriverReminderOrderRow>(row.order);
    if (
      !order
      || order.document_type !== "order"
      || order.archived_at
      || isCancelledStatus(row.delivery_status)
      || isCancelledStatus(order.delivery_status)
    ) continue;

    const method = relation<{
      name?: unknown;
      display_name?: unknown;
      requires_address_check?: unknown;
    }>(row.shipping_methods) || relation(order.shipping_methods);
    const methodLabel = `${String(method?.name || "")} ${String(method?.display_name || "")}`;
    if (method?.requires_address_check === false || /(自取|pickup)/i.test(methodLabel)) continue;

    orders.set(order.id, {
      order_number: order.order_number?.trim() || "-",
      customer_name: order.customer_name_snapshot?.trim()
        || order.company_name_snapshot?.trim()
        || "-",
      delivery_time: row.delivery_time?.trim() || order.delivery_time?.trim() || "-",
      order_link: `${baseUrl}/orders/${encodeURIComponent(order.id)}`,
    });
  }
  return [...orders.values()].sort((left, right) =>
    left.delivery_time.localeCompare(right.delivery_time)
    || left.order_number.localeCompare(right.order_number)
  );
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

function internalValues(
  order: OrderRow,
  recipientName: string,
): InternalOrderNotificationValues {
  const baseUrl = Deno.env.get("ORDER_ADMIN_BASE_URL")?.trim().replace(/\/$/, "") || "";
  return {
    recipient_name: recipientName.trim() || "同事",
    order_number: order.order_number?.trim() || "-",
    customer_name: order.customer_name_snapshot?.trim()
      || order.company_name_snapshot?.trim()
      || "-",
    delivery_date: formatHongKongDate(order.delivery_at),
    delivery_time: order.delivery_time?.trim() || "-",
    address: order.shipping_address_snapshot?.trim() || "-",
    order_link: baseUrl && order.id ? `${baseUrl}/orders/${encodeURIComponent(order.id)}` : "",
  };
}

function isPickup(order: OrderRow) {
  const method = relation<{ name?: unknown; display_name?: unknown; requires_address_check?: unknown }>(
    order.shipping_methods,
  );
  const label = `${String(method?.name || "")} ${String(method?.display_name || "")}`;
  return method?.requires_address_check === false || /(自取|pickup)/i.test(label);
}

function addonLink() {
  const explicit = Deno.env.get("WATI_ADD_ON_LINK")?.trim();
  if (explicit) return explicit;
  const base = Deno.env.get("SELF_SERVICE_PUBLIC_URL")?.trim().replace(/\/$/, "");
  return base ? `${base}/self_service_search` : "https://www.foodchannels-delivery.com/self_service_search";
}

function valuesFor(order: OrderRow): OrderNotificationValues {
  const pickup = isPickup(order);
  return {
    name: order.customer_name_snapshot?.trim() || order.company_name_snapshot?.trim() || "Customer",
    order_number: order.order_number?.trim() || "-",
    date: formatHongKongDate(order.delivery_at),
    time: order.delivery_time?.trim() || "-",
    address: order.shipping_address_snapshot?.trim() || "-",
    delivery_method: pickup ? "門市自取" : "送貨上門",
    ao_deadline: formatHongKongDate(order.delivery_at, 1),
    ao_link: addonLink(),
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
      from: EMAIL_FROM,
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

    const activation = notificationActivation();
    if (Date.now() < activation.timestamp) {
      return response({
        disabled: true,
        activateAt: activation.configured,
        processed: 0,
        sent: 0,
        failed: 0,
      });
    }

    const input = await request.json().catch(() => ({})) as { limit?: unknown };
    const requestedLimit = Number(input.limit || 20);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 20;
    const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());

    const dueDriverReminderDate = driverReminderDate();
    if (dueDriverReminderDate) {
      const { error: driverReminderEnqueueError } = await admin.rpc(
        "enqueue_driver_assignment_internal_reminders",
        { p_reminder_date: dueDriverReminderDate },
      );
      if (
        driverReminderEnqueueError
        && driverReminderEnqueueError.code !== "PGRST202"
      ) {
        throw new Error(`driver_reminder_enqueue_failed:${driverReminderEnqueueError.message}`);
      }
    }

    const { error: reminderError } = await admin.rpc("enqueue_due_wati_order_reminders", {
      p_now: new Date().toISOString(),
    });
    const customerPipelineAvailable = !reminderError
      || reminderError.code !== "PGRST202";
    if (reminderError && customerPipelineAvailable) {
      throw new Error(`reminder_enqueue_failed:${reminderError.message}`);
    }

    let claimedRows: Array<{ id: string }> = [];
    if (customerPipelineAvailable) {
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_wati_order_notifications",
        { p_limit: limit },
      );
      if (claimError) throw new Error(`notification_claim_failed:${claimError.message}`);
      claimedRows = (claimed || []) as Array<{ id: string }>;
    }
    let jobs: QueueRow[] = [];
    if (claimedRows.length) {
      const { data, error: jobsError } = await admin
        .from("wati_order_notification_outbox")
        .select("id,attempts,wati_sent_at,wati_skipped_at,email_sent_at,email_skipped_at,template:wati_order_notification_templates(event_key,template_name,broadcast_name,parameters,is_active),order:orders(order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,delivery_at,delivery_time,shipping_address_snapshot,created_at,shipping_methods(name,display_name,requires_address_check))")
        .in("id", claimedRows.map((row) => row.id));
      if (jobsError) throw new Error(`notification_load_failed:${jobsError.message}`);
      jobs = (data || []) as QueueRow[];
    }

    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
      const template = relation<TemplateRow>(job.template);
      const order = relation<OrderRow>(job.order);
      if (!template || !order) {
        await admin.from("wati_order_notification_outbox").update({
          status: "skipped", last_error: "notification_context_missing", locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }
      if (template.is_active === false) {
        const skippedAt = new Date().toISOString();
        await admin.from("wati_order_notification_outbox").update({
          status: "skipped",
          wati_skipped_at: job.wati_skipped_at || skippedAt,
          email_skipped_at: job.email_skipped_at || skippedAt,
          wati_error: "notification_event_disabled",
          email_error: "notification_event_disabled",
          last_error: "notification_event_disabled",
          locked_at: null,
          updated_at: skippedAt,
        }).eq("id", job.id);
        continue;
      }

      let values: OrderNotificationValues;
      let parameters: Array<{ name: string; value: string }>;
      let notification: ReturnType<typeof buildOrderNotificationContent> | null;
      try {
        values = valuesFor(order);
        parameters = renderWatiParameters(template.parameters || [], values);
        notification = supportsOrderEmailNotification(template.event_key)
          ? buildOrderNotificationContent(template.event_key, values)
          : null;
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
      let watiSent = Boolean(job.wati_sent_at);
      let emailSent = Boolean(job.email_sent_at);
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
          watiSent = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "wati_send_failed";
          errors.push(message);
          await admin.from("wati_order_notification_outbox").update({ wati_error: message }).eq("id", job.id);
        }
      }

      const emailNotification = notification;
      if (!emailDone && !emailNotification) {
        await admin.from("wati_order_notification_outbox").update({
          email_skipped_at: new Date().toISOString(), email_error: "email_template_disabled",
        }).eq("id", job.id);
        emailDone = true;
      } else if (!emailDone && !email) {
        await admin.from("wati_order_notification_outbox").update({
          email_skipped_at: new Date().toISOString(), email_error: "recipient_email_missing",
        }).eq("id", job.id);
        emailDone = true;
      } else if (!emailDone && emailNotification) {
        try {
          const emailPayload = await sendEmail(
            email,
            emailNotification.subject,
            emailNotification.html,
          );
          await admin.from("wati_order_notification_outbox").update({
            email_sent_at: new Date().toISOString(), email_provider_response: emailPayload, email_error: null,
          }).eq("id", job.id);
          emailDone = true;
          emailSent = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "email_send_failed";
          errors.push(message);
          await admin.from("wati_order_notification_outbox").update({ email_error: message }).eq("id", job.id);
        }
      }

      const bothSkipped = !watiSent && !emailSent;
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

    const { data: internalClaimed, error: internalClaimError } = await admin.rpc(
      "claim_order_internal_notifications",
      { p_limit: limit },
    );
    if (internalClaimError) {
      throw new Error(`internal_notification_claim_failed:${internalClaimError.message}`);
    }
    const internalIds = (internalClaimed || []) as Array<{ id: string }>;
    let internalJobs: InternalQueueRow[] = [];
    if (internalIds.length) {
      const { data, error: internalLoadError } = await admin
        .from("order_internal_notification_outbox")
        .select("id,attempts,channel,recipient_name,recipient_address,order:orders(id,order_number,customer_name_snapshot,company_name_snapshot,document_type,archived_at,delivery_at,delivery_time,shipping_address_snapshot,created_at,is_sent_to_factory,do_not_send_to_factory)")
        .in("id", internalIds.map((row) => row.id));
      if (internalLoadError) {
        throw new Error(`internal_notification_load_failed:${internalLoadError.message}`);
      }
      internalJobs = (data || []) as InternalQueueRow[];
    }

    for (const job of internalJobs) {
      const order = relation<OrderRow>(job.order);
      if (!order) {
        await admin.from("order_internal_notification_outbox").update({
          status: "skipped",
          last_error: "notification_context_missing",
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }
      if (order.document_type !== "order" || order.archived_at) {
        await admin.from("order_internal_notification_outbox").update({
          status: "skipped",
          last_error: "order_not_active",
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }
      if (order.is_sent_to_factory === true || order.do_not_send_to_factory === true) {
        await admin.from("order_internal_notification_outbox").update({
          status: "skipped",
          last_error: order.is_sent_to_factory === true
            ? "factory_already_sent"
            : "factory_send_not_required",
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }

      const reminderAt = factoryUnsentReminderAt(order);
      if (!reminderAt) {
        await admin.from("order_internal_notification_outbox").update({
          status: "skipped",
          last_error: "delivery_schedule_missing",
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }
      if (Date.now() < reminderAt.getTime()) {
        await admin.from("order_internal_notification_outbox").update({
          status: "pending",
          attempts: Math.max(0, job.attempts - 1),
          scheduled_at: reminderAt.toISOString(),
          last_error: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }

      try {
        const values = internalValues(order, job.recipient_name);
        let providerPayload: unknown;
        if (job.channel === "email") {
          const notification = buildFactoryUnsentReminderContent(values);
          providerPayload = await sendEmail(
            job.recipient_address.trim(),
            notification.subject,
            notification.html,
          );
        } else {
          const phone = normalizeWhatsAppNumber(job.recipient_address);
          if (!phone) throw new Error("recipient_phone_invalid");
          const templateName = Deno.env.get("WATI_FACTORY_UNSENT_TEMPLATE_NAME")?.trim();
          const broadcastName = Deno.env.get("WATI_FACTORY_UNSENT_BROADCAST_NAME")?.trim();
          if (!templateName || !broadcastName) {
            await admin.from("order_internal_notification_outbox").update({
              status: "pending",
              attempts: Math.max(0, job.attempts - 1),
              scheduled_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
              last_error: "factory_unsent_wati_template_not_configured",
              locked_at: null,
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
            continue;
          }
          const template: TemplateRow = {
            event_key: "delivery_order_confirmed",
            template_name: templateName,
            broadcast_name: broadcastName,
            parameters: [],
          };
          const wati = await sendWati(phone, template, [
            { name: "recipient_name", value: values.recipient_name },
            { name: "order_number", value: values.order_number },
            { name: "customer_name", value: values.customer_name },
            { name: "delivery_date", value: values.delivery_date },
            { name: "delivery_time", value: values.delivery_time },
            { name: "order_link", value: values.order_link },
          ]);
          providerPayload = wati.payload;
        }

        await admin.from("order_internal_notification_outbox").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_response: providerPayload,
          last_error: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "internal_notification_send_failed";
        const retryMinutes = Math.min(60, 2 ** Math.max(0, job.attempts - 1));
        await admin.from("order_internal_notification_outbox").update({
          status: "failed",
          last_error: message,
          scheduled_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        failed += 1;
      }
    }

    let driverReminderJobs: DriverAssignmentReminderJob[] = [];
    const { data: driverReminderClaimed, error: driverReminderClaimError } = await admin.rpc(
      "claim_driver_assignment_internal_reminders",
      { p_limit: limit },
    );
    if (
      driverReminderClaimError
      && driverReminderClaimError.code !== "PGRST202"
    ) {
      throw new Error(`driver_reminder_claim_failed:${driverReminderClaimError.message}`);
    }
    if (!driverReminderClaimError) {
      driverReminderJobs = (driverReminderClaimed || []) as DriverAssignmentReminderJob[];
    }

    const driverOrdersByDate = new Map<string, UnassignedDriverReminderOrder[]>();
    for (const job of driverReminderJobs) {
      try {
        let reminderOrders = driverOrdersByDate.get(job.reminder_date);
        if (!reminderOrders) {
          const start = `${job.reminder_date}T00:00:00+08:00`;
          const end = `${nextDateKey(job.reminder_date)}T00:00:00+08:00`;
          const { data: deliveryRows, error: deliveryError } = await admin
            .from("deliveries")
            .select("delivery_at,delivery_time,delivery_status,motorcade_id,fulfilled_at,shipping_methods(name,display_name,requires_address_check),order:orders!inner(id,order_number,customer_name_snapshot,company_name_snapshot,document_type,archived_at,delivery_time,delivery_status,shipping_methods(name,display_name,requires_address_check))")
            .gte("delivery_at", start)
            .lt("delivery_at", end)
            .is("motorcade_id", null)
            .is("fulfilled_at", null);
          if (deliveryError) {
            throw new Error(`driver_reminder_orders_failed:${deliveryError.message}`);
          }
          const adminBaseUrl = requiredEnv("ORDER_ADMIN_BASE_URL").replace(/\/$/, "");
          reminderOrders = unassignedDriverReminderOrders(
            (deliveryRows || []) as DriverReminderDeliveryRow[],
            adminBaseUrl,
          );
          driverOrdersByDate.set(job.reminder_date, reminderOrders);
        }

        if (!reminderOrders.length) {
          await admin.from("driver_assignment_internal_reminder_outbox").update({
            status: "skipped",
            last_error: "no_unassigned_delivery_orders",
            locked_at: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          continue;
        }

        const notification = buildUnassignedDriverReminderContent({
          date: formatHongKongDate(`${job.reminder_date}T00:00:00+08:00`),
          orders: reminderOrders,
        });
        let providerPayload: unknown;
        if (job.channel === "email") {
          providerPayload = await sendEmail(
            job.recipient_address.trim(),
            notification.subject,
            notification.html,
          );
        } else {
          const phone = normalizeWhatsAppNumber(job.recipient_address);
          if (!phone) throw new Error("recipient_phone_invalid");
          const templateName = Deno.env.get("WATI_DRIVER_ASSIGNMENT_REMINDER_TEMPLATE_NAME")?.trim();
          const broadcastName = Deno.env.get("WATI_DRIVER_ASSIGNMENT_REMINDER_BROADCAST_NAME")?.trim();
          if (!templateName || !broadcastName) {
            await admin.from("driver_assignment_internal_reminder_outbox").update({
              status: "pending",
              attempts: Math.max(0, job.attempts - 1),
              scheduled_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
              last_error: "driver_assignment_wati_template_not_configured",
              locked_at: null,
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
            continue;
          }
          const template: TemplateRow = {
            event_key: "driver_assigned",
            template_name: templateName,
            broadcast_name: broadcastName,
            parameters: [],
          };
          const wati = await sendWati(phone, template, [
            { name: "date", value: formatHongKongDate(`${job.reminder_date}T00:00:00+08:00`) },
            { name: "count", value: String(reminderOrders.length) },
            {
              name: "orders",
              value: reminderOrders.map((order) =>
                `${order.order_number} | ${order.delivery_time} | ${order.order_link}`
              ).join("\n"),
            },
          ]);
          providerPayload = wati.payload;
        }
        await admin.from("driver_assignment_internal_reminder_outbox").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_response: providerPayload,
          last_error: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "driver_reminder_send_failed";
        const retryMinutes = Math.min(60, 2 ** Math.max(0, job.attempts - 1));
        await admin.from("driver_assignment_internal_reminder_outbox").update({
          status: "failed",
          last_error: message,
          scheduled_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        failed += 1;
      }
    }

    return response({
      processed: jobs.length + internalJobs.length + driverReminderJobs.length,
      sent,
      failed,
      customerProcessed: jobs.length,
      internalProcessed: internalJobs.length,
      driverReminderProcessed: driverReminderJobs.length,
    });
  } catch (error) {
    return response({
      error: error instanceof Error ? error.message : "wati_order_notification_failed",
    }, 500);
  }
});
