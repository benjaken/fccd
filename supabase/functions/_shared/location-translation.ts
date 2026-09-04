export type LocationTranslationKind = "address" | "district";

/** Fast enough for a one-line address, and able to translate place names. Do not inherit grok-4.6. */
export const DEFAULT_ADDRESS_TRANSLATION_MODEL = "grok-4.3";
const QUALITY_RETRY_MODEL = "grok-4.3";
const ADDRESS_TRANSLATION_MAX_TOKENS = 160;
const ADDRESS_TRANSLATION_ATTEMPT_TIMEOUT_MS = 8_000;
const KEEP_ENGLISH_WORDS = new Set([
  "unit", "rm", "room", "flat", "fl", "blk", "block", "phase", "twr", "tower", "no", "nos",
]);

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
  if (dedicated && !isForcedReasoningModel(dedicated)) return dedicated;
  return DEFAULT_ADDRESS_TRANSLATION_MODEL;
}

export function containsEnglishText(value: string | null | undefined) {
  return /[A-Za-z]/.test(String(value ?? ""));
}

/** True when English street/building/district names remain (unit/floor codes are allowed). */
export function hasUntranslatedEnglish(value: string | null | undefined) {
  const stripped = String(value ?? "")
    .replace(/\b(?:unit|rm|room|flat|blk|block)[-\s]?\d+[A-Za-z]?\b/gi, " ")
    .replace(/\b\d+\s*\/\s*[Ff]\b/g, " ")
    .replace(/\b\d+[A-Za-z]\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^\p{L}\s]/gu, " ");
  return stripped.split(/\s+/).some((word) => (
    /^[A-Za-z]{3,}$/.test(word) && !KEEP_ENGLISH_WORDS.has(word.toLowerCase())
  ));
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
  priority = false,
) {
  return {
    model,
    max_tokens: ADDRESS_TRANSLATION_MAX_TOKENS,
    stream: false,
    ...(priority ? { service_tier: "priority" } : {}),
    ...(usesReasoningEffortNone(model) ? { reasoning_effort: "none" } : {}),
    ...extra,
    messages,
  };
}

function translationMessages(source: string, kind: LocationTranslationKind, incompleteHint?: string) {
  const subject = kind === "district" ? "Hong Kong delivery district" : "Hong Kong delivery address";
  return [
    {
      role: "system",
      content: [
        `Translate the supplied ${subject} into Hong Kong Traditional Chinese.`,
        "Translate every English place name: streets, buildings, estates, malls, districts, Kowloon, Hong Kong, and New Territories.",
        "Keep only numbers and unit/room/floor/block codes such as 1010B, 10/F, or No.4.",
        "Do not prepend a Chinese district while leaving the original English address.",
        "Do not add, infer, or remove location details.",
        'Return one JSON object only: {"translatedText":string}.',
        'Example: {"text":"Unit1010B, 10/F, Heng Ngai Jewelry Centre, No.4 Hok Yuen Street East, Hunghom, Kowloon, Hong Kong"} → {"translatedText":"香港九龍紅磡鶴園東街4號恆藝珠寶中心10樓1010B室"}.',
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(incompleteHint
        ? { text: source, previousResultWasIncomplete: incompleteHint }
        : { text: source }),
    },
  ];
}

async function completeTranslation(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
) {
  const usePriority = /api\.x\.ai/i.test(endpoint);
  const requests = [
    providerRequest(model, messages, {
      response_format: { type: "json_object" },
      temperature: 0,
    }, usePriority),
    // Keep the compatibility retry portable. If an OpenAI-compatible endpoint
    // rejects structured output or xAI priority, retry with the minimum body.
    providerRequest(model, messages),
  ];
  for (let attempt = 0; attempt < requests.length; attempt += 1) {
    try {
      const response = await postChatCompletion(
        endpoint,
        apiKey,
        requests[attempt],
        ADDRESS_TRANSLATION_ATTEMPT_TIMEOUT_MS,
      );
      if (!response.ok) {
        const providerError = (await response.text().catch(() => ""))
          .replaceAll(/\s+/g, " ").slice(0, 500);
        if (response.status === 400 && attempt === 0) continue;
        console.error("location-translation-provider", response.status, providerError);
        throw new Error(`location_translation_provider_${response.status}`);
      }
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string | null } }>;
        service_tier?: unknown;
      };
      return {
        translatedText: parseTranslatedText(payload),
        attempt: attempt + 1,
        serviceTier: typeof payload.service_tier === "string" ? payload.service_tier : "default",
      };
    } catch (error) {
      if (isAbortError(error)) throw new Error("location_translation_timeout");
      throw error;
    }
  }
  throw new Error("location_translation_provider_failed");
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
  let usedModel = model;
  let result = await completeTranslation(endpoint, apiKey, model, translationMessages(source, kind));

  if (hasUntranslatedEnglish(result.translatedText)) {
    console.warn("location-translation-incomplete", {
      model,
      sample: result.translatedText.slice(0, 160),
    });
    usedModel = QUALITY_RETRY_MODEL;
    result = await completeTranslation(
      endpoint,
      apiKey,
      QUALITY_RETRY_MODEL,
      translationMessages(source, kind, result.translatedText),
    );
  }

  console.log("location-translation", {
    model: usedModel,
    kind,
    attempt: result.attempt,
    serviceTier: result.serviceTier,
    incomplete: hasUntranslatedEnglish(result.translatedText),
    elapsedMs: Date.now() - startedAt,
  });
  return result.translatedText;
}
