import { describe, expect, it } from "vitest";
import { isOrderingInstructionsRequest } from "../supabase/functions/_shared/customer-service-intents";

describe("standalone ordering instruction follow-ups", () => {
  it.each(["點落單呢", "咁點樣落單？", "請問點樣喺網站訂購？", "如何下單", "How do I order?", "How can I place an order?"])("recognizes %s", (text) => {
    expect(isOrderingInstructionsRequest(text)).toBe(true);
  });
  it.each(["點落單呢？另外我想投訴", "今日想訂餐，點落單", "14/10 可以落單嗎？", "幫我落單", "訂單未收到", "請問星期日係咪唔送貨？"])("preserves the full intent of %s", (text) => {
    expect(isOrderingInstructionsRequest(text)).toBe(false);
  });
});
