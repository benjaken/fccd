export type LearningMessage = {
  id?: string;
  phone: string;
  role: "customer" | "assistant" | "human";
  text: string;
  createdAt: string;
};

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
};

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

export function parseLearningAnalysis(payload: unknown, turns: LearningTurn[], messages: LearningMessage[], model: string) {
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
    const groundedAnswer = item.type !== "faq" || humanGrounded || matchingBotTurns.length ? answer : "";
    suggestions.push({ type: item.type, title: String(item.title).slice(0, 200),
      reason: String(item.reason || "").slice(0, 1_000), question, answer: groundedAnswer,
      category: String(item.category || "ordering").slice(0, 50), keywords: String(item.keywords || "").slice(0, 500),
      evidenceTurnIds, evidenceMessageIds,
      autoAliasEligible: Boolean(groundedAnswer) && (humanGrounded || matchingBotTurns.some((turn) => turn.faq_source_ids?.length)),
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
