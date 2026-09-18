import { afterEach, describe, expect, it, vi } from "vitest";

import { customerServiceRagConfig } from "../supabase/functions/_shared/customer-service-rag-config.ts";

function stubEnv(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  vi.stubGlobal("Deno", { env: { get: (name: string) => values.get(name) } });
}

afterEach(() => vi.unstubAllGlobals());

describe("customer-service RAG config", () => {
  it("stays off by default", () => {
    stubEnv();
    const config = customerServiceRagConfig(null);
    expect(config).toMatchObject({
      enableRagV2: false,
      enableQueryRewrite: false,
      enableGroundedClarification: false,
      contextRounds: 5,
      rrfK: 60,
      vectorWeight: 0.7,
      lexicalWeight: 0.3,
    });
  });

  it("follows the master switch from the environment", () => {
    stubEnv({ CUSTOMER_SERVICE_RAG_V2: "true" });
    const config = customerServiceRagConfig(null);
    expect(config.enableRagV2).toBe(true);
    expect(config.enableQueryRewrite).toBe(true);
    expect(config.enableGroundedClarification).toBe(true);
  });

  it("lets the active config row override the environment", () => {
    stubEnv({ CUSTOMER_SERVICE_RAG_V2: "true", CUSTOMER_SERVICE_RRF_K: "10" });
    const config = customerServiceRagConfig({
      rag_config: {
        enable_rag_v2: true,
        enable_query_rewrite: false,
        enable_grounded_clarification: false,
        context_rounds: 3,
        rrf_k: 99,
        vector_threshold: 0.6,
      },
      retrieval_limit: 6,
    });
    expect(config.enableQueryRewrite).toBe(false);
    expect(config.enableGroundedClarification).toBe(false);
    expect(config.contextRounds).toBe(3);
    expect(config.rrfK).toBe(99);
    expect(config.vectorThreshold).toBe(0.6);
    expect(config.finalTopK).toBe(6);
  });

  it("clamps out-of-range values", () => {
    stubEnv();
    const config = customerServiceRagConfig({
      rag_config: {
        context_rounds: 99,
        vector_weight: -1,
        lexical_weight: 5,
        vector_top_k: 0,
      },
    });
    expect(config.contextRounds).toBe(8);
    expect(config.vectorWeight).toBe(0);
    expect(config.lexicalWeight).toBe(1);
    expect(config.vectorTopK).toBe(1);
  });
});
