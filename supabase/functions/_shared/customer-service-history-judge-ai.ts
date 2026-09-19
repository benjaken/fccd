import {
  HISTORY_JUDGE_RUBRIC_VERSION,
  parseHistoryJudgment,
  type HistoryJudgment,
} from "./customer-service-history-judge.ts";

/**
 * LLM judge for history samples (HR-04b). The reference human answer is only a
 * comparison point, never a factual standard: business facts must be supported
 * by the approved sources. Every citation is validated against the controlled
 * inputs by parseHistoryJudgment; a fabricated quote forces human review.
 */
export type HistoryJudgeAiConfig = {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature?: number;
};

export type HistoryJudgeInput = {
  question: string;
  context: Array<{ role: string; text: string }>;
  referenceAnswer: string;
  aiAnswer: string;
  candidates: Array<{ id: string; question: string; answer: string }>;
  traceSummary: Record<string, unknown>;
  config: HistoryJudgeAiConfig;
  fetchImpl?: typeof fetch;
};

const RUBRIC = [
  "You are an evaluation judge for a Hong Kong food-delivery WhatsApp customer-service assistant.",
  "Compare the assistant answer with the human reference and the approved sources. The human reference is NOT a factual standard and may be outdated or wrong.",
  "Business facts (prices, policies, dates, availability, completed actions) must be supported by an approved source; unsupported assistant claims are 'unsupported' or 'conflicting'.",
  "A textually similar answer can still be ungrounded; a different answer can still be correct under current policy.",
  "Only cite evidence that literally appears in the supplied inputs. Never invent quotes, ids or policies.",
  "`suggestedFix` is a short description, never code or SQL.",
  'Return JSON only: {"status":"scored"|"not_evaluable"|"out_of_scope"|"execution_failed","comparison":"match"|"partial"|"divergent"|"inconclusive","aiGrounding":"supported"|"unsupported"|"conflicting"|"unknown","referenceStatus":"supported_for_selected_time"|"reference_not_current"|"reference_suspect"|"unknown","issues":[{"category":string,"severity":"low"|"medium"|"high"|"critical","layer":"sample"|"context"|"routing"|"retrieval"|"knowledge"|"generation"|"validation"|"rendering"|"infrastructure","evidence":[{"sourceType":"ai_answer"|"human_reference"|"approved_source"|"trace","sourceId":string,"quote":string}],"suggestedFix":string}],"requiresHumanReview":boolean}.',
].join("\n");

export function historyJudgeEvidence(input: Pick<HistoryJudgeInput,
  "aiAnswer" | "referenceAnswer" | "candidates" | "traceSummary">): Record<string, string> {
  const evidence: Record<string, string> = {
    ai_answer: input.aiAnswer,
    human_reference: input.referenceAnswer,
    trace: JSON.stringify(input.traceSummary),
  };
  for (const candidate of input.candidates) evidence[candidate.id] = `${candidate.question}\n${candidate.answer}`;
  return evidence;
}

export async function judgeHistoryDecisionPoint(input: HistoryJudgeInput): Promise<HistoryJudgment | null> {
  const { config } = input;
  if (!config.enabled || !config.endpoint || !config.apiKey || !config.model) return null;
  const evidence = historyJudgeEvidence(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, config.timeoutMs));
  try {
    const response = await (input.fetchImpl ?? fetch)(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model, stream: false, temperature: config.temperature ?? 0.1,
        max_tokens: 1_200, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RUBRIC },
          {
            role: "user",
            content: JSON.stringify({
              rubricVersion: HISTORY_JUDGE_RUBRIC_VERSION,
              question: input.question,
              context: input.context,
              aiAnswer: input.aiAnswer,
              humanReference: input.referenceAnswer,
              approvedSources: input.candidates.map((candidate) => ({ id: candidate.id, text: evidence[candidate.id] })),
              trace: input.traceSummary,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content) as unknown;
    return parseHistoryJudgment(parsed, { evidence });
  } catch (error) {
    console.error("customer-service history judge failed",
      error instanceof Error && error.name === "AbortError" ? "judge_timeout" : "judge_error");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
