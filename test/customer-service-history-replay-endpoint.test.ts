import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { canDraftHistoryCaseGuidance, diagnoseHistoryRepair, evaluateRepairTrials, normalizedRepairQuestion } from
  "../supabase/functions/_shared/customer-service-history-auto-repair";
import { parseCustomerServiceCaseInput } from "../supabase/functions/_shared/customer-service-cases";
import { HISTORY_CASE_INTENTS } from "../supabase/functions/_shared/customer-service-history-case-recognition";

type Row = Record<string, unknown>;
const id = (digit: number) => `00000000-0000-4000-8000-${String(digit).padStart(12, "0")}`;

function replayEndpoint(
  targetAvailable = true,
  caseAutoIngest = false,
  options: { jevEnabled?: boolean; jevKey?: string; jevFail?: boolean; jevErrorCode?: string; judgeGrounding?: string } = {},
) {
  const proposals: Row[] = [];
  const faqs: Row[] = [];
  const samples: Row[] = [];
  const runs: Row[] = [];
  const rules: Row[] = [];
  const cases: Row[] = [];
  const jev: Row[] = [];
  let nextFaq = 0;
  let candidateAnswer = "unchanged";
  let jevCalls = 0;
  const tables: Record<string, Row[]> = {
    customer_service_repair_proposals: proposals,
    customer_faqs: faqs,
    customer_service_history_eval_samples: samples,
    customer_service_history_eval_runs: runs,
    customer_service_config_versions: [{ id: id(40), updated_at: "2026-09-19T00:00:00Z",
      environment: "develop", status: "active" }],
    customer_service_verified_rewrite_repairs: rules,
    customer_service_cases: cases,
    customer_service_history_jev_judgments: jev,
  };

  class Query {
    private filters: Array<(row: Row) => boolean> = [];
    private operation: "read" | "insert" | "update" | "delete" = "read";
    private value: Row = {};
    private one = false;
    constructor(private readonly table: string) {}
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    range() { return this; }
    eq(key: string, value: unknown) {
      this.filters.push((row) => key === "scope->>run_id"
        ? (row.scope as Row | undefined)?.run_id === value : row[key] === value);
      return this;
    }
    is(key: string, value: unknown) { return this.eq(key, value); }
    in(key: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[key])); return this;
    }
    insert(value: Row) { this.operation = "insert"; this.value = value; return this; }
    update(value: Row) { this.operation = "update"; this.value = value; return this; }
    delete() { this.operation = "delete"; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    then(resolve: (value: unknown) => void, reject: (error: unknown) => void) {
      return Promise.resolve().then(() => this.execute()).then(resolve, reject);
    }
    private execute() {
      const rows = tables[this.table];
      let found = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === "insert") {
        if (this.table === "customer_faqs" && rows.some((row) =>
          row.locale === this.value.locale && row.question === this.value.question)) {
          return { data: null, error: { code: "23505", message: "duplicate question" } };
        }
        const inserted = { id: this.table === "customer_faqs" ? id(++nextFaq + 20) : id(50), ...this.value };
        rows.push(inserted);
        found = [inserted];
      } else if (this.operation === "update") {
        found.forEach((row) => Object.assign(row, this.value));
      } else if (this.operation === "delete") {
        found.forEach((row) => rows.splice(rows.indexOf(row), 1));
      }
      return { data: this.one ? (found[0] ?? null) : found, error: null };
    }
  }

  const admin = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Row) => {
      if (name === "customer_service_history_jev_claim") {
        for (const sample of samples) {
          if (sample.run_id !== args.p_run_id || sample.status !== "scored") continue;
          const exists = jev.some((row) => row.sample_id === sample.id &&
            row.rubric_version === args.p_rubric_version && row.model_requested === args.p_model);
          if (!exists) {
            jev.push({ id: id(60 + jev.length), sample_id: sample.id, run_id: args.p_run_id,
              environment: args.p_environment, status: "pending", model_requested: args.p_model,
              rubric_version: args.p_rubric_version, attempt_count: 0,
              created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z" });
          }
        }
        const claimed = jev.filter((row) => row.run_id === args.p_run_id &&
          row.environment === args.p_environment && row.model_requested === args.p_model &&
          row.rubric_version === args.p_rubric_version && row.status === "pending")
          .slice(0, Number(args.p_limit) || 1);
        claimed.forEach((row) => {
          row.status = "processing";
          row.attempt_count = Number(row.attempt_count) + 1;
        });
        return { data: claimed, error: null };
      }
      if (name === "customer_service_verified_repair_target") {
        if (!targetAvailable) return { data: null, error: null };
        return { data: { id: id(99), question: "送貨範圍？", content_hash: "faq-hash",
          category: "delivery", created_at: "2026-09-01T00:00:00Z" }, error: null };
      }
      const proposal = proposals.find((row) => row.id === args.p_proposal_id);
      if (name === "customer_service_apply_verified_rewrite") {
        if (!proposal || proposal.status !== "eligible") return { data: null, error: { message: "ineligible" } };
        proposal.status = "canary";
        rules.push({ id: id(80), proposal_id: proposal.id, status: "canary", faq_id: id(99) });
        return { data: id(80), error: null };
      }
      if (name === "customer_service_finish_verified_rewrite") {
        const rule = rules.find((row) => row.proposal_id === args.p_proposal_id);
        if (!rule) return { data: false, error: null };
        rule.status = args.p_activate ? "active" : "rolled_back";
        if (proposal) proposal.status = rule.status;
        return { data: true, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    },
  };
  let handler: (request: Request) => Promise<Response>;
  const raw = readFileSync("supabase/functions/customer-service-history-replay/index.ts", "utf8");
  const executable = stripTypeScriptTypes(raw).replace(/^import\b[\s\S]*?;\s*$/gm, "");
  runInNewContext(executable, {
    Request, Response, console,
    Deno: { env: { get: (name: string) => ({
      SUPABASE_SERVICE_ROLE_KEY: "local-test",
      CUSTOMER_SERVICE_REPORT_CRON_SECRET: "local-test",
      CUSTOMER_SERVICE_ENVIRONMENT: "develop",
      CUSTOMER_SERVICE_AUTO_REPAIR_MODE: "apply_allowlist",
      CUSTOMER_SERVICE_CASES_AUTO_INGEST: String(caseAutoIngest),
      CUSTOMER_SERVICE_HISTORY_JEV_ENABLED: String(options.jevEnabled ?? true),
      TYPESAFE_API_KEY: options.jevKey ?? "typesafe-test-key",
      CUSTOMER_SERVICE_HISTORY_JEV_MODEL: "jev-1.13.0",
    } as Record<string, string>)[name] }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => admin,
    caseFingerprint: () => "stable",
    customerServiceAiTiers: () => ({ primary: { model: "test" }, fallback: null, escalationConfidence: 0.72 }),
    customerServiceRagConfig: () => ({}),
    replayHistoryDecisionPoint: async (input: { sample?: { question: string }; repairRewrite?: Row }) => {
      if (input.sample?.question === "有冇送貨？" || input.sample?.question === "其他問題") {
        const control = input.sample.question === "其他問題";
        const repaired = Boolean(input.repairRewrite) || rules.some((row) => row.status === "active");
        const sourceIds = control ? [id(77)] : repaired ? [id(99)] : [];
        return { aiAnswer: sourceIds.length ? "有依據的答案" : "", grounded: sourceIds.length > 0,
          usedFallback: false, faqSourceIds: sourceIds,
          retrieval: { candidateCount: sourceIds.length, error: false, degraded: false },
          answerGuardPassed: sourceIds.length > 0 ? true : null };
      }
      return { aiAnswer: candidateAnswer, grounded: true, usedFallback: false,
        faqSourceIds: [`proposal-${id(1)}`],
        retrieval: { candidateCount: 1, error: false, degraded: false },
        answerGuardPassed: true };
    },
    canDraftHistoryCaseGuidance, diagnoseHistoryRepair, evaluateRepairTrials, normalizedRepairQuestion,
    HISTORY_CASE_INTENTS,
    recognizeHistoryCase: async () => ({ intent: "order_intake",
      steps: ["acknowledge", "ask_missing_details"], missingSlots: ["delivery_date"] }),
    parseCustomerServiceCaseInput,
    deterministicHistoryIssues: () => [],
    HISTORY_REPLAY_PIPELINE_VERSION: "test",
    HISTORY_JEV_RUBRIC_VERSION: "history-jev-v1",
    TYPESAFE_SYSTEMONE_ENDPOINT: "https://api.typesafe.ai/v1/systemone",
    resolveHistoryJevApprovedSources: (input: {
      candidates: Array<{ id: string; question: string; answer: string }>;
      selectedSourceIds: string[];
      grounded: boolean;
    }) => {
      const selected = new Set(input.selectedSourceIds);
      const sources = input.grounded
        ? input.candidates.filter((candidate) => selected.has(candidate.id))
          .map((candidate) => ({ id: candidate.id, text: `${candidate.question}\n${candidate.answer}` }))
        : [];
      return { sources, complete: input.grounded ? sources.length > 0 : true };
    },
    historyJevAgreement: (input: {
      jevGrounding?: string | null; judgeGrounding?: string | null;
      jevComplete: boolean; sampleEvaluable: boolean;
    }) => {
      if (!input.jevComplete || !input.sampleEvaluable) return "incomparable";
      const jev = input.jevGrounding ?? null;
      const judge = input.judgeGrounding ?? null;
      if (!jev || !judge || jev === "unknown" || judge === "unknown") return "incomparable";
      return jev === judge ? "agree" : "divergent";
    },
    judgeHistoryDecisionPointWithJev: async (input: { config: { model: string } }) => {
      jevCalls += 1;
      if (options.jevFail || options.jevErrorCode) {
        return { ok: false, errorCode: options.jevErrorCode ?? "provider_unavailable",
          attemptCount: 1, elapsedMs: 5, outcomeUncertain: false };
      }
      return {
        ok: true, modelRequested: input.config.model, modelResolved: "jev-1.13.0",
        answers: {
          grounding: { choice: "unsupported", probabilities: { supported: 0.1, unsupported: 0.8, conflicting: 0.05, unknown: 0.05 }, confidence: 0.8 },
          coverage: { choice: "complete", probabilities: { complete: 0.9, partial: 0.05, missed: 0.03, unknown: 0.02 }, confidence: 0.85 },
          unverifiedAction: { noul: 0.1 },
          humanReview: { noul: 0.4 },
        },
        inputTokens: 100, outputTokens: 20, attemptCount: 1, elapsedMs: 12,
      };
    },
  });
  const call = async (body: Row) => {
    const response = await handler(new Request("http://local.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": "local-test" },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as Row };
  };
  return { proposals, faqs, samples, runs, rules, cases, jev, call,
    jevCalls: () => jevCalls,
    setCandidateAnswer: (value: string) => { candidateAnswer = value; } };
}

describe("history replay proposal safeguards", () => {
  it("keeps another proposal's draft when two samples have the same question", async () => {
    const app = replayEndpoint();
    for (const [proposalId, guidance] of [[id(1), "first"], [id(2), "second"]]) {
      app.proposals.push({
        id: proposalId, environment: "develop", status: "ready",
        approved_by: id(10), validation: { passed: true },
        candidate_patch: { question: "5份", guidance },
        scope: { run_id: id(3) }, source_sample_ids: [id(4)],
      });
    }
    const first = await app.call({ action: "apply_proposal", proposal_id: id(1) });
    const second = await app.call({ action: "apply_proposal", proposal_id: id(2) });
    expect(first.body.faq_id).not.toBe(second.body.faq_id);
    expect(app.faqs).toHaveLength(2);
    expect((await app.call({ action: "rollback_proposal", proposal_id: id(2) })).body.status).toBe("rolled_back");
    expect(app.faqs).toHaveLength(1);
    expect(app.faqs[0].answer).toBe("first");
  });

  it("blocks unchanged answers and does not mark unapproved validation ready", async () => {
    const app = replayEndpoint();
    app.proposals.push({
      id: id(1), environment: "develop", status: "proposed",
      source_sample_ids: [id(4)], scope: { run_id: id(3) },
      candidate_patch: { guidance: "suggested" },
    });
    app.samples.push({ id: id(4), run_id: id(3), question: "Question", context: [], ai_answer: "unchanged" });
    app.runs.push({ id: id(3), environment: "develop", snapshot: { config_fingerprint: "stable" } });
    const unchanged = await app.call({ action: "validate_proposal", proposal_id: id(1) });
    expect((unchanged.body.validation as Row).passed).toBe(false);
    expect(unchanged.body.status).toBe("blocked");

    app.setCandidateAnswer("changed and grounded");
    const improved = await app.call({ action: "validate_proposal", proposal_id: id(1) });
    expect((improved.body.validation as Row).passed).toBe(true);
    expect(improved.body.status).toBe("proposed");
  });

  it("automatically applies a verified rewrite only with independent holdout and control", async () => {
    const app = replayEndpoint();
    app.runs.push({ id: id(3), environment: "develop", status: "complete",
      scope: "answer_quality", snapshot: { config_fingerprint: "stable", config_id: id(40),
        config_updated_at: "2026-09-19T00:00:00Z" } });
    const issue = { category: "retrieval_miss", layer: "retrieval",
      evidence: [{ sourceType: "approved_source", sourceId: id(99) }] };
    for (const [sampleId, conversation, question, comparison] of [
      [id(4), "conversation-a", "有冇送貨？", "divergent"],
      [id(5), "conversation-b", "有冇送貨？", "divergent"],
      [id(6), "conversation-c", "其他問題", "match"],
    ]) {
      app.samples.push({ id: sampleId, run_id: id(3), question, context: [],
        scenario_at: "2026-09-19T00:00:00Z",
        status: "scored", pairing: "confident", context_gap: false,
        judge_model: "test", lineage: { conversation_id: conversation },
        judgment: { status: "scored", comparison, referenceStatus: "unknown",
          issues: comparison === "match" ? [] : [issue] } });
    }
    const response = await app.call({ action: "auto_repair", run_id: id(3), limit: 1 });
    expect(response.status).toBe(200);
    expect((response.body.results as Row[])[0].status).toBe("active");
    expect(app.proposals[0].status).toBe("active");
    expect(app.rules[0].status).toBe("active");
    expect((await app.call({ action: "rollback_proposal", proposal_id: app.proposals[0].id })).body.status)
      .toBe("rolled_back");
    expect(app.rules[0].status).toBe("rolled_back");
  });

  it("does not create a verified rewrite when the cited FAQ is not an approved source", async () => {
    const app = replayEndpoint(false);
    app.runs.push({ id: id(3), environment: "develop", status: "complete",
      scope: "answer_quality", snapshot: { config_fingerprint: "stable", config_id: id(40),
        config_updated_at: "2026-09-19T00:00:00Z" } });
    const issue = { category: "retrieval_miss", layer: "retrieval",
      evidence: [{ sourceType: "approved_source", sourceId: id(99) }] };
    for (const [sampleId, conversation, question, comparison] of [
      [id(4), "conversation-a", "有冇送貨？", "divergent"],
      [id(5), "conversation-b", "有冇送貨？", "divergent"],
      [id(6), "conversation-c", "其他問題", "match"],
    ]) {
      app.samples.push({ id: sampleId, run_id: id(3), question, context: [],
        scenario_at: "2026-09-19T00:00:00Z", status: "scored", pairing: "confident",
        context_gap: false, judge_model: "test", lineage: { conversation_id: conversation },
        judgment: { status: "scored", comparison, referenceStatus: "unknown",
          issues: comparison === "match" ? [] : [issue] } });
    }
    const response = await app.call({ action: "auto_repair", run_id: id(3), limit: 1 });
    expect((response.body.results as Row[])[0].status).toBe("insufficient_evidence");
    expect(app.proposals[0].preauthorized).toBe(false);
    expect(app.rules).toHaveLength(0);
  });

  it("records an AI-classified scenario as a draft case, never as FAQ knowledge", async () => {
    const app = replayEndpoint(true, true);
    app.runs.push({ id: id(3), environment: "develop", status: "complete",
      scope: "answer_quality", snapshot: { config_fingerprint: "stable", config_id: id(40),
        config_updated_at: "2026-09-19T00:00:00Z" } });
    app.samples.push({ id: id(4), run_id: id(3), question: "明天送貨要準備甚麼？",
      reference_answer: "先確認日期和地址。", context: [],
      scenario_at: "2026-09-19T00:00:00Z", status: "scored", pairing: "confident",
      context_gap: false, judge_model: "test", lineage: { conversation_id: "conversation-a",
        request_message_ids: ["request-1"], reference_message_ids: ["reply-1"] },
      judgment: { status: "scored", comparison: "divergent", referenceStatus: "unknown",
        issues: [] } });
    const response = await app.call({ action: "auto_repair", run_id: id(3), limit: 1 });
    expect((response.body.results as Row[])[0].status).toBe("case_draft_recorded");
    expect(app.cases).toHaveLength(1);
    expect(app.cases[0].status).toBe("draft");
    expect(app.cases[0].response_strategy).toEqual({ steps: ["acknowledge", "ask_missing_details"] });
    expect(app.faqs).toHaveLength(0);
    expect(app.proposals[0].repair_kind).toBe("case_guidance_candidate");
    expect(app.proposals[0].preauthorized).toBe(false);
  });

  it("keeps generation defects as code-change proposals instead of case guidance", async () => {
    const app = replayEndpoint(true, true);
    app.runs.push({ id: id(3), environment: "develop", status: "complete",
      scope: "answer_quality", snapshot: { config_fingerprint: "stable", config_id: id(40),
        config_updated_at: "2026-09-19T00:00:00Z" } });
    app.samples.push({ id: id(4), run_id: id(3), question: "明天送貨要準備甚麼？",
      reference_answer: "先確認日期和地址。", context: [],
      scenario_at: "2026-09-19T00:00:00Z", status: "scored", pairing: "confident",
      context_gap: false, judge_model: "test", lineage: { conversation_id: "conversation-a",
        request_message_ids: ["request-1"], reference_message_ids: ["reply-1"] },
      judgment: { status: "scored", comparison: "divergent", referenceStatus: "unknown",
        issues: [{ category: "answer_logic", layer: "generation", evidence: [] }] } });

    const response = await app.call({ action: "auto_repair", run_id: id(3), limit: 1 });

    expect((response.body.results as Row[])[0].status).toBe("unsupported_repair");
    expect(app.cases).toHaveLength(0);
    expect(app.proposals[0].repair_kind).toBe("code_change_proposal");
    expect(app.proposals[0].reason).toBe("answer_logic_code_change_required");
  });
});

function jevRunSample(overrides: Row = {}): Row {
  return {
    id: id(4), run_id: id(3), question: "有冇月餅？", context: [], ai_answer: "冇",
    status: "scored", pairing: "confident", context_gap: false,
    scenario_at: "2026-09-18T14:54:47Z",
    trace: {
      grounded: true, usedFallback: false, answerGuardPassed: true,
      candidates: [{ id: id(99), question: "有月餅嗎", answer: "有，可訂" }],
      faqSourceIds: [id(99)],
      retrieval: { error: false, candidateCount: 1, selectedSourceIds: [id(99)] },
    },
    judgment: { stage: "llm", aiGrounding: "supported", comparison: "divergent", issues: [] },
    lineage: { conversation_id: "conversation-a" },
    ...overrides,
  };
}

function jevRun(overrides: Row = {}): Row {
  return { id: id(3), environment: "develop", scope: "answer_quality", status: "complete",
    snapshot: {}, ...overrides };
}

describe("history replay Jev second judge", () => {
  it("does nothing when the feature flag is off or the key is missing", async () => {
    const disabled = replayEndpoint(true, false, { jevEnabled: false });
    disabled.runs.push(jevRun());
    disabled.samples.push(jevRunSample());
    const off = await disabled.call({ action: "judge_jev", run_id: id(3) });
    expect(off.status).toBe(503);
    expect(off.body.error).toBe("jev_disabled");
    expect(disabled.jevCalls()).toBe(0);

    const unconfigured = replayEndpoint(true, false, { jevEnabled: true, jevKey: "" });
    unconfigured.runs.push(jevRun());
    unconfigured.samples.push(jevRunSample());
    const missing = await unconfigured.call({ action: "judge_jev", run_id: id(3) });
    expect(missing.status).toBe(503);
    expect(missing.body.error).toBe("jev_not_configured");
    expect(unconfigured.jevCalls()).toBe(0);
  });

  it("does not evaluate routing_safety samples", async () => {
    const app = replayEndpoint();
    app.runs.push(jevRun({ scope: "routing_safety" }));
    app.samples.push(jevRunSample());
    const response = await app.call({ action: "judge_jev", run_id: id(3) });
    expect(response.status).toBe(200);
    expect(response.body.note).toBe("routing_safety_not_applicable");
    expect(app.jevCalls()).toBe(0);
    expect(app.jev).toHaveLength(0);
  });

  it("stores an independent verdict and its comparison without touching the LLM judgment", async () => {
    const app = replayEndpoint();
    app.runs.push(jevRun());
    app.samples.push(jevRunSample());
    const response = await app.call({ action: "judge_jev", run_id: id(3) });
    expect(response.status).toBe(200);
    expect(response.body.evaluated).toBe(1);
    expect(response.body.divergent).toBe(1);
    expect(app.jev).toHaveLength(1);
    expect(app.jev[0].status).toBe("complete");
    expect(app.jev[0].model_resolved).toBe("jev-1.13.0");
    expect(app.jev[0].agreement).toBe("divergent");
    expect(app.jev[0].input_tokens).toBe(100);
    expect((app.samples[0].judgment as Row).aiGrounding).toBe("supported");
    expect(app.samples[0].judge_model).toBeUndefined();
  });

  it("does not re-request the same sample/rubric/model on a repeated call", async () => {
    const app = replayEndpoint();
    app.runs.push(jevRun());
    app.samples.push(jevRunSample());
    await app.call({ action: "judge_jev", run_id: id(3) });
    const second = await app.call({ action: "judge_jev", run_id: id(3) });
    expect(second.body.evaluated).toBe(0);
    expect(second.body.remaining).toBe(0);
    expect(app.jevCalls()).toBe(1);
  });

  it("skips guard-blocked samples and unresolved sources instead of guessing", async () => {
    const app = replayEndpoint();
    app.runs.push(jevRun());
    app.samples.push(jevRunSample({ id: id(5),
      trace: { grounded: true, answerGuardPassed: false,
        candidates: [{ id: id(99), question: "q", answer: "a" }], faqSourceIds: [id(99)],
        retrieval: { error: false, candidateCount: 1, selectedSourceIds: [id(99)] } } }));
    app.samples.push(jevRunSample({ id: id(6),
      trace: { grounded: true, answerGuardPassed: true,
        candidates: [{ id: id(99), question: "q", answer: "a" }], faqSourceIds: [id(77)],
        retrieval: { error: false, candidateCount: 1, selectedSourceIds: [id(77)] } } }));
    const response = await app.call({ action: "judge_jev", run_id: id(3) });
    expect(response.body.skipped).toBe(2);
    const codes = app.jev.map((row) => row.error_code).sort();
    expect(codes).toEqual(["answer_guard_blocked", "unverified_sources_not_evaluable"]);
    expect(app.jevCalls()).toBe(0);
  });

  it("records a provider failure without writing a fake unknown verdict", async () => {    const app = replayEndpoint(true, false, { jevFail: true });
    app.runs.push(jevRun());
    app.samples.push(jevRunSample());
    const response = await app.call({ action: "judge_jev", run_id: id(3) });
    expect(response.body.failed).toBe(1);
    expect(app.jev[0].status).toBe("failed");
    expect(app.jev[0].error_code).toBe("provider_unavailable");
    expect(app.jev[0].answers).toBeNull();
    expect(app.jev[0].agreement).toBeNull();
  });

  it("stops the batch early on a TypeSafe configuration error and releases the lease", async () => {
    const app = replayEndpoint(true, false, { jevErrorCode: "auth_failed" });
    app.runs.push(jevRun());
    app.samples.push(jevRunSample({ id: id(4) }));
    app.samples.push(jevRunSample({ id: id(5) }));
    const response = await app.call({ action: "judge_jev", run_id: id(3), concurrency: 1, limit: 10 });
    expect(response.body.ok).toBe(false);
    expect(response.body.config_error).toBe("auth_failed");
    expect(app.jevCalls()).toBe(1);
    expect(app.jev.map((row) => row.status).sort()).toEqual(["pending", "pending"]);
  });

  it("exposes jev_enabled and the jev summary through status and samples", async () => {
    const app = replayEndpoint();
    app.runs.push(jevRun());
    app.samples.push(jevRunSample());
    const status = await app.call({ action: "status" });
    expect((status.body.capabilities as Row).jev_enabled).toBe(true);
    await app.call({ action: "judge_jev", run_id: id(3) });
    const samples = await app.call({ action: "samples", run_id: id(3) });
    const row = (samples.body.samples as Row[])[0];
    expect(row.conversation_id).toBe("conversation-a");
    expect(row.agreement).toBe("divergent");
    expect((row.jev as Row).status).toBe("complete");
    expect(((row.jev as Row).answers as Row).grounding).toBeTruthy();
  });
});
