import {
  CUSTOMER_SERVICE_BURST_MAX_MS,
  CUSTOMER_SERVICE_BURST_QUIET_MS,
  mergeCustomerServiceBufferedMessages,
} from "./customer-service-burst.ts";
import { caseFingerprint } from "./customer-service-cases.ts";
import { sanitizeCustomerServiceContextText } from "./customer-service-context.ts";

/**
 * History replay samples (HR-02). A sample is the decision point immediately
 * before a human prepared a reply: the customer burst (question) plus the
 * context visible at that moment, the merged human reply block (reference), and
 * any later customer reaction as separate outcome evidence.
 *
 * Rules enforced here:
 * - consecutive customer messages merge using the live burst window;
 * - context cutoff excludes the current burst (it appears only as question);
 * - the target human reply and everything after it never enter the generator context;
 * - a bot message between request and human reply marks pairing uncertain;
 * - samples dedupe by environment + conversation + request/context fingerprint.
 */
export const HISTORY_SAMPLE_BUILDER_VERSION = "history-sample-v1";
export const HISTORY_DEFAULT_CONTEXT_MESSAGES = 12;

export type HistoryMessageRole = "customer" | "assistant" | "human";

export type HistoryMessage = {
  id: string;
  sourceMessageId: string;
  phone: string;
  conversationId: string;
  role: HistoryMessageRole;
  text: string;
  createdAt: string;
  environment: string;
  /** Attachment-only or otherwise incomplete turns the text cannot represent. */
  contextGap?: boolean;
};

export type HistoryContextTurn = { role: HistoryMessageRole; text: string };

export type HistoryDecisionSample = {
  sampleKey: string;
  builderVersion: string;
  conversationId: string;
  phone: string;
  environment: string;
  question: string;
  recentMessages: HistoryContextTurn[];
  referenceAnswer: string;
  requestMessageIds: string[];
  referenceMessageIds: string[];
  outcomeEvidenceMessageIds: string[];
  scenarioAt: string;
  contextCutoffAt: string;
  pairing: "confident" | "pairing_uncertain";
  contextGap: boolean;
  issues: string[];
};

export type BuildHistorySampleOptions = {
  maxContextMessages?: number;
  quietMs?: number;
  maxBurstMs?: number;
};

function sanitize(value: string): string {
  return sanitizeCustomerServiceContextText(String(value ?? "")).trim();
}

function withinBurstWindow(
  first: HistoryMessage,
  previous: HistoryMessage,
  candidate: HistoryMessage,
  quietMs: number,
  maxBurstMs: number,
) {
  const firstAt = Date.parse(first.createdAt);
  const previousAt = Date.parse(previous.createdAt);
  const candidateAt = Date.parse(candidate.createdAt);
  if (![firstAt, previousAt, candidateAt].every(Number.isFinite)) return false;
  return candidateAt - previousAt <= quietMs && candidateAt - firstAt <= maxBurstMs;
}

export function buildHistoryDecisionSamples(
  messages: readonly HistoryMessage[],
  options: BuildHistorySampleOptions = {},
): HistoryDecisionSample[] {
  const maxContext = Math.max(0, Math.trunc(options.maxContextMessages ?? HISTORY_DEFAULT_CONTEXT_MESSAGES));
  const quietMs = options.quietMs ?? CUSTOMER_SERVICE_BURST_QUIET_MS;
  const maxBurstMs = options.maxBurstMs ?? CUSTOMER_SERVICE_BURST_MAX_MS;

  const byConversation = new Map<string, HistoryMessage[]>();
  for (const message of messages) {
    const key = message.conversationId || message.phone;
    const bucket = byConversation.get(key) ?? [];
    bucket.push(message);
    byConversation.set(key, bucket);
  }

  const samples: HistoryDecisionSample[] = [];
  for (const [conversationId, bucket] of byConversation) {
    const ordered = [...bucket]
      .map((message, index) => ({ message, index }))
      .sort((left, right) => {
        const delta = Date.parse(left.message.createdAt) - Date.parse(right.message.createdAt);
        return delta || left.index - right.index;
      })
      .map((entry) => entry.message);

    let cursor = 0;
    while (cursor < ordered.length) {
      if (ordered[cursor].role !== "customer") {
        cursor += 1;
        continue;
      }
      const burstStart = cursor;
      let burstEnd = cursor;
      while (
        burstEnd + 1 < ordered.length &&
        ordered[burstEnd + 1].role === "customer" &&
        withinBurstWindow(ordered[burstStart], ordered[burstEnd], ordered[burstEnd + 1], quietMs, maxBurstMs)
      ) {
        burstEnd += 1;
      }
      const burst = ordered.slice(burstStart, burstEnd + 1);
      const issues: string[] = [];
      if (burst.some((message) => message.contextGap)) issues.push("context_gap");

      // Human reply block: merge consecutive human messages, stop at any other subject.
      let replyEnd = burstEnd;
      let pairing: HistoryDecisionSample["pairing"] = "confident";
      while (replyEnd + 1 < ordered.length && ordered[replyEnd + 1].role === "human") replyEnd += 1;
      if (replyEnd === burstEnd) {
        const blocker = ordered[burstEnd + 1];
        if (blocker && blocker.role === "assistant") {
          // A bot answered before any human: not a human decision point.
          issues.push("bot_before_human");
          pairing = "pairing_uncertain";
        }
        cursor = burstEnd + 1;
        continue;
      }
      const replyBlock = ordered.slice(burstEnd + 1, replyEnd + 1);
      const danglingAssistant = ordered[replyEnd + 1];
      if (danglingAssistant && danglingAssistant.role === "assistant") {
        issues.push("bot_in_decision_window");
        pairing = "pairing_uncertain";
      }

      const context = ordered.slice(0, burstStart).slice(-maxContext);
      const requestMessageIds = burst.map((message) => message.id);
      const referenceMessageIds = replyBlock.map((message) => message.id);

      const outcomeEvidence: string[] = [];
      let outcomeCursor = replyEnd + 1;
      while (outcomeCursor < ordered.length && ordered[outcomeCursor].role === "customer") {
        outcomeEvidence.push(ordered[outcomeCursor].id);
        outcomeCursor += 1;
      }

      const question = mergeCustomerServiceBufferedMessages(burst.map((message) => ({
        providerMessageId: message.sourceMessageId,
        text: sanitize(message.text),
        receivedAt: message.createdAt,
      })));
      const referenceAnswer = replyBlock.map((message) => sanitize(message.text)).filter(Boolean).join("\n");
      if (question && referenceAnswer) {
        const recentMessages: HistoryContextTurn[] = context
          .map((message) => ({ role: message.role, text: sanitize(message.text) }))
          .filter((message) => message.text);
        const fingerprint = caseFingerprint([
          ordered[burstStart].environment,
          conversationId,
          [...requestMessageIds].sort().join(","),
          recentMessages.map((message) => `${message.role}:${message.text}`).join("\n"),
        ].join("\u0000"));
        samples.push({
          sampleKey: fingerprint,
          builderVersion: HISTORY_SAMPLE_BUILDER_VERSION,
          conversationId,
          phone: ordered[burstStart].phone,
          environment: ordered[burstStart].environment,
          question,
          recentMessages,
          referenceAnswer,
          requestMessageIds,
          referenceMessageIds,
          outcomeEvidenceMessageIds: outcomeEvidence,
          scenarioAt: ordered[burstStart].createdAt,
          contextCutoffAt: ordered[burstStart].createdAt,
          pairing,
          contextGap: issues.includes("context_gap"),
          issues,
        });
      }
      cursor = replyEnd + 1;
    }
  }

  // Dedupe identical decision points; keep the earliest scenario.
  const seen = new Set<string>();
  return samples
    .sort((left, right) => left.scenarioAt.localeCompare(right.scenarioAt))
    .filter((sample) => {
      if (seen.has(sample.sampleKey)) return false;
      seen.add(sample.sampleKey);
      return true;
    });
}
