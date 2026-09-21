import { describe, expect, it } from "vitest";

import {
  buildHistoryJevQuestions,
  buildHistoryJevState,
  historyJevAgreement,
  historyJevStateHasDirectPii,
  judgeHistoryDecisionPointWithJev,
  parseHistoryJevResponse,
  redactHistoryJevText,
  resolveHistoryJevApprovedSources,
  type HistoryJevAnswers,
  type HistoryJevConfig,
} from "../supabase/functions/_shared/customer-service-history-jev.ts";

const config: HistoryJevConfig = {
  enabled: true,
  endpoint: "https://api.typesafe.ai/v1/systemone",
  apiKey: "mock-key",
  model: "jev-1.13.0",
  timeoutMs: 2_000,
  maxRetries: 1,
};

const baseInput = {
  question: "運費幾多？",
  context: [{ role: "customer", text: "運費幾多？" }],
  aiAnswer: "運費係 30 元。",
  approvedSources: [{ id: "faq-1", text: "運費?\n運費為 30 元。" }],
  traceSummary: {
    grounded: true,
    usedFallback: false,
    retrievalError: false,
    answerGuardPassed: true,
    candidateCount: 1,
    selectedSourceCount: 1,
  },
  config,
};

const modelResponse = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers });

const validAnswers = {
  grounding: {
    type: "choice", choice: "supported",
    probabilities: { supported: 0.86, unsupported: 0.05, conflicting: 0.02, unknown: 0.07 },
    confidence: 0.79,
  },
  coverage: {
    type: "choice", choice: "complete",
    probabilities: { complete: 0.9, partial: 0.06, missed: 0.02, unknown: 0.02 },
    confidence: 0.85,
  },
  unverified_action: { type: "noul", noul: 0.04 },
  human_review: { type: "noul", noul: 0.12 },
};

const validPayload = { model: "jev-1.13.0", answers: validAnswers, usage: { input_tokens: 296, output_tokens: 20 } };

describe("history jev request building", () => {
  it("keeps only the four fixed questions and never free text questions", () => {
    const questions = buildHistoryJevQuestions();
    expect(Object.keys(questions).sort()).toEqual(
      ["coverage", "grounding", "human_review", "unverified_action"].sort(),
    );
    expect(questions.unverified_action.type).toBe("noul");
  });

  it("redacts phones, emails, addresses and order references but keeps amounts", () => {
    const redacted = redactHistoryJevText("客人 9123 4567 叫 #A1234567 運費 30 元，地址：香港中環皇后大道中1號");
    expect(redacted).not.toContain("9123 4567");
    expect(redacted).not.toContain("#A1234567");
    expect(redacted).toContain("30 元");
  });

  it("treats inbound text as data and disables inference of completed operations", () => {
    const state = buildHistoryJevState(baseInput) as {
      assistant_answer: string;
      controlled_trace: { operations_confirmed: boolean };
    };
    expect(state.assistant_answer).toBe("運費係 30 元。");
    expect(state.controlled_trace.operations_confirmed).toBe(false);
  });

  it("flags residual direct identifiers before sending", () => {
    expect(historyJevStateHasDirectPii({ text: "call 9123 4567" })).toBe(true);
    expect(historyJevStateHasDirectPii(buildHistoryJevState(baseInput))).toBe(false);
  });
});

describe("history jev response parsing", () => {
  it("accepts a well-formed response", () => {
    const parsed = parseHistoryJevResponse(validPayload);
    expect(parsed?.modelResolved).toBe("jev-1.13.0");
    expect(parsed?.answers.grounding.choice).toBe("supported");
    expect(parsed?.answers.unverifiedAction.noul).toBeCloseTo(0.04);
    expect(parsed?.inputTokens).toBe(296);
  });

  it("rejects missing or extra answer keys", () => {
    expect(parseHistoryJevResponse({ model: "jev-1.13.0", answers: { grounding: validAnswers.grounding } })).toBeNull();
    const withExtra = { ...validPayload, answers: { ...validAnswers, extra: { type: "noul", noul: 1 } } };
    expect(parseHistoryJevResponse(withExtra)).toBeNull();
  });

  it("rejects an illegal choice, out-of-range probability and unknown option", () => {
    const illegal = { ...validPayload, answers: { ...validAnswers, grounding: { ...validAnswers.grounding, choice: "great" } } };
    expect(parseHistoryJevResponse(illegal)).toBeNull();
    const outOfRange = { ...validPayload, answers: { ...validAnswers, unverified_action: { type: "noul", noul: 1.4 } } };
    expect(parseHistoryJevResponse(outOfRange)).toBeNull();
    const unknownOption = {
      ...validPayload,
      answers: {
        ...validAnswers,
        coverage: {
          type: "choice", choice: "complete",
          probabilities: { complete: 0.9, partial: 0.05, missed: 0.03, mystery: 0.02 },
          confidence: 0.8,
        },
      },
    };
    expect(parseHistoryJevResponse(unknownOption)).toBeNull();
  });

  it("rejects non-numeric or non-summing probabilities", () => {
    const nonNumeric = { ...validPayload, answers: { ...validAnswers, grounding: { ...validAnswers.grounding, probabilities: { supported: "0.9", unsupported: 0.1, conflicting: 0, unknown: 0 } } } };
    expect(parseHistoryJevResponse(nonNumeric)).toBeNull();
    const notSumming = { ...validPayload, answers: { ...validAnswers, coverage: { ...validAnswers.coverage, probabilities: { complete: 0.4, partial: 0.1, missed: 0.1, unknown: 0.1 } } } };
    expect(parseHistoryJevResponse(notSumming)).toBeNull();
  });
});

describe("history jev adapter", () => {
  it("sends the official contract and returns the structured answers", async () => {
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    const outcome = await judgeHistoryDecisionPointWithJev({
      ...baseInput,
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        seenUrl = String(url);
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return modelResponse(validPayload);
      },
    });
    expect(seenUrl).toBe("https://api.typesafe.ai/v1/systemone");
    expect(seenBody.model).toBe("jev-1.13.0");
    expect(Object.keys(seenBody.questions as Record<string, unknown>).sort()).toEqual(
      ["coverage", "grounding", "human_review", "unverified_action"].sort(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.answers.coverage.choice).toBe("complete");
      expect(outcome.modelResolved).toBe("jev-1.13.0");
      expect(outcome.outputTokens).toBe(20);
    }
  });

  it("fails closed on invalid responses instead of inventing an unknown verdict", async () => {
    const outcome = await judgeHistoryDecisionPointWithJev({
      ...baseInput, fetchImpl: async () => modelResponse({ model: "jev-1.13.0", answers: {} }),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("invalid_response");
  });

  it("stops immediately on 401 and 422 configuration errors", async () => {
    let calls = 0;
    const unauthorized = await judgeHistoryDecisionPointWithJev({
      ...baseInput, fetchImpl: async () => { calls += 1; return modelResponse({}, 401); },
    });
    expect(calls).toBe(1);
    expect(unauthorized.ok).toBe(false);
    if (!unauthorized.ok) expect(unauthorized.errorCode).toBe("auth_failed");
    const unprocessable = await judgeHistoryDecisionPointWithJev({
      ...baseInput, fetchImpl: async () => modelResponse({ detail: "bad" }, 422),
    });
    expect(unprocessable.ok).toBe(false);
    if (!unprocessable.ok) expect(unprocessable.errorCode).toBe("invalid_request");
  });

  it("retries 429 and 529 with bounded backoff and respects Retry-After", async () => {
    const slept: number[] = [];
    let calls = 0;
    const outcome = await judgeHistoryDecisionPointWithJev({
      ...baseInput,
      config: { ...config, maxRetries: 2 },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return modelResponse({}, 429, { "retry-after": "1" });
        if (calls === 2) return modelResponse({}, 529);
        return modelResponse(validPayload);
      },
      sleepImpl: async (ms) => { slept.push(ms); },
    });
    expect(calls).toBe(3);
    expect(slept[0]).toBe(1_000);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attemptCount).toBe(3);
  });

  it("reports a timeout as outcome_uncertain without a fake verdict", async () => {
    const outcome = await judgeHistoryDecisionPointWithJev({
      ...baseInput,
      config: { ...config, timeoutMs: 1_000, maxRetries: 0 },
      fetchImpl: async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe("timeout");
      expect(outcome.outcomeUncertain).toBe(true);
    }
  });

  it("does not send a request when disabled or unconfigured", async () => {
    let called = false;
    const outcome = await judgeHistoryDecisionPointWithJev({
      ...baseInput,
      config: { ...config, enabled: false },
      fetchImpl: async () => { called = true; return modelResponse(validPayload); },
    });
    expect(called).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("not_configured");
  });
});

describe("history jev source and agreement helpers", () => {
  const answers: HistoryJevAnswers = {
    grounding: { choice: "unsupported", probabilities: {}, confidence: 0.7 },
    coverage: { choice: "complete", probabilities: {}, confidence: 0.8 },
    unverifiedAction: { noul: 0.2 },
    humanReview: { noul: 0.6 },
  };

  it("only sends selected, resolvable sources as approved sources", () => {
    const resolved = resolveHistoryJevApprovedSources({
      candidates: [
        { id: "faq-1", question: "a", answer: "b" },
        { id: "faq-2", question: "c", answer: "d" },
      ],
      selectedSourceIds: ["faq-2"],
      grounded: true,
    });
    expect(resolved.complete).toBe(true);
    expect(resolved.sources.map((source) => source.id)).toEqual(["faq-2"]);
  });

  it("marks a grounded sample with unresolved sources as not evaluable", () => {
    const resolved = resolveHistoryJevApprovedSources({
      candidates: [{ id: "faq-1", question: "a", answer: "b" }],
      selectedSourceIds: ["missing"],
      grounded: true,
    });
    expect(resolved.complete).toBe(false);
    expect(resolved.sources).toEqual([]);
  });

  it("allows a non-grounded sample with no approved sources", () => {
    const resolved = resolveHistoryJevApprovedSources({ candidates: [], selectedSourceIds: [], grounded: false });
    expect(resolved.complete).toBe(true);
  });

  it("compares only same-enum grounding and treats unknown as incomparable", () => {
    expect(historyJevAgreement({ jevGrounding: "supported", judgeGrounding: "supported", jevComplete: true, sampleEvaluable: true }))
      .toBe("agree");
    expect(historyJevAgreement({ jevGrounding: "unsupported", judgeGrounding: "supported", jevComplete: true, sampleEvaluable: true }))
      .toBe("divergent");
    expect(historyJevAgreement({ jevGrounding: "unknown", judgeGrounding: "supported", jevComplete: true, sampleEvaluable: true }))
      .toBe("incomparable");
    expect(historyJevAgreement({ jevGrounding: "supported", judgeGrounding: "supported", jevComplete: false, sampleEvaluable: true }))
      .toBe("incomparable");
  });

  // Keep the type import exercised even though answers are passed in directly.
  it("exposes the four answer keys", () => {
    expect(Object.keys(answers).sort()).toEqual(["coverage", "grounding", "humanReview", "unverifiedAction"].sort());
  });
});
