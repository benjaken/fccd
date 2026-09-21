import { describe, expect, it } from "vitest";

import {
  autoRepairMode,
  buildRepairProposal,
  candidateValidationCapability,
  codeChangeDraftAllowed,
  proposeRepairForIssue,
  r1ReembedEligible,
  r2ValidationGate,
  renderCodeChangeDraftBrief,
  renderCodeChangeDraftDiff,
  renderRuntimeChangeDraftBrief,
  repairExecutionAllowed,
  repairProposalInsertRow,
  runtimeChangeDraftAllowed,
  sanitizeCodeChangeDraft,
  sanitizeRuntimeChangeDraft,
  REPAIR_ALLOWLIST_VERSION,
  type R1TargetState,
} from "../supabase/functions/_shared/customer-service-repair-proposals.ts";
import type { LearningRuntimeTargets } from "../supabase/functions/_shared/customer-service-learning.ts";

const eligibleState: R1TargetState = {
  verified: true, scopeValid: true, servable: true, embeddingStatus: "failed",
  embeddingProfileMatches: true, revisionMatches: true, contentVersionMatches: true,
  retryEligible: true, permanentError: false, activeClaim: false,
};

describe("repair lane mapping", () => {
  it("maps a retrieval miss to R1 and policy gaps to the R2 runtime lane", () => {
    expect(proposeRepairForIssue({ category: "retrieval_miss" })).toEqual({ repairKind: "reembed_index", riskLevel: "R1" });
    expect(proposeRepairForIssue({ category: "wrong_policy" }))
      .toEqual({ repairKind: "runtime_policy_candidate", riskLevel: "R2" });
    expect(proposeRepairForIssue({ category: "missing_coverage" }))
      .toEqual({ repairKind: "runtime_policy_candidate", riskLevel: "R2" });
    expect(proposeRepairForIssue({ category: "unsupported_commitment" }))
      .toEqual({ repairKind: "runtime_policy_candidate", riskLevel: "R2" });
    expect(proposeRepairForIssue({ category: "wrong_amount_date" }))
      .toEqual({ repairKind: "code_change_proposal", riskLevel: "R3" });
    expect(proposeRepairForIssue({ category: "context_dropped" }))
      .toEqual({ repairKind: "code_change_proposal", riskLevel: "R3" });
    expect(proposeRepairForIssue({ category: "tone" })).toEqual({ repairKind: "template_candidate", riskLevel: "R2" });
    expect(proposeRepairForIssue({ category: "policy_drift" })).toBeNull();
    expect(proposeRepairForIssue({ category: "unknown_thing" })).toBeNull();
  });
});

describe("R1 index recovery preconditions", () => {
  it("allows re-embedding only for a verified, servable, retryable target", () => {
    expect(r1ReembedEligible(eligibleState)).toEqual({ eligible: true, reason: "eligible" });
  });

  it("refuses fresh, claimed, revision-changed and permanent-error targets", () => {
    expect(r1ReembedEligible({ ...eligibleState, embeddingStatus: "ready", embeddingProfileMatches: true }))
      .toEqual({ eligible: false, reason: "already_fresh" });
    expect(r1ReembedEligible({ ...eligibleState, activeClaim: true }).reason).toBe("active_claim");
    expect(r1ReembedEligible({ ...eligibleState, revisionMatches: false }).reason).toBe("revision_changed");
    expect(r1ReembedEligible({ ...eligibleState, permanentError: true }).reason).toBe("permanent_error");
    expect(r1ReembedEligible({ ...eligibleState, retryEligible: false }).reason).toBe("not_retry_eligible");
    expect(r1ReembedEligible({ ...eligibleState, verified: false }).reason).toBe("target_not_verified");
  });
});

describe("repair proposals", () => {
  const base = {
    environment: "develop", repairKind: "reembed_index" as const, riskLevel: "R1" as const,
    targetType: "faq", targetId: "faq-1", baseRevision: 3, baseHash: "abc", baseProfile: "p",
    sourceSampleIds: ["s1"], reason: "retrieval_miss", candidatePatch: { action: "reembed" },
  };

  it("produces a stable idempotency key and only pre-authorises R1", () => {
    const first = buildRepairProposal(base);
    const second = buildRepairProposal(base);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.allowlistVersion).toBe(REPAIR_ALLOWLIST_VERSION);
    expect(first.preauthorized).toBe(true);
    expect(buildRepairProposal({ ...base, repairKind: "alias_candidate", riskLevel: "R2" }).preauthorized).toBe(false);
  });

  it("writes proposal fields using database column names", () => {
    const proposal = buildRepairProposal(base);
    const row = repairProposalInsertRow(proposal);
    expect(row).toMatchObject({
      repair_kind: "reembed_index", risk_level: "R1", target_type: "faq",
      target_id: "faq-1", base_revision: 3,
      idempotency_key: proposal.idempotencyKey,
    });
    expect(Object.keys(row)).not.toContain("repairKind");
  });
});

describe("R2 validation gate", () => {
  it("passes only when improvement, regression, hard-negative, security, holdout and budget all clear", () => {
    expect(r2ValidationGate({
      improved: true, regressedCount: 0, hardNegativeFailures: 0, securityFailures: 0,
      holdoutPassed: true, withinBudget: true,
    })).toEqual({ passed: true, reasons: [] });
    const failed = r2ValidationGate({
      improved: true, regressedCount: 1, hardNegativeFailures: 2, securityFailures: 1,
      holdoutPassed: false, withinBudget: false,
    });
    expect(failed.passed).toBe(false);
    expect(failed.reasons).toEqual(["regression", "hard_negative_failure", "security_failure", "holdout_failed", "over_budget"]);
  });

  it("reports the isolated-index capability gap instead of testing on production", () => {
    expect(candidateValidationCapability().isolatedIndex).toBe(false);
  });
});

describe("auto-repair mode gating", () => {
  it("defaults to off and only recognises the three documented modes", () => {
    expect(autoRepairMode(undefined)).toBe("off");
    expect(autoRepairMode("live")).toBe("off");
    expect(autoRepairMode("propose")).toBe("propose");
    expect(autoRepairMode("apply_allowlist")).toBe("apply_allowlist");
  });

  it("only lets R1 index recovery execute, and only in apply_allowlist", () => {
    expect(repairExecutionAllowed("off", "R1", "reembed_index")).toBe(false);
    expect(repairExecutionAllowed("propose", "R1", "reembed_index")).toBe(false);
    expect(repairExecutionAllowed("apply_allowlist", "R1", "reembed_index")).toBe(true);
    expect(repairExecutionAllowed("apply_allowlist", "R2", "alias_candidate")).toBe(false);
    expect(repairExecutionAllowed("apply_allowlist", "R3", "code_change_proposal")).toBe(false);
  });
});

describe("R3 code-change drafts", () => {
  const validDraft = {
    summary: "Reply directly to a delivery-time request instead of treating it as off-topic.",
    files: [{
      path: "supabase/functions/_shared/customer-service-replies.ts",
      rationale: "Add a delivery-time lane before the off-topic guard.",
      before: "const lane = classify(text);",
      after: "const lane = classify(text) ?? \"delivery_time\";",
    }],
    tests: ["delivery time request is answered directly"],
    risks: ["may widen the reply lane"],
  };

  it("allows drafting for the R3 code lane only, and never in off mode", () => {
    expect(codeChangeDraftAllowed("off", "R3", "code_change_proposal")).toBe(false);
    expect(codeChangeDraftAllowed("propose", "R3", "code_change_proposal")).toBe(true);
    expect(codeChangeDraftAllowed("apply_allowlist", "R3", "code_change_proposal")).toBe(true);
    expect(codeChangeDraftAllowed("apply_allowlist", "R2", "code_change_proposal")).toBe(false);
    expect(codeChangeDraftAllowed("apply_allowlist", "R3", "reembed_index")).toBe(false);
  });

  it("sanitizes model output into a review-only draft and drops unsafe paths", () => {
    const draft = sanitizeCodeChangeDraft({
      ...validDraft,
      files: [
        ...validDraft.files,
        { path: "../../etc/passwd", before: "x", after: "y" },
        { path: "C:\\Windows\\system32", before: "x", after: "y" },
        { path: "supabase/functions/_shared/customer-service-replies.ts", before: "dup", after: "dup" },
      ],
    });
    expect(draft).not.toBeNull();
    expect(draft?.requiresReview).toBe(true);
    expect(draft?.source).toBe("hypothesis");
    expect(draft?.files).toHaveLength(1);
    expect(draft?.files[0].path).toBe("supabase/functions/_shared/customer-service-replies.ts");
  });

  it("returns null when nothing reviewable remains", () => {
    expect(sanitizeCodeChangeDraft(null)).toBeNull();
    expect(sanitizeCodeChangeDraft({ summary: "", files: [] })).toBeNull();
    expect(sanitizeCodeChangeDraft({ summary: "x", files: [{ path: "/abs.ts", before: "a", after: "b" }] })).toBeNull();
  });

  it("renders a human-readable draft diff and never claims it was applied", () => {
    const draft = sanitizeCodeChangeDraft(validDraft);
    expect(draft).not.toBeNull();
    const diff = renderCodeChangeDraftDiff(draft!);
    expect(diff).toContain("--- a/supabase/functions/_shared/customer-service-replies.ts");
    expect(diff).toContain("+++ b/supabase/functions/_shared/customer-service-replies.ts");
    expect(diff).toContain("-const lane = classify(text);");
    expect(diff).toContain('+const lane = classify(text) ?? "delivery_time";');
    const brief = renderCodeChangeDraftBrief(draft!);
    expect(brief).toContain("需人工審查，未套用");
    expect(brief).toContain("建議測試");
  });
});

describe("R2 runtime policy/intent drafts", () => {
  const targets: LearningRuntimeTargets = {
    intents: [{ key: "lookup_order", displayName: "查詢訂單", detail: "查詢訂單。" }],
    replyTemplates: [{ key: "help", displayName: "歡迎訊息", detail: "" }],
    workflowPolicies: [{ key: "order_change", displayName: "訂單修改", detail: "先核實身份。" }],
  };

  it("allows drafting for the R2 runtime lane only", () => {
    expect(runtimeChangeDraftAllowed("runtime_policy_candidate", "R2")).toBe(true);
    expect(runtimeChangeDraftAllowed("code_change_proposal", "R3")).toBe(false);
    expect(runtimeChangeDraftAllowed("runtime_policy_candidate", "R3")).toBe(false);
    expect(runtimeChangeDraftAllowed("alias_candidate", "R2")).toBe(false);
  });

  it("keeps only changes the allow-listed executor can apply", () => {
    const draft = sanitizeRuntimeChangeDraft({
      summary: "先說明訂單修改政策。",
      changes: [
        { target: "workflow_policy", key: "order_change", patch: { instructions_append: "先說明不得直接修改訂單。" } },
        { target: "intent", key: "missing_key", patch: { description_append: "x" } },
        { target: "unknown_target", key: "order_change", patch: { instructions_append: "x" } },
        { target: "reply_template", key: "help", patch: { display_name: "無內容" } },
      ],
    }, targets);
    expect(draft).not.toBeNull();
    expect(draft?.requiresReview).toBe(true);
    expect(draft?.source).toBe("hypothesis");
    expect(draft?.changes).toEqual([
      { target: "workflow_policy", key: "order_change", patch: { instructions_append: "先說明不得直接修改訂單。" } },
    ]);
  });

  it("returns null when nothing applyable remains and renders an unapplied brief", () => {
    expect(sanitizeRuntimeChangeDraft(null, targets)).toBeNull();
    expect(sanitizeRuntimeChangeDraft({ summary: "", changes: [] }, targets)).toBeNull();
    expect(sanitizeRuntimeChangeDraft({
      summary: "x", changes: [{ target: "intent", key: "unknown", patch: { description_append: "x" } }],
    }, targets)).toBeNull();

    const draft = sanitizeRuntimeChangeDraft({
      summary: "補充政策說明。",
      changes: [{ target: "intent", key: "lookup_order", patch: { description_append: "需先核實身份。" } }],
      tests: ["查單時先核實身份"],
      risks: ["可能延長回覆"],
    }, targets);
    const brief = renderRuntimeChangeDraftBrief(draft!);
    expect(brief).toContain("需人工審查，未套用");
    expect(brief).toContain("意圖 · lookup_order");
    expect(brief).toContain("需先核實身份。");
    expect(brief).toContain("建議驗證");
  });
});
