import {
  sanitizeCustomerServiceRecentMessages,
  type CustomerServiceRecentMessage,
} from "./customer-service-context.ts";
import {
  customerServiceAiConfig,
  type CustomerServiceAiConfig,
} from "./customer-service-ai.ts";

export type CustomerServiceQueryRewriteIntent =
  | "faq"
  | "follow_up"
  | "clarification"
  | "other";

export type CustomerServiceQueryRewrite = {
  rewrittenQuery: string;
  intentHint: CustomerServiceQueryRewriteIntent;
  usedContext: boolean;
  model: string;
};

function reasoningParameters(config: CustomerServiceAiConfig) {
  if (!/api\.x\.ai/i.test(config.endpoint)) return {};
  const effort = config.reasoningEffort
    ?? (/^grok-4\.3/i.test(config.model) ? "none" : /^grok-4\.5/i.test(config.model) ? "low" : undefined);
  return effort ? { reasoning_effort: effort } : {};
}

function parseQueryRewrite(
  payload: { choices?: Array<{ message?: { content?: string | null } }> },
  question: string,
  model: string,
): CustomerServiceQueryRewrite | null {
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const rawRewrite = typeof parsed.rewritten_query === "string"
    ? parsed.rewritten_query.trim().slice(0, 300)
    : "";
  const rawIntent = typeof parsed.intent_hint === "string" ? parsed.intent_hint : "";
  const intentHint: CustomerServiceQueryRewriteIntent = (
    ["faq", "follow_up", "clarification", "other"] as const
  ).includes(rawIntent as CustomerServiceQueryRewriteIntent)
    ? rawIntent as CustomerServiceQueryRewriteIntent
    : "faq";
  const usedContext = Boolean(parsed.used_context);
  // A clarification request must not invent the missing subject: keep the
  // customer's original wording and only flag the intent.
  if (intentHint === "clarification" || !rawRewrite) {
    return { rewrittenQuery: question, intentHint: "clarification", usedContext: false, model };
  }
  const rewrittenQuery = rawRewrite.length >= 2 ? rawRewrite : question;
  return {
    rewrittenQuery,
    intentHint,
    usedContext: usedContext && rewrittenQuery !== question,
    model,
  };
}

/**
 * Rewrites a WhatsApp customer question into a standalone, retrieval-friendly
 * question using the recent conversation. It resolves pronouns and omitted
 * subjects but never adds business facts. Any failure returns null so callers
 * can fall back to the original query.
 */
export async function rewriteCustomerServiceQuery({
  question,
  recentMessages = [],
  config = customerServiceAiConfig(),
  fetchImpl = fetch,
}: {
  question: string;
  recentMessages?: CustomerServiceRecentMessage[];
  config?: CustomerServiceAiConfig;
  fetchImpl?: typeof fetch;
}): Promise<CustomerServiceQueryRewrite | null> {
  const query = question.trim().slice(0, 1_000);
  if (!query || !config.enabled || !config.endpoint || !config.apiKey || !config.model) {
    return null;
  }
  const safeRecentMessages = sanitizeCustomerServiceRecentMessages(recentMessages, 10);
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
        max_tokens: 200,
        ...reasoningParameters(config),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You rewrite a Hong Kong WhatsApp customer-service question into one standalone retrieval query.",
              "Use the recent conversation only to resolve pronouns, references and omitted subjects such as it, that, this, yesterday, the same one.",
              "Never invent or assume business facts, prices, dates, policies or availability that the customer did not state.",
              "Do not answer the question. Do not add meta instructions such as search the knowledge base.",
              "Keep the customer's language; preserve concrete entities, dish names, brands and order numbers exactly.",
              "If the reference cannot be resolved from the conversation, keep the original wording and set intent_hint to clarification.",
              "intent_hint must be one of: faq, follow_up, clarification, other.",
              "Return JSON only: {\"rewritten_query\":string,\"intent_hint\":string,\"used_context\":boolean}.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              conversation: safeRecentMessages.map((message) => ({
                role: message.role,
                text: message.text,
              })),
              question: query,
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`customer_service_rewrite_${response.status}`);
    return parseQueryRewrite(
      await response.json() as { choices?: Array<{ message?: { content?: string | null } }> },
      query,
      config.model,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("customer_service_rewrite_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
