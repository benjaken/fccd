import { describe, expect, it } from "vitest";

import {
  deterministicHistoryIssues,
  parseHistoryJudgment,
  type DeterministicHistoryCheckInput,
} from "../supabase/functions/_shared/customer-service-history-judge.ts";

const base: DeterministicHistoryCheckInput = {
  aiAnswer: "運費為 30 元。",
  grounded: true,
  usedFallback: false,
  faqSourceIds: ["faq-1"],
  candidateCount: 1,
  expectedFaqIds: ["faq-1"],
  retrievalError: false,
  degraded: false,
  pairing: "confident",
  contextGap: false,
  answerGuardPassed: true,
};

describe("deterministic history checks", () => {
  it("passes a grounded, labelled, confident sample", () => {
    expect(deterministicHistoryIssues(base)).toEqual([]);
  });

  it("separates retrieval failure from knowledge gap (HR-AC11)", () => {
    const miss = deterministicHistoryIssues({ ...base, grounded: false, candidateCount: 0, aiAnswer: "" });
    expect(miss.map((issue) => issue.category)).toContain("retrieval_miss");
    const infra = deterministicHistoryIssues({ ...base, retrievalError: true, grounded: false, aiAnswer: "" });
    expect(infra.map((issue) => issue.category)).toContain("infrastructure");
    expect(infra.map((issue) => issue.category)).not.toContain("retrieval_miss");
  });

  it("flags an unsupported answer where no FAQ was expected", () => {
    const issues = deterministicHistoryIssues({ ...base, expectedFaqIds: [] });
    expect(issues.map((issue) => issue.category)).toContain("unsupported_commitment");
  });

  it("blocks a missing numeric/URL binding and uncertain pairing", () => {
    const issues = deterministicHistoryIssues({ ...base, answerGuardPassed: false, pairing: "pairing_uncertain" });
    expect(issues.map((issue) => issue.category)).toContain("wrong_amount_date");
    expect(issues.map((issue) => issue.category)).toContain("pairing_uncertain");
  });
});

describe("judge verdict parsing", () => {
  const validPayload = {
    status: "scored", comparison: "divergent", aiGrounding: "unsupported",
    referenceStatus: "reference_not_current",
    issues: [{
      category: "wrong_policy", severity: "high", layer: "knowledge",
      evidence: [{ sourceType: "approved_source", sourceId: "faq-1", quote: "運費為 30 元" }],
      suggestedFix: "核對現行運費政策。",
    }],
  };

  it("accepts a schema-valid verdict with real quotes", () => {
    const result = parseHistoryJudgment(validPayload, { evidence: { "faq-1": "運費為 30 元。" } });
    expect(result).not.toBeNull();
    expect(result?.comparison).toBe("divergent");
    expect(result?.requiresHumanReview).toBe(true);
  });

  it("drops fabricated quotes and forces human review (HR-AC15)", () => {
    const result = parseHistoryJudgment({
      ...validPayload,
      issues: [{ ...validPayload.issues[0], evidence: [
        { sourceType: "approved_source", sourceId: "faq-1", quote: "捏造的引文" },
      ] }],
    }, { evidence: { "faq-1": "運費為 30 元。" } });
    expect(result).not.toBeNull();
    expect(result?.issues[0].evidence).toEqual([]);
    expect(result?.requiresHumanReview).toBe(true);
  });

  it("rejects unknown enums and unknown evidence sources", () => {
    expect(parseHistoryJudgment({ ...validPayload, status: "great" })).toBeNull();
    expect(parseHistoryJudgment({ ...validPayload, comparison: "same" })).toBeNull();
    const unknown = parseHistoryJudgment({
      ...validPayload,
      issues: [{ ...validPayload.issues[0], evidence: [{ sourceType: "secret_tool", sourceId: "x" }] }],
    }, { evidence: { x: "y" } });
    expect(unknown?.issues[0].evidence).toEqual([]);
    expect(unknown?.requiresHumanReview).toBe(true);
  });

  it("never trusts a self-reported clean verdict without evidence context", () => {
    const result = parseHistoryJudgment({ ...validPayload, issues: [] }, { evidence: {} });
    expect(result?.requiresHumanReview).toBe(false);
    expect(result?.issues).toEqual([]);
  });
});
