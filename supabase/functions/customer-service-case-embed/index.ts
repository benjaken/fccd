import { createClient } from "npm:@supabase/supabase-js@2";
import { customerServiceEmbeddingConfig } from "../_shared/customer-service-embedding.ts";
import { runCaseEmbeddingBackfill } from "../_shared/customer-service-case-embedding.ts";

/**
 * Builds embeddings for draft/active conversation cases. Mirrors
 * customer-service-faq-embed but keeps the FAQ workflow untouched. The
 * environment is pinned server-side; a caller cannot embed another environment.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}
function serviceRoleKey() {
  if (env("SUPABASE_SERVICE_ROLE_KEY")) return env("SUPABASE_SERVICE_ROLE_KEY");
  const raw = env("SUPABASE_SECRET_KEYS");
  const keys = raw ? JSON.parse(raw) as Record<string, string> : {};
  if (!keys.default) throw new Error("missing_service_configuration");
  return keys.default;
}
function deploymentEnvironment() {
  return env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = env("SUPABASE_URL");
    const serviceKey = serviceRoleKey();
    const secret = env("CUSTOMER_SERVICE_REPORT_CRON_SECRET") || env("WATI_ORDER_CRON_SECRET");
    const supplied = request.headers.get("x-cron-secret")?.trim() || "";
    const cronAuthorized = Boolean(secret && supplied && secret === supplied);
    const authorization = request.headers.get("authorization")?.trim() || "";
    if (!cronAuthorized && !/^Bearer\s+\S+/i.test(authorization)) return json({ error: "authentication_required" }, 401);
    if (!cronAuthorized && authorization.replace(/^Bearer\s+/i, "") !== serviceKey) {
      const user = createClient(url, env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await user.rpc("customer_service_edit_access_check");
      if (error) return json({ error: "page_access_required" }, 403);
    }
    let payload: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      payload = parsed;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const environment = deploymentEnvironment();
    if (payload.environment !== undefined && String(payload.environment) !== environment) {
      return json({ error: "environment_mismatch" }, 400);
    }
    const ids = payload.case_ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== "string" || !UUID.test(id)))) {
      return json({ error: "invalid_case_ids" }, 400);
    }
    const caseIds = (ids ?? []) as string[];
    if (payload.force === true && !caseIds.length) return json({ error: "force_requires_case_ids" }, 400);
    const requested = payload.limit === undefined ? 20 : Number(payload.limit);
    if (!Number.isInteger(requested) || requested < 1 || requested > 50) return json({ error: "limit_must_be_1_to_50" }, 400);
    const config = customerServiceEmbeddingConfig();
    if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) return json({ error: "embedding_not_configured" }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await runCaseEmbeddingBackfill({
      db: admin, config, environment, caseIds, force: payload.force === true, limit: requested,
    });
    return json({ ok: result.failed === 0 && result.databaseErrors === 0, environment, ...result });
  } catch (error) {
    const code = error instanceof Error && error.message === "embedding_storage_dimension_mismatch"
      ? error.message : "case_embedding_job_failed";
    console.error("customer-service-case-embed", code);
    return json({ error: code }, 500);
  }
});
