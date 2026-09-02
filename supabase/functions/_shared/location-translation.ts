export type LocationTranslationKind = "address" | "district";

function env(primary: string, report: string, supplier: string) {
  return Deno.env.get(primary) ?? Deno.env.get(report) ?? Deno.env.get(supplier) ?? "";
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
  const apiKey = env("ADDRESS_TRANSLATION_AI_API_KEY", "REPORT_AI_API_KEY", "SUPPLIER_QUOTE_AI_API_KEY") ||
    Deno.env.get("XAI_API_KEY") || "";
  const model = env("ADDRESS_TRANSLATION_AI_MODEL", "REPORT_AI_MODEL", "SUPPLIER_QUOTE_AI_MODEL");
  const provider = env("ADDRESS_TRANSLATION_AI_PROVIDER", "REPORT_AI_PROVIDER", "SUPPLIER_QUOTE_AI_PROVIDER");
  const enabled = env("ADDRESS_TRANSLATION_AI_ENABLED", "REPORT_AI_ENABLED", "SUPPLIER_QUOTE_AI_ENABLED") === "true";
  if (!enabled || !endpoint || !apiKey || !model) throw new Error("location_translation_disabled");

  const isXai = ["xai", "grok"].includes(provider.toLowerCase()) ||
    /api\.x\.ai\/v1\/chat\/completions/i.test(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const subject = kind === "district" ? "Hong Kong delivery district" : "Hong Kong delivery address";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 600,
        ...(isXai ? { reasoning_effort: "low" } : { thinking: { type: "disabled" } }),
        messages: [
          {
            role: "system",
            content: `Translate the supplied ${subject} into Traditional Chinese suitable for Hong Kong. Use established Traditional Chinese names for districts, streets, estates, buildings, and landmarks whenever known. Preserve every number, room, floor, block, postal code, and delivery instruction. Do not add, infer, or remove location details. Return one JSON object only: {"translatedText":string}.`,
          },
          { role: "user", content: JSON.stringify({ text: source }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`location_translation_provider_${response.status}`);
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("location_translation_empty_response");
    const parsed = JSON.parse(content) as { translatedText?: unknown };
    if (typeof parsed.translatedText !== "string" || !parsed.translatedText.trim()) {
      throw new Error("location_translation_invalid_response");
    }
    return parsed.translatedText.trim();
  } finally {
    clearTimeout(timeout);
  }
}
