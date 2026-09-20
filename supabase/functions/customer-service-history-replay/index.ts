import { createClient } from "npm:@supabase/supabase-js@2";
import { caseFingerprint } from "../_shared/customer-service-cases.ts";
import { customerServiceAiTiers, type ActiveCustomerServiceConfig } from "../_shared/customer-service-active-config.ts";
import { customerServiceRagConfig } from "../_shared/customer-service-rag-config.ts";
import {
  buildHistoryDecisionSamples,
  HISTORY_SAMPLE_BUILDER_VERSION,
  type HistoryDecisionSample,
} from "../_shared/customer-service-history-samples.ts";
import {
  replayHistoryDecisionPoint,
  HISTORY_REPLAY_PIPELINE_VERSION,
  type HistoryReplayResult,
} from "../_shared/customer-service-history-replay.ts";
import {
  canDraftHistoryCaseGuidance, diagnoseHistoryRepair, evaluateRepairTrials, normalizedRepairQuestion,
  type RepairTrial,
} from "../_shared/customer-service-history-auto-repair.ts";
import { HISTORY_CASE_INTENTS, recognizeHistoryCase } from "../_shared/customer-service-history-case-recognition.ts";
import { parseCustomerServiceCaseInput } from "../_shared/customer-service-cases.ts";
import {
  deterministicHistoryIssues,
  mergeHistoryJudgment,
  HISTORY_JUDGE_RUBRIC_VERSION,
} from "../_shared/customer-service-history-judge.ts";
import { judgeHistoryDecisionPoint } from "../_shared/customer-service-history-judge-ai.ts";
import {
  defaultRoutingConversation,
  evaluateRoutingResult,
  replayRoutingDecisionPoint,
  type RoutingExpectation,
  type RoutingFixture,
} from "../_shared/customer-service-routing-replay.ts";
import { toHistoryMessages, type HistorySourceRow } from "../_shared/customer-service-history-source.ts";
import type { CustomerServiceFaqCandidate } from "../_shared/customer-service-retrieval.ts";

/**
 * History replay task (HR-03). Fixes a sample manifest at run start, then
 * processes small batches with continuation. The evaluator only reads and
 * writes its own records; business writes are impossible (forbidden deps) and
 * no WhatsApp message is sent. R1/R2 repair execution is a separate command.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SOURCE_ROWS = 20_000;
const MAX_PLAN = 200;
/** Per-invocation wall-clock budget; the client auto-continues when the response still has `remaining`. */
const DEADLINE_MS = 110_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}
function serviceRoleKey() {
  if (env("SUPABASE_SERVICE_ROLE_KEY")) return env("SUPABASE_SERVICE_ROLE_KEY");
  const keys = env("SUPABASE_SECRET_KEYS") ? JSON.parse(env("SUPABASE_SECRET_KEYS")) as Record<string, string> : {};
  if (!keys.default) throw new Error("missing_service_configuration");
  return keys.default;
}
function deploymentEnvironment() {
  return env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop");
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const size = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length || 1));
  let next = 0;
  const run = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: size }, run));
}

function readConcurrency(value: unknown) {
  return Math.max(1, Math.min(8, Math.trunc(Number(value)) || 4));
}

type ReplaySampleRow = {
  id: string;
  question: string;
  context: unknown;
  reference_answer: string | null;
  pairing: string | null;
  context_gap: boolean | null;
  source_fingerprint: string;
  lineage: unknown;
};

type JudgeSampleRow = {
  id: string;
  question: string;
  context: unknown;
  reference_answer: string | null;
  ai_answer: string | null;
  trace: unknown;
  judgment: unknown;
};

type AdminClient = ReturnType<typeof createClient>;

type AutoRepairSample = {
  id: string; run_id: string; question: string; context: unknown;
  reference_answer: string | null; ai_answer: string | null;
  status: string; pairing: string | null; context_gap: boolean; judgment: unknown; lineage: unknown;
  scenario_at: string | null;
};

function asReplayContext(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is {
    role: "customer" | "assistant" | "human"; text: string;
  } => Boolean(entry) && typeof entry === "object" && typeof entry.text === "string") : [];
}

function comparisonTrial(baseline: HistoryReplayResult, candidate: HistoryReplayResult): RepairTrial {
  return {
    baselineSourceIds: baseline.faqSourceIds, candidateSourceIds: candidate.faqSourceIds,
    baselineGuard: baseline.answerGuardPassed, candidateGuard: candidate.answerGuardPassed,
    baselineAnswer: baseline.aiAnswer, candidateAnswer: candidate.aiAnswer,
    retrievalError: baseline.retrieval.error || candidate.retrieval.error,
  };
}

async function loadReplayConfig(admin: AdminClient, environment: string) {
  const { data, error } = await admin.from("customer_service_config_versions")
    .select("id,updated_at,model,fallback_model,fallback_enabled,escalation_confidence,system_prompt,temperature,retrieval_limit,rag_config")
    .eq("environment", environment).eq("status", "active").maybeSingle();
  if (error) throw error;
  const active = data as ActiveCustomerServiceConfig | null;
  const tiers = customerServiceAiTiers(active);
  const ragConfig = customerServiceRagConfig(active);
  const fingerprint = caseFingerprint(JSON.stringify({
    active, ragConfig, primaryModel: tiers.primary.model,
    fallbackModel: tiers.fallback?.model ?? null,
  }));
  return { tiers, ragConfig, fingerprint,
    configId: active?.id ?? null, configUpdatedAt: active?.updated_at ?? null };
}

async function authorize(request: Request, admin: AdminClient): Promise<string | null> {
  const secret = env("CUSTOMER_SERVICE_REPORT_CRON_SECRET") || env("WATI_ORDER_CRON_SECRET");
  if (secret && request.headers.get("x-cron-secret")?.trim() === secret) return null;
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("authentication_required");
  const { data, error } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) throw new Error("authentication_required");
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await userClient.rpc("customer_service_edit_access_check");
  if (accessError) throw new Error("page_access_required");
  return data.user.id;
}

async function readSourceRows(admin: AdminClient, table: string, columns: string,
  environment: string, since: string | null, until: string | null): Promise<HistorySourceRow[]> {
  const rows: HistorySourceRow[] = [];
  for (let offset = 0; offset < MAX_SOURCE_ROWS; offset += 1_000) {
    let query = admin.from(table).select(columns).eq("environment", environment)
      .order("created_at").order("id").range(offset, offset + 999);
    if (since) query = query.gte("created_at", since);
    if (until) query = query.lt("created_at", until);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as HistorySourceRow[]));
    if (!data || data.length < 1_000) break;
  }
  return rows;
}

function selectManifest(samples: HistoryDecisionSample[], sampleSize: number, seed: string) {
  // `samples` is ordered oldest first, so without a seed take the most recent
  // decision points rather than the earliest.
  if (!seed) return samples.slice(-sampleSize);
  return [...samples]
    .sort((left, right) =>
      caseFingerprint(`${seed}\u0000${left.sampleKey}`).localeCompare(caseFingerprint(`${seed}\u0000${right.sampleKey}`)))
    .slice(0, sampleSize);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const admin = createClient(env("SUPABASE_URL"), serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actorId = await authorize(request, admin);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    // Default off: history eval and any repair must be explicitly enabled server-side.
    if ((action === "start" || action === "process") &&
        env("CUSTOMER_SERVICE_HISTORY_EVAL_ENABLED").toLowerCase() !== "true") {
      return json({ error: "history_eval_disabled" }, 503);
    }
    const environment = deploymentEnvironment();
    if (body.environment !== undefined && String(body.environment) !== environment) {
      return json({ error: "environment_mismatch" }, 400);
    }

    if (action === "start") {
      const scope = body.scope === "routing_safety" ? "routing_safety" : "answer_quality";
      const replayConfig = await loadReplayConfig(admin, environment);
      const requested = Math.max(1, Math.min(MAX_PLAN, Number(body.sample_size) || 50));
      const seed = typeof body.seed === "string" ? body.seed.slice(0, 64) : "";
      const since = typeof body.source_since === "string" && body.source_since ? body.source_since : null;
      const until = typeof body.source_until === "string" && body.source_until ? body.source_until : null;

      if (scope === "routing_safety") {
        // Reviewed routing samples come from the caller; the classifier never labels itself.
        const raw = Array.isArray(body.routing_samples) ? body.routing_samples : [];
        const valid = raw
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .filter((entry) => typeof entry.text === "string" && entry.text.trim())
          .slice(0, requested);
        if (!valid.length) return json({ ok: false, error: "no_routing_samples" }, 422);
        const { data: run, error: runError } = await admin.from("customer_service_history_eval_runs").insert({
          environment, scope, evaluation_mode: "current_policy_regression",
          baseline_ref: "active", candidate_ref: replayConfig.tiers.primary.model,
          dataset_hash: caseFingerprint(valid.map((entry) => String(entry.text)).sort().join(",")),
          snapshot: {
            pipeline_version: "routing-replay-v1", judge_rubric_version: HISTORY_JUDGE_RUBRIC_VERSION,
            replay_pipeline: "production_turn_function_read_only_stubs",
            config_fingerprint: replayConfig.fingerprint,
            config_id: replayConfig.configId, config_updated_at: replayConfig.configUpdatedAt,
          },
          flags: {}, budget: { planned: valid.length },
          sample_size: valid.length, planned: valid.length, status: "running",
          requested_by: actorId, started_at: new Date().toISOString(),
        }).select("id").single();
        if (runError || !run) throw runError || new Error("run_create_failed");
        const rows = valid.map((entry, index) => ({
          run_id: run.id,
          source_fingerprint: `routing-${index}-${caseFingerprint(String(entry.text))}`,
          trial_index: 0, question: String(entry.text), context: [], reference_answer: null,
          evaluation_at: new Date().toISOString(), clock_mode: "scenario",
          pairing: "confident", context_gap: false, status: "pending",
          lineage: {
            expected: entry.expected ?? {},
            fixture: entry.fixture ?? {},
            conversation_state: typeof entry.conversation_state === "string" ? entry.conversation_state : "identifying",
          },
        }));
        for (let index = 0; index < rows.length; index += 200) {
          const { error } = await admin.from("customer_service_history_eval_samples").insert(rows.slice(index, index + 200));
          if (error) throw error;
        }
        return json({ ok: true, action, scope, run_id: run.id, planned: rows.length });
      }

      const [liveRows, importRows] = await Promise.all([
        readSourceRows(admin, "customer_service_messages",
          "id,phone_normalized,role,message_text,created_at,source_message_id,environment,conversation_id",
          environment, since, until),
        readSourceRows(admin, "customer_service_learning_import_messages",
          "id,phone_normalized,role,message_text,created_at,source_message_id,environment",
          environment, since, until),
      ]);
      const messages = toHistoryMessages([...liveRows, ...importRows], { environment });
      const samples = buildHistoryDecisionSamples(messages);
      if (!samples.length) return json({ ok: false, error: "no_replay_samples" }, 422);
      const manifest = selectManifest(samples, Math.min(requested, samples.length), seed);
      const { data: run, error: runError } = await admin.from("customer_service_history_eval_runs").insert({
        environment, scope, evaluation_mode: "current_policy_regression",
        baseline_ref: "active", candidate_ref: replayConfig.tiers.primary.model,
        dataset_hash: caseFingerprint(manifest.map((sample) => sample.sampleKey).sort().join(",")),
        snapshot: {
          builder_version: HISTORY_SAMPLE_BUILDER_VERSION,
          pipeline_version: HISTORY_REPLAY_PIPELINE_VERSION,
          judge_rubric_version: HISTORY_JUDGE_RUBRIC_VERSION,
          source_mapper_version: "history-source-v1",
          model: replayConfig.tiers.primary.model, config_fingerprint: replayConfig.fingerprint,
          config_id: replayConfig.configId, config_updated_at: replayConfig.configUpdatedAt,
          seed: seed || null,
          replay_pipeline: "production_faq_subpipeline_plus_fallback",
        },
        flags: { cases_mode: env("CUSTOMER_SERVICE_CASES_MODE") || "off", rag_v2: env("CUSTOMER_SERVICE_RAG_V2") || "false" },
        budget: { planned: manifest.length },
        sample_size: manifest.length, planned: manifest.length, status: "running",
        requested_by: actorId, started_at: new Date().toISOString(),
      }).select("id").single();
      if (runError || !run) throw runError || new Error("run_create_failed");
      const rows = manifest.map((sample) => ({
        run_id: run.id, source_fingerprint: sample.sampleKey, trial_index: 0,
        question: sample.question, context: sample.recentMessages, reference_answer: sample.referenceAnswer,
        scenario_at: sample.scenarioAt, context_cutoff_at: sample.contextCutoffAt,
        evaluation_at: new Date().toISOString(), clock_mode: "scenario",
        pairing: sample.pairing, context_gap: sample.contextGap, status: "pending",
        lineage: {
          conversation_id: sample.conversationId, phone: sample.phone,
          request_message_ids: sample.requestMessageIds, reference_message_ids: sample.referenceMessageIds,
          outcome_evidence_message_ids: sample.outcomeEvidenceMessageIds, issues: sample.issues,
        },
      }));
      for (let index = 0; index < rows.length; index += 200) {
        const { error } = await admin.from("customer_service_history_eval_samples").insert(rows.slice(index, index + 200));
        if (error) throw error;
      }
      return json({ ok: true, action, run_id: run.id, planned: manifest.length, source_messages: messages.length });
    }

    if (action === "process") {
      const runId = String(body.run_id ?? "").trim();
      if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
      const limit = Math.max(1, Math.min(MAX_PLAN, Number(body.limit) || MAX_PLAN));
      const concurrency = readConcurrency(body.concurrency);
      const { data: pending, error: pendingError } = await admin.from("customer_service_history_eval_samples")
        .select("id, question, context, reference_answer, pairing, context_gap, source_fingerprint, lineage")
        .eq("run_id", runId).eq("status", "pending").order("created_at").limit(limit);
      if (pendingError) throw pendingError;
      const { data: runRow, error: runError } = await admin.from("customer_service_history_eval_runs")
        .select("scope,environment,snapshot").eq("id", runId).maybeSingle();
      if (runError) throw runError;
      if (!runRow) return json({ error: "run_not_found" }, 404);
      if (runRow.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      const runScope = String(runRow?.scope ?? "answer_quality");
      const replayConfig = await loadReplayConfig(admin, environment);
      if ((runRow.snapshot as Record<string, unknown> | null)?.config_fingerprint !== replayConfig.fingerprint) {
        return json({ error: "config_changed_restart_run" }, 409);
      }
      const { tiers, ragConfig } = replayConfig;
      const deadlineAt = Date.now() + DEADLINE_MS;
      let processed = 0, scored = 0, notEvaluable = 0, failed = 0;
      const items: Array<{ question: string; status: string }> = [];
      await runWithConcurrency((pending ?? []) as ReplaySampleRow[], concurrency, async (sample) => {
        if (Date.now() > deadlineAt) return;
        if (runScope === "routing_safety") {
          const lineage = (sample.lineage ?? {}) as Record<string, unknown>;
          const expected = (lineage.expected ?? {}) as RoutingExpectation;
          const fixture = (lineage.fixture ?? {}) as RoutingFixture;
          const state = typeof lineage.conversation_state === "string"
            ? lineage.conversation_state as Parameters<typeof defaultRoutingConversation>[1]
            : "identifying";
          try {
            const replay = await replayRoutingDecisionPoint({
              text: sample.question,
              conversation: defaultRoutingConversation("history-replay", state),
              fixture,
            });
            const verdict = evaluateRoutingResult(replay, expected);
            const { data: updated } = await admin.from("customer_service_history_eval_samples").update({
              status: verdict.passed ? "scored" : "not_evaluable",
              ai_answer: replay.reply, trace: replay,
              judgment: { stage: "deterministic", routing: verdict, pipeline_version: replay.pipelineVersion },
            }).eq("id", sample.id).eq("status", "pending").select("id");
            if (!updated?.length) return;
            processed += 1;
            if (verdict.passed) scored += 1; else notEvaluable += 1;
            items.push({ question: sample.question.slice(0, 120), status: verdict.passed ? "scored" : "not_evaluable" });
          } catch {
            failed += 1;
            items.push({ question: sample.question.slice(0, 120), status: "execution_failed" });
            await admin.from("customer_service_history_eval_samples")
              .update({ status: "execution_failed" }).eq("id", sample.id).eq("status", "pending");
          }
          return;
        }
        const context = Array.isArray(sample.context)
          ? sample.context.filter((entry: unknown): entry is { role: "customer" | "assistant" | "human"; text: string } =>
            Boolean(entry) && typeof entry === "object") : [];
        try {
          const result = await replayHistoryDecisionPoint({
            db: admin, tiers, ragConfig,
            sample: { question: sample.question, recentMessages: context },
          });
          const issues = deterministicHistoryIssues({
            aiAnswer: result.aiAnswer, grounded: result.grounded, usedFallback: result.usedFallback,
            faqSourceIds: result.faqSourceIds, candidateCount: result.retrieval.candidateCount,
            expectedFaqIds: null, retrievalError: result.retrieval.error, degraded: result.retrieval.degraded,
            pairing: sample.pairing === "pairing_uncertain" ? "pairing_uncertain" : "confident",
            contextGap: Boolean(sample.context_gap), answerGuardPassed: result.answerGuardPassed,
          });
          const needsReview = issues.some((issue) =>
            issue.layer === "sample" || issue.layer === "context" || issue.layer === "infrastructure" ||
            issue.severity === "high" || issue.severity === "critical"
          );
          const status = needsReview ? "not_evaluable" : "scored";
          const { data: updated } = await admin.from("customer_service_history_eval_samples").update({
            status, ai_answer: result.aiAnswer, trace: result, judge_model: null,
            judge_rubric_version: HISTORY_JUDGE_RUBRIC_VERSION,
            judgment: { stage: "deterministic", issues, requiresHumanReview: needsReview, pipeline_version: result.pipelineVersion },
          }).eq("id", sample.id).eq("status", "pending").select("id");
          if (!updated?.length) return;
          processed += 1;
          if (status === "scored") scored += 1; else notEvaluable += 1;
          items.push({ question: sample.question.slice(0, 120), status });
        } catch {
          failed += 1;
          items.push({ question: sample.question.slice(0, 120), status: "execution_failed" });
          await admin.from("customer_service_history_eval_samples")
            .update({ status: "execution_failed" }).eq("id", sample.id).eq("status", "pending");
        }
      });
      const { data: counts } = await admin.from("customer_service_history_eval_samples")
        .select("status").eq("run_id", runId);
      const byStatus = new Map<string, number>();
      for (const row of counts ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
      const remaining = byStatus.get("pending") ?? 0;
      await admin.from("customer_service_history_eval_runs").update({
        processed: (byStatus.get("scored") ?? 0) + (byStatus.get("not_evaluable") ?? 0) + (byStatus.get("execution_failed") ?? 0),
        scored: byStatus.get("scored") ?? 0, failed: byStatus.get("execution_failed") ?? 0,
        skipped: byStatus.get("skipped") ?? 0,
        complete_sample_set: remaining === 0,
        status: remaining === 0 ? "complete" : "partial",
        completed_at: remaining === 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", runId);
      return json({ ok: true, action, run_id: runId, processed, scored, not_evaluable: notEvaluable, failed, remaining, items });
    }

    if (action === "judge") {
      const runId = String(body.run_id ?? "").trim();
      if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
      const limit = Math.max(1, Math.min(MAX_PLAN, Number(body.limit) || MAX_PLAN));
      const concurrency = readConcurrency(body.concurrency);
      const { data: judgeScope, error: runError } = await admin.from("customer_service_history_eval_runs")
        .select("scope,environment,snapshot").eq("id", runId).maybeSingle();
      if (runError) throw runError;
      if (!judgeScope) return json({ error: "run_not_found" }, 404);
      if (judgeScope.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      const replayConfig = await loadReplayConfig(admin, environment);
      if ((judgeScope.snapshot as Record<string, unknown> | null)?.config_fingerprint !== replayConfig.fingerprint) {
        return json({ error: "config_changed_restart_run" }, 409);
      }
      if (judgeScope?.scope === "routing_safety") {
        // Routing safety is fully deterministic; there is no FAQ answer to judge.
        return json({ ok: true, action, run_id: runId, judged: 0, note: "routing_safety_deterministic_only" });
      }
      const { data: samples, error } = await admin.from("customer_service_history_eval_samples")
        .select("id, question, context, reference_answer, ai_answer, trace, judgment")
        .eq("run_id", runId).in("status", ["scored", "not_evaluable"])
        .is("judge_model", null).order("created_at").limit(limit);
      if (error) throw error;
      const config = replayConfig.tiers.primary;
      const deadlineAt = Date.now() + DEADLINE_MS;
      let judged = 0;
      const items: Array<{ question: string; status: string; comparison: string }> = [];
      await runWithConcurrency((samples ?? []) as JudgeSampleRow[], concurrency, async (sample) => {
        if (Date.now() > deadlineAt) return;
        const trace = (sample.trace ?? {}) as Record<string, unknown>;
        const retrieval = (trace.retrieval ?? {}) as Record<string, unknown>;
        let judgment: Awaited<ReturnType<typeof judgeHistoryDecisionPoint>>;
        try {
          judgment = await judgeHistoryDecisionPoint({
            question: sample.question,
            context: Array.isArray(sample.context) ? sample.context as Array<{ role: string; text: string }> : [],
            referenceAnswer: sample.reference_answer ?? "",
            aiAnswer: sample.ai_answer ?? "",
            candidates: Array.isArray(trace.candidates)
              ? (trace.candidates as Array<{ id: string; question: string; answer: string }>) : [],
            traceSummary: {
              error: Boolean(retrieval.error), degraded: Boolean(retrieval.degraded),
              candidateCount: Number(retrieval.candidateCount) || 0,
            },
            config,
          });
        } catch {
          return;
        }
        if (!judgment) return;
        const deterministic = (sample.judgment as Record<string, unknown> | null)?.issues ?? [];
        const merged = mergeHistoryJudgment(
          Array.isArray(deterministic) ? deterministic : [], judgment,
        );
        const { data: updated } = await admin.from("customer_service_history_eval_samples").update({
          judge_model: config.model, judge_rubric_version: HISTORY_JUDGE_RUBRIC_VERSION,
          judgment: { stage: "llm", ...merged },
        }).eq("id", sample.id).is("judge_model", null).select("id");
        if (!updated?.length) return;
        judged += 1;
        items.push({ question: sample.question.slice(0, 120), status: merged.status, comparison: merged.comparison });
      });
      const { data: stillPending } = await admin.from("customer_service_history_eval_samples")
        .select("id").eq("run_id", runId).in("status", ["scored", "not_evaluable"]).is("judge_model", null).limit(1);
      const remaining = (stillPending ?? []).length;
      return json({ ok: true, action, run_id: runId, judged, remaining, items });
    }

    if (action === "samples") {
      const runId = String(body.run_id ?? "").trim();
      if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
      const limit = Math.max(1, Math.min(MAX_PLAN, Number(body.limit) || MAX_PLAN));
      const offset = Math.max(0, Math.trunc(Number(body.offset) || 0));
      const { data, error, count } = await admin.from("customer_service_history_eval_samples")
        .select("id, question, context, reference_answer, ai_answer, status, pairing, context_gap, judgment, scenario_at", { count: "exact" })
        .eq("run_id", runId).order("scenario_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return json({
        ok: true, action, run_id: runId, total: count ?? 0,
        samples: (data ?? []).map((row: Record<string, unknown>) => {
          const judgment = (row.judgment ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            question: row.question,
            context: Array.isArray(row.context) ? row.context : [],
            ai_answer: row.ai_answer ?? "",
            reference_answer: row.reference_answer ?? "",
            status: row.status,
            pairing: row.pairing,
            context_gap: row.context_gap,
            comparison: typeof judgment.comparison === "string" ? judgment.comparison : null,
            ai_grounding: typeof judgment.aiGrounding === "string" ? judgment.aiGrounding : null,
            reference_status: typeof judgment.referenceStatus === "string" ? judgment.referenceStatus : null,
            requires_human_review: judgment.requiresHumanReview === true,
            judge_stage: typeof judgment.stage === "string" ? judgment.stage : null,
            issues: Array.isArray(judgment.issues) ? judgment.issues : [],
            scenario_at: row.scenario_at,
          };
        }),
      });
    }

    if (action === "auto_repair") {
      if (env("CUSTOMER_SERVICE_AUTO_REPAIR_PAUSED").toLowerCase() === "true") {
        return json({ error: "auto_repair_paused" }, 503);
      }
      const mode = env("CUSTOMER_SERVICE_AUTO_REPAIR_MODE").toLowerCase();
      if (mode !== "propose" && mode !== "apply_allowlist") {
        return json({ error: "auto_repair_disabled" }, 503);
      }
      const forceOff = env("CUSTOMER_SERVICE_RAG_FORCE_OFF").toLowerCase() === "true";
      const allowedFaqIds = new Set(env("CUSTOMER_SERVICE_AUTO_REPAIR_FAQ_ALLOWLIST")
        .split(",").map((value) => value.trim().toLowerCase()).filter((value) => UUID.test(value)));
      const runId = String(body.run_id ?? "").trim();
      if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
      const { data: run, error: runError } = await admin.from("customer_service_history_eval_runs")
        .select("id,environment,status,scope,snapshot").eq("id", runId).maybeSingle();
      if (runError) throw runError;
      if (!run || run.environment !== environment) return json({ error: "run_not_found" }, 404);
      if (run.status !== "complete" || run.scope !== "answer_quality") {
        return json({ error: "run_not_ready" }, 409);
      }
      const replayConfig = await loadReplayConfig(admin, environment);
      if ((run.snapshot as Record<string, unknown> | null)?.config_fingerprint !== replayConfig.fingerprint) {
        return json({ error: "config_changed_restart_run" }, 409);
      }
      if (!replayConfig.configId || !replayConfig.configUpdatedAt ||
          (run.snapshot as Record<string, unknown> | null)?.config_id !== replayConfig.configId ||
          (run.snapshot as Record<string, unknown> | null)?.config_updated_at !== replayConfig.configUpdatedAt) {
        return json({ error: "active_config_required" }, 409);
      }
      const { data: rows, error: sampleError } = await admin.from("customer_service_history_eval_samples")
        .select("id,run_id,question,context,reference_answer,ai_answer,status,pairing,context_gap,judgment,lineage,scenario_at,judge_model")
        .eq("run_id", runId).limit(MAX_PLAN);
      if (sampleError) throw sampleError;
      const { data: existingRepairRows, error: existingRepairError } = await admin
        .from("customer_service_repair_proposals")
        .select("id,idempotency_key").eq("environment", environment)
        .eq("scope->>run_id", runId).limit(100);
      if (existingRepairError) throw existingRepairError;
      const usedBudget = (existingRepairRows ?? []).filter((row: Record<string, unknown>) =>
        String(row.idempotency_key ?? "").startsWith("history-auto:")).length;
      const maxCandidates = Math.max(1, Math.min(10,
        Number(env("CUSTOMER_SERVICE_AUTO_REPAIR_MAX_CANDIDATES_PER_RUN")) || 3));
      if (usedBudget >= maxCandidates) {
        return json({ ok: true, action, run_id: runId, results: [], budget_exhausted: true });
      }
      const samples = ((rows ?? []) as AutoRepairSample[]).filter((row) =>
        row.status === "scored" && Boolean((row as AutoRepairSample & { judge_model?: string }).judge_model));
      const conversationId = (row: AutoRepairSample) =>
        String(((row.lineage ?? {}) as Record<string, unknown>).conversation_id ?? "");
      const results: Array<{ sample_id: string; proposal_id: string; status: string; reason: string }> = [];
      const deadlineAt = Date.now() + DEADLINE_MS;
      // One candidate per invocation bounds model calls and permits safe continuation.
      const limit = Math.max(1, Math.min(maxCandidates - usedBudget, 2, Number(body.limit) || 1));
      for (const sample of samples) {
        if (results.length >= limit || Date.now() > deadlineAt - 20_000) break;
        const judgment = (sample.judgment ?? {}) as Record<string, unknown>;
        if (judgment.comparison !== "divergent" && judgment.comparison !== "partial") continue;
        const diagnosis = diagnoseHistoryRepair({
          status: sample.status, pairing: sample.pairing, contextGap: sample.context_gap,
          judgment,
        });
        const faqId = diagnosis.faqId;
        const idempotencyKey = `history-auto:${sample.id}:${faqId ?? diagnosis.reason}:${replayConfig.fingerprint}`;
        const { data: prior } = await admin.from("customer_service_repair_proposals")
          .select("id,status").eq("idempotency_key", idempotencyKey).maybeSingle();
        if (prior) {
          continue;
        }
        let target: { id: string; question: string; content_hash: string;
          category: string; created_at: string } | null = null;
        if (diagnosis.outcome === "candidate" && faqId && UUID.test(faqId)) {
          const { data, error } = await admin.rpc("customer_service_verified_repair_target", { p_faq_id: faqId });
          if (error) throw error;
          if (data && typeof data === "object") {
            target = data as { id: string; question: string; content_hash: string;
              category: string; created_at: string };
          }
        }
        // A FAQ created from the same historical event is not independent evidence.
        if (target && (!sample.scenario_at || !target.created_at ||
            !Number.isFinite(Date.parse(target.created_at)) ||
            !Number.isFinite(Date.parse(sample.scenario_at)) ||
            Date.parse(target.created_at) >= Date.parse(sample.scenario_at) ||
            /history.replay|歷史回放/i.test(target.category))) target = null;
        const lineage = (sample.lineage ?? {}) as Record<string, unknown>;
        const sourceMessageIds = [lineage.request_message_ids, lineage.reference_message_ids]
          .flatMap((value) => Array.isArray(value) ? value.filter((id): id is string =>
            typeof id === "string" && Boolean(id.trim())) : []);
        const caseCandidate = !target && canDraftHistoryCaseGuidance(diagnosis) &&
          sample.pairing === "confident" && !sample.context_gap &&
          sourceMessageIds.length > 0 && sample.reference_answer &&
          judgment.status === "scored" &&
          !["reference_not_current", "reference_suspect"].includes(String(judgment.referenceStatus)) &&
          Date.now() < deadlineAt - 20_000
          ? await recognizeHistoryCase({
            question: sample.question, context: asReplayContext(sample.context),
            humanReply: sample.reference_answer, config: replayConfig.tiers.primary,
          }) : null;
        if (caseCandidate) {
          const caseInput = parseCustomerServiceCaseInput({
            title: `場景 · ${HISTORY_CASE_INTENTS[caseCandidate.intent]}`, scenario_context: sample.question,
            known_information: {}, missing_information: caseCandidate.missingSlots,
            conversation_excerpt: [{ role: "customer", text: sample.question }],
            response_strategy: { steps: caseCandidate.steps },
            applicability: { intents: [caseCandidate.intent], brand: null,
              effective_from: new Date().toISOString(), effective_to: null },
            environment, source_message_ids: sourceMessageIds,
            provenance: "learned_human", outcome: "unknown", is_synthetic: false,
          }, { expectedEnvironment: environment });
          if (caseInput.ok) {
            const { data: inserted, error: insertError } = await admin.from("customer_service_repair_proposals")
              .insert({
                environment, repair_kind: "case_guidance_candidate", risk_level: "R2",
                target_type: "case_guidance", target_id: null,
                scope: { environment, run_id: runId, conversation_id: conversationId(sample) },
                source_sample_ids: [sample.id], reason: "reusable_scenario_without_faq",
                evidence: { diagnosis, classifier_model: replayConfig.tiers.primary.model,
                  source_message_ids: sourceMessageIds },
                candidate_patch: { kind: "case_guidance_draft", case: caseInput.value },
                validation: { passed: false, reasons: ["case_draft_only"] },
                status: "proposed", idempotency_key: idempotencyKey, preauthorized: false,
              }).select("id").single();
            if (insertError || !inserted) throw insertError || new Error("case_proposal_insert_failed");
            let status = "proposed";
            if (env("CUSTOMER_SERVICE_CASES_AUTO_INGEST").toLowerCase() === "true") {
              const { data: existing, error: existingError } = await admin.from("customer_service_cases")
                .select("id,status").eq("environment", environment)
                .eq("source_fingerprint", caseInput.value.source_fingerprint).maybeSingle();
              if (existingError) throw existingError;
              let caseId = existing?.id ?? null;
              if (!existing) {
                const { data: created, error: caseError } = await admin.from("customer_service_cases")
                  .insert({ ...caseInput.value, status: "draft" }).select("id").single();
                if (caseError && caseError.code !== "23505") throw caseError;
                caseId = created?.id ?? null;
                if (!caseId) {
                  const { data: raced } = await admin.from("customer_service_cases")
                    .select("id").eq("environment", environment)
                    .eq("source_fingerprint", caseInput.value.source_fingerprint).maybeSingle();
                  caseId = raced?.id ?? null;
                }
              }
              if (caseId) {
                const { error: linkError } = await admin.from("customer_service_repair_proposals")
                  .update({ target_id: caseId }).eq("id", inserted.id);
                if (linkError) throw linkError;
              }
              status = existing ? "case_already_recorded" : "case_draft_recorded";
            }
            results.push({ sample_id: sample.id, proposal_id: String(inserted.id),
              status, reason: "reusable_scenario_guidance" });
            continue;
          }
        }
        const reason = !target && diagnosis.outcome === "candidate"
          ? "verified_faq_not_independent" : diagnosis.reason;
        const initialStatus = target ? "candidate" : diagnosis.outcome === "unsupported_repair"
          ? "unsupported_repair" : "insufficient_evidence";
        const { data: inserted, error: insertError } = await admin.from("customer_service_repair_proposals")
          .insert({
            environment, repair_kind: target ? "alias_candidate" : "code_change_proposal",
            risk_level: target ? "R1" : "R3", target_type: target ? "faq" : "diagnosis",
            target_id: target?.id ?? null, base_hash: target?.content_hash ?? null,
            scope: { environment, run_id: runId, conversation_id: conversationId(sample) },
            source_sample_ids: [sample.id], reason,
            evidence: { diagnosis, issue_categories: Array.isArray(judgment.issues)
              ? (judgment.issues as Array<{ category?: string }>).map((issue) => issue.category) : [] },
            candidate_patch: target ? { kind: "verified_faq_rewrite", faq_id: target.id,
              question: sample.question, canonical_question: target.question } : { kind: "diagnosis_only" },
            validation: {}, status: initialStatus, idempotency_key: idempotencyKey,
            preauthorized: Boolean(target && allowedFaqIds.has(target.id.toLowerCase())),
          }).select("id").single();
        if (insertError || !inserted) throw insertError || new Error("proposal_insert_failed");
        const proposalId = String(inserted.id);
        if (!target || !normalizedRepairQuestion(sample.question) || !conversationId(sample)) {
          results.push({ sample_id: sample.id, proposal_id: proposalId,
            status: initialStatus, reason });
          continue;
        }
        const questionKey = normalizedRepairQuestion(sample.question);
        const holdouts = samples.filter((other) => other.id !== sample.id &&
          conversationId(other) && conversationId(other) !== conversationId(sample) &&
          normalizedRepairQuestion(other.question) === questionKey &&
          other.pairing === "confident" && !other.context_gap).slice(0, 2);
        const controls = samples.filter((other) => other.id !== sample.id &&
          conversationId(other) !== conversationId(sample) &&
          normalizedRepairQuestion(other.question) !== questionKey &&
          ((other.judgment ?? {}) as Record<string, unknown>).comparison === "match" &&
          other.pairing === "confident" && !other.context_gap).slice(0, 2);
        if (!holdouts.length || !controls.length) {
          const { error } = await admin.from("customer_service_repair_proposals")
            .update({ status: "insufficient_evidence", validation: {
              passed: false, reasons: [!holdouts.length ? "insufficient_holdouts" : "insufficient_controls"],
              holdout_count: holdouts.length, control_count: controls.length,
            } }).eq("id", proposalId).eq("status", "candidate");
          if (error) throw error;
          results.push({ sample_id: sample.id, proposal_id: proposalId,
            status: "insufficient_evidence", reason: "independent_samples_required" });
          continue;
        }
        const { error: validatingError } = await admin.from("customer_service_repair_proposals")
          .update({ status: "validating" }).eq("id", proposalId).eq("status", "candidate");
        if (validatingError) throw validatingError;
        const trial = async (row: AutoRepairSample) => {
          const replaySample = { question: row.question, recentMessages: asReplayContext(row.context) };
          const baseline = await replayHistoryDecisionPoint({ db: admin, ...replayConfig,
            environment, sample: replaySample, runClassificationAi: false, deadlineAt });
          const candidate = await replayHistoryDecisionPoint({ db: admin, ...replayConfig,
            environment, sample: replaySample, runClassificationAi: false, deadlineAt,
            repairRewrite: { queryKey: questionKey, canonicalQuestion: target.question } });
          return comparisonTrial(baseline, candidate);
        };
        try {
          const sourceTrial = await trial(sample);
          const holdoutTrials: RepairTrial[] = [];
          for (const row of holdouts) holdoutTrials.push(await trial(row));
          const controlTrials: RepairTrial[] = [];
          for (const row of controls) controlTrials.push(await trial(row));
          const gate = evaluateRepairTrials(target.id, sourceTrial, holdoutTrials, controlTrials);
          const currentConfig = await loadReplayConfig(admin, environment);
          if (currentConfig.fingerprint !== replayConfig.fingerprint) {
            throw new Error("config_changed_restart_run");
          }
          const status = gate.passed ? "eligible" : "validation_failed";
          const validation = { passed: gate.passed, reasons: gate.reasons,
            gate_version: gate.gateVersion, config_fingerprint: replayConfig.fingerprint,
            source: sourceTrial, holdouts: holdoutTrials, controls: controlTrials,
            holdout_count: holdoutTrials.length, control_count: controlTrials.length,
            evaluated_at: new Date().toISOString() };
          const { error } = await admin.from("customer_service_repair_proposals")
            .update({ status, validation }).eq("id", proposalId).eq("status", "validating");
          if (error) throw error;
          let finalStatus = status;
          if (gate.passed && mode === "apply_allowlist" && !forceOff &&
              allowedFaqIds.has(target.id.toLowerCase())) {
            const { error: applyError } = await admin.rpc("customer_service_apply_verified_rewrite", {
              p_proposal_id: proposalId, p_environment: environment,
              p_config_fingerprint: replayConfig.fingerprint,
            });
            if (applyError) throw applyError;
            const { data: staged, error: stagedError } = await admin
              .from("customer_service_verified_rewrite_repairs")
              .select("id,status,faq_id").eq("proposal_id", proposalId).maybeSingle();
            if (stagedError || staged?.status !== "canary" || staged.faq_id !== target.id) {
              throw stagedError || new Error("repair_not_staged");
            }
            const preview = await replayHistoryDecisionPoint({ db: admin, ...replayConfig,
              environment, sample: { question: sample.question,
                recentMessages: asReplayContext(sample.context) },
              runClassificationAi: false, deadlineAt,
              repairRewrite: { queryKey: questionKey, canonicalQuestion: target.question } });
            if (!preview.faqSourceIds.includes(target.id) || preview.answerGuardPassed !== true ||
                preview.retrieval.error) throw new Error("repair_canary_failed");
            const { data: activated, error: activateError } = await admin.rpc(
              "customer_service_finish_verified_rewrite", {
                p_proposal_id: proposalId, p_environment: environment, p_activate: true,
              });
            if (activateError || activated !== true) throw activateError || new Error("repair_activate_failed");
            const live = await replayHistoryDecisionPoint({ db: admin, ...replayConfig,
              environment, sample: { question: sample.question,
                recentMessages: asReplayContext(sample.context) },
              runClassificationAi: false, deadlineAt });
            const passedLive = live.faqSourceIds.includes(target.id) &&
              live.answerGuardPassed === true && !live.retrieval.error;
            if (!passedLive) {
              const { error: rollbackError } = await admin.rpc(
                "customer_service_finish_verified_rewrite", {
                  p_proposal_id: proposalId, p_environment: environment, p_activate: false,
                });
              if (rollbackError) throw rollbackError;
            }
            finalStatus = passedLive ? "active" : "rolled_back";
          }
          results.push({ sample_id: sample.id, proposal_id: proposalId,
            status: finalStatus, reason: gate.reasons.join(",") || "verified" });
        } catch (error) {
          await admin.rpc("customer_service_finish_verified_rewrite", {
            p_proposal_id: proposalId, p_environment: environment, p_activate: false,
          });
          await admin.from("customer_service_repair_proposals").update({
            status: "failed", validation: { passed: false, reasons: ["execution_failed"] },
          }).eq("id", proposalId).in("status", ["validating", "eligible"]);
          results.push({ sample_id: sample.id, proposal_id: proposalId,
            status: "failed", reason: error instanceof Error ? error.message.slice(0, 80) : "failed" });
        }
      }
      return json({ ok: true, action, run_id: runId, results });
    }

    if (action === "propose") {
      // R0: creating a reviewable proposal only. No FAQ, case, index or code is
      // changed, and nothing is published.
      if (env("CUSTOMER_SERVICE_AUTO_REPAIR_MODE").toLowerCase() === "off") {
        return json({ error: "auto_repair_disabled" }, 503);
      }
      const runId = String(body.run_id ?? "").trim();
      if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
      const requestedKind = typeof body.repair_kind === "string" && body.repair_kind
        ? body.repair_kind : "case_guidance_candidate";
      const allowedKinds = new Set([
        "alias_candidate", "template_candidate", "case_guidance_candidate", "code_change_proposal",
      ]);
      if (!allowedKinds.has(requestedKind)) return json({ error: "unsupported_repair_kind" }, 400);

      const singleId = String(body.sample_id ?? "").trim();
      let targets: Array<Record<string, unknown>> = [];
      if (singleId) {
        if (!UUID.test(singleId)) return json({ error: "invalid_sample_id" }, 400);
        const { data, error } = await admin.from("customer_service_history_eval_samples")
          .select("id, question, reference_answer, ai_answer, status, pairing, context_gap, judgment, scenario_at, lineage")
          .eq("id", singleId).eq("run_id", runId).maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: "sample_not_found" }, 404);
        targets = [data as Record<string, unknown>];
      } else {
        const { data, error } = await admin.from("customer_service_history_eval_samples")
          .select("id, question, reference_answer, ai_answer, status, pairing, context_gap, judgment, scenario_at, lineage")
          .eq("run_id", runId).limit(MAX_PLAN);
        if (error) throw error;
        targets = (data ?? []) as Array<Record<string, unknown>>;
      }

      const created: string[] = [];
      const existing: string[] = [];
      const skipped: string[] = [];
      for (const sample of targets) {
        const judgment = (sample.judgment ?? {}) as Record<string, unknown>;
        const comparison = typeof judgment.comparison === "string" ? judgment.comparison : null;
        if (comparison !== "divergent" && comparison !== "partial") {
          skipped.push(String(sample.id));
          continue;
        }
        const idempotencyKey = `history-replay:${sample.id}:${requestedKind}`;
        const lineage = (sample.lineage ?? {}) as Record<string, unknown>;
        const { data: inserted, error: insertError } = await admin.from("customer_service_repair_proposals")
          .insert({
            environment, repair_kind: requestedKind, risk_level: "R2",
            target_type: requestedKind === "case_guidance_candidate" ? "case_guidance" : "faq",
            target_id: null,
            scope: { environment, run_id: runId, conversation_id: lineage.conversation_id ?? null },
            source_sample_ids: [String(sample.id)],
            reason: `history_replay:${comparison}`,
            evidence: {
              comparison, ai_grounding: judgment.aiGrounding ?? null,
              reference_status: judgment.referenceStatus ?? null,
              issues: Array.isArray(judgment.issues) ? judgment.issues : [],
              scenario_at: sample.scenario_at, question: sample.question,
              ai_answer: sample.ai_answer, reference_answer: sample.reference_answer,
              pairing: sample.pairing, context_gap: sample.context_gap,
            },
            candidate_patch: {
              kind: "case_guidance_draft", question: sample.question,
              guidance: sample.reference_answer,
              note: "Drafted from a human reference answer. Needs review before any publish.",
            },
            validation: {}, status: "proposed", idempotency_key: idempotencyKey, preauthorized: false,
          }).select("id").single();
        if (insertError) {
          const { data: found } = await admin.from("customer_service_repair_proposals")
            .select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
          if (found?.id) existing.push(String(found.id));
          else throw insertError;
          continue;
        }
        created.push(String(inserted.id));
      }
      return json({ ok: true, action, run_id: runId, kind: requestedKind, created, existing, skipped });
    }

    if (action === "proposals") {
      const runId = String(body.run_id ?? "").trim();
      if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
      const { data, error } = await admin.from("customer_service_repair_proposals")
        .select("id, repair_kind, risk_level, status, reason, source_sample_ids, candidate_patch, validation, rollback, executed_at, created_at")
        .eq("environment", environment).eq("scope->>run_id", runId)
        .order("created_at", { ascending: false }).limit(MAX_PLAN);
      if (error) throw error;
      return json({ ok: true, action, run_id: runId, proposals: data ?? [] });
    }

    if (action === "review_proposal") {
      const proposalId = String(body.proposal_id ?? "").trim();
      if (!UUID.test(proposalId)) return json({ error: "invalid_proposal_id" }, 400);
      const decision = String(body.decision ?? "");
      const nextStatus = decision === "approve" ? "ready" : decision === "reject" ? "rejected" : decision === "block" ? "blocked" : "";
      if (!nextStatus) return json({ error: "invalid_decision" }, 400);
      const { data: proposal, error } = await admin.from("customer_service_repair_proposals")
        .select("id, status, environment, validation").eq("id", proposalId).maybeSingle();
      if (error) throw error;
      if (!proposal) return json({ error: "proposal_not_found" }, 404);
      if (proposal.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      if (proposal.status !== "proposed" && proposal.status !== "blocked") {
        return json({ error: "proposal_not_reviewable", status: proposal.status }, 409);
      }
      if (decision === "approve" && !actorId) return json({ error: "reviewer_required" }, 403);
      const validated = (proposal.validation as Record<string, unknown> | null)?.passed === true;
      const reviewedStatus = decision === "approve" && !validated ? "proposed" : nextStatus;
      const { error: updateError } = await admin.from("customer_service_repair_proposals").update({
        status: reviewedStatus,
        approved_by: decision === "approve" ? actorId : null,
        approved_at: decision === "approve" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", proposalId);
      if (updateError) throw updateError;
      // Review only records approval. Applying an R2 change still requires the
      // separate controlled executor and its validation gate.
      return json({ ok: true, action, proposal_id: proposalId, status: reviewedStatus, review_only: true });
    }

    if (action === "validate_proposal") {
      const proposalId = String(body.proposal_id ?? "").trim();
      if (!UUID.test(proposalId)) return json({ error: "invalid_proposal_id" }, 400);
      const { data: proposal, error } = await admin.from("customer_service_repair_proposals")
        .select("id, environment, repair_kind, status, source_sample_ids, candidate_patch, approved_by, scope")
        .eq("id", proposalId).maybeSingle();
      if (error) throw error;
      if (!proposal) return json({ error: "proposal_not_found" }, 404);
      if (proposal.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      if (!["proposed", "blocked", "ready"].includes(String(proposal.status))) {
        return json({ error: "proposal_not_validatable", status: proposal.status }, 409);
      }
      const patch = (proposal.candidate_patch ?? {}) as Record<string, unknown>;
      const guidance = typeof patch.guidance === "string" ? patch.guidance.trim() : "";
      if (!guidance) return json({ error: "no_candidate_guidance" }, 400);
      const sampleIds = Array.isArray(proposal.source_sample_ids)
        ? (proposal.source_sample_ids as string[]).slice(0, 3) : [];
      if (!sampleIds.length) return json({ error: "no_source_samples" }, 400);
      const proposalScope = (proposal.scope ?? {}) as Record<string, unknown>;
      const sourceRunId = typeof proposalScope.run_id === "string" ? proposalScope.run_id : "";
      if (!UUID.test(sourceRunId)) return json({ error: "invalid_source_run" }, 409);
      const { data: sourceRows, error: sourceError } = await admin.from("customer_service_history_eval_samples")
        .select("id, question, context, ai_answer").eq("run_id", sourceRunId).in("id", sampleIds);
      if (sourceError) throw sourceError;
      const { data: sourceRun, error: runError } = await admin.from("customer_service_history_eval_runs")
        .select("environment,snapshot").eq("id", sourceRunId).maybeSingle();
      if (runError) throw runError;
      if (!sourceRun || sourceRun.environment !== environment) return json({ error: "source_run_not_found" }, 404);
      const replayConfig = await loadReplayConfig(admin, environment);
      if ((sourceRun.snapshot as Record<string, unknown> | null)?.config_fingerprint !== replayConfig.fingerprint) {
        return json({ error: "config_changed_restart_run" }, 409);
      }
      const { tiers, ragConfig } = replayConfig;
      const deadlineAt = Date.now() + 60_000;
      const results: Array<Record<string, unknown>> = [];
      let improvements = 0;
      let blockedCount = 0;
      for (const row of sourceRows ?? []) {
        if (Date.now() > deadlineAt) break;
        const context = Array.isArray(row.context)
          ? row.context as Array<{ role: "customer" | "assistant" | "human"; text: string }> : [];
        const overlay: CustomerServiceFaqCandidate[] = [{
          id: `proposal-${proposalId}`, category: "history-replay-review",
          question: String(row.question ?? ""), answer: guidance,
        }];
        try {
          const candidate = await replayHistoryDecisionPoint({
            db: admin, tiers, ragConfig, runClassificationAi: false, deadlineAt,
            sample: { question: String(row.question ?? ""), recentMessages: context },
            candidateOverlay: overlay,
          });
          const issues = deterministicHistoryIssues({
            aiAnswer: candidate.aiAnswer, grounded: candidate.grounded, usedFallback: candidate.usedFallback,
            faqSourceIds: candidate.faqSourceIds, candidateCount: candidate.retrieval.candidateCount,
            expectedFaqIds: null, retrievalError: candidate.retrieval.error, degraded: candidate.retrieval.degraded,
            pairing: "confident", contextGap: false, answerGuardPassed: candidate.answerGuardPassed,
          });
          const blocked = issues.some((issue) => issue.severity === "high" || issue.severity === "critical");
          const answerChanged = candidate.aiAnswer.trim() !== String(row.ai_answer ?? "").trim();
          const improved = answerChanged && candidate.grounded &&
            candidate.faqSourceIds.includes(overlay[0].id) && !blocked;
          if (improved) improvements += 1;
          if (blocked) blockedCount += 1;
          results.push({
            sample_id: row.id, improved, blocked, grounded: candidate.grounded,
            answer_changed: answerChanged, issues,
          });
        } catch (caught) {
          blockedCount += 1;
          results.push({
            sample_id: row.id, improved: false, blocked: true,
            error: caught instanceof Error ? caught.message.slice(0, 120) : "failed",
          });
        }
      }
      const passed = (sourceRows ?? []).length === new Set(sampleIds).size &&
        results.length === (sourceRows ?? []).length && improvements >= 1 && blockedCount === 0;
      const validation = {
        passed, improvements, blocked: blockedCount, total: results.length, results,
        pipeline_version: HISTORY_REPLAY_PIPELINE_VERSION, validated_at: new Date().toISOString(),
        controls: "not_run_v1",
      };
      const validatedStatus = passed ? (proposal.approved_by ? "ready" : "proposed") : "blocked";
      const { error: validationError } = await admin.from("customer_service_repair_proposals").update({
        validation, status: validatedStatus, updated_at: new Date().toISOString(),
      }).eq("id", proposalId);
      if (validationError) throw validationError;
      return json({ ok: true, action, proposal_id: proposalId, status: validatedStatus, validation });
    }

    if (action === "apply_proposal") {
      // Controlled apply. Requires explicit server opt-in and a passed validation.
      if (env("CUSTOMER_SERVICE_AUTO_REPAIR_MODE").toLowerCase() !== "apply_allowlist") {
        return json({ error: "auto_apply_disabled" }, 503);
      }
      const proposalId = String(body.proposal_id ?? "").trim();
      if (!UUID.test(proposalId)) return json({ error: "invalid_proposal_id" }, 400);
      const { data: proposal, error } = await admin.from("customer_service_repair_proposals")
        .select("id, environment, status, validation, candidate_patch, scope, source_sample_ids, approved_by")
        .eq("id", proposalId).maybeSingle();
      if (error) throw error;
      if (!proposal) return json({ error: "proposal_not_found" }, 404);
      if (proposal.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      if (proposal.status !== "ready") return json({ error: "proposal_not_ready", status: proposal.status }, 409);
      if ((proposal.validation as Record<string, unknown> | null)?.passed !== true) {
        return json({ error: "validation_required" }, 409);
      }
      if (!proposal.approved_by) return json({ error: "reviewer_required" }, 403);
      const patch = (proposal.candidate_patch ?? {}) as Record<string, unknown>;
      const rawQuestion = typeof patch.question === "string" ? patch.question.trim() : "";
      const guidance = typeof patch.guidance === "string" ? patch.guidance.trim() : "";
      if (!rawQuestion || !guidance) return json({ error: "no_candidate_guidance" }, 400);
      const scope = (proposal.scope ?? {}) as Record<string, unknown>;
      const runId = typeof scope.run_id === "string" ? scope.run_id : "";
      const sampleIds = Array.isArray(proposal.source_sample_ids)
        ? (proposal.source_sample_ids as string[]).join(",") : "";
      // Make the origin explicit so the draft is traceable in the FAQ list: the
      // raw burst ("5份") is only a fragment, so it is never stored bare.
      const question = `【歷史回放待審·${environment}·${proposalId}】${rawQuestion}`;
      const keywords = [
        "history-replay",
        `env=${environment}`,
        `proposal=${proposalId}`,
        runId ? `run=${runId}` : "",
        sampleIds ? `sample=${sampleIds}` : "",
      ].filter(Boolean).join(" ");

      // Apply is deliberately limited to creating an UNPUBLISHED draft FAQ. It
      // does not change live answers; a human publishes it through the FAQ page.
      let faqId = "";
      const { data: inserted, error: insertError } = await admin.from("customer_faqs").insert({
        category: `history-replay (${environment})`, question, answer: guidance,
        keywords, locale: "zh-HK", is_published: false,
      }).select("id").single();
      if (insertError) {
        const { data: existingFaq } = await admin.from("customer_faqs")
          .select("id,answer,keywords,is_published").eq("locale", "zh-HK").eq("question", question).maybeSingle();
        if (!existingFaq?.id || existingFaq.is_published ||
          existingFaq.answer !== guidance ||
          !String(existingFaq.keywords ?? "").split(" ").includes(`proposal=${proposalId}`)) throw insertError;
        faqId = String(existingFaq.id);
      } else {
        faqId = String(inserted.id);
      }
      const { error: applyError } = await admin.from("customer_service_repair_proposals").update({
        status: "applied", executed_by: "history-replay",
        executed_at: new Date().toISOString(),
        rollback: { faq_id: faqId, kind: "draft_faq" },
        updated_at: new Date().toISOString(),
      }).eq("id", proposalId);
      if (applyError) throw applyError;
      return json({ ok: true, action, proposal_id: proposalId, status: "applied", faq_id: faqId, note: "draft_unpublished" });
    }

    if (action === "rollback_proposal") {
      const proposalId = String(body.proposal_id ?? "").trim();
      if (!UUID.test(proposalId)) return json({ error: "invalid_proposal_id" }, 400);
      const { data: proposal, error } = await admin.from("customer_service_repair_proposals")
        .select("id, environment, status, rollback").eq("id", proposalId).maybeSingle();
      if (error) throw error;
      if (!proposal) return json({ error: "proposal_not_found" }, 404);
      if (proposal.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      if (proposal.status === "active" || proposal.status === "canary") {
        const { data: finished, error: finishError } = await admin.rpc(
          "customer_service_finish_verified_rewrite", {
            p_proposal_id: proposalId, p_environment: environment, p_activate: false,
          });
        if (finishError) throw finishError;
        if (finished !== true) return json({ error: "rollback_not_owned" }, 409);
        return json({ ok: true, action, proposal_id: proposalId, status: "rolled_back" });
      }
      if (proposal.status !== "applied") return json({ error: "proposal_not_applied", status: proposal.status }, 409);
      const rollback = (proposal.rollback ?? {}) as Record<string, unknown>;
      const faqId = typeof rollback.faq_id === "string" ? rollback.faq_id : "";
      if (faqId) {
        const { data: faq, error: faqError } = await admin.from("customer_faqs")
          .select("id,keywords,is_published").eq("id", faqId).maybeSingle();
        if (faqError) throw faqError;
        if (faq) {
          if (!String(faq.keywords ?? "").split(" ").includes(`proposal=${proposalId}`)) {
            return json({ error: "rollback_not_owned" }, 409);
          }
          if (faq.is_published) return json({ error: "rollback_published" }, 409);
          const { data: deleted, error: deleteError } = await admin.from("customer_faqs")
            .delete().eq("id", faqId).eq("is_published", false).select("id").maybeSingle();
          if (deleteError) throw deleteError;
          if (!deleted) return json({ error: "rollback_not_deleted" }, 409);
        }
      }
      const { error: rollbackError } = await admin.from("customer_service_repair_proposals").update({
        status: "rolled_back", rollback_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", proposalId);
      if (rollbackError) throw rollbackError;
      return json({ ok: true, action, proposal_id: proposalId, status: "rolled_back" });
    }

    if (action === "status") {
      const runId = String(body.run_id ?? "").trim();
      if (runId) {
        if (!UUID.test(runId)) return json({ error: "invalid_run_id" }, 400);
        const { data: run, error } = await admin.from("customer_service_history_eval_runs").select("*").eq("id", runId).maybeSingle();
        if (error) throw error;
        if (!run) return json({ error: "run_not_found" }, 404);
        const { data: counts } = await admin.from("customer_service_history_eval_samples").select("status").eq("run_id", runId);
        const byStatus: Record<string, number> = {};
        for (const row of counts ?? []) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        return json({ ok: true, action, run, sample_status: byStatus });
      }
      const { data: runs, error } = await admin.from("customer_service_history_eval_runs").select("*")
        .eq("environment", environment).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return json({ ok: true, action, environment, runs: runs ?? [] });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "authentication_required" ? 401 : message === "page_access_required" ? 403 : 500;
    console.error("customer-service-history-replay", message.slice(0, 200));
    return json({ error: "history_replay_failed", detail: message.slice(0, 200) }, status);
  }
});
