import { describe, expect, it, vi } from "vitest";

import { handleCustomerServiceTurn, type CustomerServiceBotDeps } from "../supabase/functions/_shared/customer-service-bot.ts";

const faq = { id: "refund", question: "退款流程", answer: "請提供訂單號，我們會安排退款。" };

function setup() {
  const deps: CustomerServiceBotDeps = {
    lookupOrders: vi.fn().mockResolvedValue([]),
    lookupOrderItems: vi.fn().mockResolvedValue([]),
    verifyOrderIdentity: vi.fn().mockResolvedValue(false),
    writeInquiry: vi.fn(),
    searchFaqs: vi.fn().mockResolvedValue([faq]),
    queueHandoff: vi.fn(),
    cancelHandoff: vi.fn(),
    answerFaqWithModel: vi.fn().mockResolvedValue({ answer: faq.answer, sourceIds: [faq.id], model: "test" }),
  };
  const run = (text: string) => handleCustomerServiceTurn({
    phone: "85291234567",
    text,
    conversation: {
      phone_normalized: "85291234567",
      state: "identifying",
      selected_order_id: null,
      handoff_at: null,
      pending_request: null,
    },
    deps,
  });
  return { deps, run };
}

describe("customer-service RAG phase 1 retrieval rewrite", () => {
  it("retrieves and answers with the rewritten query", async () => {
    const { deps, run } = setup();
    deps.rewriteQuery = vi.fn().mockResolvedValue({
      rewrittenQuery: "退款流程是什麼",
      intentHint: "faq",
      usedContext: true,
      model: "test-model",
    });

    const result = await run("點樣退錢？");

    expect(deps.rewriteQuery).toHaveBeenCalledWith("點樣退錢？");
    expect(deps.searchFaqs).toHaveBeenCalledWith("退款流程是什麼");
    expect(deps.answerFaqWithModel).toHaveBeenCalledWith("退款流程是什麼", [faq]);
    expect(result.reply).toContain(faq.answer);
  });

  it("keeps the original query when rewrite asks for clarification", async () => {
    const { deps, run } = setup();
    deps.rewriteQuery = vi.fn().mockResolvedValue({
      rewrittenQuery: "呢個得唔得？",
      intentHint: "clarification",
      usedContext: false,
      model: "test-model",
    });

    await run("呢個得唔得？");

    expect(deps.searchFaqs).toHaveBeenCalledWith("呢個得唔得？");
  });

  it("survives a rewrite failure and still answers from the original query", async () => {
    const { deps, run } = setup();
    deps.rewriteQuery = vi.fn().mockRejectedValue(new Error("timeout"));

    const result = await run("點樣退錢？");

    expect(deps.searchFaqs).toHaveBeenCalledWith("點樣退錢？");
    expect(result.reply).toContain(faq.answer);
  });
});
