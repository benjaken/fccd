import { describe, expect, it, vi } from "vitest";

import { rewriteCustomerServiceQuery } from "../supabase/functions/_shared/customer-service-rewrite.ts";

const config = {
  enabled: true,
  endpoint: "https://api.example.test/chat/completions",
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 2_000,
};

function rewriteResponse(rewritten_query: string, intent_hint = "faq", used_context = true) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ rewritten_query, intent_hint, used_context }) } }],
  }), { status: 200 });
}

describe("customer-service query rewrite", () => {
  it("resolves a follow-up with conversation context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(rewriteResponse("加急送貨星期日費用多少"));

    const result = await rewriteCustomerServiceQuery({
      question: "咁星期日呢？",
      recentMessages: [
        { role: "customer", text: "加急送貨幾錢？" },
        { role: "assistant", text: "加急送貨費用係 HK$100。" },
      ],
      config,
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      rewrittenQuery: "加急送貨星期日費用多少",
      intentHint: "faq",
      usedContext: true,
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[1].content).toContain("加急送貨幾錢");
    expect(request.messages[1].content).toContain("咁星期日呢");
  });

  it("keeps the original wording when the reference cannot be resolved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(rewriteResponse("呢個得唔得", "clarification", false));

    const result = await rewriteCustomerServiceQuery({
      question: "呢個得唔得？",
      recentMessages: [],
      config,
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      rewrittenQuery: "呢個得唔得？",
      intentHint: "clarification",
      usedContext: false,
    });
  });

  it("returns null when the rewrite provider is not configured", async () => {
    await expect(rewriteCustomerServiceQuery({
      question: "點樣退錢",
      config: { ...config, enabled: false },
      fetchImpl: vi.fn(),
    })).resolves.toBeNull();
  });

  it("surfaces an abort as a typed timeout error", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    await expect(rewriteCustomerServiceQuery({
      question: "點樣退錢",
      config,
      fetchImpl: fetchMock,
    })).rejects.toThrow("customer_service_rewrite_timeout");
  });

  it("falls back to the original question when the model returns junk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not json" } }],
    }), { status: 200 }));
    await expect(rewriteCustomerServiceQuery({
      question: "退款流程",
      config,
      fetchImpl: fetchMock,
    })).resolves.toBeNull();
  });
});
