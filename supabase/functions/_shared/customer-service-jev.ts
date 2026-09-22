export type DialogAction =
  | "new_request"
  | "continue_current"
  | "add_information"
  | "select_option"
  | "confirm"
  | "deny"
  | "correct_previous"
  | "cancel_current"
  | "switch_task"
  | "resume_previous";

export type CustomerServiceJevDecision = {
  intentKey: string;
  intentConfidence: number;
  dialogAction: DialogAction;
  dialogActionConfidence: number;
  requiresHumanProbability: number;
  needsClarificationProbability: number;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type CustomerServiceJevTrace = {
  enabled: boolean;
  shadow: boolean;
  outcome: "decided" | "escalated" | "error" | "disabled" | "safety_override";
  attempted: boolean;
  attempts: number;
  fallbackOk: boolean | null;
  errorCode: string | null;
  inputTokens: number;
  costUsd: number;
  classificationLatencyMs: number | null;
  decision: CustomerServiceJevDecision | null;
};

export type CustomerServiceJevConfig = {
  enabled: boolean;
  shadow: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  acceptThreshold: number;
  requiresHumanThreshold: number;
  budgetMs: number;
};

export const DEFAULT_JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_JEV_MODEL = "jev-latest";
export const DEFAULT_ACCEPT_THRESHOLD = 0.8;
export const DEFAULT_REQUIRES_HUMAN_THRESHOLD = 0.5;
export const DEFAULT_BUDGET_MS = 1000;

export function customerServiceJevConfig(
  overrides: Partial<CustomerServiceJevConfig> = {},
): CustomerServiceJevConfig {
  return {
    enabled: overrides.enabled ?? false,
    shadow: overrides.shadow ?? true,
    endpoint: overrides.endpoint ?? DEFAULT_JEV_ENDPOINT,
    apiKey: overrides.apiKey ?? "",
    model: overrides.model ?? DEFAULT_JEV_MODEL,
    acceptThreshold: overrides.acceptThreshold ?? DEFAULT_ACCEPT_THRESHOLD,
    requiresHumanThreshold:
      overrides.requiresHumanThreshold ?? DEFAULT_REQUIRES_HUMAN_THRESHOLD,
    budgetMs: overrides.budgetMs ?? DEFAULT_BUDGET_MS,
  };
}

type JevAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

function buildQuestions(
  intents: Array<{ intentKey: string; description: string; examples?: string[] }>,
) {
  const intentCriteria: Record<string, string> = {};
  for (const i of intents) {
    intentCriteria[i.intentKey] = i.description;
    if (i.examples?.length) {
      intentCriteria[i.intentKey] += ` Examples: ${i.examples.join("; ")}`;
    }
  }

  return {
    intent: {
      type: "choice" as const,
      instructions:
        "Classify the communicative purpose of the customer's complete message in this Hong Kong catering WhatsApp conversation.",
      criteria: intentCriteria,
    },
    dialog_action: {
      type: "choice" as const,
      instructions:
        "What is the customer's dialog action relative to the ongoing conversation?",
      criteria: {
        new_request: "Starting a completely new request or topic.",
        continue_current: "Continuing the current request with more detail.",
        add_information: "Providing additional information for the current request.",
        select_option: "Choosing from options previously presented.",
        confirm: "Confirming or agreeing to a previous proposal.",
        deny: "Rejecting or declining a previous proposal.",
        correct_previous: "Correcting something previously said.",
        cancel_current: "Wanting to cancel or abandon the current request.",
        switch_task: "Switching to a different task or topic.",
        resume_previous: "Resuming a previously paused request.",
      },
    },
    requires_human: {
      type: "noul" as const,
      instructions:
        "Should a human agent take over? Changing, cancelling or refunding an existing order requires a human agent. So do complaints and price negotiations.",
      criteria: {
        true: "Changing, cancelling or refunding an existing order, complaint, refund/legal threat, strong frustration, price negotiation, or any request policy will not let a bot resolve",
        false: "A new enquiry, FAQ question, greeting, read-only order lookup, or off-topic message",
      },
    },
    needs_clarification: {
      type: "noul" as const,
      instructions:
        "Is the request too ambiguous to act on without asking the customer for clarification?",
      criteria: {
        true: "Missing critical details (date, headcount, product, address) or the request could mean multiple things",
        false: "The request is clear enough to route or respond to",
      },
    },
  };
}

export async function classifyCustomerServiceWithJev(args: {
  message: string;
  conversationState: string;
  pendingRequest?: string;
  recentMessages?: Array<{ role: string; text: string }>;
  intents: Array<{ intentKey: string; description: string; examples?: string[] }>;
  config: CustomerServiceJevConfig;
  fetchImpl?: typeof fetch;
}): Promise<{ decision: CustomerServiceJevDecision | null; trace: CustomerServiceJevTrace }> {
  const { config } = args;
  const trace: CustomerServiceJevTrace = {
    enabled: config.enabled,
    shadow: config.shadow,
    outcome: "disabled",
    attempted: false,
    attempts: 0,
    fallbackOk: null,
    errorCode: null,
    inputTokens: 0,
    costUsd: 0,
    classificationLatencyMs: null,
    decision: null,
  };

  if (!config.enabled) return { decision: null, trace };
  if (!config.apiKey) {
    trace.outcome = "error";
    trace.errorCode = "missing_api_key";
    return { decision: null, trace };
  }

  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  const questions = buildQuestions(args.intents);
  const state = {
    message: args.message,
    conversationState: args.conversationState,
    pendingRequest: args.pendingRequest ?? "",
    recentMessages: args.recentMessages ?? [],
  };
  const body = JSON.stringify({ state, model: config.model, questions });

  trace.attempted = true;
  trace.attempts = 1;
  const startedAt = performance.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.budgetMs);

    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    trace.classificationLatencyMs = latencyMs;

    if (!response.ok) {
      trace.outcome = "error";
      trace.errorCode = `http_${response.status}`;
      return { decision: null, trace };
    }

    const payload = await response.json();
    const answers = (payload.answers ?? {}) as Record<string, JevAnswer>;
    const usage = payload.usage ?? {};
    trace.inputTokens = Number(usage.input_tokens) || 0;
    trace.costUsd = (trace.inputTokens / 1_000_000) * 0.042;

    const intentAnswer = answers.intent;
    const dialogAnswer = answers.dialog_action;
    const requiresHumanAnswer = answers.requires_human;
    const needsClarificationAnswer = answers.needs_clarification;

    if (
      !intentAnswer ||
      intentAnswer.type !== "choice" ||
      !dialogAnswer ||
      dialogAnswer.type !== "choice"
    ) {
      trace.outcome = "error";
      trace.errorCode = "invalid_response_shape";
      return { decision: null, trace };
    }

    const validIntentKeys = new Set(args.intents.map((i) => i.intentKey));
    if (!validIntentKeys.has(intentAnswer.choice)) {
      trace.outcome = "error";
      trace.errorCode = "intent_not_in_closed_set";
      return { decision: null, trace };
    }

    const validDialogActions = new Set([
      "new_request", "continue_current", "add_information", "select_option",
      "confirm", "deny", "correct_previous", "cancel_current", "switch_task", "resume_previous",
    ]);
    if (!validDialogActions.has(dialogAnswer.choice)) {
      trace.outcome = "error";
      trace.errorCode = "invalid_dialog_action";
      return { decision: null, trace };
    }

    const clampProb = (v: unknown, fallback: number): number => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
    };
    const clampConf = (v: unknown): number => clampProb(v, 0);

    const decision: CustomerServiceJevDecision = {
      intentKey: intentAnswer.choice,
      intentConfidence: clampConf(intentAnswer.confidence),
      dialogAction: dialogAnswer.choice as DialogAction,
      dialogActionConfidence: clampConf(dialogAnswer.confidence),
      requiresHumanProbability:
        requiresHumanAnswer?.type === "noul"
          ? clampProb(requiresHumanAnswer.noul, 0.5)
          : 0.5,
      needsClarificationProbability:
        needsClarificationAnswer?.type === "noul"
          ? clampProb(needsClarificationAnswer.noul, 0.5)
          : 0.5,
      model: typeof payload.model === "string" ? payload.model : config.model,
      latencyMs,
      usage: {
        inputTokens: Math.max(0, Number(usage.input_tokens) || 0),
        outputTokens: Math.max(0, Number(usage.output_tokens) || 0),
      },
    };

    trace.decision = decision;
    trace.outcome = config.shadow ? "escalated" : "decided";
    return { decision: config.shadow ? null : decision, trace };
  } catch (error) {
    trace.outcome = "error";
    trace.errorCode =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message.slice(0, 100)
          : "unknown";
    return { decision: null, trace };
  }
}

export function isJevAcceptable(
  decision: CustomerServiceJevDecision,
  config: CustomerServiceJevConfig,
  actionKey: string,
): { accepted: boolean; reason: string | null } {
  const highRisk = actionKey === "order_handoff" || actionKey === "human_handoff";

  if (decision.intentConfidence < config.acceptThreshold) {
    return { accepted: false, reason: "low_intent_confidence" };
  }
  if (highRisk && decision.intentConfidence < 0.95) {
    return { accepted: false, reason: "high_risk_needs_higher_confidence" };
  }
  if (decision.needsClarificationProbability >= 0.5) {
    return { accepted: false, reason: "needs_clarification" };
  }
  if (decision.dialogActionConfidence < 0.8) {
    return { accepted: false, reason: "low_dialog_confidence" };
  }
  if (highRisk && decision.requiresHumanProbability < config.requiresHumanThreshold) {
    return { accepted: false, reason: "inconsistent_requires_human_low" };
  }
  if (!highRisk && decision.requiresHumanProbability >= config.requiresHumanThreshold) {
    return { accepted: false, reason: "inconsistent_requires_human_high" };
  }

  return { accepted: true, reason: null };
}
