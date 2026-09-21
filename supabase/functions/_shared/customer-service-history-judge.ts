/**
 * History replay judgment layer (HR-04).
 *
 * Two separate stages, per the spec:
 * 1. deterministic checks run first and never depend on an LLM;
 * 2. a judge verdict that must cite real spans inside the controlled inputs.
 *
 * A verdict never authorises a change, and `suggestedFix` is descriptive text,
 * never executable code.
 */
export const HISTORY_JUDGE_RUBRIC_VERSION = "history-judge-v1";

export type HistoryJudgmentStatus = "scored" | "not_evaluable" | "out_of_scope" | "execution_failed";
export type HistoryComparison = "match" | "partial" | "divergent" | "inconclusive";
export type HistoryAiGrounding = "supported" | "unsupported" | "conflicting" | "unknown";
export type HistoryReferenceStatus =
  | "supported_for_selected_time" | "reference_not_current" | "reference_suspect" | "unknown";
export type HistorySeverity = "low" | "medium" | "high" | "critical";
export type HistoryLayer =
  | "sample" | "context" | "routing" | "retrieval" | "knowledge"
  | "generation" | "validation" | "rendering" | "infrastructure";
export type HistoryEvidenceSourceType = "ai_answer" | "human_reference" | "approved_source" | "trace";

export type HistoryEvidence = {
  sourceType: HistoryEvidenceSourceType;
  sourceId: string;
  quote?: string;
  start?: number;
  end?: number;
};

export type HistoryIssue = {
  category: string;
  severity: HistorySeverity;
  layer: HistoryLayer;
  evidence: HistoryEvidence[];
  suggestedFix: string;
};

export type HistoryJudgment = {
  status: HistoryJudgmentStatus;
  comparison: HistoryComparison;
  aiGrounding: HistoryAiGrounding;
  referenceStatus: HistoryReferenceStatus;
  issues: HistoryIssue[];
  requiresHumanReview: boolean;
};

/** The model may add findings, but it cannot clear deterministic blockers. */
export function mergeHistoryJudgment(
  deterministic: HistoryIssue[],
  judgment: HistoryJudgment,
): HistoryJudgment & { deterministic_issues: HistoryIssue[] } {
  const blocked = deterministic.some((issue) =>
    issue.layer === "sample" || issue.layer === "context" || issue.layer === "infrastructure" ||
    issue.severity === "high" || issue.severity === "critical"
  );
  return {
    ...judgment,
    status: blocked ? "not_evaluable" : judgment.status,
    comparison: blocked ? "inconclusive" : judgment.comparison,
    issues: [...deterministic, ...judgment.issues],
    requiresHumanReview: blocked || judgment.requiresHumanReview,
    deterministic_issues: deterministic,
  };
}

export type DeterministicHistoryCheckInput = {
  aiAnswer: string;
  grounded: boolean;
  usedFallback: boolean;
  faqSourceIds: string[];
  candidateCount: number;
  expectedFaqIds: string[] | null;
  retrievalError: boolean;
  degraded: boolean;
  pairing: "confident" | "pairing_uncertain";
  contextGap: boolean;
  answerGuardPassed: boolean | null;
};

const STATUSES: HistoryJudgmentStatus[] = ["scored", "not_evaluable", "out_of_scope", "execution_failed"];
const COMPARISONS: HistoryComparison[] = ["match", "partial", "divergent", "inconclusive"];
const GROUNDINGS: HistoryAiGrounding[] = ["supported", "unsupported", "conflicting", "unknown"];
const REFERENCE_STATUSES: HistoryReferenceStatus[] = [
  "supported_for_selected_time", "reference_not_current", "reference_suspect", "unknown",
];
const SEVERITIES: HistorySeverity[] = ["low", "medium", "high", "critical"];
const LAYERS: HistoryLayer[] = [
  "sample", "context", "routing", "retrieval", "knowledge", "generation", "validation", "rendering", "infrastructure",
];
const EVIDENCE_TYPES: HistoryEvidenceSourceType[] = ["ai_answer", "human_reference", "approved_source", "trace"];

export function deterministicHistoryIssues(input: DeterministicHistoryCheckInput): HistoryIssue[] {
  const issues: HistoryIssue[] = [];
  const answered = Boolean(input.aiAnswer.trim());
  if (input.pairing === "pairing_uncertain") {
    issues.push({
      category: "pairing_uncertain", severity: "medium", layer: "sample", evidence: [],
      suggestedFix: "未能確認同一會話；先補 session 證據，不要自動修復。",
    });
  }
  if (input.contextGap) {
    issues.push({
      category: "context_gap", severity: "medium", layer: "context", evidence: [],
      suggestedFix: "缺少必要上下文（如附件或未匯入訊息）；人工覆核後才判斷。",
    });
  }
  if (input.retrievalError) {
    issues.push({
      category: "infrastructure", severity: "high", layer: "infrastructure", evidence: [],
      suggestedFix: "檢索服務故障；先恢復服務，不視為知識缺口。",
    });
  } else if (input.expectedFaqIds?.length && input.candidateCount === 0) {
    issues.push({
      category: "retrieval_miss", severity: "high", layer: "retrieval", evidence: [],
      suggestedFix: "應有已核實知識但完全沒有候選；核對索引與 profile，而非新增政策。",
    });
  } else if (input.expectedFaqIds?.length && input.grounded &&
    !input.expectedFaqIds.some((id) => input.faqSourceIds.includes(id))) {
    issues.push({
      category: "retrieval_miss", severity: "medium", layer: "retrieval", evidence: [],
      suggestedFix: "命中非預期 FAQ；核對相似問與否定條件，避免過度綁定。",
    });
  }
  if (input.expectedFaqIds?.length === 0 && answered && !input.usedFallback) {
    issues.push({
      category: "unsupported_commitment", severity: "high", layer: "validation", evidence: [],
      suggestedFix: "預期沒有可回答知識，卻給出有來源的答案；核對來源範圍。",
    });
  }
  if (input.answerGuardPassed === false) {
    issues.push({
      category: "wrong_amount_date", severity: "critical", layer: "validation", evidence: [],
      suggestedFix: "答案數字／URL 未能綁定已引用來源；阻擋自動發布並人工覆核。",
    });
  }
  return issues;
}

/**
 * Validates an LLM judge verdict. Unknown enums fail closed (null). Evidence
 * quotes must be real substrings of the controlled source text; fabricated
 * quote/source pairs are dropped so they can never become repair grounds.
 */
export function parseHistoryJudgment(
  payload: unknown,
  context: { evidence?: Record<string, string> } = {},
): HistoryJudgment | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const status = raw.status as HistoryJudgmentStatus;
  const comparison = raw.comparison as HistoryComparison;
  const aiGrounding = raw.aiGrounding as HistoryAiGrounding;
  const referenceStatus = raw.referenceStatus as HistoryReferenceStatus;
  if (!STATUSES.includes(status) || !COMPARISONS.includes(comparison) ||
    !GROUNDINGS.includes(aiGrounding) || !REFERENCE_STATUSES.includes(referenceStatus)) return null;

  const evidenceMap = context.evidence ?? {};
  const issues: HistoryIssue[] = [];
  let droppedEvidence = false;
  for (const value of Array.isArray(raw.issues) ? raw.issues : []) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const severity = item.severity as HistorySeverity;
    const layer = item.layer as HistoryLayer;
    const category = typeof item.category === "string" ? item.category.trim() : "";
    if (!SEVERITIES.includes(severity) || !LAYERS.includes(layer) || !category) continue;
    const evidence: HistoryEvidence[] = [];
    for (const entry of Array.isArray(item.evidence) ? item.evidence : []) {
      if (!entry || typeof entry !== "object") continue;
      const evidenceItem = entry as Record<string, unknown>;
      const sourceType = evidenceItem.sourceType as HistoryEvidenceSourceType;
      const sourceId = typeof evidenceItem.sourceId === "string" ? evidenceItem.sourceId : "";
      if (!EVIDENCE_TYPES.includes(sourceType) || !sourceId) continue;
      const quote = typeof evidenceItem.quote === "string" ? evidenceItem.quote : undefined;
      const sourceText = evidenceMap[sourceId];
      if (quote && quote.trim()) {
        // Unknown source or fabricated quote: the citation is not trustworthy.
        if (!sourceText || !sourceText.includes(quote.trim())) { droppedEvidence = true; continue; }
      } else if (sourceText === undefined) {
        droppedEvidence = true;
        continue;
      }
      evidence.push({ sourceType, sourceId, ...(quote ? { quote } : {}) });
    }
    issues.push({
      category,
      severity,
      layer,
      evidence,
      suggestedFix: typeof item.suggestedFix === "string" ? item.suggestedFix.slice(0, 1_000) : "",
    });
  }
  const requiresHumanReview = raw.requiresHumanReview === true || droppedEvidence ||
    issues.some((issue) => issue.severity === "high" || issue.severity === "critical");
  return { status, comparison, aiGrounding, referenceStatus, issues, requiresHumanReview };
}
