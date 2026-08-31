export type MenuAiCatalogCandidate = {
  id: string;
  sku: string | null;
  name: string;
  channel_id: string | null;
};

export type MenuAiOption = { name: string; quantity: number };

type FetchLike = typeof fetch;

const MENU_AI_CONFIDENCE = 0.86;

function normalized(value: string): string {
  return value
    .toLocaleLowerCase("zh-HK")
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/[「」『』\s，,。、:：;；'\"_-]/g, "");
}

function bigrams(value: string): Set<string> {
  const text = normalized(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}

export function menuNameSimilarity(left: string, right: string): number {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const leftPairs = bigrams(a);
  const rightPairs = bigrams(b);
  let overlap = 0;
  for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1;
  const dice = (2 * overlap) / (leftPairs.size + rightPairs.size || 1);
  const containment = a.includes(b) || b.includes(a)
    ? Math.min(a.length, b.length) / Math.max(a.length, b.length)
    : 0;
  return Math.max(dice, containment);
}

export function shortlistMenuCatalogCandidates(input: {
  optionName: string;
  catalog: MenuAiCatalogCandidate[];
  channelId: string;
  limit?: number;
}): MenuAiCatalogCandidate[] {
  return input.catalog
    .map((row) => ({
      row,
      score: menuNameSimilarity(input.optionName, row.name) +
        (row.channel_id === input.channelId ? 0.08 : 0),
    }))
    .filter(({ score }) => score >= 0.18)
    .sort((left, right) => right.score - left.score || left.row.name.localeCompare(right.row.name, "zh-HK"))
    .slice(0, input.limit ?? 8)
    .map(({ row }) => row);
}

function grokConfig() {
  const apiKey = Deno.env.get("XAI_API_KEY") ?? Deno.env.get("SUPPLIER_QUOTE_AI_API_KEY") ?? "";
  return {
    apiKey,
    endpoint: Deno.env.get("SHOPIFY_MENU_AI_ENDPOINT") ??
      Deno.env.get("SUPPLIER_QUOTE_AI_ENDPOINT") ??
      "https://api.x.ai/v1/chat/completions",
    model: Deno.env.get("SHOPIFY_MENU_AI_MODEL") ??
      Deno.env.get("SUPPLIER_QUOTE_AI_MODEL") ??
      "grok-4.6",
    timeoutMs: Math.max(1_000, Number(Deno.env.get("SHOPIFY_MENU_AI_TIMEOUT_MS") ?? 12_000)),
  };
}

async function callGrokJson(input: {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  payload: unknown;
  fetchImpl?: FetchLike;
}): Promise<Record<string, unknown> | null> {
  const config = grokConfig();
  if (!config.apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await (input.fetchImpl ?? fetch)(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        reasoning_effort: "low",
        stream: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: JSON.stringify(input.payload) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity"],
        properties: {
          name: { type: "string" },
          quantity: { type: "number", minimum: 0.001 },
        },
      },
    },
  },
} as const;

export async function parseMenuTextWithGrok(
  sourceText: string,
  fetchImpl?: FetchLike,
): Promise<MenuAiOption[] | null> {
  const result = await callGrokJson({
    schemaName: "shopify_menu_items",
    schema: PARSE_SCHEMA,
    system: "Split the supplied Traditional Chinese Shopify catering selection into ordered dishes. Commas inside parentheses describe one platter and must not split it. A weight or piece count inside parentheses is part of the dish name, not the ordered quantity. Preserve every dish name exactly as a contiguous substring of sourceText. Return no commentary and never invent text.",
    payload: { sourceText },
    fetchImpl,
  });
  if (!result || !Array.isArray(result.items)) return null;
  const items = result.items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const name = String((value as { name?: unknown }).name ?? "").trim();
    const quantity = Number((value as { quantity?: unknown }).quantity);
    if (!name || !sourceText.includes(name) || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ name, quantity }];
  });
  return items.length === result.items.length && items.length ? items : null;
}

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["optionIndex", "candidateId", "confidence"],
        properties: {
          optionIndex: { type: "integer", minimum: 0 },
          candidateId: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

export async function matchMenuOptionsWithGrok(input: {
  optionNames: string[];
  catalog: MenuAiCatalogCandidate[];
  channelId: string;
  fetchImpl?: FetchLike;
}): Promise<Map<number, MenuAiCatalogCandidate>> {
  const candidates = input.optionNames.map((optionName, optionIndex) => ({
    optionIndex,
    optionName,
    candidates: shortlistMenuCatalogCandidates({
      optionName,
      catalog: input.catalog,
      channelId: input.channelId,
    }).map(({ id, sku, name }) => ({ id, sku, name })),
  }));
  if (!candidates.some((row) => row.candidates.length)) return new Map();
  const result = await callGrokJson({
    schemaName: "shopify_menu_catalog_matches",
    schema: MATCH_SCHEMA,
    system: "Match each Shopify catering dish to the same real catalog product, allowing reordered words and small wording differences. Choose only an id listed for that option. Use null when it is not clearly the same dish. Confidence must reflect certainty; never force a match.",
    payload: { options: candidates },
    fetchImpl: input.fetchImpl,
  });
  if (!result || !Array.isArray(result.matches)) return new Map();

  const resolved = new Map<number, MenuAiCatalogCandidate>();
  for (const value of result.matches) {
    if (!value || typeof value !== "object") continue;
    const row = value as { optionIndex?: unknown; candidateId?: unknown; confidence?: unknown };
    const optionIndex = Number(row.optionIndex);
    const confidence = Number(row.confidence);
    if (!Number.isInteger(optionIndex) || confidence < MENU_AI_CONFIDENCE || typeof row.candidateId !== "string") continue;
    const allowed = candidates[optionIndex]?.candidates.find((candidate) => candidate.id === row.candidateId);
    const catalogRow = allowed && input.catalog.find((candidate) => candidate.id === allowed.id);
    if (catalogRow) resolved.set(optionIndex, catalogRow);
  }
  return resolved;
}
