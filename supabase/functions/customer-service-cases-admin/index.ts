import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseCustomerServiceCaseInput,
  type CustomerServiceCaseInput,
  type NormalizedCustomerServiceCase,
} from "../_shared/customer-service-cases.ts";

/**
 * Phase-1 controlled case management command. Schema and status invariants are
 * enforced by database triggers; this function adds authorization, environment
 * pinning and idempotent draft import. It never embeds and never activates a
 * case whose embedding is not ready.
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
function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}
function serviceRoleKey() {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const configured = env("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}
function deploymentEnvironment() {
  return env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop");
}

type AdminClient = ReturnType<typeof createClient>;

/** Returns the authenticated reviewer id, or null for cron/service callers. */
async function authorize(request: Request, admin: AdminClient): Promise<string | null> {
  const configuredSecret = firstEnv("CUSTOMER_SERVICE_REPORT_CRON_SECRET", "WATI_ORDER_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret")?.trim() || "";
  const authorization = request.headers.get("authorization")?.trim() || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  if (configuredSecret && suppliedSecret === configuredSecret) return null;
  if (bearer && bearer === serviceRoleKey()) return null;
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("authentication_required");
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user) throw new Error("authentication_required");
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await userClient.rpc("customer_service_edit_access_check");
  if (accessError) throw new Error("page_access_required");
  return data.user.id;
}

function contentColumns(row: Record<string, unknown>) {
  return {
    title: row.title,
    scenario_context: row.scenario_context,
    known_information: row.known_information,
    missing_information: row.missing_information,
    conversation_excerpt: row.conversation_excerpt,
    response_strategy: row.response_strategy,
    applicability: row.applicability,
  };
}

function sameContent(existing: Record<string, unknown>, value: NormalizedCustomerServiceCase) {
  return JSON.stringify(contentColumns(existing)) === JSON.stringify({
    title: value.title, scenario_context: value.scenario_context,
    known_information: value.known_information, missing_information: value.missing_information,
    conversation_excerpt: value.conversation_excerpt, response_strategy: value.response_strategy,
    applicability: value.applicability,
  });
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

    if (action === "dry_run" || action === "upsert") {
      const parsed = parseCustomerServiceCaseInput(body.case as CustomerServiceCaseInput, { expectedEnvironment: environment });
      if (!parsed.ok) return json({ ok: false, action, errors: parsed.errors }, 422);
      if (action === "dry_run") {
        return json({ ok: true, action, environment, fingerprint: parsed.value.source_fingerprint, case: parsed.value });
      }
      const { data: existing, error: selectError } = await admin
        .from("customer_service_cases").select("*")
        .eq("environment", environment).eq("source_fingerprint", parsed.value.source_fingerprint)
        .maybeSingle();
      if (selectError) throw selectError;
      const payload = { ...parsed.value, status: "draft" as const };
      if (existing && sameContent(existing as Record<string, unknown>, parsed.value)) {
        return json({ ok: true, action, id: existing.id, changed: false, status: existing.status });
      }
      if (existing) {
        const { data, error } = await admin.from("customer_service_cases")
          .update(payload).eq("id", existing.id).select("id, status, revision").single();
        if (error) throw error;
        return json({ ok: true, action, id: data.id, changed: true, status: data.status, revision: data.revision });
      }
      const { data, error } = await admin.from("customer_service_cases")
        .insert(payload).select("id, status, revision").single();
      if (error) throw error;
      return json({ ok: true, action, id: data.id, changed: true, status: data.status, revision: data.revision });
    }

    if (action === "activate" || action === "retire") {
      const caseId = String(body.case_id ?? "").trim();
      if (!UUID.test(caseId)) return json({ error: "invalid_case_id" }, 400);
      const { data: current, error: readError } = await admin
        .from("customer_service_cases").select("id, status, environment").eq("id", caseId).maybeSingle();
      if (readError) throw readError;
      if (!current) return json({ error: "case_not_found" }, 404);
      if (current.environment !== environment) return json({ error: "environment_mismatch" }, 400);
      if (action === "activate") {
        if (!actorId) return json({ error: "reviewer_required" }, 403);
        const { data, error } = await admin.from("customer_service_cases")
          .update({ status: "active", reviewed_by: actorId })
          .eq("id", caseId).select("id, status, revision").single();
        if (error) {
          const message = String(error.message || "");
          return json({ ok: false, error: message.includes("not_ready_to_activate")
            ? "case_not_ready_to_activate" : "case_activation_failed" }, 409);
        }
        return json({ ok: true, action, id: data.id, status: data.status });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      const { data, error } = await admin.from("customer_service_cases")
        .update({ status: "retired", retired_reason: reason || null })
        .eq("id", caseId).select("id, status").single();
      if (error) throw error;
      return json({ ok: true, action, id: data.id, status: data.status });
    }

    if (action === "list") {
      const limit = Math.max(1, Math.min(200, Number(body.limit) || 50));
      const { data, error } = await admin.from("customer_service_cases")
        .select("id, revision, title, status, provenance, outcome, embedding_status, is_synthetic, applicability, created_at, updated_at, reviewed_at, retired_at")
        .eq("environment", environment).order("updated_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ ok: true, action, environment, cases: data ?? [] });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "authentication_required" ? 401
      : message === "page_access_required" ? 403 : 500;
    console.error("customer-service-cases-admin", message.slice(0, 200));
    return json({ error: "customer_service_cases_admin_failed", detail: message.slice(0, 200) }, status);
  }
});
