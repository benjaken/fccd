export type LocationTranslationKind = "address" | "district";

/** Dedicated xAI non-reasoning model. One-line HK address translation must not inherit grok-4.6. */
export const DEFAULT_ADDRESS_TRANSLATION_MODEL = "grok-4.20-non-reasoning";
const ADDRESS_TRANSLATION_MAX_TOKENS = 400;
const ADDRESS_TRANSLATION_ATTEMPT_TIMEOUT_MS = 8_000;

function env(primary: string, report: string, supplier: string) {
  return Deno.env.get(primary) ?? Deno.env.get(report) ?? Deno.env.get(supplier) ?? "";
}

function isForcedReasoningModel(model: string) {
  if (/non-reasoning/i.test(model)) return false;
  return /grok-4\.6|grok-4\.5|grok-4\.20.*reasoning/i.test(model);
}

function usesReasoningEffortNone(model: string) {
  return /^grok-4\.3/i.test(model);
}

function translationModel() {
  const dedicated = Deno.env.get("ADDRESS_TRANSLATION_AI_MODEL")?.trim()
    || env("ADDRESS_TRANSLATION_AI_MODEL", "REPORT_AI_MODEL", "SUPPLIER_QUOTE_AI_MODEL").trim();
  // grok-4.6 cannot disable reasoning (defaults to high). A dedicated
  // ADDRESS_TRANSLATION_AI_MODEL=grok-4.6 secret previously made translation
  // take ~24s (12s timeout then a second 12s attempt).
  if (dedicated && !isForcedReasoningModel(dedicated)) return dedicated;
  return DEFAULT_ADDRESS_TRANSLATION_MODEL;
}

export function containsEnglishText(value: string | null | undefined) {
  return /[A-Za-z]/.test(String(value ?? ""));
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return name === "AbortError" || /signal has been aborted/i.test(message);
}

async function postChatCompletion(
  endpoint: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseTranslatedText(payload: {
  choices?: Array<{ message?: { content?: string | null } }>;
}) {
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("location_translation_empty_response");
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(json) as { translatedText?: unknown };
  if (typeof parsed.translatedText !== "string" || !parsed.translatedText.trim()) {
    throw new Error("location_translation_invalid_response");
  }
  return parsed.translatedText.trim();
}

function providerRequest(
  model: string,
  messages: Array<{ role: string; content: string }>,
  extra: Record<string, unknown> = {},
) {
  return {
    model,
    max_tokens: ADDRESS_TRANSLATION_MAX_TOKENS,
    stream: false,
    ...(usesReasoningEffortNone(model) ? { reasoning_effort: "none" } : {}),
    ...extra,
    messages,
  };
}

export async function translateLocationToTraditionalChinese(
  text: string,
  kind: LocationTranslationKind,
) {
  const source = text.trim();
  if (!source || !containsEnglishText(source)) return source;

  const endpoint = env("ADDRESS_TRANSLATION_AI_ENDPOINT", "REPORT_AI_ENDPOINT", "SUPPLIER_QUOTE_AI_ENDPOINT");
  const apiKey = Deno.env.get("ADDRESS_TRANSLATION_AI_API_KEY") ??
    Deno.env.get("REPORT_AI_API_KEY") ?? Deno.env.get("XAI_API_KEY") ??
    Deno.env.get("SUPPLIER_QUOTE_AI_API_KEY") ?? "";
  const model = translationModel();
  const enabled = env("ADDRESS_TRANSLATION_AI_ENABLED", "REPORT_AI_ENABLED", "SUPPLIER_QUOTE_AI_ENABLED") === "true";
  if (!enabled || !endpoint || !apiKey || !model) throw new Error("location_translation_disabled");

  const startedAt = Date.now();
  const subject = kind === "district" ? "Hong Kong delivery district" : "Hong Kong delivery address";
  const messages = [
    {
      role: "system",
      content: `Translate the supplied ${subject} into Traditional Chinese suitable for Hong Kong. Use established Traditional Chinese names for districts, streets, estates, buildings, and landmarks whenever known. Preserve every number, room, floor, block, postal code, and delivery instruction. Do not add, infer, or remove location details. Return one JSON object only: {"translatedText":string}.`,
    },
    { role: "user", content: JSON.stringify({ text: source }) },
  ];
  const providerRequests = [
    providerRequest(model, messages, {
      response_format: { type: "json_object" },
      temperature: 0,
    }),
    providerRequest(model, messages),
  ];

  for (let attempt = 0; attempt < providerRequests.length; attempt += 1) {
    try {
      const response = await postChatCompletion(
        endpoint,
        apiKey,
        providerRequests[attempt],
        ADDRESS_TRANSLATION_ATTEMPT_TIMEOUT_MS,
      );
      if (!response.ok) {
        const providerError = (await response.text().catch(() => ""))
          .replaceAll(/\s+/g, " ").slice(0, 500);
        if (response.status === 400 && attempt === 0) continue;
        console.error("location-translation-provider", response.status, providerError);
        throw new Error(`location_translation_provider_${response.status}`);
      }
      const translatedText = parseTranslatedText(
        await response.json() as { choices?: Array<{ message?: { content?: string | null } }> },
      );
      console.log("location-translation", {
        model,
        kind,
        attempt: attempt + 1,
        elapsedMs: Date.now() - startedAt,
      });
      return translatedText;
    } catch (error) {
      if (isAbortError(error)) throw new Error("location_translation_timeout");
      throw error;
    }
  }
  throw new Error("location_translation_provider_failed");
}
