import {
  sanitizeCustomerServiceRecentMessages,
  type CustomerServiceRecentMessage,
} from "./customer-service-context.ts";
import {
  CUSTOMER_SERVICE_ORDER_FIELDS,
  type CustomerServiceOrderField,
} from "./customer-service-intents.ts";

export type CustomerServiceFaqKnowledge = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export type CustomerServiceAiConfig = {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  systemPrompt?: string;
  temperature?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
};

export type CustomerServiceAiTierConfig = {
  primary: CustomerServiceAiConfig;
  fallback?: CustomerServiceAiConfig | null;
  escalationConfidence: number;
};

export type CustomerServiceAiAnswer = {
  answer: string;
  sourceIds: string[];
  model: string;
  confidence?: "high" | "medium" | "low";
  needsClarification?: boolean;
  clarificationQuestion?: string;
};

export type CustomerServiceAiFallbackAnswer = {
  answer: string;
  model: string;
};

export type CustomerServiceIntentConfig = {
  intentKey: string;
  displayName: string;
  description: string;
  examples: string[];
  actionKey: string;
  confidenceThreshold: number;
  toolKeys: string[];
};

export type CustomerServiceAiClassification = {
  intentKey: string;
  confidence: number;
  orderNumber: string;
  requestedDate: string;
  requestedFields: CustomerServiceOrderField[];
  missingFields: string[];
  requiresHuman: boolean;
  toolKey: string | null;
  model: string;
  dialogAction:
    | "new_request"
    | "continue_current"
    | "add_information"
    | "select_option"
    | "confirm"
    | "deny"
    | "correct_previous"
    | "cancel_current"
    | "switch_task"
    | "resume_previous";
  needsClarification: boolean;
  clarificationQuestion: string;
};

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

export function customerServiceAiConfig(): CustomerServiceAiConfig {
  return {
    enabled: firstEnv(
      "CUSTOMER_SERVICE_AI_ENABLED",
      "ADDRESS_TRANSLATION_AI_ENABLED",
      "REPORT_AI_ENABLED",
      "SUPPLIER_QUOTE_AI_ENABLED",
    ).toLowerCase() === "true",
    endpoint: firstEnv(
      "CUSTOMER_SERVICE_AI_ENDPOINT",
      "ADDRESS_TRANSLATION_AI_ENDPOINT",
      "REPORT_AI_ENDPOINT",
      "SUPPLIER_QUOTE_AI_ENDPOINT",
    ),
    apiKey: firstEnv(
      "CUSTOMER_SERVICE_AI_API_KEY",
      "XAI_API_KEY",
      "REPORT_AI_API_KEY",
      "SUPPLIER_QUOTE_AI_API_KEY",
    ),
    model: firstEnv(
      "CUSTOMER_SERVICE_AI_MODEL",
      "ADDRESS_TRANSLATION_AI_MODEL",
      "REPORT_AI_MODEL",
      "SUPPLIER_QUOTE_AI_MODEL",
    ) || "grok-4.3",
    timeoutMs: Math.min(
      Math.max(Number(firstEnv("CUSTOMER_SERVICE_AI_TIMEOUT_MS")) || 12_000, 2_000),
      30_000,
    ),
  };
}

function numericTokens(value: string) {
  return (value.match(/\d[\d,.]*/g) ?? []).map((token) =>
    token.replaceAll(",", "").replace(/[.]+$/g, "")
  );
}

function answerNumbersAreGrounded(answer: string, sources: CustomerServiceFaqKnowledge[]) {
  const supported = new Set(
    sources.flatMap((source) => numericTokens(`${source.question}\n${source.answer}`)),
  );
  return numericTokens(answer).every((token) => supported.has(token));
}

function reasoningParameters(config: CustomerServiceAiConfig) {
  if (!/api\.x\.ai/i.test(config.endpoint)) return {};
  const effort = config.reasoningEffort
    ?? (/^grok-4\.3/i.test(config.model) ? "none" : /^grok-4\.5/i.test(config.model) ? "low" : undefined);
  return effort ? { reasoning_effort: effort } : {};
}

function parseClassification(
  payload: { choices?: Array<{ message?: { content?: string | null } }> },
  intents: CustomerServiceIntentConfig[],
  model: string,
): CustomerServiceAiClassification | null {
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const intentKey = typeof parsed.intent === "string" ? parsed.intent : "";
  const intent = intents.find((item) => item.intentKey === intentKey);
  if (!intent) return null;
  const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
  const requestedTool = typeof parsed.tool === "string" ? parsed.tool : "";
  const toolKey = intent.toolKeys.includes(requestedTool) ? requestedTool : null;
  const requestedFields = Array.isArray(parsed.requestedFields)
    ? [...new Set(parsed.requestedFields.filter(
      (field): field is CustomerServiceOrderField =>
        typeof field === "string" &&
        CUSTOMER_SERVICE_ORDER_FIELDS.includes(field as CustomerServiceOrderField),
    ))].slice(0, CUSTOMER_SERVICE_ORDER_FIELDS.length)
    : [];
  const rawDialogAction = typeof parsed.dialogAction === "string"
    ? parsed.dialogAction
    : "continue_current";
  const dialogAction = [
    "new_request",
    "continue_current",
    "add_information",
    "select_option",
    "confirm",
    "deny",
    "correct_previous",
    "cancel_current",
    "switch_task",
    "resume_previous",
  ].includes(rawDialogAction)
    ? rawDialogAction as CustomerServiceAiClassification["dialogAction"]
    : "continue_current";
  return {
    intentKey,
    confidence,
    orderNumber: typeof parsed.orderNumber === "string" ? parsed.orderNumber.slice(0, 80) : "",
    requestedDate: typeof parsed.requestedDate === "string" ? parsed.requestedDate.slice(0, 20) : "",
    requestedFields,
    missingFields: Array.isArray(parsed.missingFields)
      ? parsed.missingFields.filter((field): field is string => typeof field === "string").slice(0, 10)
      : [],
    requiresHuman: Boolean(parsed.requiresHuman),
    toolKey,
    model,
    dialogAction,
    needsClarification: Boolean(parsed.needsClarification),
    clarificationQuestion: typeof parsed.clarificationQuestion === "string"
      ? parsed.clarificationQuestion.trim().slice(0, 300)
      : "",
  };
}

export async function classifyCustomerServiceWithAi({
  message,
  conversationState,
  pendingRequest = "",
  recentMessages = [],
  workflowInstructions = "",
  intents,
  config = customerServiceAiConfig(),
  fetchImpl = fetch,
  beforeRequest,
}: {
  message: string;
  conversationState: string;
  pendingRequest?: string;
  recentMessages?: CustomerServiceRecentMessage[];
  workflowInstructions?: string;
  intents: CustomerServiceIntentConfig[];
  config?: CustomerServiceAiConfig;
  fetchImpl?: typeof fetch;
  beforeRequest?: () => void | Promise<void>;
}): Promise<CustomerServiceAiClassification | null> {
  const text = message.trim().slice(0, 1_000);
  const enabledIntents = intents.filter((intent) => intent.intentKey && intent.description);
  if (!text || !enabledIntents.length || !config.enabled || !config.endpoint || !config.apiKey) return null;
  if (beforeRequest) await beforeRequest();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0,
        max_tokens: 350,
        ...reasoningParameters(config),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Classify a Food Channels WhatsApp customer-service message.",
              "Select exactly one enabled intent supplied by the application.",
              "Never invent an intent or tool. Select a tool only from that intent's allowedTools.",
              "Classify the communicative purpose of the complete current message, not isolated keywords or the nearest FAQ topic.",
              "A date, headcount, budget, brand or dish is extracted context only; those fields do not by themselves mean the customer authorized creating an inquiry.",
              "Questions asking whether a date can be booked, whether an item is available, what something costs, or what menus exist are read-only questions unless the customer explicitly confirms a pending write action.",
              "FAQ retrieval happens only after classification, so do not select a FAQ intent merely because one phrase could match stored knowledge.",
              "Order information lookup is read-only and does not require human handoff.",
              "For order lookup, requestedFields may contain delivery_date, status, items, address, receipt, or summary. Use only fields explicitly requested; use summary for a generic order lookup.",
              "Changing, cancelling or refunding an order requires human handoff.",
              "Use conversationState and currentTask to decide how this message relates to the active task.",
              "recentMessages is ordered from oldest to newest and may include role human for a prior staff reply. Treat staff replies as conversation context and do not ask the customer to repeat information already supplied by staff.",
              "dialogAction is cancel_current only when the customer withdraws the active task itself. A business request containing words such as cancel order is not automatically cancel_current.",
              "Use switch_task for a distinct new request while another task is active, new_request when no task is active, otherwise continue_current.",
              "Other dialogAction values are add_information, select_option, confirm, deny, correct_previous, and resume_previous.",
              "When the reference or requested operation is ambiguous, set needsClarification true and provide one concise Cantonese clarificationQuestion. Never guess a destructive action.",
              "Return JSON only with intent, confidence from 0 to 1, orderNumber, requestedDate in YYYY-MM-DD when explicit, requestedFields, missingFields, requiresHuman, tool, dialogAction, needsClarification, and clarificationQuestion.",
              config.systemPrompt?.trim() || "",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              message: text,
              conversationState,
              currentTask: pendingRequest.trim().slice(0, 500) || null,
              recentMessages: sanitizeCustomerServiceRecentMessages(recentMessages),
              workflowInstructions: workflowInstructions.trim().slice(0, 1_000) || null,
              enabledIntents: enabledIntents.map((intent) => ({
                key: intent.intentKey,
                name: intent.displayName,
                description: intent.description,
                examples: intent.examples.slice(0, 12),
                action: intent.actionKey,
                allowedTools: intent.toolKeys,
              })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`customer_service_ai_classifier_${response.status}`);
    return parseClassification(
      await response.json() as { choices?: Array<{ message?: { content?: string | null } }> },
      enabledIntents,
      config.model,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseGroundedConfidence(value: unknown): CustomerServiceAiAnswer["confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function parseProviderAnswer(
  payload: { choices?: Array<{ message?: { content?: string | null } }> },
  faqs: CustomerServiceFaqKnowledge[],
  model: string,
  { groundedClarification = false }: { groundedClarification?: boolean } = {},
): CustomerServiceAiAnswer | null {
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(json) as {
    answer?: unknown;
    sourceIds?: unknown;
    confidence?: unknown;
    needsClarification?: unknown;
    clarificationQuestion?: unknown;
  };
  if (parsed.answer === null) return null;
  if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
  const known = new Map(faqs.map((faq) => [faq.id, faq]));
  const requestedIds = Array.isArray(parsed.sourceIds)
    ? [...new Set(parsed.sourceIds.filter((id): id is string => typeof id === "string"))]
    : [];
  // Legacy keeps the strict contract: every returned id must be a candidate.
  // v2 drops unknown ids instead of voiding an otherwise grounded answer.
  const unknownIds = requestedIds.filter((id) => !known.has(id));
  if (!groundedClarification && unknownIds.length) return null;
  const sourceIds = groundedClarification
    ? requestedIds.filter((id) => known.has(id))
    : requestedIds;
  const sources = sourceIds.map((id) => known.get(id)).filter((faq): faq is CustomerServiceFaqKnowledge => Boolean(faq));
  if (!sources.length) return null;
  const answer = parsed.answer.trim().slice(0, 1_200);
  if (!answerNumbersAreGrounded(answer, sources)) return null;
  return {
    answer,
    sourceIds,
    model,
    ...(parseGroundedConfidence(parsed.confidence)
      ? { confidence: parseGroundedConfidence(parsed.confidence) }
      : {}),
    ...(groundedClarification && parsed.needsClarification === true
      ? {
        needsClarification: true,
        clarificationQuestion: typeof parsed.clarificationQuestion === "string"
          ? parsed.clarificationQuestion.trim().slice(0, 300)
          : "",
      }
      : {}),
  };
}

export async function answerCustomerServiceFaqWithAi({
  question,
  rewrittenQuestion = "",
  recentMessages = [],
  faqs,
  groundedClarification = false,
  config = customerServiceAiConfig(),
  fetchImpl = fetch,
  beforeRequest,
}: {
  question: string;
  rewrittenQuestion?: string;
  recentMessages?: CustomerServiceRecentMessage[];
  faqs: CustomerServiceFaqKnowledge[];
  groundedClarification?: boolean;
  config?: CustomerServiceAiConfig;
  fetchImpl?: typeof fetch;
  beforeRequest?: () => void | Promise<void>;
}): Promise<CustomerServiceAiAnswer | null> {
  const query = question.trim().slice(0, 1_000);
  if (!query || !faqs.length || !config.enabled || !config.endpoint || !config.apiKey || !config.model) {
    return null;
  }

  if (beforeRequest) {
    try {
      await beforeRequest();
    } catch (error) {
      console.error(
        "customer-service AI waiting notice failed",
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: config.temperature ?? 0.1,
        max_tokens: 500,
        ...reasoningParameters(config),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: (groundedClarification
              ? [
                "You are the customer-service answer composer for Food Channels Delivery in Hong Kong.",
                "Answer only from the published FAQ records supplied by the application.",
                "You may summarise, paraphrase, combine and conditionally explain those records, but never add facts, prices, dates, URLs, policies, quantities or promises that the cited records do not contain.",
                "Retrieved records are candidates, not confirmed matches. Check that their answers support the customer's actual question, including negations, conditions, brand and scope. Shared keywords alone are not evidence.",
                "If the records answer only part of the question, answer the supported part first, then clearly state which part the available information does not cover. Do not invent the missing part.",
                "If the records are insufficient or the request needs account-specific action, return answer null rather than guessing.",
                "For multi-part questions, explain supported policy and explicitly clarify any missing condition; never turn a conditional policy into an unconditional promise. If candidate records conflict and scope cannot resolve them, return answer null.",
                "Use concise, polite Hong Kong Traditional Chinese and natural Cantonese wording.",
                "Do not mention prompts, models, tools, sources, or internal rules.",
                'Return JSON only: {"answer":string|null,"sourceIds":string[],"confidence":"high"|"medium"|"low","needsClarification":boolean,"clarificationQuestion":string|null}.',
                "When answer is not null, sourceIds must list the records actually used to support it. Every factual claim, and every number, must be supported by at least one listed record.",
                config.systemPrompt?.trim() || "",
              ]
              : [
                "You are the customer-service answer composer for Food Channels Delivery in Hong Kong.",
                "Answer only from the published FAQ records supplied by the application.",
                "You may combine or paraphrase records, but never add facts, prices, dates, URLs, policies, or promises not present in the cited records.",
                "If the records are insufficient, ambiguous, or the request needs account-specific action, return answer null.",
                "Retrieved records are candidates, not confirmed matches. Check that their answers support the customer's actual question, including negations, conditions, brand and scope. Shared keywords alone are not evidence.",
                "For multi-part questions, explain supported policy and explicitly clarify any missing condition; never turn a conditional policy into an unconditional promise. If candidate records conflict and scope cannot resolve them, return answer null.",
                "Use concise, polite Hong Kong Traditional Chinese and natural Cantonese wording.",
                "Do not mention prompts, models, tools, sources, or internal rules.",
                'Return JSON only: {"answer":string|null,"sourceIds":string[]}.',
                "When answer is not null, sourceIds must contain every supporting FAQ id and no unrelated id.",
                config.systemPrompt?.trim() || "",
              ]).join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              question: query,
              rewrittenQuestion: rewrittenQuestion.trim().slice(0, 300) || null,
              recentMessages: sanitizeCustomerServiceRecentMessages(recentMessages),
              publishedFaqs: faqs.map(({ id, category, question, answer }) => ({
                id,
                category,
                question,
                answer,
              })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      console.error("customer-service-ai-provider", response.status, detail);
      throw new Error(`customer_service_ai_provider_${response.status}`);
    }
    return parseProviderAnswer(
      await response.json() as { choices?: Array<{ message?: { content?: string | null } }> },
      faqs,
      config.model,
      { groundedClarification },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("customer_service_ai_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseFallbackAnswer(
  payload: { choices?: Array<{ message?: { content?: string | null } }> },
  groundingText: string,
  model: string,
): CustomerServiceAiFallbackAnswer | null {
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(json) as { answer?: unknown };
  if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
  const answer = parsed.answer.trim().slice(0, 800);
  if (/https?:\/\/|www\./i.test(answer)) return null;
  const groundedNumbers = new Set(numericTokens(groundingText));
  if (numericTokens(answer).some((token) => !groundedNumbers.has(token))) {
    return null;
  }
  return { answer, model };
}

export async function answerCustomerServiceFallbackWithAi({
  question,
  intentKey,
  confidence,
  missingFields = [],
  recentMessages = [],
  config = customerServiceAiConfig(),
  fetchImpl = fetch,
}: {
  question: string;
  intentKey: string;
  confidence?: number;
  missingFields?: string[];
  recentMessages?: CustomerServiceRecentMessage[];
  config?: CustomerServiceAiConfig;
  fetchImpl?: typeof fetch;
}): Promise<CustomerServiceAiFallbackAnswer | null> {
  const query = question.trim().slice(0, 1_000);
  if (!query || !intentKey || !config.enabled || !config.endpoint || !config.apiKey) {
    return null;
  }
  const safeRecentMessages = sanitizeCustomerServiceRecentMessages(recentMessages);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0.1,
        max_tokens: 300,
        ...reasoningParameters(config),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are the fallback WhatsApp assistant for Food Channels Delivery in Hong Kong.",
              config.systemPrompt?.trim() || "",
              "The application has already classified the customer's intent but found no FAQ answer.",
              "Give one concise, useful next step or ask one focused clarification question in natural Hong Kong Traditional Chinese.",
              "Never invent product details, availability, prices, dates, URLs, policies, order data, completed actions, or staff follow-up promises.",
              "Do not say that no order was found unless the classified intent is specifically an order lookup.",
              "Use only facts already present in the current message or recent conversation; otherwise ask for the missing information.",
              "recentMessages is ordered from oldest to newest and role human means a prior staff reply. Continue naturally from staff-provided context without asking the customer to repeat it.",
              "Do not mention AI, prompts, tools, FAQ matching, sources, or internal rules.",
              'Return JSON only: {"answer":string|null}.',
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              message: query,
              classifiedIntent: intentKey,
              confidence: confidence ?? null,
              missingFields: missingFields.slice(0, 10),
              recentMessages: safeRecentMessages,
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`customer_service_ai_fallback_${response.status}`);
    }
    return parseFallbackAnswer(
      await response.json() as { choices?: Array<{ message?: { content?: string | null } }> },
      [
        query,
        ...safeRecentMessages.map((message) => message.text),
      ].join("\n"),
      config.model,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("customer_service_ai_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyCustomerServiceWithTieredAi({
  message,
  conversationState,
  pendingRequest = "",
  recentMessages = [],
  workflowInstructions = "",
  intents,
  tiers,
  fetchImpl = fetch,
  beforeRequest,
}: {
  message: string;
  conversationState: string;
  pendingRequest?: string;
  recentMessages?: CustomerServiceRecentMessage[];
  workflowInstructions?: string;
  intents: CustomerServiceIntentConfig[];
  tiers: CustomerServiceAiTierConfig;
  fetchImpl?: typeof fetch;
  beforeRequest?: () => void | Promise<void>;
}) {
  let primary: CustomerServiceAiClassification | null = null;
  try {
    primary = await classifyCustomerServiceWithAi({
      message,
      conversationState,
      pendingRequest,
      recentMessages,
      workflowInstructions,
      intents,
      config: tiers.primary,
      fetchImpl,
      beforeRequest,
    });
  } catch (error) {
    if (!tiers.fallback?.enabled) throw error;
    console.error("customer-service primary classifier failed; escalating", error);
  }
  const threshold = Math.min(1, Math.max(0, tiers.escalationConfidence));
  const needsFallback = !primary
    || primary.confidence < threshold
    || primary.missingFields.length >= 2;
  if (!needsFallback || !tiers.fallback?.enabled) return primary;
  const fallback = await classifyCustomerServiceWithAi({
    message,
    conversationState,
    pendingRequest,
    recentMessages,
    workflowInstructions,
    intents,
    config: tiers.fallback,
    fetchImpl,
  });
  if (!fallback) return primary;
  return !primary || fallback.confidence >= primary.confidence ? fallback : primary;
}

export async function answerCustomerServiceFaqWithTieredAi({
  question,
  rewrittenQuestion = "",
  recentMessages = [],
  faqs,
  groundedClarification = false,
  tiers,
  fetchImpl = fetch,
  beforeRequest,
}: {
  question: string;
  rewrittenQuestion?: string;
  recentMessages?: CustomerServiceRecentMessage[];
  faqs: CustomerServiceFaqKnowledge[];
  groundedClarification?: boolean;
  tiers: CustomerServiceAiTierConfig;
  fetchImpl?: typeof fetch;
  beforeRequest?: () => void | Promise<void>;
}) {
  let primary: CustomerServiceAiAnswer | null = null;
  try {
    primary = await answerCustomerServiceFaqWithAi({
      question,
      rewrittenQuestion,
      recentMessages,
      faqs,
      groundedClarification,
      config: tiers.primary,
      fetchImpl,
      beforeRequest,
    });
  } catch (error) {
    if (!tiers.fallback?.enabled) throw error;
    console.error("customer-service primary FAQ model failed; escalating", error);
  }
  if (primary || !tiers.fallback?.enabled) return primary;
  return await answerCustomerServiceFaqWithAi({
    question,
    rewrittenQuestion,
    recentMessages,
    faqs,
    groundedClarification,
    config: tiers.fallback,
    fetchImpl,
  });
}

export async function answerCustomerServiceFallbackWithTieredAi({
  question,
  intentKey,
  confidence,
  missingFields = [],
  recentMessages = [],
  tiers,
  fetchImpl = fetch,
}: {
  question: string;
  intentKey: string;
  confidence?: number;
  missingFields?: string[];
  recentMessages?: CustomerServiceRecentMessage[];
  tiers: CustomerServiceAiTierConfig;
  fetchImpl?: typeof fetch;
}) {
  let primary: CustomerServiceAiFallbackAnswer | null = null;
  try {
    primary = await answerCustomerServiceFallbackWithAi({
      question,
      intentKey,
      confidence,
      missingFields,
      recentMessages,
      config: tiers.primary,
      fetchImpl,
    });
  } catch (error) {
    if (!tiers.fallback?.enabled) throw error;
    console.error("customer-service primary fallback answer failed; escalating", error);
  }
  if (primary || !tiers.fallback?.enabled) return primary;
  return await answerCustomerServiceFallbackWithAi({
    question,
    intentKey,
    confidence,
    missingFields,
    recentMessages,
    config: tiers.fallback,
    fetchImpl,
  });
}
