import { describe, expect, it, vi } from "vitest";

import {
  classifyCustomerServiceWithJev,
  customerServiceJevConfig,
  isJevAcceptable,
  type CustomerServiceJevDecision,
} from "../supabase/functions/_shared/customer-service-jev";

const INTENTS = [
  { intentKey: "search_faq", description: "General policy question" },
  { intentKey: "collect_inquiry", description: "New catering enquiry" },
  { intentKey: "handoff_order", description: "Change or cancel existing order" },
  { intentKey: "handoff", description: "Complaint or human request" },
  { intentKey: "lookup_order", description: "Check order status" },
  { intentKey: "out_of_scope", description: "Unrelated to catering" },
];

const CONFIG = customerServiceJevConfig({
  enabled: true,
  shadow: false,
  apiKey: "test-key",
  budgetMs: 5000,
});

function mockResponse(overrides = {}) {
  return {
    model: "jev-1.13.0",
    answers: {
      intent: { type: "choice", choice: "search_faq", confidence: 0.95, probabilities: {} },
      dialog_action: { type: "choice", choice: "new_request", confidence: 0.9, probabilities: {} },
      requires_human: { type: "noul", noul: 0.1 },
      needs_clarification: { type: "noul", noul: 0.05 },
    },
    usage: { input_tokens: 500, output_tokens: 50 },
    ...overrides,
  };
}

describe("classifyCustomerServiceWithJev", () => {
  it("returns decision and trace on success", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(mockResponse()), { status: 200 }),
    );
    const { decision, trace } = await classifyCustomerServiceWithJev({
      message: "運費幾多",
      conversationState: "identifying",
      intents: INTENTS,
      config: CONFIG,
      fetchImpl,
    });

    expect(decision).not.toBeNull();
    expect(decision!.intentKey).toBe("search_faq");
    expect(decision!.intentConfidence).toBe(0.95);
    expect(decision!.requiresHumanProbability).toBe(0.1);
    expect(trace.outcome).toBe("decided");
    expect(trace.inputTokens).toBe(500);
  });

  it("returns null decision in shadow mode", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(mockResponse()), { status: 200 }),
    );
    const { decision, trace } = await classifyCustomerServiceWithJev({
      message: "運費幾多",
      conversationState: "identifying",
      intents: INTENTS,
      config: { ...CONFIG, shadow: true },
      fetchImpl,
    });

    expect(decision).toBeNull();
    expect(trace.outcome).toBe("escalated");
    expect(trace.decision).not.toBeNull();
  });

  it("returns error trace when disabled", async () => {
    const { decision, trace } = await classifyCustomerServiceWithJev({
      message: "hello",
      conversationState: "identifying",
      intents: INTENTS,
      config: { ...CONFIG, enabled: false },
    });
    expect(decision).toBeNull();
    expect(trace.outcome).toBe("disabled");
    expect(trace.attempted).toBe(false);
  });

  it("returns error trace for intent not in closed set", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify(mockResponse({
          answers: {
            ...mockResponse().answers,
            intent: { type: "choice", choice: "unknown_intent", confidence: 0.9, probabilities: {} },
          },
        })),
        { status: 200 },
      ),
    );
    const { decision, trace } = await classifyCustomerServiceWithJev({
      message: "hello",
      conversationState: "identifying",
      intents: INTENTS,
      config: CONFIG,
      fetchImpl,
    });
    expect(decision).toBeNull();
    expect(trace.errorCode).toBe("intent_not_in_closed_set");
  });

  it("returns error trace on HTTP error", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    );
    const { decision, trace } = await classifyCustomerServiceWithJev({
      message: "hello",
      conversationState: "identifying",
      intents: INTENTS,
      config: CONFIG,
      fetchImpl,
    });
    expect(decision).toBeNull();
    expect(trace.outcome).toBe("error");
    expect(trace.errorCode).toBe("http_429");
  });
});

describe("isJevAcceptable", () => {
  const base: CustomerServiceJevDecision = {
    intentKey: "search_faq",
    intentConfidence: 0.95,
    dialogAction: "new_request",
    dialogActionConfidence: 0.9,
    requiresHumanProbability: 0.1,
    needsClarificationProbability: 0.05,
    model: "jev",
    latencyMs: 300,
    usage: { inputTokens: 500, outputTokens: 50 },
  };

  it("accepts high-confidence low-risk", () => {
    const result = isJevAcceptable(base, CONFIG, "faq_search");
    expect(result.accepted).toBe(true);
  });

  it("rejects low intent confidence", () => {
    const result = isJevAcceptable(
      { ...base, intentConfidence: 0.5 },
      CONFIG,
      "faq_search",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("low_intent_confidence");
  });

  it("rejects high-risk with low requiresHuman", () => {
    const result = isJevAcceptable(
      { ...base, intentKey: "handoff_order", requiresHumanProbability: 0.2 },
      CONFIG,
      "order_handoff",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("inconsistent_requires_human_low");
  });

  it("rejects low-risk with high requiresHuman", () => {
    const result = isJevAcceptable(
      { ...base, requiresHumanProbability: 0.8 },
      CONFIG,
      "faq_search",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("inconsistent_requires_human_high");
  });

  it("rejects when needs clarification", () => {
    const result = isJevAcceptable(
      { ...base, needsClarificationProbability: 0.6 },
      CONFIG,
      "faq_search",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("needs_clarification");
  });
});
