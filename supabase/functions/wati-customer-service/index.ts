import { createClient } from "npm:@supabase/supabase-js@2";

import { EMAIL_FROM } from "../_shared/email-sender.ts";
import { answerCustomerServiceFaqWithAi, customerServiceAiConfig } from "../_shared/customer-service-ai.ts";
import { handleCustomerServiceTurn, type BotTurn } from "../_shared/customer-service-bot.ts";
import {
  classifyCustomerServiceMessage,
  isCustomerServiceGreeting,
  type ClassifiedMessage,
  type InquirySlots,
} from "../_shared/customer-service-intents.ts";
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

const AI_WAITING_REPLY = "收到，我正在查詢相關資料，請稍等一會 🙏";

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

function normalizeScheduleTime(value: unknown, fallback: string) {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isWithinAutoReplyWindow({
  now = new Date(),
  start,
  end,
  timeZone,
}: {
  now?: Date;
  start: string;
  end: string;
  timeZone: string;
}) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const current = hour * 60 + minute;
  const from = timeToMinutes(start);
  const until = timeToMinutes(end);
  if (from === until) return true;
  return from < until
    ? current >= from && current < until
    : current >= from || current < until;
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

function deploymentEnvironment() {
  return env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop");
}

function turnRoute(turn: BotTurn, classified: ClassifiedMessage) {
  if (!turn.reply && turn.conversation.state === "human_owned") return "human";
  if (turn.usedModel) return "ai";
  if (turn.faqSourceIds?.length) return "faq";
  if (turn.wroteInquiry || classified.intent === "lookup_order") return "tool";
  if (classified.intent === "handoff" || classified.intent === "handoff_order") return "handoff";
  return "rule";
}

async function recordCustomerServiceTurn(
  admin: AdminClient,
  input: {
    providerMessageId: string;
    phone: string;
    question: string;
    answer?: string | null;
    intent?: string | null;
    route?: string | null;
    stateBefore?: string | null;
    stateAfter?: string | null;
    usedModel?: boolean;
    model?: string | null;
    faqSourceIds?: string[];
    wroteInquiry?: boolean;
    notified?: boolean;
    humanHandoff?: boolean;
    replyAttempted?: boolean;
    replySent?: boolean;
    deliveryStatus?: string;
    processingStatus: "pending" | "replied" | "handoff" | "unanswered" | "skipped" | "failed";
    failureReason?: string | null;
    latencyMs: number;
  },
) {
  const { error } = await admin.from("customer_service_turns").upsert({
    provider_message_id: input.providerMessageId,
    phone_normalized: input.phone,
    question: input.question.slice(0, 2_000),
    answer: input.answer?.slice(0, 2_000) || null,
    intent: input.intent || null,
    route: input.route || null,
    state_before: input.stateBefore || null,
    state_after: input.stateAfter || null,
    used_model: Boolean(input.usedModel),
    model: input.model || null,
    faq_source_ids: input.faqSourceIds ?? [],
    wrote_inquiry: Boolean(input.wroteInquiry),
    notified_internal: Boolean(input.notified),
    human_handoff: Boolean(input.humanHandoff),
    reply_attempted: Boolean(input.replyAttempted),
    reply_sent: Boolean(input.replySent),
    delivery_status: input.deliveryStatus || "not_attempted",
    processing_status: input.processingStatus,
    failure_reason: input.failureReason || null,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    environment: deploymentEnvironment(),
  }, { onConflict: "provider_message_id" });
  if (error) {
    console.error("customer service turn audit failed", error.message.slice(0, 300));
  }
}

async function loadBotControls(admin: AdminClient) {
  const { data, error } = await admin.rpc("customer_service_controls_get");
  if (error) throw error;
  const row = (data as Array<{
    bot_enabled?: boolean;
    allowed_phones?: string[] | null;
    auto_reply_start?: string | null;
    auto_reply_end?: string | null;
    auto_reply_timezone?: string | null;
  }> | null)?.[0];
  return {
    botEnabled: Boolean(row?.bot_enabled),
    allowedPhones: [
      ...parseAllowedCustomerServicePhones(env("WATI_CUSTOMER_SERVICE_ALLOWED_PHONES")),
      ...parseAllowedCustomerServicePhones(row?.allowed_phones),
    ],
    autoReplyStart: normalizeScheduleTime(row?.auto_reply_start, "19:00"),
    autoReplyEnd: normalizeScheduleTime(row?.auto_reply_end, "09:00"),
    autoReplyTimezone: row?.auto_reply_timezone || "Asia/Hong_Kong",
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
    .select("phone_normalized,state,selected_order_id,handoff_at,pending_request")
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (error) throw error;
  return {
    phone_normalized: phone,
    state: (data?.state ?? "identifying") as
      | "identifying"
      | "picking_order"
      | "picking_handoff_order"
      | "collecting"
      | "human_owned",
    selected_order_id: data?.selected_order_id ?? null,
    handoff_at: data?.handoff_at ?? null,
    pending_request: data?.pending_request ?? null,
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
    pending_request: conversation.pending_request ?? null,
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
  input: {
    phone: string;
    quoteId: string | null;
    orderNumber: string | null;
    summary: string;
    kind?: "inquiry" | "order_handoff";
  },
) {
  let allowlist;
  try {
    allowlist = notificationRecipientAllowlist();
  } catch {
    return;
  }
  const guestPhone = normalizeNotificationPhone(input.phone);
  const appUrl = env("APP_URL").replace(/\/$/, "");
  const detailUrl = appUrl && input.quoteId
    ? `${appUrl}/${input.kind === "order_handoff" ? "orders" : "quotes"}/${input.quoteId}`
    : "";
  const contentInput = {
    formTitle: input.kind === "order_handoff" ? "WhatsApp 客服人工跟進" : "WhatsApp 到會意見",
    referenceCode: input.orderNumber || input.quoteId || input.phone,
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

function createBotDeps(
  admin: AdminClient,
  { dryRun = false, phone = "" }: { dryRun?: boolean; phone?: string } = {},
) {
  let activeConfigPromise: Promise<{
    model: string;
    system_prompt: string;
    temperature: number;
    retrieval_limit: number;
  } | null> | null = null;
  const loadActiveConfig = () => {
    activeConfigPromise ??= admin
      .from("customer_service_config_versions")
      .select("model,system_prompt,temperature,retrieval_limit")
      .eq("environment", deploymentEnvironment())
      .eq("status", "active")
      .maybeSingle()
      .then(({ data, error }: {
        data: unknown;
        error: { code?: string; message: string } | null;
      }) => {
        if (error && error.code !== "42P01") {
          console.error("customer service active config load failed", error.message.slice(0, 300));
        }
        return data as {
          model: string;
          system_prompt: string;
          temperature: number;
          retrieval_limit: number;
        } | null;
      });
    return activeConfigPromise;
  };
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
      const activeConfig = await loadActiveConfig();
      const { data, error } = await admin.rpc("search_published_customer_faqs", {
        p_query: query,
        p_limit: activeConfig?.retrieval_limit ?? 3,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; question: string; answer: string }>);
    },
    async answerFaqWithModel(query: string) {
      const activeConfig = await loadActiveConfig();
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
        config: activeConfig
          ? {
              ...customerServiceAiConfig(),
              model: activeConfig.model,
              systemPrompt: activeConfig.system_prompt,
              temperature: Number(activeConfig.temperature),
            }
          : customerServiceAiConfig(),
        beforeRequest: dryRun || !phone
          ? undefined
          : async () => {
              try {
                await deliverWatiSessionMessage({
                  creds: {
                    apiEndpoint: env("WATI_API_ENDPOINT"),
                    apiToken: env("WATI_API_TOKEN"),
                    accessToken: env("WATI_ACCESS_TOKEN"),
                    apiHost: env("WATI_API_HOST"),
                    tenantId: env("WATI_TENANT_ID"),
                  },
                  phone,
                  text: AI_WAITING_REPLY,
                  channelNumber: env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
                });
              } catch (error) {
                console.error(
                  "wati AI waiting notice failed",
                  error instanceof Error ? error.message.slice(0, 300) : String(error),
                );
              }
            },
      });
      return result ?? null;
    },
    async notifyInternal(input: {
      phone: string;
      quoteId: string | null;
      orderNumber: string | null;
      summary: string;
      kind?: "inquiry" | "order_handoff";
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
  const state = ["identifying", "picking_order", "picking_handoff_order", "collecting", "human_owned"].includes(
      String(input.state || ""),
    )
    ? String(input.state) as "identifying" | "picking_order" | "picking_handoff_order" | "collecting" | "human_owned"
    : "identifying";
  return {
    phone_normalized: phone,
    state,
    selected_order_id: typeof input.selected_order_id === "string" ? input.selected_order_id : null,
    handoff_at: typeof input.handoff_at === "string" ? input.handoff_at : null,
    pending_request: typeof input.pending_request === "string" ? input.pending_request : null,
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
    simulated_notify: turn.notified,
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

  const turnStartedAt = Date.now();
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
        pending_request: null,
      });
      return jsonResponse({ ok: true, handoff: true });
    }
    if (event.owner) {
      return jsonResponse({ ok: true, ignored: "owner" });
    }

    const recorded = await recordInbound(admin, event);
    if (recorded === "duplicate") {
      return jsonResponse({ ok: true, duplicate: true });
    }
    if (!controls.botEnabled) {
      await recordCustomerServiceTurn(admin, {
        providerMessageId: event.id,
        phone: event.waId,
        question: event.text,
        route: "silent",
        processingStatus: "skipped",
        failureReason: "bot_disabled",
        latencyMs: Date.now() - turnStartedAt,
      });
      return jsonResponse({ ok: true, bot_enabled: false, duplicate: false });
    }
    if (!isWithinAutoReplyWindow({
      start: controls.autoReplyStart,
      end: controls.autoReplyEnd,
      timeZone: controls.autoReplyTimezone,
    })) {
      await recordCustomerServiceTurn(admin, {
        providerMessageId: event.id,
        phone: event.waId,
        question: event.text,
        route: "silent",
        processingStatus: "skipped",
        failureReason: "outside_auto_reply_window",
        latencyMs: Date.now() - turnStartedAt,
      });
      return jsonResponse({
        ok: true,
        bot_enabled: true,
        within_auto_reply_window: false,
        duplicate: false,
      });
    }

    const conversation = await loadConversation(admin, event.waId);
    const classified = classifyCustomerServiceMessage(event.text);
    const loggedIntent = isCustomerServiceGreeting(event.text) ? "greeting" : classified.intent;
    let turn: BotTurn | null = null;
    try {
      turn = await handleCustomerServiceTurn({
        phone: event.waId,
        text: event.text,
        conversation,
        deps: createBotDeps(admin, { phone: event.waId }),
        classify: () => classified,
      });
      await saveConversation(admin, turn.conversation);

      if (turn.reply) {
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
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
      console.error("customer service turn failed", reason);
      await recordCustomerServiceTurn(admin, {
        providerMessageId: event.id,
        phone: event.waId,
        question: event.text,
        answer: turn?.reply,
        intent: loggedIntent,
        route: turn ? turnRoute(turn, classified) : "error",
        stateBefore: conversation.state,
        stateAfter: turn?.conversation.state || conversation.state,
        usedModel: turn?.usedModel,
        model: turn?.model,
        faqSourceIds: turn?.faqSourceIds,
        wroteInquiry: turn?.wroteInquiry,
        notified: turn?.notified,
        humanHandoff: turn?.conversation.state === "human_owned",
        replyAttempted: Boolean(turn?.reply),
        replySent: false,
        deliveryStatus: turn?.reply ? "failed" : "not_attempted",
        processingStatus: "failed",
        failureReason: reason,
        latencyMs: Date.now() - turnStartedAt,
      });
      throw error;
    }

    const route = turnRoute(turn, classified);
    const humanHandoff = turn.conversation.state === "human_owned";
    const unanswered = loggedIntent === "search_faq" &&
      !turn.usedModel && !(turn.faqSourceIds?.length);
    await recordCustomerServiceTurn(admin, {
      providerMessageId: event.id,
      phone: event.waId,
      question: event.text,
      answer: turn.reply,
      intent: loggedIntent,
      route,
      stateBefore: conversation.state,
      stateAfter: turn.conversation.state,
      usedModel: turn.usedModel,
      model: turn.model,
      faqSourceIds: turn.faqSourceIds,
      wroteInquiry: turn.wroteInquiry,
      notified: turn.notified,
      humanHandoff,
      replyAttempted: Boolean(turn.reply),
      replySent: Boolean(turn.reply),
      deliveryStatus: turn.reply ? "sent" : "not_attempted",
      processingStatus: humanHandoff
        ? "handoff"
        : unanswered
          ? "unanswered"
          : turn.reply
            ? "replied"
            : "skipped",
      failureReason: unanswered ? "no_grounded_answer" : null,
      latencyMs: Date.now() - turnStartedAt,
    });

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
