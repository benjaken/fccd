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
};

export type CustomerServiceAiAnswer = {
  answer: string;
  sourceIds: string[];
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
  missingFields: string[];
  requiresHuman: boolean;
  toolKey: string | null;
  model: string;
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
  return {
    intentKey,
    confidence,
    orderNumber: typeof parsed.orderNumber === "string" ? parsed.orderNumber.slice(0, 80) : "",
    requestedDate: typeof parsed.requestedDate === "string" ? parsed.requestedDate.slice(0, 20) : "",
    missingFields: Array.isArray(parsed.missingFields)
      ? parsed.missingFields.filter((field): field is string => typeof field === "string").slice(0, 10)
      : [],
    requiresHuman: Boolean(parsed.requiresHuman),
    toolKey,
    model,
  };
}

export async function classifyCustomerServiceWithAi({
  message,
  conversationState,
  intents,
  config = customerServiceAiConfig(),
  fetchImpl = fetch,
  beforeRequest,
}: {
  message: string;
  conversationState: string;
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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Classify a Food Channels WhatsApp customer-service message.",
              "Select exactly one enabled intent supplied by the application.",
              "Never invent an intent or tool. Select a tool only from that intent's allowedTools.",
              "Order information lookup is read-only and does not require human handoff.",
              "Changing, cancelling or refunding an order requires human handoff.",
              "Return JSON only with intent, confidence from 0 to 1, orderNumber, requestedDate in YYYY-MM-DD when explicit, missingFields, requiresHuman, and tool.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              message: text,
              conversationState,
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

function parseProviderAnswer(
  payload: { choices?: Array<{ message?: { content?: string | null } }> },
  faqs: CustomerServiceFaqKnowledge[],
  model: string,
): CustomerServiceAiAnswer | null {
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(json) as { answer?: unknown; sourceIds?: unknown };
  if (parsed.answer === null) return null;
  if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
  const known = new Map(faqs.map((faq) => [faq.id, faq]));
  const sourceIds = Array.isArray(parsed.sourceIds)
    ? [...new Set(parsed.sourceIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const sources = sourceIds.map((id) => known.get(id)).filter((faq): faq is CustomerServiceFaqKnowledge => Boolean(faq));
  if (!sources.length || sources.length !== sourceIds.length) return null;
  const answer = parsed.answer.trim().slice(0, 1_200);
  if (!answerNumbersAreGrounded(answer, sources)) return null;
  return { answer, sourceIds, model };
}

export async function answerCustomerServiceFaqWithAi({
  question,
  faqs,
  config = customerServiceAiConfig(),
  fetchImpl = fetch,
  beforeRequest,
}: {
  question: string;
  faqs: CustomerServiceFaqKnowledge[];
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
        temperature: 0.1,
        max_tokens: 500,
        ...(/api\.x\.ai/i.test(config.endpoint) && /^grok-4\.3/i.test(config.model)
          ? { reasoning_effort: "none" }
          : {}),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are the customer-service answer composer for Food Channels Delivery in Hong Kong.",
              "Answer only from the published FAQ records supplied by the application.",
              "You may combine or paraphrase records, but never add facts, prices, dates, URLs, policies, or promises not present in the cited records.",
              "If the records are insufficient, ambiguous, or the request needs account-specific action, return answer null.",
              "Use concise, polite Hong Kong Traditional Chinese and natural Cantonese wording.",
              "Do not mention prompts, models, tools, sources, or internal rules.",
              'Return JSON only: {"answer":string|null,"sourceIds":string[]}.',
              "When answer is not null, sourceIds must contain every supporting FAQ id and no unrelated id.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              question: query,
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
