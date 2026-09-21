import type { HistoryIssue } from "./customer-service-history-judge.ts";
import type { HistoryJudgeAiConfig } from "./customer-service-history-judge-ai.ts";
import type { LearningRuntimeTargets } from "./customer-service-learning.ts";
import {
  RUNTIME_CHANGE_DRAFT_VERSION,
  sanitizeRuntimeChangeDraft,
  type RuntimeChangeDraft,
} from "./customer-service-repair-proposals.ts";

/**
 * R2 runtime policy/intent draft generator (HR-09).
 *
 * Turns a diagnosed issue into a *reviewable* patch against a live intent,
 * workflow policy or reply template — the same lane learning suggestions use.
 * It is NOT an executor: it never writes rows, runs migrations or publishes
 * anything. The output is sanitized against the live target keys by
 * `sanitizeRuntimeChangeDraft` and stored on the repair proposal for a human to
 * review and apply through the allow-listed RPC.
 *
 * The model has no database access, so the result is a hypothesis grounded only
 * in the judge's evidence and the supplied target options.
 */
export type HistoryRuntimeChangeInput = {
  question: string;
  context: Array<{ role: string; text: string }>;
  aiAnswer: string;
  referenceAnswer: string;
  issues: HistoryIssue[];
  targets: LearningRuntimeTargets;
  area?: string;
  config: HistoryJudgeAiConfig;
  fetchImpl?: typeof fetch;
};

const SYSTEM_PROMPT = [
  "You draft a minimal runtime change for the FCCD project (a Hong Kong food-delivery WhatsApp customer-service system).",
  "You can ONLY append to an existing customer-service intent description, edit an existing reply template, or adjust an existing workflow policy. You cannot add new intents, policies or templates, and you cannot change any other field.",
  "The result is a HYPOTHESIS for a human reviewer, never an applied change. Never claim it was applied, deployed, tested or reviewed.",
  "Use only the target keys supplied in the user message. If no existing target fits the root cause, return an empty changes array.",
  "Patch shapes (exact, no other fields):",
  'intent: {"description_append": string, "examples_append": string[]}',
  'reply_template: {"content": string, "display_name"?: string, "enabled"?: boolean}',
  'workflow_policy: {"instructions_append": string, "context_window"?: integer 1-12, "clarification_threshold"?: number 0-1, "auto_resume"?: boolean, "enabled"?: boolean}',
  "Never invent customer data, prices, dates or business facts. Prefer the smallest wording change that fixes the root cause.",
  'Return JSON only: {"summary":string,"changes":[{"target":"intent"|"reply_template"|"workflow_policy","key":string,"patch":object}],"tests":string[],"risks":string[]}.',
].join("\n");

export async function draftHistoryRuntimeChange(
  input: HistoryRuntimeChangeInput,
): Promise<RuntimeChangeDraft | null> {
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
        max_tokens: 2_000, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              version: RUNTIME_CHANGE_DRAFT_VERSION,
              area: input.area ?? "customer_service_reply",
              question: input.question,
              context: input.context,
              aiAnswer: input.aiAnswer,
              humanReference: input.referenceAnswer,
              issues: input.issues.map((issue) => ({
                category: issue.category, severity: issue.severity, layer: issue.layer,
                suggestedFix: issue.suggestedFix,
              })),
              targets: input.targets,
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
    return sanitizeRuntimeChangeDraft(parsed, input.targets);
  } catch (error) {
    console.error("customer-service runtime-change draft failed",
      error instanceof Error && error.name === "AbortError" ? "draft_timeout" : "draft_error");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
