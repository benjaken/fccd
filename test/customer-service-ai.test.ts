import { describe, expect, it, vi } from "vitest";

import {
  answerCustomerServiceFaqWithAi,
  answerCustomerServiceFaqWithTieredAi,
  answerCustomerServiceFallbackWithAi,
  classifyCustomerServiceWithAi,
  classifyCustomerServiceWithTieredAi,
} from "../supabase/functions/_shared/customer-service-ai.ts";

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
  it("composes a safe next-step reply when no FAQ can answer the intent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "可以先提供活動日期同大概人數，我會按你嘅需要再提供合適方向。",
      }) } }],
    }), { status: 200 }));

    const result = await answerCustomerServiceFallbackWithAi({
      question: "想搵適合公司聚會嘅到會，有咩建議？",
      intentKey: "catering_inquiry",
      missingFields: ["eventDate", "headcount"],
      recentMessages: [],
      config,
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      answer: expect.stringContaining("活動日期"),
      model: "test-model",
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[0].content).toContain("Never invent");
    expect(request.messages[1].content).toContain("catering_inquiry");
  });

  it("rejects invented links and numbers in an ungrounded fallback reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "套餐只需 HK$999，詳情：https://invented.example/menu",
      }) } }],
    }), { status: 200 }));

    await expect(answerCustomerServiceFallbackWithAi({
      question: "有咩套餐推介？",
      intentKey: "browse_menu",
      config,
      fetchImpl: fetchMock,
    })).resolves.toBeNull();
  });

  it("uses Grok 4.3 without reasoning and escalates low-confidence intent to Grok 4.5 low", async () => {
    const response = (confidence: number) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        intent: "search_faq",
        confidence,
        orderNumber: "",
        requestedDate: "",
        missingFields: [],
        requiresHuman: false,
        tool: "search_faq",
      }) } }],
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(0.55))
      .mockResolvedValueOnce(response(0.91));
    const intents = [{
      intentKey: "search_faq",
      displayName: "FAQ",
      description: "搜尋公開資料",
      examples: [],
      actionKey: "faq",
      confidenceThreshold: 0.5,
      toolKeys: ["search_faq"],
    }];

    const result = await classifyCustomerServiceWithTieredAi({
      message: "餐具有冇特別安排？",
      conversationState: "identifying",
      intents,
      tiers: {
        primary: { ...config, endpoint: "https://api.x.ai/v1/chat/completions", model: "grok-4.3", reasoningEffort: "none" },
        fallback: { ...config, endpoint: "https://api.x.ai/v1/chat/completions", model: "grok-4.5", reasoningEffort: "low" },
        escalationConfidence: 0.72,
      },
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({ model: "grok-4.5", confidence: 0.91 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      model: "grok-4.3",
      reasoning_effort: "none",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      model: "grok-4.5",
      reasoning_effort: "low",
    });
  });

  it("uses the fallback model only when the primary cannot ground an FAQ answer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: null, sourceIds: [] }) } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: "新界地面交收運費係 HK$50。", sourceIds: ["delivery"] }) } }],
      }), { status: 200 }));

    const result = await answerCustomerServiceFaqWithTieredAi({
      question: "新界運費？",
      faqs,
      tiers: {
        primary: { ...config, model: "grok-4.3" },
        fallback: { ...config, model: "grok-4.5", reasoningEffort: "low" },
        escalationConfidence: 0.72,
      },
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ model: "grok-4.5", sourceIds: ["delivery"] });
  });

  it("classifies only configured intents and allowed tools", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        intent: "handoff_order",
        confidence: 0.94,
        orderNumber: "",
        requestedDate: "2026-09-11",
        missingFields: ["orderNumber"],
        requiresHuman: true,
        tool: "lookup_orders",
      }) } }],
    }), { status: 200 }));
    const result = await classifyCustomerServiceWithAi({
      message: "我想改為9月11日送貨",
      conversationState: "identifying",
      pendingRequest: "修改 B-1555 送貨日期",
      recentMessages: [
        { role: "customer", text: "我的電郵 test@example.com，地址：九龍某道 18 號" },
        { role: "human", text: "同事已選擇訂單 B-1555" },
      ],
      intents: [{
        intentKey: "handoff_order",
        displayName: "修改訂單",
        description: "修改未送貨訂單後轉人工",
        examples: ["我想改送貨日期"],
        actionKey: "order_handoff",
        confidenceThreshold: 0.6,
        toolKeys: ["lookup_orders"],
      }],
      config,
      fetchImpl: fetchMock,
    });
    expect(result).toMatchObject({
      intentKey: "handoff_order",
      confidence: 0.94,
      toolKey: "lookup_orders",
      requiresHuman: true,
    });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.parse(requestBody.messages[1].content)).toMatchObject({
      currentTask: "修改 B-1555 送貨日期",
    });
    expect(requestBody.messages[1].content).not.toContain("test@example.com");
    expect(requestBody.messages[1].content).toContain("[電郵已隱藏]");
    expect(requestBody.messages[1].content).toContain('"role":"human"');
    expect(requestBody.messages[0].content).toContain("role human");
    expect(requestBody.messages[0].content).toContain("dialogAction");
    expect(requestBody.messages[0].content).toContain("complete current message");
    expect(requestBody.messages[0].content).toContain(
      "do not by themselves mean the customer authorized",
    );
  });

  it("rejects a model-selected tool outside the configured allowlist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        intent: "lookup_order",
        confidence: 0.9,
        requestedFields: ["delivery_date", "items", "unsafe_field"],
        tool: "notify_internal",
      }) } }],
    }), { status: 200 }));
    const result = await classifyCustomerServiceWithAi({
      message: "我張單幾時到",
      conversationState: "identifying",
      intents: [{
        intentKey: "lookup_order",
        displayName: "查詢訂單",
        description: "只讀查單",
        examples: [],
        actionKey: "order_lookup",
        confidenceThreshold: 0.6,
        toolKeys: ["lookup_orders"],
      }],
      config,
      fetchImpl: fetchMock,
    });
    expect(result?.toolKey).toBeNull();
    expect(result?.requestedFields).toEqual(["delivery_date", "items"]);
  });

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

  it("keeps the strict source contract by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "新界地面交收運費係 HK$50。",
        sourceIds: ["delivery", "ghost"],
      }) } }],
    }), { status: 200 }));
    await expect(answerCustomerServiceFaqWithAi({
      question: "新界運費？",
      faqs,
      config,
      fetchImpl: fetchMock,
    })).resolves.toBeNull();
  });

  it("drops unknown source ids and keeps a grounded answer in clarification mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "新界地面交收運費係 HK$50。",
        sourceIds: ["delivery", "ghost"],
        confidence: "high",
        needsClarification: false,
      }) } }],
    }), { status: 200 }));
    await expect(answerCustomerServiceFaqWithAi({
      question: "新界運費？",
      faqs,
      groundedClarification: true,
      config,
      fetchImpl: fetchMock,
    })).resolves.toMatchObject({ sourceIds: ["delivery"], confidence: "high" });
  });

  it("still rejects an answer whose numbers are not grounded, even in clarification mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "運費係 HK$999。",
        sourceIds: ["delivery"],
      }) } }],
    }), { status: 200 }));
    await expect(answerCustomerServiceFaqWithAi({
      question: "運費？",
      faqs,
      groundedClarification: true,
      config,
      fetchImpl: fetchMock,
    })).resolves.toBeNull();
  });

  it("sends recent conversation and the rewritten question to the answer composer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "新界地面交收運費係 HK$50。",
        sourceIds: ["delivery"],
      }) } }],
    }), { status: 200 }));

    await answerCustomerServiceFaqWithAi({
      question: "咁星期日呢？",
      rewrittenQuestion: "新界星期日送貨運費多少",
      recentMessages: [
        { role: "customer", text: "新界送貨幾錢？" },
        { role: "assistant", text: "新界地面交收 HK$50。" },
      ],
      faqs,
      config,
      fetchImpl: fetchMock,
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const user = JSON.parse(request.messages[1].content);
    expect(user.rewrittenQuestion).toBe("新界星期日送貨運費多少");
    expect(user.recentMessages).toHaveLength(2);
    expect(request.messages[0].content).toContain("published FAQ records");
  });
});
