import { supabase } from "@/lib/supabase";

export const CUSTOMER_FAQS_PAGE_SIZE = 15;

export const CUSTOMER_FAQ_CATEGORIES = [
  "ordering",
  "delivery",
  "payment",
  "membership",
  "menu",
] as const;

export type CustomerFaqCategory = (typeof CUSTOMER_FAQ_CATEGORIES)[number];

export type CustomerFaq = {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  locale: string;
  isPublished: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type CustomerFaqResult = {
  items: CustomerFaq[];
  total: number;
};

export type CustomerFaqWriteInput = {
  category: string;
  question: string;
  answer: string;
  keywords: string;
  isPublished: boolean;
  sortOrder: number;
};

export type CustomerFaqSearchHit = {
  id: string;
  category: string;
  question: string;
  answer: string;
  score: number;
};

export type CustomerServiceControls = {
  botEnabled: boolean;
  allowedPhones: string[];
  weekdayAutoReplyStart: string;
  weekdayAutoReplyEnd: string;
  saturdayAutoReplyStart: string;
  saturdayAutoReplyEnd: string;
  sundayAutoReplyStart: string;
  sundayAutoReplyEnd: string;
  autoReplyTimezone: string;
  updatedAt: string;
};

export type CustomerServicePreviewConversation = {
  phone_normalized: string;
  state:
    | "identifying"
    | "verifying_order"
    | "picking_order"
    | "picking_handoff_order"
    | "collecting"
    | "awaiting_human"
    | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
  pending_request: string | null;
  identity_verified_at?: string | null;
  identity_verification_method?: string | null;
  identity_verification_order_id?: string | null;
  identity_verification_attempts?: number;
  active_goal?: "order_change" | "catering_inquiry" | null;
  workflow_slots?: Record<string, unknown>;
  workflow_version?: number;
  suspended_goals?: Array<Record<string, unknown>>;
  recent_messages?: Array<{
    role: "customer" | "assistant" | "human";
    text: string;
  }>;
};

export type RelatedFaqSuggestion = {
  id: string;
  question: string;
};

export type CustomerServiceTraceStatus = "ok" | "skipped" | "warn" | "failed";

export type CustomerServiceTraceStep = {
  stage: string;
  status: CustomerServiceTraceStatus;
  code: string | null;
  params: Record<string, string | number | boolean | null>;
};

export type CustomerServiceVisionPreview = {
  mediaKind: string;
  confidence: number;
  needsHuman: boolean;
  orderNumber: string | null;
  summary: string;
  extractedText: string;
};

export type CustomerServicePreviewResult = {
  reply: string | null;
  conversation: CustomerServicePreviewConversation;
  usedModel: boolean;
  simulatedWrite: boolean;
  simulatedNotify: boolean;
  humanHandoff: boolean;
  intentKey?: string;
  confidence?: number;
  toolKeys?: string[];
  relatedFaqs?: RelatedFaqSuggestion[];
  failureReason?: string | null;
  mediaRoute?: string | null;
  vision?: CustomerServiceVisionPreview | null;
  trace?: CustomerServiceTraceStep[];
};

export type CustomerServiceHandoff = {
  id: string;
  phone: string;
  orderNumber: string | null;
  summary: string;
  questions: Array<{ at?: string; text?: string }>;
  messageCount: number;
  status:
    | "pending"
    | "processing"
    | "notified"
    | "in_progress"
    | "resolved"
    | "failed";
  notifyAfter: string;
  notifiedAt: string | null;
  createdAt: string;
};

export type CustomerServiceOutboundMessage = {
  id: string;
  phone: string;
  body: string;
  status: "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "dead";
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastError: string | null;
  createdAt: string;
};

export type CustomerServiceDailyMetrics = {
  received: number;
  eligible: number;
  replied: number;
  handoff: number;
  unanswered: number;
  technical_failures: number;
  skipped: number;
  ai_evaluated: number;
  successful: number;
  failed: number;
  needs_review: number;
  automatically_evaluated: number;
  automatic_success_rate: number | null;
  grounded_rate: number | null;
  wrong_handoff_count: number;
  success_rate: number | null;
  send_success_rate: number | null;
  average_latency_ms: number;
  human_learning_conversations?: number;
};

export type CustomerServiceDailyReport = {
  id: string;
  reportDate: string;
  environment: string;
  metrics: CustomerServiceDailyMetrics;
  topIntents: Array<{ name: string; count: number }>;
  failureThemes: Array<{
    theme?: string;
    name?: string;
    count: number;
    explanation?: string;
  }>;
  aiSummary: string;
  model: string | null;
  status: string;
  error: string | null;
  generatedAt: string;
};

export type CustomerServiceLearningSuggestion = {
  id: string;
  reportId: string;
  reportDate: string;
  suggestionType: "faq" | "intent" | "policy";
  title: string;
  reason: string;
  proposedContent: {
    question?: string;
    answer?: string;
    category?: string;
    keywords?: string;
    runtime_changes?: Array<{
      target: "intent" | "reply_template" | "workflow_policy";
      key: string;
      patch: Record<string, unknown>;
    }>;
  };
  evidenceCount: number;
  status: string;
  targetFaqId: string | null;
  runtimeTarget: string | null;
  executionStatus: "pending" | "applied" | "failed" | "not_applicable";
  executionResult: Record<string, unknown>;
  executedAt: string | null;
  createdAt: string;
};

export type CustomerServiceReviewTurn = {
  id: string;
  createdAt: string;
  question: string;
  answer: string | null;
  intent: string | null;
  route: string | null;
  processingStatus: string;
  aiOutcome: string | null;
  aiReason: string | null;
  verdict: "correct" | "incorrect" | "needs_review" | null;
  failureCategory: string | null;
  correctedAnswer: string | null;
  note: string | null;
};

export type CustomerServiceRagFlags = {
  enableRagV2: boolean;
  enableQueryRewrite: boolean;
  enableGroundedClarification: boolean;
};

export type CustomerServiceConfigVersion = {
  id: string;
  environment: string;
  version: number;
  label: string;
  model: string;
  fallbackModel: string;
  fallbackEnabled: boolean;
  escalationConfidence: number;
  systemPrompt: string;
  temperature: number;
  retrievalLimit: number;
  ragConfig: CustomerServiceRagFlags;
  status: "draft" | "active" | "archived";
  activatedAt: string | null;
  createdAt: string;
};

export function parseCustomerServiceRagConfig(raw: unknown): CustomerServiceRagFlags {
  const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    enableRagV2: row.enable_rag_v2 === true,
    enableQueryRewrite: row.enable_query_rewrite === true,
    enableGroundedClarification: row.enable_grounded_clarification === true,
  };
}

export type CustomerServiceEvaluationRun = {
  id: string;
  candidateConfigId: string;
  candidateLabel: string;
  candidateModel: string;
  status: string;
  sampleSize: number;
  metrics: Record<string, number>;
  comparison: Record<string, number | string | null>;
  error: string | null;
  createdAt: string;
};

export type CustomerServiceIntentSetting = {
  intentKey: string;
  displayName: string;
  description: string;
  examples: string[];
  actionKey: string;
  enabled: boolean;
  priority: number;
  confidenceThreshold: number;
  toolKeys: string[];
};

export type CustomerServiceReplyTemplate = {
  templateKey: string;
  displayName: string;
  content: string;
  enabled: boolean;
};

export type CustomerServiceWorkflowPolicy = {
  goalKey: "order_change" | "catering_inquiry";
  displayName: string;
  instructions: string;
  contextWindow: number;
  clarificationThreshold: number;
  autoResume: boolean;
  enabled: boolean;
};

export type CustomerServiceLogic = {
  intents: CustomerServiceIntentSetting[];
  replyTemplates: CustomerServiceReplyTemplate[];
  workflowPolicies: CustomerServiceWorkflowPolicy[];
};

type FaqRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  locale: string;
  is_published: boolean;
  sort_order: number;
  updated_at: string;
};

type ControlsRow = {
  bot_enabled: boolean;
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
  updated_at: string;
};

function normalizeControlTime(
  value: string | null | undefined,
  fallback: string,
) {
  return /^\d{2}:\d{2}/.test(value ?? "")
    ? String(value).slice(0, 5)
    : fallback;
}

function mapControls(row: ControlsRow): CustomerServiceControls {
  return {
    botEnabled: Boolean(row.bot_enabled),
    allowedPhones: Array.isArray(row.allowed_phones) ? row.allowed_phones : [],
    weekdayAutoReplyStart: normalizeControlTime(
      row.weekday_auto_reply_start ?? row.auto_reply_start,
      "19:00",
    ),
    weekdayAutoReplyEnd: normalizeControlTime(
      row.weekday_auto_reply_end ?? row.auto_reply_end,
      "09:00",
    ),
    saturdayAutoReplyStart: normalizeControlTime(
      row.saturday_auto_reply_start ??
        row.weekend_auto_reply_start ??
        row.auto_reply_start,
      "00:00",
    ),
    saturdayAutoReplyEnd: normalizeControlTime(
      row.saturday_auto_reply_end ??
        row.weekend_auto_reply_end ??
        row.auto_reply_end,
      "00:00",
    ),
    sundayAutoReplyStart: normalizeControlTime(
      row.sunday_auto_reply_start ??
        row.weekend_auto_reply_start ??
        row.auto_reply_start,
      "00:00",
    ),
    sundayAutoReplyEnd: normalizeControlTime(
      row.sunday_auto_reply_end ??
        row.weekend_auto_reply_end ??
        row.auto_reply_end,
      "00:00",
    ),
    autoReplyTimezone: row.auto_reply_timezone || "Asia/Hong_Kong",
    updatedAt: row.updated_at,
  };
}

type SearchRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
  score: number | string;
};

export function isCustomerFaqCategory(
  value: string,
): value is CustomerFaqCategory {
  return (CUSTOMER_FAQ_CATEGORIES as readonly string[]).includes(value);
}

export function safeFaqSearch(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-_.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCustomerFaqInput(
  input: CustomerFaqWriteInput,
): CustomerFaqWriteInput {
  const category = input.category.trim();
  const question = input.question.trim().replace(/\s+/g, " ");
  const answer = input.answer.trim();
  const keywords = input.keywords.trim();
  if (!isCustomerFaqCategory(category))
    throw new Error("faq_category_required");
  if (!question) throw new Error("faq_question_required");
  if (!answer) throw new Error("faq_answer_required");
  return {
    category,
    question,
    answer,
    keywords,
    isPublished: Boolean(input.isPublished),
    sortOrder: Number.isFinite(input.sortOrder)
      ? Math.trunc(input.sortOrder)
      : 0,
  };
}

function mapFaq(row: FaqRow): CustomerFaq {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    keywords: row.keywords,
    locale: row.locale,
    isPublished: Boolean(row.is_published),
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

export async function fetchCustomerFaqs({
  page,
  search,
  category,
}: {
  page: number;
  search: string;
  category: string;
}): Promise<CustomerFaqResult> {
  const from = (page - 1) * CUSTOMER_FAQS_PAGE_SIZE;
  const to = from + CUSTOMER_FAQS_PAGE_SIZE - 1;
  const term = safeFaqSearch(search);
  let query = supabase
    .from("customer_faqs")
    .select(
      "id,category,question,answer,keywords,locale,is_published,sort_order,updated_at",
      { count: "exact" },
    )
    .order("sort_order")
    .order("question")
    .range(from, to);
  if (isCustomerFaqCategory(category)) query = query.eq("category", category);
  if (term) {
    query = query.or(
      `question.ilike.%${term}%,keywords.ilike.%${term}%,answer.ilike.%${term}%`,
    );
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return {
    items: ((data ?? []) as FaqRow[]).map(mapFaq),
    total: count ?? 0,
  };
}

async function refreshCustomerFaqEmbeddings() {
  try {
    await supabase.functions.invoke("customer-service-faq-embed", {
      body: { limit: 50 },
    });
  } catch {
    return;
  }
}

export async function createCustomerFaq(input: CustomerFaqWriteInput) {
  const fields = normalizeCustomerFaqInput(input);
  const { error } = await supabase.from("customer_faqs").insert({
    category: fields.category,
    question: fields.question,
    answer: fields.answer,
    keywords: fields.keywords,
    locale: "zh-HK",
    is_published: fields.isPublished,
    sort_order: fields.sortOrder,
  });
  if (error) throw error;
  void refreshCustomerFaqEmbeddings();
}

export async function updateCustomerFaq(
  id: string,
  input: CustomerFaqWriteInput,
) {
  const fields = normalizeCustomerFaqInput(input);
  const { error } = await supabase
    .from("customer_faqs")
    .update({
      category: fields.category,
      question: fields.question,
      answer: fields.answer,
      keywords: fields.keywords,
      is_published: fields.isPublished,
      sort_order: fields.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  void refreshCustomerFaqEmbeddings();
}

export async function fetchCustomerServiceControls(): Promise<CustomerServiceControls> {
  const { data, error } = await supabase.rpc("customer_service_controls_get");
  if (error) throw error;
  const row = (data as ControlsRow[] | null)?.[0];
  if (!row) throw new Error("customer_service_controls_missing");
  return mapControls(row);
}

export async function setCustomerServiceBotEnabled(
  enabled: boolean,
  weekdayAutoReplyStart = "19:00",
  weekdayAutoReplyEnd = "09:00",
  saturdayAutoReplyStart = "00:00",
  saturdayAutoReplyEnd = "00:00",
  sundayAutoReplyStart = "00:00",
  sundayAutoReplyEnd = "00:00",
) {
  const { data, error } = await supabase.rpc("customer_service_controls_set", {
    p_bot_enabled: enabled,
    p_weekday_auto_reply_start: weekdayAutoReplyStart,
    p_weekday_auto_reply_end: weekdayAutoReplyEnd,
    p_saturday_auto_reply_start: saturdayAutoReplyStart,
    p_saturday_auto_reply_end: saturdayAutoReplyEnd,
    p_sunday_auto_reply_start: sundayAutoReplyStart,
    p_sunday_auto_reply_end: sundayAutoReplyEnd,
  });
  if (error) throw error;
  const row = (data as ControlsRow[] | null)?.[0];
  if (!row) throw new Error("customer_service_controls_missing");
  return mapControls(row);
}

export async function searchPublishedCustomerFaqs(
  query: string,
  limit = 5,
): Promise<CustomerFaqSearchHit[]> {
  const term = query.trim();
  if (!term) return [];
  const { data, error } = await supabase.rpc("search_published_customer_faqs", {
    p_query: term,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as SearchRow[]).map((row) => ({
    id: row.id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    score: Number(row.score),
  }));
}

export async function previewCustomerServiceTurn(input: {
  text: string;
  phone?: string;
  image?: string;
  conversation?: CustomerServicePreviewConversation | null;
}): Promise<CustomerServicePreviewResult> {
  const { data, error } = await supabase.functions.invoke(
    "wati-customer-service",
    {
      body: {
        mode: "preview",
        text: input.text.trim(),
        phone: input.phone?.trim() || undefined,
        image: input.image || undefined,
        conversation: input.conversation ?? undefined,
      },
    },
  );
  if (error) throw error;
  const payload = data as {
    reply?: unknown;
    conversation?: CustomerServicePreviewConversation;
    used_model?: unknown;
    simulated_write?: unknown;
    simulated_notify?: unknown;
    human_handoff?: unknown;
    intent_key?: unknown;
    confidence?: unknown;
    tool_keys?: unknown;
    related_faqs?: unknown;
    failure_reason?: unknown;
    media_route?: unknown;
    vision?: unknown;
    trace?: unknown;
  } | null;
  if (!payload?.conversation)
    throw new Error("customer_service_preview_invalid_response");
  const relatedFaqs = Array.isArray(payload.related_faqs)
    ? payload.related_faqs.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { id?: unknown; question?: unknown };
        if (typeof row.id !== "string" || typeof row.question !== "string") {
          return [];
        }
        const question = row.question.trim();
        if (!question) return [];
        return [{ id: row.id, question }];
      })
    : [];
  return {
    reply: typeof payload.reply === "string" ? payload.reply : null,
    conversation: payload.conversation,
    usedModel: Boolean(payload.used_model),
    simulatedWrite: Boolean(payload.simulated_write),
    simulatedNotify: Boolean(payload.simulated_notify),
    humanHandoff: Boolean(payload.human_handoff),
    intentKey:
      typeof payload.intent_key === "string" ? payload.intent_key : undefined,
    confidence:
      typeof payload.confidence === "number" ? payload.confidence : undefined,
    toolKeys: Array.isArray(payload.tool_keys)
      ? payload.tool_keys.filter(
          (key): key is string => typeof key === "string",
        )
      : [],
    relatedFaqs,
    failureReason:
      typeof payload.failure_reason === "string" ? payload.failure_reason : null,
    mediaRoute:
      typeof payload.media_route === "string" ? payload.media_route : null,
    vision: parseCustomerServiceVisionPreview(payload.vision),
    trace: parseCustomerServiceTrace(payload.trace),
  };
}

function parseCustomerServiceVisionPreview(
  value: unknown,
): CustomerServiceVisionPreview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.media_kind !== "string") return null;
  return {
    mediaKind: row.media_kind,
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    needsHuman: Boolean(row.needs_human),
    orderNumber: typeof row.order_number === "string" ? row.order_number : null,
    summary: typeof row.summary === "string" ? row.summary : "",
    extractedText:
      typeof row.extracted_text === "string" ? row.extracted_text : "",
  };
}

function parseCustomerServiceTrace(value: unknown): CustomerServiceTraceStep[] {
  if (!Array.isArray(value)) return [];
  const statuses: CustomerServiceTraceStatus[] = ["ok", "skipped", "warn", "failed"];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      stage?: unknown;
      status?: unknown;
      code?: unknown;
      params?: unknown;
    };
    if (typeof row.stage !== "string" || !row.stage) return [];
    const status = statuses.find((candidate) => candidate === row.status) ?? "ok";
    const params: Record<string, string | number | boolean | null> = {};
    if (row.params && typeof row.params === "object") {
      for (const [key, raw] of Object.entries(row.params as Record<string, unknown>)) {
        if (raw === null || ["string", "number", "boolean"].includes(typeof raw)) {
          params[key] = raw as string | number | boolean | null;
        }
      }
    }
    return [{
      stage: row.stage,
      status,
      code: typeof row.code === "string" ? row.code : null,
      params,
    }];
  });
}

export async function fetchCustomerServiceDailyReports(
  limit = 14,
): Promise<CustomerServiceDailyReport[]> {
  const { data, error } = await supabase.rpc(
    "customer_service_daily_reports_list",
    { p_limit: limit },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    reportDate: String(row.report_date),
    environment: String(row.environment),
    metrics: (row.metrics ?? {}) as CustomerServiceDailyMetrics,
    topIntents: Array.isArray(row.top_intents)
      ? (row.top_intents as Array<{ name: string; count: number }>)
      : [],
    failureThemes: Array.isArray(row.failure_themes)
      ? (row.failure_themes as CustomerServiceDailyReport["failureThemes"])
      : [],
    aiSummary: String(row.ai_summary || ""),
    model: typeof row.model === "string" ? row.model : null,
    status: String(row.status || "partial"),
    error: typeof row.error === "string" ? row.error : null,
    generatedAt: String(row.generated_at),
  }));
}

export async function fetchCustomerServiceHandoffs(
  limit = 100,
): Promise<CustomerServiceHandoff[]> {
  const { data, error } = await supabase.rpc("customer_service_handoffs_list", {
    p_status: null,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    phone: String(row.phone_normalized || ""),
    orderNumber: typeof row.order_number === "string" ? row.order_number : null,
    summary: String(row.summary || ""),
    questions: Array.isArray(row.questions)
      ? row.questions.filter(
          (item): item is { at?: string; text?: string } =>
            Boolean(item) && typeof item === "object",
        )
      : [],
    messageCount: Number(row.message_count || 0),
    status: String(row.status || "pending") as CustomerServiceHandoff["status"],
    notifyAfter: String(row.notify_after),
    notifiedAt: typeof row.notified_at === "string" ? row.notified_at : null,
    createdAt: String(row.created_at),
  }));
}

export async function fetchCustomerServiceOutboundMessages(
  limit = 100,
): Promise<CustomerServiceOutboundMessage[]> {
  const { data, error } = await supabase.rpc(
    "customer_service_outbound_messages_list",
    { p_status: null, p_limit: limit },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    phone: String(row.phone_normalized || ""),
    body: String(row.body || ""),
    status: String(row.status || "queued") as CustomerServiceOutboundMessage["status"],
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 5),
    nextRetryAt: String(row.next_retry_at || ""),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: String(row.created_at || ""),
  }));
}

export async function retryCustomerServiceOutboundMessage(id: string) {
  const { error } = await supabase.rpc("customer_service_outbound_retry", { p_id: id });
  if (error) throw error;
  const { data, error: invokeError } = await supabase.functions.invoke(
    "wati-customer-service",
    { body: { mode: "retry_outbound" } },
  );
  if (invokeError) throw invokeError;
  return data;
}

export async function setCustomerServiceConversationMode(
  phone: string,
  mode: "human" | "bot",
) {
  const { data, error } = await supabase.rpc(
    "customer_service_conversation_set_mode",
    {
      p_phone: phone,
      p_mode: mode,
    },
  );
  if (error) throw error;
  return data;
}

export async function fetchCustomerServiceLearningSuggestions(
  status = "draft",
  limit = 50,
) {
  const { data, error } = await supabase.rpc(
    "customer_service_learning_suggestions_list",
    { p_status: status, p_limit: limit },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): CustomerServiceLearningSuggestion => ({
      id: String(row.id),
      reportId: String(row.report_id),
      reportDate: String(row.report_date),
      suggestionType:
        row.suggestion_type as CustomerServiceLearningSuggestion["suggestionType"],
      title: String(row.title || ""),
      reason: String(row.reason || ""),
      proposedContent:
        row.proposed_content && typeof row.proposed_content === "object"
          ? (row.proposed_content as CustomerServiceLearningSuggestion["proposedContent"])
          : {},
      evidenceCount: Number(row.evidence_count || 0),
      status: String(row.status || "draft"),
      targetFaqId:
        typeof row.target_faq_id === "string" ? row.target_faq_id : null,
      runtimeTarget:
        typeof row.runtime_target === "string" ? row.runtime_target : null,
      executionStatus: String(row.execution_status || "pending") as CustomerServiceLearningSuggestion["executionStatus"],
      executionResult:
        row.execution_result && typeof row.execution_result === "object"
          ? (row.execution_result as Record<string, unknown>)
          : {},
      executedAt: typeof row.executed_at === "string" ? row.executed_at : null,
      createdAt: String(row.created_at),
    }),
  );
}

export async function generateCustomerServiceDailyReport(reportDate: string) {
  const { data, error } = await supabase.functions.invoke(
    "customer-service-daily-report",
    { body: { report_date: reportDate } },
  );
  if (error) throw error;
  void refreshCustomerFaqEmbeddings();
  return data;
}

export async function reviewCustomerServiceLearningSuggestion(
  id: string,
  status: "approved" | "rejected",
) {
  const { data, error } = await supabase.rpc(
    "customer_service_learning_suggestion_review",
    { p_id: id, p_status: status },
  );
  if (error) throw error;
  if (status === "approved") void refreshCustomerFaqEmbeddings();
  return (data as Array<{ target_faq_id: string | null }> | null)?.[0];
}

export async function fetchCustomerServiceReviewTurns(
  reviewState = "unreviewed",
  limit = 50,
) {
  const { data, error } = await supabase.rpc(
    "customer_service_turns_review_list",
    { p_review_state: reviewState, p_limit: limit },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): CustomerServiceReviewTurn => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      question: String(row.question || ""),
      answer: typeof row.answer === "string" ? row.answer : null,
      intent: typeof row.intent === "string" ? row.intent : null,
      route: typeof row.route === "string" ? row.route : null,
      processingStatus: String(row.processing_status || ""),
      aiOutcome: typeof row.ai_outcome === "string" ? row.ai_outcome : null,
      aiReason: typeof row.ai_reason === "string" ? row.ai_reason : null,
      verdict:
        typeof row.verdict === "string"
          ? (row.verdict as CustomerServiceReviewTurn["verdict"])
          : null,
      failureCategory:
        typeof row.failure_category === "string" ? row.failure_category : null,
      correctedAnswer:
        typeof row.corrected_answer === "string" ? row.corrected_answer : null,
      note: typeof row.note === "string" ? row.note : null,
    }),
  );
}

export async function submitCustomerServiceTurnFeedback(input: {
  turnId: string;
  verdict: "correct" | "incorrect" | "needs_review";
  failureCategory?: string;
  correctedAnswer?: string;
  note?: string;
  includeInLearning?: boolean;
  createFaqDraft?: boolean;
}) {
  const { data, error } = await supabase.rpc(
    "customer_service_turn_feedback_submit",
    {
      p_turn_id: input.turnId,
      p_verdict: input.verdict,
      p_failure_category: input.failureCategory || null,
      p_corrected_answer: input.correctedAnswer || null,
      p_note: input.note || null,
      p_include_in_learning: Boolean(input.includeInLearning),
      p_create_faq_draft: Boolean(input.createFaqDraft),
    },
  );
  if (error) throw error;
  if (input.createFaqDraft) void refreshCustomerFaqEmbeddings();
  return data;
}

export async function fetchCustomerServiceConfigVersions(
  environment = "develop",
) {
  const { data, error } = await supabase.rpc(
    "customer_service_config_versions_list",
    { p_environment: environment },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): CustomerServiceConfigVersion => ({
      id: String(row.id),
      environment: String(row.environment),
      version: Number(row.version),
      label: String(row.label),
      model: String(row.model),
      fallbackModel: String(row.fallback_model || "grok-4.5"),
      fallbackEnabled: row.fallback_enabled !== false,
      escalationConfidence: Number(row.escalation_confidence ?? 0.72),
      systemPrompt: String(row.system_prompt || ""),
      temperature: Number(row.temperature),
      retrievalLimit: Number(row.retrieval_limit),
      ragConfig: parseCustomerServiceRagConfig(row.rag_config),
      status: row.status as CustomerServiceConfigVersion["status"],
      activatedAt:
        typeof row.activated_at === "string" ? row.activated_at : null,
      createdAt: String(row.created_at),
    }),
  );
}

export async function setCustomerServiceConfigRag(
  id: string,
  ragConfig: CustomerServiceRagFlags,
) {
  const { error } = await supabase.rpc("customer_service_config_set_rag", {
    p_id: id,
    p_rag_config: {
      enable_rag_v2: ragConfig.enableRagV2,
      enable_query_rewrite: ragConfig.enableQueryRewrite,
      enable_grounded_clarification: ragConfig.enableGroundedClarification,
    },
  });
  if (error) throw error;
}

export async function createCustomerServiceConfig(input: {
  environment?: string;
  label: string;
  model: string;
  fallbackModel: string;
  fallbackEnabled: boolean;
  escalationConfidence: number;
  systemPrompt: string;
  temperature: number;
  retrievalLimit: number;
  ragConfig?: CustomerServiceRagFlags;
}) {
  const { data, error } = await supabase.rpc("customer_service_config_create_tiered", {
    p_environment: input.environment || "develop",
    p_label: input.label,
    p_model: input.model,
    p_fallback_model: input.fallbackModel,
    p_fallback_enabled: input.fallbackEnabled,
    p_escalation_confidence: input.escalationConfidence,
    p_system_prompt: input.systemPrompt,
    p_temperature: input.temperature,
    p_retrieval_limit: input.retrievalLimit,
  });
  if (error) throw error;
  const id = String(data);
  if (input.ragConfig) await setCustomerServiceConfigRag(id, input.ragConfig);
  return id;
}

export async function activateCustomerServiceConfig(id: string) {
  const { error } = await supabase.rpc("customer_service_config_activate", {
    p_id: id,
  });
  if (error) throw error;
}

export async function rollbackCustomerServiceConfig(id: string) {
  const { error } = await supabase.rpc("customer_service_config_rollback", {
    p_id: id,
  });
  if (error) throw error;
}

export async function evaluateCustomerServiceConfig(
  id: string,
  sampleSize = 20,
) {
  const { data, error } = await supabase.functions.invoke(
    "customer-service-model-evaluate",
    { body: { config_id: id, sample_size: sampleSize } },
  );
  if (error) throw error;
  return data;
}

export async function fetchCustomerServiceEvaluationRuns(limit = 20) {
  const { data, error } = await supabase.rpc(
    "customer_service_evaluation_runs_list",
    { p_limit: limit },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): CustomerServiceEvaluationRun => ({
      id: String(row.id),
      candidateConfigId: String(row.candidate_config_id),
      candidateLabel: String(row.candidate_label),
      candidateModel: String(row.candidate_model),
      status: String(row.status),
      sampleSize: Number(row.sample_size || 0),
      metrics: (row.metrics || {}) as Record<string, number>,
      comparison: (row.comparison || {}) as Record<string, number | string | null>,
      error: typeof row.error === "string" ? row.error : null,
      createdAt: String(row.created_at),
    }),
  );
}

export async function fetchCustomerServiceLogic(): Promise<CustomerServiceLogic> {
  const [
    { data: intents, error: intentError },
    { data: permissions, error: permissionError },
    { data: replies, error: replyError },
    { data: workflows, error: workflowError },
  ] = await Promise.all([
    supabase
      .from("customer_service_intents")
      .select(
        "intent_key,display_name,description,examples,action_key,enabled,priority,confidence_threshold",
      )
      .order("priority"),
    supabase
      .from("customer_service_tool_permissions")
      .select("intent_key,tool_key")
      .eq("allowed", true),
    supabase
      .from("customer_service_reply_templates")
      .select("template_key,display_name,content,enabled")
      .order("display_name"),
    supabase
      .from("customer_service_workflow_policies")
      .select("goal_key,display_name,instructions,context_window,clarification_threshold,auto_resume,enabled")
      .order("goal_key"),
  ]);
  if (intentError) throw intentError;
  if (permissionError) throw permissionError;
  if (replyError) throw replyError;
  if (workflowError) throw workflowError;
  const tools = new Map<string, string[]>();
  for (const row of (permissions ?? []) as Array<{
    intent_key: string;
    tool_key: string;
  }>) {
    tools.set(row.intent_key, [
      ...(tools.get(row.intent_key) ?? []),
      row.tool_key,
    ]);
  }
  return {
    intents: (
      (intents ?? []) as Array<{
        intent_key: string;
        display_name: string;
        description: string;
        examples: string[] | null;
        action_key: string;
        enabled: boolean;
        priority: number;
        confidence_threshold: number | string;
      }>
    ).map((row) => ({
      intentKey: row.intent_key,
      displayName: row.display_name,
      description: row.description,
      examples: row.examples ?? [],
      actionKey: row.action_key,
      enabled: row.enabled,
      priority: row.priority,
      confidenceThreshold: Number(row.confidence_threshold),
      toolKeys: tools.get(row.intent_key) ?? [],
    })),
    replyTemplates: (
      (replies ?? []) as Array<{
        template_key: string;
        display_name: string;
        content: string;
        enabled: boolean;
      }>
    ).map((row) => ({
      templateKey: row.template_key,
      displayName: row.display_name,
      content: row.content,
      enabled: row.enabled,
    })),
    workflowPolicies: (
      (workflows ?? []) as Array<{
        goal_key: CustomerServiceWorkflowPolicy["goalKey"];
        display_name: string;
        instructions: string;
        context_window: number;
        clarification_threshold: number | string;
        auto_resume: boolean;
        enabled: boolean;
      }>
    ).map((row) => ({
      goalKey: row.goal_key,
      displayName: row.display_name,
      instructions: row.instructions,
      contextWindow: Number(row.context_window),
      clarificationThreshold: Number(row.clarification_threshold),
      autoResume: row.auto_resume,
      enabled: row.enabled,
    })),
  };
}

export async function updateCustomerServiceWorkflowPolicy(
  input: CustomerServiceWorkflowPolicy,
) {
  const { error } = await supabase
    .from("customer_service_workflow_policies")
    .update({
      instructions: input.instructions.trim(),
      context_window: Math.max(1, Math.min(12, Math.trunc(input.contextWindow))),
      clarification_threshold: Math.max(0, Math.min(1, input.clarificationThreshold)),
      auto_resume: input.autoResume,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("goal_key", input.goalKey);
  if (error) throw error;
}

export async function updateCustomerServiceIntent(
  input: CustomerServiceIntentSetting,
) {
  const { error } = await supabase
    .from("customer_service_intents")
    .update({
      display_name: input.displayName.trim(),
      description: input.description.trim(),
      examples: input.examples.map((example) => example.trim()).filter(Boolean),
      action_key: input.actionKey,
      enabled: input.enabled,
      priority: Math.trunc(input.priority),
      confidence_threshold: Math.min(1, Math.max(0, input.confidenceThreshold)),
      updated_at: new Date().toISOString(),
    })
    .eq("intent_key", input.intentKey);
  if (error) throw error;
}

export async function updateCustomerServiceReplyTemplate(
  input: CustomerServiceReplyTemplate,
) {
  const content = input.content.trim();
  if (!content) throw new Error("customer_service_reply_required");
  const { error } = await supabase
    .from("customer_service_reply_templates")
    .update({
      content,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("template_key", input.templateKey);
  if (error) throw error;
}
