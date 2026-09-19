export type CustomerServiceRagConfig = {
  enableRagV2: boolean; enableQueryRewrite: boolean; enableGroundedClarification: boolean;
  contextRounds: number; lexicalTopK: number; vectorTopK: number; finalTopK: number;
  rrfK: number; vectorWeight: number; lexicalWeight: number; vectorThreshold: number;
};
function envFlag(name: string): boolean | undefined {
  const v = Deno.env.get(name)?.trim().toLowerCase();
  return v === "true" ? true : v === "false" ? false : undefined;
}
function bool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.trim().toLowerCase() === "true") return true;
    if (raw.trim().toLowerCase() === "false") return false;
  }
  return fallback;
}
function num(raw: unknown, fallback: number, min: number, max: number, integer = false): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  const valid = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, integer ? Math.trunc(valid) : valid));
}
export function customerServiceRagConfig(active?: { rag_config?: unknown; retrieval_limit?: number } | null): CustomerServiceRagConfig {
  const raw = active?.rag_config && typeof active.rag_config === "object" && !Array.isArray(active.rag_config) ? active.rag_config as Record<string, unknown> : {};
  const forceOff = envFlag("CUSTOMER_SERVICE_RAG_FORCE_OFF") === true;
  const master = bool(raw.enable_rag_v2, envFlag("CUSTOMER_SERVICE_RAG_V2") ?? false);
  const setting = (key: string, env: string, fallback: number, min: number, max: number, integer = false) =>
    num(raw[key], num(Deno.env.get(env), fallback, min, max, integer), min, max, integer);
  let vectorWeight = setting("vector_weight", "CUSTOMER_SERVICE_VECTOR_WEIGHT", 0.7, 0, 1);
  let lexicalWeight = setting("lexical_weight", "CUSTOMER_SERVICE_LEXICAL_WEIGHT", 0.3, 0, 1);
  if (vectorWeight === 0 && lexicalWeight === 0) { vectorWeight = 0.7; lexicalWeight = 0.3; }
  return {
    enableRagV2: !forceOff && master,
    // Keep A-only rollout available; force-off overrides database AND env flags.
    enableQueryRewrite: !forceOff && bool(raw.enable_query_rewrite, envFlag("CUSTOMER_SERVICE_QUERY_REWRITE") ?? master),
    enableGroundedClarification: !forceOff && bool(raw.enable_grounded_clarification, envFlag("CUSTOMER_SERVICE_GROUNDED_CLARIFICATION") ?? master),
    contextRounds: setting("context_rounds", "CUSTOMER_SERVICE_CONTEXT_ROUNDS", 5, 1, 8, true),
    lexicalTopK: setting("lexical_top_k", "CUSTOMER_SERVICE_LEXICAL_TOP_K", 20, 1, 100, true),
    vectorTopK: setting("vector_top_k", "CUSTOMER_SERVICE_VECTOR_TOP_K", 20, 1, 100, true),
    finalTopK: num(raw.final_top_k, num(active?.retrieval_limit, num(Deno.env.get("CUSTOMER_SERVICE_RETRIEVAL_LIMIT"),8,1,50,true),1,50,true),1,50,true),
    rrfK: setting("rrf_k", "CUSTOMER_SERVICE_RRF_K", 60, 1, 500, true),
    vectorWeight, lexicalWeight,
    vectorThreshold: setting("vector_threshold", "CUSTOMER_SERVICE_VECTOR_THRESHOLD", 0.45, -1, 1),
  };
}
