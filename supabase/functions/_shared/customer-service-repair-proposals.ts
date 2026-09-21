import { canonicalCaseJson, caseFingerprint } from "./customer-service-cases.ts";
import type { HistoryIssue } from "./customer-service-history-judge.ts";
import {
  EMPTY_LEARNING_RUNTIME_TARGETS,
  sanitizeLearningRuntimeChanges,
  type LearningRuntimeChange,
  type LearningRuntimeTargets,
} from "./customer-service-learning.ts";

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
  | "reembed_index" | "alias_candidate" | "template_candidate" | "case_guidance_candidate"
  | "runtime_policy_candidate" | "code_change_proposal";
export type RepairRiskLevel = "R0" | "R1" | "R2" | "R3";

export type RepairSuggestion = { repairKind: RepairKind; riskLevel: RepairRiskLevel } | null;

/**
 * Issue categories a runtime prompt/policy change can address: appending to an
 * intent description, a workflow policy instruction or a reply template. These
 * stay R2 and must be human-reviewed; they never edit executable code.
 */
export const RUNTIME_ADDRESSABLE_CATEGORIES: ReadonlySet<string> = new Set([
  "missing_coverage", "wrong_policy", "wrong_product", "unsupported_commitment",
]);

/** Maps a diagnosed issue to its allowed repair lane. Unknown issues never auto-repair. */
export function proposeRepairForIssue(issue: Pick<HistoryIssue, "category">): RepairSuggestion {
  switch (issue.category) {
    case "retrieval_miss":
      return { repairKind: "reembed_index", riskLevel: "R1" };
    case "missing_coverage":
    case "wrong_policy":
    case "wrong_product":
    case "unsupported_commitment":
      return { repairKind: "runtime_policy_candidate", riskLevel: "R2" };
    case "context_dropped":
    case "repeated_question":
      return { repairKind: "code_change_proposal", riskLevel: "R3" };
    case "wrong_amount_date":
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

/** Convert the domain shape to the columns accepted by PostgREST. */
export function repairProposalInsertRow(proposal: RepairProposal) {
  return {
    environment: proposal.environment,
    repair_kind: proposal.repairKind,
    risk_level: proposal.riskLevel,
    target_type: proposal.targetType,
    target_id: proposal.targetId,
    scope: { environment: proposal.environment },
    base_revision: proposal.baseRevision,
    base_hash: proposal.baseHash,
    base_profile: proposal.baseProfile,
    allowlist_version: proposal.allowlistVersion,
    source_sample_ids: proposal.sourceSampleIds,
    reason: proposal.reason,
    candidate_patch: proposal.candidatePatch,
    status: proposal.status,
    idempotency_key: proposal.idempotencyKey,
    preauthorized: proposal.preauthorized,
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

export const CODE_CHANGE_DRAFT_VERSION = "history-code-change-v1";

/**
 * R3 code-change draft (HR-08). The spec allows R3 to produce a *minimal diff /
 * PR draft for human review and normal CI* — it must never auto-publish. This is
 * the draft lane only: it writes a review record, never code, never production
 * data. `repairExecutionAllowed` still refuses R3; nothing here widens it.
 */
export type CodeChangeDraftFile = {
  path: string;
  rationale: string;
  before: string;
  after: string;
};

export type CodeChangeDraft = {
  summary: string;
  files: CodeChangeDraftFile[];
  tests: string[];
  risks: string[];
  requiresReview: true;
  source: "hypothesis";
  version: string;
};

const DRAFT_MAX_FILES = 8;
const DRAFT_MAX_TEXT = 20_000;
const DRAFT_MAX_NOTES = 8;
const DRAFT_SAFE_PATH = /^(src|supabase|scripts|docs|test)\/[A-Za-z0-9._/-]+$/;

/** Drafting is allowed for the code lane only, and never in `off` mode. */
export function codeChangeDraftAllowed(
  mode: AutoRepairMode, riskLevel: RepairRiskLevel, repairKind: RepairKind,
): boolean {
  return mode !== "off" && riskLevel === "R3" && repairKind === "code_change_proposal";
}

function draftText(value: unknown, max = DRAFT_MAX_TEXT): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").slice(0, max) : "";
}

function draftNotes(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 500))
    .slice(0, DRAFT_MAX_NOTES);
}

/**
 * Validates model output into a reviewable draft. A draft is never executable:
 * paths are restricted to repo-relative source roots, and a malformed file is
 * dropped rather than guessed at. Returns null when nothing reviewable remains.
 */
export function sanitizeCodeChangeDraft(raw: unknown): CodeChangeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const summary = draftText(input.summary, 2_000).trim();
  if (!summary) return null;
  const seen = new Set<string>();
  const files: CodeChangeDraftFile[] = [];
  for (const entry of Array.isArray(input.files) ? input.files : []) {
    if (!entry || typeof entry !== "object") continue;
    const file = entry as Record<string, unknown>;
    const path = typeof file.path === "string" ? file.path.trim().replace(/^\.\//, "") : "";
    if (!DRAFT_SAFE_PATH.test(path) || path.includes("..") || seen.has(path)) continue;
    const before = draftText(file.before);
    const after = draftText(file.after);
    if (!before && !after) continue;
    seen.add(path);
    files.push({
      path,
      rationale: draftText(file.rationale, 1_000).trim(),
      before,
      after,
    });
    if (files.length >= DRAFT_MAX_FILES) break;
  }
  if (!files.length) return null;
  return {
    summary, files, tests: draftNotes(input.tests), risks: draftNotes(input.risks),
    requiresReview: true, source: "hypothesis", version: CODE_CHANGE_DRAFT_VERSION,
  };
}

/** Human-readable unified diff for review. It is a draft, not an applied patch. */
export function renderCodeChangeDraftDiff(draft: CodeChangeDraft): string {
  return draft.files.map((file) => {
    const removed = file.before ? file.before.split("\n").map((line) => `-${line}`) : [];
    const added = file.after ? file.after.split("\n").map((line) => `+${line}`) : [];
    return [
      `--- a/${file.path}`,
      `+++ b/${file.path}`,
      ...(file.rationale ? [`# ${file.rationale}`] : []),
      "@@ draft @@",
      ...removed,
      ...added,
    ].join("\n");
  }).join("\n\n");
}

/** Copy-ready brief: summary, diff, tests and risks, all clearly marked draft. */
export function renderCodeChangeDraftBrief(draft: CodeChangeDraft): string {
  const lines = [
    `# 修復草稿（${draft.version}）— 需人工審查，未套用`,
    "",
    draft.summary,
    "",
    "## 變更",
    renderCodeChangeDraftDiff(draft),
  ];
  if (draft.tests.length) lines.push("", "## 建議測試", ...draft.tests.map((item) => `- ${item}`));
  if (draft.risks.length) lines.push("", "## 風險", ...draft.risks.map((item) => `- ${item}`));
  return lines.join("\n");
}

export const RUNTIME_CHANGE_DRAFT_VERSION = "history-runtime-change-v1";

/**
 * R2 runtime policy/intent change draft (HR-09).
 *
 * This is the same lane learning suggestions use: a structured patch against a
 * live `customer_service_intents` / `customer_service_workflow_policies` /
 * `customer_service_reply_templates` row. `sanitizeLearningRuntimeChanges`
 * guarantees the draft only contains changes the approval executor accepts, so
 * a stored draft is either applyable by the allow-listed RPC or has no change at
 * all. Nothing here writes or applies: a human reviews and applies it.
 */
export type RuntimeChangeDraft = {
  summary: string;
  changes: LearningRuntimeChange[];
  tests: string[];
  risks: string[];
  requiresReview: true;
  source: "hypothesis";
  version: string;
};

/** Runtime drafting is allowed for any non-off mode; the lane itself is R2. */
export function runtimeChangeDraftAllowed(kind: RepairKind, riskLevel: RepairRiskLevel): boolean {
  return riskLevel === "R2" && kind === "runtime_policy_candidate";
}

/**
 * Validates model output into a reviewable runtime-change draft. Changes are
 * filtered to the live target keys and the exact patch shape the executor
 * accepts; an empty or unmapped result is rejected rather than guessed at.
 */
export function sanitizeRuntimeChangeDraft(
  raw: unknown,
  targets: LearningRuntimeTargets = EMPTY_LEARNING_RUNTIME_TARGETS,
): RuntimeChangeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const summary = draftText(input.summary, 2_000).trim();
  const changes = sanitizeLearningRuntimeChanges(
    (input as { changes?: unknown }).changes ?? (input as { runtime_changes?: unknown }).runtime_changes,
    targets,
  );
  if (!summary || !changes.length) return null;
  return {
    summary, changes, tests: draftNotes(input.tests), risks: draftNotes(input.risks),
    requiresReview: true, source: "hypothesis", version: RUNTIME_CHANGE_DRAFT_VERSION,
  };
}

const RUNTIME_TARGET_LABELS: Record<LearningRuntimeChange["target"], string> = {
  intent: "意圖", reply_template: "回覆模板", workflow_policy: "流程政策",
};

function renderRuntimeChange(changes: LearningRuntimeChange[]): string {
  return changes.map((change) => {
    const lines = [`### ${RUNTIME_TARGET_LABELS[change.target]} · ${change.key}`];
    const patch = change.patch;
    if (typeof patch.description_append === "string") lines.push(`+ description: ${patch.description_append}`);
    if (typeof patch.instructions_append === "string") lines.push(`+ instructions: ${patch.instructions_append}`);
    if (typeof patch.content === "string") lines.push(`+ content: ${patch.content}`);
    if (typeof patch.display_name === "string") lines.push(`display_name: ${patch.display_name}`);
    for (const example of Array.isArray(patch.examples_append) ? patch.examples_append : []) {
      lines.push(`+ example: ${String(example)}`);
    }
    for (const key of ["context_window", "clarification_threshold", "auto_resume", "enabled"] as const) {
      if (patch[key] !== undefined) lines.push(`${key}: ${String(patch[key])}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

/** Copy-ready brief for a runtime-change draft, clearly marked as unapplied. */
export function renderRuntimeChangeDraftBrief(draft: RuntimeChangeDraft): string {
  const lines = [
    `# 政策／意圖修改草稿（${draft.version}）— 需人工審查，未套用`,
    "",
    draft.summary,
    "",
    "## 變更",
    renderRuntimeChange(draft.changes),
  ];
  if (draft.tests.length) lines.push("", "## 建議驗證", ...draft.tests.map((item) => `- ${item}`));
  if (draft.risks.length) lines.push("", "## 風險", ...draft.risks.map((item) => `- ${item}`));
  return lines.join("\n");
}
