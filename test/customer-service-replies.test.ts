import { describe, expect, it } from "vitest";

import {
  appendRelatedFaqsToReply,
  buildRelatedFaqButtons,
  formatRelatedFaqsAppendix,
  handoffNoOpenOrderReply,
  shortenRelatedFaqLabel,
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

describe("related FAQ interactive buttons", () => {
  it("keeps a short question unchanged", () => {
    expect(shortenRelatedFaqLabel("可唔可以自取？")).toBe("可唔可以自取？");
  });

  it("prefers the final question sentence of a long question", () => {
    expect(
      shortenRelatedFaqLabel("想訂10至12人餐 $1600 7月30號6-7pm 送貨。請問會收運費嗎？"),
    ).toBe("請問會收運費嗎？");
  });

  it("hard-truncates when no question sentence fits", () => {
    const label = shortenRelatedFaqLabel("abcdefghijklmnopqrstuvwxyz");
    expect(label.length).toBe(20);
    expect(label.endsWith("…")).toBe(true);
  });

  it("builds at most three unique buttons with a body", () => {
    const result = buildRelatedFaqButtons([
      { question: "可唔可以自取？" },
      { question: "送貨需時幾耐？" },
      { question: "可唔可以自取？" },
      { question: "付款方式有邊幾種？" },
      { question: "第四條問題？" },
    ]);

    expect(result).not.toBeNull();
    expect(result!.body).toBe("你可能仲想問：");
    expect(result!.buttons).toHaveLength(3);
    expect(result!.buttons.map((b) => b.text)).toEqual([
      "可唔可以自取？",
      "送貨需時幾耐？",
      "付款方式有邊幾種？",
    ]);
    for (const button of result!.buttons) {
      expect(button.text.length).toBeLessThanOrEqual(20);
    }
  });

  it("returns null when there are no suggestions", () => {
    expect(buildRelatedFaqButtons([])).toBeNull();
    expect(buildRelatedFaqButtons([{ question: "   " }])).toBeNull();
  });
});
