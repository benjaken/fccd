import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCustomerServiceTurn, type CustomerServiceBotDeps, type CustomerServiceConversation } from "../supabase/functions/_shared/customer-service-bot";
import { classifyCustomerServiceMessage, resolveCustomerServiceDeliveryDate } from "../supabase/functions/_shared/customer-service-intents";

const conversation: CustomerServiceConversation = { phone_normalized: "85291234567", state: "identifying", selected_order_id: null, handoff_at: null, pending_request: null };
function runtime(): CustomerServiceBotDeps {
  return { lookupOrders: vi.fn().mockResolvedValue([]), lookupOrderItems: vi.fn().mockResolvedValue([]),
    verifyOrderIdentity: vi.fn(), writeInquiry: vi.fn(), searchFaqs: vi.fn().mockResolvedValue([]),
    queueHandoff: vi.fn(), cancelHandoff: vi.fn(), checkOrderIntakeAvailability: vi.fn().mockResolvedValue({ status: "available" }) };
}
afterEach(() => { vi.useRealTimers(); });
describe("relative delivery dates", () => {
  it("recognizes the original Sunday wording without needing model classification", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-15T07:00:00Z"));
    const result = classifyCustomerServiceMessage("請問星期日係咪唔送貨？");
    expect(result.configuredIntentKey).toBe("delivery_availability");
    expect(result.slots.eventDate).toBe("2026-09-20");
  });
  it.each(["星期六或星期日", "每個星期日", "2026-02-30 星期日"])("does not invent a single date for %s", (text) => {
    expect(resolveCustomerServiceDeliveryDate(text, new Date("2026-09-15T07:00:00Z"))).toBe("");
  });
  it.each([
    ["2026-09-15T07:00:00Z", "請問星期日係咪唔送貨？", "2026-09-20"],
    ["2026-09-15T07:00:00Z", "今個星期日送唔送貨？", "2026-09-20"],
    ["2026-09-15T07:00:00Z", "下星期日送唔送貨？", "2026-09-27"],
    ["2026-09-19T16:05:00Z", "星期日送唔送貨？", "2026-09-20"],
    ["2026-12-31T16:05:00Z", "明天送唔送貨？", "2027-01-02"],
    ["2026-09-15T07:00:00Z", "9月27日星期日送唔送貨？", "2026-09-27"],
  ])("resolves %s / %s to %s before invoking intake", async (now, text, date) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now));
    const deps = runtime();
    const result = await handleCustomerServiceTurn({ phone: conversation.phone_normalized, text, conversation, deps,
      classify: async (body) => ({ ...classifyCustomerServiceMessage(body), configuredIntentKey: "delivery_availability", usedModel: true }),
    });
    expect(deps.checkOrderIntakeAvailability).toHaveBeenCalledWith(date, text);
    expect(result.reply).not.toMatch(/undefined|NaN/);
    expect(result.conversation.workflow_slots?.eventDate).toBe(date);
  });
  it("asks for a date before querying when the model selects availability without any usable date", async () => {
    const deps = runtime();
    const result = await handleCustomerServiceTurn({ phone: conversation.phone_normalized, text: "係咪唔送貨？", conversation, deps,
      classify: async (body) => ({ ...classifyCustomerServiceMessage(body), configuredIntentKey: "delivery_availability", usedModel: true }),
    });
    expect(deps.checkOrderIntakeAvailability).not.toHaveBeenCalled();
    expect(result.reply).toContain("日期");
    expect(result.reply).not.toMatch(/undefined|NaN/);
    expect(result.conversation.pending_request).toBe("availability:date");
    expect(result.toolKeys).not.toContain("check_order_intake");
    const followUp = await handleCustomerServiceTurn({ phone: conversation.phone_normalized, text: "2026-09-20", conversation: result.conversation, deps });
    expect(deps.checkOrderIntakeAvailability).toHaveBeenCalledWith("2026-09-20", "2026-09-20");
    expect(followUp.reply).toContain("20/9（星期日）");
  });
});
