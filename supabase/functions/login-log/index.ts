import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVENT_TYPES = [
  "login_success",
  "login_failure",
  "logout",
  "password_reset_request",
  "password_change",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
}

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    secretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

async function writeLoginLog(
  admin: AdminClient,
  row: {
    eventType: EventType;
    email: string | null;
    userId: string | null;
    userName: string | null;
    role: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    errorCode: string | null;
  },
) {
  // Continuous logins without logout: keep a single latest success row.
  if (row.eventType === "login_success" && (row.userId || row.email)) {
    let latestQuery = admin
      .from("login_logs")
      .select("id,event_type")
      .order("created_at", { ascending: false })
      .limit(1);
    if (row.userId) {
      latestQuery = latestQuery.eq("user_id", row.userId);
    } else if (row.email) {
      latestQuery = latestQuery.ilike("email", row.email);
    }
    const { data: latest, error: latestError } = await latestQuery.maybeSingle();
    if (latestError) {
      throw jsonResponse(
        { error: "login_log_lookup_failed", detail: latestError.message },
        500,
      );
    }
    if (latest?.event_type === "login_success") {
      const { error: updateError } = await admin
        .from("login_logs")
        .update({
          email: row.email,
          user_id: row.userId,
          user_name: row.userName,
          role: row.role,
          ip_address: row.ipAddress,
          user_agent: row.userAgent,
          error_code: row.errorCode,
          created_at: new Date().toISOString(),
        })
        .eq("id", latest.id);
      if (updateError) {
        throw jsonResponse(
          { error: "login_log_write_failed", detail: updateError.message },
          500,
        );
      }
      return { ok: true, replaced: true };
    }
  }

  const { error } = await admin.from("login_logs").insert({
    event_type: row.eventType,
    email: row.email,
    user_id: row.userId,
    user_name: row.userName,
    role: row.role,
    ip_address: row.ipAddress,
    user_agent: row.userAgent,
    error_code: row.errorCode,
  });
  if (error) {
    throw jsonResponse(
      { error: "login_log_write_failed", detail: error.message },
      500,
    );
  }
  return { ok: true, replaced: false };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const eventType =
      typeof body.eventType === "string" ? body.eventType.trim() : "";
    if (!isEventType(eventType)) {
      return jsonResponse({ error: "invalid_event_type" }, 400);
    }

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase().slice(0, 320)
        : null;
    const userId =
      typeof body.userId === "string" && body.userId
        ? body.userId
        : null;
    const errorCode =
      typeof body.errorCode === "string"
        ? body.errorCode.trim().slice(0, 120)
        : null;

    const admin = createAdminClient();
    let userName: string | null = null;
    let role: string | null = null;
    let resolvedUserId = userId;

    if (resolvedUserId) {
      const { data: profile } = await admin
        .from("user_profiles")
        .select("user_name,role,email")
        .eq("id", resolvedUserId)
        .maybeSingle();
      if (profile) {
        userName = profile.user_name ?? null;
        role = profile.role ?? null;
      }
    } else if (email) {
      const { data: profile } = await admin
        .from("user_profiles")
        .select("id,user_name,role")
        .eq("email", email)
        .maybeSingle();
      if (profile) {
        resolvedUserId = profile.id;
        userName = profile.user_name ?? null;
        role = profile.role ?? null;
      }
    }

    // Prefer authenticated caller identity for success/logout when present.
    const authorization = request.headers.get("Authorization");
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length);
      const {
        data: { user },
      } = await admin.auth.getUser(token);
      if (user) {
        resolvedUserId = resolvedUserId || user.id;
        role =
          role ||
          (typeof user.app_metadata?.role === "string"
            ? user.app_metadata.role
            : null);
      }
    }

    const result = await writeLoginLog(admin, {
      eventType,
      email: email || null,
      userId: resolvedUserId,
      userName,
      role,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
      errorCode,
    });

    return jsonResponse(result, result.replaced ? 200 : 201);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse(
      {
        error: "login_log_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
