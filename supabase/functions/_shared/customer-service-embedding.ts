export type CustomerServiceEmbeddingApiStyle = "openai" | "ark_multimodal";

export type CustomerServiceEmbeddingConfig = {
  enabled: boolean;
  apiStyle: CustomerServiceEmbeddingApiStyle;
  endpoint: string;
  apiKey: string;
  model: string;
  dimensions: number;
  /** Send the `dimensions` field. Some providers reject it; disable when needed. */
  sendDimensions: boolean;
  timeoutMs: number;
  batchSize: number;
};

/** Matches the pgvector column and Doubao 1024-d output. */
export const CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS = 1024;

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function boolEnv(name: string, fallback: boolean) {
  const value = Deno.env.get(name)?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(Deno.env.get(name)?.trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** Kept conservative for CJK input across providers. */
const MAX_EMBEDDING_INPUT_CHARS = 6_000;

const ARK_MULTIMODAL_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/embeddings";

export function customerServiceEmbeddingConfig(): CustomerServiceEmbeddingConfig {
  const dedicatedKey = firstEnv(
    "CUSTOMER_SERVICE_EMBEDDING_API_KEY",
    "ARK_API_KEY",
  );
  const apiKey = dedicatedKey || firstEnv("OPENAI_API_KEY");
  const model = firstEnv(
    "CUSTOMER_SERVICE_EMBEDDING_MODEL",
    "ARK_EMBEDDING_MODEL",
    "OPENAI_EMBEDDING_MODEL",
  ) || "text-embedding-3-small";
  const requestedStyle = firstEnv("CUSTOMER_SERVICE_EMBEDDING_API_STYLE").toLowerCase();
  const apiStyle: CustomerServiceEmbeddingApiStyle = requestedStyle === "ark_multimodal"
    ? "ark_multimodal"
    : requestedStyle === "openai"
    ? "openai"
    : /^doubao/i.test(model)
    ? "ark_multimodal"
    : "openai";
  const endpoint = firstEnv(
    "CUSTOMER_SERVICE_EMBEDDING_ENDPOINT",
    "ARK_EMBEDDING_ENDPOINT",
    "OPENAI_EMBEDDING_ENDPOINT",
  ) || (apiStyle === "ark_multimodal" ? ARK_MULTIMODAL_ENDPOINT : OPENAI_ENDPOINT);
  return {
    enabled: boolEnv("CUSTOMER_SERVICE_EMBEDDING_ENABLED", dedicatedKey !== ""),
    apiStyle,
    endpoint,
    apiKey,
    model,
    dimensions: integerEnv(
      "CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS",
      CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS,
      1,
      8192,
    ),
    sendDimensions: boolEnv("CUSTOMER_SERVICE_EMBEDDING_SEND_DIMENSIONS", true),
    timeoutMs: integerEnv("CUSTOMER_SERVICE_EMBEDDING_TIMEOUT_MS", 12_000, 2_000, 30_000),
    batchSize: integerEnv(
      "CUSTOMER_SERVICE_EMBEDDING_BATCH_SIZE",
      apiStyle === "ark_multimodal" ? 10 : 64,
      1,
      128,
    ),
  };
}

function cleanInput(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_EMBEDDING_INPUT_CHARS);
}

function embeddingRequestBody(texts: string[], config: CustomerServiceEmbeddingConfig) {
  const dimensionField = config.dimensions && config.sendDimensions
    ? { dimensions: config.dimensions }
    : {};
  if (config.apiStyle === "ark_multimodal") {
    return {
      model: config.model,
      encoding_format: "float",
      input: texts.map((text) => ({ type: "text", text })),
      ...dimensionField,
    };
  }
  return { model: config.model, input: texts, ...dimensionField };
}

function extractEmbeddings(payload: unknown, expected: number, dimensions: number): number[][] {
  const container = payload as {
    data?: unknown;
    embeddings?: unknown;
  };
  let rows: Array<{ embedding?: unknown; index?: unknown }> = [];
  if (Array.isArray(container?.data)) {
    rows = container.data as Array<{ embedding?: unknown; index?: unknown }>;
  } else if (
    container?.data && typeof container.data === "object" &&
    Array.isArray((container.data as { embedding?: unknown }).embedding)
  ) {
    rows = [container.data as { embedding?: unknown; index?: unknown }];
  } else if (Array.isArray(container?.embeddings)) {
    rows = (container.embeddings as unknown[]).map((embedding) => ({ embedding }));
  }
  if (rows.length !== expected) {
    throw new Error("customer_service_embedding_count_mismatch");
  }
  return rows
    .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
    .map((row) => {
      const embedding = Array.isArray(row.embedding)
        ? row.embedding.filter((value): value is number => typeof value === "number")
        : [];
      if (dimensions && embedding.length !== dimensions) {
        throw new Error("customer_service_embedding_dimension_mismatch");
      }
      return embedding;
    });
}

async function embedBatch(
  texts: string[],
  config: CustomerServiceEmbeddingConfig,
  fetchImpl: typeof fetch,
): Promise<number[][]> {
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
      body: JSON.stringify(embeddingRequestBody(texts, config)),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`customer_service_embedding_${response.status}${detail ? `:${detail}` : ""}`);
    }
    return extractEmbeddings(await response.json(), texts.length, config.dimensions);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("customer_service_embedding_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Embeds texts in provider batches. Throws so callers can decide how to degrade. */
export async function embedCustomerServiceTexts(
  texts: string[],
  {
    config = customerServiceEmbeddingConfig(),
    fetchImpl = fetch,
  }: { config?: CustomerServiceEmbeddingConfig; fetchImpl?: typeof fetch } = {},
): Promise<number[][]> {
  const inputs = texts.map(cleanInput);
  if (!inputs.length) return [];
  if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) {
    throw new Error("customer_service_embedding_not_configured");
  }
  const embeddings: number[][] = [];
  for (let start = 0; start < inputs.length; start += config.batchSize) {
    embeddings.push(...await embedBatch(inputs.slice(start, start + config.batchSize), config, fetchImpl));
  }
  return embeddings;
}

/**
 * Best-effort query embedding for retrieval. Returns null instead of throwing so
 * a provider outage can never break the WhatsApp reply path.
 */
export async function embedCustomerServiceQuery(
  query: string,
  options: { config?: CustomerServiceEmbeddingConfig; fetchImpl?: typeof fetch } = {},
): Promise<number[] | null> {
  const text = cleanInput(query);
  if (!text) return null;
  try {
    const [embedding] = await embedCustomerServiceTexts([text], options);
    return embedding ?? null;
  } catch (error) {
    console.error(
      "customer-service query embedding failed",
      error instanceof Error ? error.message.slice(0, 200) : String(error),
    );
    return null;
  }
}
