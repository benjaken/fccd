import { describe, expect, it } from "vitest";
import {
  canDraftHistoryCaseGuidance, diagnoseHistoryRepair, evaluateRepairTrials, normalizedRepairQuestion,
  type RepairTrial,
} from "../supabase/functions/_shared/customer-service-history-auto-repair";

const faqId = "00000000-0000-4000-8000-000000000099";
const trial = (overrides: Partial<RepairTrial> = {}): RepairTrial => ({
  baselineSourceIds: [], candidateSourceIds: [faqId], baselineGuard: null,
  candidateGuard: true, baselineAnswer: "", candidateAnswer: "有依據的答案",
  retrievalError: false, ...overrides,
});

describe("history automatic repair gate", () => {
  it("uses only a cited approved FAQ for a retrieval candidate", () => {
    const diagnosis = diagnoseHistoryRepair({
      status: "scored", pairing: "confident", contextGap: false,
      judgment: { status: "scored", comparison: "divergent", referenceStatus: "unknown",
        issues: [{ category: "retrieval_miss", layer: "retrieval",
          evidence: [{ sourceType: "approved_source", sourceId: faqId }] }] },
    });
    expect(diagnosis).toMatchObject({ cause: "retrieval", outcome: "candidate", faqId });
    expect(normalizedRepairQuestion("  有冇 送貨？ ")).toBe("有冇送貨");
  });

  it("keeps unreliable human answers and scenario failures out of FAQ repair", () => {
    expect(diagnoseHistoryRepair({ status: "scored", pairing: "confident", contextGap: false,
      judgment: { status: "scored", referenceStatus: "reference_suspect", issues: [] },
    }).outcome).toBe("insufficient_evidence");
    expect(diagnoseHistoryRepair({ status: "scored", pairing: "confident", contextGap: false,
      judgment: { status: "scored", issues: [{ category: "wrong_route", layer: "routing", evidence: [] }] },
    }).outcome).toBe("unsupported_repair");
    expect(diagnoseHistoryRepair({ status: "scored", pairing: "confident", contextGap: false,
      judgment: { status: "scored", issues: [
        { category: "retrieval_miss", layer: "retrieval",
          evidence: [{ sourceType: "approved_source", sourceId: faqId }] },
        { category: "wrong_route", layer: "routing", evidence: [] },
      ] },
    }).cause).toBe("routing");
  });

  it("drafts case guidance only for unexplained workflow gaps", () => {
    expect(canDraftHistoryCaseGuidance({
      cause: "unknown", outcome: "insufficient_evidence", faqId: null,
      reason: "no_supported_diagnosis",
    })).toBe(true);
    for (const cause of ["routing", "generation"] as const) {
      expect(canDraftHistoryCaseGuidance({
        cause, outcome: "unsupported_repair", faqId: null,
        reason: "code_change_required",
      })).toBe(false);
    }
  });

  it("requires independent improvement and no control regression", () => {
    expect(evaluateRepairTrials(faqId, trial(), [trial()], [trial({
      baselineSourceIds: [faqId], candidateSourceIds: [faqId], baselineGuard: true,
    })]).passed).toBe(true);
    expect(evaluateRepairTrials(faqId, trial(), [], []).reasons).toContain("insufficient_holdouts");
    expect(evaluateRepairTrials(faqId, trial(), [trial()], [trial({
      baselineSourceIds: ["other"], candidateSourceIds: [faqId], baselineGuard: true,
    })]).reasons).toContain("control_regression");
    expect(evaluateRepairTrials(faqId, trial({ candidateGuard: false }), [trial()], []).passed).toBe(false);
  });
});
