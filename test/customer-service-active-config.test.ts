import { afterEach, describe, expect, it, vi } from "vitest";

import { customerServiceAiTiers } from "../supabase/functions/_shared/customer-service-active-config.ts";

afterEach(() => vi.unstubAllGlobals());

describe("shared customer service model configuration", () => {
  it("uses the active model, prompt, and fallback for live and replay paths", () => {
    vi.stubGlobal("Deno", { env: { get: (name: string) =>
      name === "CUSTOMER_SERVICE_AI_MODEL" ? "environment-model" : undefined } });
    const tiers = customerServiceAiTiers({
      model: "active-primary", fallback_model: "active-fallback",
      fallback_enabled: true, escalation_confidence: 0.81,
      system_prompt: "Current instructions", temperature: 0.3,
      retrieval_limit: 5, rag_config: {},
    });
    expect(tiers.primary).toMatchObject({
      model: "active-primary", systemPrompt: "Current instructions", temperature: 0.3,
    });
    expect(tiers.fallback).toMatchObject({ model: "active-fallback" });
    expect(tiers.escalationConfidence).toBe(0.81);
  });
});
