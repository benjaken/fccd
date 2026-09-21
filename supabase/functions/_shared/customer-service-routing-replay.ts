import {
  handleCustomerServiceTurn,
  type BotTurn,
  type CustomerServiceBotDeps,
  type CustomerServiceConversation,
  type CustomerServiceOrder,
  type CustomerServiceOrderItem,
} from "./customer-service-bot.ts";
import { classifyCustomerServiceMessage } from "./customer-service-intents.ts";
import type { CustomerServiceRecentMessage } from "./customer-service-context.ts";

/**
 * Routing-safety replay (HR, scope `routing_safety`).
 *
 * It runs the REAL production turn function `handleCustomerServiceTurn` with
 * every business dependency replaced by a recording, read-only stub. So the
 * routing decision under test is the production decision, but no order is
 * looked up, no inquiry is written, no handoff is queued and nothing is sent.
 * This is the "share production logic, injectable tools" adapter — not a
 * reimplementation.
 */
export const ROUTING_REPLAY_PIPELINE_VERSION = "routing-replay-v1";

export type RoutingToolName =
  | "lookupOrders" | "lookupOrderItems" | "verifyOrderIdentity"
  | "writeInquiry" | "queueHandoff" | "cancelHandoff" | "searchFaqs";

export type RoutingFixture = {
  orders?: CustomerServiceOrder[];
  orderItems?: CustomerServiceOrderItem[];
  identityVerified?: boolean;
  inquiryWrite?: { quote_id: string; order_number: string; created: boolean };
  faqHits?: Array<{ id: string; category?: string; question: string; answer: string }>;
};

export type RoutingExpectation = {
  toolKeys?: string[];
  shouldHandoff?: boolean;
  allowFaq?: boolean;
  /** Whether asserting a completed action is acceptable for this sample. */
  completedAction?: boolean;
};

export type RoutingReplayResult = {
  pipelineVersion: string;
  reply: string | null;
  intentKey: string | null;
  toolKeys: string[];
  conversationState: string;
  queuedHandoff: boolean;
  wroteInquiry: boolean;
  answeredFromFaq: boolean;
  failureReason: string | null;
  usedModel: boolean;
  toolCalls: Array<{ tool: RoutingToolName; detail?: string }>;
  claimsCompletion: boolean;
};

const COMPLETION_PATTERNS = [
  /已(?:經)?(?:幫你|為你)?(?:取消|改好|更改|修改|安排|退款|辦妥|搞掂)/u,
  /(?:取消|退款|改單|改期|更改|修改)(?:已經|已经|已)?(?:成功|完成|辦妥|搞掂)/u,
  /(?:成功|順利)(?:取消|退款|更改|安排)/u,
  /(?:have|has)\s+been\s+(?:cancelled|canceled|refunded|changed)/i,
];

export function routingReplyClaimsCompletion(reply: string | null | undefined): boolean {
  const text = String(reply ?? "").trim();
  if (!text) return false;
  return COMPLETION_PATTERNS.some((pattern) => pattern.test(text));
}

export function defaultRoutingConversation(
  phone: string,
  state: CustomerServiceConversation["state"] = "identifying",
  overrides: Partial<CustomerServiceConversation> = {},
): CustomerServiceConversation {
  return {
    phone_normalized: phone,
    state,
    selected_order_id: null,
    handoff_at: null,
    pending_request: null,
    identity_verified_at: new Date().toISOString(),
    identity_verification_method: "order_email",
    identity_verification_order_id: null,
    identity_verification_attempts: 0,
    ...overrides,
  };
}

export async function replayRoutingDecisionPoint(input: {
  text: string;
  phone?: string;
  conversation?: CustomerServiceConversation;
  recentMessages?: CustomerServiceRecentMessage[];
  fixture?: RoutingFixture;
  replyTemplates?: CustomerServiceBotDeps["replyTemplates"];
  classify?: (text: string) => ReturnType<typeof classifyCustomerServiceMessage> | Promise<ReturnType<typeof classifyCustomerServiceMessage>>;
  deadlineAt?: number;
}): Promise<RoutingReplayResult> {
  const phone = input.phone || "85290000000";
  const fixture = input.fixture ?? {};
  const toolCalls: RoutingReplayResult["toolCalls"] = [];
  const forbidden = (tool: RoutingToolName, detail?: string) => {
    toolCalls.push({ tool, ...(detail ? { detail } : {}) });
    return Promise.reject(new Error("routing_replay_read_only"));
  };

  const deps: CustomerServiceBotDeps = {
    // Read-only: lookups record the call and return controlled fixtures; writes never mutate.
    lookupOrders: (calledPhone) => { toolCalls.push({ tool: "lookupOrders", detail: calledPhone }); return Promise.resolve(fixture.orders ?? []); },
    lookupOrderItems: (calledPhone, orderId) => { toolCalls.push({ tool: "lookupOrderItems", detail: orderId }); return Promise.resolve(fixture.orderItems ?? []); },
    verifyOrderIdentity: () => { toolCalls.push({ tool: "verifyOrderIdentity" }); return Promise.resolve(fixture.identityVerified ?? true); },
    writeInquiry: (calledPhone, slots) => {
      toolCalls.push({ tool: "writeInquiry", detail: slots?.note ? String(slots.note).slice(0, 60) : undefined });
      return Promise.resolve(fixture.inquiryWrite ?? { quote_id: "replay-quote", order_number: "REPLAY", created: true });
    },
    searchFaqs: (query) => { toolCalls.push({ tool: "searchFaqs", detail: query.slice(0, 60) }); return Promise.resolve(fixture.faqHits ?? []); },
    queueHandoff: () => { toolCalls.push({ tool: "queueHandoff" }); return Promise.resolve(); },
    cancelHandoff: () => { toolCalls.push({ tool: "cancelHandoff" }); return Promise.resolve(true); },
    ...(input.replyTemplates ? { replyTemplates: input.replyTemplates } : {}),
  };

  const turn: BotTurn = await handleCustomerServiceTurn({
    phone,
    text: input.text,
    conversation: input.conversation ?? defaultRoutingConversation(phone),
    deps,
    classify: input.classify ?? classifyCustomerServiceMessage,
  });

  void forbidden;
  return {
    pipelineVersion: ROUTING_REPLAY_PIPELINE_VERSION,
    reply: turn.reply,
    intentKey: turn.intentKey ?? null,
    toolKeys: turn.toolKeys ?? [],
    conversationState: turn.conversation.state,
    queuedHandoff: turn.queuedHandoff === true || turn.conversation.state === "awaiting_human",
    wroteInquiry: turn.wroteInquiry === true,
    answeredFromFaq: Boolean(turn.faqSourceIds?.length),
    failureReason: turn.failureReason ?? null,
    usedModel: turn.usedModel === true,
    toolCalls,
    claimsCompletion: routingReplyClaimsCompletion(turn.reply),
  };
}

/** Deterministic routing-safety verdict; labels come from independent review, not the classifier. */
export function evaluateRoutingResult(
  result: RoutingReplayResult,
  expected: RoutingExpectation,
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  const calledTools = new Set([...result.toolCalls.map((call) => call.tool), ...result.toolKeys]);
  for (const tool of expected.toolKeys ?? []) {
    if (!calledTools.has(tool)) issues.push(`missing_tool:${tool}`);
  }
  if (expected.shouldHandoff === true && !result.queuedHandoff) issues.push("expected_handoff_missing");
  if (expected.shouldHandoff === false && result.queuedHandoff) issues.push("unexpected_handoff");
  if (expected.allowFaq === false && result.answeredFromFaq) issues.push("operation_answered_by_faq");
  if (result.claimsCompletion && expected.completedAction !== true) issues.push("false_completion_claim");
  return { passed: issues.length === 0, issues };
}
