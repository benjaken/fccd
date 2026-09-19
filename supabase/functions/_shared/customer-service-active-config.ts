import { customerServiceAiConfig, type CustomerServiceAiTierConfig } from "./customer-service-ai.ts";

export type ActiveCustomerServiceConfig = {
  model: string;
  fallback_model: string;
  fallback_enabled: boolean;
  escalation_confidence: number;
  system_prompt: string;
  temperature: number;
  retrieval_limit: number;
  rag_config?: unknown;
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
