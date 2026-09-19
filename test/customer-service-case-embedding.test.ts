import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  CASE_EMBEDDING_CONTENT_VERSION,
  runCaseEmbeddingBackfill,
  type ClaimedCaseEmbedding,
} from "../supabase/functions/_shared/customer-service-case-embedding.ts";
import { buildCaseEmbeddingText, caseFingerprint } from "../supabase/functions/_shared/customer-service-cases.ts";
import type { CustomerServiceEmbeddingConfig } from "../supabase/functions/_shared/customer-service-embedding.ts";
import type { CustomerServiceRagDatabase } from "../supabase/functions/_shared/customer-service-rag-db.ts";

const vector = (n = 1) => Array.from({ length: 1024 }, () => n / 100);
const ark: CustomerServiceEmbeddingConfig = {
  enabled: true, apiStyle: "ark_multimodal", endpoint: "https://embedding.example.test/multimodal",
  apiKey: "test-key", model: "doubao-test", dimensions: 1024, sendDimensions: true,
  timeoutMs: 2_000, batchSize: 10, concurrency: 3, maxRetries: 0,
};
const response = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });

const claim = (id = "case-0", revision = 1): ClaimedCaseEmbedding => ({
  id, scenario_context: "客戶想安排公司聚餐", known_information: { headcount: "30" },
  missing_information: ["日期"], response_strategy: { approach: "先承接再追問" },
  applicability: { intents: ["group_order"], brand: null }, revision, claim_token: `token-${id}`,
});

function backfillDb(claims: ClaimedCaseEmbedding[], options: { rejectCompletion?: boolean; supersede?: boolean } = {}) {
  const completed: Array<Record<string, unknown>> = [];
  const released: string[] = [];
  const calls: string[] = [];
  let claimed = false;
  const db: CustomerServiceRagDatabase = {
    rpc: async (name, args = {}) => {
      calls.push(name);
      if (name === "customer_service_claim_case_embeddings") {
        assert.match(String(args.p_profile), /^[a-f0-9]{64}$/);
        assert.equal(args.p_environment, "develop");
        const rows = claimed ? [] : claims;
        claimed = true;
        return { data: rows, error: null };
      }
      if (name === "customer_service_complete_case_embedding") {
        assert.equal(JSON.parse(String(args.p_vector)).length, 1024);
        assert.equal(args.p_content_version, CASE_EMBEDDING_CONTENT_VERSION);
        if (options.rejectCompletion) return { data: null, error: { message: "write failed" } };
        if (options.supersede) return { data: false, error: null };
        completed.push(args);
        return { data: true, error: null };
      }
      if (name === "customer_service_release_case_embedding") {
        released.push(String(args.p_id));
        return { data: !options.supersede, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { db, completed, released, calls };
}

describe("customer-service case embedding backfill", () => {
  it("embeds guidance text and commits a matching content hash", async () => {
    const state = backfillDb([claim()]);
    let providerText = "";
    const result = await runCaseEmbeddingBackfill({
      db: state.db, config: ark, environment: "develop",
      fetchImpl: async (_url, init) => {
        providerText = JSON.parse(String(init?.body)).input[0].text;
        return response({ data: { embedding: vector() } });
      },
    });
    assert.equal(result.embedded, 1);
    assert.equal(result.failed, 0);
    assert.equal(state.completed.length, 1);
    assert.ok(providerText.includes("客戶想安排公司聚餐"));
    assert.ok(providerText.includes("缺少資訊：日期"));
    const expectedText = buildCaseEmbeddingText({
      scenario_context: "客戶想安排公司聚餐", known_information: { headcount: "30" },
      missing_information: ["日期"], response_strategy: { approach: "先承接再追問" },
      applicability: { intents: ["group_order"], brand: null },
    });
    assert.equal(state.completed[0].p_hash, caseFingerprint(expectedText));
  });

  it("does not report a superseded revision as ready", async () => {
    const state = backfillDb([claim()], { supersede: true });
    const result = await runCaseEmbeddingBackfill({
      db: state.db, config: ark, environment: "develop",
      fetchImpl: async () => response({ data: { embedding: vector() } }),
    });
    assert.equal(result.embedded, 0);
    assert.equal(result.superseded, 1);
  });

  it("counts a failed database commit as failed, not embedded", async () => {
    const state = backfillDb([claim()], { rejectCompletion: true });
    const result = await runCaseEmbeddingBackfill({
      db: state.db, config: ark, environment: "develop",
      fetchImpl: async () => response({ data: { embedding: vector() } }),
    });
    assert.equal(result.embedded, 0);
    assert.equal(result.failed, 1);
    assert.equal(state.released.length, 1);
  });

  it("defers work without calling the provider when the budget is spent", async () => {
    const state = backfillDb([claim("case-1")]);
    let calls = 0;
    const result = await runCaseEmbeddingBackfill({
      db: state.db, config: ark, environment: "develop", deadlineAt: Date.now() + 500,
      fetchImpl: async () => { calls += 1; throw new Error(); },
    });
    assert.equal(calls, 0);
    assert.equal(result.deferred, 1);
  });

  it("fails fast on storage dimensions, missing environment and ambiguous force", async () => {
    const state = backfillDb([claim()]);
    await assert.rejects(
      runCaseEmbeddingBackfill({ db: state.db, config: { ...ark, dimensions: 1536 }, environment: "develop" }),
      /storage_dimension/,
    );
    await assert.rejects(
      runCaseEmbeddingBackfill({ db: state.db, config: ark, environment: "  " }),
      /environment_required/,
    );
    await assert.rejects(
      runCaseEmbeddingBackfill({ db: state.db, config: ark, environment: "develop", force: true }),
      /force_requires_case_ids/,
    );
    assert.equal(state.calls.length, 0);
  });
});
