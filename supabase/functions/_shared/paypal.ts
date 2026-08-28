import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}

export function adminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function paypalBaseUrl() {
  const configured = Deno.env.get("PAYPAL_BASE_URL")?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return Deno.env.get("PAYPAL_ENVIRONMENT")?.trim().toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export async function paypalAccessToken() {
  const credentials = btoa(`${requiredEnv("PAYPAL_CLIENT_ID")}:${requiredEnv("PAYPAL_CLIENT_SECRET")}`);
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error || "paypal_auth_failed");
  return payload.access_token;
}

export async function paypalRequest(
  path: string,
  init: RequestInit = {},
  requestId?: string,
) {
  const token = await paypalAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (requestId) headers.set("PayPal-Request-Id", requestId);
  const response = await fetch(`${paypalBaseUrl()}${path}`, { ...init, headers });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
  catch { payload = { message: raw.slice(0, 1000) }; }
  return { response, payload };
}

export function safePublicOrigin(request: Request, supplied?: string) {
  const configured = Deno.env.get("SELF_SERVICE_PUBLIC_URL")?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const candidate = request.headers.get("Origin") || supplied?.trim() || "";
  try {
    const url = new URL(candidate);
    const allowedHost = url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname.endsWith(".vercel.app")
      || url.hostname === "foodchannels-delivery.com"
      || url.hostname.endsWith(".foodchannels-delivery.com");
    if (allowedHost && (url.protocol === "https:" || url.protocol === "http:")) {
      return url.origin;
    }
  } catch { /* invalid caller origin */ }
  throw new Error("invalid_self_service_origin");
}
