import { describe, expect, it } from "vitest";

import {
  historyJudgeEvidence,
  judgeHistoryDecisionPoint,
  type HistoryJudgeAiConfig,
} from "../supabase/functions/_shared/customer-service-history-judge-ai.ts";

const config: HistoryJudgeAiConfig = {
  enabled: true, endpoint: "https://chat.example.test/completions", apiKey: "mock-key",
  model: "mock-judge", timeoutMs: 2_000,
};
const modelResponse = (payload: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });

const baseInput = {
  question: "運費幾多？",
  context: [],
  referenceAnswer: "運費為 30 元。",
  aiAnswer: "運費係 30 元。",
  candidates: [{ id: "faq-1", question: "運費?", answer: "運費為 30 元。" }],
  traceSummary: { error: false, degraded: false, candidateCount: 1 },
  config,
};

describe("history judge AI", () => {
  it("builds a citation map from answers, references, candidates and trace", () => {
    const evidence = historyJudgeEvidence(baseInput);
    expect(evidence.ai_answer).toBe("運費係 30 元。");
    expect(evidence["faq-1"]).toContain("運費為 30 元");
    expect(evidence.trace).toContain("candidateCount");
  });

  it("accepts a verdict whose quotes exist in the controlled inputs", async () => {
    const result = await judgeHistoryDecisionPoint({
      ...baseInput,
      fetchImpl: async () => modelResponse({
        status: "scored", comparison: "match", aiGrounding: "supported",
        referenceStatus: "supported_for_selected_time",
        issues: [{
          category: "tone", severity: "low", layer: "generation",
          evidence: [{ sourceType: "approved_source", sourceId: "faq-1", quote: "運費為 30 元" }],
          suggestedFix: "語氣可更口語。",
        }],
        requiresHumanReview: false,
      }),
    });
    expect(result?.comparison).toBe("match");
    expect(result?.issues[0].evidence[0].sourceId).toBe("faq-1");
  });

  it("forces human review when the judge fabricates a quote", async () => {
    const result = await judgeHistoryDecisionPoint({
      ...baseInput,
      fetchImpl: async () => modelResponse({
        status: "scored", comparison: "divergent", aiGrounding: "unsupported",
        referenceStatus: "unknown",
        issues: [{
          category: "wrong_policy", severity: "high", layer: "knowledge",
          evidence: [{ sourceType: "approved_source", sourceId: "faq-1", quote: "捏造內容" }],
          suggestedFix: "x",
        }],
        requiresHumanReview: false,
      }),
    });
    expect(result?.issues[0].evidence).toEqual([]);
    expect(result?.requiresHumanReview).toBe(true);
  });

  it("fails closed on provider errors and disabled config", async () => {
    expect(await judgeHistoryDecisionPoint({ ...baseInput, fetchImpl: async () => new Response("", { status: 500 }) })).toBeNull();
    expect(await judgeHistoryDecisionPoint({ ...baseInput, config: { ...config, enabled: false } })).toBeNull();
  });
});
