import { describe, expect, it } from "vitest";

import {
  buildHistoryDecisionSamples,
  HISTORY_SAMPLE_BUILDER_VERSION,
  type HistoryMessage,
  type HistoryMessageRole,
} from "../supabase/functions/_shared/customer-service-history-samples.ts";

const BASE = Date.parse("2026-09-15T02:00:00.000Z");

function message(
  id: string,
  role: HistoryMessageRole,
  text: string,
  offsetMs: number,
  overrides: Partial<HistoryMessage> = {},
): HistoryMessage {
  return {
    id,
    sourceMessageId: `src-${id}`,
    phone: "85290000000",
    conversationId: "conv-1",
    role,
    text,
    createdAt: new Date(BASE + offsetMs).toISOString(),
    environment: "develop",
    ...overrides,
  };
}

describe("history decision-point samples", () => {
  it("merges a consecutive customer burst into one question (HR-AC02)", () => {
    const samples = buildHistoryDecisionSamples([
      message("q1", "customer", "想訂公司餐", 0),
      message("q2", "customer", "30 位", 1_000),
      message("q3", "customer", "有兩位食素", 2_000),
      message("h1", "human", "明白，想安排邊日、送去邊區？", 3_000),
    ]);
    expect(samples).toHaveLength(1);
    expect(samples[0].question).toContain("想訂公司餐");
    expect(samples[0].question).toContain("30 位");
    expect(samples[0].question).toContain("有兩位食素");
    expect(samples[0].builderVersion).toBe(HISTORY_SAMPLE_BUILDER_VERSION);
    expect(samples[0].pairing).toBe("confident");
  });

  it("keeps the target human answer out of the generator context (HR-AC05)", () => {
    const samples = buildHistoryDecisionSamples([
      message("a0", "assistant", "你好，有咩幫到你？", 0),
      message("h0", "human", "之前問過嘅安排", 1_000),
      message("q1", "customer", "想改送貨日期", 2_000),
      message("h1", "human", "想改邊一日？", 3_000),
      message("q2", "customer", "改星期四", 4_000),
    ]);
    expect(samples).toHaveLength(1);
    const sample = samples[0];
    // Earlier turns are visible context.
    expect(sample.recentMessages.map((turn) => turn.text)).toContain("之前問過嘅安排");
    // The current request and the reference must not be duplicated into context.
    expect(sample.recentMessages.map((turn) => turn.text)).not.toContain("想改送貨日期");
    expect(sample.recentMessages.map((turn) => turn.text)).not.toContain("想改邊一日？");
    expect(sample.referenceAnswer).toBe("想改邊一日？");
    // The later customer message is separate outcome evidence only.
    expect(sample.outcomeEvidenceMessageIds).toEqual(["q2"]);
  });

  it("merges a human reply block but flags a bot inserted afterwards (HR-AC04)", () => {
    const merged = buildHistoryDecisionSamples([
      message("q1", "customer", "外賣包裝", 0),
      message("h1", "human", "需要邊種？", 1_000),
      message("h2", "human", "同埋幾多個？", 1_500),
      message("a1", "assistant", "bot 插入", 2_000),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].referenceAnswer).toBe("需要邊種？\n同埋幾多個？");
    expect(merged[0].pairing).toBe("pairing_uncertain");
    expect(merged[0].issues).toContain("bot_in_decision_window");
  });

  it("does not treat a bot-only reply as a human decision point", () => {
    const samples = buildHistoryDecisionSamples([
      message("q1", "customer", "幾點開門", 0),
      message("a1", "assistant", "早上九點", 1_000),
    ]);
    expect(samples).toHaveLength(0);
  });

  it("keeps separate conversations with the same phone apart (HR-AC03)", () => {
    const samples = buildHistoryDecisionSamples([
      message("q1", "customer", "第一次", 0, { conversationId: "conv-a" }),
      message("h1", "human", "回覆 A", 1_000, { conversationId: "conv-a" }),
      message("q2", "customer", "第二次", 2_000, { conversationId: "conv-b" }),
      message("h2", "human", "回覆 B", 3_000, { conversationId: "conv-b" }),
    ]);
    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.referenceAnswer).sort()).toEqual(["回覆 A", "回覆 B"]);
  });

  it("propagates an incomplete-context marker (HR-AC06)", () => {
    const samples = buildHistoryDecisionSamples([
      message("q1", "customer", "如圖", 0, { contextGap: true }),
      message("h1", "human", "收到", 1_000),
    ]);
    expect(samples).toHaveLength(1);
    expect(samples[0].contextGap).toBe(true);
    expect(samples[0].issues).toContain("context_gap");
  });

  it("dedupes an identical decision point and excludes it from repeats", () => {
    const rows = [
      message("q1", "customer", "想查餐牌", 0),
      message("h1", "human", "請看網站", 1_000),
    ];
    const samples = buildHistoryDecisionSamples([...rows, ...rows]);
    expect(samples).toHaveLength(1);
    expect(samples[0].sampleKey).toMatch(/^[a-f0-9]{16}$/);
  });

  it("redacts identity data from question, context and reference", () => {
    const samples = buildHistoryDecisionSamples([
      message("h0", "human", "舊個案：電郵 nero@example.com", 0),
      message("q1", "customer", "我電話係 9123 4567，想改單", 200_000),
      message("h1", "human", "好，請提供地址：九龍城某道18號", 201_000),
    ]);
    expect(samples).toHaveLength(1);
    expect(samples[0].question).not.toContain("9123 4567");
    expect(samples[0].referenceAnswer).not.toContain("九龍城某道18號");
    expect(JSON.stringify(samples[0].recentMessages)).not.toContain("nero@example.com");
  });
});
