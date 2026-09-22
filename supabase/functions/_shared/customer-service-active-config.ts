import { customerServiceAiConfig, type CustomerServiceAiTierConfig } from "./customer-service-ai.ts";
import {
  customerServiceJevConfig,
  type CustomerServiceJevConfig,
} from "./customer-service-jev.ts";

export type ActiveCustomerServiceConfig = {
  id?: string;
  updated_at?: string;
  model: string;
  fallback_model: string;
  fallback_enabled: boolean;
  escalation_confidence: number;
  system_prompt: string;
  temperature: number;
  retrieval_limit: number;
  rag_config?: unknown;
  jev_enabled?: boolean;
  jev_shadow?: boolean;
  jev_model?: string;
  jev_accept_threshold?: number;
  jev_requires_human_threshold?: number;
  jev_budget_ms?: number;
};

export type CustomerServiceClassifierConfig = {
  jev: CustomerServiceJevConfig;
  grokTiers: CustomerServiceAiTierConfig;
};

/** The live bot and offline evaluator must resolve the same model settings. */
export function customerServiceAiTiers(active: ActiveCustomerServiceConfig | null): CustomerServiceAiTierConfig {
  const base = customerServiceAiConfig();
  const primaryModel = active?.model || base.model || "grok-4.3";
  const fallbackModel = active?.fallback_model || "grok-4.5";
  return {
    primary: {
      ...base,
      model: primaryModel,
      systemPrompt: active?.system_prompt || "",
      temperature: Number(active?.temperature ?? 0.1),
      reasoningEffort: /^grok-4\.3/i.test(primaryModel) ? "none" : "low",
    },
    fallback: active?.fallback_enabled === false ? null : {
      ...base,
      model: fallbackModel,
      systemPrompt: active?.system_prompt || "",
      temperature: Number(active?.temperature ?? 0.1),
      reasoningEffort: "low",
    },
    escalationConfidence: Number(active?.escalation_confidence ?? 0.72),
  };
}

export function customerServiceJevFromActive(
  active: ActiveCustomerServiceConfig | null,
  apiKey = "",
): CustomerServiceJevConfig {
  return customerServiceJevConfig({
    enabled: active?.jev_enabled ?? false,
    shadow: active?.jev_shadow ?? true,
    model: active?.jev_model ?? "jev-latest",
    acceptThreshold: active?.jev_accept_threshold ?? 0.80,
    requiresHumanThreshold: active?.jev_requires_human_threshold ?? 0.50,
    budgetMs: active?.jev_budget_ms ?? 1000,
    apiKey,
  });
}

export function customerServiceClassifierConfig(
  active: ActiveCustomerServiceConfig | null,
  jevApiKey = "",
): CustomerServiceClassifierConfig {
  return {
    jev: customerServiceJevFromActive(active, jevApiKey),
    grokTiers: customerServiceAiTiers(active),
  };
}
