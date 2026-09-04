import { createClient } from "npm:@supabase/supabase-js@2";

import {
  answerCustomerServiceFaqWithTieredAi,
  classifyCustomerServiceWithTieredAi,
  customerServiceAiConfig,
  type CustomerServiceFaqKnowledge,
  type CustomerServiceIntentConfig,
} from "../_shared/customer-service-ai.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function serviceRoleKey() {
  if (env("SUPABASE_SERVICE_ROLE_KEY")) return env("SUPABASE_SERVICE_ROLE_KEY");
  const configured = env("SUPABASE_SECRET_KEYS");
  const keys = configured ? JSON.parse(configured) as Record<string, string> : {};
  if (!keys.default) throw new Error("missing_supabase_service_role_key");
  return keys.default;
}

function bigrams(value: string) {
  const normalized = value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function similarity(left: string, right: string) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "authentication_required" }, 401);

  const url = env("SUPABASE_URL");
  const user = createClient(url, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await user.rpc("customer_service_edit_access_check");
  if (accessError) return json({ error: "page_access_required" }, 403);

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const configId = typeof payload.config_id === "string" ? payload.config_id : "";
  const requestedLimit = Number(payload.sample_size || 20);
  const sampleLimit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 30));
  if (!configId) return json({ error: "config_id_required" }, 400);

  const admin = createClient(url, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData } = await user.auth.getUser();
  const { data: candidate, error: configError } = await admin
    .from("customer_service_config_versions")
    .select("id,environment,model,fallback_model,fallback_enabled,escalation_confidence,system_prompt,temperature,retrieval_limit")
    .eq("id", configId)
    .single();
  if (configError || !candidate) return json({ error: "config_not_found" }, 404);

  const { data: baseline } = await admin
    .from("customer_service_config_versions")
    .select("id")
    .eq("environment", candidate.environment)
    .eq("status", "active")
    .maybeSingle();
  const { data: run, error: runError } = await admin
    .from("customer_service_evaluation_runs")
    .insert({
      environment: candidate.environment,
      candidate_config_id: candidate.id,
      baseline_config_id: baseline?.id || null,
      status: "running",
      requested_by: authData.user?.id || null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "evaluation_run_create_failed" }, 500);

  try {
    const [
      { data: rows, error: rowsError },
      { data: faqRows, error: faqError },
      { data: intentRows, error: intentError },
      { data: permissionRows, error: permissionError },
      { data: testCaseRows, error: testCaseError },
    ] = await Promise.all([
      admin.from("customer_service_turn_feedback")
        .select("verdict,corrected_answer,customer_service_turns!inner(question,answer,intent,route,state_before,environment)")
        .in("verdict", ["correct", "incorrect"])
        .eq("include_in_learning", true)
        .eq("customer_service_turns.environment", candidate.environment)
        .order("reviewed_at", { ascending: false })
        .limit(sampleLimit),
      admin.from("customer_faqs").select("id,category,question,answer")
        .eq("is_published", true).order("sort_order").limit(100),
      admin.from("customer_service_intents")
        .select("intent_key,display_name,description,examples,action_key,confidence_threshold")
        .eq("enabled", true).order("priority"),
      admin.from("customer_service_tool_permissions")
        .select("intent_key,tool_key").eq("allowed", true),
      admin.from("customer_service_test_cases")
        .select("messages,expected_intent,expected_dialog_action,expected_answer")
        .eq("status", "active").order("created_at", { ascending: false })
        .limit(sampleLimit),
    ]);
    if (rowsError) throw rowsError;
    if (faqError) throw faqError;
    if (intentError) throw intentError;
    if (permissionError) throw permissionError;
    if (testCaseError) throw testCaseError;
    const faqs = (faqRows ?? []) as CustomerServiceFaqKnowledge[];
    const toolsByIntent = new Map<string, string[]>();
    for (const row of (permissionRows ?? []) as Array<{ intent_key: string; tool_key: string }>) {
      toolsByIntent.set(row.intent_key, [...(toolsByIntent.get(row.intent_key) ?? []), row.tool_key]);
    }
    const intents = ((intentRows ?? []) as Array<{
      intent_key: string; display_name: string; description: string; examples: string[] | null;
      action_key: string; confidence_threshold: number | string;
    }>).map<CustomerServiceIntentConfig>((row) => ({
      intentKey: row.intent_key,
      displayName: row.display_name,
      description: row.description,
      examples: row.examples ?? [],
      actionKey: row.action_key,
      confidenceThreshold: Number(row.confidence_threshold),
      toolKeys: toolsByIntent.get(row.intent_key) ?? [],
    }));
    const reviewedSamples = (rows ?? []).map((row: {
      verdict: string;
      corrected_answer: string | null;
      customer_service_turns: unknown;
    }) => {
      const turn = row.customer_service_turns as unknown as {
        question: string; answer: string | null; intent: string | null;
        route: string | null; state_before: string | null;
      };
      return {
        question: turn.question,
        reference: row.verdict === "incorrect" ? row.corrected_answer || "" : turn.answer || "",
        intent: turn.intent,
        tool: turn.route?.split(",")[0] || null,
        state: turn.state_before || "identifying",
        dialogAction: null as string | null,
        recentMessages: [] as Array<{ role: "customer" | "assistant" | "human"; text: string }>,
      };
    }).filter((sample: { question: string }) => sample.question);
    const testCaseSamples = ((testCaseRows ?? []) as Array<{
      messages: unknown;
      expected_intent: string | null;
      expected_dialog_action: string | null;
      expected_answer: string | null;
    }>).map((row) => {
      const messages = Array.isArray(row.messages)
        ? row.messages.filter((item): item is { role: "customer" | "assistant" | "human"; text: string } =>
            Boolean(item) && typeof item === "object" &&
            typeof (item as Record<string, unknown>).text === "string")
        : [];
      const lastCustomerIndex = messages.map((item) => item.role).lastIndexOf("customer");
      return {
        question: lastCustomerIndex >= 0 ? messages[lastCustomerIndex].text : "",
        reference: row.expected_answer || "",
        intent: row.expected_intent,
        tool: null,
        state: "identifying",
        dialogAction: row.expected_dialog_action,
        recentMessages: lastCustomerIndex > 0 ? messages.slice(0, lastCustomerIndex) : [],
      };
    }).filter((sample) => sample.question);
    const samples = (testCaseSamples.length ? testCaseSamples : reviewedSamples).slice(0, sampleLimit);
    if (!samples.length) throw new Error("no_reviewed_samples");

    const baseConfig = customerServiceAiConfig();
    const results = [] as Array<{
      answered: boolean; score: number; passed: boolean;
      intentMatched: boolean | null; toolMatched: boolean | null;
      dialogMatched: boolean | null;
    }>;
    for (const sample of samples) {
      const evaluationConfig = {
        ...baseConfig,
        model: candidate.model,
        systemPrompt: candidate.system_prompt,
        temperature: Number(candidate.temperature),
        reasoningEffort: /^grok-4\.3/i.test(candidate.model) ? "none" as const : "low" as const,
      };
      const tiers = {
        primary: evaluationConfig,
        fallback: candidate.fallback_enabled ? {
          ...evaluationConfig,
          model: candidate.fallback_model || "grok-4.5",
          reasoningEffort: "low" as const,
        } : null,
        escalationConfidence: Number(candidate.escalation_confidence ?? 0.72),
      };
      const [answer, classification] = await Promise.all([
        sample.reference
          ? answerCustomerServiceFaqWithTieredAi({ question: sample.question, faqs, tiers })
          : Promise.resolve(null),
        classifyCustomerServiceWithTieredAi({
          message: sample.question,
          conversationState: sample.state,
          recentMessages: sample.recentMessages,
          intents,
          tiers,
        }),
      ]);
      const score = answer ? similarity(answer.answer, sample.reference) : 0;
      const intentMatched = sample.intent ? classification?.intentKey === sample.intent : null;
      const toolMatched = sample.tool ? classification?.toolKey === sample.tool : null;
      const dialogMatched = sample.dialogAction
        ? classification?.dialogAction === sample.dialogAction
        : null;
      results.push({
        answered: Boolean(answer), score,
        passed: (!sample.reference || score >= 0.25) && intentMatched !== false && dialogMatched !== false,
        intentMatched, toolMatched, dialogMatched,
      });
    }
    const answered = results.filter((item) => item.answered).length;
    const passed = results.filter((item) => item.passed).length;
    const averageScore = results.reduce((sum, item) => sum + item.score, 0) / results.length;
    const intentResults = results.filter((item) => item.intentMatched !== null);
    const toolResults = results.filter((item) => item.toolMatched !== null);
    const dialogResults = results.filter((item) => item.dialogMatched !== null);
    const metrics = {
      reviewed_samples: results.length,
      answered,
      answered_rate: answered / results.length,
      agreement_passed: passed,
      agreement_rate: passed / results.length,
      average_similarity: averageScore,
      intent_accuracy: intentResults.length
        ? intentResults.filter((item) => item.intentMatched).length / intentResults.length
        : null,
      tool_accuracy: toolResults.length
        ? toolResults.filter((item) => item.toolMatched).length / toolResults.length
        : null,
      dialog_action_accuracy: dialogResults.length
        ? dialogResults.filter((item) => item.dialogMatched).length / dialogResults.length
        : null,
      threshold: 0.25,
    };
    const { data: baselineRun } = baseline?.id
      ? await admin.from("customer_service_evaluation_runs")
          .select("metrics")
          .eq("candidate_config_id", baseline.id)
          .eq("status", "complete")
          .order("completed_at", { ascending: false })
          .limit(1).maybeSingle()
      : { data: null };
    const baselineMetrics = (baselineRun?.metrics ?? {}) as Record<string, number>;
    const comparison = {
      baseline_config_id: baseline?.id || null,
      agreement_rate_delta: typeof baselineMetrics.agreement_rate === "number"
        ? metrics.agreement_rate - baselineMetrics.agreement_rate
        : null,
      intent_accuracy_delta: typeof baselineMetrics.intent_accuracy === "number" && typeof metrics.intent_accuracy === "number"
        ? metrics.intent_accuracy - baselineMetrics.intent_accuracy
        : null,
      dialog_action_accuracy_delta: typeof baselineMetrics.dialog_action_accuracy === "number" && typeof metrics.dialog_action_accuracy === "number"
        ? metrics.dialog_action_accuracy - baselineMetrics.dialog_action_accuracy
        : null,
    };
    await admin.from("customer_service_evaluation_runs").update({
      status: "complete", sample_size: results.length, metrics,
      comparison, completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return json({ ok: true, run_id: run.id, metrics, comparison });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("customer_service_evaluation_runs").update({
      status: "failed", error: message.slice(0, 500), completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return json({ error: "evaluation_failed", detail: message.slice(0, 300), run_id: run.id }, 500);
  }
});
