import { describe, expect, it, vi } from "vitest";

import { answerCustomerServiceFaqWithAi } from "../supabase/functions/_shared/customer-service-ai.ts";

const config = {
  enabled: true,
  endpoint: "https://api.example.test/chat/completions",
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 2_000,
};

const faqs = [{
  id: "delivery",
  category: "delivery",
  question: "運費幾多？",
  answer: "新界及九龍地面交收 HK$50，港島 HK$100。",
}];

describe("customer-service grounded AI", () => {
  it("sends only published FAQ knowledge and accepts a cited synthesis", async () => {
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "你好，新界地面交收運費係 HK$50。",
        sourceIds: ["delivery"],
      }) } }],
    }), { status: 200 }));

    const result = await answerCustomerServiceFaqWithAi({
      question: "我住新界，要幾錢送貨？",
      faqs,
      config,
      fetchImpl: fetchMock,
      beforeRequest,
    });

    expect(beforeRequest).toHaveBeenCalledOnce();
    expect(beforeRequest.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({ sourceIds: ["delivery"], model: "test-model" });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[1].content).toContain("我住新界");
    expect(request.messages[1].content).toContain("HK$50");
  });

  it("keeps answering when the waiting notice cannot be delivered", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "新界地面交收運費係 HK$50。",
        sourceIds: ["delivery"],
      }) } }],
    }), { status: 200 }));

    await expect(answerCustomerServiceFaqWithAi({
      question: "新界運費？",
      faqs,
      config,
      fetchImpl: fetchMock,
      beforeRequest: vi.fn().mockRejectedValue(new Error("send failed")),
    })).resolves.toMatchObject({ sourceIds: ["delivery"] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects numbers and source ids that are not supported by the FAQ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "運費係 HK$999。",
        sourceIds: ["delivery"],
      }) } }],
    }), { status: 200 }));
    await expect(answerCustomerServiceFaqWithAi({
      question: "運費？",
      faqs,
      config,
      fetchImpl: fetchMock,
    })).resolves.toBeNull();
  });

  it("accepts thousands separators when the FAQ contains the same number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "訂滿 HK$2,800，地面交收可免運費。",
        sourceIds: ["free-delivery"],
      }) } }],
    }), { status: 200 }));
    await expect(answerCustomerServiceFaqWithAi({
      question: "幾多免運？",
      faqs: [{ ...faqs[0], id: "free-delivery", answer: "訂滿 HK$2800，地面交收免運費。" }],
      config,
      fetchImpl: fetchMock,
    })).resolves.toMatchObject({ sourceIds: ["free-delivery"] });
  });
});
