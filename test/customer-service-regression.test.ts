import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { handleCustomerServiceTurn, type CustomerServiceBotDeps, type CustomerServiceConversation, type CustomerServiceFaqHit, type CustomerServiceOrder, type CustomerServiceOrderItem } from "../supabase/functions/_shared/customer-service-bot";
import { classifyCustomerServiceMessage, extractCustomerServiceClockTime, type ClassifiedMessage } from "../supabase/functions/_shared/customer-service-intents";
import { evaluateOrderIntakeWithCatalog, type OrderIntakeRule } from "../supabase/functions/_shared/customer-service-order-intake";
import { compareRegressionTurn, validateRegressionCase } from "../scripts/lib/customer-service-regression.mjs";

type Case = {
  id: string; title: string; status: "draft" | "approved"; clock: string;
  source: { kind: string; reference: string };
  initialConversation?: Partial<CustomerServiceConversation>;
  world?: {
    faqs?: CustomerServiceFaqHit[]; orders?: CustomerServiceOrder[]; items?: CustomerServiceOrderItem[];
    rules?: OrderIntakeRule[]; products?: Array<{ channelId: string; name: string; url: string }>;
    intakeFailure?: "unknown" | "error"; replies?: CustomerServiceBotDeps["replyTemplates"];
  };
  turns: Array<{ customer: string; recordedClassification?: Partial<ClassifiedMessage>; referenceReplies?: Array<{ role: string; text: string }>; expect: Record<string, unknown> }>;
};
const directory = resolve("test/fixtures/customer-service-regression");
const cases = readdirSync(directory).filter((file) => file.endsWith(".json")).sort().map((file) => {
  const value = JSON.parse(readFileSync(resolve(directory, file), "utf8"));
  const errors = validateRegressionCase(value);
  if (errors.length) throw new Error(`${file}:\n${errors.join("\n")}`);
  return value as Case;
});
if (!cases.some((fixture) => fixture.status === "approved")) throw new Error("Regression corpus must contain an approved case");
if (new Set(cases.map((fixture) => fixture.id)).size !== cases.length) throw new Error("Duplicate regression case id");
const reports: Array<Record<string, unknown>> = [];

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterAll(() => {
  const reportDirectory = resolve("output/customer-service-regression");
  mkdirSync(reportDirectory, { recursive: true });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = { generatedAt: new Date().toISOString(), commit: sha, mode: "offline-fixed-data", results: reports,
    drafts: cases.filter((fixture) => fixture.status === "draft").map((fixture) => ({ id: fixture.id, title: fixture.title })) };
  writeFileSync(resolve(reportDirectory, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(reportDirectory, "latest.md"), [
    "# 客服對話回歸測試", "", `版本：${sha}`, "", "固定日期與模擬資料；不呼叫線上 AI、不寫資料庫、不發訊息。", "",
    ...reports.flatMap((result) => [`## ${result.id} — ${result.status}`, "", `來源：${result.source}`, "", ...((result.turns as Array<{ customer: string; expected: Record<string, unknown>; actual: { reply: string | null }; differences: string[] }>).flatMap((turn, index) => [
      `### 第 ${index + 1} 輪`, "", `客人：${turn.customer}`, "", `目前回覆：${turn.actual.reply ?? "（不回覆）"}`, "",
      "預期條件：", "", "```json", JSON.stringify(turn.expected, null, 2), "```", "",
      ...turn.differences.map((difference) => `- ${difference}`), "",
    ]))]),
    "## 待確認案例", "", ...report.drafts.map((draft) => `- ${draft.id}：${draft.title}`), "",
  ].join("\n"));
});

describe("approved historical customer-service conversations", () => {
  for (const fixture of cases) {
    it.skipIf(fixture.status === "draft")(`${fixture.id}: ${fixture.title}`, async () => {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(fixture.clock));
      vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network calls are forbidden in offline regression replay"); }));
      const world = structuredClone(fixture.world ?? {});
      const checkIntake = vi.fn<NonNullable<CustomerServiceBotDeps["checkOrderIntakeAvailability"]>>(async (date, text, context) => {
        if (world.intakeFailure === "error") throw new Error("Recorded intake outage");
        if (world.intakeFailure === "unknown") return { status: "unknown" };
        return evaluateOrderIntakeWithCatalog({ date, text, time: context?.deliveryTime ?? extractCustomerServiceClockTime(text) }, world.rules ?? [],
          async (channelId, terms) => (world.products ?? []).filter((item) => item.channelId === channelId && terms.some((term) => item.name.includes(term))),
        );
      });
      const writeInquiry = vi.fn().mockResolvedValue({ quote_id: "fixture-quote", order_number: "TEST-QUOTE", created: true });
      const queueHandoff = vi.fn().mockResolvedValue(undefined);
      const deps: CustomerServiceBotDeps = { lookupOrders: vi.fn().mockResolvedValue(world.orders ?? []), lookupOrderItems: vi.fn().mockResolvedValue(world.items ?? []),
        verifyOrderIdentity: vi.fn().mockResolvedValue(true), searchFaqs: vi.fn().mockResolvedValue(world.faqs ?? []),
        writeInquiry, queueHandoff, cancelHandoff: vi.fn().mockResolvedValue(true), checkOrderIntakeAvailability: checkIntake, replyTemplates: world.replies };
      let conversation: CustomerServiceConversation = { phone_normalized: "85200000000", state: "identifying", selected_order_id: null, handoff_at: null, pending_request: null,
        ...structuredClone(fixture.initialConversation ?? {}) };
      const turns = [];
      for (const recorded of fixture.turns) {
        writeInquiry.mockClear(); queueHandoff.mockClear(); checkIntake.mockClear();
        const turn = await handleCustomerServiceTurn({ phone: conversation.phone_normalized, text: recorded.customer, conversation, deps,
          ...(recorded.recordedClassification ? { classify: (text: string) => ({ ...classifyCustomerServiceMessage(text), ...recorded.recordedClassification, usedModel: true }) } : {}) });
        const check = checkIntake.mock.calls.at(-1);
        const actual = { reply: turn.reply, intent: turn.intentKey, state: turn.conversation.state, pendingRequest: turn.conversation.pending_request,
          slots: turn.conversation.workflow_slots ?? {}, effects: { writeInquiry: writeInquiry.mock.calls.length, queueHandoff: queueHandoff.mock.calls.length },
          failureReason: turn.failureReason ?? null, intakeDate: check?.[0], intakeTime: check?.[2]?.deliveryTime ?? (check ? extractCustomerServiceClockTime(check[1]) || null : undefined) };
        turns.push({ customer: recorded.customer, referenceReplies: recorded.referenceReplies ?? [], expected: recorded.expect, actual,
          differences: compareRegressionTurn(actual, recorded.expect) });
        conversation = { ...turn.conversation, recent_messages: [ ...(conversation.recent_messages ?? []), { role: "customer", text: recorded.customer },
          ...(turn.reply ? [{ role: "assistant" as const, text: turn.reply }] : []) ] };
      }
      const failures = turns.flatMap((turn, index) => turn.differences.map((difference: string) => `Turn ${index + 1}: ${difference}`));
      reports.push({ id: fixture.id, source: `${fixture.source.kind}: ${fixture.source.reference}`, status: failures.length ? "failed" : "passed", turns });
      expect(failures, `${fixture.id}\n${failures.join("\n")}\nSee output/customer-service-regression/latest.json`).toEqual([]);
    });
  }
});
