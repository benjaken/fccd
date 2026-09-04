import { createClient } from "npm:@supabase/supabase-js@2";

import { EMAIL_FROM } from "../_shared/email-sender.ts";
import { answerCustomerServiceFaqWithAi } from "../_shared/customer-service-ai.ts";
import { handleCustomerServiceTurn } from "../_shared/customer-service-bot.ts";
import { type InquirySlots } from "../_shared/customer-service-intents.ts";
import {
  BRAND_WHATSAPP_CHANNEL,
  customerServicePhoneAllowed,
  excludeGuestContacts,
  isBrandWhatsAppChannel,
  isHumanOperatorMessage,
  parseAllowedCustomerServicePhones,
  parseWatiInboundEvent,
  deliverWatiSessionMessage,
  verifyWatiWebhook,
} from "../_shared/wati-customer-service-adapter.ts";
import {
  buildEnquiryInternalContent,
  buildEnquiryInternalWatiParameters,
  ENQUIRY_INTERNAL_WATI_TEMPLATE,
} from "../_shared/enquiry-notification-content.ts";
import {
  isNotificationEmailAllowed,
  isNotificationPhoneAllowed,
  normalizeNotificationPhone,
  notificationRecipientAllowlist,
} from "../_shared/notification-recipient-allowlist.ts";
import { watiEmergencySwitchAllows } from "../_shared/wati-notification-controls.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wati-secret, x-webhook-secret, x-wati-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function requiredEnv(name: string) {
  const value = env(name);
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function serviceRoleKey() {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const configured = env("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}

function createAdminClient() {
  return createClient(env("SUPABASE_URL"), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadBotControls(admin: AdminClient) {
  const { data, error } = await admin.rpc("customer_service_controls_get");
  if (error) throw error;
  const row = (data as Array<{
    bot_enabled?: boolean;
    allowed_phones?: string[] | null;
  }> | null)?.[0];
  return {
    botEnabled: Boolean(row?.bot_enabled),
    allowedPhones: [
      ...parseAllowedCustomerServicePhones(env("WATI_CUSTOMER_SERVICE_ALLOWED_PHONES")),
      ...parseAllowedCustomerServicePhones(row?.allowed_phones),
    ],
  };
}

async function recordInbound(admin: AdminClient, event: {
  id: string;
  waId: string;
  text: string;
}) {
  const { error } = await admin.from("customer_service_inbound_events").insert({
    provider_message_id: event.id,
    phone_normalized: event.waId,
    body: event.text,
  });
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return "inserted";
}

async function loadConversation(admin: AdminClient, phone: string) {
  const { data, error } = await admin
    .from("customer_service_conversations")
    .select("phone_normalized,state,selected_order_id,handoff_at")
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (error) throw error;
  return {
    phone_normalized: phone,
    state: (data?.state ?? "identifying") as
      | "identifying"
      | "picking_order"
      | "collecting"
      | "human_owned",
    selected_order_id: data?.selected_order_id ?? null,
    handoff_at: data?.handoff_at ?? null,
  };
}

async function saveConversation(
  admin: AdminClient,
  conversation: Awaited<ReturnType<typeof loadConversation>>,
) {
  const { error } = await admin.from("customer_service_conversations").upsert({
    phone_normalized: conversation.phone_normalized,
    state: conversation.state,
    selected_order_id: conversation.selected_order_id,
    handoff_at: conversation.handoff_at,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function sendInternalEmail(to: string[], subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!response.ok) {
    throw new Error(`email_send_failed:${response.status}`);
  }
}

async function notifyInternal(
  admin: AdminClient,
  input: { phone: string; quoteId: string; orderNumber: string | null; summary: string },
) {
  let allowlist;
  try {
    allowlist = notificationRecipientAllowlist();
  } catch {
    return;
  }
  const guestPhone = normalizeNotificationPhone(input.phone);
  const appUrl = env("APP_URL").replace(/\/$/, "");
  const detailUrl = appUrl ? `${appUrl}/quotes/${input.quoteId}` : "";
  const contentInput = {
    formTitle: "WhatsApp 到會意見",
    referenceCode: input.orderNumber || input.quoteId,
    customerName: "WhatsApp 客人",
    phone: input.phone,
    quoteDescription: input.summary,
    detailUrl,
  };

  const { data: recipients, error } = await admin.rpc("enquiry_internal_email_recipients");
  if (error) throw error;
  const addresses = [...new Set(
    ((recipients || []) as Array<{ recipient_address?: string }>)
      .map((item) => (item.recipient_address || "").trim().toLowerCase())
      .filter((address) =>
        address
        && isNotificationEmailAllowed(allowlist, address)
          && excludeGuestContacts([address], guestPhone).length > 0
      ),
  )];
  if (addresses.length) {
    const mail = buildEnquiryInternalContent(contentInput);
    await sendInternalEmail(addresses, mail.subject, mail.html);
  }

  if (watiEmergencySwitchAllows("WATI_ENQUIRY_INTERNAL_ENABLED")) {
    const { data: staff, error: staffError } = await admin
      .from("order_first_notification_recipients")
      .select("phone");
    if (staffError) throw staffError;
    const phones = [...new Set(
      ((staff || []) as Array<{ phone?: string }>)
        .map((item) => normalizeNotificationPhone(item.phone))
        .filter((phone) =>
          Boolean(phone)
          && phone !== guestPhone
          && isNotificationPhoneAllowed(allowlist, phone)
        ),
    )];
    const parameters = buildEnquiryInternalWatiParameters(contentInput);
    const endpoint = requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "");
    const token = requiredEnv("WATI_API_TOKEN");
    const templateName = env("WATI_ENQUIRY_INTERNAL_TEMPLATE_NAME") || ENQUIRY_INTERNAL_WATI_TEMPLATE;
    for (const phone of phones) {
      await fetch(
        `${endpoint}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_name: templateName,
            broadcast_name: env("WATI_ENQUIRY_INTERNAL_BROADCAST_NAME") || templateName,
            channel_number: env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
            parameters,
          }),
        },
      );
    }
  }
}

function createBotDeps(admin: AdminClient, { dryRun = false } = {}) {
  return {
    async lookupOrders(phone: string) {
      const { data, error } = await admin.rpc("customer_service_lookup_orders", { p_phone: phone });
      if (error) throw error;
      return (data ?? []) as Array<{
        order_id: string;
        order_number: string | null;
        order_date: string | null;
        delivery_at: string | null;
        delivery_status: string | null;
        masked_email: string | null;
        masked_address: string | null;
        addon_url: string | null;
      }>;
    },
    async writeInquiry(phone: string, slots: InquirySlots, anotherEvent: boolean) {
      if (dryRun) {
        return {
          quote_id: "00000000-0000-4000-8000-000000000000",
          order_number: "PREVIEW",
          created: false,
        };
      }
      const { data, error } = await admin.rpc("customer_service_write_inquiry", {
        p_phone: phone,
        p_event_date: slots.eventDate || null,
        p_headcount: slots.headcount || null,
        p_budget: slots.budget || null,
        p_dietary: slots.dietary || null,
        p_cuisine: slots.cuisine || null,
        p_note: slots.note || null,
        p_another_event: anotherEvent,
      });
      if (error) throw error;
      const row = (data as Array<{ quote_id: string; order_number: string | null; created: boolean }> | null)?.[0];
      if (!row) throw new Error("inquiry_write_failed");
      return row;
    },
    async searchFaqs(query: string) {
      const { data, error } = await admin.rpc("search_published_customer_faqs", {
        p_query: query,
        p_limit: 3,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; question: string; answer: string }>);
    },
    async answerFaqWithModel(query: string) {
      const { data, error } = await admin
        .from("customer_faqs")
        .select("id,category,question,answer")
        .eq("is_published", true)
        .order("sort_order")
        .limit(100);
      if (error) throw error;
      const result = await answerCustomerServiceFaqWithAi({
        question: query,
        faqs: (data ?? []) as Array<{
          id: string;
          category: string;
          question: string;
          answer: string;
        }>,
      });
      return result?.answer ?? null;
    },
    async notifyInternal(input: {
      phone: string;
      quoteId: string;
      orderNumber: string | null;
      summary: string;
    }) {
      if (dryRun) return;
      try {
        await notifyInternal(admin, input);
      } catch (error) {
        console.error("whatsapp inquiry internal notify failed", error);
      }
    },
  };
}

function previewConversation(value: unknown, phone: string) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const state = ["identifying", "picking_order", "collecting", "human_owned"].includes(
      String(input.state || ""),
    )
    ? String(input.state) as "identifying" | "picking_order" | "collecting" | "human_owned"
    : "identifying";
  return {
    phone_normalized: phone,
    state,
    selected_order_id: typeof input.selected_order_id === "string" ? input.selected_order_id : null,
    handoff_at: typeof input.handoff_at === "string" ? input.handoff_at : null,
  };
}

async function handleBackendPreview(request: Request, payload: Record<string, unknown>) {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }
  const userClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await userClient.rpc("customer_service_controls_get");
  if (accessError) return jsonResponse({ error: "page_access_required" }, 403);

  const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 1_000) : "";
  if (!text) return jsonResponse({ error: "message_required" }, 400);
  const phone = normalizeNotificationPhone(
    typeof payload.phone === "string" ? payload.phone : "",
  ) || "85200000000";
  const admin = createAdminClient();
  const turn = await handleCustomerServiceTurn({
    phone,
    text,
    conversation: previewConversation(payload.conversation, phone),
    deps: createBotDeps(admin, { dryRun: true }),
  });
  return jsonResponse({
    ok: true,
    reply: turn.reply,
    conversation: turn.conversation,
    used_model: turn.usedModel,
    simulated_write: turn.wroteInquiry,
    human_handoff: turn.conversation.state === "human_owned",
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (payload.mode === "preview") {
    try {
      return await handleBackendPreview(request, payload);
    } catch (error) {
      console.error(
        "customer service preview failed",
        error instanceof Error ? error.message.slice(0, 300) : String(error),
      );
      return jsonResponse({
        error: "customer_service_preview_failed",
        detail: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  }

  const secret = env("WATI_WEBHOOK_SECRET");
  if (!(await verifyWatiWebhook({ request, rawBody, secret }))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const event = parseWatiInboundEvent(payload);
  if (!event) {
    return jsonResponse({ ok: true, ignored: "unparsed" });
  }
  if (!isBrandWhatsAppChannel(event.channelPhoneNumber, env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL)) {
    return jsonResponse({ error: "channel_mismatch" }, 403);
  }

  try {
    const admin = createAdminClient();
    const controls = await loadBotControls(admin);
    if (!customerServicePhoneAllowed(event.waId, controls.allowedPhones)) {
      return jsonResponse({ ok: true, ignored: "phone_not_allowed" });
    }
    if (isHumanOperatorMessage(event)) {
      await saveConversation(admin, {
        phone_normalized: event.waId,
        state: "human_owned",
        selected_order_id: null,
        handoff_at: new Date().toISOString(),
      });
      return jsonResponse({ ok: true, handoff: true });
    }
    if (event.owner) {
      return jsonResponse({ ok: true, ignored: "owner" });
    }

    const recorded = await recordInbound(admin, event);
    if (!controls.botEnabled) {
      return jsonResponse({ ok: true, bot_enabled: false, duplicate: recorded === "duplicate" });
    }

    const conversation = await loadConversation(admin, event.waId);
    if (conversation.state === "human_owned" && recorded === "duplicate") {
      return jsonResponse({ ok: true, duplicate: true, state: "human_owned" });
    }
    const turn = await handleCustomerServiceTurn({
      phone: event.waId,
      text: event.text,
      conversation,
      deps: createBotDeps(admin),
    });

    if (turn.reply) {
      try {
        await deliverWatiSessionMessage({
          creds: {
            apiEndpoint: env("WATI_API_ENDPOINT"),
            apiToken: env("WATI_API_TOKEN"),
            accessToken: env("WATI_ACCESS_TOKEN"),
            apiHost: env("WATI_API_HOST"),
            tenantId: env("WATI_TENANT_ID"),
          },
          phone: event.waId,
          text: turn.reply,
          channelNumber: env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
        });
      } catch (error) {
        console.error(
          "wati session send failed",
          error instanceof Error ? error.message.slice(0, 300) : String(error),
        );
        throw error;
      }
    }
    await saveConversation(admin, turn.conversation);

    return jsonResponse({
      ok: true,
      replied: Boolean(turn.reply),
      state: turn.conversation.state,
      wrote_inquiry: turn.wroteInquiry,
    });
  } catch (error) {
    console.error(
      "customer service failed",
      error instanceof Error ? error.message.slice(0, 300) : String(error),
    );
    return jsonResponse({
      error: "customer_service_failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
