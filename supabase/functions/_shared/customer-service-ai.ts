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
};

export type CustomerServiceAiAnswer = {
  answer: string;
  sourceIds: string[];
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
        temperature: config.temperature ?? 0.1,
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
              config.systemPrompt?.trim() || "",
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
