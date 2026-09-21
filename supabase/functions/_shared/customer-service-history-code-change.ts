import type { HistoryIssue } from "./customer-service-history-judge.ts";
import type { HistoryJudgeAiConfig } from "./customer-service-history-judge-ai.ts";
import {
  CODE_CHANGE_DRAFT_VERSION,
  sanitizeCodeChangeDraft,
  type CodeChangeDraft,
} from "./customer-service-repair-proposals.ts";

/**
 * R3 code-change draft generator (HR-08).
 *
 * This turns the judge's descriptive `suggestedFix` for a diagnosed issue into
 * a *reviewable* code-change draft. It is explicitly NOT an executor: it never
 * writes files, never runs SQL, never opens a PR and never touches production.
 * The output is sanitized by `sanitizeCodeChangeDraft` and stored on the repair
 * proposal for a human to review, apply locally and land through normal CI.
 *
 * The model has no repository access, so the result is a hypothesis grounded
 * only in the judge's evidence. A human must verify it before any merge.
 */
export type HistoryCodeChangeInput = {
  question: string;
  context: Array<{ role: string; text: string }>;
  aiAnswer: string;
  referenceAnswer: string;
  issues: HistoryIssue[];
  area?: string;
  config: HistoryJudgeAiConfig;
  fetchImpl?: typeof fetch;
};

const SYSTEM_PROMPT = [
  "You draft a minimal, reviewable code change for the FCCD project (a Hong Kong food-delivery WhatsApp customer-service system).",
  "You do NOT have the repository. The result is a HYPOTHESIS for a human reviewer, never an applied change.",
  "Use the judge's issue categories and suggestedFix to propose the smallest change that would fix the root cause.",
  "Only propose repo-relative paths under src/, supabase/, scripts/, docs/ or test/. Never Windows or absolute paths.",
  "Prefer editing existing prompt/context/template modules over adding new files. Never invent secrets or customer data.",
  "Never claim the change was applied, deployed, tested or reviewed.",
  "If you cannot propose a concrete change from the evidence, return an empty files array.",
  'Return JSON only: {"summary":string,"files":[{"path":string,"rationale":string,"before":string,"after":string}],"tests":string[],"risks":string[]}.',
  "`before` is the existing code (best guess) and `after` is the replacement, both as plain text, for a human to diff.",
].join("\n");

export async function draftHistoryCodeChange(
  input: HistoryCodeChangeInput,
): Promise<CodeChangeDraft | null> {
  const { config } = input;
  if (!config.enabled || !config.endpoint || !config.apiKey || !config.model) return null;
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
        max_tokens: 2_400, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              version: CODE_CHANGE_DRAFT_VERSION,
              area: input.area ?? "customer_service_reply",
              question: input.question,
              context: input.context,
              aiAnswer: input.aiAnswer,
              humanReference: input.referenceAnswer,
              issues: input.issues.map((issue) => ({
                category: issue.category, severity: issue.severity, layer: issue.layer,
                suggestedFix: issue.suggestedFix,
              })),
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
    return sanitizeCodeChangeDraft(parsed);
  } catch (error) {
    console.error("customer-service code-change draft failed",
      error instanceof Error && error.name === "AbortError" ? "draft_timeout" : "draft_error");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
