import { supabase, supabaseUrl } from "@/lib/supabase";

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

export type CustomerServiceOrderChoice = {
  orderId: string;
  orderNumber: string;
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
  orderChoices?: CustomerServiceOrderChoice[];
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
  faq_suggestions_dropped?: number;
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
  updatedAt: string;
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

export async function refreshCustomerFaqEmbeddings() {
  try {
    const { data, error } = await supabase.functions.invoke("customer-service-faq-embed", {
      body: { limit: 20 },
    });
    if (error || !data || data.ok !== true) {
      console.warn("customer-service embedding refresh incomplete; inspect embedding status and retry");
      return { ok: false, code: "embedding_refresh_incomplete" };
    }
    // Saving a FAQ and finishing ALL pending embeddings are separate outcomes.
    return { ok: true, ...data };
  } catch {
    console.warn("customer-service embedding refresh invocation failed");
    return { ok: false, code: "embedding_refresh_failed" };
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

export async function deleteCustomerFaq(id: string) {
  const { error } = await supabase.from("customer_faqs").delete().eq("id", id);
  if (error) throw error;
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
    order_choices?: unknown;
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
  const orderChoices = Array.isArray(payload.order_choices)
    ? payload.order_choices.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { orderId?: unknown; orderNumber?: unknown };
        if (typeof row.orderId !== "string") return [];
        return [{
          orderId: row.orderId,
          orderNumber:
            typeof row.orderNumber === "string"
              ? row.orderNumber.trim()
              : "",
        }];
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
    orderChoices,
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

function mapCustomerServiceLearningSuggestion(
  row: Record<string, unknown>,
): CustomerServiceLearningSuggestion {
  return {
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
  };
}

async function queryCustomerServiceLearningSuggestions(
  status: string,
  limit: number,
) {
  const { data, error } = await supabase.rpc(
    "customer_service_learning_suggestions_list",
    { p_status: status, p_limit: limit },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    mapCustomerServiceLearningSuggestion,
  );
}

export async function fetchCustomerServiceLearningSuggestions(
  status = "draft",
  limit = 50,
) {
  return queryCustomerServiceLearningSuggestions(status, limit);
}

export async function fetchCustomerServiceLearningSuggestionHistory(
  limit = 200,
) {
  const [approved, rejected] = await Promise.all([
    queryCustomerServiceLearningSuggestions("approved", limit),
    queryCustomerServiceLearningSuggestions("rejected", limit),
  ]);
  return [...approved, ...rejected];
}

export type CustomerServiceImportDay = {
  date: string;
  messageCount: number;
  humanCount: number;
  customerCount: number;
  broadcastCount: number;
  learned: boolean;
};

export type CustomerServiceImportProgress = {
  batches: number;
  messagesImported: number;
  phonesProcessed: number;
  phonesTotal: number;
};

export type CustomerServiceImportResult = {
  batches: number;
  messagesImported: number;
  phonesProcessed: number;
  errors: string[];
};

/**
 * Pulls past WATI conversations into the learning-only import table. The edge
 * function stops at a wall-clock budget and returns a cursor, so this loops
 * until every phone in the window has been fetched.
 */
/**
 * The backfill function must answer before the platform cuts the request off
 * (~150s). Each call is bounded well below that and driven by `next_cursor`, so
 * contact enumeration is the only unbounded step and it consumes the budget.
 */
const CUSTOMER_SERVICE_IMPORT_RUNTIME_MS = 110_000;
const CUSTOMER_SERVICE_IMPORT_CONCURRENCY = 16;

/**
 * Turns a FunctionsHttpError into an Error whose message is the server error
 * code (or `http_<status>`), so the UI can show an actionable reason instead of
 * the generic "check WATI credentials" text.
 */
async function customerServiceImportError(error: unknown): Promise<Error> {
  const candidate = error as { context?: Response; message?: string };
  const context = candidate?.context;
  if (context && typeof context.json === "function") {
    let code = "";
    let detail = "";
    try {
      const payload = (await context.json()) as { error?: unknown; detail?: unknown };
      if (payload?.error) code = String(payload.error);
      if (payload?.detail) detail = String(payload.detail);
    } catch {
      // Non-JSON body (e.g. a gateway error page).
    }
    if (code) return new Error(code);
    if (detail) return new Error(detail.slice(0, 200));
    if (typeof context.status === "number" && context.status > 0) {
      return new Error(`http_${context.status}`);
    }
  }
  return error instanceof Error ? error : new Error(String(error ?? "customer_service_import_failed"));
}

export async function importCustomerServiceHistory(
  input: {
    since?: string;
    until?: string;
    maxPhones?: number;
    refreshContacts?: boolean;
    activeOnly?: boolean;
    onProgress?: (progress: CustomerServiceImportProgress) => void;
  } = {},
): Promise<CustomerServiceImportResult> {
  let cursor: Record<string, unknown> | undefined;
  // -1 so an enumeration-only first response (phone_index 0) is not mistaken
  // for "no progress" and does not stop the loop early.
  let lastIndex = -1;
  let batches = 0;
  let messagesImported = 0;
  let phonesProcessed = 0;
  let phonesTotal = 0;
  const errors: string[] = [];
  for (let guard = 0; guard < 100; guard += 1) {
    const { data, error } = await supabase.functions.invoke(
      "wati-customer-service-backfill",
      {
        body: {
          since: input.since || undefined,
          until: input.until || undefined,
          max_phones: input.maxPhones,
          refresh_contacts: input.refreshContacts === true ? true : undefined,
          active_only: input.activeOnly === true ? true : undefined,
          max_runtime_ms: CUSTOMER_SERVICE_IMPORT_RUNTIME_MS,
          concurrency: CUSTOMER_SERVICE_IMPORT_CONCURRENCY,
          cursor,
        },
      },
    );
    if (error) throw await customerServiceImportError(error);
    const payload = data as Record<string, unknown> | null;
    if (!payload || payload.ok !== true) {
      throw new Error("customer_service_import_invalid_response");
    }
    batches += 1;
    messagesImported += Number(payload.messages_imported || 0);
    phonesProcessed = Number(payload.phones_processed || 0);
    const requested = Number(payload.phones_requested || 0);
    if (Number.isFinite(requested) && requested > 0) {
      phonesTotal = requested;
    }
    if (Array.isArray(payload.errors)) {
      errors.push(...payload.errors.map((item) => String(item)));
    }
    input.onProgress?.({
      batches,
      messagesImported,
      phonesProcessed,
      phonesTotal: phonesTotal || phonesProcessed,
    });
    if (payload.done === true) break;
    const next = payload.next_cursor;
    if (!next || typeof next !== "object") break;
    const nextIndex = Number((next as { phone_index?: unknown }).phone_index);
    if (!Number.isFinite(nextIndex) || nextIndex <= lastIndex) break;
    lastIndex = nextIndex;
    cursor = next as Record<string, unknown>;
  }
  return { batches, messagesImported, phonesProcessed, errors };
}

/** Read-only raw sample from WATI; use when an import returns no messages. */
export async function probeCustomerServiceHistory(maxPhones = 3) {
  const { data, error } = await supabase.functions.invoke(
    "wati-customer-service-backfill",
    { body: { mode: "probe", max_phones: maxPhones } },
  );
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function fetchCustomerServiceLearningImportSummary(
  limit = 90,
): Promise<CustomerServiceImportDay[]> {
  const environment = supabaseUrl.includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop";
  const { data, error } = await supabase.rpc(
    "customer_service_learning_import_summary",
    { p_limit: limit, p_environment: environment },
  );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    date: String(row.import_date),
    messageCount: Number(row.message_count || 0),
    humanCount: Number(row.human_count || 0),
    customerCount: Number(row.customer_count || 0),
    broadcastCount: Number(row.broadcast_count || 0),
    learned: row.learned === true,
  }));
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

export async function updateCustomerServiceLearningSuggestion(
  id: string,
  content: CustomerServiceLearningSuggestion["proposedContent"],
) {
  const { data, error } = await supabase.rpc(
    "customer_service_learning_suggestion_update",
    { p_id: id, p_content: content },
  );
  if (error) throw error;
  const row = (data as Array<{ proposed_content: unknown }> | null)?.[0];
  return row?.proposed_content && typeof row.proposed_content === "object"
    ? (row.proposed_content as CustomerServiceLearningSuggestion["proposedContent"])
    : content;
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
      updatedAt: String(row.updated_at || row.created_at),
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

export type CustomerServiceHistoryReplayRun = {
  id: string;
  environment: string;
  scope: string;
  status: string;
  planned: number;
  processed: number;
  scored: number;
  failed: number;
  skipped: number;
  completeSampleSet: boolean;
  seed: string | null;
  createdAt: string;
  completedAt: string | null;
};

function mapHistoryReplayRun(row: Record<string, unknown>): CustomerServiceHistoryReplayRun {
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    environment: String(row.environment),
    scope: String(row.scope),
    status: String(row.status),
    planned: Number(row.planned || 0),
    processed: Number(row.processed || 0),
    scored: Number(row.scored || 0),
    failed: Number(row.failed || 0),
    skipped: Number(row.skipped || 0),
    completeSampleSet: row.complete_sample_set === true,
    seed: typeof snapshot.seed === "string" ? snapshot.seed : null,
    createdAt: String(row.created_at),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

/**
 * Invokes the history-replay function and, on a non-2xx response, throws an
 * Error whose message is the server error code (e.g. `history_eval_disabled`)
 * so the UI can show an actionable reason instead of a generic failure.
 */
async function invokeCustomerServiceHistoryReplay<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "customer-service-history-replay",
    { body },
  );
  if (error) {
    let code = "";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const payload = (await context.json()) as { error?: unknown };
        if (payload?.error) code = String(payload.error);
      } catch {
        // Response body was not JSON; fall back to the SDK message.
      }
    }
    throw new Error(code || error.message || "history_replay_failed");
  }
  return data as T;
}

export async function fetchCustomerServiceHistoryReplayRuns(
  limit = 20,
): Promise<CustomerServiceHistoryReplayRun[]> {
  const payload = await invokeCustomerServiceHistoryReplay<{
    runs?: Array<Record<string, unknown>>;
  } | null>({ action: "status", limit });
  return (payload?.runs ?? []).map(mapHistoryReplayRun);
}

export type CustomerServiceHistoryReplaySample = {
  id: string;
  question: string;
  context: Array<{ role: string; text: string }>;
  conversationId: string | null;
  aiAnswer: string;
  referenceAnswer: string;
  status: string;
  comparison: string | null;
  aiGrounding: string | null;
  requiresHumanReview: boolean;
  issues: Array<Record<string, unknown>>;
  scenarioAt: string;
};

export async function fetchCustomerServiceHistoryReplaySamples(
  runId: string,
  limit = 200,
): Promise<CustomerServiceHistoryReplaySample[]> {
  const payload = await invokeCustomerServiceHistoryReplay<{
    samples?: Array<Record<string, unknown>>;
  } | null>({ action: "samples", run_id: runId, limit });
  return (payload?.samples ?? []).map((row) => ({
    id: String(row.id),
    question: String(row.question ?? ""),
    context: Array.isArray(row.context)
      ? (row.context as Array<{ role: string; text: string }>)
      : [],
    conversationId: typeof row.conversation_id === "string" ? row.conversation_id : null,
    aiAnswer: String(row.ai_answer ?? ""),
    referenceAnswer: String(row.reference_answer ?? ""),
    status: String(row.status ?? ""),
    comparison: typeof row.comparison === "string" ? row.comparison : null,
    aiGrounding: typeof row.ai_grounding === "string" ? row.ai_grounding : null,
    requiresHumanReview: row.requires_human_review === true,
    issues: Array.isArray(row.issues) ? (row.issues as Array<Record<string, unknown>>) : [],
    scenarioAt: String(row.scenario_at ?? ""),
  }));
}

export type CustomerServiceRepairProposal = {
  id: string;
  repairKind: string;
  riskLevel: string;
  status: string;
  reason: string;
  sourceSampleIds: string[];
  candidatePatch: Record<string, unknown>;
  codeChangeDraft: Record<string, unknown> | null;
  prUrl: string | null;
  draftedAt: string | null;
  runtimeChangeDraft: Record<string, unknown> | null;
  runtimeChangeDraftedAt: string | null;
  runtimeChangeAppliedAt: string | null;
  runtimeChangeResult: Record<string, unknown> | null;
  validation: Record<string, unknown> | null;
  createdAt: string;
};

export async function runCustomerServiceHistoryAutoRepair(runId: string, limit = 1) {
  return invokeCustomerServiceHistoryReplay<{
    results?: Array<{ sample_id: string; proposal_id: string; status: string; reason: string }>;
    error?: string;
  }>({ action: "auto_repair", run_id: runId, limit });
}

/** R0 only: drafts a reviewable repair proposal from divergent replay samples. */
export async function proposeCustomerServiceHistoryRepair(input: {
  runId: string;
  sampleId?: string;
  repairKind?: string;
}) {
  return invokeCustomerServiceHistoryReplay<{
    created?: string[];
    existing?: string[];
    skipped?: string[];
    error?: string;
  }>({
    action: "propose",
    run_id: input.runId,
    sample_id: input.sampleId,
    repair_kind: input.repairKind,
  });
}

export async function fetchCustomerServiceRepairProposals(
  runId: string,
): Promise<CustomerServiceRepairProposal[]> {
  const payload = await invokeCustomerServiceHistoryReplay<{
    proposals?: Array<Record<string, unknown>>;
  }>({ action: "proposals", run_id: runId });
  return (payload?.proposals ?? []).map((row) => ({
    id: String(row.id),
    repairKind: String(row.repair_kind ?? ""),
    riskLevel: String(row.risk_level ?? ""),
    status: String(row.status ?? ""),
    reason: String(row.reason ?? ""),
    sourceSampleIds: Array.isArray(row.source_sample_ids)
      ? (row.source_sample_ids as string[])
      : [],
    candidatePatch: (row.candidate_patch ?? {}) as Record<string, unknown>,
    codeChangeDraft: (row.code_change_draft ?? null) as Record<string, unknown> | null,
    prUrl: typeof row.pr_url === "string" && row.pr_url ? row.pr_url : null,
    draftedAt: typeof row.drafted_at === "string" && row.drafted_at ? row.drafted_at : null,
    runtimeChangeDraft: (row.runtime_change_draft ?? null) as Record<string, unknown> | null,
    runtimeChangeDraftedAt: typeof row.runtime_change_drafted_at === "string" && row.runtime_change_drafted_at
      ? row.runtime_change_drafted_at : null,
    runtimeChangeAppliedAt: typeof row.runtime_change_applied_at === "string" && row.runtime_change_applied_at
      ? row.runtime_change_applied_at : null,
    runtimeChangeResult: (row.runtime_change_result ?? null) as Record<string, unknown> | null,
    validation: (row.validation ?? null) as Record<string, unknown> | null,
    createdAt: String(row.created_at ?? ""),
  }));
}

/**
 * R3 only: generates a reviewable code-change draft (diff) for a repair
 * proposal. It never applies the change; a human reviews it and opens a PR.
 */
export async function draftCustomerServiceRepairCodeChange(proposalId: string) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    draft?: Record<string, unknown>;
    brief?: string;
    version?: string;
    error?: string;
  }>({ action: "draft_code_change", proposal_id: proposalId });
}

/**
 * R2 only: drafts a structured intent/workflow-policy/reply-template patch for a
 * repair proposal. It never applies the change; a human reviews it first.
 */
export async function draftCustomerServiceRepairRuntimeChange(proposalId: string) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    draft?: Record<string, unknown>;
    brief?: string;
    version?: string;
    error?: string;
  }>({ action: "draft_runtime_change", proposal_id: proposalId });
}

/** Applies or rejects a drafted runtime patch through the allow-listed executor. */
export async function reviewCustomerServiceRepairRuntimeChange(
  proposalId: string,
  decision: "apply" | "reject",
) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    change_count?: number;
    error?: string;
  }>({ action: "review_runtime_change", proposal_id: proposalId, decision });
}

/** Records the PR link a human opened for a code-change draft. It does not push or merge. */
export async function recordCustomerServiceRepairCodeChangePr(proposalId: string, prUrl: string) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    pr_url?: string;
    error?: string;
  }>({ action: "record_code_change_pr", proposal_id: proposalId, pr_url: prUrl });
}

/** Re-runs the source samples in isolation with the candidate FAQ overlay. */
export async function validateCustomerServiceRepairProposal(proposalId: string) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    validation?: Record<string, unknown>;
    error?: string;
  }>({ action: "validate_proposal", proposal_id: proposalId });
}

/** Controlled apply for a human-approved repair proposal. */
export async function applyCustomerServiceRepairProposal(proposalId: string) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    faq_id?: string;
    note?: string;
    error?: string;
  }>({ action: "apply_proposal", proposal_id: proposalId });
}

export async function rollbackCustomerServiceRepairProposal(proposalId: string) {
  return invokeCustomerServiceHistoryReplay<{ status?: string; error?: string }>({
    action: "rollback_proposal",
    proposal_id: proposalId,
  });
}

/** Records a human review decision. It does not apply the change. */
export async function reviewCustomerServiceRepairProposal(input: {
  proposalId: string;
  decision: "approve" | "reject" | "block";
}) {
  return invokeCustomerServiceHistoryReplay<{
    status?: string;
    review_only?: boolean;
    error?: string;
  }>({ action: "review_proposal", proposal_id: input.proposalId, decision: input.decision });
}

export async function startCustomerServiceHistoryReplay(input: {
  sampleSize?: number;
  scope?: "answer_quality" | "routing_safety";
  sourceSince?: string;
  sourceUntil?: string;
  seed?: string;
}) {
  return invokeCustomerServiceHistoryReplay<{
    run_id?: string;
    planned?: number;
    error?: string;
  }>({
    action: "start",
    sample_size: input.sampleSize,
    scope: input.scope,
    source_since: input.sourceSince,
    source_until: input.sourceUntil,
    seed: input.seed,
  });
}

export type CustomerServiceHistoryReplayItem = {
  question: string;
  status: string;
  comparison?: string;
};

/** Processes pending samples in parallel and reports what each one produced. */
export async function processCustomerServiceHistoryReplay(
  runId: string,
  limit = 200,
  concurrency = 4,
) {
  return invokeCustomerServiceHistoryReplay<{
    processed?: number;
    scored?: number;
    not_evaluable?: number;
    failed?: number;
    remaining?: number;
    items?: CustomerServiceHistoryReplayItem[];
    error?: string;
  }>({ action: "process", run_id: runId, limit, concurrency });
}

/** Judges processed samples in parallel and reports each verdict. */
export async function judgeCustomerServiceHistoryReplay(
  runId: string,
  limit = 200,
  concurrency = 4,
) {
  return invokeCustomerServiceHistoryReplay<{
    judged?: number;
    remaining?: number;
    items?: CustomerServiceHistoryReplayItem[];
    error?: string;
  }>({ action: "judge", run_id: runId, limit, concurrency });
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
