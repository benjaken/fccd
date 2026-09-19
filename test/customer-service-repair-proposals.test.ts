import { describe, expect, it } from "vitest";

import {
  autoRepairMode,
  buildRepairProposal,
  candidateValidationCapability,
  proposeRepairForIssue,
  r1ReembedEligible,
  r2ValidationGate,
  repairExecutionAllowed,
  repairProposalInsertRow,
  REPAIR_ALLOWLIST_VERSION,
  type R1TargetState,
} from "../supabase/functions/_shared/customer-service-repair-proposals.ts";

const eligibleState: R1TargetState = {
  verified: true, scopeValid: true, servable: true, embeddingStatus: "failed",
  embeddingProfileMatches: true, revisionMatches: true, contentVersionMatches: true,
  retryEligible: true, permanentError: false, activeClaim: false,
};

describe("repair lane mapping", () => {
  it("maps a retrieval miss to the R1 index lane and never auto-repairs policy issues", () => {
    expect(proposeRepairForIssue({ category: "retrieval_miss" })).toEqual({ repairKind: "reembed_index", riskLevel: "R1" });
    expect(proposeRepairForIssue({ category: "wrong_policy" })).toEqual({ repairKind: "code_change_proposal", riskLevel: "R3" });
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
