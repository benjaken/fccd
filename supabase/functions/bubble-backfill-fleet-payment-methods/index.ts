import { createClient } from "npm:@supabase/supabase-js@2";

const BUBBLE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj/ds_super_motorcade";
const CONFIRMATION = "BACKFILL_DELIVERY_TEAM_PAYMENT_METHODS";
const PAGE_SIZE = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
}

type BubbleFleet = {
  _id?: unknown;
  "payment method(text)"?: unknown;
};

async function authenticateAdmin(request: Request, client: ReturnType<typeof createClient>) {
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return false;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return false;
  return ["Super Admin", "Admin"].includes(
    String(data.user.app_metadata?.role ?? ""),
  );
}

async function fetchBubbleFleets(token: string) {
  const records: BubbleFleet[] = [];
  let cursor = 0;
  while (true) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      cursor: String(cursor),
    });
    const response = await fetch(`${BUBBLE_URL}?${query}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => null);
    const page = payload?.response?.results;
    const remaining = Number(payload?.response?.remaining ?? Number.NaN);
    if (!response.ok || !Array.isArray(page) || !Number.isFinite(remaining)) {
      throw new Error(`Bubble fleet fetch failed with HTTP ${response.status}.`);
    }
    records.push(...page);
    if (remaining <= 0) return records;
    if (page.length === 0) throw new Error("Bubble fleet pagination stalled.");
    cursor += page.length;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== CONFIRMATION) {
      return jsonResponse({ error: "Invalid confirmation." }, 400);
    }
    const client = createClient(requiredEnv("SUPABASE_URL"), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (!(await authenticateAdmin(request, client))) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const records = await fetchBubbleFleets(requiredEnv("BUBBLE_API_TOKEN"));
    let sourceWithPaymentMethod = 0;
    let updated = 0;
    let unmatched = 0;
    for (const record of records) {
      const legacyId = String(record._id ?? "").trim();
      const paymentMethod = String(record["payment method(text)"] ?? "").trim();
      if (!legacyId || !paymentMethod) continue;
      sourceWithPaymentMethod += 1;
      const { data: existing, error: existingError } = await client
        .from("delivery_teams")
        .select("id,bank_account")
        .eq("legacy_id", legacyId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        unmatched += 1;
        continue;
      }
      if (String(existing.bank_account ?? "").trim()) continue;
      const { data, error } = await client
        .from("delivery_teams")
        .update({ bank_account: paymentMethod, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id");
      if (error) throw error;
      if (data?.length) updated += data.length;
    }

    return jsonResponse({
      status: "completed",
      fetched: records.length,
      sourceWithPaymentMethod,
      updated,
      unmatched,
    });
  } catch (error) {
    return jsonResponse({
      status: "failed",
      error: error instanceof Error ? error.message : "Backfill failed.",
    }, 500);
  }
});
