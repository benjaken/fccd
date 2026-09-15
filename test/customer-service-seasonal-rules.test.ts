import { describe, expect, it, vi } from "vitest";
import { handleCustomerServiceTurn, type CustomerServiceBotDeps, type CustomerServiceConversation } from "../supabase/functions/_shared/customer-service-bot";
import { extractCustomerServiceClockTime } from "../supabase/functions/_shared/customer-service-intents";

const pending: CustomerServiceConversation = {
  phone_normalized: "85291234567", state: "identifying", selected_order_id: null,
  handoff_at: null, pending_request: "availability:delivery_time",
  workflow_slots: { eventDate: "2026-12-25", availabilityQuestion: "12月25日可以訂Catering聖誕套餐嗎" },
};
const product = { name: "聖誕火雞盛宴", url: "https://example.com/turkey" };
function deps(check: NonNullable<CustomerServiceBotDeps["checkOrderIntakeAvailability"]>): CustomerServiceBotDeps {
  return { lookupOrders: vi.fn().mockResolvedValue([]), lookupOrderItems: vi.fn().mockResolvedValue([]),
    verifyOrderIdentity: vi.fn().mockResolvedValue(true), writeInquiry: vi.fn(),
    searchFaqs: vi.fn().mockResolvedValue([]), queueHandoff: vi.fn(), cancelHandoff: vi.fn(),
    checkOrderIntakeAvailability: check };
}
function turn(text: string, conversation: CustomerServiceConversation, runtime: CustomerServiceBotDeps) {
  return handleCustomerServiceTurn({ phone: pending.phone_normalized, text, conversation, deps: runtime });
}
describe("seasonal intake conversation safety", () => {
  it("keeps the requested peak time when selecting a recommended product", async () => {
    const check = vi.fn(async (_date: string, text: string, context?: { deliveryTime?: string | null }) => ({
      status: (context?.deliveryTime ?? extractCustomerServiceClockTime(text)) === "18:00" ? "manual_review" as const : "available" as const,
      recommendations: [product],
    }));
    const runtime = deps(check);
    const first = await turn("下午6點", pending, runtime);
    const second = await turn("我想訂聖誕火雞盛宴", first.conversation, runtime);
    expect(second.reply).not.toContain("可以落單");
    expect(second.conversation.pending_request).toBe("特別接單安排人工覆核");
    expect(check.mock.calls[1]?.[2]?.deliveryTime).toBe("18:00");
  });
  it.each(["unknown", "error"])("does not promise availability when lookup is %s", async (mode) => {
    const check = mode === "error" ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue({ status: "unknown" });
    const result = await turn("下午6點", pending, deps(check));
    expect(result.reply).not.toContain("可以落單");
    expect(result.failureReason).toBe("order_intake_unknown");
    expect(result.conversation.workflow_slots?.eventDate).toBe("2026-12-25");
    expect(result.conversation.workflow_slots?.deliveryTime).toBe("18:00");
  });
  it("routes a complaint containing a time to a human", async () => {
    const runtime = deps(vi.fn().mockResolvedValue({ status: "available" }));
    const result = await turn("我想投訴，昨天晚上7點送到的食物壞了", pending, runtime);
    expect(runtime.queueHandoff).toHaveBeenCalled();
    expect(runtime.checkOrderIntakeAvailability).not.toHaveBeenCalled();
    expect(result.reply).not.toContain("可以落單");
  });
  it("does not treat a shipping-fee question containing a time as a time answer", async () => {
    const runtime = deps(vi.fn().mockResolvedValue({ status: "available" }));
    await turn("下午6點之後運費幾多？", pending, runtime);
    expect(runtime.checkOrderIntakeAvailability).not.toHaveBeenCalled();
  });
  it("uses the replacement date and time instead of the previous request", async () => {
    const check = vi.fn().mockResolvedValue({ status: "available" });
    await turn("改為2026年12月26日晚上7點可以嗎", pending, deps(check));
    expect(check).toHaveBeenCalledWith("2026-12-26", expect.any(String), { deliveryTime: "19:00" });
  });
  it("recognizes an explicit next-year Lunar New Year date", async () => {
    const check = vi.fn().mockResolvedValue({ status: "manual_review" });
    await turn("改為2027年2月6日晚上6點可以嗎", pending, deps(check));
    expect(check).toHaveBeenCalledWith("2027-02-06", expect.any(String), { deliveryTime: "18:00" });
  });
});
