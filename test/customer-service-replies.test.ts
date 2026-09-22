import { describe, expect, it } from "vitest";

import {
  appendRelatedFaqsToReply,
  buildOrderChoiceButtons,
  buildRelatedFaqButtons,
  formatRelatedFaqsAppendix,
  handoffNoOpenOrderReply,
  lookupListReply,
  lookupNoActiveOrdersReply,
  shortenRelatedFaqLabel,
} from "../supabase/functions/_shared/customer-service-replies.ts";
import {
  classifyCustomerServiceOrderLifecycle,
  isActiveCustomerServiceOrder,
} from "../supabase/functions/_shared/customer-service-intents.ts";

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

describe("order lifecycle classification", () => {
  it("maps cancel and delivered statuses to coarse buckets", () => {
    expect(classifyCustomerServiceOrderLifecycle("已取消")).toBe("cancelled");
    expect(classifyCustomerServiceOrderLifecycle("Cancelled")).toBe("cancelled");
    expect(classifyCustomerServiceOrderLifecycle("已送達")).toBe("completed");
    expect(classifyCustomerServiceOrderLifecycle("delivered")).toBe("completed");
    expect(classifyCustomerServiceOrderLifecycle("待取貨")).toBe("active");
    expect(classifyCustomerServiceOrderLifecycle("已安排")).toBe("active");
  });

  it("treats unknown or empty status as active so live orders are never hidden", () => {
    expect(classifyCustomerServiceOrderLifecycle("")).toBe("active");
    expect(classifyCustomerServiceOrderLifecycle(null)).toBe("active");
    expect(classifyCustomerServiceOrderLifecycle("某個新狀態")).toBe("active");
    expect(isActiveCustomerServiceOrder({ delivery_status: "" })).toBe(true);
    expect(isActiveCustomerServiceOrder({ delivery_status: "已送達" })).toBe(false);
  });
});

describe("order status aware selection", () => {
  it("numbers the active order list and shows the coarse status", () => {
    const reply = lookupListReply([
      {
        order_number: "FCL2026090101",
        delivery_at: "2026-09-10T03:00:00.000Z",
        delivery_status: "待取貨",
      },
      { order_number: "FCL2026090202", delivery_at: null, delivery_status: "已安排" },
    ]);

    expect(reply).toContain("1. FCL2026090101");
    expect(reply).toContain("2. FCL2026090202");
    expect(reply).toContain("處理中");
    expect(reply).not.toContain("待取貨");
  });

  it("builds at most three order choice buttons from order numbers", () => {
    const result = buildOrderChoiceButtons([
      { orderId: "1", orderNumber: "FCL2026090101" },
      { orderId: "2", orderNumber: "FCL2026090202" },
      { orderId: "3", orderNumber: "FCL2026090303" },
      { orderId: "4", orderNumber: "FCL2026090404" },
    ]);

    expect(result?.body).toBe("請點選訂單：");
    expect(result?.buttons.map((button) => button.text)).toEqual([
      "FCL2026090101",
      "FCL2026090202",
      "FCL2026090303",
    ]);
  });

  it("does not offer a choice list when only completed or cancelled orders exist", () => {
    expect(lookupNoActiveOrdersReply()).toContain("冇處理中");
  });
});
