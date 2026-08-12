import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj/ds_super_motorcade";
const SNAPSHOT_AT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT DELIVERY TEAMS TO MAIN";

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

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) return (JSON.parse(keys) as Record<string, string>).default;
  throw new Error("Supabase service credential is unavailable.");
}

const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;
const dateValue = (value: unknown) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await request.json();
    if (body?.confirmation !== CONFIRMATION) {
      return jsonResponse({ error: "Confirmation does not match." }, 403);
    }
    const query = new URLSearchParams({
      limit: "100",
      cursor: "0",
      constraints: JSON.stringify([
        {
          key: "Created Date",
          constraint_type: "less than",
          value: SNAPSHOT_AT,
        },
      ]),
    });
    const bubbleResponse = await fetch(`${SOURCE_URL}?${query}`);
    const payload = await bubbleResponse.json();
    const source = payload?.response?.results;
    if (!bubbleResponse.ok || !Array.isArray(source)) {
      throw new Error("Unable to fetch delivery teams.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Supabase URL is unavailable.");
    const client = createClient(supabaseUrl, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const teams = source.map((record) => {
      if (typeof record._id !== "string" || !record._id) {
        throw new Error("Delivery team is missing _id.");
      }
      return {
        legacy_id: record._id,
        name:
          text(record["Full Name"]) ||
          text(record["Contact person"]) ||
          record._id,
        short_name: text(record["One Word"]),
        contact_person: text(record["Contact person"]),
        contact_number:
          record["contact no."] == null
            ? null
            : String(record["contact no."]),
        status: record.Status == null ? null : String(record.Status),
        is_active: true,
        bubble_created_at: dateValue(record["Created Date"]),
        bubble_modified_at: dateValue(record["Modified Date"]),
      };
    });
    const { data, error } = await client
      .from("delivery_teams")
      .upsert(teams, { onConflict: "legacy_id" })
      .select("id, legacy_id");
    if (error) throw error;

    for (const team of data) {
      const { error: districtError } = await client
        .from("delivery_districts")
        .update({ driver_team_id: team.id })
        .eq("driver_team_legacy_id", team.legacy_id);
      if (districtError) throw districtError;

      const { error: deliveryError } = await client
        .from("deliveries")
        .update({ motorcade_id: team.id })
        .eq("motorcade_legacy_id", team.legacy_id);
      if (deliveryError) throw deliveryError;
    }

    return jsonResponse({
      status: "completed",
      imported: teams.length,
      loginCodesImported: 0,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Delivery team import failed.",
      },
      400,
    );
  }
});
