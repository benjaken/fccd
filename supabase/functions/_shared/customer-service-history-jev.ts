import { sanitizeCustomerServiceContextText } from "./customer-service-context.ts";

/**
 * TypeSafe official Jev second judge (HR-JEV-01).
 *
 * This is an independent, on-demand diagnostic judge. It never generates a
 * customer reply, a repair suggestion, a citation, SQL or code, and its result
 * never authorises auto_repair / propose / validate / apply. The existing
 * deterministic checks and the existing LLM judge keep their own contracts; a
 * Jev verdict is only ever stored beside them and shown for comparison.
 *
 * The fixed four questions mirror the PRD: grounding (choice), coverage
 * (choice), unverified_action (noul) and human_review (noul). The request is
 * built server-side only; inbound state is treated as data, never as rules.
 */
export const HISTORY_JEV_RUBRIC_VERSION = "history-jev-v1";
export const TYPESAFE_SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export type HistoryJevErrorCode =
  | "not_configured"
  | "auth_failed"
  | "invalid_request"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "provider_unavailable"
  | "invalid_response"
  | "pii_not_redactable";

export type HistoryJevConfig = {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
};

export type HistoryJevApprovedSource = { id: string; text: string };

export type HistoryJevTraceSummary = {
  grounded: boolean;
  usedFallback: boolean;
  retrievalError: boolean;
  answerGuardPassed: boolean | null;
  candidateCount: number;
  selectedSourceCount: number;
};

export type HistoryJevJudgeInput = {
  question: string;
  context: Array<{ role: string; text: string }>;
  aiAnswer: string;
  approvedSources: HistoryJevApprovedSource[];
  traceSummary: HistoryJevTraceSummary;
  config: HistoryJevConfig;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  deadlineAt?: number;
};

export type HistoryJevChoice = {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type HistoryJevAnswers = {
  grounding: HistoryJevChoice;
  coverage: HistoryJevChoice;
  unverifiedAction: { noul: number };
  humanReview: { noul: number };
};

export type HistoryJevSuccess = {
  ok: true;
  modelRequested: string;
  modelResolved: string;
  answers: HistoryJevAnswers;
  inputTokens: number;
  outputTokens: number;
  attemptCount: number;
  elapsedMs: number;
};

export type HistoryJevFailure = {
  ok: false;
  errorCode: HistoryJevErrorCode;
  attemptCount: number;
  elapsedMs: number;
  /** True when a timeout means the provider may already have charged the call. */
  outcomeUncertain: boolean;
};

export type HistoryJevOutcome = HistoryJevSuccess | HistoryJevFailure;

export type HistoryJevAgreement = "agree" | "divergent" | "incomparable";

const GROUNDING_OPTIONS = ["supported", "unsupported", "conflicting", "unknown"] as const;
const COVERAGE_OPTIONS = ["complete", "partial", "missed", "unknown"] as const;
const ANSWER_KEYS = ["grounding", "coverage", "unverified_action", "human_review"] as const;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_APPROVED_SOURCES = 8;

/** Direct identifiers that must never leave for TypeSafe. */
const DIRECT_PII_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?852[\s-]?)?[456789]\d{3}[\s-]?\d{4}\b/,
];

/** Order-like references that are not needed to judge business semantics. */
const ORDER_REFERENCE_PATTERNS = [
  /#\s?[A-Za-z0-9-]{4,}/g,
  /\b[A-Z]{2,5}[-\s]?\d{5,}\b/g,
];

/**
 * Applies the shared customer-service sanitizer, then removes order-like
 * references. Amounts, dates and product semantics are intentionally kept:
 * Jev is never asked to compare dates or do arithmetic, so those tokens are
 * only context.
 */
export function redactHistoryJevText(value: unknown) {
  let text = sanitizeCustomerServiceContextText(String(value ?? ""));
  for (const pattern of ORDER_REFERENCE_PATTERNS) text = text.replace(pattern, "[識別號碼已隱藏]");
  return text.trim();
}

/** Outbound guard: refuse to send a state that still contains a direct identifier. */
export function historyJevStateHasDirectPii(state: unknown) {
  const text = JSON.stringify(state ?? "");
  return DIRECT_PII_PATTERNS.some((pattern) => pattern.test(text));
}

export function buildHistoryJevState(
  input: Pick<HistoryJevJudgeInput, "question" | "context" | "aiAnswer" | "approvedSources" | "traceSummary">,
) {
  return {
    customer_question: redactHistoryJevText(input.question),
    visible_context: input.context.slice(-MAX_CONTEXT_MESSAGES).map((message) => ({
      role: message.role,
      text: redactHistoryJevText(message.text),
    })),
    assistant_answer: redactHistoryJevText(input.aiAnswer),
    approved_sources: input.approvedSources.slice(0, MAX_APPROVED_SOURCES).map((source) => ({
      id: source.id,
      text: redactHistoryJevText(source.text),
    })),
    controlled_trace: {
      grounded: input.traceSummary.grounded === true,
      used_fallback: input.traceSummary.usedFallback === true,
      retrieval_error: input.traceSummary.retrievalError === true,
      answer_guard_passed: input.traceSummary.answerGuardPassed,
      candidate_count: input.traceSummary.candidateCount,
      selected_source_count: input.traceSummary.selectedSourceCount,
      // The replay pipeline forbids business side effects, so no operation is
      // ever confirmed by the controlled trace.
      operations_confirmed: false,
    },
  };
}

export function buildHistoryJevQuestions() {
  return {
    grounding: {
      type: "choice",
      instructions:
        "只根據 approved_sources，assistant_answer 的業務事實得到甚麼程度的支持？不要使用你自己的世界知識；來源不足、來源與問題無關或無法核實時選 unknown。",
      criteria: {
        supported: "所有重要業務事實都有 approved_sources 支持",
        unsupported: "至少一項重要業務事實沒有 approved_sources 支持",
        conflicting: "至少一項重要業務事實與 approved_sources 衝突",
        unknown: "缺少足夠來源或無法評估",
      },
    },
    coverage: {
      type: "choice",
      instructions:
        "只看 customer_question 的主要問題是否在 assistant_answer 得到回答，不要判斷事實正確性。",
      criteria: {
        complete: "主要問題已完整回答",
        partial: "只回答部分主要問題",
        missed: "沒有回答主要問題",
        unknown: "無法判斷客人主要問題或無法評估",
      },
    },
    unverified_action: {
      type: "noul",
      instructions:
        "assistant_answer 是否宣稱已完成退款、改單、確認供應、確認預訂等操作，而 controlled_trace 沒有證實？controlled_trace.operations_confirmed 為 false 代表沒有受控證據。沒有可核對 trace 時不要當作安全。",
      criteria: {
        true: "宣稱已完成未受控 trace 證實的操作",
        false: "沒有宣稱未證實的操作",
      },
    },
    human_review: {
      type: "noul",
      instructions: "整體而言，這個樣本是否值得人手覆核？包括依據不足、覆蓋不足、可能未證實操作或政策衝突。",
      criteria: { true: "值得人手覆核", false: "不需要人手覆核" },
    },
  };
}

function parseChoice(value: unknown, options: readonly string[]): HistoryJevChoice | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const choice = typeof row.choice === "string" ? row.choice : "";
  if (!options.includes(choice)) return null;
  const rawProbabilities = row.probabilities;
  if (!rawProbabilities || typeof rawProbabilities !== "object" || Array.isArray(rawProbabilities)) return null;
  const keys = Object.keys(rawProbabilities as Record<string, unknown>);
  if (keys.length !== options.length) return null;
  const probabilities: Record<string, number> = {};
  let sum = 0;
  for (const option of options) {
    const raw = (rawProbabilities as Record<string, unknown>)[option];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) return null;
    probabilities[option] = raw;
    sum += raw;
  }
  if (Math.abs(sum - 1) > 0.02) return null;
  const confidence = row.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { choice, probabilities, confidence };
}

function parseNoul(value: unknown): { noul: number } | null {
  if (!value || typeof value !== "object") return null;
  const noul = (value as Record<string, unknown>).noul;
  if (typeof noul !== "number" || !Number.isFinite(noul) || noul < 0 || noul > 1) return null;
  return { noul };
}

function readTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

/**
 * Validates the TypeSafe response. Missing/extra answer keys, illegal choices,
 * non-numeric or out-of-range probabilities all fail closed (null); a failed
 * call is never coerced into a safe `unknown`.
 */
export function parseHistoryJevResponse(payload: unknown): {
  modelResolved: string;
  answers: HistoryJevAnswers;
  inputTokens: number;
  outputTokens: number;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const modelResolved = typeof row.model === "string" ? row.model.trim() : "";
  if (!modelResolved) return null;
  const answers = row.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const map = answers as Record<string, unknown>;
  if (Object.keys(map).length !== ANSWER_KEYS.length) return null;
  const grounding = parseChoice(map.grounding, GROUNDING_OPTIONS);
  const coverage = parseChoice(map.coverage, COVERAGE_OPTIONS);
  const unverifiedAction = parseNoul(map.unverified_action);
  const humanReview = parseNoul(map.human_review);
  if (!grounding || !coverage || !unverifiedAction || !humanReview) return null;
  const usage = row.usage && typeof row.usage === "object" ? row.usage as Record<string, unknown> : {};
  return {
    modelResolved,
    answers: { grounding, coverage, unverifiedAction, humanReview },
    inputTokens: readTokenCount(usage.input_tokens),
    outputTokens: readTokenCount(usage.output_tokens),
  };
}

/**
 * Only sources that were actually selected by the replay pipeline may be sent
 * as `approved_sources`. Retrieval candidates the answer did not use are not
 * promoted to verified facts. When the sample is grounded but no selected
 * source can be resolved, the result is `complete: false` and the caller must
 * skip the sample as not evaluable instead of guessing.
 */
export function resolveHistoryJevApprovedSources(input: {
  candidates: Array<{ id: string; question: string; answer: string }>;
  selectedSourceIds: string[];
  grounded: boolean;
}): { sources: HistoryJevApprovedSource[]; complete: boolean } {
  if (!input.grounded) return { sources: [], complete: true };
  const selected = new Set(input.selectedSourceIds.filter(Boolean));
  const sources = input.candidates
    .filter((candidate) => selected.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, text: `${candidate.question}\n${candidate.answer}` }));
  return { sources, complete: sources.length > 0 };
}

/**
 * Compares Jev grounding with the existing judge's `aiGrounding`. They are the
 * same enum on purpose. Anything unknown, missing or not evaluable is
 * `incomparable`; agreement is never treated as proof of correctness.
 */
export function historyJevAgreement(input: {
  jevGrounding: string | null | undefined;
  judgeGrounding: string | null | undefined;
  jevComplete: boolean;
  sampleEvaluable: boolean;
}): HistoryJevAgreement {
  if (!input.jevComplete || !input.sampleEvaluable) return "incomparable";
  const jev = input.jevGrounding ?? null;
  const judge = input.judgeGrounding ?? null;
  if (!jev || !judge || jev === "unknown" || judge === "unknown") return "incomparable";
  return jev === judge ? "agree" : "divergent";
}

function backoffMs(attempt: number) {
  return Math.min(5_000, 250 * 2 ** Math.max(0, attempt - 1));
}

function retryAfterMs(response: Response, attempt: number) {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(5_000, Math.max(0, date - Date.now()));
  }
  return backoffMs(attempt);
}

/**
 * Runs one sample through the official TypeSafe system-one endpoint. 429/529
 * retry with bounded backoff and respect `Retry-After`; 401/422 stop at once so
 * a batch does not burn budget on a configuration error. A timeout is reported
 * as `outcome_uncertain` because the provider may already have charged the call.
 */
export async function judgeHistoryDecisionPointWithJev(
  input: HistoryJevJudgeInput,
): Promise<HistoryJevOutcome> {
  const started = Date.now();
  const { config } = input;
  if (!config.enabled || !config.apiKey || !config.model) {
    return { ok: false, errorCode: "not_configured", attemptCount: 0, elapsedMs: 0, outcomeUncertain: false };
  }
  const state = buildHistoryJevState(input);
  if (historyJevStateHasDirectPii(state)) {
    return { ok: false, errorCode: "pii_not_redactable", attemptCount: 0,
      elapsedMs: Date.now() - started, outcomeUncertain: false };
  }
  const body = JSON.stringify({ model: config.model, state, questions: buildHistoryJevQuestions() });
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = Math.max(1, Math.min(4, Math.trunc(config.maxRetries) + 1));
  const failure = (errorCode: HistoryJevErrorCode, outcomeUncertain: boolean, attemptCount: number): HistoryJevFailure =>
    ({ ok: false, errorCode, attemptCount, elapsedMs: Date.now() - started, outcomeUncertain });

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    if (input.deadlineAt && Date.now() >= input.deadlineAt) {
      return failure("timeout", true, attempt - 1);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, config.timeoutMs));
    let response: Response | null = null;
    let aborted = false;
    try {
      response = await fetchImpl(config.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (error) {
      aborted = error instanceof Error && error.name === "AbortError";
    } finally {
      clearTimeout(timer);
    }
    if (!response) {
      if (aborted) return failure("timeout", true, attempt);
      if (attempt < maxAttempts) { await sleep(backoffMs(attempt)); continue; }
      return failure("provider_unavailable", false, attempt);
    }
    if (response.status === 401) return failure("auth_failed", false, attempt);
    if (response.status === 422) return failure("invalid_request", false, attempt);
    if (response.status === 429 || response.status === 529) {
      const code: HistoryJevErrorCode = response.status === 429 ? "rate_limited" : "overloaded";
      if (attempt < maxAttempts) { await sleep(retryAfterMs(response, attempt)); continue; }
      return failure(code, false, attempt);
    }
    if (!response.ok) return failure("provider_unavailable", false, attempt);
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const parsed = parseHistoryJevResponse(payload);
    if (!parsed) return failure("invalid_response", false, attempt);
    return {
      ok: true,
      modelRequested: config.model,
      modelResolved: parsed.modelResolved,
      answers: parsed.answers,
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      attemptCount: attempt,
      elapsedMs: Date.now() - started,
    };
  }
  return failure("provider_unavailable", false, attempt);
}
