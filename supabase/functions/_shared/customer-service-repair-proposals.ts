import { canonicalCaseJson, caseFingerprint } from "./customer-service-cases.ts";
import type { HistoryIssue } from "./customer-service-history-judge.ts";

/**
 * Repair proposals (HR-05). The safety boundary is the executor allow-list, not
 * the judge's own "low risk" label. Phase 1 only pre-authorises R1 index
 * recovery (default off); everything else is a proposal for human review.
 *
 * `candidateValidationCapability()` reports the known gap: without an isolated
 * candidate index, R2/R3 candidates must NOT be tested by mutating production.
 */
export const REPAIR_ALLOWLIST_VERSION = "repair-allowlist-v1";
export const ISOLATED_CANDIDATE_INDEX_AVAILABLE = false;

export type AutoRepairMode = "off" | "propose" | "apply_allowlist";

/** Server-pinned switch; model output or request params can never widen it. */
export function autoRepairMode(raw: string | undefined): AutoRepairMode {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "propose" || value === "apply_allowlist" ? value : "off";
}

/** Only R1 index recovery may ever auto-apply, and only in the allowlist mode. */
export function repairExecutionAllowed(
  mode: AutoRepairMode, riskLevel: RepairRiskLevel, repairKind: RepairKind,
): boolean {
  return mode === "apply_allowlist" && riskLevel === "R1" && repairKind === "reembed_index";
}

export type RepairKind =
  | "reembed_index" | "alias_candidate" | "template_candidate" | "case_guidance_candidate" | "code_change_proposal";
export type RepairRiskLevel = "R0" | "R1" | "R2" | "R3";

export type RepairSuggestion = { repairKind: RepairKind; riskLevel: RepairRiskLevel } | null;

/** Maps a diagnosed issue to its allowed repair lane. Unknown issues never auto-repair. */
export function proposeRepairForIssue(issue: Pick<HistoryIssue, "category">): RepairSuggestion {
  switch (issue.category) {
    case "retrieval_miss":
      return { repairKind: "reembed_index", riskLevel: "R1" };
    case "context_dropped":
    case "repeated_question":
      return { repairKind: "code_change_proposal", riskLevel: "R3" };
    case "missing_coverage":
    case "wrong_policy":
    case "wrong_product":
      return { repairKind: "code_change_proposal", riskLevel: "R3" };
    case "wrong_amount_date":
    case "unsupported_commitment":
      return { repairKind: "code_change_proposal", riskLevel: "R3" };
    case "tone":
      return { repairKind: "template_candidate", riskLevel: "R2" };
    case "policy_drift":
    case "reference_not_current":
    case "pairing_uncertain":
    case "context_gap":
    case "infrastructure":
      return null;
    default:
      return null;
  }
}

export type R1TargetState = {
  verified: boolean;
  scopeValid: boolean;
  /** FAQ or case is currently servable (published/active, correct environment). */
  servable: boolean;
  embeddingStatus: "pending" | "ready" | "failed" | "stale";
  embeddingProfileMatches: boolean;
  revisionMatches: boolean;
  contentVersionMatches: boolean;
  retryEligible: boolean;
  permanentError: boolean;
  activeClaim: boolean;
};

/** Deterministic precondition for the only phase-1 pre-authorised repair. */
export function r1ReembedEligible(state: R1TargetState): { eligible: boolean; reason: string } {
  if (!state.verified) return { eligible: false, reason: "target_not_verified" };
  if (!state.scopeValid) return { eligible: false, reason: "scope_invalid" };
  if (!state.servable) return { eligible: false, reason: "target_not_servable" };
  if (state.permanentError) return { eligible: false, reason: "permanent_error" };
  if (state.activeClaim) return { eligible: false, reason: "active_claim" };
  if (!state.revisionMatches) return { eligible: false, reason: "revision_changed" };
  if (!state.contentVersionMatches) return { eligible: false, reason: "content_version_changed" };
  if (state.embeddingStatus === "ready" && state.embeddingProfileMatches) {
    return { eligible: false, reason: "already_fresh" };
  }
  if (!state.retryEligible) return { eligible: false, reason: "not_retry_eligible" };
  return { eligible: true, reason: "eligible" };
}

export type RepairProposalInput = {
  environment: string;
  repairKind: RepairKind;
  riskLevel: RepairRiskLevel;
  targetType: string;
  targetId: string | null;
  baseRevision: number | null;
  baseHash: string | null;
  baseProfile: string | null;
  sourceSampleIds: string[];
  reason: string;
  candidatePatch: Record<string, unknown>;
};

export type RepairProposal = RepairProposalInput & {
  allowlistVersion: string;
  idempotencyKey: string;
  status: "proposed";
  preauthorized: boolean;
};

export function buildRepairProposal(input: RepairProposalInput): RepairProposal {
  const idempotencyKey = caseFingerprint([
    input.environment, input.repairKind, input.targetType, input.targetId ?? "",
    String(input.baseRevision ?? ""), input.baseHash ?? "", canonicalCaseJson(input.candidatePatch),
  ].join("\u0000"));
  return {
    ...input,
    allowlistVersion: REPAIR_ALLOWLIST_VERSION,
    idempotencyKey,
    status: "proposed",
    // Only R1 with an allow-listed kind may ever be pre-authorised; phase 1 keeps it off.
    preauthorized: input.riskLevel === "R1" && input.repairKind === "reembed_index",
  };
}

export type R2ValidationGateInput = {
  improved: boolean;
  regressedCount: number;
  hardNegativeFailures: number;
  securityFailures: number;
  holdoutPassed: boolean;
  withinBudget: boolean;
};

/** R2 candidates may become `ready` only when every gate passes (HR-AC23). */
export function r2ValidationGate(input: R2ValidationGateInput): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.improved) reasons.push("no_improvement");
  if (input.regressedCount > 0) reasons.push("regression");
  if (input.hardNegativeFailures > 0) reasons.push("hard_negative_failure");
  if (input.securityFailures > 0) reasons.push("security_failure");
  if (!input.holdoutPassed) reasons.push("holdout_failed");
  if (!input.withinBudget) reasons.push("over_budget");
  return { passed: reasons.length === 0, reasons };
}

export function candidateValidationCapability(): { isolatedIndex: boolean; note: string } {
  return {
    isolatedIndex: ISOLATED_CANDIDATE_INDEX_AVAILABLE,
    note: ISOLATED_CANDIDATE_INDEX_AVAILABLE
      ? "Isolated candidate index available."
      : "No isolated candidate index: R2/R3 candidates must stay proposals; never mutate production to test.",
  };
}
