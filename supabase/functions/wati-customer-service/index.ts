import { createClient } from "npm:@supabase/supabase-js@2";

import { EMAIL_FROM } from "../_shared/email-sender.ts";
import {
  answerCustomerServiceFaqWithTieredAi,
  answerCustomerServiceFallbackWithTieredAi,
  classifyCustomerServiceWithTieredAi,
  customerServiceAiConfig,
  type CustomerServiceAiTierConfig,
  type CustomerServiceIntentConfig,
} from "../_shared/customer-service-ai.ts";
import {
  customerServiceContextMessageRow,
  customerServiceContextSince,
  sanitizeCustomerServiceRecentMessages,
  type CustomerServiceRecentMessage,
} from "../_shared/customer-service-context.ts";
import {
  customerServiceCatalogItemLinks,
  customerServiceCatalogSearchAnchor,
  mappedCustomerServiceCatalogAssets,
  rankCustomerServiceCatalog,
  type CustomerServiceCatalogCandidate,
  type CustomerServiceCatalogShopifyDraft,
  type CustomerServiceCatalogShopifyMapping,
} from "../_shared/customer-service-catalog.ts";
import {
  assessCustomerServiceAdvertisement,
  isCustomerServiceMediaType,
} from "../_shared/customer-service-spam.ts";
import {
  customerServiceBurstDelay,
  mergeCustomerServiceBufferedMessages,
  type CustomerServiceBufferedMessage,
} from "../_shared/customer-service-burst.ts";
import {
  handleCustomerServiceTurn,
  type CustomerServiceConversation,
} from "../_shared/customer-service-bot.ts";
import {
  appendRelatedFaqsToReply,
  suppressRecentSimilarReply,
  withEnvironmentOutboundMarker,
} from "../_shared/customer-service-replies.ts";
import {
  classifyCustomerServiceMessage,
  extractCustomerServiceClockTime,
  explicitCustomerServiceOrderNumber,
  shouldBypassCustomerServiceAi,
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
  type WatiInboundEvent,
  deliverWatiSessionImage,
  deliverWatiSessionMessage,
  verifyWatiWebhook,
} from "../_shared/wati-customer-service-adapter.ts";
import {
  buildEnquiryInternalContent,
  buildEnquiryInternalWatiParameters,
  ENQUIRY_INTERNAL_WATI_TEMPLATE,
} from "../_shared/enquiry-notification-content.ts";
import {
  normalizeNotificationPhone,
} from "../_shared/notification-phone.ts";
import {
  toNotificationEmailRecipients,
  toNotificationWatiPhones,
} from "../_shared/notification-test-overrides.ts";
import {
  loadWatiNotificationControls,
  notificationChannelEnabled,
  watiEmergencySwitchAllows,
} from "../_shared/wati-notification-controls.ts";
import { isWithinCustomerServiceSchedule } from "../_shared/customer-service-schedule.ts";
import {
  evaluateOrderIntakeWithCatalog,
  findUnavailableRequestedChannel,
  type OrderIntakeRule,
} from "../_shared/customer-service-order-intake.ts";
import {
  buildInboundMediaHandoffSummary,
  isTrustedWatiMediaUrl,
  mediaStoragePath,
} from "../_shared/customer-service-media.ts";

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
    | "same_day_urgent"
    | "collect_prompt"
    | "collect_more"
    | "collect_done"
    | "no_faq"
    | "refuse"
    | "acknowledgement"
    | "thanks"
    | "complaint_handoff"
    | "packaging_request",
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
  availability_check: "search_faq",
  order_lookup: "lookup_order",
  order_handoff: "handoff_order",
  inquiry_collect: "collect_inquiry",
  human_handoff: "handoff",
};

const ACTION_TO_REQUIRED_TOOL: Record<string, string> = {
  faq_search: "search_faqs",
  availability_check: "check_order_intake",
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
    // Keep only prompt attacks as a hard Regex route. Business meaning is
    // AI-first; the deterministic classifier is the availability fallback.
    if (shouldBypassCustomerServiceAi(fallback)) return fallback;
    try {
      const result = await classifyCustomerServiceWithTieredAi({
        message: text,
        conversationState,
        pendingRequest: pendingRequest ?? "",
        recentMessages,
        workflowInstructions: activePolicy?.instructions ?? "",
        intents,
        tiers,
      });
      if (!result) return fallback;
      const config = intents.find(
        (item) => item.intentKey === result.intentKey,
      );
      if (!config) return fallback;
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
      const confidenceNeedsClarification =
        result.confidence < config.confidenceThreshold;
      return {
        ...fallback,
        intent,
        usedModel: true,
        confidence: result.confidence,
        configuredIntentKey: config.intentKey,
        toolKey: requiredTool || result.toolKey,
        orderNumber: explicitCustomerServiceOrderNumber(
          text,
          fallback.orderNumber,
          result.orderNumber,
        ),
        requestedDate: result.requestedDate,
        requestedFields: result.requestedFields.length
          ? result.requestedFields
          : fallback.requestedFields,
        missingFields: result.missingFields,
        requiresHuman: result.requiresHuman,
        model: result.model,
        dialogAction: result.dialogAction,
        needsClarification:
          result.needsClarification ||
          confidenceNeedsClarification ||
          policyNeedsClarification,
        clarificationQuestion: result.clarificationQuestion || (
          confidenceNeedsClarification || policyNeedsClarification
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
      weekday_auto_reply_start?: string | null;
      weekday_auto_reply_end?: string | null;
      weekend_auto_reply_start?: string | null;
      weekend_auto_reply_end?: string | null;
      saturday_auto_reply_start?: string | null;
      saturday_auto_reply_end?: string | null;
      sunday_auto_reply_start?: string | null;
      sunday_auto_reply_end?: string | null;
      auto_reply_timezone?: string | null;
    }> | null
  )?.[0];
  const allowedPhones = parseAllowedCustomerServicePhones(
    row?.allowed_phones || [],
  );
  return {
    botEnabled: Boolean(row?.bot_enabled),
    allowedPhones,
    weekdayAutoReplyStart: normalizeScheduleTime(
      row?.weekday_auto_reply_start ?? row?.auto_reply_start,
      "19:00",
    ),
    weekdayAutoReplyEnd: normalizeScheduleTime(
      row?.weekday_auto_reply_end ?? row?.auto_reply_end,
      "09:00",
    ),
    saturdayAutoReplyStart: normalizeScheduleTime(
      row?.saturday_auto_reply_start ??
        row?.weekend_auto_reply_start ??
        row?.auto_reply_start,
      "00:00",
    ),
    saturdayAutoReplyEnd: normalizeScheduleTime(
      row?.saturday_auto_reply_end ??
        row?.weekend_auto_reply_end ??
        row?.auto_reply_end,
      "00:00",
    ),
    sundayAutoReplyStart: normalizeScheduleTime(
      row?.sunday_auto_reply_start ??
        row?.weekend_auto_reply_start ??
        row?.auto_reply_start,
      "00:00",
    ),
    sundayAutoReplyEnd: normalizeScheduleTime(
      row?.sunday_auto_reply_end ??
        row?.weekend_auto_reply_end ??
        row?.auto_reply_end,
      "00:00",
    ),
    autoReplyTimezone: row?.auto_reply_timezone || "Asia/Hong_Kong",
  };
}

async function recordInbound(
  admin: AdminClient,
  event: Pick<WatiInboundEvent, "id" | "waId" | "text" | "type" | "mediaUrl">,
) {
  const { error } = await admin.from("customer_service_inbound_events").insert({
    provider_message_id: event.id,
    phone_normalized: event.waId,
    body: event.text,
    message_type: event.type,
    media_url: event.mediaUrl || null,
  });
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return "inserted";
}

async function spamSenderDisposition(admin: AdminClient, phone: string) {
  const { data, error } = await admin
    .from("customer_service_spam_senders")
    .select("disposition")
    .eq("environment", deploymentEnvironment())
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (error && error.code !== "42P01") throw error;
  return String(data?.disposition || "review") as "review" | "blocked" | "trusted";
}

async function filterInboundAdvertisement(admin: AdminClient, event: WatiInboundEvent) {
  const disposition = await spamSenderDisposition(admin, event.waId);
  if (disposition === "trusted") return false;
  const assessment = disposition === "blocked"
    ? { isAdvertisement: true, score: 1, reasons: ["blocked_sender"] }
    : assessCustomerServiceAdvertisement(event.caption || event.text);
  if (!assessment.isAdvertisement) return false;
  const { error } = await admin.rpc("customer_service_record_spam_event", {
    p_environment: deploymentEnvironment(),
    p_provider_message_id: event.id,
    p_phone: event.waId,
    p_message_type: event.type,
    p_content_excerpt: event.caption || event.text,
    p_score: assessment.score,
    p_reasons: assessment.reasons,
    p_action: "filtered",
  });
  if (error) throw error;
  return true;
}

type InboundBatchClaim = {
  claimed_version: number;
  messages: CustomerServiceBufferedMessage[];
  process_after: string;
};

function deferBackground(promise: Promise<unknown>) {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }
  void promise.catch((error) => console.error("customer service background task failed", error));
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function enqueueInboundBatch(
  admin: AdminClient,
  event: { id: string; waId: string; text: string },
) {
  const { data, error } = await admin.rpc("customer_service_enqueue_inbound_batch", {
    p_environment: deploymentEnvironment(),
    p_phone: event.waId,
    p_provider_message_id: event.id,
    p_text: event.text,
    p_received_at: new Date().toISOString(),
  });
  if (error) throw error;
  const row = (data as Array<{ version: number; process_after: string }> | null)?.[0];
  if (!row) throw new Error("inbound_batch_enqueue_failed");
  return row;
}

async function claimInboundBatch(admin: AdminClient, phone: string) {
  const { data, error } = await admin.rpc("customer_service_claim_inbound_batch", {
    p_environment: deploymentEnvironment(),
    p_phone: phone,
  });
  if (error) throw error;
  return ((data as InboundBatchClaim[] | null)?.[0]) ?? null;
}

async function inboundBatchIsCurrent(
  admin: AdminClient,
  phone: string,
  claimedVersion: number,
) {
  const { data, error } = await admin.rpc("customer_service_inbound_batch_is_current", {
    p_environment: deploymentEnvironment(),
    p_phone: phone,
    p_claimed_version: claimedVersion,
  });
  if (error) throw error;
  return data === true;
}

async function completeInboundBatch(
  admin: AdminClient,
  phone: string,
  claimedVersion: number,
) {
  const { data, error } = await admin.rpc("customer_service_complete_inbound_batch", {
    p_environment: deploymentEnvironment(),
    p_phone: phone,
    p_claimed_version: claimedVersion,
  });
  if (error) throw error;
  return data === true;
}

async function failInboundBatch(
  admin: AdminClient,
  phone: string,
  claimedVersion: number,
  detail: string,
) {
  const { data, error } = await admin.rpc("customer_service_fail_inbound_batch", {
    p_environment: deploymentEnvironment(),
    p_phone: phone,
    p_claimed_version: claimedVersion,
    p_error: detail.slice(0, 500),
  });
  if (error) throw error;
  return data === true;
}

const CUSTOMER_SERVICE_CONTEXT_PAGE_SIZE = 1_000;

async function loadCustomerServiceContextMessages(
  admin: AdminClient,
  phone: string,
) {
  const rows: Array<{
    role: CustomerServiceRecentMessage["role"];
    message_text: string;
    created_at: string;
  }> = [];
  const since = customerServiceContextSince();
  for (let from = 0;; from += CUSTOMER_SERVICE_CONTEXT_PAGE_SIZE) {
    const { data, error } = await admin
      .from("customer_service_messages")
      .select("role,message_text,created_at")
      .eq("phone_normalized", phone)
      .eq("environment", deploymentEnvironment())
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + CUSTOMER_SERVICE_CONTEXT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < CUSTOMER_SERVICE_CONTEXT_PAGE_SIZE) break;
  }
  return sanitizeCustomerServiceRecentMessages(
    rows.map((row) => ({
      role: row.role,
      text: row.message_text,
      occurredAt: row.created_at,
    })),
  );
}

async function loadConversation(admin: AdminClient, phone: string) {
  const [{ data, error }, recentMessages] = await Promise.all([
    admin
      .from("customer_service_conversations")
      .select(
        "phone_normalized,state,selected_order_id,handoff_at,pending_request,active_goal,handoff_kind,handoff_urgent,handoff_quote_id,workflow_slots,workflow_version,suspended_goals,identity_verified_at,identity_verification_method,identity_verification_order_id,identity_verification_attempts",
      )
      .eq("phone_normalized", phone)
      .maybeSingle(),
    loadCustomerServiceContextMessages(admin, phone),
  ]);
  if (error) throw error;
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
    handoff_kind: data?.handoff_kind ?? null,
    handoff_urgent: Boolean(data?.handoff_urgent),
    handoff_quote_id: data?.handoff_quote_id ?? null,
    workflow_slots: data?.workflow_slots ?? {},
    workflow_version: Number(data?.workflow_version ?? 1),
    suspended_goals: Array.isArray(data?.suspended_goals) ? data.suspended_goals : [],
    recent_messages: recentMessages,
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
    handoff_kind: conversation.handoff_kind ?? null,
    handoff_urgent: Boolean(conversation.handoff_urgent),
    handoff_quote_id: conversation.handoff_quote_id ?? null,
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

function automaticTurnEvaluation(input: {
  intent: string | null;
  routes: Set<string>;
  faqSourceIds: string[];
  reply: string | null;
  stateAfter: string;
  sendFailure?: string | null;
}) {
  const humanHandoff = ["awaiting_human", "human_owned"].includes(input.stateAfter);
  const expected = input.intent === "browse_menu" || input.intent === "search_faq"
    ? "search_faqs"
    : input.intent === "lookup_order"
      ? "lookup_orders"
      : input.intent === "handoff_order"
        ? humanHandoff ? "queue_handoff" : "lookup_orders"
        : input.intent === "handoff"
          ? "queue_handoff"
          : input.intent === "collect_inquiry" && input.routes.has("write_inquiry")
            ? "write_inquiry"
            : undefined;
  const toolCorrect = !expected || input.routes.has(expected) ||
    (expected === "search_faqs" && input.routes.has("search_catalog")) ||
    (expected === "queue_handoff" && input.routes.has("notify_internal"));
  const workflowProgress = [
    "collecting",
    "verifying_order",
    "picking_order",
    "picking_handoff_order",
  ].includes(input.stateAfter);
  const grounded = Boolean(
    input.faqSourceIds.length ||
    [...input.routes].some((route) => [
      "lookup_orders",
      "search_catalog",
      "write_inquiry",
      "queue_handoff",
      "notify_internal",
    ].includes(route)) ||
    workflowProgress ||
    ["out_of_scope", "prompt_injection", "greeting"].includes(input.intent || ""),
  );
  const answerComplete = Boolean(input.reply) || humanHandoff;
  const handoffCorrect = !humanHandoff || (
    input.routes.has("queue_handoff") &&
    !["browse_menu", "search_faq", "lookup_order"].includes(input.intent || "")
  );
  const deliveryOk = !input.sendFailure;
  const dimensions = {
    grounded,
    tool_correct: toolCorrect,
    answer_complete: answerComplete,
    handoff_correct: handoffCorrect,
    delivery_ok: deliveryOk,
  };
  const score = Object.values(dimensions).filter(Boolean).length /
    Object.keys(dimensions).length;
  const failures = Object.entries(dimensions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    outcome: !deliveryOk || !handoffCorrect
      ? "failure"
      : score >= 0.8
        ? "success"
        : "needs_review",
    score,
    dimensions,
    reason: failures.length ? `自動檢查未通過：${failures.join(", ")}` : "自動規則檢查全部通過",
  };
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
  const intent = input.turn.intentKey ?? null;
  const automaticEvaluation = automaticTurnEvaluation({
    intent,
    routes: tools,
    faqSourceIds: input.turn.faqSourceIds ?? [],
    reply: input.turn.reply,
    stateAfter: input.turn.conversation.state,
    sendFailure: input.sendFailure,
  });
  const { error } = await admin.from("customer_service_turns").upsert(
    {
      provider_message_id: input.providerMessageId,
      phone_normalized: input.phone,
      question: input.question,
      answer: input.turn.reply,
      intent,
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
      classification_confidence: input.turn.confidence ?? null,
      auto_outcome: automaticEvaluation.outcome,
      auto_score: automaticEvaluation.score,
      auto_dimensions: automaticEvaluation.dimensions,
      auto_reason: automaticEvaluation.reason,
      auto_evaluated_at: new Date().toISOString(),
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
  const rows = [customerServiceContextMessageRow({
    sourceMessageId: input.providerMessageId,
    phone: input.phone,
    role: "customer",
    text: input.question,
    intentKey: input.intent,
    dialogAction: input.dialogAction,
    environment: deploymentEnvironment(),
  })].filter((row) => row !== null);
  if (input.answer) {
    const answerRow = customerServiceContextMessageRow({
      sourceMessageId: `${input.providerMessageId}:reply`,
      phone: input.phone,
      role: "assistant",
      text: input.answer,
      intentKey: input.intent,
      dialogAction: input.dialogAction,
      environment: deploymentEnvironment(),
    });
    if (answerRow) rows.push(answerRow);
  }
  if (!rows.length) return;
  const { error } = await admin.from("customer_service_messages").upsert(rows, {
    onConflict: "source_message_id,role",
  });
  if (error) console.error("customer-service context audit failed", error.message.slice(0, 300));
}

async function recordHumanOperatorContextMessage(
  admin: AdminClient,
  event: WatiInboundEvent,
) {
  const row = customerServiceContextMessageRow({
    sourceMessageId: event.id,
    phone: event.waId,
    role: "human",
    text: event.text,
    environment: deploymentEnvironment(),
  });
  if (!row) return;
  const { error } = await admin.from("customer_service_messages").upsert(row, {
    onConflict: "source_message_id,role",
  });
  if (error) {
    console.error(
      "customer-service human context audit failed",
      error.message.slice(0, 300),
    );
  }
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

/** Develop-branch lab recipient for internal WATI staff alerts. */
const DEVELOP_INTERNAL_WATI_PHONE = "8613828747224";

function resolveInternalWatiPhones(
  candidates: string[],
  guestPhone: string,
  environment: string,
) {
  const phones = [
    ...new Set(
      candidates
        .map((phone) => normalizeNotificationPhone(phone))
        .filter((phone) => Boolean(phone) && phone !== guestPhone),
    ),
  ];
  if (environment !== "develop") return phones;
  // Develop must not blast production staff — only the pilot phone.
  return [DEVELOP_INTERNAL_WATI_PHONE];
}

async function notifyInternal(
  admin: AdminClient,
  input: {
    phone: string;
    quoteId: string | null;
    orderNumber: string | null;
    summary: string;
    kind?: "inquiry" | "order_handoff";
    urgent?: boolean;
  },
) {
  let delivered = false;
  const controls = await loadWatiNotificationControls(admin);
  const emailEnabled = notificationChannelEnabled(controls, "enquiry_internal", "email");
  const watiEnabled = notificationChannelEnabled(controls, "enquiry_internal", "wati")
    && (deploymentEnvironment() === "develop"
      || watiEmergencySwitchAllows("WATI_ENQUIRY_INTERNAL_ENABLED"));
  if (!emailEnabled && !watiEnabled) return;
  const guestPhone = normalizeNotificationPhone(input.phone);
  const environment = deploymentEnvironment();
  const appUrl = env("APP_URL").replace(/\/$/, "");
  const detailUrl =
    appUrl && input.quoteId
      ? `${appUrl}/${input.kind === "order_handoff" ? "orders" : "quotes"}/${input.quoteId}`
      : "";
  const contentInput = {
    formTitle: input.urgent
      ? "【緊急】WhatsApp 即日訂餐"
      : input.kind === "order_handoff"
      ? "WhatsApp 客服人工跟進"
      : "WhatsApp 到會意見",
    referenceCode: input.orderNumber || input.quoteId || input.phone,
    customerName: "WhatsApp 客人",
    phone: input.phone,
    quoteDescription: input.summary,
    detailUrl,
  };

  if (emailEnabled) {
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
              excludeGuestContacts([address], guestPhone).length > 0,
          ),
      ),
    ];
    const targetAddresses = toNotificationEmailRecipients(
      addresses,
      controls.recipientPolicy,
    );
    if (targetAddresses.length) {
      const mail = buildEnquiryInternalContent(contentInput);
      await sendInternalEmail(targetAddresses, mail.subject, mail.html);
      delivered = true;
    }
  }

  if (
    watiEnabled
  ) {
    const { data: staff, error: staffError } = await admin
      .from("order_first_notification_recipients")
      .select("phone");
    if (staffError) throw staffError;
    const phones = toNotificationWatiPhones(resolveInternalWatiPhones(
      ((staff || []) as Array<{ phone?: string }>).map((item) => item.phone || ""),
      guestPhone,
      environment,
    ), controls.recipientPolicy);
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
      if (response.ok) {
        delivered = true;
        continue;
      }
      // Develop lab often lacks the production enquiry template / token scope.
      // Fall back to a session text so staff still get the urgent ping.
      if (environment === "develop") {
        const title = contentInput.formTitle;
        const detail = [
          title,
          `客人：${input.phone}`,
          input.orderNumber ? `單號：${input.orderNumber}` : null,
          input.summary,
        ].filter(Boolean).join("\n");
        await deliverWatiSessionMessage({
          creds: watiCredentials(),
          phone,
          text: detail.slice(0, 1500),
          channelNumber: env("WATI_CHANNEL_NUMBER") || BRAND_WHATSAPP_CHANNEL,
          // Must use fcc-bot- prefix so WATI owner echoes are not treated as human takeover.
          localMessageId: `fcc-bot-staff-${crypto.randomUUID()}`,
        });
        delivered = true;
        continue;
      }
      throw new Error(`wati_internal_send_failed:${response.status}`);
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
  urgent?: boolean;
};

async function queueInternalHandoff(
  admin: AdminClient,
  input: HandoffNotificationInput,
) {
  const { data: handoffId, error } = await admin.rpc(
    "customer_service_handoff_enqueue",
    {
      p_environment: deploymentEnvironment(),
      p_phone: input.phone,
      p_order_id: input.quoteId,
      p_order_number: input.orderNumber,
      p_summary: input.summary,
      p_kind: input.kind || "order_handoff",
      p_notify_immediately: Boolean(input.urgent),
    },
  );
  if (error) throw error;
  if (!input.urgent || !handoffId) return;

  const { data: existing, error: existingError } = await admin
    .from("customer_service_handoff_requests")
    .select("id,status,notified_at")
    .eq("id", handoffId)
    .maybeSingle();
  if (existingError) throw existingError;
  // Same-day urgent must still ping staff even if an older handoff is in_progress.
  // Only suppress duplicate blasts within a short window after a successful notify.
  const notifiedAtMs = existing?.notified_at
    ? Date.parse(String(existing.notified_at))
    : NaN;
  const recentlyNotified =
    Number.isFinite(notifiedAtMs) && Date.now() - notifiedAtMs < 5 * 60 * 1000;
  if (recentlyNotified) return;

  try {
    await notifyInternal(admin, {
      phone: input.phone,
      quoteId: input.quoteId,
      orderNumber: input.orderNumber,
      summary: input.summary,
      kind: input.kind || "inquiry",
      urgent: true,
    });
  } catch (error) {
    // Never block the guest reply on staff-notify failure; leave the handoff
    // pending so the morning digest / retry can pick it up.
    const detail = error instanceof Error ? error.message : String(error);
    console.error("urgent staff notify failed", detail);
    const now = new Date().toISOString();
    await admin
      .from("customer_service_handoff_requests")
      .update({
        status: "pending",
        last_error: detail.slice(0, 500),
        updated_at: now,
      })
      .eq("id", handoffId)
      .catch((auditError: unknown) =>
        console.error("urgent handoff failure audit failed", auditError)
      );
    return;
  }
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("customer_service_handoff_requests")
    .update({
      status: "notified",
      notified_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", handoffId)
    .in("status", ["pending", "failed", "in_progress", "processing", "notified"]);
  if (updateError) throw updateError;
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
    env("CUSTOMER_SERVICE_HANDOFF_CRON_SECRET") ||
    env("WATI_ORDER_CRON_SECRET");
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
    mutationGuard,
    replyTemplates = {},
    activeConfig = null,
    tiers = customerServiceAiTiers(activeConfig),
    workflowPolicies = [],
  }: {
    dryRun?: boolean;
    mutationGuard?: () => Promise<void>;
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
        item_kind?: "package" | "package_item" | "utensil" | "item";
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
      await mutationGuard?.();
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
    async checkDeliveryDateAvailability(date: string) {
      const start = new Date(`${date}T00:00:00+08:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
      const { count, error } = await admin
        .from("order_block_dates")
        .select("id", { count: "exact", head: true })
        .gte("blocked_at", start.toISOString())
        .lt("blocked_at", end.toISOString());
      if (error) throw error;
      return count && count > 0 ? "blocked" as const : "not_blocked" as const;
    },
    async checkOrderIntakeAvailability(date: string, text: string, context?: { deliveryTime?: string | null }) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: "unknown" as const };
      const { data, error } = await admin.from("order_intake_rules")
        .select("id,name,starts_on,ends_on,start_time,end_time,handling,customer_message,order_intake_rule_channels(channel_id,brand_terms,product_terms,channels(name))")
        .eq("is_active", true).is("archived_at", null)
        .lte("starts_on", date).gte("ends_on", date);
      if (error) throw error;
      const requestedTime = context?.deliveryTime ?? (extractCustomerServiceClockTime(text) || null);
      const rules: OrderIntakeRule[] = ((data ?? []) as Array<{
        id: string; name: string; starts_on: string; ends_on: string;
        start_time: string | null; end_time: string | null;
        handling: OrderIntakeRule["handling"]; customer_message: string | null;
        order_intake_rule_channels?: Array<{
          channel_id?: string | null;
          brand_terms?: string[] | null; product_terms?: string[] | null;
          channels?: { name?: string | null } | Array<{ name?: string | null }> | null;
        }>;
      }>).map((row) => ({
        id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on,
        startTime: row.start_time?.slice(0, 5) ?? null, endTime: row.end_time?.slice(0, 5) ?? null,
        handling: row.handling, customerMessage: row.customer_message,
        channels: (row.order_intake_rule_channels ?? []).map((item: {
          channel_id?: string | null;
          brand_terms?: string[] | null; product_terms?: string[] | null;
          channels?: { name?: string | null } | Array<{ name?: string | null }> | null;
        }) => ({
          channelId: item.channel_id || undefined,
          name: (Array.isArray(item.channels) ? item.channels[0]?.name : item.channels?.name) || "",
          aliases: item.brand_terms ?? [], terms: item.product_terms ?? [],
        })),
      }));
      const evaluation = await evaluateOrderIntakeWithCatalog(
        { date, time: requestedTime, text }, rules,
        async (channelId, terms) => {
          const { data: catalogRows, error: catalogError } = await admin.rpc(
            "search_order_intake_catalog",
            { p_channel_ids: [channelId], p_terms: terms, p_limit: 8 },
          );
          if (catalogError) throw catalogError;
          return ((catalogRows ?? []) as Array<{ name?: string | null; product_url?: string | null }>)
            .flatMap((row) => {
              const name = row.name?.trim();
              const url = row.product_url?.trim();
              return name && url ? [{ name, url }] : [];
            });
        },
      );
      const allowRules = rules.filter((rule) => rule.handling === "allow_only" && evaluation.matchedRuleIds.includes(rule.id));
      if (!allowRules.length) return evaluation;
      const channelIds = allowRules[0].channels.map((channel) => channel.channelId)
        .filter((id): id is string => Boolean(id) && allowRules.every((rule) => rule.channels.some((channel) => channel.channelId === id)));
      const { data: knownChannels, error: channelError } = await admin.from("channels")
        .select("id,name").eq("is_active", true).is("archived_at", null);
      if (channelError) throw channelError;
      const unavailable = findUnavailableRequestedChannel(text, knownChannels ?? [], channelIds);
      return unavailable
        ? {
          ...evaluation,
          status: "manual_review" as const,
          message: allowRules.map((rule) => rule.customerMessage?.trim()).find(Boolean) || evaluation.message,
          unavailableChannelName: unavailable.name,
        }
        : evaluation;
    },
    async searchCatalog(query: string) {
      const searchAnchor = customerServiceCatalogSearchAnchor(query);
      if (!searchAnchor) return [];
      const { data: packageRows, error: packageError } = await admin
        .from("packages")
        .select("id,sku,name,chinese_name,price,channels(name)")
        .eq("is_active", true)
        .is("archived_at", null)
        .or(
          `name.ilike.%${searchAnchor}%,chinese_name.ilike.%${searchAnchor}%`,
        )
        .limit(500);
      if (packageError) throw packageError;

      const candidates: CustomerServiceCatalogCandidate[] =
        ((packageRows ?? []) as Array<{
          id: string;
          sku?: string | null;
          name?: string | null;
          chinese_name?: string | null;
          price?: number | string | null;
          channels?: { name?: string | null } | Array<unknown> | null;
        }>).map((row) => {
          const channel = row.channels && !Array.isArray(row.channels)
            ? row.channels as { name?: string | null }
            : null;
          return {
            id: String(row.id),
            sku: typeof row.sku === "string" ? row.sku : null,
            name: String(row.chinese_name || row.name || "").trim(),
            price: row.price === null || row.price === undefined
              ? null
              : Number(row.price),
            channelName: channel?.name ?? null,
          };
        });
      const matches = rankCustomerServiceCatalog(query, candidates).slice(0, 3);
      if (!matches.length) return [];

      const packageIds = matches.map((match) => match.id);
      const [membersResult, mappingsResult] = await Promise.all([
        admin
          .from("package_products")
          .select("package_id,quantity,products(name,chinese_name,sku)")
          .in("package_id", packageIds)
          .order("bubble_created_at", { ascending: true, nullsFirst: false })
          .limit(200),
        packageIds.length
          ? admin
            .from("shopify_catalog_mappings")
            .select(
              "store_id,shopify_product_id,internal_package_id,shopify_stores(shop_domain,channels(name))",
            )
            .eq("resource_type", "package")
            .eq("is_active", true)
            .in("internal_package_id", packageIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (membersResult.error) throw membersResult.error;
      if (mappingsResult.error) throw mappingsResult.error;

      const membersByPackage = new Map<
        string,
        Array<{ name: string; sku: string | null }>
      >();
      for (const row of membersResult.data ?? []) {
        const product = row.products && !Array.isArray(row.products)
          ? row.products as {
            name?: string | null;
            chinese_name?: string | null;
            sku?: string | null;
          }
          : null;
        const name = String(product?.chinese_name || product?.name || "").trim();
        if (!name) continue;
        const packageId = String(row.package_id);
        const current = membersByPackage.get(packageId) ?? [];
        if (!current.some((item) => item.name === name)) {
          current.push({
            name,
            sku: typeof product?.sku === "string" ? product.sku : null,
          });
        }
        membersByPackage.set(packageId, current);
      }

      const mappings: CustomerServiceCatalogShopifyMapping[] =
        ((mappingsResult.data ?? []) as Array<{
          store_id?: string | null;
          shopify_product_id?: number | string | null;
          internal_package_id?: string | null;
          shopify_stores?: {
            shop_domain?: string | null;
            channels?: { name?: string | null } | null;
          } | null;
        }>).flatMap((row) => {
          const storeId = row.store_id?.trim() ?? "";
          const internalPackageId = row.internal_package_id?.trim() ?? "";
          const shopifyProductId = row.shopify_product_id === null ||
              row.shopify_product_id === undefined
            ? ""
            : String(row.shopify_product_id);
          const shopDomain = row.shopify_stores?.shop_domain?.trim() ?? "";
          if (!storeId || !internalPackageId || !shopifyProductId || !shopDomain) {
            return [];
          }
          return [{
            storeId,
            internalPackageId,
            shopifyProductId,
            shopDomain,
            channelName: row.shopify_stores?.channels?.name ?? null,
          }];
        });
      const shopifyProductIds = [...new Set(
        mappings.map((mapping) => mapping.shopifyProductId),
      )];
      const { data: draftRows, error: draftsError } = shopifyProductIds.length
        ? await admin
          .from("shopify_catalog_drafts")
          .select("store_id,shopify_product_id,handle,featured_image_url")
          .in("shopify_product_id", shopifyProductIds)
          .eq("shopify_status", "active")
        : { data: [], error: null };
      if (draftsError) throw draftsError;

      const drafts: CustomerServiceCatalogShopifyDraft[] =
        ((draftRows ?? []) as Array<{
          store_id?: string | null;
          shopify_product_id?: number | string | null;
          handle?: string | null;
          featured_image_url?: string | null;
        }>).flatMap((row) => {
          const storeId = row.store_id?.trim() ?? "";
          const shopifyProductId = row.shopify_product_id === null ||
              row.shopify_product_id === undefined
            ? ""
            : String(row.shopify_product_id);
          const handle = row.handle?.trim() ?? "";
          if (!storeId || !shopifyProductId || !handle) return [];
          return [{
            storeId,
            shopifyProductId,
            handle,
            imageUrl: row.featured_image_url ?? null,
          }];
        });

      return matches.map((match) => {
        const assets = mappedCustomerServiceCatalogAssets(
          match.id,
          match.channelName,
          mappings,
          drafts,
          match.sku,
        );
        const members = membersByPackage.get(match.id) ?? [];
        return {
          ...match,
          ...assets,
          items: members.map((item) => item.name),
          itemLinks: customerServiceCatalogItemLinks(
            members,
            match.channelName,
          ),
        };
      });
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
    async answerWithoutFaqWithModel(input: {
      query: string;
      intentKey: string;
      confidence?: number;
      missingFields: string[];
      recentMessages: CustomerServiceRecentMessage[];
    }) {
      return await answerCustomerServiceFallbackWithTieredAi({
        question: input.query,
        intentKey: input.intentKey,
        confidence: input.confidence,
        missingFields: input.missingFields,
        recentMessages: input.recentMessages,
        tiers,
      });
    },
    async queueHandoff(input: {
      phone: string;
      quoteId: string | null;
      orderNumber: string | null;
      summary: string;
      kind?: "inquiry" | "order_handoff";
      urgent?: boolean;
    }) {
      if (dryRun) return;
      await mutationGuard?.();
      try {
        await queueInternalHandoff(admin, input);
      } catch (error) {
        console.error("whatsapp human handoff queue failed", error);
        throw error;
      }
    },
    async cancelHandoff(phone: string) {
      if (dryRun) return true;
      await mutationGuard?.();
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
    handoff_kind: [
      "same_day_catering",
      "future_catering",
      "order_change",
      "general",
    ].includes(String(input.handoff_kind || ""))
      ? input.handoff_kind as CustomerServiceConversation["handoff_kind"]
      : null,
    handoff_urgent: input.handoff_urgent === true,
    handoff_quote_id:
      typeof input.handoff_quote_id === "string" ? input.handoff_quote_id : null,
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
    related_faqs: turn.relatedFaqs ?? [],
  });
}

async function prepareCustomerServiceTurn(
  admin: AdminClient,
  input: {
    phone: string;
    text: string;
    mutationGuard?: () => Promise<void>;
  },
) {
  const conversation = await loadConversation(admin, input.phone);
  const startedAt = Date.now();
  const [runtime, activeConfig] = await Promise.all([
    loadCustomerServiceRuntime(admin),
    loadActiveCustomerServiceConfig(admin),
  ]);
  const tiers = customerServiceAiTiers(activeConfig);
  const turn = await handleCustomerServiceTurn({
    phone: input.phone,
    text: input.text,
    conversation,
    deps: createBotDeps(admin, {
      replyTemplates: runtime.replyTemplates,
      activeConfig,
      tiers,
      workflowPolicies: runtime.workflowPolicies,
      mutationGuard: input.mutationGuard,
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
  return { conversation, startedAt, turn };
}

async function persistCustomerServiceTurn(
  admin: AdminClient,
  input: {
    providerMessageId: string;
    phone: string;
    text: string;
    prepared: Awaited<ReturnType<typeof prepareCustomerServiceTurn>>;
  },
) {
  const { conversation, startedAt, turn } = input.prepared;
  let outboundId: string | null = null;
  const replyWithRelated = turn.reply
    ? appendRelatedFaqsToReply(turn.reply, turn.relatedFaqs ?? [])
    : null;
  const duplicateReplySuppressed = replyWithRelated
    ? suppressRecentSimilarReply(replyWithRelated, conversation.recent_messages)
    : false;
  const effectiveTurn = duplicateReplySuppressed
    ? { ...turn, reply: null, failureReason: "duplicate_reply_suppressed" }
    : turn;
  const outboundReply = replyWithRelated && !duplicateReplySuppressed
    ? withEnvironmentOutboundMarker(replyWithRelated, deploymentEnvironment())
    : null;
  if (outboundReply) {
    const localMessageId = `fcc-bot-${crypto.randomUUID()}`;
    const outbound = await queueOutboundMessage(admin, {
      inboundId: input.providerMessageId,
      phone: input.phone,
      body: outboundReply,
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
        phone: input.phone,
        text: outboundReply,
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
      if (turn.imageUrl) {
        try {
          await deliverWatiSessionImage({
            creds: watiCredentials(),
            phone: input.phone,
            imageUrl: turn.imageUrl,
            caption: "套餐參考圖片",
            channelNumber: env("WATI_CHANNEL_NUMBER") ||
              BRAND_WHATSAPP_CHANNEL,
          });
        } catch (imageError) {
          console.error(
            "customer-service image send failed",
            imageError instanceof Error
              ? imageError.message.slice(0, 300)
              : String(imageError),
          );
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (outboundId) {
        await updateOutboundMessage(admin, outboundId, {
          status: "failed",
          last_error: detail.slice(0, 500),
          next_retry_at: retryAt(1),
        }).catch((auditError: unknown) => console.error("outbound failure audit failed", auditError));
      }
      await saveConversation(admin, effectiveTurn.conversation);
      await recordCustomerServiceTurn(admin, {
        providerMessageId: input.providerMessageId,
        phone: input.phone,
        question: input.text,
        stateBefore: conversation.state,
        startedAt,
        turn: { ...effectiveTurn, reply: outboundReply },
        replyAttempted: true,
        replySent: false,
        deliveryStatus: "failed",
        sendFailure: detail.slice(0, 500),
      });
      await recordCustomerServiceMessages(admin, {
        providerMessageId: input.providerMessageId,
        phone: input.phone,
        question: input.text,
        answer: outboundReply,
        intent: turn.intentKey,
        dialogAction: turn.dialogAction,
      });
      throw error;
    }
  }
  await saveConversation(admin, effectiveTurn.conversation);
  await recordCustomerServiceTurn(admin, {
    providerMessageId: input.providerMessageId,
    phone: input.phone,
    question: input.text,
    stateBefore: conversation.state,
    startedAt,
    turn: outboundReply ? { ...effectiveTurn, reply: outboundReply } : effectiveTurn,
    replyAttempted: Boolean(outboundReply),
    replySent: Boolean(outboundReply),
    deliveryStatus: outboundReply ? "sent" : "not_required",
  });
  await recordCustomerServiceMessages(admin, {
    providerMessageId: input.providerMessageId,
    phone: input.phone,
    question: input.text,
    answer: outboundReply,
    intent: turn.intentKey,
    dialogAction: turn.dialogAction,
  });
}

function mediaTypeLabel(type: string) {
  if (type === "image") return "圖片";
  if (type === "voice") return "語音訊息";
  return "音訊";
}

const CUSTOMER_SERVICE_MEDIA_BUCKET = "customer-service-media";
const CUSTOMER_SERVICE_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

async function mirrorInboundMedia(
  admin: AdminClient,
  event: Pick<WatiInboundEvent, "id" | "waId" | "mediaUrl">,
) {
  if (!isTrustedWatiMediaUrl(event.mediaUrl)) return null;
  const token = env("WATI_API_TOKEN") || env("WATI_ACCESS_TOKEN");
  if (!token) return null;
  try {
    const response = await fetch(event.mediaUrl!, {
      headers: { Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}` },
    });
    if (!response.ok) throw new Error(`wati_media_download_failed:${response.status}`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > CUSTOMER_SERVICE_MEDIA_MAX_BYTES) {
      throw new Error("wati_media_too_large");
    }
    const contentType = (response.headers.get("content-type") || "application/octet-stream")
      .split(";", 1)[0].trim().toLowerCase();
    if (!contentType.startsWith("image/") && !contentType.startsWith("audio/")) {
      throw new Error(`wati_media_type_not_allowed:${contentType}`);
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > CUSTOMER_SERVICE_MEDIA_MAX_BYTES) {
      throw new Error("wati_media_too_large");
    }
    const path = mediaStoragePath({
      environment: deploymentEnvironment(),
      phone: event.waId,
      messageId: event.id,
      mediaUrl: event.mediaUrl!,
      contentType,
    });
    const { error: uploadError } = await admin.storage
      .from(CUSTOMER_SERVICE_MEDIA_BUCKET)
      .upload(path, body, { contentType, upsert: true });
    if (uploadError) throw uploadError;
    const { data, error: signedUrlError } = await admin.storage
      .from(CUSTOMER_SERVICE_MEDIA_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    if (signedUrlError) throw signedUrlError;
    return data.signedUrl;
  } catch (error) {
    console.error("customer_service_media_mirror_failed", {
      providerMessageId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function handleInboundMedia(admin: AdminClient, event: WatiInboundEvent) {
  const conversation = await loadConversation(admin, event.waId);
  if (conversation.state === "human_owned") return;
  const label = mediaTypeLabel(event.type);
  const attachmentUrl = await mirrorInboundMedia(admin, event);
  await queueInternalHandoff(admin, {
    phone: event.waId,
    quoteId: conversation.selected_order_id,
    orderNumber: null,
    summary: buildInboundMediaHandoffSummary({
      label,
      caption: event.caption,
      originalUrl: event.mediaUrl,
      attachmentUrl,
    }),
    kind: "order_handoff",
  });
  const nextConversation: CustomerServiceConversation = {
    ...conversation,
    state: "awaiting_human",
    handoff_at: new Date().toISOString(),
    pending_request: `查看客人${label}`,
    active_goal: null,
    handoff_kind: "general",
    handoff_urgent: false,
    handoff_quote_id: null,
  };
  const reply = `已收到你嘅${label}，呢類訊息會交由客服同事查看，稍後回覆你。`;
  await persistCustomerServiceTurn(admin, {
    providerMessageId: event.id,
    phone: event.waId,
    text: `[${label}]${event.caption ? ` ${event.caption}` : ""}`,
    prepared: {
      conversation,
      startedAt: Date.now(),
      turn: {
        reply,
        conversation: nextConversation,
        wroteInquiry: false,
        notified: false,
        queuedHandoff: true,
        usedModel: false,
        intentKey: "media_handoff",
        toolKeys: ["queue_handoff"],
        failureReason: null,
        dialogAction: "new_request",
      },
    },
  });
}

async function processInboundBatch(
  admin: AdminClient,
  phone: string,
  initialProcessAfter: string,
) {
  let processAfter = initialProcessAfter;
  for (let round = 0; round < 6; round += 1) {
    const delay = customerServiceBurstDelay(processAfter);
    if (delay) await wait(delay);
    const claim = await claimInboundBatch(admin, phone);
    if (!claim) return;

    const messages = Array.isArray(claim.messages) ? claim.messages : [];
    const ordered = [...messages].sort((left, right) =>
      Date.parse(left.receivedAt) - Date.parse(right.receivedAt)
    );
    const latestMessage = ordered.at(-1);
    const text = mergeCustomerServiceBufferedMessages(ordered);
    if (!latestMessage || !text) {
      await completeInboundBatch(admin, phone, Number(claim.claimed_version));
      return;
    }

    const claimedVersion = Number(claim.claimed_version);
    const mutationGuard = async () => {
      if (!(await inboundBatchIsCurrent(admin, phone, claimedVersion))) {
        throw new Error("stale_inbound_batch");
      }
    };

    try {
      const prepared = await prepareCustomerServiceTurn(admin, {
        phone,
        text,
        mutationGuard,
      });
      const completed = await completeInboundBatch(admin, phone, claimedVersion);
      if (!completed) {
        processAfter = new Date().toISOString();
        continue;
      }
      await persistCustomerServiceTurn(admin, {
        providerMessageId: latestMessage.providerMessageId,
        phone,
        text,
        prepared,
      });
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const hasNewerMessages = await failInboundBatch(
        admin,
        phone,
        claimedVersion,
        detail,
      );
      if (hasNewerMessages || detail === "stale_inbound_batch") {
        processAfter = new Date().toISOString();
        continue;
      }
      throw error;
    }
  }
  console.error("customer service inbound burst exceeded restart limit", { phone });
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
      const existingConversation = await loadConversation(admin, event.waId);
      await recordHumanOperatorContextMessage(admin, event);
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
        recent_messages: sanitizeCustomerServiceRecentMessages([
          ...(existingConversation.recent_messages ?? []),
          { role: "human", text: event.text },
        ]),
        identity_verified_at: null,
        identity_verification_method: null,
        identity_verification_order_id: null,
        identity_verification_attempts: 0,
      });
      const { error: modeAuditError } = await admin
        .from("customer_service_conversation_mode_events")
        .upsert({
          environment: deploymentEnvironment(),
          phone_normalized: event.waId,
          provider_message_id: event.id,
          source: "wati_operator",
          from_state: existingConversation.state,
          to_state: "human_owned",
          mode: "human",
          reason: "WATI 後台同事發送訊息並接手對話",
          last_human_message: event.text.slice(0, 2_000),
          actor_name: event.operatorName || null,
          actor_email: event.operatorEmail || null,
        }, { onConflict: "provider_message_id" });
      if (modeAuditError) {
        console.error("conversation mode audit failed", modeAuditError.message.slice(0, 300));
      }
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
      !isWithinCustomerServiceSchedule({
        weekdayStart: controls.weekdayAutoReplyStart,
        weekdayEnd: controls.weekdayAutoReplyEnd,
        saturdayStart: controls.saturdayAutoReplyStart,
        saturdayEnd: controls.saturdayAutoReplyEnd,
        sundayStart: controls.sundayAutoReplyStart,
        sundayEnd: controls.sundayAutoReplyEnd,
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

    if (await filterInboundAdvertisement(admin, event)) {
      return jsonResponse({ ok: true, filtered: "advertisement" });
    }
    if (isCustomerServiceMediaType(event.type)) {
      await handleInboundMedia(admin, event);
      return jsonResponse({ ok: true, handoff: true, media_type: event.type });
    }

    const batch = await enqueueInboundBatch(admin, event);
    deferBackground(
      processInboundBatch(admin, event.waId, batch.process_after).catch((error) => {
        console.error(
          "customer service inbound batch failed",
          error instanceof Error ? error.message.slice(0, 300) : String(error),
        );
      }),
    );
    return jsonResponse({
      ok: true,
      queued: true,
      batch_version: batch.version,
      process_after: batch.process_after,
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
