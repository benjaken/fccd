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

function replayEndpoint(allowlist = id(99), caseAutoIngest = false) {
  const proposals: Row[] = [];
  const faqs: Row[] = [];
  const samples: Row[] = [];
  const runs: Row[] = [];
  const rules: Row[] = [];
  const cases: Row[] = [];
  let nextFaq = 0;
  let candidateAnswer = "unchanged";
  const tables: Record<string, Row[]> = {
    customer_service_repair_proposals: proposals,
    customer_faqs: faqs,
    customer_service_history_eval_samples: samples,
    customer_service_history_eval_runs: runs,
    customer_service_config_versions: [{ id: id(40), updated_at: "2026-09-19T00:00:00Z",
      environment: "develop", status: "active" }],
    customer_service_verified_rewrite_repairs: rules,
    customer_service_cases: cases,
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
      if (name === "customer_service_verified_repair_target") {
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
      CUSTOMER_SERVICE_AUTO_REPAIR_FAQ_ALLOWLIST: allowlist,
      CUSTOMER_SERVICE_CASES_AUTO_INGEST: String(caseAutoIngest),
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
  });
  const call = async (body: Row) => {
    const response = await handler(new Request("http://local.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": "local-test" },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as Row };
  };
  return { proposals, faqs, samples, runs, rules, cases, call,
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

  it("keeps a verified candidate inactive when its FAQ is outside the operator allowlist", async () => {
    const app = replayEndpoint("");
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
    expect((response.body.results as Row[])[0].status).toBe("eligible");
    expect(app.proposals[0].preauthorized).toBe(false);
    expect(app.rules).toHaveLength(0);
  });

  it("records an AI-classified scenario as a draft case, never as FAQ knowledge", async () => {
    const app = replayEndpoint("", true);
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
    const app = replayEndpoint("", true);
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
