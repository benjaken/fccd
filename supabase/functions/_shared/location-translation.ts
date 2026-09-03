export type LocationTranslationKind = "address" | "district";

/** Fast xAI model for one-line HK address translation. Do not inherit grok-4.6. */
export const DEFAULT_ADDRESS_TRANSLATION_MODEL = "grok-4.3";
const ADDRESS_TRANSLATION_MAX_TOKENS = 400;

function env(primary: string, report: string, supplier: string) {
  return Deno.env.get(primary) ?? Deno.env.get(report) ?? Deno.env.get(supplier) ?? "";
}

function translationModel() {
  const dedicated = Deno.env.get("ADDRESS_TRANSLATION_AI_MODEL")?.trim();
  if (dedicated) return dedicated;
  // Report / supplier quote AI uses grok-4.6 with reasoning. That path takes
  // ~14s for a single address, so translation stays on a non-reasoning model.
  return DEFAULT_ADDRESS_TRANSLATION_MODEL;
}

export function containsEnglishText(value: string | null | undefined) {
  return /[A-Za-z]/.test(String(value ?? ""));
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
  const provider = env("ADDRESS_TRANSLATION_AI_PROVIDER", "REPORT_AI_PROVIDER", "SUPPLIER_QUOTE_AI_PROVIDER");
  const enabled = env("ADDRESS_TRANSLATION_AI_ENABLED", "REPORT_AI_ENABLED", "SUPPLIER_QUOTE_AI_ENABLED") === "true";
  if (!enabled || !endpoint || !apiKey || !model) throw new Error("location_translation_disabled");

  const isXai = ["xai", "grok"].includes(provider.toLowerCase()) ||
    /api\.x\.ai\/v1\/chat\/completions/i.test(endpoint);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const subject = kind === "district" ? "Hong Kong delivery district" : "Hong Kong delivery address";
  const messages = [
    {
      role: "system",
      content: `Translate the supplied ${subject} into Traditional Chinese suitable for Hong Kong. Use established Traditional Chinese names for districts, streets, estates, buildings, and landmarks whenever known. Preserve every number, room, floor, block, postal code, and delivery instruction. Do not add, infer, or remove location details. Return one JSON object only: {"translatedText":string}.`,
    },
    { role: "user", content: JSON.stringify({ text: source }) },
  ];
  const providerRequests = [
    {
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: ADDRESS_TRANSLATION_MAX_TOKENS,
      ...(isXai ? { reasoning_effort: "none" } : { thinking: { type: "disabled" } }),
      messages,
    },
    // Some models reject one or more optional generation controls with 400.
    // Retry once with the portable Chat Completions subset before failing.
    { model, max_tokens: ADDRESS_TRANSLATION_MAX_TOKENS, messages },
  ];
  try {
    for (let attempt = 0; attempt < providerRequests.length; attempt += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(providerRequests[attempt]),
      });
      if (!response.ok) {
        const providerError = (await response.text().catch(() => ""))
          .replaceAll(/\s+/g, " ").slice(0, 500);
        if (response.status === 400 && attempt === 0) continue;
        console.error("location-translation-provider", response.status, providerError);
        throw new Error(`location_translation_provider_${response.status}`);
      }
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("location_translation_empty_response");
      const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
      const parsed = JSON.parse(json) as { translatedText?: unknown };
      if (typeof parsed.translatedText !== "string" || !parsed.translatedText.trim()) {
        throw new Error("location_translation_invalid_response");
      }
      console.log("location-translation", {
        model,
        kind,
        attempt: attempt + 1,
        elapsedMs: Date.now() - startedAt,
      });
      return parsed.translatedText.trim();
    }
    throw new Error("location_translation_provider_failed");
  } finally {
    clearTimeout(timeout);
  }
}
