import { describe, expect, it, vi } from "vitest";

import { draftHistoryCodeChange } from "../supabase/functions/_shared/customer-service-history-code-change.ts";
import { draftHistoryRuntimeChange } from "../supabase/functions/_shared/customer-service-history-runtime-change.ts";

const config = {
  enabled: true,
  endpoint: "https://model.invalid/v1/chat/completions",
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 5_000,
};

const issue = {
  category: "wrong_policy",
  severity: "high" as const,
  layer: "knowledge" as const,
  evidence: [],
  suggestedFix: "Use the current approved policy.",
};

describe("history repair draft grounding", () => {
  it("does not send the target human reply to the R2 draft generator", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("humanReference");
      expect(String(init?.body)).not.toContain("obsolete-human-answer");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: "Update the policy wording.",
          changes: [],
          tests: [],
          risks: [],
        }) } }],
      }), { status: 200 });
    });

    await draftHistoryRuntimeChange({
      question: "Can I change this order?",
      context: [],
      aiAnswer: "Please wait.",
      issues: [issue],
      targets: { intents: [], replyTemplates: [], workflowPolicies: [] },
      config,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not send the target human reply to the R3 draft generator", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("humanReference");
      expect(String(init?.body)).not.toContain("obsolete-human-answer");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: "Adjust the routing guard.",
          files: [],
          tests: [],
          risks: [],
        }) } }],
      }), { status: 200 });
    });

    await draftHistoryCodeChange({
      question: "Can I change this order?",
      context: [],
      aiAnswer: "Please wait.",
      issues: [issue],
      config,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
