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
  options: {
    judgeGrounding?: string; codeChangeDraft?: boolean; runtimeChangeDraft?: boolean;
  } = {},
) {
  const proposals: Row[] = [];
  const faqs: Row[] = [];
  const samples: Row[] = [];
  const runs: Row[] = [];
  const rules: Row[] = [];
  const cases: Row[] = [];
  let nextFaq = 0;
  let candidateAnswer = "unchanged";
  const intents: Row[] = [];
  const policies: Row[] = [];
  const replyTemplates: Row[] = [];
  const tables: Record<string, Row[]> = {
    customer_service_repair_proposals: proposals,
    customer_faqs: faqs,
    customer_service_history_eval_samples: samples,
    customer_service_history_eval_runs: runs,
    customer_service_config_versions: [{ id: id(40), updated_at: "2026-09-19T00:00:00Z",
      environment: "develop", status: "active" }],
    customer_service_verified_rewrite_repairs: rules,
    customer_service_cases: cases,
    customer_service_intents: intents,
    customer_service_workflow_policies: policies,
    customer_service_reply_templates: replyTemplates,
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
      if (name === "customer_service_repair_runtime_change_review") {
        const target = proposals.find((row) => row.id === args.p_proposal_id);
        if (!target) return { data: null, error: { message: "proposal_not_found" } };
        const applied = args.p_decision === "apply";
        target.status = applied ? "applied" : "rejected";
        return { data: [{ proposal_id: target.id, proposal_status: target.status,
          change_count: applied ? 1 : 0 }], error: null };
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
    autoRepairMode: (raw: string | undefined) => {
      const value = (raw ?? "").trim().toLowerCase();
      return value === "propose" || value === "apply_allowlist" ? value : "off";
    },
    codeChangeDraftAllowed: (mode: string, risk: string, kind: string) =>
      mode !== "off" && risk === "R3" && kind === "code_change_proposal",
    CODE_CHANGE_DRAFT_VERSION: "history-code-change-v1",
    renderCodeChangeDraftBrief: () => "# 修復草稿 — 需人工審查，未套用",
    runtimeChangeDraftAllowed: (kind: string, risk: string) =>
      risk === "R2" && kind === "runtime_policy_candidate",
    RUNTIME_CHANGE_DRAFT_VERSION: "history-runtime-change-v1",
    renderRuntimeChangeDraftBrief: () => "# 政策／意圖修改草稿 — 需人工審查，未套用",
    EMPTY_LEARNING_RUNTIME_TARGETS: { intents: [], replyTemplates: [], workflowPolicies: [] },
    draftHistoryRuntimeChange: async () => (options.runtimeChangeDraft === false ? null : {
      summary: "Tell the customer the order-change policy before collecting details.",
      changes: [{
        target: "workflow_policy", key: "order_change",
        patch: { instructions_append: "先說明不得直接修改訂單。" },
      }],
      tests: ["order-change reply states the policy"],
      risks: ["may lengthen the reply"],
      requiresReview: true, source: "hypothesis", version: "history-runtime-change-v1",
    }),
    draftHistoryCodeChange: async () => (options.codeChangeDraft === false ? null : {
      summary: "Answer a delivery-time request directly instead of treating it as off-topic.",
      files: [{
        path: "supabase/functions/_shared/customer-service-replies.ts",
        rationale: "Add a delivery-time lane before the off-topic guard.",
        before: "const lane = classify(text);",
        after: 'const lane = classify(text) ?? "delivery_time";',
      }],
      tests: ["delivery time request is answered directly"],
      risks: ["may widen the reply lane"],
      requiresReview: true, source: "hypothesis", version: "history-code-change-v1",
    }),
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
  return { proposals, faqs, samples, runs, rules, cases, intents, policies, replyTemplates, call,
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

  it("generates an R3 code-change draft without applying code or touching FAQs", async () => {
    const app = replayEndpoint();
    app.proposals.push({
      id: id(1), environment: "develop", repair_kind: "code_change_proposal",
      risk_level: "R3", status: "insufficient_evidence",
      source_sample_ids: [id(4)], scope: { run_id: id(3) },
    });
    app.samples.push({
      id: id(4), run_id: id(3), question: "請你11:30-12:00送餐 可以嗎", context: [],
      ai_answer: "off topic", reference_answer: "可以",
      judgment: { issues: [{
        category: "wrong_policy", severity: "high", layer: "generation", evidence: [],
        suggestedFix: "Address the delivery time request directly",
      }] },
    });
    const result = await app.call({ action: "draft_code_change", proposal_id: id(1) });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("drafted");
    expect(app.proposals[0].status).toBe("drafted");
    expect(app.proposals[0].code_change_draft).toMatchObject({ requiresReview: true });
    expect(app.faqs).toHaveLength(0);
  });

  it("refuses to draft when the model returns nothing reviewable", async () => {
    const app = replayEndpoint(true, false, { codeChangeDraft: false });
    app.proposals.push({
      id: id(1), environment: "develop", repair_kind: "code_change_proposal",
      risk_level: "R3", status: "insufficient_evidence",
      source_sample_ids: [id(4)], scope: { run_id: id(3) },
    });
    app.samples.push({
      id: id(4), run_id: id(3), question: "Hello有update嗎？", context: [],
      ai_answer: "?", reference_answer: "update",
      judgment: { issues: [{
        category: "context_dropped", severity: "medium", layer: "context",
        evidence: [], suggestedFix: "Reuse the prior context",
      }] },
    });
    const result = await app.call({ action: "draft_code_change", proposal_id: id(1) });
    expect(result.status).toBe(502);
    expect(app.proposals[0].status).toBe("insufficient_evidence");
  });

  it("drafts and applies an R2 runtime policy change without touching code or FAQs", async () => {
    const app = replayEndpoint();
    app.policies.push({ goal_key: "order_change", display_name: "訂單修改", instructions: "先核實身份。" });
    app.proposals.push({
      id: id(1), environment: "develop", repair_kind: "runtime_policy_candidate",
      risk_level: "R2", status: "insufficient_evidence",
      source_sample_ids: [id(4)], scope: { run_id: id(3) },
    });
    app.samples.push({
      id: id(4), run_id: id(3), question: "可以改單嗎", context: [],
      ai_answer: "可以", reference_answer: "先核實身份",
      judgment: { issues: [{
        category: "wrong_policy", severity: "medium", layer: "generation", evidence: [],
        suggestedFix: "先說明不得直接修改訂單",
      }] },
    });
    const drafted = await app.call({ action: "draft_runtime_change", proposal_id: id(1) });
    expect(drafted.status).toBe(200);
    expect(drafted.body.status).toBe("drafted");
    expect(app.proposals[0].runtime_change_draft).toMatchObject({ requiresReview: true });
    expect(app.faqs).toHaveLength(0);

    // Applying a live policy patch requires an identified human reviewer; a
    // server-to-server (cron) call without an actor is refused.
    const noReviewer = await app.call({ action: "review_runtime_change", proposal_id: id(1), decision: "apply" });
    expect(noReviewer.status).toBe(403);
    expect(app.proposals[0].status).toBe("drafted");

    const rejected = await app.call({ action: "review_runtime_change", proposal_id: id(1), decision: "reject" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
    expect(app.proposals[0].status).toBe("rejected");
  });

  it("refuses a runtime draft when the model returns nothing reviewable", async () => {
    const app = replayEndpoint(true, false, { runtimeChangeDraft: false });
    app.policies.push({ goal_key: "order_change", display_name: "訂單修改", instructions: "先核實身份。" });
    app.proposals.push({
      id: id(1), environment: "develop", repair_kind: "runtime_policy_candidate",
      risk_level: "R2", status: "insufficient_evidence",
      source_sample_ids: [id(4)], scope: { run_id: id(3) },
    });
    app.samples.push({
      id: id(4), run_id: id(3), question: "可以改單嗎", context: [],
      ai_answer: "可以", reference_answer: "先核實身份",
      judgment: { issues: [{
        category: "wrong_policy", severity: "medium", layer: "generation", evidence: [],
        suggestedFix: "",
      }] },
    });
    const result = await app.call({ action: "draft_runtime_change", proposal_id: id(1) });
    expect(result.status).toBe(502);
    expect(app.proposals[0].status).toBe("insufficient_evidence");
  });

  it("routes a policy gap to an R2 runtime candidate instead of a code draft", async () => {
    const app = replayEndpoint();
    app.runs.push({ id: id(3), environment: "develop", status: "complete",
      scope: "answer_quality", snapshot: { config_fingerprint: "stable", config_id: id(40),
        config_updated_at: "2026-09-19T00:00:00Z" } });
    app.samples.push({ id: id(4), run_id: id(3), question: "可以改單嗎", context: [],
      scenario_at: "2026-09-19T00:00:00Z", status: "scored", pairing: "confident", context_gap: false,
      judge_model: "test", lineage: { conversation_id: "conversation-a" },
      judgment: { status: "scored", comparison: "divergent", referenceStatus: "unknown",
        issues: [{ category: "wrong_policy", severity: "medium", layer: "generation", evidence: [] }] } });
    const response = await app.call({ action: "auto_repair", run_id: id(3), limit: 1 });
    expect((response.body.results as Row[])[0].status).toBe("candidate");
    expect(app.proposals[0].repair_kind).toBe("runtime_policy_candidate");
    expect(app.proposals[0].risk_level).toBe("R2");
    expect(app.proposals[0].preauthorized).toBe(false);
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

