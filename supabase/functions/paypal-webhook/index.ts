import {
  adminClient,
  jsonResponse,
  paypalRequest,
  requiredEnv,
} from "../_shared/paypal.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const raw = await request.text();
  let event: Record<string, unknown>;
  try { event = JSON.parse(raw) as Record<string, unknown>; }
  catch { return jsonResponse({ error: "invalid_json" }, 400); }

  try {
    const { response: verifyResponse, payload: verification } = await paypalRequest(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          transmission_id: request.headers.get("paypal-transmission-id"),
          transmission_time: request.headers.get("paypal-transmission-time"),
          cert_url: request.headers.get("paypal-cert-url"),
          auth_algo: request.headers.get("paypal-auth-algo"),
          transmission_sig: request.headers.get("paypal-transmission-sig"),
          webhook_id: requiredEnv("PAYPAL_WEBHOOK_ID"),
          webhook_event: event,
        }),
      },
    );
    if (!verifyResponse.ok || verification.verification_status !== "SUCCESS") {
      return jsonResponse({ error: "invalid_webhook_signature" }, 400);
    }

    const admin = adminClient();
    const eventId = String(event.id || "");
    const eventType = String(event.event_type || "");
    if (!eventId || !eventType) return jsonResponse({ error: "invalid_webhook_event" }, 400);
    const resource = (event.resource || {}) as Record<string, unknown>;
    const related = ((resource.supplementary_data || {}) as Record<string, unknown>).related_ids as Record<string, unknown> | undefined;
    const paypalOrderId = String(related?.order_id || "") || null;
    const captureId = String(resource.id || "") || null;
    const { error: insertError } = await admin.from("paypal_webhook_events").insert({
      event_id: eventId, event_type: eventType, paypal_order_id: paypalOrderId,
      paypal_capture_id: captureId, payload: event,
    });
    if (insertError?.code === "23505") return jsonResponse({ received: true, duplicate: true });
    if (insertError) throw insertError;

    if (eventType === "PAYMENT.CAPTURE.COMPLETED" && paypalOrderId && captureId) {
      const { data: checkout } = await admin.from("customer_self_service_addon_checkouts")
        .select("id").eq("paypal_order_id", paypalOrderId).maybeSingle();
      if (checkout) {
        const amount = resource.amount as { value?: string; currency_code?: string } | undefined;
        const { error } = await admin.rpc("complete_customer_self_service_addon_checkout", {
          p_checkout_id: checkout.id,
          p_paypal_order_id: paypalOrderId,
          p_paypal_capture_id: captureId,
          p_amount: Number(amount?.value),
          p_currency: amount?.currency_code,
          p_captured_at: String(resource.create_time || event.create_time || new Date().toISOString()),
        });
        if (error) throw error;
      }
    } else if (["PAYMENT.CAPTURE.REVERSED", "PAYMENT.CAPTURE.REFUNDED"].includes(eventType) && captureId) {
      const { error } = await admin.rpc("reverse_customer_self_service_addon_checkout", {
        p_paypal_capture_id: captureId,
      });
      if (error) throw error;
    }
    await admin.from("paypal_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return jsonResponse({ received: true });
  } catch (error) {
    console.error("PayPal webhook failure", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "webhook_failed" }, 500);
  }
});
