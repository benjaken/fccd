import { createClient } from "npm:@supabase/supabase-js@2";
import {
  translateLocationToTraditionalChinese,
  type LocationTranslationKind,
} from "../_shared/location-translation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("authentication_required");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error("authentication_required");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    await requireAuthenticatedUser(request);
    const body = await request.json() as { address?: unknown; text?: unknown; kind?: unknown };
    const source = typeof body.text === "string" ? body.text : body.address;
    const kind: LocationTranslationKind = body.kind === "district" ? "district" : "address";
    if (typeof source !== "string" || !source.trim() || source.length > 800) {
      return jsonResponse({ error: "invalid_address" }, 400);
    }
    const translatedText = await translateLocationToTraditionalChinese(source, kind);
    return jsonResponse({ translatedText, translatedAddress: translatedText });
  } catch (error) {
    const message = error instanceof Error ? error.message : "address_translation_failed";
    return jsonResponse({ error: message }, message === "authentication_required" ? 401 : 502);
  }
});
