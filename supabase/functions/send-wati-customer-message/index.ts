import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
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

async function providerJson(providerResponse: Response) {
  const raw = await providerResponse.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { message: raw.slice(0, 1000) };
  }
}

function safeProviderFailure(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  return {
    result: payload.result,
    info: payload.info,
    error: payload.error,
    message: payload.message,
  };
}

export function normalizeWhatsAppNumber(value: string | null | undefined) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length === 8 ? `852${digits}` : digits;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const authClient = createClient(supabaseUrl, requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return response({ error: "unauthorized" }, 401);

    const { orderId, body } = await request.json() as { orderId?: string; body?: string };
    const text = body?.trim() || "";
    if (!orderId) return response({ error: "order_id_required" }, 400);
    if (!text) return response({ error: "message_required" }, 400);
    if (text.length > 4096) return response({ error: "message_too_long" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey());
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,document_type,email_snapshot,contact_number_a_snapshot,contact_number_b_snapshot")
      .eq("id", orderId)
      .is("archived_at", null)
      .single();
    if (orderError || !order) return response({ error: "order_not_found" }, 404);

    const phone = normalizeWhatsAppNumber(
      order.contact_number_a_snapshot || order.contact_number_b_snapshot,
    );
    if (!phone) return response({ error: "customer_phone_missing" }, 400);

    const localMessageId = crypto.randomUUID();
    const endpoint = requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "");
    const query = new URLSearchParams({
      messageText: text,
      localMessageId,
      channelPhoneNumber: requiredEnv("WATI_CHANNEL_NUMBER"),
    });
    const providerResponse = await fetch(
      `${endpoint}/api/v1/sendSessionMessage/${encodeURIComponent(phone)}?${query}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${requiredEnv("WATI_API_TOKEN")}` },
      },
    );
    const providerPayload = await providerJson(providerResponse);
    if (!providerResponse.ok || providerPayload?.result === false) {
      console.error("WATI session message rejected", {
        status: providerResponse.status,
        phoneSuffix: phone.slice(-4),
        provider: safeProviderFailure(providerPayload),
      });
      return response({ error: "wati_send_failed", detail: providerPayload }, 502);
    }

    const providerMessageId = String(
      providerPayload?.whatsappMessageId || providerPayload?.messageId || providerPayload?.id || localMessageId,
    );
    const now = new Date().toISOString();
    const authorName = authData.user.user_metadata?.user_name || authData.user.email || null;
    const { data: saved, error: saveError } = await admin
      .from("order_timeline_entries")
      .insert({
        legacy_id: `wati-outbound-${localMessageId}`,
        order_id: order.id,
        category: "wati",
        comment: text,
        customer_email_snapshot: order.email_snapshot,
        customer_phone_snapshot: phone,
        author_name_snapshot: authorName,
        communication_channel: "wati",
        message_direction: "outbound",
        provider_message_id: providerMessageId,
        provider_conversation_id: providerPayload?.conversationId || null,
        delivery_status: "accepted",
        bubble_created_at: now,
        bubble_modified_at: now,
      })
      .select("id,created_at")
      .single();
    if (saveError || !saved) return response({ error: "wati_message_log_failed" }, 500);

    return response({
      message: {
        id: saved.id,
        tab: "note",
        body: text,
        authorName,
        replyEmail: null,
        orderNumber: order.order_number,
        orderId: order.id,
        documentType: order.document_type,
        createdAt: saved.created_at,
        direction: "outbound",
        status: "accepted",
      },
    });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "wati_customer_message_failed" }, 500);
  }
});
