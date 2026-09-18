export type CustomerServiceVisionInput = {
  imageUrl: string;
  caption?: string | null;
  providerMessageId?: string | null;
};

export type CustomerServiceVisionResult = {
  mediaKind:
    | "menu_product"
    | "order_screenshot"
    | "payment_proof"
    | "food_complaint"
    | "address_document"
    | "other"
    | "unclear";
  extractedText: string;
  entities: {
    orderNumber?: string | null;
    productNames?: string[];
    prices?: string[];
    dates?: string[];
  };
  summary: string;
  confidence: number;
  needsHuman: boolean;
  reason: string;
  model?: string | null;
};

type VisionConfig = {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxBytes: number;
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function config(): VisionConfig {
  const explicitEnabled = env("CUSTOMER_SERVICE_VISION_ENABLED");
  const endpoint =
    env("CUSTOMER_SERVICE_VISION_ENDPOINT") || "https://api.x.ai/v1/responses";
  return {
    enabled: explicitEnabled
      ? explicitEnabled.toLowerCase() === "true"
      : env("CUSTOMER_SERVICE_AI_ENABLED").toLowerCase() === "true",
    endpoint,
    apiKey:
      env("CUSTOMER_SERVICE_VISION_API_KEY") ||
      env("XAI_API_KEY") ||
      env("CUSTOMER_SERVICE_AI_API_KEY"),
    model:
      env("CUSTOMER_SERVICE_VISION_MODEL") ||
      env("CUSTOMER_SERVICE_AI_MODEL") ||
      "grok-4.6",
    timeoutMs: Math.min(
      Math.max(
        Number(env("CUSTOMER_SERVICE_VISION_TIMEOUT_MS")) || 15_000,
        3_000,
      ),
      30_000,
    ),
    maxBytes: Math.min(
      Math.max(
        Number(env("CUSTOMER_SERVICE_VISION_MAX_BYTES")) || 10 * 1024 * 1024,
        256 * 1024,
      ),
      10 * 1024 * 1024,
    ),
  };
}

function normalizeKind(
  value: unknown,
): CustomerServiceVisionResult["mediaKind"] {
  const allowed: CustomerServiceVisionResult["mediaKind"][] = [
    "menu_product",
    "order_screenshot",
    "payment_proof",
    "food_complaint",
    "address_document",
    "other",
    "unclear",
  ];
  return typeof value === "string" &&
    allowed.includes(value as CustomerServiceVisionResult["mediaKind"])
    ? (value as CustomerServiceVisionResult["mediaKind"])
    : "unclear";
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson(content: string) {
  const candidate = content.match(/\{[\s\S]*\}/)?.[0] || content;
  return JSON.parse(candidate) as Record<string, unknown>;
}

function asDataUrl(bytes: Uint8Array, contentType: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)),
    );
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function fetchImage(imageUrl: string, maxBytes: number) {
  const response = await fetch(imageUrl);
  if (!response.ok)
    throw new Error(`vision_image_download_failed:${response.status}`);
  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/"))
    throw new Error(
      `vision_image_type_not_allowed:${contentType || "unknown"}`,
    );
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new Error("vision_image_too_large");
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length > maxBytes) throw new Error("vision_image_too_large");
  return { contentType, dataUrl: asDataUrl(body, contentType) };
}

export async function analyzeCustomerServiceImage(
  input: CustomerServiceVisionInput,
): Promise<CustomerServiceVisionResult | null> {
  const settings = config();
  if (
    !settings.enabled ||
    !settings.endpoint ||
    !settings.apiKey ||
    !input.imageUrl
  )
    return null;
  const image = await fetchImage(input.imageUrl, settings.maxBytes);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.model,
        store: false,
        temperature: 0,
        max_output_tokens: 500,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "You analyze a customer image for a Hong Kong catering WhatsApp service.",
                  "Read visible text but do not invent text, prices, order status, payment success, or business policies.",
                  "Classify the image as menu_product, order_screenshot, payment_proof, food_complaint, address_document, other, or unclear.",
                  "Any order, payment, address, or complaint image must set needsHuman true.",
                  "Return JSON only with mediaKind, extractedText, entities, summary, confidence, needsHuman, and reason.",
                  "Keep extractedText and summary concise. Do not reveal sensitive data in summary beyond what is needed for internal handling.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Customer caption: ${(input.caption || "").trim().slice(0, 500)}`,
              },
              { type: "input_image", image_url: image.dataUrl, detail: "high" },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => ""))
        .replace(/\s+/g, " ")
        .slice(0, 200);
      throw new Error(`vision_provider_${response.status}:${detail}`);
    }
    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const responseText = payload.output
      ?.flatMap((item) => item.content || [])
      .find(
        (item) => item.type === "output_text" || typeof item.text === "string",
      )?.text;
    const content = (
      payload.output_text ||
      responseText ||
      payload.choices?.[0]?.message?.content ||
      ""
    ).trim();
    if (!content) return null;
    const parsed = parseJson(content);
    const mediaKind = normalizeKind(parsed.mediaKind);
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
    const entities =
      parsed.entities && typeof parsed.entities === "object"
        ? (parsed.entities as Record<string, unknown>)
        : {};
    const result: CustomerServiceVisionResult = {
      mediaKind,
      extractedText: cleanText(parsed.extractedText, 2_000),
      entities: {
        orderNumber: cleanText(entities.orderNumber, 100) || null,
        productNames: Array.isArray(entities.productNames)
          ? entities.productNames
              .filter((item): item is string => typeof item === "string")
              .slice(0, 10)
          : [],
        prices: Array.isArray(entities.prices)
          ? entities.prices
              .filter((item): item is string => typeof item === "string")
              .slice(0, 10)
          : [],
        dates: Array.isArray(entities.dates)
          ? entities.dates
              .filter((item): item is string => typeof item === "string")
              .slice(0, 10)
          : [],
      },
      summary: cleanText(parsed.summary, 800),
      confidence,
      needsHuman:
        Boolean(parsed.needsHuman) ||
        [
          "order_screenshot",
          "payment_proof",
          "food_complaint",
          "address_document",
        ].includes(mediaKind) ||
        confidence < 0.65,
      reason: cleanText(parsed.reason, 300),
      model: settings.model,
    };
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
