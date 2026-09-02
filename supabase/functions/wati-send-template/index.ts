import { createClient } from "npm:@supabase/supabase-js@2";
import { watiTemplateByKey } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BROADCAST = "API_Single_Send";
const DEFAULT_HOST = "https://live-mt-server.wati.io";
const DEFAULT_TENANT_ID = "2552";
const DEFAULT_CHANNEL = "85253964335";

type AdminClient = ReturnType<typeof createClient>;

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

export function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (/^[2-9]\d{7}$/.test(digits)) return `852${digits}`;
  if (/^852[2-9]\d{7}$/.test(digits)) return digits;
  if (/^\d{8,15}$/.test(digits)) return digits;
  return null;
}

export function formatWatiDate(value: string) {
  const iso = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(iso)) return iso;
  return null;
}

async function requireSender(request: Request, admin: AdminClient) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw jsonResponse({ error: "missing_authorization" }, 401);
  }
  const token = authorization.slice("Bearer ".length);
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw jsonResponse({ error: "invalid_authorization" }, 401);
  }

  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : null;
  if (role === "Super Admin") return user;

  if (!role) {
    throw jsonResponse({ error: "page_access_required" }, 403);
  }

  const { data, error: permissionError } = await admin
    .from("role_page_permissions")
    .select("page_key,can_access")
    .eq("role", role)
    .in("page_key", ["delivery", "delivery.assign", "settings.wati"]);
  if (permissionError) {
    throw jsonResponse(
      { error: "permission_check_failed", detail: permissionError.message },
      500,
    );
  }
  if (!(data ?? []).some((row) => row.can_access)) {
    throw jsonResponse({ error: "page_access_required" }, 403);
  }
  return user;
}

function parseCustomParams(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ name: string; value: string }>;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const paramValue = record.value == null ? "" : String(record.value).trim();
    if (!name || name.length > 80) return [];
    return [{ name, value: paramValue.slice(0, 500) }];
  }).slice(0, 20);
}

function parsePayload(value: unknown) {
  if (!value || typeof value !== "object") {
    throw jsonResponse({ error: "invalid_payload" }, 400);
  }
  const body = value as Record<string, unknown>;
  const templateKey = typeof body.template === "string" && body.template.trim()
    ? body.template.trim()
    : "driver_assign_reminder";
  const catalog = watiTemplateByKey(templateKey);
  if (!catalog) throw jsonResponse({ error: "unknown_template" }, 400);
  if (!catalog.implemented || !catalog.watiName) {
    throw jsonResponse({ error: "template_not_wired", template: templateKey }, 501);
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const whatsappNumber = normalizeWhatsAppNumber(phone);
  if (!whatsappNumber) throw jsonResponse({ error: "invalid_phone" }, 400);

  const deliveryTeamId =
    typeof body.deliveryTeamId === "string" && body.deliveryTeamId
      ? body.deliveryTeamId
      : null;
  const orderId =
    typeof body.orderId === "string" && body.orderId ? body.orderId : null;

  let customParams = parseCustomParams(body.params);
  if (templateKey === "driver_assign_reminder") {
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const countRaw = body.count;
    const count = typeof countRaw === "number"
      ? String(countRaw)
      : typeof countRaw === "string"
      ? countRaw.trim()
      : customParams.find((item) => item.name === "count")?.value ?? "";
    const dateParam = formatWatiDate(date) ??
      customParams.find((item) => item.name === "date")?.value ??
      null;
    if (!dateParam) throw jsonResponse({ error: "invalid_date" }, 400);
    if (!/^\d+$/.test(count)) throw jsonResponse({ error: "invalid_count" }, 400);
    customParams = [
      { name: "date", value: dateParam },
      { name: "count", value: count },
    ];
  }
  if (!customParams.length) {
    throw jsonResponse({ error: "invalid_params" }, 400);
  }

  return {
    templateKey,
    watiName: catalog.watiName,
    whatsappNumber,
    customParams,
    deliveryTeamId,
    orderId,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    return jsonResponse({ error: "Function is not configured." }, 500);
  }

  try {
    const user = await requireSender(request, admin);
    const payload = parsePayload(await request.json().catch(() => ({})));
    const accessToken = Deno.env.get("WATI_ACCESS_TOKEN")?.trim();
    if (!accessToken) {
      return jsonResponse({ error: "wati_token_missing" }, 503);
    }

    const tenantId = Deno.env.get("WATI_TENANT_ID")?.trim() || DEFAULT_TENANT_ID;
    const channelNumber =
      Deno.env.get("WATI_CHANNEL_NUMBER")?.trim() || DEFAULT_CHANNEL;
    const broadcastName =
      Deno.env.get("WATI_BROADCAST_NAME")?.trim() || DEFAULT_BROADCAST;
    const host = (Deno.env.get("WATI_API_HOST")?.trim() || DEFAULT_HOST)
      .replace(/\/+$/, "");

    const watiBody = {
      template_name: payload.watiName,
      broadcast_name: broadcastName,
      receivers: [
        {
          whatsappNumber: payload.whatsappNumber,
          customParams: payload.customParams,
        },
      ],
      channel_number: channelNumber,
    };

    const watiResponse = await fetch(
      `${host}/${encodeURIComponent(tenantId)}/api/v1/sendTemplateMessages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.replace(/^Bearer\s+/i, "")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(watiBody),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const watiJson = await watiResponse.json().catch(() => null) as {
      result?: boolean;
      errors?: { error?: string } | string;
    } | null;
    const errorText = typeof watiJson?.errors === "string"
      ? watiJson.errors
      : watiJson?.errors && typeof watiJson.errors === "object"
      ? String(watiJson.errors.error ?? "")
      : watiResponse.ok
      ? null
      : `HTTP ${watiResponse.status}`;
    const watiResult = watiJson?.result === true;

    const paramMap = Object.fromEntries(
      payload.customParams.map((item) => [item.name, item.value]),
    );
    await admin.from("wati_message_sends").insert({
      template_name: payload.watiName,
      template_key: payload.templateKey,
      broadcast_name: broadcastName,
      channel_number: channelNumber,
      whatsapp_number: payload.whatsappNumber,
      date_param: paramMap.date ?? null,
      count_param: paramMap.count ?? null,
      params: paramMap,
      delivery_team_id: payload.deliveryTeamId,
      order_id: payload.orderId,
      http_status: watiResponse.status,
      wati_result: watiResult,
      error_text: errorText || null,
      created_by: user.id,
    });

    if (!watiResponse.ok || !watiResult) {
      return jsonResponse({
        error: "wati_send_failed",
        result: watiResult,
        detail: errorText,
      }, 502);
    }

    return jsonResponse({
      status: "sent",
      template: payload.templateKey,
      result: true,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: "wati_send_failed" }, 500);
  }
});
