import {
  isBrandIntroductionRequest,
  isCustomerServiceGreeting,
  isSameDayOrderDemand,
} from "./customer-service-intents.ts";
import { REPLIES } from "./customer-service-replies.ts";

export type LearningMessage = {
  id?: string;
  phone: string;
  role: "customer" | "assistant" | "human";
  text: string;
  createdAt: string;
  sourceMessageId?: string;
};

/** Live and backfilled rows share a provider message id, so they collapse into one learning row. */
export function mergeLearningMessages(
  primary: LearningMessage[],
  secondary: LearningMessage[],
): LearningMessage[] {
  const seen = new Set<string>();
  const merged: LearningMessage[] = [];
  for (const message of [...primary, ...secondary]) {
    const key = message.sourceMessageId?.trim()
      ? `${message.sourceMessageId}\0${message.role}`
      : `${message.id ?? ""}\0${message.role}\0${message.phone}\0${message.createdAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }
  return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type LearningTurn = {
  id: string;
  question: string;
  answer: string | null;
  reply_sent: boolean;
  faq_source_ids?: string[];
};

export type LearningEvaluation = {
  turnId: string;
  outcome: "success" | "failure" | "needs_review";
  score: number;
  reason: string;
};

export type LearningSuggestion = {
  type: "faq" | "intent" | "policy";
  title: string;
  reason: string;
  question: string;
  answer: string;
  category: string;
  keywords: string;
  evidenceTurnIds: string[];
  evidenceMessageIds: string[];
  autoAliasEligible: boolean;
  runtimeChanges: LearningRuntimeChange[];
};

/**
 * The live "客服邏輯" targets a learning suggestion may patch. Keys are the
 * existing rows, so the model can only propose edits that the approval
 * executor (`customer_service_learning_suggestion_review`) accepts.
 */
export type LearningRuntimeTargetOption = {
  key: string;
  displayName: string;
  detail: string;
};

export type LearningRuntimeTargets = {
  intents: LearningRuntimeTargetOption[];
  replyTemplates: LearningRuntimeTargetOption[];
  workflowPolicies: LearningRuntimeTargetOption[];
};

export type LearningRuntimeChange = {
  target: "intent" | "reply_template" | "workflow_policy";
  key: string;
  patch: Record<string, unknown>;
};

export const EMPTY_LEARNING_RUNTIME_TARGETS: LearningRuntimeTargets = {
  intents: [], replyTemplates: [], workflowPolicies: [],
};

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Keep only changes the approval executor can apply. Mirrors the SQL allow-list
 * in `20260915143000_customer_service_learning_safety.sql` so a suggestion is
 * either stored as approvable or has no runtime change at all.
 */
export function sanitizeLearningRuntimeChanges(
  value: unknown,
  targets: LearningRuntimeTargets = EMPTY_LEARNING_RUNTIME_TARGETS,
): LearningRuntimeChange[] {
  if (!Array.isArray(value)) return [];
  const knownKeys: Record<LearningRuntimeChange["target"], Set<string>> = {
    intent: new Set(targets.intents.map((item) => item.key)),
    reply_template: new Set(targets.replyTemplates.map((item) => item.key)),
    workflow_policy: new Set(targets.workflowPolicies.map((item) => item.key)),
  };
  const changes: LearningRuntimeChange[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const target = String(raw.target ?? "");
    const key = String(raw.key ?? "").trim();
    if (!(target in knownKeys) || !key || !knownKeys[target as LearningRuntimeChange["target"]].has(key)) continue;
    const patch = raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch)
      ? (raw.patch as Record<string, unknown>) : null;
    if (!patch) continue;
    const next: Record<string, unknown> = {};
    if (target === "intent") {
      const append = boundedText(patch.description_append, 500);
      if (append) next.description_append = append;
      const examples = Array.isArray(patch.examples_append)
        ? patch.examples_append.map((item) => boundedText(item, 200)).filter(Boolean).slice(0, 10)
        : [];
      if (examples.length) next.examples_append = examples;
    } else if (target === "reply_template") {
      const content = boundedText(patch.content, 2_000);
      // The executor rejects a reply change without a body.
      if (!content) continue;
      next.content = content;
      const displayName = boundedText(patch.display_name, 200);
      if (displayName) next.display_name = displayName;
      if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
    } else {
      const append = boundedText(patch.instructions_append, 1_000);
      if (append) next.instructions_append = append;
      const contextWindow = Number(patch.context_window);
      if (Number.isInteger(contextWindow) && contextWindow >= 1 && contextWindow <= 12) {
        next.context_window = contextWindow;
      }
      const threshold = Number(patch.clarification_threshold);
      if (Number.isFinite(threshold) && threshold >= 0 && threshold <= 1) {
        next.clarification_threshold = threshold;
      }
      if (typeof patch.auto_resume === "boolean") next.auto_resume = patch.auto_resume;
      if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
    }
    if (!Object.keys(next).length) continue;
    changes.push({ target: target as LearningRuntimeChange["target"], key, patch: next });
  }
  return changes.slice(0, 5);
}

/** A human answer belongs only to the most recent customer question. */
export function buildHumanLearningPairs(messages: LearningMessage[]) {
  const pending = new Map<string, { question: LearningMessage; answers: LearningMessage[] }>();
  const pairs: Array<{ question: LearningMessage; answer: LearningMessage; evidenceMessageIds: string[] }> = [];
  const flush = (phone: string) => {
    const current = pending.get(phone);
    if (!current?.question.id || !current.answers.length) return;
    const answer = { ...current.answers[0], text: current.answers.map((item) => item.text).join("\n") };
    pairs.push({ question: current.question, answer,
      evidenceMessageIds: [current.question.id, ...current.answers.map((item) => item.id!)] });
  };
  for (const message of [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (message.role === "customer") {
      flush(message.phone);
      pending.set(message.phone, { question: message, answers: [] });
    }
    if (message.role !== "human") continue;
    const current = pending.get(message.phone);
    if (current?.question.id && message.id && current.question.text.trim() && message.text.trim()) {
      current.answers.push(message);
    }
  }
  for (const phone of pending.keys()) flush(phone);
  return pairs;
}

export function parseLearningAnalysis(
  payload: unknown,
  turns: LearningTurn[],
  messages: LearningMessage[],
  model: string,
  targets: LearningRuntimeTargets = EMPTY_LEARNING_RUNTIME_TARGETS,
) {
  const response = payload as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content) as Record<string, unknown>;
  const turnById = new Map(turns.map((turn) => [turn.id, turn]));
  const messageIds = new Set(messages.map((message) => message.id).filter(Boolean));
  const evaluations: LearningEvaluation[] = [];
  for (const value of Array.isArray(parsed.evaluations) ? parsed.evaluations : []) {
    if (!value || typeof value !== "object") continue;
    const item = value as LearningEvaluation;
    if (!turnById.has(item.turnId) || !["success", "failure", "needs_review"].includes(item.outcome)) continue;
    if (evaluations.some((existing) => existing.turnId === item.turnId)) continue;
    evaluations.push({ turnId: item.turnId, outcome: item.outcome,
      score: Math.max(0, Math.min(1, Number(item.score) || 0)), reason: String(item.reason || "").slice(0, 600) });
  }
  const evaluationOutcome = new Map(evaluations.map((item) => [item.turnId, item.outcome]));
  const pairs = buildHumanLearningPairs(messages);
  const suggestions: LearningSuggestion[] = [];
  for (const value of (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).slice(0, 12)) {
    if (!value || typeof value !== "object") continue;
    const item = value as LearningSuggestion;
    if (!["faq", "intent", "policy"].includes(item.type) || !item.title) continue;
    const evidenceTurnIds = [...new Set((Array.isArray(item.evidenceTurnIds) ? item.evidenceTurnIds : [])
      .map(String).filter((id) => turnById.has(id)))].slice(0, 30);
    const evidenceMessageIds = [...new Set((Array.isArray(item.evidenceMessageIds) ? item.evidenceMessageIds : [])
      .map(String).filter((id) => messageIds.has(id)))].slice(0, 60);
    if (!evidenceTurnIds.length && !evidenceMessageIds.length) continue;
    const question = String(item.question || "").slice(0, 500);
    const answer = String(item.answer || "").slice(0, 2_000);
    const humanGrounded = pairs.some((pair) => pair.evidenceMessageIds.every((id) => evidenceMessageIds.includes(id)) &&
      normalized(question) === normalized(pair.question.text) &&
      normalized(answer) === normalized(pair.answer.text));
    const matchingBotTurns = evidenceTurnIds.map((id) => turnById.get(id)!).filter((turn) =>
      evaluationOutcome.get(turn.id) === "success" && turn.reply_sent && Boolean(turn.answer) &&
      normalized(question) === normalized(turn.question) && normalized(answer) === normalized(turn.answer!));
    const workflowFaq = item.type === "faq" && isLearningWorkflowFaq(question, answer);
    const humanFaqGrounded = item.type === "faq" && humanGrounded && !workflowFaq;
    const botFaqGrounded = item.type === "faq" && !workflowFaq &&
      matchingBotTurns.some((turn) => turn.faq_source_ids?.length);
    if (item.type === "faq" && !humanFaqGrounded && !botFaqGrounded) continue;
    const groundedAnswer = item.type !== "faq" || humanFaqGrounded || botFaqGrounded ? answer : "";
    const rawChanges = (item as { runtime_changes?: unknown }).runtime_changes
      ?? (item as { runtimeChanges?: unknown }).runtimeChanges;
    suggestions.push({ type: item.type, title: String(item.title).slice(0, 200),
      reason: String(item.reason || "").slice(0, 1_000), question, answer: groundedAnswer,
      category: String(item.category || "ordering").slice(0, 50), keywords: String(item.keywords || "").slice(0, 500),
      evidenceTurnIds, evidenceMessageIds,
      autoAliasEligible: item.type === "faq" && Boolean(groundedAnswer) && (humanFaqGrounded || botFaqGrounded),
      runtimeChanges: item.type === "faq" ? [] : sanitizeLearningRuntimeChanges(rawChanges, targets),
    });
  }
  return { summary: String(parsed.summary || "").slice(0, 5_000),
    failureThemes: (Array.isArray(parsed.failureThemes) ? parsed.failureThemes : []).slice(0, 12),
    evaluations, suggestions, model };
}

export function buildHumanLearningConversations(messages: LearningMessage[]) {
  const grouped = new Map<string, LearningMessage[]>();
  for (const message of [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const current = grouped.get(message.phone) ?? [];
    current.push(message);
    grouped.set(message.phone, current);
  }
  return [...grouped.entries()].map(([phone, rows]) => ({
    phone,
    messages: rows.map(({ id, role, text }) => ({ ...(id ? { id } : {}), role, text: text.slice(0, 2_000) })),
    hasHumanReply: rows.some((row) => row.role === "human"),
  })).filter((conversation) => conversation.hasHumanReply);
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-Hant");
}

const SENSITIVE_LEARNING = /退款|退錢|赔偿|賠償|價錢|价格|價|折扣|優惠|取消|block\s*date|停單|不接單|例外|大單|金額|承諾|保证|保證|refund|price|discount|cancel|exception|guarantee|promise|\d|[$€£¥]/i;

export function isSafeFaqAliasSuggestion(input: {
  type: string;
  question: string;
  answer: string;
  publishedAnswer: string;
}) {
  if (input.type !== "faq" || !input.question.trim() || !input.answer.trim()) return false;
  if (SENSITIVE_LEARNING.test(`${input.question}\n${input.answer}`)) return false;
  return normalized(input.answer) === normalized(input.publishedAnswer);
}

export type LearningFaqGateReason =
  | "empty"
  | "greeting"
  | "urgent_order"
  | "brand_intro"
  | "clarification_answer"
  | "faq_conflict"
  | "control_probe"
  | "evidence_mismatch";

export type LearningFaqGateResult = {
  ok: boolean;
  reason: LearningFaqGateReason | "";
};

export type LearningPublishedFaq = {
  question: string;
  answer: string;
  keywords?: string | null;
};

export const LEARNING_FAQ_CONTROL_PROBES = [
  { query: "Hello", reason: "greeting" },
  { query: "你好", reason: "greeting" },
  { query: "hi", reason: "greeting" },
  { query: "急單, 想今日18:00送到, 可以嗎？", reason: "urgent_order" },
  { query: "今日想訂到會急單", reason: "urgent_order" },
] as const;

const FAQ_HIT_THRESHOLD = 0.5;

function normalizeFaqLookup(value: string) {
  return value.trim().toLowerCase().replace(/[\s?？!！,，。:：;；、]/g, "");
}

export function scoreLearningFaqCandidate(
  query: string,
  faq: { question: string; answer: string; keywords?: string | null },
) {
  const vQuery = query.trim();
  const vNormalized = normalizeFaqLookup(query);
  if (!vNormalized) return 0;
  let score = 0;
  if (normalizeFaqLookup(faq.question) === vNormalized) score += 10;
  if (vQuery && faq.question.toLowerCase().includes(vQuery.toLowerCase())) score += 5;
  const questionBare = faq.question.replace(/[?？]/g, "");
  if (questionBare && vQuery.toLowerCase().includes(questionBare.toLowerCase())) score += 4;
  const keywords = (faq.keywords ?? "")
    .split(/[,，、;；]+/)
    .map((term) => normalizeFaqLookup(term))
    .filter((term) => term.length >= 2);
  const matched = keywords.filter((term) => vNormalized.includes(term));
  const longest = matched.reduce((max, term) => Math.max(max, term.length), 0);
  if (matched.length >= 2) score += 6;
  else if (longest >= 4) score += 4;
  else if (matched.length === 1) score += 0.25;
  if (vQuery && faq.answer.toLowerCase().includes(vQuery.toLowerCase())) score += 2;
  return score;
}

export function isClarificationOnlyFaqAnswer(answer: string) {
  const text = answer.trim();
  if (!text) return true;
  if (normalized(text) === normalized(REPLIES.help)) return true;
  if (text.length > 80) return false;
  if (!/[?？]/.test(text)) return false;
  return /請問|有咩幫|有什麼幫|可以幫到你|送貨地區/.test(text);
}

export function isLearningWorkflowFaq(question: string, answer: string) {
  return Boolean(blockedSampleReason(question.trim()) || isClarificationOnlyFaqAnswer(answer));
}

function blockedSampleReason(text: string): LearningFaqGateReason | "" {
  if (isCustomerServiceGreeting(text)) return "greeting";
  if (isSameDayOrderDemand(text)) return "urgent_order";
  if (isBrandIntroductionRequest(text)) return "brand_intro";
  return "";
}

export function evaluateLearningFaqCandidate(input: {
  question: string;
  answer: string;
  keywords?: string | null;
  evidenceQuestions: string[];
  publishedFaqs: LearningPublishedFaq[];
}): LearningFaqGateResult {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) return { ok: false, reason: "empty" };
  const questionBlock = blockedSampleReason(question);
  if (questionBlock) return { ok: false, reason: questionBlock };
  if (isClarificationOnlyFaqAnswer(answer)) return { ok: false, reason: "clarification_answer" };
  const candidate = { question, answer, keywords: input.keywords ?? "" };
  const samples = input.evidenceQuestions.map((item) => item.trim()).filter(Boolean);
  const probes = samples.length ? samples : [question];
  for (const sample of probes) {
    const blocked = blockedSampleReason(sample);
    if (blocked) return { ok: false, reason: blocked };
  }
  const sameQuestion = input.publishedFaqs.find((faq) =>
    normalizeFaqLookup(faq.question) === normalizeFaqLookup(question) &&
    normalized(faq.answer) !== normalized(answer));
  if (sameQuestion) return { ok: false, reason: "faq_conflict" };
  for (const published of input.publishedFaqs) {
    if (normalized(published.answer) === normalized(answer)) continue;
    const publishedScore = scoreLearningFaqCandidate(published.question, published);
    const candidateScore = scoreLearningFaqCandidate(published.question, candidate);
    if (candidateScore >= FAQ_HIT_THRESHOLD && candidateScore > publishedScore) {
      return { ok: false, reason: "faq_conflict" };
    }
  }
  for (const probe of LEARNING_FAQ_CONTROL_PROBES) {
    if (scoreLearningFaqCandidate(probe.query, candidate) >= FAQ_HIT_THRESHOLD) {
      return { ok: false, reason: "control_probe" };
    }
  }
  if (!probes.some((sample) => scoreLearningFaqCandidate(sample, candidate) >= FAQ_HIT_THRESHOLD)) {
    return { ok: false, reason: "evidence_mismatch" };
  }
  return { ok: true, reason: "" };
}

export function selectStorableLearningSuggestions(
  suggestions: LearningSuggestion[],
  input: {
    messages: LearningMessage[];
    turns: Array<{ id: string; question: string }>;
    publishedFaqs: LearningPublishedFaq[];
  },
) {
  const messageById = new Map(input.messages.map((message) => [message.id, message]));
  const turnById = new Map(input.turns.map((turn) => [turn.id, turn]));
  return suggestions.filter((suggestion) => {
    if (suggestion.type !== "faq") return true;
    const evidenceQuestions = [
      ...suggestion.evidenceMessageIds
        .map((id) => messageById.get(id))
        .filter((message): message is LearningMessage => message?.role === "customer")
        .map((message) => message.text),
      ...suggestion.evidenceTurnIds
        .map((id) => turnById.get(id)?.question ?? "")
        .filter(Boolean),
    ];
    return evaluateLearningFaqCandidate({
      question: suggestion.question,
      answer: suggestion.answer,
      keywords: suggestion.keywords,
      evidenceQuestions,
      publishedFaqs: input.publishedFaqs,
    }).ok;
  });
}
