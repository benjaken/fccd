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
  autoReplyStart: string;
  autoReplyEnd: string;
  autoReplyTimezone: string;
  updatedAt: string;
};

export type CustomerServicePreviewConversation = {
  phone_normalized: string;
  state: "identifying" | "picking_order" | "picking_handoff_order" | "collecting" | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
  pending_request: string | null;
};

export type CustomerServicePreviewResult = {
  reply: string | null;
  conversation: CustomerServicePreviewConversation;
  usedModel: boolean;
  simulatedWrite: boolean;
  simulatedNotify: boolean;
  humanHandoff: boolean;
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
  success_rate: number | null;
  send_success_rate: number | null;
  average_latency_ms: number;
};

export type CustomerServiceDailyReport = {
  id: string;
  reportDate: string;
  environment: string;
  metrics: CustomerServiceDailyMetrics;
  topIntents: Array<{ name: string; count: number }>;
  failureThemes: Array<{ theme?: string; name?: string; count: number; explanation?: string }>;
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
  };
  evidenceCount: number;
  status: string;
  targetFaqId: string | null;
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

export type CustomerServiceConfigVersion = {
  id: string;
  environment: string;
  version: number;
  label: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  retrievalLimit: number;
  status: "draft" | "active" | "archived";
  activatedAt: string | null;
  createdAt: string;
};

export type CustomerServiceEvaluationRun = {
  id: string;
  candidateConfigId: string;
  candidateLabel: string;
  candidateModel: string;
  status: string;
  sampleSize: number;
  metrics: Record<string, number>;
  error: string | null;
  createdAt: string;
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
  auto_reply_timezone?: string | null;
  updated_at: string;
};

function normalizeControlTime(value: string | null | undefined, fallback: string) {
  return /^\d{2}:\d{2}/.test(value ?? "") ? String(value).slice(0, 5) : fallback;
}

function mapControls(row: ControlsRow): CustomerServiceControls {
  return {
    botEnabled: Boolean(row.bot_enabled),
    allowedPhones: Array.isArray(row.allowed_phones) ? row.allowed_phones : [],
    autoReplyStart: normalizeControlTime(row.auto_reply_start, "19:00"),
    autoReplyEnd: normalizeControlTime(row.auto_reply_end, "09:00"),
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

export function isCustomerFaqCategory(value: string): value is CustomerFaqCategory {
  return (CUSTOMER_FAQ_CATEGORIES as readonly string[]).includes(value);
}

export function safeFaqSearch(value: string) {
  return value.replace(/[^\p{L}\p{N}\s@+\-_.]/gu, " ").replace(/\s+/g, " ").trim();
}

export function normalizeCustomerFaqInput(input: CustomerFaqWriteInput): CustomerFaqWriteInput {
  const category = input.category.trim();
  const question = input.question.trim().replace(/\s+/g, " ");
  const answer = input.answer.trim();
  const keywords = input.keywords.trim();
  if (!isCustomerFaqCategory(category)) throw new Error("faq_category_required");
  if (!question) throw new Error("faq_question_required");
  if (!answer) throw new Error("faq_answer_required");
  return {
    category,
    question,
    answer,
    keywords,
    isPublished: Boolean(input.isPublished),
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
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
}

export async function updateCustomerFaq(id: string, input: CustomerFaqWriteInput) {
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
  autoReplyStart = "19:00",
  autoReplyEnd = "09:00",
) {
  const { data, error } = await supabase.rpc("customer_service_controls_set", {
    p_bot_enabled: enabled,
    p_auto_reply_start: autoReplyStart,
    p_auto_reply_end: autoReplyEnd,
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
  conversation?: CustomerServicePreviewConversation | null;
}): Promise<CustomerServicePreviewResult> {
  const { data, error } = await supabase.functions.invoke("wati-customer-service", {
    body: {
      mode: "preview",
      text: input.text.trim(),
      phone: input.phone?.trim() || undefined,
      conversation: input.conversation ?? undefined,
    },
  });
  if (error) throw error;
  const payload = data as {
    reply?: unknown;
    conversation?: CustomerServicePreviewConversation;
    used_model?: unknown;
    simulated_write?: unknown;
    simulated_notify?: unknown;
    human_handoff?: unknown;
  } | null;
  if (!payload?.conversation) throw new Error("customer_service_preview_invalid_response");
  return {
    reply: typeof payload.reply === "string" ? payload.reply : null,
    conversation: payload.conversation,
    usedModel: Boolean(payload.used_model),
    simulatedWrite: Boolean(payload.simulated_write),
    simulatedNotify: Boolean(payload.simulated_notify),
    humanHandoff: Boolean(payload.human_handoff),
  };
}

export async function fetchCustomerServiceDailyReports(limit = 14): Promise<CustomerServiceDailyReport[]> {
  const { data, error } = await supabase.rpc("customer_service_daily_reports_list", {
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    reportDate: String(row.report_date),
    environment: String(row.environment),
    metrics: (row.metrics ?? {}) as CustomerServiceDailyMetrics,
    topIntents: Array.isArray(row.top_intents) ? row.top_intents as Array<{ name: string; count: number }> : [],
    failureThemes: Array.isArray(row.failure_themes)
      ? row.failure_themes as CustomerServiceDailyReport["failureThemes"]
      : [],
    aiSummary: String(row.ai_summary || ""),
    model: typeof row.model === "string" ? row.model : null,
    status: String(row.status || "partial"),
    error: typeof row.error === "string" ? row.error : null,
    generatedAt: String(row.generated_at),
  }));
}

export async function fetchCustomerServiceLearningSuggestions(
  status = "draft",
  limit = 50,
): Promise<CustomerServiceLearningSuggestion[]> {
  const { data, error } = await supabase.rpc("customer_service_learning_suggestions_list", {
    p_status: status,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    reportId: String(row.report_id),
    reportDate: String(row.report_date),
    suggestionType: row.suggestion_type as CustomerServiceLearningSuggestion["suggestionType"],
    title: String(row.title || ""),
    reason: String(row.reason || ""),
    proposedContent: row.proposed_content && typeof row.proposed_content === "object"
      ? row.proposed_content as CustomerServiceLearningSuggestion["proposedContent"]
      : {},
    evidenceCount: Number(row.evidence_count || 0),
    status: String(row.status || "draft"),
    targetFaqId: typeof row.target_faq_id === "string" ? row.target_faq_id : null,
    createdAt: String(row.created_at),
  }));
}

export async function generateCustomerServiceDailyReport(reportDate: string) {
  const { data, error } = await supabase.functions.invoke("customer-service-daily-report", {
    body: { report_date: reportDate },
  });
  if (error) throw error;
  return data as { ok: boolean; report_id: string; report_date: string; status: string };
}

export async function reviewCustomerServiceLearningSuggestion(
  id: string,
  status: "approved" | "rejected",
) {
  const { data, error } = await supabase.rpc("customer_service_learning_suggestion_review", {
    p_id: id,
    p_status: status,
  });
  if (error) throw error;
  return (data as Array<{ suggestion_id: string; suggestion_status: string; target_faq_id: string | null }> | null)?.[0];
}

export async function fetchCustomerServiceReviewTurns(reviewState = "unreviewed", limit = 50) {
  const { data, error } = await supabase.rpc("customer_service_turns_review_list", {
    p_review_state: reviewState,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row): CustomerServiceReviewTurn => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    question: String(row.question || ""),
    answer: typeof row.answer === "string" ? row.answer : null,
    intent: typeof row.intent === "string" ? row.intent : null,
    route: typeof row.route === "string" ? row.route : null,
    processingStatus: String(row.processing_status || ""),
    aiOutcome: typeof row.ai_outcome === "string" ? row.ai_outcome : null,
    aiReason: typeof row.ai_reason === "string" ? row.ai_reason : null,
    verdict: typeof row.verdict === "string" ? row.verdict as CustomerServiceReviewTurn["verdict"] : null,
    failureCategory: typeof row.failure_category === "string" ? row.failure_category : null,
    correctedAnswer: typeof row.corrected_answer === "string" ? row.corrected_answer : null,
    note: typeof row.note === "string" ? row.note : null,
  }));
}

export async function submitCustomerServiceTurnFeedback(input: {
  turnId: string;
  verdict: "correct" | "incorrect" | "needs_review";
  failureCategory?: string;
  correctedAnswer?: string;
  note?: string;
  createFaqDraft?: boolean;
}) {
  const { data, error } = await supabase.rpc("customer_service_turn_feedback_submit", {
    p_turn_id: input.turnId,
    p_verdict: input.verdict,
    p_failure_category: input.failureCategory || null,
    p_corrected_answer: input.correctedAnswer || null,
    p_note: input.note || null,
    p_create_faq_draft: Boolean(input.createFaqDraft),
  });
  if (error) throw error;
  return data;
}

export async function fetchCustomerServiceConfigVersions(environment = "develop") {
  const { data, error } = await supabase.rpc("customer_service_config_versions_list", {
    p_environment: environment,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row): CustomerServiceConfigVersion => ({
    id: String(row.id),
    environment: String(row.environment),
    version: Number(row.version),
    label: String(row.label),
    model: String(row.model),
    systemPrompt: String(row.system_prompt || ""),
    temperature: Number(row.temperature),
    retrievalLimit: Number(row.retrieval_limit),
    status: row.status as CustomerServiceConfigVersion["status"],
    activatedAt: typeof row.activated_at === "string" ? row.activated_at : null,
    createdAt: String(row.created_at),
  }));
}

export async function createCustomerServiceConfig(input: {
  environment?: string;
  label: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  retrievalLimit: number;
}) {
  const { data, error } = await supabase.rpc("customer_service_config_create", {
    p_environment: input.environment || "develop",
    p_label: input.label,
    p_model: input.model,
    p_system_prompt: input.systemPrompt,
    p_temperature: input.temperature,
    p_retrieval_limit: input.retrievalLimit,
  });
  if (error) throw error;
  return String(data);
}

export async function activateCustomerServiceConfig(id: string) {
  const { error } = await supabase.rpc("customer_service_config_activate", { p_id: id });
  if (error) throw error;
}

export async function evaluateCustomerServiceConfig(id: string, sampleSize = 20) {
  const { data, error } = await supabase.functions.invoke("customer-service-model-evaluate", {
    body: { config_id: id, sample_size: sampleSize },
  });
  if (error) throw error;
  return data;
}

export async function fetchCustomerServiceEvaluationRuns(limit = 20) {
  const { data, error } = await supabase.rpc("customer_service_evaluation_runs_list", { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row): CustomerServiceEvaluationRun => ({
    id: String(row.id),
    candidateConfigId: String(row.candidate_config_id),
    candidateLabel: String(row.candidate_label),
    candidateModel: String(row.candidate_model),
    status: String(row.status),
    sampleSize: Number(row.sample_size || 0),
    metrics: (row.metrics || {}) as Record<string, number>,
    error: typeof row.error === "string" ? row.error : null,
    createdAt: String(row.created_at),
  }));
}
