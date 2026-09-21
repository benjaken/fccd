import type { HistoryIssue } from "./customer-service-history-judge.ts";
import { RUNTIME_ADDRESSABLE_CATEGORIES } from "./customer-service-repair-proposals.ts";

export const HISTORY_AUTO_REPAIR_GATE_VERSION = "verified-faq-rewrite-v1";

export type HistoryRepairDiagnosis = {
  cause: "retrieval" | "context" | "routing" | "knowledge" | "policy" | "generation"
    | "infrastructure" | "reference_unreliable" | "unknown";
  outcome: "candidate" | "insufficient_evidence" | "unsupported_repair";
  faqId: string | null;
  reason: string;
};

/** Scenario guidance is only a fallback for an otherwise unexplained workflow gap. */
export function canDraftHistoryCaseGuidance(diagnosis: HistoryRepairDiagnosis): boolean {
  return diagnosis.outcome === "insufficient_evidence" &&
    (diagnosis.cause === "unknown" || diagnosis.cause === "context");
}

/** Only an explicitly cited, already approved FAQ can supply facts to an automatic repair. */
export function diagnoseHistoryRepair(input: {
  status: string;
  pairing: string | null;
  contextGap: boolean;
  judgment: Record<string, unknown>;
}): HistoryRepairDiagnosis {
  if (input.pairing !== "confident" || input.contextGap || input.status !== "scored") {
    return { cause: "context", outcome: "insufficient_evidence", faqId: null, reason: "sample_not_reliable" };
  }
  const issues = Array.isArray(input.judgment.issues) ? input.judgment.issues as HistoryIssue[] : [];
  if (issues.some((issue) => issue.layer === "infrastructure")) {
    return { cause: "infrastructure", outcome: "insufficient_evidence", faqId: null, reason: "infrastructure_failure" };
  }
  if (input.judgment.referenceStatus === "reference_not_current" ||
      input.judgment.referenceStatus === "reference_suspect") {
    return { cause: "reference_unreliable", outcome: "insufficient_evidence", faqId: null, reason: "human_reference_unreliable" };
  }
  if (issues.some((issue) => issue.layer === "routing")) {
    return { cause: "routing", outcome: "unsupported_repair", faqId: null, reason: "routing_code_change_required" };
  }
  // Only an explicit retrieval miss, or a retrieval-layer issue that cites an
  // approved source, is a retrieval cause. A high-severity issue elsewhere can
  // force `judgment.status` to `not_evaluable` (mergeHistoryJudgment) without
  // making the finding itself a retrieval miss.
  const retrieval = issues.find((issue) => issue.category === "retrieval_miss" ||
    (issue.layer === "retrieval" && (issue.evidence ?? []).some((item) => item.sourceType === "approved_source")));
  if (retrieval) {
    const faqIds = [...new Set((retrieval.evidence ?? [])
      .filter((item) => item.sourceType === "approved_source")
      .map((item) => item.sourceId))];
    if (faqIds.length === 1) {
      return { cause: "retrieval", outcome: "candidate", faqId: faqIds[0], reason: "verified_faq_retrieval_miss" };
    }
    return { cause: "retrieval", outcome: "insufficient_evidence", faqId: null, reason: "verified_faq_missing_or_ambiguous" };
  }
  // A policy/product/coverage gap can be corrected by a reviewed runtime patch
  // (intent description, workflow policy instruction or reply template). A
  // critical guard failure (e.g. a wrong amount/date) is never downgraded here.
  if (issues.some((issue) => RUNTIME_ADDRESSABLE_CATEGORIES.has(issue.category)) &&
      !issues.some((issue) => issue.severity === "critical")) {
    return { cause: "policy", outcome: "candidate", faqId: null, reason: "runtime_policy_change_required" };
  }
  if (issues.some((issue) => issue.layer === "knowledge")) {
    return { cause: "knowledge", outcome: "insufficient_evidence", faqId: null, reason: "authoritative_knowledge_required" };
  }
  if (issues.some((issue) => issue.layer === "generation" || issue.layer === "validation")) {
    return { cause: "generation", outcome: "unsupported_repair", faqId: null, reason: "answer_logic_code_change_required" };
  }
  if (input.judgment.status !== "scored") {
    return { cause: "unknown", outcome: "insufficient_evidence", faqId: null, reason: "judge_not_evaluable" };
  }
  return { cause: "unknown", outcome: "insufficient_evidence", faqId: null, reason: "no_supported_diagnosis" };
}

export function normalizedRepairQuestion(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s?？!！,，。:：;；、]+/g, "");
}

export type RepairTrial = {
  baselineSourceIds: string[];
  candidateSourceIds: string[];
  baselineGuard: boolean | null;
  candidateGuard: boolean | null;
  baselineAnswer: string;
  candidateAnswer: string;
  retrievalError: boolean;
};

export function evaluateRepairTrials(targetFaqId: string, source: RepairTrial,
  holdouts: RepairTrial[], controls: RepairTrial[], minHoldouts = 1) {
  const reasons: string[] = [];
  const supported = (trial: RepairTrial) =>
    !trial.retrievalError && trial.candidateGuard === true &&
    trial.candidateSourceIds.includes(targetFaqId) && Boolean(trial.candidateAnswer.trim());
  if (!supported(source) || source.baselineSourceIds.includes(targetFaqId)) reasons.push("source_not_improved");
  if (holdouts.length < minHoldouts) reasons.push("insufficient_holdouts");
  if (holdouts.some((trial) => !supported(trial))) reasons.push("holdout_failed");
  if (controls.some((trial) => trial.retrievalError || trial.candidateGuard === false ||
      (trial.baselineGuard === true && trial.baselineSourceIds.length > 0 &&
       !trial.baselineSourceIds.some((id) => trial.candidateSourceIds.includes(id))))) {
    reasons.push("control_regression");
  }
  return { passed: reasons.length === 0, reasons, gateVersion: HISTORY_AUTO_REPAIR_GATE_VERSION };
}
