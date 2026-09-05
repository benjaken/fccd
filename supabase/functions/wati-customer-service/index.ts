import { createClient } from "npm:@supabase/supabase-js@2";

import { EMAIL_FROM } from "../_shared/email-sender.ts";
import {
  answerCustomerServiceFaqWithTieredAi,
  classifyCustomerServiceWithTieredAi,
  customerServiceAiConfig,
  type CustomerServiceAiTierConfig,
  type CustomerServiceIntentConfig,
} from "../_shared/customer-service-ai.ts";
import {
  sanitizeCustomerServiceContextText,
  sanitizeCustomerServiceRecentMessages,
  type CustomerServiceRecentMessage,
} from "../_shared/customer-service-context.ts";
import {
  handleCustomerServiceTurn,
  type CustomerServiceConversation,
} from "../_shared/customer-service-bot.ts";
import {
  classifyCustomerServiceMessage,
  type ClassifiedMessage,
  type CustomerServiceIntent,
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
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
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
  return (
    env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu")
      ? "production"
      : "develop")
  );
}

function watiCredentials() {
  return {
    apiEndpoint: env("WATI_API_ENDPOINT"),
    apiToken: env("WATI_API_TOKEN"),
    accessToken: env("WATI_ACCESS_TOKEN"),
    apiHost: env("WATI_API_HOST"),
    tenantId: env("WATI_TENANT_ID"),
  };
}

function providerMessageIdFromResponse(raw: string) {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const result = value.result && typeof value.result === "object"
      ? value.result as Record<string, unknown>
      : {};
    return String(
      value.whatsappMessageId || value.messageId || value.id ||
      result.whatsappMessageId || result.messageId || result.id || "",
    ).trim() || null;
  } catch {
    return null;
  }
}

type ReplyTemplates = Partial<
  Record<
    | "help"
    | "handoff"
    | "collect_prompt"
    | "collect_more"
    | "collect_done"
    | "no_faq"
    | "refuse",
    string
  >
>;

type WorkflowPolicy = {
  goalKey: "order_change" | "catering_inquiry";
  instructions: string;
  contextWindow: number;
  clarificationThreshold: number;
  autoResume: boolean;
};

const ACTION_INTENTS: Record<string, CustomerServiceIntent> = {
  faq_search: "search_faq",
  order_lookup: "lookup_order",
  order_handoff: "handoff_order",
  inquiry_collect: "collect_inquiry",
  human_handoff: "handoff",
};

const ACTION_TO_REQUIRED_TOOL: Record<string, string> = {
  faq_search: "search_faqs",
  order_lookup: "lookup_orders",
  order_handoff: "lookup_orders",
  inquiry_collect: "write_inquiry",
  human_handoff: "notify_internal",
};

async function loadCustomerServiceRuntime(admin: AdminClient) {
  const [
    { data: intentRows, error: intentError },
    { data: permissionRows, error: permissionError },
    { data: templateRows, error: templateError },
    { data: workflowRows, error: workflowError },
  ] = await Promise.all([
    admin
      .from("customer_service_intents")
      .select(
        "intent_key,display_name,description,examples,action_key,confidence_threshold",
      )
      .eq("enabled", true)
      .order("priority"),
    admin
      .from("customer_service_tool_permissions")
      .select("intent_key,tool_key")
      .eq("allowed", true),
    admin
      .from("customer_service_reply_templates")
      .select("template_key,content")
      .eq("enabled", true),
    admin
      .from("customer_service_workflow_policies")
      .select("goal_key,instructions,context_window,clarification_threshold,auto_resume")
      .eq("enabled", true),
  ]);
  if (intentError) throw intentError;
  if (permissionError) throw permissionError;
  if (templateError) throw templateError;
  if (workflowError) throw workflowError;

  const toolsByIntent = new Map<string, string[]>();
  for (const row of (permissionRows ?? []) as Array<{
    intent_key: string;
    tool_key: string;
  }>) {
    toolsByIntent.set(row.intent_key, [
      ...(toolsByIntent.get(row.intent_key) ?? []),
      row.tool_key,
    ]);
  }
  const intents = (
    (intentRows ?? []) as Array<{
      intent_key: string;
      display_name: string;
      description: string;
      examples: string[] | null;
      action_key: string;
      confidence_threshold: number | string;
    }>
  ).map<CustomerServiceIntentConfig>((row) => ({
    intentKey: row.intent_key,
    displayName: row.display_name,
    description: row.description,
    examples: Array.isArray(row.examples) ? row.examples : [],
    actionKey: row.action_key,
    confidenceThreshold: Number(row.confidence_threshold),
    toolKeys: toolsByIntent.get(row.intent_key) ?? [],
  }));
  const replyTemplates: ReplyTemplates = {};
  for (const row of (templateRows ?? []) as Array<{
    template_key: keyof ReplyTemplates;
    content: string;
  }>) {
    replyTemplates[row.template_key] = row.content;
  }
  const workflowPolicies = ((workflowRows ?? []) as Array<{
    goal_key: WorkflowPolicy["goalKey"];
    instructions: string;
    context_window: number;
    clarification_threshold: number | string;
    auto_resume: boolean;
  }>).map((row): WorkflowPolicy => ({
    goalKey: row.goal_key,
    instructions: row.instructions,
    contextWindow: Number(row.context_window),
    clarificationThreshold: Number(row.clarification_threshold),
    autoResume: row.auto_resume,
  }));
  return { intents, replyTemplates, workflowPolicies };
}

function createCustomerServiceClassifier({
  intents,
  conversationState,
  pendingRequest,
  recentMessages = [],
  activeGoal,
  workflowPolicies = [],
  tiers,
}: {
  intents: CustomerServiceIntentConfig[];
  conversationState: string;
  pendingRequest?: string | null;
  recentMessages?: CustomerServiceRecentMessage[];
  activeGoal?: WorkflowPolicy["goalKey"] | null;
  workflowPolicies?: WorkflowPolicy[];
  tiers: CustomerServiceAiTierConfig;
}) {
  return async (text: string): Promise<ClassifiedMessage> => {
    const fallback = classifyCustomerServiceMessage(text);
    const activePolicy = workflowPolicies.find((item) => item.goalKey === activeGoal);
    // Safety rules remain deterministic and cannot be overridden by the model.
    if (
      fallback.intent === "prompt_injection" ||
      fallback.intent === "out_of_scope"
    )
      return fallback;
    try {
      const result = await classifyCustomerServiceWithTieredAi({
        message: text,
        conversationState,
        pendingRequest: pendingRequest ?? "",
        recentMessages: recentMessages.slice(-(activePolicy?.contextWindow ?? 8)),
        workflowInstructions: activePolicy?.instructions ?? "",
        intents,
        tiers,
      });
      if (!result) return fallback;
      const config = intents.find(
        (item) => item.intentKey === result.intentKey,
      );
      if (
        !config ||
        (result.confidence < config.confidenceThreshold && !result.needsClarification)
      )
        return fallback;
      const requiredTool = ACTION_TO_REQUIRED_TOOL[config.actionKey];
      if (requiredTool && !config.toolKeys.includes(requiredTool))
        return fallback;
      const intent =
        config.actionKey === "refuse"
          ? config.intentKey === "prompt_injection"
            ? "prompt_injection"
            : "out_of_scope"
          : ACTION_INTENTS[config.actionKey];
      if (!intent) return fallback;
      const targetGoal = intent === "handoff_order"
        ? "order_change"
        : intent === "collect_inquiry"
          ? "catering_inquiry"
          : activeGoal;
      const targetPolicy = workflowPolicies.find((item) => item.goalKey === targetGoal);
      const policyNeedsClarification = Boolean(
        targetPolicy && result.confidence < targetPolicy.clarificationThreshold,
      );
      return {
        ...fallback,
        intent,
        usedModel: true,
        confidence: result.confidence,
        configuredIntentKey: config.intentKey,
        toolKey: requiredTool || result.toolKey,
        orderNumber: result.orderNumber || fallback.orderNumber,
        requestedDate: result.requestedDate,
        requestedFields: result.requestedFields.length
          ? result.requestedFields
          : fallback.requestedFields,
        missingFields: result.missingFields,
        requiresHuman: result.requiresHuman,
        model: result.model,
        dialogAction: result.dialogAction,
        needsClarification: result.needsClarification || policyNeedsClarification,
        clarificationQuestion: result.clarificationQuestion || (
          policyNeedsClarification
            ? "我未能完全確認你想處理嘅事項，可以講清楚係修改訂單、訂餐，定係查詢資料嗎？"
            : ""
        ),
        slots: {
          ...fallback.slots,
          eventDate: result.requestedDate || fallback.slots.eventDate,
        },
      };
    } catch (error) {
      console.error(
        "customer-service AI classification failed",
        error instanceof Error ? error.message.slice(0, 300) : String(error),
      );
      return fallback;
    }
  };
}

async function loadBotControls(admin: AdminClient) {
  const { data, error } = await admin.rpc("customer_service_controls_get");
  if (error) throw error;
  const row = (
    data as Array<{
      bot_enabled?: boolean;
      allowed_phones?: string[] | null;
      auto_reply_start?: string | null;
      auto_reply_end?: string | null;
      auto_reply_timezone?: string | null;
    }> | null
  )?.[0];
  return {
    botEnabled: Boolean(row?.bot_enabled),
    allowedPhones: [
      ...parseAllowedCustomerServicePhones(
        env("WATI_CUSTOMER_SERVICE_ALLOWED_PHONES"),
      ),
      ...parseAllowedCustomerServicePhones(row?.allowed_phones),
    ],
    autoReplyStart: normalizeScheduleTime(row?.auto_reply_start, "19:00"),
    autoReplyEnd: normalizeScheduleTime(row?.auto_reply_end, "09:00"),
    autoReplyTimezone: row?.auto_reply_timezone || "Asia/Hong_Kong",
  };
}

async function recordInbound(
  admin: AdminClient,
  event: {
    id: string;
    waId: string;
    text: string;
  },
) {
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
  const [{ data, error }, { data: messageRows, error: messageError }] = await Promise.all([
    admin
      .from("customer_service_conversations")
      .select(
        "phone_normalized,state,selected_order_id,handoff_at,pending_request,active_goal,workflow_slots,workflow_version,suspended_goals,identity_verified_at,identity_verification_method,identity_verification_order_id,identity_verification_attempts",
      )
      .eq("phone_normalized", phone)
      .maybeSingle(),
    admin
      .from("customer_service_messages")
      .select("role,message_text")
      .eq("phone_normalized", phone)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (error) throw error;
  if (messageError) throw messageError;
  return {
    phone_normalized: phone,
    state: (data?.state ?? "identifying") as
      | "identifying"
      | "verifying_order"
      | "picking_order"
      | "picking_handoff_order"
      | "collecting"
      | "awaiting_human"
      | "human_owned",
    selected_order_id: data?.selected_order_id ?? null,
    handoff_at: data?.handoff_at ?? null,
    pending_request: data?.pending_request ?? null,
    active_goal: data?.active_goal ?? null,
    workflow_slots: data?.workflow_slots ?? {},
    workflow_version: Number(data?.workflow_version ?? 1),
    suspended_goals: Array.isArray(data?.suspended_goals) ? data.suspended_goals : [],
    recent_messages: sanitizeCustomerServiceRecentMessages(
      ((messageRows ?? []) as Array<{ role: CustomerServiceRecentMessage["role"]; message_text: string }>)
        .reverse()
        .map((row) => ({ role: row.role, text: row.message_text })),
    ),
    identity_verified_at: data?.identity_verified_at ?? null,
    identity_verification_method: data?.identity_verification_method ?? null,
    identity_verification_order_id: data?.identity_verification_order_id ?? null,
    identity_verification_attempts: Number(data?.identity_verification_attempts ?? 0),
  };
}

async function saveConversation(
  admin: AdminClient,
  conversation: CustomerServiceConversation,
) {
  const { error } = await admin.from("customer_service_conversations").upsert({
    phone_normalized: conversation.phone_normalized,
    state: conversation.state,
    selected_order_id: conversation.selected_order_id,
    handoff_at: conversation.handoff_at,
    pending_request: conversation.pending_request ?? null,
    active_goal: conversation.active_goal ?? null,
    workflow_slots: conversation.workflow_slots ?? {},
    workflow_version: conversation.workflow_version ?? 1,
    suspended_goals: conversation.suspended_goals ?? [],
    identity_verified_at: conversation.identity_verified_at ?? null,
    identity_verification_method: conversation.identity_verification_method ?? null,
    identity_verification_order_id: conversation.identity_verification_order_id ?? null,
    identity_verification_attempts: conversation.identity_verification_attempts ?? 0,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordCustomerServiceTurn(
  admin: AdminClient,
  input: {
    providerMessageId: string;
    phone: string;
    question: string;
    stateBefore: string;
    startedAt: number;
    turn: Awaited<ReturnType<typeof handleCustomerServiceTurn>>;
    replyAttempted?: boolean;
    replySent?: boolean;
    deliveryStatus?: string;
    sendFailure?: string | null;
  },
) {
  const tools = new Set(input.turn.toolKeys ?? []);
  if (input.turn.wroteInquiry) tools.add("write_inquiry");
  if (input.turn.notified) tools.add("notify_internal");
  if (input.turn.queuedHandoff) tools.add("queue_handoff");
  const { error } = await admin.from("customer_service_turns").upsert(
    {
      provider_message_id: input.providerMessageId,
      phone_normalized: input.phone,
      question: input.question,
      answer: input.turn.reply,
      intent: input.turn.intentKey ?? null,
      route: [...tools].join(",") || null,
      used_model: input.turn.usedModel,
      model: input.turn.model ?? null,
      faq_source_ids: input.turn.faqSourceIds ?? [],
      state_before: input.stateBefore,
      state_after: input.turn.conversation.state,
      wrote_inquiry: input.turn.wroteInquiry,
      notified_internal: input.turn.notified,
      handoff_queued: Boolean(input.turn.queuedHandoff),
      human_handoff: ["awaiting_human", "human_owned"].includes(
        input.turn.conversation.state,
      ),
      reply_attempted: input.replyAttempted ?? Boolean(input.turn.reply),
      reply_sent: input.replySent ?? Boolean(input.turn.reply),
      delivery_status: input.deliveryStatus ?? (input.turn.reply ? "sent" : "not_required"),
      processing_status: ["awaiting_human", "human_owned"].includes(
        input.turn.conversation.state,
      )
        ? "handoff"
        : input.sendFailure
          ? "failed"
          : input.turn.failureReason === "faq_not_found"
          ? "unanswered"
          : input.turn.reply
            ? "replied"
            : "skipped",
      failure_reason: input.sendFailure || input.turn.failureReason || null,
      latency_ms: Math.max(0, Date.now() - input.startedAt),
      environment: deploymentEnvironment(),
      ai_score: input.turn.confidence ?? null,
      dialog_action: input.turn.dialogAction ?? null,
      active_goal: input.turn.conversation.active_goal ?? null,
      context_message_count: input.turn.conversation.recent_messages?.length ?? 0,
    },
    { onConflict: "provider_message_id" },
  );
  if (error) {
    console.error(
      "customer-service turn audit failed",
      error.message.slice(0, 300),
    );
  }
}

async function recordCustomerServiceMessages(
  admin: AdminClient,
  input: {
    providerMessageId: string;
    phone: string;
    question: string;
    answer: string | null;
    intent?: string;
    dialogAction?: string;
  },
) {
  const rows = [{
    source_message_id: input.providerMessageId,
    phone_normalized: input.phone,
    role: "customer",
    message_text: sanitizeCustomerServiceContextText(input.question),
    intent_key: input.intent ?? null,
    dialog_action: input.dialogAction ?? null,
    environment: deploymentEnvironment(),
  }];
  if (input.answer) {
    rows.push({
      source_message_id: `${input.providerMessageId}:reply`,
      phone_normalized: input.phone,
      role: "assistant",
      message_text: sanitizeCustomerServiceContextText(input.answer),
      intent_key: input.intent ?? null,
      dialog_action: input.dialogAction ?? null,
      environment: deploymentEnvironment(),
    });
  }
  const { error } = await admin.from("customer_service_messages").upsert(rows, {
    onConflict: "source_message_id,role",
  });
  if (error) console.error("customer-service context audit failed", error.message.slice(0, 300));
}

type ActiveCustomerServiceConfig = {
  model: string;
  fallback_model: string;
  fallback_enabled: boolean;
  escalation_confidence: number;
  system_prompt: string;
  temperature: number;
  retrieval_limit: number;
};

async function loadActiveCustomerServiceConfig(admin: AdminClient) {
  const { data, error } = await admin
    .from("customer_service_config_versions")
    .select("model,fallback_model,fallback_enabled,escalation_confidence,system_prompt,temperature,retrieval_limit")
    .eq("environment", deploymentEnvironment())
    .eq("status", "active")
    .maybeSingle();
  if (error && error.code !== "42P01") {
    console.error("customer service active config load failed", error.message.slice(0, 300));
  }
  return data as ActiveCustomerServiceConfig | null;
}

function customerServiceAiTiers(active: ActiveCustomerServiceConfig | null): CustomerServiceAiTierConfig {
  const base = customerServiceAiConfig();
  const primaryModel = active?.model || base.model || "grok-4.3";
  const fallbackModel = active?.fallback_model || "grok-4.5";
  return {
    primary: {
      ...base,
      model: primaryModel,
      systemPrompt: active?.system_prompt || "",
      temperature: Number(active?.temperature ?? 0.1),
      reasoningEffort: /^grok-4\.3/i.test(primaryModel) ? "none" : "low",
    },
    fallback: active?.fallback_enabled === false ? null : {
      ...base,
      model: fallbackModel,
      systemPrompt: active?.system_prompt || "",
      temperature: Number(active?.temperature ?? 0.1),
      reasoningEffort: "low",
    },
    escalationConfidence: Number(active?.escalation_confidence ?? 0.72),
  };
}

async function queueOutboundMessage(
  admin: AdminClient,
  input: { inboundId: string; phone: string; body: string; localMessageId: string },
) {
  const { data, error } = await admin
    .from("customer_service_outbound_messages")
    .upsert({
      inbound_provider_message_id: input.inboundId,
      phone_normalized: input.phone,
      body: input.body,
      local_message_id: input.localMessageId,
      environment: deploymentEnvironment(),
      status: "queued",
      next_retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "inbound_provider_message_id", ignoreDuplicates: true })
    .select("id,status")
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string } | null;
}

async function updateOutboundMessage(
  admin: AdminClient,
  id: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin.from("customer_service_outbound_messages")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

function retryAt(attemptCount: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

function deliveryStatusForEvent(eventType: string) {
  const value = eventType.toLowerCase();
  if (value.includes("read")) return "read";
  if (value.includes("deliver")) return "delivered";
  if (value.includes("fail")) return "failed";
  if (value.includes("sent")) return "sent";
  return null;
}

async function recordWatiDeliveryEvent(admin: AdminClient, event: ReturnType<typeof parseWatiInboundEvent>) {
  if (!event) return false;
  const status = deliveryStatusForEvent(event.eventType);
  if (!status || (!event.localMessageId && !event.whatsappMessageId)) return false;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (event.whatsappMessageId) patch.provider_message_id = event.whatsappMessageId;
  if (status === "sent") patch.sent_at = now;
  if (status === "delivered") patch.delivered_at = now;
  if (status === "read") patch.read_at = now;
  if (status === "failed") {
    patch.last_error = `wati_${event.eventType}`.slice(0, 500);
    patch.next_retry_at = now;
  }
  let query = admin.from("customer_service_outbound_messages").update({ ...patch, updated_at: now });
  query = event.localMessageId
    ? query.eq("local_message_id", event.localMessageId)
    : query.eq("provider_message_id", event.whatsappMessageId);
  const { data, error } = await query.select("id,inbound_provider_message_id");
  if (error) throw error;
  const inboundIds = (data ?? []).map((row: { inbound_provider_message_id: string }) => row.inbound_provider_message_id);
  if (inboundIds.length) {
    await admin.from("customer_service_turns").update({
      delivery_status: status,
      reply_sent: status !== "failed",
      processing_status: status === "failed" ? "failed" : "replied",
      failure_reason: status === "failed" ? `wati_${event.eventType}`.slice(0, 500) : null,
    }).in("provider_message_id", inboundIds);
  }
  return Boolean(data?.length);
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
    throw new Error("notification_recipient_allowlist_missing");
  }
  let delivered = false;
  const guestPhone = normalizeNotificationPhone(input.phone);
  const appUrl = env("APP_URL").replace(/\/$/, "");
  const detailUrl =
    appUrl && input.quoteId
      ? `${appUrl}/${input.kind === "order_handoff" ? "orders" : "quotes"}/${input.quoteId}`
      : "";
  const contentInput = {
    formTitle:
      input.kind === "order_handoff"
        ? "WhatsApp 客服人工跟進"
        : "WhatsApp 到會意見",
    referenceCode: input.orderNumber || input.quoteId || input.phone,
    customerName: "WhatsApp 客人",
    phone: input.phone,
    quoteDescription: input.summary,
    detailUrl,
  };

  const { data: recipients, error } = await admin.rpc(
    "enquiry_internal_email_recipients",
  );
  if (error) throw error;
  const addresses = [
    ...new Set(
      ((recipients || []) as Array<{ recipient_address?: string }>)
        .map((item) => (item.recipient_address || "").trim().toLowerCase())
        .filter(
          (address) =>
            address &&
            isNotificationEmailAllowed(allowlist, address) &&
            excludeGuestContacts([address], guestPhone).length > 0,
        ),
    ),
  ];
  if (addresses.length) {
    const mail = buildEnquiryInternalContent(contentInput);
    await sendInternalEmail(addresses, mail.subject, mail.html);
    delivered = true;
  }

  if (watiEmergencySwitchAllows("WATI_ENQUIRY_INTERNAL_ENABLED")) {
    const { data: staff, error: staffError } = await admin
      .from("order_first_notification_recipients")
      .select("phone");
    if (staffError) throw staffError;
    const phones = [
      ...new Set(
        ((staff || []) as Array<{ phone?: string }>)
          .map((item) => normalizeNotificationPhone(item.phone))
          .filter(
            (phone) =>
              Boolean(phone) &&
              phone !== guestPhone &&
              isNotificationPhoneAllowed(allowlist, phone),
          ),
      ),
    ];
    const parameters = buildEnquiryInternalWatiParameters(contentInput);
    const endpoint = requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "");
    const token = requiredEnv("WATI_API_TOKEN");
    const templateName =
      env("WATI_ENQUIRY_INTERNAL_TEMPLATE_NAME") ||
      ENQUIRY_INTERNAL_WATI_TEMPLATE;
    for (const phone of phones) {
      const response = await fetch(
        `${endpoint}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_name: templateName,
            broadcast_name:
              env("WATI_ENQUIRY_INTERNAL_BROADCAST_NAME") || templateName,
            channel_number:
              env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
            parameters,
          }),
        },
      );
      if (!response.ok) throw new Error(`wati_internal_send_failed:${response.status}`);
      delivered = true;
    }
  }
  if (!delivered) throw new Error("internal_notification_recipient_missing");
}

type HandoffNotificationInput = {
  phone: string;
  quoteId: string | null;
  orderNumber: string | null;
  summary: string;
  kind?: "inquiry" | "order_handoff";
};

async function queueInternalHandoff(
  admin: AdminClient,
  input: HandoffNotificationInput,
) {
  const { error } = await admin.rpc("customer_service_handoff_enqueue", {
    p_environment: deploymentEnvironment(),
    p_phone: input.phone,
    p_order_id: input.quoteId,
    p_order_number: input.orderNumber,
    p_summary: input.summary,
    p_kind: input.kind || "order_handoff",
  });
  if (error) throw error;
}

async function processHandoffDigest(request: Request) {
  const configuredSecret =
    env("CUSTOMER_SERVICE_HANDOFF_CRON_SECRET") ||
    env("WATI_ORDER_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret")?.trim() || "";
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("customer_service_handoff_claim", {
    p_limit: 200,
  });
  if (error) throw error;
  const requests = (data ?? []) as Array<{
    id: string;
    phone_normalized: string;
    order_id: string | null;
    order_number: string | null;
    summary: string;
    kind: "inquiry" | "order_handoff";
  }>;
  let notified = 0;
  let failed = 0;
  for (const item of requests) {
    try {
      await notifyInternal(admin, {
        phone: item.phone_normalized,
        quoteId: item.order_id,
        orderNumber: item.order_number,
        summary: item.summary,
        kind: item.kind,
      });
      const { error: updateError } = await admin
        .from("customer_service_handoff_requests")
        .update({
          status: "notified",
          notified_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (updateError) throw updateError;
      notified += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await admin
        .from("customer_service_handoff_requests")
        .update({
          status: "failed",
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    }
  }
  return jsonResponse({ ok: true, claimed: requests.length, notified, failed });
}

async function authorizeOutboundRetry(request: Request) {
  const cronSecret = env("CUSTOMER_SERVICE_OUTBOUND_CRON_SECRET") ||
    env("CUSTOMER_SERVICE_HANDOFF_CRON_SECRET");
  if (cronSecret && request.headers.get("x-cron-secret")?.trim() === cronSecret) return;
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("unauthorized");
  const userClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await userClient.rpc("customer_service_edit_access_check");
  if (error) throw new Error("page_access_required");
}

async function processOutboundRetries(request: Request) {
  await authorizeOutboundRetry(request);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("customer_service_outbound_claim", { p_limit: 50 });
  if (error) throw error;
  const messages = (data ?? []) as Array<{
    id: string;
    phone_normalized: string;
    body: string;
    local_message_id: string;
    attempt_count: number;
    max_attempts: number;
  }>;
  let sent = 0;
  let failed = 0;
  for (const message of messages) {
    try {
      const raw = await deliverWatiSessionMessage({
        creds: watiCredentials(),
        phone: message.phone_normalized,
        text: message.body,
        channelNumber: env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
        localMessageId: message.local_message_id,
      });
      await updateOutboundMessage(admin, message.id, {
        status: "sent",
        provider_message_id: providerMessageIdFromResponse(raw),
        sent_at: new Date().toISOString(),
        last_error: null,
      });
      sent += 1;
    } catch (sendError) {
      failed += 1;
      const detail = sendError instanceof Error ? sendError.message : String(sendError);
      const terminal = message.attempt_count >= message.max_attempts;
      await updateOutboundMessage(admin, message.id, {
        status: terminal ? "dead" : "failed",
        last_error: detail.slice(0, 500),
        next_retry_at: retryAt(message.attempt_count),
      });
    }
  }
  return jsonResponse({ ok: true, claimed: messages.length, sent, failed });
}

function createBotDeps(
  admin: AdminClient,
  {
    dryRun = false,
    replyTemplates = {},
    activeConfig = null,
    tiers = customerServiceAiTiers(activeConfig),
    workflowPolicies = [],
  }: {
    dryRun?: boolean;
    replyTemplates?: ReplyTemplates;
    activeConfig?: ActiveCustomerServiceConfig | null;
    tiers?: CustomerServiceAiTierConfig;
    workflowPolicies?: WorkflowPolicy[];
  } = {},
) {
  return {
    replyTemplates,
    workflowAutoResume: Object.fromEntries(
      workflowPolicies.map((policy) => [policy.goalKey, policy.autoResume]),
    ),
    async lookupOrders(phone: string) {
      const { data, error } = await admin.rpc(
        "customer_service_lookup_orders",
        { p_phone: phone },
      );
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
    async lookupOrderItems(phone: string, orderId: string) {
      const { data, error } = await admin.rpc(
        "customer_service_lookup_order_items",
        { p_phone: phone, p_order_id: orderId },
      );
      if (error) throw error;
      return (data ?? []) as Array<{
        order_line_id: string;
        package_name: string | null;
        item_name: string;
        item_content: string | null;
        quantity: number | null;
        quantity_text: string | null;
        remarks: string[];
      }>;
    },
    async verifyOrderIdentity(phone: string, orderId: string, answer: string) {
      if (dryRun) return answer.trim().toLowerCase() === "test@example.com";
      const { data, error } = await admin.rpc(
        "customer_service_verify_order_identity",
        { p_phone: phone, p_order_id: orderId, p_email: answer },
      );
      if (error) throw error;
      return data === true;
    },
    async writeInquiry(
      phone: string,
      slots: InquirySlots,
      anotherEvent: boolean,
    ) {
      if (dryRun) {
        return {
          quote_id: "00000000-0000-4000-8000-000000000000",
          order_number: "PREVIEW",
          created: false,
        };
      }
      const { data, error } = await admin.rpc(
        "customer_service_write_inquiry",
        {
          p_phone: phone,
          p_event_date: slots.eventDate || null,
          p_headcount: slots.headcount || null,
          p_budget: slots.budget || null,
          p_dietary: slots.dietary || null,
          p_cuisine: slots.cuisine || null,
          p_note: slots.note || null,
          p_another_event: anotherEvent,
        },
      );
      if (error) throw error;
      const row = (
        data as Array<{
          quote_id: string;
          order_number: string | null;
          created: boolean;
        }> | null
      )?.[0];
      if (!row) throw new Error("inquiry_write_failed");
      return row;
    },
    async searchFaqs(query: string) {
      const { data, error } = await admin.rpc(
        "search_published_customer_faqs",
        {
          p_query: query,
          p_limit: activeConfig?.retrieval_limit ?? 12,
        },
      );
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        category: string;
        question: string;
        answer: string;
      }>;
    },
    async answerFaqWithModel(
      query: string,
      candidates: Array<{
        id: string;
        category?: string;
        question: string;
        answer: string;
      }>,
    ) {
      if (!candidates.length) return null;
      const result = await answerCustomerServiceFaqWithTieredAi({
        question: query,
        faqs: candidates.map((candidate) => ({
          ...candidate,
          category: candidate.category || "general",
        })),
        tiers,
      });
      return result ?? null;
    },
    async queueHandoff(input: {
      phone: string;
      quoteId: string | null;
      orderNumber: string | null;
      summary: string;
      kind?: "inquiry" | "order_handoff";
    }) {
      if (dryRun) return;
      try {
        await queueInternalHandoff(admin, input);
      } catch (error) {
        console.error("whatsapp human handoff queue failed", error);
        throw error;
      }
    },
    async cancelHandoff(phone: string) {
      if (dryRun) return true;
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("customer_service_handoff_requests")
        .update({
          status: "resolved",
          resolved_at: now,
          updated_at: now,
          last_error: null,
        })
        .eq("environment", deploymentEnvironment())
        .eq("phone_normalized", phone)
        .in("status", ["pending", "processing", "notified", "failed"])
        .select("id");
      if (error) throw error;
      return Boolean(data?.length);
    },
  };
}

function previewConversation(
  value: unknown,
  phone: string,
): CustomerServiceConversation {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const state = [
    "identifying",
    "verifying_order",
    "picking_order",
    "picking_handoff_order",
    "collecting",
    "awaiting_human",
    "human_owned",
  ].includes(String(input.state || ""))
    ? (String(input.state) as
        | "identifying"
        | "verifying_order"
        | "picking_order"
        | "picking_handoff_order"
        | "collecting"
        | "awaiting_human"
        | "human_owned")
    : "identifying";
  return {
    phone_normalized: phone,
    state,
    selected_order_id:
      typeof input.selected_order_id === "string"
        ? input.selected_order_id
        : null,
    handoff_at: typeof input.handoff_at === "string" ? input.handoff_at : null,
    pending_request:
      typeof input.pending_request === "string" ? input.pending_request : null,
    active_goal:
      input.active_goal === "order_change" || input.active_goal === "catering_inquiry"
        ? input.active_goal
        : null,
    workflow_slots:
      input.workflow_slots && typeof input.workflow_slots === "object"
        ? input.workflow_slots as Record<string, unknown>
        : {},
    workflow_version: Number(input.workflow_version ?? 1),
    suspended_goals: Array.isArray(input.suspended_goals)
      ? input.suspended_goals as CustomerServiceConversation["suspended_goals"]
      : [],
    recent_messages: Array.isArray(input.recent_messages)
      ? sanitizeCustomerServiceRecentMessages(
          input.recent_messages.filter(
            (item): item is CustomerServiceRecentMessage =>
              Boolean(item) && typeof item === "object" &&
              ["customer", "assistant", "human"].includes(String((item as Record<string, unknown>).role)) &&
              typeof (item as Record<string, unknown>).text === "string",
          ),
        )
      : [],
    identity_verified_at:
      typeof input.identity_verified_at === "string" ? input.identity_verified_at : null,
    identity_verification_method:
      typeof input.identity_verification_method === "string"
        ? input.identity_verification_method
        : null,
    identity_verification_order_id:
      typeof input.identity_verification_order_id === "string"
        ? input.identity_verification_order_id
        : null,
    identity_verification_attempts: Number(input.identity_verification_attempts ?? 0),
  };
}

async function handleBackendPreview(
  request: Request,
  payload: Record<string, unknown>,
) {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }
  const userClient = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error: accessError } = await userClient.rpc(
    "customer_service_controls_get",
  );
  if (accessError) return jsonResponse({ error: "page_access_required" }, 403);

  const text =
    typeof payload.text === "string" ? payload.text.trim().slice(0, 1_000) : "";
  if (!text) return jsonResponse({ error: "message_required" }, 400);
  const phone =
    normalizeNotificationPhone(
      typeof payload.phone === "string" ? payload.phone : "",
    ) || "85200000000";
  const admin = createAdminClient();
  const conversation = previewConversation(payload.conversation, phone);
  const [runtime, activeConfig] = await Promise.all([
    loadCustomerServiceRuntime(admin),
    loadActiveCustomerServiceConfig(admin),
  ]);
  const tiers = customerServiceAiTiers(activeConfig);
  const turn = await handleCustomerServiceTurn({
    phone,
    text,
    conversation,
    deps: createBotDeps(admin, {
      dryRun: true,
      replyTemplates: runtime.replyTemplates,
      activeConfig,
      tiers,
      workflowPolicies: runtime.workflowPolicies,
    }),
    classify: createCustomerServiceClassifier({
      intents: runtime.intents,
      conversationState: conversation.state,
      pendingRequest: conversation.pending_request,
      recentMessages: conversation.recent_messages,
      activeGoal: conversation.active_goal,
      workflowPolicies: runtime.workflowPolicies,
      tiers,
    }),
  });
  turn.conversation.recent_messages = sanitizeCustomerServiceRecentMessages([
    ...(conversation.recent_messages ?? []),
    { role: "customer", text },
    ...(turn.reply ? [{ role: "assistant" as const, text: turn.reply }] : []),
  ]);
  return jsonResponse({
    ok: true,
    reply: turn.reply,
    conversation: turn.conversation,
    used_model: turn.usedModel,
    simulated_write: turn.wroteInquiry,
    simulated_notify: Boolean(turn.queuedHandoff || turn.notified),
    human_handoff: ["awaiting_human", "human_owned"].includes(
      turn.conversation.state,
    ),
    intent_key: turn.intentKey,
    confidence: turn.confidence,
    tool_keys: turn.toolKeys ?? [],
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
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
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
      return jsonResponse(
        {
          error: "customer_service_preview_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  }

  if (payload.mode === "handoff_digest") {
    try {
      return await processHandoffDigest(request);
    } catch (error) {
      console.error("customer service handoff digest failed", error);
      return jsonResponse({ error: "handoff_digest_failed" }, 500);
    }
  }

  if (payload.mode === "retry_outbound") {
    try {
      return await processOutboundRetries(request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return jsonResponse(
        { error: "outbound_retry_failed", detail },
        detail === "unauthorized" ? 401 : detail === "page_access_required" ? 403 : 500,
      );
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
  if (
    !isBrandWhatsAppChannel(
      event.channelPhoneNumber,
      env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
    )
  ) {
    return jsonResponse({ error: "channel_mismatch" }, 403);
  }

  try {
    const admin = createAdminClient();
    if (await recordWatiDeliveryEvent(admin, event)) {
      return jsonResponse({ ok: true, delivery_status: deliveryStatusForEvent(event.eventType) });
    }
    const controls = await loadBotControls(admin);
    if (!customerServicePhoneAllowed(event.waId, controls.allowedPhones)) {
      return jsonResponse({ ok: true, ignored: "phone_not_allowed" });
    }
    if (isHumanOperatorMessage(event)) {
      await queueInternalHandoff(admin, {
        phone: event.waId,
        quoteId: null,
        orderNumber: null,
        summary: "WATI 後台同事已回覆並接手此對話。",
        kind: "order_handoff",
      });
      await saveConversation(admin, {
        phone_normalized: event.waId,
        state: "human_owned",
        selected_order_id: null,
        handoff_at: new Date().toISOString(),
        pending_request: null,
        active_goal: null,
        workflow_slots: {},
        workflow_version: 1,
        suspended_goals: [],
        recent_messages: [],
        identity_verified_at: null,
        identity_verification_method: null,
        identity_verification_order_id: null,
        identity_verification_attempts: 0,
      });
      await admin
        .from("customer_service_handoff_requests")
        .update({
          status: "in_progress",
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("environment", deploymentEnvironment())
        .eq("phone_normalized", event.waId)
        .in("status", ["pending", "processing", "notified", "failed"]);
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
      return jsonResponse({
        ok: true,
        bot_enabled: false,
        duplicate: false,
      });
    }
    if (
      !isWithinAutoReplyWindow({
        start: controls.autoReplyStart,
        end: controls.autoReplyEnd,
        timeZone: controls.autoReplyTimezone,
      })
    ) {
      return jsonResponse({
        ok: true,
        bot_enabled: true,
        within_auto_reply_window: false,
        duplicate: false,
      });
    }

    const conversation = await loadConversation(admin, event.waId);
    const startedAt = Date.now();
    const [runtime, activeConfig] = await Promise.all([
      loadCustomerServiceRuntime(admin),
      loadActiveCustomerServiceConfig(admin),
    ]);
    const tiers = customerServiceAiTiers(activeConfig);
    const turn = await handleCustomerServiceTurn({
      phone: event.waId,
      text: event.text,
      conversation,
      deps: createBotDeps(admin, {
        replyTemplates: runtime.replyTemplates,
        activeConfig,
        tiers,
        workflowPolicies: runtime.workflowPolicies,
      }),
      classify: createCustomerServiceClassifier({
        intents: runtime.intents,
        conversationState: conversation.state,
        pendingRequest: conversation.pending_request,
        recentMessages: conversation.recent_messages,
        activeGoal: conversation.active_goal,
        workflowPolicies: runtime.workflowPolicies,
        tiers,
      }),
    });

    let outboundId: string | null = null;
    if (turn.reply) {
      const localMessageId = `fcc-bot-${crypto.randomUUID()}`;
      const outbound = await queueOutboundMessage(admin, {
        inboundId: event.id,
        phone: event.waId,
        body: turn.reply,
        localMessageId,
      });
      outboundId = outbound?.id ?? null;
      try {
        if (outboundId) {
          await updateOutboundMessage(admin, outboundId, {
            status: "sending",
            attempt_count: 1,
            last_attempt_at: new Date().toISOString(),
          });
        }
        const raw = await deliverWatiSessionMessage({
          creds: watiCredentials(),
          phone: event.waId,
          text: turn.reply,
          channelNumber: env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
          localMessageId,
        });
        if (outboundId) {
          await updateOutboundMessage(admin, outboundId, {
            status: "sent",
            provider_message_id: providerMessageIdFromResponse(raw),
            sent_at: new Date().toISOString(),
            last_error: null,
          });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (outboundId) {
          await updateOutboundMessage(admin, outboundId, {
            status: "failed",
            last_error: detail.slice(0, 500),
            next_retry_at: retryAt(1),
          }).catch((auditError) => console.error("outbound failure audit failed", auditError));
        }
        await saveConversation(admin, turn.conversation);
        await recordCustomerServiceTurn(admin, {
          providerMessageId: event.id,
          phone: event.waId,
          question: event.text,
          stateBefore: conversation.state,
          startedAt,
          turn,
          replyAttempted: true,
          replySent: false,
          deliveryStatus: "failed",
          sendFailure: detail.slice(0, 500),
        });
        await recordCustomerServiceMessages(admin, {
          providerMessageId: event.id,
          phone: event.waId,
          question: event.text,
          answer: turn.reply,
          intent: turn.intentKey,
          dialogAction: turn.dialogAction,
        });
        console.error(
          "wati session send failed",
          detail.slice(0, 300),
        );
        throw error;
      }
    }
    await saveConversation(admin, turn.conversation);
    await recordCustomerServiceTurn(admin, {
      providerMessageId: event.id,
      phone: event.waId,
      question: event.text,
      stateBefore: conversation.state,
      startedAt,
      turn,
      replyAttempted: Boolean(turn.reply),
      replySent: Boolean(turn.reply),
      deliveryStatus: turn.reply ? "sent" : "not_required",
    });
    await recordCustomerServiceMessages(admin, {
      providerMessageId: event.id,
      phone: event.waId,
      question: event.text,
      answer: turn.reply,
      intent: turn.intentKey,
      dialogAction: turn.dialogAction,
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
    return jsonResponse(
      {
        error: "customer_service_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
