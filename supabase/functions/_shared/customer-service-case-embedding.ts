import { buildCaseEmbeddingText, caseFingerprint, type CaseEmbeddingSource } from "./customer-service-cases.ts";
import {
  CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS, CustomerServiceEmbeddingError,
  customerServiceEmbeddingProfile, embedCustomerServiceTexts, type CustomerServiceEmbeddingConfig,
} from "./customer-service-embedding.ts";
import { ragRpc, type CustomerServiceRagDatabase } from "./customer-service-rag-db.ts";

/** Bumping this invalidates every stored case vector and forces a rebuild. */
export const CASE_EMBEDDING_CONTENT_VERSION = "case-guidance-v1";

export type ClaimedCaseEmbedding = {
  id: string;
  scenario_context: string;
  known_information: Record<string, unknown> | null;
  missing_information: string[] | null;
  response_strategy: Record<string, unknown> | null;
  applicability: Record<string, unknown> | null;
  revision: number;
  claim_token: string;
};

export type CaseBackfillResult = {
  scanned: number; embedded: number; failed: number; superseded: number; deferred: number;
  databaseErrors: number; profile: string; outcomes: Array<{ id: string; status: string; code?: string }>;
};

function embeddingSource(claim: ClaimedCaseEmbedding): CaseEmbeddingSource {
  const applicability = claim.applicability ?? {};
  const intents = Array.isArray(applicability.intents)
    ? applicability.intents.filter((item): item is string => typeof item === "string")
    : [];
  const brand = typeof applicability.brand === "string" && applicability.brand.trim()
    ? applicability.brand.trim() : null;
  return {
    scenario_context: claim.scenario_context,
    known_information: claim.known_information ?? {},
    missing_information: claim.missing_information ?? [],
    response_strategy: claim.response_strategy ?? {},
    applicability: { intents, brand },
  };
}

/**
 * Case twin of runFaqEmbeddingBackfill: leased claims, atomic completion and a
 * revision/CAS check so a stale job can never overwrite a newer case revision.
 * The FAQ job is intentionally untouched.
 */
export async function runCaseEmbeddingBackfill({
  db, config, environment, caseIds = [], force = false, limit = 20,
  deadlineAt = Date.now() + 45_000, fetchImpl = fetch,
}: {
  db: CustomerServiceRagDatabase; config: CustomerServiceEmbeddingConfig; environment: string;
  caseIds?: string[]; force?: boolean; limit?: number; deadlineAt?: number; fetchImpl?: typeof fetch;
}): Promise<CaseBackfillResult> {
  if (!config.enabled || !config.apiKey || !config.model || !config.endpoint) throw new Error("embedding_not_configured");
  if (config.dimensions !== CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS) throw new Error("embedding_storage_dimension_mismatch");
  if (!environment.trim()) throw new Error("case_environment_required");
  if (force && !caseIds.length) throw new Error("force_requires_case_ids");
  const profile = await customerServiceEmbeddingProfile(config);
  const rows = await ragRpc(db, "customer_service_claim_case_embeddings", {
    p_profile: profile, p_environment: environment,
    p_limit: Math.min(50, Math.max(1, Math.trunc(limit))),
    p_case_ids: caseIds.length ? [...new Set(caseIds)] : null, p_force: force,
  }, Math.max(1, Math.min(3_000, deadlineAt - Date.now())));
  if (!Array.isArray(rows)) throw new Error("case_embedding_claim_invalid_response");
  const claims = rows as ClaimedCaseEmbedding[];
  if (claims.some((row) => !row?.id || typeof row.scenario_context !== "string" || !row.claim_token || !Number.isSafeInteger(row.revision))) {
    throw new Error("case_embedding_claim_invalid_response");
  }
  const result: CaseBackfillResult = { scanned: claims.length, embedded: 0, failed: 0, superseded: 0, deferred: 0, databaseErrors: 0, profile, outcomes: [] };
  let next = 0;
  const release = async (claim: ClaimedCaseEmbedding, code: string | null): Promise<boolean> =>
    await ragRpc(db, "customer_service_release_case_embedding", {
      p_id: claim.id, p_revision: claim.revision, p_claim_token: claim.claim_token, p_error: code,
    }, Math.max(1, Math.min(3_000, deadlineAt - Date.now()))) === true;
  const concurrency = Math.min(5, Math.max(1, Math.trunc(config.concurrency ?? 3)));
  await Promise.all(Array.from({ length: Math.min(concurrency, claims.length) }, async () => {
    for (;;) {
      const claim = claims[next++];
      if (!claim) return;
      try {
        if (deadlineAt - Date.now() < 2_000) {
          if (Date.now() >= deadlineAt) {
            result.deferred++;
            result.outcomes.push({ id: claim.id, status: "deferred", code: "lease_will_expire" });
            continue;
          }
          const released = await release(claim, null);
          if (released) result.deferred++; else result.superseded++;
          result.outcomes.push({ id: claim.id, status: released ? "deferred" : "superseded" });
          continue;
        }
        const text = buildCaseEmbeddingText(embeddingSource(claim));
        const [vector] = await embedCustomerServiceTexts([text], {
          config: { ...config, concurrency: 1 }, fetchImpl, deadlineAt: deadlineAt - 1_000,
        });
        const committed = await ragRpc(db, "customer_service_complete_case_embedding", {
          p_id: claim.id, p_revision: claim.revision, p_claim_token: claim.claim_token,
          p_vector: JSON.stringify(vector), p_model: config.model, p_profile: profile,
          p_hash: caseFingerprint(text), p_content_version: CASE_EMBEDDING_CONTENT_VERSION,
        }, Math.max(1, Math.min(3_000, deadlineAt - Date.now())));
        if (committed === true) {
          result.embedded++;
          result.outcomes.push({ id: claim.id, status: "ready" });
        } else if (committed === false) {
          result.superseded++;
          result.outcomes.push({ id: claim.id, status: "superseded" });
        } else {
          throw new Error("case_embedding_completion_invalid_response");
        }
      } catch (error) {
        const code = error instanceof CustomerServiceEmbeddingError ? error.code : "embedding_database_or_worker_error";
        try {
          if (Date.now() >= deadlineAt) throw new Error("lease_will_expire");
          const released = await release(claim, code);
          if (released) result.failed++; else result.superseded++;
          result.outcomes.push({ id: claim.id, status: released ? "failed" : "superseded", code });
        } catch {
          result.databaseErrors++;
          result.outcomes.push({ id: claim.id, status: "database_error", code: "embedding_database_error" });
        }
      }
    }
  }));
  return result;
}
