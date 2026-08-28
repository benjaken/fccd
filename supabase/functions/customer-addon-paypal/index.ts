import {
  adminClient,
  corsHeaders,
  jsonResponse,
  paypalRequest,
  safePublicOrigin,
} from "../_shared/paypal.ts";

type CreateBody = {
  action: "create";
  sessionToken?: string;
  orderId?: string;
  items?: Array<{ productId: string; quantity: number }>;
  origin?: string;
};
type CaptureBody = {
  action: "capture" | "cancel";
  sessionToken?: string;
  checkoutId?: string;
};

type Checkout = {
  checkoutId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  amount: number;
  currency: string;
  requestId: string;
  paypalOrderId: string | null;
  expiresAt: string;
  cutoffAt: string;
};

function paypalCapture(payload: Record<string, unknown>) {
  const units = payload.purchase_units as Array<Record<string, unknown>> | undefined;
  const payments = units?.[0]?.payments as Record<string, unknown> | undefined;
  return (payments?.captures as Array<Record<string, unknown>> | undefined)?.[0] ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const body = await request.json() as CreateBody | CaptureBody;
    const admin = adminClient();
    if (!body.sessionToken) return jsonResponse({ error: "session_required" }, 401);

    if (body.action === "create") {
      if (!body.orderId || !Array.isArray(body.items)) return jsonResponse({ error: "invalid_addon_cart" }, 400);
      const { data, error } = await admin.rpc("customer_self_service_prepare_addon_checkout", {
        p_session_token: body.sessionToken,
        p_order_id: body.orderId,
        p_items: body.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
      });
      if (error || !data) return jsonResponse({ error: error?.message || "checkout_prepare_failed" }, 400);
      const checkout = data as {
        checkoutId: string; requestId: string; amount: number; currency: string; orderNumber: string;
      };
      const origin = safePublicOrigin(request, body.origin);
      const returnUrl = `${origin}/self_service_search?paypal=return&addonCheckout=${encodeURIComponent(checkout.checkoutId)}`;
      const cancelUrl = `${origin}/self_service_search?paypal=cancel&addonCheckout=${encodeURIComponent(checkout.checkoutId)}`;
      const { response, payload } = await paypalRequest(
        "/v2/checkout/orders",
        {
          method: "POST",
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [{
              reference_id: checkout.checkoutId,
              custom_id: checkout.checkoutId,
              invoice_id: `ADDON-${checkout.checkoutId}`,
              description: `Add-on for ${checkout.orderNumber || "catering order"}`,
              amount: { currency_code: checkout.currency, value: Number(checkout.amount).toFixed(2) },
            }],
            payment_source: { paypal: { experience_context: {
              user_action: "PAY_NOW", return_url: returnUrl, cancel_url: cancelUrl,
            } } },
          }),
        },
        checkout.requestId,
      );
      const paypalOrderId = String(payload.id || "");
      if (!response.ok || !paypalOrderId) {
        await admin.from("customer_self_service_addon_checkouts").update({
          status: "failed", failure_code: String(payload.name || "paypal_create_failed"), updated_at: new Date().toISOString(),
        }).eq("id", checkout.checkoutId);
        return jsonResponse({ error: "paypal_create_failed" }, 502);
      }
      const { error: attachError } = await admin.rpc("attach_customer_self_service_paypal_order", {
        p_checkout_id: checkout.checkoutId, p_paypal_order_id: paypalOrderId,
      });
      if (attachError) return jsonResponse({ error: attachError.message }, 409);
      const links = payload.links as Array<{ rel?: string; href?: string }> | undefined;
      const approvalUrl = links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
      if (!approvalUrl) return jsonResponse({ error: "paypal_approval_url_missing" }, 502);
      return jsonResponse({ checkoutId: checkout.checkoutId, paypalOrderId, approvalUrl });
    }

    if (!body.checkoutId) return jsonResponse({ error: "checkout_required" }, 400);
    if (body.action === "cancel") {
      const { data, error } = await admin.rpc("customer_self_service_paypal_checkout", {
        p_session_token: body.sessionToken, p_checkout_id: body.checkoutId,
      });
      if (error || !data) return jsonResponse({ error: error?.message || "checkout_not_found" }, 404);
      const checkout = data as Checkout;
      if (checkout.status === "paypal_created") {
        await admin.from("customer_self_service_addon_checkouts").update({
          status: "cancelled", updated_at: new Date().toISOString(),
        }).eq("id", checkout.checkoutId).eq("status", "paypal_created");
      }
      return jsonResponse({ cancelled: true });
    }
    const { data, error } = await admin.rpc("begin_customer_self_service_addon_capture", {
      p_session_token: body.sessionToken, p_checkout_id: body.checkoutId,
    });
    if (error || !data) return jsonResponse({ error: error?.message || "checkout_not_payable" }, 409);
    if (data.completed) return jsonResponse({ completed: true, checkoutId: data.checkoutId, orderId: data.orderId });
    const checkout = data as Checkout;
    if (checkout.status !== "capture_pending" || !checkout.paypalOrderId) {
      return jsonResponse({ error: "checkout_not_payable" }, 409);
    }

    const { response, payload } = await paypalRequest(
      `/v2/checkout/orders/${encodeURIComponent(checkout.paypalOrderId)}/capture`,
      { method: "POST", body: "{}" },
      `${checkout.requestId}-capture`,
    );
    const capture = paypalCapture(payload);
    if (!response.ok || payload.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
      await admin.from("customer_self_service_addon_checkouts").update({
        status: "paypal_created", failure_code: String(payload.name || "paypal_capture_failed"), updated_at: new Date().toISOString(),
      }).eq("id", checkout.checkoutId).eq("status", "capture_pending");
      return jsonResponse({ error: "paypal_capture_failed", detail: payload.name || payload.message }, 502);
    }
    const amount = capture.amount as { value?: string; currency_code?: string } | undefined;
    const { error: completeError } = await admin.rpc("complete_customer_self_service_addon_checkout", {
      p_checkout_id: checkout.checkoutId,
      p_paypal_order_id: checkout.paypalOrderId,
      p_paypal_capture_id: String(capture.id || ""),
      p_amount: Number(amount?.value),
      p_currency: amount?.currency_code,
      p_captured_at: String(capture.create_time || new Date().toISOString()),
    });
    if (completeError) return jsonResponse({ error: completeError.message }, 409);
    return jsonResponse({ completed: true, checkoutId: checkout.checkoutId, orderId: checkout.orderId });
  } catch (error) {
    console.error("Customer add-on PayPal failure", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "paypal_unavailable" }, 500);
  }
});
