import { describe, expect, it } from "vitest";

import {
  appendRelatedFaqsToReply,
  formatRelatedFaqsAppendix,
  handoffNoOpenOrderReply,
} from "../supabase/functions/_shared/customer-service-replies.ts";

describe("related FAQ reply appendix", () => {
  it("formats a Cantonese numbered suggestion list", () => {
    expect(
      formatRelatedFaqsAppendix([
        { question: "可唔可以自取？" },
        { question: "送貨需時幾耐？" },
      ]),
    ).toBe("你可能仲想問：\n1. 可唔可以自取？\n2. 送貨需時幾耐？");
  });

  it("returns empty appendix and leaves reply unchanged when there are no suggestions", () => {
    expect(formatRelatedFaqsAppendix([])).toBe("");
    expect(appendRelatedFaqsToReply("新界 HK$50。", [])).toBe("新界 HK$50。");
  });

  it("appends the suggestion block after the FAQ answer", () => {
    expect(
      appendRelatedFaqsToReply("新界 HK$50。", [
        { question: "可唔可以自取？" },
      ]),
    ).toBe("新界 HK$50。\n\n你可能仲想問：\n1. 可唔可以自取？");
  });
});

describe("unmatched order wording", () => {
  it("does not tell the customer that their WhatsApp number is unregistered", () => {
    const reply = handoffNoOpenOrderReply();

    expect(reply).toContain("暫時未能定位相關未送貨訂單");
    expect(reply).not.toContain("WhatsApp 號碼");
    expect(reply).not.toContain("未登記");
  });
});
