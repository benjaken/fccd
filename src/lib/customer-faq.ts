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
  intentKey?: string;
  confidence?: number;
  toolKeys?: string[];
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

export type CustomerServiceLogic = {
  intents: CustomerServiceIntentSetting[];
  replyTemplates: CustomerServiceReplyTemplate[];
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
    intent_key?: unknown;
    confidence?: unknown;
    tool_keys?: unknown;
  } | null;
  if (!payload?.conversation) throw new Error("customer_service_preview_invalid_response");
  return {
    reply: typeof payload.reply === "string" ? payload.reply : null,
    conversation: payload.conversation,
    usedModel: Boolean(payload.used_model),
    simulatedWrite: Boolean(payload.simulated_write),
    simulatedNotify: Boolean(payload.simulated_notify),
    humanHandoff: Boolean(payload.human_handoff),
    intentKey: typeof payload.intent_key === "string" ? payload.intent_key : undefined,
    confidence: typeof payload.confidence === "number" ? payload.confidence : undefined,
    toolKeys: Array.isArray(payload.tool_keys)
      ? payload.tool_keys.filter((key): key is string => typeof key === "string")
      : [],
  };
}

export async function fetchCustomerServiceLogic(): Promise<CustomerServiceLogic> {
  const [{ data: intents, error: intentError }, { data: permissions, error: permissionError }, {
    data: replies,
    error: replyError,
  }] = await Promise.all([
    supabase
      .from("customer_service_intents")
      .select("intent_key,display_name,description,examples,action_key,enabled,priority,confidence_threshold")
      .order("priority"),
    supabase
      .from("customer_service_tool_permissions")
      .select("intent_key,tool_key")
      .eq("allowed", true),
    supabase
      .from("customer_service_reply_templates")
      .select("template_key,display_name,content,enabled")
      .order("display_name"),
  ]);
  if (intentError) throw intentError;
  if (permissionError) throw permissionError;
  if (replyError) throw replyError;
  const tools = new Map<string, string[]>();
  for (const row of (permissions ?? []) as Array<{ intent_key: string; tool_key: string }>) {
    tools.set(row.intent_key, [...(tools.get(row.intent_key) ?? []), row.tool_key]);
  }
  return {
    intents: ((intents ?? []) as Array<{
      intent_key: string;
      display_name: string;
      description: string;
      examples: string[] | null;
      action_key: string;
      enabled: boolean;
      priority: number;
      confidence_threshold: number | string;
    }>).map((row) => ({
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
    replyTemplates: ((replies ?? []) as Array<{
      template_key: string;
      display_name: string;
      content: string;
      enabled: boolean;
    }>).map((row) => ({
      templateKey: row.template_key,
      displayName: row.display_name,
      content: row.content,
      enabled: row.enabled,
    })),
  };
}

export async function updateCustomerServiceIntent(input: CustomerServiceIntentSetting) {
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

export async function updateCustomerServiceReplyTemplate(input: CustomerServiceReplyTemplate) {
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
