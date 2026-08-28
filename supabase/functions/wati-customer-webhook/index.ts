import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

function digits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").replace(/^00/, "") : "";
}

function occurredAt(payload: Record<string, unknown>) {
  if (typeof payload.created === "string" && !Number.isNaN(Date.parse(payload.created))) {
    return new Date(payload.created).toISOString();
  }
  const seconds = Number(payload.timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function isWatiSamplePayload(payload: Record<string, unknown>) {
  const id = String(payload.id || "");
  const whatsappMessageId = String(payload.whatsappMessageId || "");
  const waId = String(payload.waId || "");
  return id === "message.Id"
    || whatsappMessageId === "message.WhatsappMessageId"
    || waId === "senderPhone";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = new URL(request.url);
    const suppliedSecret = request.headers.get("x-wati-webhook-secret") || url.searchParams.get("secret") || "";
    if (suppliedSecret !== requiredEnv("WATI_WEBHOOK_SECRET")) {
      return json({ error: "unauthorized" }, 401);
    }

    const payload = await request.json() as Record<string, unknown>;
    const eventType = String(payload.eventType || "");
    if (isWatiSamplePayload(payload)) {
      return json({ received: true, sample: true });
    }
    const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());
    const providerMessageId = String(payload.localMessageId || payload.whatsappMessageId || payload.id || "");

    if (/delivered/i.test(eventType) || /read/i.test(eventType) || /failed/i.test(eventType)) {
      if (providerMessageId) {
        await admin.from("order_timeline_entries").update({
          delivery_status: String(payload.statusString || eventType).toLowerCase(),
          bubble_modified_at: new Date().toISOString(),
        }).eq("provider_message_id", providerMessageId);
      }
      return json({ received: true });
    }

    if (eventType !== "message" || payload.owner === true) return json({ received: true, ignored: true });
    const phone = digits(payload.waId);
    if (!phone || !providerMessageId) return json({ error: "message_identity_missing" }, 400);

    const text = typeof payload.text === "string" && payload.text.trim()
      ? payload.text.trim()
      : `[${String(payload.type || "WhatsApp attachment")}]`;
    const localPhone = phone.startsWith("852") ? phone.slice(3) : phone;
    const { data: orders } = await admin
      .from("orders")
      .select("id,email_snapshot")
      .or(`contact_number_a_snapshot.ilike.%${localPhone}%,contact_number_b_snapshot.ilike.%${localPhone}%`)
      .is("archived_at", null)
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const order = orders?.[0] || null;
    const timestamp = occurredAt(payload);
    const { error } = await admin.from("order_timeline_entries").upsert({
      legacy_id: `wati-inbound-${String(payload.id || providerMessageId)}`,
      order_id: order?.id || null,
      category: "wati",
      comment: text,
      customer_email_snapshot: order?.email_snapshot || null,
      customer_phone_snapshot: phone,
      author_name_snapshot: String(payload.senderName || "Customer"),
      communication_channel: "wati",
      message_direction: "inbound",
      provider_message_id: providerMessageId,
      provider_conversation_id: payload.conversationId || null,
      delivery_status: String(payload.statusString || "received").toLowerCase(),
      bubble_created_at: timestamp,
      bubble_modified_at: new Date().toISOString(),
    }, { onConflict: "provider_message_id", ignoreDuplicates: true });
    if (error) return json({ error: "message_log_failed" }, 500);
    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "wati_webhook_failed" }, 500);
  }
});
