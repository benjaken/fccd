import { createClient } from "npm:@supabase/supabase-js@2";
import { customerServiceEmbeddingConfig, customerServiceEmbeddingProfile, CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS } from "../_shared/customer-service-embedding.ts";
import { runFaqEmbeddingBackfill } from "../_shared/customer-service-embedding-backfill.ts";
import { runCaseEmbeddingBackfill } from "../_shared/customer-service-case-embedding.ts";
import {
  autoRepairMode, buildRepairProposal, r1ReembedEligible, repairExecutionAllowed,
  repairProposalInsertRow,
  REPAIR_ALLOWLIST_VERSION, type R1TargetState,
} from "../_shared/customer-service-repair-proposals.ts";

/**
 * R1 repair executor (HR-06). Default off. It only ever re-embeds an already
 * verified, still-servable target through the existing leased claim/completion
 * RPCs — never direct DML, never a force whole-corpus rebuild, never policy
 * text, alias, prompt, model or threshold changes. Unknown kinds are rejected.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS = 5;

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

type AdminClient = ReturnType<typeof createClient>;

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

type TargetRow = Record<string, unknown> & { id: string };

async function loadFaqTarget(admin: AdminClient, id: string): Promise<TargetRow | null> {
  const { data, error } = await admin.from("customer_faqs")
    .select("id,is_published,embedding_status,embedding_profile,embedding_revision,embedding_claim_until,embedding_retry_at,embedding_attempts,embedding_error")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as TargetRow | null) ?? null;
}

async function loadCaseTarget(admin: AdminClient, id: string, environment: string): Promise<TargetRow | null> {
  const { data, error } = await admin.from("customer_service_cases")
    .select("id,status,environment,embedding_status,embedding_profile,embedding_revision,revision,embedding_claim_until,embedding_retry_at,embedding_attempts,embedding_error")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (String((data as TargetRow).environment) !== environment) throw new Error("environment_mismatch");
  return data as TargetRow;
}

function targetState(row: TargetRow, kind: "faq" | "case", currentProfile: string): R1TargetState {
  const claimUntil = row.embedding_claim_until ? Date.parse(String(row.embedding_claim_until)) : 0;
  const retryAt = row.embedding_retry_at ? Date.parse(String(row.embedding_retry_at)) : 0;
  return {
    verified: true,
    scopeValid: kind === "faq" ? true : String(row.environment ?? "") !== "" && String(row.status) !== "retired",
    servable: kind === "faq" ? row.is_published === true : ["draft", "active"].includes(String(row.status)),
    embeddingStatus: (String(row.embedding_status ?? "pending") as R1TargetState["embeddingStatus"]),
    embeddingProfileMatches: String(row.embedding_profile ?? "") === currentProfile,
    revisionMatches: kind === "faq" ? true : Number(row.embedding_revision) === Number(row.revision),
    contentVersionMatches: true,
    retryEligible: (retryAt === 0 || retryAt <= Date.now()) && Number(row.embedding_attempts ?? 0) < MAX_ATTEMPTS,
    permanentError: Boolean(row.embedding_error) && /dimension|not_configured|unauthorized|401|403/i.test(String(row.embedding_error)),
    activeClaim: claimUntil > Date.now(),
  };
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
    const environment = deploymentEnvironment();
    if (body.environment !== undefined && String(body.environment) !== environment) {
      return json({ error: "environment_mismatch" }, 400);
    }
    const mode = autoRepairMode(env("CUSTOMER_SERVICE_AUTO_REPAIR_MODE"));

    if (action === "propose") {
      const targetType = body.target_type === "case" ? "case" : body.target_type === "faq" ? "faq" : "";
      const targetId = String(body.target_id ?? "").trim();
      if (!targetType || !UUID.test(targetId)) return json({ error: "invalid_target" }, 400);
      if (body.confirmed_content_verified !== true) return json({ error: "content_verification_required" }, 422);
      const config = customerServiceEmbeddingConfig();
      if (config.dimensions !== CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS) return json({ error: "embedding_storage_dimension_mismatch" }, 503);
      const profile = await customerServiceEmbeddingProfile(config);
      const row = targetType === "faq"
        ? await loadFaqTarget(admin, targetId)
        : await loadCaseTarget(admin, targetId, environment);
      if (!row) return json({ error: "target_not_found" }, 404);
      const state = targetState(row, targetType, profile);
      const eligibility = r1ReembedEligible(state);
      const proposal = buildRepairProposal({
        environment, repairKind: "reembed_index", riskLevel: "R1", targetType, targetId,
        baseRevision: Number(row.embedding_revision ?? 0) || null,
        baseHash: null, baseProfile: String(row.embedding_profile ?? "") || null,
        sourceSampleIds: Array.isArray(body.source_sample_ids) ? body.source_sample_ids.filter((id) => typeof id === "string") : [],
        reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "retrieval_miss",
        candidatePatch: { action: "reembed", allowlist_version: REPAIR_ALLOWLIST_VERSION },
      });
      const { data: inserted, error } = await admin.from("customer_service_repair_proposals").upsert({
        ...repairProposalInsertRow(proposal), evidence: { eligibility },
      }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id, status, idempotency_key").maybeSingle();
      if (error) throw error;
      return json({ ok: true, action, mode, eligibility, proposal: inserted ?? proposal });
    }

    if (action === "apply") {
      const proposalId = String(body.proposal_id ?? "").trim();
      if (!UUID.test(proposalId)) return json({ error: "invalid_proposal_id" }, 400);
      const { data: proposal, error } = await admin.from("customer_service_repair_proposals")
        .select("*").eq("id", proposalId).maybeSingle();
      if (error) throw error;
      if (!proposal) return json({ error: "proposal_not_found" }, 404);
      if (proposal.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      if (!repairExecutionAllowed(mode, proposal.risk_level, proposal.repair_kind)) {
        await admin.from("customer_service_repair_proposals").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", proposalId);
        return json({ ok: false, error: "repair_not_authorized", mode, applied: false }, 409);
      }
      const config = customerServiceEmbeddingConfig();
      const profile = await customerServiceEmbeddingProfile(config);
      const row = proposal.target_type === "faq"
        ? await loadFaqTarget(admin, proposal.target_id)
        : await loadCaseTarget(admin, proposal.target_id, environment);
      if (!row) return json({ error: "target_not_found" }, 404);
      const eligibility = r1ReembedEligible(targetState(row, proposal.target_type === "faq" ? "faq" : "case", profile));
      if (!eligibility.eligible) {
        await admin.from("customer_service_repair_proposals")
          .update({ status: "blocked", validation: { eligibility }, updated_at: new Date().toISOString() }).eq("id", proposalId);
        return json({ ok: false, error: `not_eligible:${eligibility.reason}`, applied: false }, 409);
      }
      await admin.from("customer_service_repair_proposals")
        .update({ status: "applying", updated_at: new Date().toISOString() }).eq("id", proposalId);
      try {
        const result = proposal.target_type === "faq"
          ? await runFaqEmbeddingBackfill({ db: admin, config, faqIds: [proposal.target_id], force: true, limit: 1 })
          : await runCaseEmbeddingBackfill({ db: admin, config, environment, caseIds: [proposal.target_id], force: true, limit: 1 });
        const applied = result.embedded === 1;
        await admin.from("customer_service_repair_proposals").update({
          status: applied ? "applied" : "failed",
          executed_by: actorId ?? "service_role", executed_at: new Date().toISOString(),
          validation: { eligibility, result },
          updated_at: new Date().toISOString(),
        }).eq("id", proposalId);
        return json({ ok: applied, action, applied, result });
      } catch (executeError) {
        await admin.from("customer_service_repair_proposals").update({
          status: "failed", validation: { eligibility, error: executeError instanceof Error ? executeError.message.slice(0, 120) : "execute_failed" },
          updated_at: new Date().toISOString(),
        }).eq("id", proposalId);
        throw executeError;
      }
    }

    if (action === "list") {
      const limit = Math.max(1, Math.min(200, Number(body.limit) || 50));
      const { data, error } = await admin.from("customer_service_repair_proposals").select("*")
        .eq("environment", environment).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ ok: true, action, mode, proposals: data ?? [] });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "authentication_required" ? 401
      : message === "page_access_required" ? 403
        : message === "environment_mismatch" ? 400 : 500;
    console.error("customer-service-repair-admin", message.slice(0, 200));
    return json({ error: "repair_admin_failed", detail: message.slice(0, 200) }, status);
  }
});
