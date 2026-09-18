export type CustomerServiceRagConfig = {
  /** Master switch for the RAG v2 retrieval/answer pipeline. */
  enableRagV2: boolean;
  /** Resolve pronouns/ellipsis before FAQ retrieval. */
  enableQueryRewrite: boolean;
  /** Allow partial grounded answers that state the missing part. */
  enableGroundedClarification: boolean;
  /** Conversation rounds supplied to rewrite and answer composition. */
  contextRounds: number;
  /** Lexical candidates fetched before fusion. */
  lexicalTopK: number;
  /** Semantic candidates fetched before fusion. */
  vectorTopK: number;
  /** Final candidate count handed to rerank/answer composition. */
  finalTopK: number;
  /** Reciprocal rank fusion constant. */
  rrfK: number;
  /** RRF weight for the semantic ranking. */
  vectorWeight: number;
  /** RRF weight for the lexical ranking. */
  lexicalWeight: number;
  /** Minimum cosine similarity for a semantic candidate. */
  vectorThreshold: number;
};

function envFlag(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim().toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

function envNumber(...names: string[]) {
  for (const name of names) {
    const value = Number(Deno.env.get(name)?.trim());
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function flagValue(raw: unknown, fallback: boolean) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.trim().toLowerCase() === "true") return true;
    if (raw.trim().toLowerCase() === "false") return false;
  }
  return fallback;
}

function numberValue(raw: unknown, fallback: number, min: number, max: number) {
  const candidate = typeof raw === "number"
    ? raw
    : typeof raw === "string" && raw.trim() !== ""
    ? Number(raw)
    : NaN;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.min(max, Math.max(min, candidate));
}

/**
 * Reads RAG feature flags from an active config row's `rag_config` JSONB,
 * falling back to environment variables and, finally, to safe defaults.
 * Retrieval stays off unless the master switch (or an explicit flag) is set.
 */
export function customerServiceRagConfig(
  active?: { rag_config?: unknown; retrieval_limit?: number } | null,
): CustomerServiceRagConfig {
  const raw = active?.rag_config && typeof active.rag_config === "object"
    ? active.rag_config as Record<string, unknown>
    : {};
  const enableRagV2 = flagValue(
    raw.enable_rag_v2,
    envFlag("CUSTOMER_SERVICE_RAG_V2") ?? false,
  );
  const enableQueryRewrite = flagValue(
    raw.enable_query_rewrite,
    envFlag("CUSTOMER_SERVICE_QUERY_REWRITE") ?? enableRagV2,
  );
  const enableGroundedClarification = flagValue(
    raw.enable_grounded_clarification,
    envFlag("CUSTOMER_SERVICE_GROUNDED_CLARIFICATION") ?? enableRagV2,
  );
  const finalTopKFallback = numberValue(
    active?.retrieval_limit,
    envNumber("CUSTOMER_SERVICE_RETRIEVAL_LIMIT") ?? 8,
    1,
    50,
  );
  return {
    enableRagV2,
    enableQueryRewrite,
    enableGroundedClarification,
    contextRounds: numberValue(
      raw.context_rounds,
      envNumber("CUSTOMER_SERVICE_CONTEXT_ROUNDS") ?? 5,
      1,
      8,
    ),
    lexicalTopK: numberValue(
      raw.lexical_top_k,
      envNumber("CUSTOMER_SERVICE_LEXICAL_TOP_K") ?? 20,
      1,
      100,
    ),
    vectorTopK: numberValue(
      raw.vector_top_k,
      envNumber("CUSTOMER_SERVICE_VECTOR_TOP_K") ?? 20,
      1,
      100,
    ),
    finalTopK: numberValue(raw.final_top_k, finalTopKFallback, 1, 50),
    rrfK: numberValue(raw.rrf_k, envNumber("CUSTOMER_SERVICE_RRF_K") ?? 60, 1, 500),
    vectorWeight: numberValue(
      raw.vector_weight,
      envNumber("CUSTOMER_SERVICE_VECTOR_WEIGHT") ?? 0.7,
      0,
      1,
    ),
    lexicalWeight: numberValue(
      raw.lexical_weight,
      envNumber("CUSTOMER_SERVICE_LEXICAL_WEIGHT") ?? 0.3,
      0,
      1,
    ),
    vectorThreshold: numberValue(
      raw.vector_threshold,
      envNumber("CUSTOMER_SERVICE_VECTOR_THRESHOLD") ?? 0.45,
      -1,
      1,
    ),
  };
}
