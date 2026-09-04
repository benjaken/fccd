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
  updatedAt: string;
};

export type CustomerServicePreviewConversation = {
  phone_normalized: string;
  state: "identifying" | "picking_order" | "collecting" | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
};

export type CustomerServicePreviewResult = {
  reply: string | null;
  conversation: CustomerServicePreviewConversation;
  usedModel: boolean;
  simulatedWrite: boolean;
  humanHandoff: boolean;
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
  updated_at: string;
};

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
  return {
    botEnabled: Boolean(row.bot_enabled),
    allowedPhones: Array.isArray(row.allowed_phones) ? row.allowed_phones : [],
    updatedAt: row.updated_at,
  };
}

export async function setCustomerServiceBotEnabled(enabled: boolean) {
  const { data, error } = await supabase.rpc("customer_service_controls_set", {
    p_bot_enabled: enabled,
  });
  if (error) throw error;
  const row = (data as ControlsRow[] | null)?.[0];
  if (!row) throw new Error("customer_service_controls_missing");
  return {
    botEnabled: Boolean(row.bot_enabled),
    allowedPhones: Array.isArray(row.allowed_phones) ? row.allowed_phones : [],
    updatedAt: row.updated_at,
  };
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
    human_handoff?: unknown;
  } | null;
  if (!payload?.conversation) throw new Error("customer_service_preview_invalid_response");
  return {
    reply: typeof payload.reply === "string" ? payload.reply : null,
    conversation: payload.conversation,
    usedModel: Boolean(payload.used_model),
    simulatedWrite: Boolean(payload.simulated_write),
    humanHandoff: Boolean(payload.human_handoff),
  };
}
