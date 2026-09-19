import { describe, expect, it, vi } from "vitest";
import { parseRecognizedHistoryCase, recognizeHistoryCase } from
  "../supabase/functions/_shared/customer-service-history-case-recognition";

describe("history scenario recognition", () => {
  it("accepts only bounded guidance labels", () => {
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "order_intake",
      steps: ["acknowledge", "ask_missing_details"], missingSlots: ["delivery_date"] }))
      .toEqual({ intent: "order_intake", steps: ["acknowledge", "ask_missing_details"],
        missingSlots: ["delivery_date"] });
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "order_intake",
      steps: ["promise_free_delivery"], missingSlots: [] })).toBeNull();
    expect(parseRecognizedHistoryCase({ reusable: false, intent: "order_intake",
      steps: ["acknowledge"], missingSlots: [] })).toBeNull();
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "special_request",
      steps: ["check_order_state"], missingSlots: [] })).toBeNull();
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "refund_request",
      steps: ["acknowledge", "check_order_state"], missingSlots: ["order_id"] })).toBeNull();
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "refund_request",
      steps: ["acknowledge", "check_order_state", "handoff_if_needed"],
      missingSlots: ["order_id"] })?.intent).toBe("refund_request");
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "quality_complaint",
      steps: ["acknowledge"], missingSlots: ["evidence_photo"] })).toBeNull();
    expect(parseRecognizedHistoryCase({ reusable: true, intent: "delivery_delay",
      steps: ["acknowledge", "check_delivery_state"], missingSlots: ["order_id"] })?.intent)
      .toBe("delivery_delay");
  });

  it("uses AI only to select labels and drops any generated answer prose", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        reusable: true, intent: "order_intake", steps: ["acknowledge"], missingSlots: [],
        answer: "未核實的免費送貨承諾",
      }) } }] }),
    });
    const result = await recognizeHistoryCase({ question: "送貨點安排？", context: [],
      humanReply: "可以免費送貨", config: { enabled: true, endpoint: "https://example.test",
        apiKey: "test-key", model: "test", timeoutMs: 1000 }, fetchImpl });
    expect(result).toEqual({ intent: "order_intake", steps: ["acknowledge"], missingSlots: [] });
    expect(JSON.stringify(result)).not.toContain("免費送貨");
  });
});
