export type CustomerServiceEmbeddingApiStyle = "openai" | "ark_multimodal";
export type CustomerServiceEmbeddingConfig = {
  enabled: boolean;
  apiStyle: CustomerServiceEmbeddingApiStyle;
  endpoint: string;
  apiKey: string;
  model: string;
  dimensions: number;
  sendDimensions: boolean;
  timeoutMs: number;
  batchSize: number;
  /** Bounded concurrency for independent Ark samples. */
  concurrency?: number;
  /** Retry transient errors only; real-time query embedding overrides to zero. */
  maxRetries?: number;
};
export const CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS = 1024;
export const CUSTOMER_SERVICE_EMBEDDING_INPUT_VERSION = "faq-question-alias-v2";
const MAX_INPUT_CHARS = 6_000;

function env(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}
function flag(name: string, fallback: boolean): boolean {
  const value = env(name).toLowerCase();
  return value === "true" ? true : value === "false" ? false : fallback;
}
function integer(name: string, fallback: number, min: number, max: number): number {
  const text = env(name);
  const n = text ? Number(text) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}
export function customerServiceEmbeddingConfig(): CustomerServiceEmbeddingConfig {
  const dedicatedKey = env("CUSTOMER_SERVICE_EMBEDDING_API_KEY", "ARK_API_KEY");
  const model = env("CUSTOMER_SERVICE_EMBEDDING_MODEL", "ARK_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
  const style = env("CUSTOMER_SERVICE_EMBEDDING_API_STYLE").toLowerCase();
  const apiStyle = style === "ark_multimodal" || (!style && /^doubao/i.test(model)) ? "ark_multimodal" : "openai";
  return {
    enabled: flag("CUSTOMER_SERVICE_EMBEDDING_ENABLED", Boolean(dedicatedKey)),
    apiStyle,
    endpoint: env("CUSTOMER_SERVICE_EMBEDDING_ENDPOINT", "ARK_EMBEDDING_ENDPOINT", "OPENAI_EMBEDDING_ENDPOINT") ||
      (apiStyle === "ark_multimodal" ? "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal" : "https://api.openai.com/v1/embeddings"),
    apiKey: dedicatedKey || env("OPENAI_API_KEY"),
    model,
    dimensions: integer("CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS", CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS, 1, 8192),
    sendDimensions: flag("CUSTOMER_SERVICE_EMBEDDING_SEND_DIMENSIONS", true),
    timeoutMs: integer("CUSTOMER_SERVICE_EMBEDDING_TIMEOUT_MS", 12_000, 2_000, 30_000),
    // Ark's input parts belong to ONE sample, not multiple independent FAQs.
    batchSize: apiStyle === "ark_multimodal" ? 1 : integer("CUSTOMER_SERVICE_EMBEDDING_BATCH_SIZE", 32, 1, 128),
    concurrency: integer("CUSTOMER_SERVICE_EMBEDDING_CONCURRENCY", 3, 1, 5),
    maxRetries: integer("CUSTOMER_SERVICE_EMBEDDING_MAX_RETRIES", 1, 0, 2),
  };
}

export class CustomerServiceEmbeddingError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  constructor(code: string, retryable = false, retryAfterMs: number | null = null) {
    super(code);
    this.name = "CustomerServiceEmbeddingError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
function cleanInput(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_INPUT_CHARS);
}
/** Credentials are intentionally excluded. Endpoint/model/config changes isolate indexes. */
export async function customerServiceEmbeddingProfile(config: CustomerServiceEmbeddingConfig): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([
    config.apiStyle, config.endpoint, config.model, config.dimensions,
    config.sendDimensions, CUSTOMER_SERVICE_EMBEDDING_INPUT_VERSION,
  ]));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function extractEmbeddings(payload: unknown, expected: number, dimensions: number): number[][] {
  const data = payload as { data?: unknown; embeddings?: unknown } | null;
  let rows: Array<{ embedding?: unknown; index?: unknown }>;
  if (Array.isArray(data?.data)) rows = data.data;
  else if (data?.data && typeof data.data === "object" && "embedding" in data.data) rows = [data.data];
  else if (Array.isArray(data?.embeddings)) rows = data.embeddings.map((embedding) => ({ embedding }));
  else rows = [];
  if (rows.length !== expected) throw new CustomerServiceEmbeddingError("customer_service_embedding_count_mismatch");
  if (rows.some((row) => !row || typeof row !== "object")) throw new CustomerServiceEmbeddingError("customer_service_embedding_invalid_row");
  if (rows.some((row) => row.index !== undefined)) {
    const indices = rows.map((row) => row.index);
    if (new Set(indices).size !== expected || indices.some((i) => typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= expected)) {
      throw new CustomerServiceEmbeddingError("customer_service_embedding_index_mismatch");
    }
    rows.sort((a, b) => Number(a.index) - Number(b.index));
  }
  return rows.map((row) => {
    if (!Array.isArray(row.embedding) || row.embedding.length !== dimensions) {
      throw new CustomerServiceEmbeddingError("customer_service_embedding_dimension_mismatch");
    }
    if (row.embedding.some((n) => typeof n !== "number" || !Number.isFinite(n)) || !row.embedding.some((n) => n !== 0)) {
      throw new CustomerServiceEmbeddingError("customer_service_embedding_invalid_vector");
    }
    return row.embedding as number[];
  });
}

type EmbedOptions = {
  config?: CustomerServiceEmbeddingConfig;
  fetchImpl?: typeof fetch;
  /** Whole operation budget, including retries. */
  deadlineAt?: number;
  /** Provider-side retrieval task (Jina v3): retrieval.query or retrieval.passage. */
  task?: string;
};
async function embedBatch(texts: string[], config: CustomerServiceEmbeddingConfig, fetchImpl: typeof fetch, deadlineAt: number, task?: string): Promise<number[][]> {
  const retries = Math.min(2, Math.max(0, Math.trunc(config.maxRetries ?? 0)));
  for (let attempt = 0; ; attempt += 1) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new CustomerServiceEmbeddingError("customer_service_embedding_deadline");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, remaining));
    let failure: CustomerServiceEmbeddingError;
    try {
      const dimensions = config.sendDimensions ? { dimensions: config.dimensions } : {};
      const body = config.apiStyle === "ark_multimodal"
        ? { model: config.model, encoding_format: "float", input: [{ type: "text", text: texts[0] }], ...dimensions }
        : { model: config.model, input: texts, ...dimensions, ...(task ? { task } : {}) };
      const response = await fetchImpl(config.endpoint, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Do not copy provider response bodies/credentials/customer data into logs.
        let retryAfterMs: number | null = null;
        const header = response.headers.get("retry-after");
        if (header) {
          const seconds = Number(header);
          if (Number.isFinite(seconds) && seconds >= 0) retryAfterMs = Math.round(seconds * 1_000);
          else {
            const at = Date.parse(header);
            if (!Number.isNaN(at)) retryAfterMs = Math.max(0, at - Date.now());
          }
        }
        throw new CustomerServiceEmbeddingError(
          `customer_service_embedding_${response.status}`,
          response.status === 429 || response.status >= 500,
          retryAfterMs,
        );
      }
      return extractEmbeddings(await response.json(), texts.length, config.dimensions);
    } catch (error) {
      failure = error instanceof CustomerServiceEmbeddingError ? error
        : new CustomerServiceEmbeddingError(error instanceof Error && error.name === "AbortError"
          ? "customer_service_embedding_timeout" : "customer_service_embedding_transport_error", true);
    } finally { clearTimeout(timeout); }
    if (!failure.retryable || attempt >= retries) throw failure;
    // Honour the provider's Retry-After, otherwise exponential backoff with jitter.
    const base = failure.retryAfterMs !== null
      ? Math.min(5_000, failure.retryAfterMs)
      : Math.min(3_000, 500 * 2 ** attempt);
    const delay = base + Math.floor(Math.random() * 250);
    if (Date.now() + delay >= deadlineAt) throw new CustomerServiceEmbeddingError("customer_service_embedding_deadline");
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function embedCustomerServiceTexts(texts: string[], options: EmbedOptions = {}): Promise<number[][]> {
  const config = options.config ?? customerServiceEmbeddingConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!texts.length) return [];
  if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) throw new CustomerServiceEmbeddingError("customer_service_embedding_not_configured");
  if (!Number.isInteger(config.dimensions) || config.dimensions < 1) throw new CustomerServiceEmbeddingError("customer_service_embedding_dimension_mismatch");
  const inputs = texts.map(cleanInput);
  if (inputs.some((text) => !text)) throw new CustomerServiceEmbeddingError("customer_service_embedding_empty_input");
  const size = config.apiStyle === "ark_multimodal" ? 1 : Math.max(1, Math.min(128, Math.trunc(config.batchSize) || 1));
  const batches = Array.from({ length: Math.ceil(inputs.length / size) }, (_, i) => inputs.slice(i * size, (i + 1) * size));
  const output: number[][][] = new Array(batches.length);
  const deadlineAt = options.deadlineAt ?? Date.now() + 45_000;
  let next = 0;
  let failure: unknown;
  const concurrency = config.apiStyle === "ark_multimodal" ? Math.min(5, Math.max(1, config.concurrency ?? 3)) : 1;
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (!failure) {
      const index = next++;
      if (index >= batches.length) return;
      try { output[index] = await embedBatch(batches[index], config, fetchImpl, deadlineAt, options.task); }
      catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  return output.flat();
}

/** Legacy-compatible best-effort wrapper. New retrieval uses the throwing API for diagnostics. */
export async function embedCustomerServiceQuery(query: string, options: EmbedOptions = {}): Promise<number[] | null> {
  if (!cleanInput(query)) return null;
  try {
    const config = options.config ?? customerServiceEmbeddingConfig();
    const [vector] = await embedCustomerServiceTexts([query], { ...options, config: { ...config, maxRetries: 0 } });
    return vector ?? null;
  } catch (error) {
    console.error("customer-service query embedding failed", error instanceof CustomerServiceEmbeddingError ? error.code : "embedding_error");
    return null;
  }
}
