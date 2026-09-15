import { describe, expect, it } from "vitest";
import { buildHumanLearningConversations, isSafeFaqAliasSuggestion, parseLearningAnalysis } from "../supabase/functions/_shared/customer-service-learning";

describe("daily customer-service learning", () => {
  it("keeps human replies after bot handoff in the learning transcript", () => {
    const result = buildHumanLearningConversations([
      { phone: "85290000000", role: "customer", text: "可否改單？", createdAt: "2026-09-14T01:00:00Z" },
      { phone: "85290000000", role: "assistant", text: "已轉同事。", createdAt: "2026-09-14T01:00:01Z" },
      { phone: "85290000000", role: "human", text: "可以，請提供單號。", createdAt: "2026-09-14T01:05:00Z" },
    ]);
    expect(result[0].messages.at(-1)).toEqual({ role: "human", text: "可以，請提供單號。" });
  });

  it("only auto-applies an alias when it repeats an existing published FAQ answer", () => {
    expect(isSafeFaqAliasSuggestion({ type: "faq", question: "點落單？", answer: "請到網站落單。", publishedAnswer: "請到網站落單。" })).toBe(true);
    expect(isSafeFaqAliasSuggestion({ type: "faq", question: "可否退款？", answer: "可以退款。", publishedAnswer: "可以退款。" })).toBe(false);
    expect(isSafeFaqAliasSuggestion({ type: "faq", question: "大單可以例外嗎？", answer: "可以。", publishedAnswer: "可以。" })).toBe(false);
  });
});

describe("grounded learning evidence", () => {
  const messages = [
    { id: "q1", phone: "phone", role: "customer" as const, text: "點樣落單？", createdAt: "2026-09-14T01:00:00Z" },
    { id: "h1", phone: "phone", role: "human" as const, text: "請到網站落單。", createdAt: "2026-09-14T01:01:00Z" },
    { id: "q2", phone: "phone", role: "customer" as const, text: "可以退款嗎？", createdAt: "2026-09-14T02:00:00Z" },
    { id: "h2", phone: "phone", role: "human" as const, text: "個案需要跟進。", createdAt: "2026-09-14T02:01:00Z" },
  ];
  function payload(suggestion: Record<string, unknown>, evaluations: unknown[] = []) {
    return { choices: [{ message: { content: JSON.stringify({ evaluations, suggestions: [{
      type: "faq", title: "學習", question: "點樣落單？", answer: "請到網站落單。",
      evidenceMessageIds: ["q1", "h1"], ...suggestion,
    }] }) } }] };
  }

  it("learns a traceable human-only reply without requiring a bot turn", () => {
    const result = parseLearningAnalysis(payload({}), [], messages, "test")!;
    expect(result.suggestions[0]).toMatchObject({ answer: "請到網站落單。", autoAliasEligible: true,
      evidenceMessageIds: ["q1", "h1"], evidenceTurnIds: [] });
  });

  it("does not borrow another answer from the same phone/day", () => {
    const result = parseLearningAnalysis(payload({ answer: "個案需要跟進。", evidenceMessageIds: ["q1", "h2"] }), [], messages, "test")!;
    expect(result.suggestions[0]).toMatchObject({ answer: "", autoAliasEligible: false });
  });

  it("requires all consecutive human replies rather than learning a partial acknowledgment", () => {
    const rows = [messages[0], { ...messages[1], text: "收到。" },
      { ...messages[1], id: "h3", createdAt: "2026-09-14T01:02:00Z" }];
    const result = parseLearningAnalysis(payload({ answer: "收到。\n請到網站落單。", evidenceMessageIds: ["q1", "h1", "h3"] }), [], rows, "test")!;
    expect(result.suggestions[0].answer).toBe("收到。\n請到網站落單。");
    expect(parseLearningAnalysis(payload({ answer: "收到。" }), [], rows, "test")!.suggestions[0].answer).toBe("");
  });

  it("does not accept human evidence without its customer question or with an invented question", () => {
    for (const change of [{ evidenceMessageIds: ["h1"] }, { question: "聽日可以接單嗎？" }]) {
      expect(parseLearningAnalysis(payload(change), [], messages, "test")!.suggestions[0].answer).toBe("");
    }
  });

  it("keeps the next human answer with the latest customer question", () => {
    const crossed = [messages[0], { ...messages[2], createdAt: "2026-09-14T01:00:30Z" }, messages[1]];
    expect(parseLearningAnalysis(payload({}), [], crossed, "test")!.suggestions[0].autoAliasEligible).toBe(false);
  });

  it("requires a sent and source-grounded bot answer for automatic learning", () => {
    const turn = { id: "t1", question: "點樣落單？", answer: "請到網站落單。", reply_sent: true, faq_source_ids: ["faq"] };
    const input = payload({ evidenceMessageIds: [], evidenceTurnIds: ["t1"] }, [{ turnId: "t1", outcome: "success", score: 1 }]);
    expect(parseLearningAnalysis(input, [turn], [], "test")!.suggestions[0].autoAliasEligible).toBe(true);
    expect(parseLearningAnalysis(input, [{ ...turn, reply_sent: false }], [], "test")!.suggestions[0].answer).toBe("");
    expect(parseLearningAnalysis(input, [{ ...turn, faq_source_ids: [] }], [], "test")!.suggestions[0].autoAliasEligible).toBe(false);
  });

  it("filters invented evidence and deduplicates evaluation IDs", () => {
    expect(parseLearningAnalysis(payload({ evidenceMessageIds: ["invented"] }), [], messages, "test")!.suggestions).toEqual([]);
    const turn = { id: "t1", question: "q", answer: "a", reply_sent: true };
    const input = payload({}, [{ turnId: "t1", outcome: "success" }, { turnId: "t1", outcome: "success" }]);
    expect(parseLearningAnalysis(input, [turn], messages, "test")!.evaluations).toHaveLength(1);
  });
});
