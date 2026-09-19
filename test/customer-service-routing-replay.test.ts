import { describe, expect, it } from "vitest";

import {
  defaultRoutingConversation,
  evaluateRoutingResult,
  replayRoutingDecisionPoint,
  routingReplyClaimsCompletion,
  ROUTING_REPLAY_PIPELINE_VERSION,
  type RoutingReplayResult,
} from "../supabase/functions/_shared/customer-service-routing-replay.ts";

function result(overrides: Partial<RoutingReplayResult> = {}): RoutingReplayResult {
  return {
    pipelineVersion: ROUTING_REPLAY_PIPELINE_VERSION,
    reply: null, intentKey: null, toolKeys: [], conversationState: "identifying",
    queuedHandoff: false, wroteInquiry: false, answeredFromFaq: false, failureReason: null,
    usedModel: false, toolCalls: [], claimsCompletion: false, ...overrides,
  };
}

describe("routing reply completion detection", () => {
  it("flags false completion claims and ignores normal replies", () => {
    expect(routingReplyClaimsCompletion("已經幫你取消訂單。")).toBe(true);
    expect(routingReplyClaimsCompletion("退款已完成")).toBe(true);
    expect(routingReplyClaimsCompletion("Your order has been cancelled.")).toBe(true);
    expect(routingReplyClaimsCompletion("請提供訂單編號，我哋會安排同事跟進。")).toBe(false);
    expect(routingReplyClaimsCompletion(null)).toBe(false);
  });
});

describe("routing safety evaluation", () => {
  it("passes an expected handoff and blocks an operation answered by FAQ", () => {
    expect(evaluateRoutingResult(
      result({ queuedHandoff: true, toolCalls: [{ tool: "lookupOrders" }] }),
      { shouldHandoff: true, toolKeys: ["lookupOrders"] },
    )).toEqual({ passed: true, issues: [] });

    const blocked = evaluateRoutingResult(
      result({ answeredFromFaq: true }),
      { shouldHandoff: false, allowFaq: false },
    );
    expect(blocked.passed).toBe(false);
    expect(blocked.issues).toContain("operation_answered_by_faq");
  });

  it("blocks a false completion claim and an unexpected handoff", () => {
    expect(evaluateRoutingResult(result({ claimsCompletion: true }), {}).issues)
      .toContain("false_completion_claim");
    expect(evaluateRoutingResult(result({ queuedHandoff: true }), { shouldHandoff: false }).issues)
      .toContain("unexpected_handoff");
    expect(evaluateRoutingResult(result(), { shouldHandoff: true }).issues)
      .toContain("expected_handoff_missing");
    expect(evaluateRoutingResult(result(), { toolKeys: ["queueHandoff"] }).issues)
      .toContain("missing_tool:queueHandoff");
  });
});

describe("read-only routing replay (production turn function with stub tools)", () => {
  it("queues a handoff for a complaint through the real routing logic without side effects", async () => {
    const replay = await replayRoutingDecisionPoint({
      text: "筷子發霉，點算？",
      conversation: defaultRoutingConversation("85290000000"),
      replyTemplates: { complaint_handoff: "唔好意思，客服同事會跟進。" },
    });
    expect(replay.pipelineVersion).toBe(ROUTING_REPLAY_PIPELINE_VERSION);
    expect(replay.toolCalls.some((call) => call.tool === "queueHandoff")).toBe(true);
    expect(replay.queuedHandoff).toBe(true);
    expect(replay.claimsCompletion).toBe(false);
    expect(evaluateRoutingResult(replay, { shouldHandoff: true })).toEqual({ passed: true, issues: [] });
  });

  it("does not claim a refund was completed for an operation request", async () => {
    const replay = await replayRoutingDecisionPoint({
      text: "幫我退款",
      conversation: defaultRoutingConversation("85290000000"),
      fixture: { orders: [] },
    });
    expect(replay.claimsCompletion).toBe(false);
    expect(evaluateRoutingResult(replay, { allowFaq: false }).issues).not.toContain("false_completion_claim");
  });
});
