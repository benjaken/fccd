/** Final FAQ text validation. This is a deterministic guard, not semantic entailment. */
export type FaqGroundingSource = { question: string; answer: string };

export const NEUTRAL_FAQ_CLARIFICATION = "請問你想查詢哪一方面？";
const SAFE_CLARIFICATIONS = new Set([
  NEUTRAL_FAQ_CLARIFICATION,
  "請問你想查詢哪張訂單？",
  "請問你指的是哪一項產品？",
  "請問你指的是哪個日期？",
]);

function numbers(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((token) =>
    token.replaceAll(",", "").replace(/[.]+$/g, "")
  );
}
function urls(text: string): string[] {
  return (text.match(/(?:https?:\/\/|www\.)[^\s<>"'，。！？；、）)\]]+/gi) ?? [])
    .map((url) => url.replace(/[.,;!?]+$/, ""));
}

export function faqTextIsGrounded(text: string, sources: readonly FaqGroundingSource[]): boolean {
  if (!sources.length || !text.trim()) return false;
  const sourceText = sources.map((source) => `${source.question}\n${source.answer}`).join("\n");
  const allowedNumbers = new Set(numbers(sourceText));
  const allowedUrls = new Set(urls(sourceText));
  return numbers(text).every((token) => allowedNumbers.has(token)) &&
    urls(text).every((url) => allowedUrls.has(url));
}

/**
 * All customer-facing fields are composed BEFORE the final guard.
 * Unrestricted generated clarification prose can assert a policy even without a
 * number. Only application-owned neutral questions are emitted in that field.
 * Unsupported numeric/URL claims are rejected, not silently accepted.
 */
export function composeGroundedFaqReply(
  answer: string,
  clarification: string | null | undefined,
  sources: readonly FaqGroundingSource[],
): { answer: string; clarificationQuestion: string } | null {
  const body = answer.trim();
  const question = clarification?.trim() ?? "";
  if (!faqTextIsGrounded(body, sources)) return null;
  if (question && !faqTextIsGrounded(question, sources)) return null;
  const safeQuestion = question
    ? SAFE_CLARIFICATIONS.has(question) ? question : NEUTRAL_FAQ_CLARIFICATION
    : "";
  const combined = safeQuestion && !body.includes(safeQuestion) ? `${body}\n${safeQuestion}` : body;
  if (!faqTextIsGrounded(combined, sources)) return null;
  return { answer: combined, clarificationQuestion: safeQuestion };
}
