import { answerCustomerServiceFaqForEvaluation, type CustomerServiceBotDeps } from "./customer-service-bot.ts";
import {
  answerCustomerServiceFallbackWithTieredAi,
  classifyCustomerServiceWithTieredAi,
  type CustomerServiceAiTierConfig,
} from "./customer-service-ai.ts";
import { classifyCustomerServiceMessage } from "./customer-service-intents.ts";
import type { CustomerServiceRecentMessage } from "./customer-service-context.ts";
import type { CustomerServiceFaqCandidate } from "./customer-service-retrieval.ts";
import { createCustomerServiceFaqRagDeps, type RagTrace } from "./customer-service-rag-runtime.ts";
import { customerServiceRagConfig, type CustomerServiceRagConfig } from "./customer-service-rag-config.ts";
import { faqTextIsGrounded, type FaqGroundingSource } from "./customer-service-grounding.ts";
import type { CustomerServiceRagDatabase } from "./customer-service-rag-db.ts";

/**
 * History replay adapter (HR-03). Reuses the production FAQ subpipeline and the
 * tiered fallback composer with all business writes replaced by forbidden deps.
 * It performs no WhatsApp send, order mutation or handoff; the only side effects
 * are the caller's own evaluation records and model usage.
 */
export const HISTORY_REPLAY_PIPELINE_VERSION = "history-replay-v1";

export type HistoryReplaySample = {
  question: string;
  recentMessages: CustomerServiceRecentMessage[];
};

export type HistoryReplayResult = {
  pipelineVersion: string;
  aiAnswer: string;
  grounded: boolean;
  usedFallback: boolean;
  faqSourceIds: string[];
  relatedFaqIds: string[];
  /** Candidate FAQ question/answer texts, for judge citation binding only. */
  candidates: Array<{ id: string; question: string; answer: string }>;
  failureReason: string | null;
  intentKey: string | null;
  dialogAction: string | null;
  classificationModel: string | null;
  /** Deterministic number/URL guard against the cited candidate texts; null when unjudgeable. */
  answerGuardPassed: boolean | null;
  retrieval: {
    error: boolean;
    degraded: boolean;
    candidateCount: number;
    selectedSourceIds: string[];
  };
  traces: RagTrace[];
  elapsedMs: number;
};

export type HistoryTraceSummary = ReturnType<typeof summarizeHistoryTrace>;

export function summarizeHistoryTrace(traces: readonly RagTrace[]) {
  const retrieval = traces.filter((trace) => trace.stage === "retrieval");
  const candidateIds = new Set(retrieval.flatMap((trace) => (trace.candidates ?? []).map((candidate) => candidate.id)));
  const selectedSourceIds = traces.filter((trace) => trace.stage === "answer")
    .flatMap((trace) => trace.selectedSourceIds ?? []);
  return {
    error: retrieval.some((trace) => trace.status === "error"),
    degraded: retrieval.some((trace) => trace.status === "degraded"),
    candidateCount: candidateIds.size,
    selectedSourceIds,
  };
}

/** True/false when sources exist, null when there is nothing to bind facts to. */
export function historyAnswerGuard(answer: string, sources: readonly FaqGroundingSource[]): boolean | null {
  if (!sources.length) return null;
  return faqTextIsGrounded(answer, sources);
}

function forbiddenSideEffect(): Promise<never> {
  return Promise.reject(new Error("history_replay_side_effect_forbidden"));
}

export type ReplayHistoryDecisionPointInput = {
  db: CustomerServiceRagDatabase;
  tiers: CustomerServiceAiTierConfig;
  sample: HistoryReplaySample;
  ragConfig?: CustomerServiceRagConfig;
  environment?: string;
  runClassificationAi?: boolean;
  fetchImpl?: typeof fetch;
  onTrace?: (trace: RagTrace) => void;
  deadlineAt?: number;
  /**
   * Isolated candidate FAQ used only for proposal validation. It is prepended
   * to retrieval so the composer can use it, but nothing is persisted.
   */
  candidateOverlay?: CustomerServiceFaqCandidate[];
  repairRewrite?: { queryKey: string; canonicalQuestion: string };
};

/**
 * Runs one decision point through composer→fallback. `expectedEmpty` disables
 * fallback so an "expected no FAQ" sample is not quietly answered by a
 * clarification; callers that want the fallback path leave it false.
 */
export async function replayHistoryDecisionPoint({
  db, tiers, sample, ragConfig, runClassificationAi = true, fetchImpl = fetch, onTrace, deadlineAt,
  candidateOverlay, repairRewrite, environment,
}: ReplayHistoryDecisionPointInput): Promise<HistoryReplayResult> {
  const started = Date.now();
  const traces: RagTrace[] = [];
  const emit = (trace: RagTrace) => { traces.push(trace); onTrace?.(trace); };
  const classified = classifyCustomerServiceMessage(sample.question);
  const conversation = {
    phone_normalized: "history-replay",
    state: "identifying" as const,
    selected_order_id: null,
    handoff_at: null,
    pending_request: null,
    recent_messages: sample.recentMessages,
  };

  const baseDeps = createCustomerServiceFaqRagDeps({
    db,
    ragConfig: ragConfig ?? customerServiceRagConfig(),
    tiers,
    recentMessages: sample.recentMessages,
    onTrace: emit,
    deadlineAt: deadlineAt ?? Date.now() + 30_000,
    environment, repairRewrite,
  });
  let captured: CustomerServiceFaqCandidate[] = [];
  const deps: CustomerServiceBotDeps = {
    lookupOrders: forbiddenSideEffect,
    lookupOrderItems: forbiddenSideEffect,
    verifyOrderIdentity: forbiddenSideEffect,
    writeInquiry: forbiddenSideEffect,
    queueHandoff: forbiddenSideEffect,
    cancelHandoff: forbiddenSideEffect,
    ...baseDeps,
    searchFaqs: async (query: string) => {
      const candidates = await baseDeps.searchFaqs(query);
      const overlay = candidateOverlay ?? [];
      const merged = overlay.length
        ? [...overlay, ...candidates.filter((candidate) => !overlay.some((entry) => entry.id === candidate.id))]
        : candidates;
      captured = merged;
      return merged;
    },
  };

  const [turn, classification] = await Promise.all([
    answerCustomerServiceFaqForEvaluation(deps, classified, conversation, sample.question),
    runClassificationAi
      ? classifyCustomerServiceWithTieredAi({
        message: sample.question,
        conversationState: "identifying",
        recentMessages: sample.recentMessages,
        intents: [],
        tiers: { ...tiers, primary: { ...tiers.primary, timeoutMs: Math.min(5_000, tiers.primary.timeoutMs) }, fallback: null },
      }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const faqSourceIds = turn.faqSourceIds ?? [];
  let aiAnswer = turn.reply ?? "";
  let usedFallback = false;
  let failureReason = turn.failureReason ?? null;

  if (!faqSourceIds.length || !aiAnswer.trim()) {
    try {
      const fallback = await answerCustomerServiceFallbackWithTieredAi({
        question: sample.question,
        intentKey: classification?.intentKey || classified.intent || "unknown",
        confidence: classification?.confidence,
        missingFields: classification?.missingFields ?? [],
        recentMessages: sample.recentMessages,
        tiers,
        fetchImpl,
      });
      if (fallback?.answer?.trim()) {
        aiAnswer = fallback.answer.trim();
        usedFallback = true;
        failureReason = failureReason ?? "fallback_answer";
      }
    } catch {
      // Fallback failure is recorded as a non-answer, never retried into a free-text send.
    }
  }

  const sources: FaqGroundingSource[] = captured
    .filter((candidate) => faqSourceIds.includes(candidate.id))
    .map((candidate) => ({ question: candidate.question, answer: candidate.answer }));
  const grounded = Boolean(faqSourceIds.length && aiAnswer.trim());
  return {
    pipelineVersion: HISTORY_REPLAY_PIPELINE_VERSION,
    aiAnswer,
    grounded,
    usedFallback,
    faqSourceIds,
    relatedFaqIds: (turn.relatedFaqs ?? []).map((faq) => faq.id).filter(Boolean),
    candidates: captured.map((candidate) => ({ id: candidate.id, question: candidate.question, answer: candidate.answer })),
    failureReason,
    intentKey: classification?.intentKey ?? classified.intent ?? null,
    dialogAction: classification?.dialogAction ?? null,
    classificationModel: classification?.model ?? null,
    answerGuardPassed: usedFallback ? historyAnswerGuard(aiAnswer, []) : historyAnswerGuard(aiAnswer, sources),
    retrieval: summarizeHistoryTrace(traces),
    traces,
    elapsedMs: Date.now() - started,
  };
}
