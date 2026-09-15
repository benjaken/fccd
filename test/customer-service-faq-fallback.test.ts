import { describe, expect, it, vi } from "vitest";
import { handleCustomerServiceTurn, type CustomerServiceBotDeps } from "../supabase/functions/_shared/customer-service-bot.ts";

const faq = { id: "curbside", question: "車邊交收是什麼", answer: "司機會在地址附近可免費停車的位置交收，抵達前致電確認。" };
const longQuery = "請問車邊交收是什麼，如在屋苑地下收貨不用上樓，是否屬於車邊收貨";
function setup(result: unknown = { answer: faq.answer, sourceIds: [faq.id], model: "test" }, hits = [faq]) {
  const deps: CustomerServiceBotDeps = {
    lookupOrders: vi.fn().mockResolvedValue([]), lookupOrderItems: vi.fn().mockResolvedValue([]),
    verifyOrderIdentity: vi.fn().mockResolvedValue(false), writeInquiry: vi.fn(),
    searchFaqs: vi.fn().mockResolvedValue(hits), queueHandoff: vi.fn(), cancelHandoff: vi.fn(),
    answerFaqWithModel: vi.fn().mockResolvedValue(result),
  };
  const run = (text = longQuery) => handleCustomerServiceTurn({phone: "85291234567", text,
    conversation: {phone_normalized: "85291234567", state: "identifying", selected_order_id: null, handoff_at: null, pending_request: null}, deps});
  return { deps, run };
}
describe("published FAQ semantic fallback", () => {
  it.each([longQuery, "司機通常喺邊個位置同我交收？", "樓下不能停車，能交收嗎？"])("checks retrieved knowledge for %s", async (query) => {
    const { deps, run } = setup();
    const result = await run(query);
    expect(deps.answerFaqWithModel).toHaveBeenCalledWith(query, [faq]);
    expect(result.faqSourceIds).toEqual([faq.id]);
    expect(result.reply).toContain(faq.answer);
    expect(deps.searchFaqs).toHaveBeenCalledTimes(1);
  });
  it("keeps exact answers on the existing fast path", async () => {
    const { deps, run } = setup();
    expect((await run(faq.question)).reply).toContain(faq.answer);
    expect(deps.answerFaqWithModel).not.toHaveBeenCalled();
  });
  it.each([null, "unsupported answer", {answer: "unsupported answer", sourceIds: [], model: "test"}, {answer: "unsupported answer", sourceIds: ["unknown"], model: "test"}])("does not copy a weak candidate when semantic verification fails: %j", async (answer) => {
    const { deps, run } = setup(answer);
    expect((await run()).failureReason).toBe("faq_not_found");
    expect(deps.answerFaqWithModel).toHaveBeenCalledOnce();
  });
  it("does not ask the model without published candidates", async () => {
    const { deps, run } = setup(null, []);
    await run();
    expect(deps.answerFaqWithModel).not.toHaveBeenCalled();
  });
  it.each(["付款", "送貨", "幫我改送貨地址", "已付款但未入帳", "今日想訂餐"])("does not bypass existing routing for %s", async (query) => {
    const { deps, run } = setup();
    await run(query);
    expect(deps.answerFaqWithModel).not.toHaveBeenCalled();
  });
  it("does not reuse candidates excluded by an existing rule", async () => {
    const { deps, run } = setup(null, [{id: "payment", question: "接受咩付款方式？", answer: "接受信用卡。"}]);
    await run("付款失敗可以用什麼付款方式？");
    expect(deps.answerFaqWithModel).not.toHaveBeenCalled();
  });
  it("fails closed when the model is unavailable", async () => {
    const { deps, run } = setup();
    deps.answerFaqWithModel = vi.fn().mockRejectedValue(new Error("timeout"));
    expect((await run()).failureReason).toBe("faq_not_found");
  });
  it("does not return unrelated or conflicting candidates after model abstention", async () => {
    const hits = [faq, {id: "other", question: "其他品牌交收安排", answer: "只限店內自取。"}];
    const { deps, run } = setup(null, hits);
    const result = await run();
    expect(deps.answerFaqWithModel).toHaveBeenCalledWith(longQuery, hits);
    expect(result.failureReason).toBe("faq_not_found");
    expect(result.reply).not.toContain(hits[1].answer);
  });
  it("does not use weak matches when AI is disabled", async () => {
    const { deps, run } = setup();
    delete deps.answerFaqWithModel;
    expect((await run()).failureReason).toBe("faq_not_found");
  });
});
