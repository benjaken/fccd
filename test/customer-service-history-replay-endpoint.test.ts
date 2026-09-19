import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Row = Record<string, unknown>;
const id = (digit: number) => `00000000-0000-4000-8000-${String(digit).padStart(12, "0")}`;

function replayEndpoint() {
  const proposals: Row[] = [];
  const faqs: Row[] = [];
  const samples: Row[] = [];
  const runs: Row[] = [];
  let nextFaq = 0;
  let candidateAnswer = "unchanged";
  const tables: Record<string, Row[]> = {
    customer_service_repair_proposals: proposals,
    customer_faqs: faqs,
    customer_service_history_eval_samples: samples,
    customer_service_history_eval_runs: runs,
    customer_service_config_versions: [],
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
    eq(key: string, value: unknown) { this.filters.push((row) => row[key] === value); return this; }
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

  const admin = { from: (table: string) => new Query(table) };
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
    } as Record<string, string>)[name] }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => admin,
    caseFingerprint: () => "stable",
    customerServiceAiTiers: () => ({ primary: { model: "test" }, fallback: null, escalationConfidence: 0.72 }),
    customerServiceRagConfig: () => ({}),
    replayHistoryDecisionPoint: async () => ({
      aiAnswer: candidateAnswer, grounded: true, usedFallback: false,
      faqSourceIds: [`proposal-${id(1)}`],
      retrieval: { candidateCount: 1, error: false, degraded: false },
      answerGuardPassed: true,
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
  return { proposals, faqs, samples, runs, call, setCandidateAnswer: (value: string) => { candidateAnswer = value; } };
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
});
