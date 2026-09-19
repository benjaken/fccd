import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  HISTORY_REPLAY_PIPELINE_VERSION,
  historyAnswerGuard,
  replayHistoryDecisionPoint,
  summarizeHistoryTrace,
} from "../supabase/functions/_shared/customer-service-history-replay.ts";
import type { RagTrace } from "../supabase/functions/_shared/customer-service-rag-runtime.ts";
import type { CustomerServiceAiTierConfig } from "../supabase/functions/_shared/customer-service-ai.ts";
import type { CustomerServiceRagConfig } from "../supabase/functions/_shared/customer-service-rag-config.ts";
import type { CustomerServiceRagDatabase } from "../supabase/functions/_shared/customer-service-rag-db.ts";

beforeAll(() => {
  if (typeof (globalThis as { Deno?: unknown }).Deno === "undefined") {
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
  }
});
afterAll(() => {
  if ((globalThis as { Deno?: { __stub?: boolean } }).Deno) vi.unstubAllGlobals();
});

const tiers: CustomerServiceAiTierConfig = {
  primary: { enabled: true, endpoint: "https://chat.example.test/completions", apiKey: "mock-key", model: "mock-primary", timeoutMs: 2_000 },
  fallback: null,
  escalationConfidence: 0.72,
};
const ragConfig: CustomerServiceRagConfig = {
  enableRagV2: false, enableQueryRewrite: false, enableGroundedClarification: false,
  contextRounds: 5, lexicalTopK: 20, vectorTopK: 20, finalTopK: 5, rrfK: 60,
  vectorWeight: 0.7, lexicalWeight: 0.3, vectorThreshold: 0.45,
};
const modelResponse = (payload: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });

function emptyDb(): CustomerServiceRagDatabase {
  return { rpc: async (name) => {
    if (name === "search_published_customer_faqs") return { data: [], error: null };
    throw new Error(`Unexpected RPC ${name}`);
  } };
}

describe("history replay adapter", () => {
  it("summarises retrieval failures and selected sources from traces", () => {
    const traces: RagTrace[] = [
      { traceId: "t", stage: "retrieval", status: "degraded", code: "no_match", elapsedMs: 3, candidates: [{ id: "faq-1", rank: 1 }] },
      { traceId: "t", stage: "answer", status: "ok", code: "answered", elapsedMs: 5, selectedSourceIds: ["faq-1"] },
    ];
    expect(summarizeHistoryTrace(traces)).toEqual({
      error: false, degraded: true, candidateCount: 1, selectedSourceIds: ["faq-1"],
    });
    expect(summarizeHistoryTrace([
      { traceId: "t", stage: "retrieval", status: "error", code: "retrieval_error", elapsedMs: 1, candidates: [] },
    ])).toMatchObject({ error: true, candidateCount: 0 });
  });

  it("binds numbers to cited sources and abstains without sources", () => {
    const sources = [{ question: "運費?", answer: "運費為 30 元。" }];
    expect(historyAnswerGuard("運費係 30 元。", sources)).toBe(true);
    expect(historyAnswerGuard("運費係 800 元。", sources)).toBe(false);
    expect(historyAnswerGuard("請問你想了解邊方面？", [])).toBeNull();
  });

  it("uses the shared fallback when no FAQ answer is grounded, without business writes", async () => {
    const forbidden = {
      lookupOrders: vi.fn(() => Promise.reject(new Error("forbidden"))),
      lookupOrderItems: vi.fn(() => Promise.reject(new Error("forbidden"))),
      verifyOrderIdentity: vi.fn(() => Promise.reject(new Error("forbidden"))),
      writeInquiry: vi.fn(() => Promise.reject(new Error("forbidden"))),
      queueHandoff: vi.fn(() => Promise.reject(new Error("forbidden"))),
      cancelHandoff: vi.fn(() => Promise.reject(new Error("forbidden"))),
    };
    // replyFaqForEvaluation uses its own injected deps internally, so assert on
    // the adapter result and that no forbidden dependency is invoked.
    const result = await replayHistoryDecisionPoint({
      db: emptyDb(),
      tiers,
      sample: { question: "想訂公司餐，30 位", recentMessages: [] },
      ragConfig,
      runClassificationAi: false,
      fetchImpl: async () => modelResponse({ answer: "請問你想安排邊一日？" }),
    });
    expect(result.pipelineVersion).toBe(HISTORY_REPLAY_PIPELINE_VERSION);
    expect(result.usedFallback).toBe(true);
    expect(result.aiAnswer).toContain("邊一日");
    expect(result.faqSourceIds).toEqual([]);
    expect(result.retrieval.error).toBe(false);
    for (const fn of Object.values(forbidden)) expect(fn).not.toHaveBeenCalled();
  });

  it("records a retrieval failure without throwing", async () => {
    const db: CustomerServiceRagDatabase = { rpc: async (name) => {
      if (name === "search_published_customer_faqs") return { data: null, error: { message: "down" } };
      throw new Error(`Unexpected RPC ${name}`);
    } };
    const result = await replayHistoryDecisionPoint({
      db, tiers, sample: { question: "有咩餐牌", recentMessages: [] },
      ragConfig, runClassificationAi: false,
      fetchImpl: async () => modelResponse({ answer: null }),
    });
    expect(result.retrieval.error).toBe(true);
    expect(result.grounded).toBe(false);
  });
});
