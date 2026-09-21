import { describe, expect, it } from "vitest";
import {
  buildHumanLearningConversations,
  evaluateLearningFaqCandidate,
  isSafeFaqAliasSuggestion,
  parseLearningAnalysis,
  selectStorableLearningSuggestions,
} from "../supabase/functions/_shared/customer-service-learning";

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
    expect(result.suggestions).toEqual([]);
  });

  it("requires all consecutive human replies rather than learning a partial acknowledgment", () => {
    const rows = [messages[0], { ...messages[1], text: "收到。" },
      { ...messages[1], id: "h3", createdAt: "2026-09-14T01:02:00Z" }];
    const result = parseLearningAnalysis(payload({ answer: "收到。\n請到網站落單。", evidenceMessageIds: ["q1", "h1", "h3"] }), [], rows, "test")!;
    expect(result.suggestions[0].answer).toBe("收到。\n請到網站落單。");
    expect(parseLearningAnalysis(payload({ answer: "收到。" }), [], rows, "test")!.suggestions).toEqual([]);
  });

  it("does not accept human evidence without its customer question or with an invented question", () => {
    for (const change of [{ evidenceMessageIds: ["h1"] }, { question: "聽日可以接單嗎？" }]) {
      expect(parseLearningAnalysis(payload(change), [], messages, "test")!.suggestions).toEqual([]);
    }
  });

  it("does not learn a customer question that was superseded before the human reply", () => {
    const crossed = [messages[0], { ...messages[2], createdAt: "2026-09-14T01:00:30Z" }, messages[1]];
    expect(parseLearningAnalysis(payload({}), [], crossed, "test")!.suggestions).toEqual([]);
  });

  it("requires a sent and source-grounded bot answer for automatic learning", () => {
    const turn = { id: "t1", question: "點樣落單？", answer: "請到網站落單。", reply_sent: true, faq_source_ids: ["faq"] };
    const input = payload({ evidenceMessageIds: [], evidenceTurnIds: ["t1"] }, [{ turnId: "t1", outcome: "success", score: 1 }]);
    expect(parseLearningAnalysis(input, [turn], [], "test")!.suggestions[0].autoAliasEligible).toBe(true);
    expect(parseLearningAnalysis(input, [{ ...turn, reply_sent: false }], [], "test")!.suggestions).toEqual([]);
    expect(parseLearningAnalysis(input, [{ ...turn, faq_source_ids: [] }], [], "test")!.suggestions).toEqual([]);
  });

  it("drops greeting, urgent and clarification FAQs instead of leaving empty drafts", () => {
    const greeting = [
      { id: "g1", phone: "phone", role: "customer" as const, text: "Hello", createdAt: "2026-09-14T01:00:00Z" },
      { id: "g2", phone: "phone", role: "human" as const, text: "你好，請問是查詢現有訂單，還是需要到會訂餐協助？", createdAt: "2026-09-14T01:01:00Z" },
    ];
    const urgent = [
      { id: "u1", phone: "phone", role: "customer" as const, text: "急單, 想今日18:00送到, 可以嗎？", createdAt: "2026-09-14T01:00:00Z" },
      { id: "u2", phone: "phone", role: "human" as const, text: "你好，請問送貨地區？", createdAt: "2026-09-14T01:01:00Z" },
    ];
    expect(parseLearningAnalysis(payload({
      question: "Hello", answer: "你好，請問是查詢現有訂單，還是需要到會訂餐協助？",
      evidenceMessageIds: ["g1", "g2"],
    }), [], greeting, "test")!.suggestions).toEqual([]);
    expect(parseLearningAnalysis(payload({
      question: "急單, 想今日18:00送到, 可以嗎？", answer: "你好，請問送貨地區？",
      evidenceMessageIds: ["u1", "u2"],
    }), [], urgent, "test")!.suggestions).toEqual([]);
  });

  const runtimeTargets = {
    intents: [{ key: "lookup_order", displayName: "查單", detail: "查詢訂單" }],
    replyTemplates: [{ key: "thanks", displayName: "感謝", detail: "" }],
    workflowPolicies: [{ key: "order_change", displayName: "改單", detail: "處理改單" }],
  };

  it("keeps only executable runtime_changes for intent/policy suggestions", () => {
    const input = payload({
      type: "policy",
      runtime_changes: [
        { target: "intent", key: "lookup_order", patch: { description_append: "查詢訂單狀態", extra: 1 } },
        { target: "workflow_policy", key: "order_change", patch: { clarification_threshold: 0.8 } },
        { target: "reply_template", key: "missing", patch: { content: "不在清單" } },
        { target: "intent", key: "invented", patch: { examples_append: ["新問法"] } },
        { target: "reply_template", key: "thanks", patch: { enabled: true } },
        { target: "workflow_policy", key: "order_change", patch: { context_window: 99 } },
      ],
    });
    const result = parseLearningAnalysis(input, [], messages, "test", runtimeTargets)!;
    expect(result.suggestions[0].runtimeChanges).toEqual([
      { target: "intent", key: "lookup_order", patch: { description_append: "查詢訂單狀態" } },
      { target: "workflow_policy", key: "order_change", patch: { clarification_threshold: 0.8 } },
    ]);
  });

  it("never attaches runtime_changes to FAQ suggestions", () => {
    const input = payload({
      runtime_changes: [{ target: "intent", key: "lookup_order", patch: { description_append: "x" } }],
    });
    const result = parseLearningAnalysis(input, [], messages, "test", runtimeTargets)!;
    expect(result.suggestions[0].runtimeChanges).toEqual([]);
  });

  it("filters invented evidence and deduplicates evaluation IDs", () => {
    expect(parseLearningAnalysis(payload({ evidenceMessageIds: ["invented"] }), [], messages, "test")!.suggestions).toEqual([]);
    const turn = { id: "t1", question: "q", answer: "a", reply_sent: true };
    const input = payload({}, [{ turnId: "t1", outcome: "success" }, { turnId: "t1", outcome: "success" }]);
    expect(parseLearningAnalysis(input, [turn], messages, "test")!.evaluations).toHaveLength(1);
  });
});

describe("learning FAQ store gate", () => {
  const published = [{
    question: "HK Lunch Box 有冇餐牌可以睇？",
    answer: "Hello 你好，可以上網站訂購\nhttps://hklunchbox.com/collections/mealbox",
    keywords: "HK Lunch Box,hklunchbox,飯盒,便當",
  }];

  it("rejects greetings, urgent orders, brand intros and clarification answers", () => {
    expect(evaluateLearningFaqCandidate({
      question: "Hello",
      answer: "你好，請問是查詢現有訂單，還是需要到會訂餐協助？",
      evidenceQuestions: ["Hello"],
      publishedFaqs: published,
    })).toEqual({ ok: false, reason: "greeting" });
    expect(evaluateLearningFaqCandidate({
      question: "急單, 想今日18:00送到, 可以嗎？",
      answer: "你好，請問送貨地區？",
      evidenceQuestions: ["急單, 想今日18:00送到, 可以嗎？"],
      publishedFaqs: published,
    })).toEqual({ ok: false, reason: "urgent_order" });
    expect(evaluateLearningFaqCandidate({
      question: "你好，我想問有關 HKlunchbox 飯盒送餐的問題。",
      answer: "你好，請問有咩幫到你？😊",
      evidenceQuestions: ["你好，我想問有關 HKlunchbox 飯盒送餐的問題。"],
      publishedFaqs: published,
    }).ok).toBe(false);
  });

  it("keeps a grounded FAQ that does not steal published or control queries", () => {
    expect(evaluateLearningFaqCandidate({
      question: "點樣落單？",
      answer: "請到網站落單。",
      evidenceQuestions: ["點樣落單？"],
      publishedFaqs: published,
    })).toEqual({ ok: true, reason: "" });
  });

  it("does not store blocked FAQ suggestions but keeps policy changes", () => {
    const kept = selectStorableLearningSuggestions([
      {
        type: "faq", title: "開場", reason: "x", question: "Hello",
        answer: "你好，請問是查詢現有訂單，還是需要到會訂餐協助？",
        category: "ordering", keywords: "", evidenceTurnIds: [],
        evidenceMessageIds: ["q1"], autoAliasEligible: false, runtimeChanges: [],
      },
      {
        type: "faq", title: "落單", reason: "x", question: "點樣落單？",
        answer: "請到網站落單。", category: "ordering", keywords: "落單",
        evidenceTurnIds: [], evidenceMessageIds: ["q2"], autoAliasEligible: true, runtimeChanges: [],
      },
      {
        type: "policy", title: "改單", reason: "x", question: "", answer: "",
        category: "ordering", keywords: "", evidenceTurnIds: ["t1"],
        evidenceMessageIds: [], autoAliasEligible: false,
        runtimeChanges: [{ target: "intent", key: "lookup_order", patch: { description_append: "查單" } }],
      },
    ], {
      messages: [
        { id: "q1", phone: "1", role: "customer", text: "Hello", createdAt: "2026-09-21T01:00:00Z" },
        { id: "q2", phone: "1", role: "customer", text: "點樣落單？", createdAt: "2026-09-21T01:01:00Z" },
      ],
      turns: [],
      publishedFaqs: published,
    });
    expect(kept.map((item) => item.title)).toEqual(["落單", "改單"]);
  });
});
