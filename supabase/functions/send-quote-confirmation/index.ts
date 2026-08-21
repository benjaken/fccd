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

function digits(value: string | null) {
  const normalized = (value || "").replace(/\D/g, "");
  return normalized.length === 8 ? `852${normalized}` : normalized;
}

function html(value: string | null) {
  return (value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
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

    const { orderId } = await request.json() as { orderId?: string };
    if (!orderId) return response({ error: "order_id_required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey());
    const { data: quote, error: quoteError } = await admin
      .from("orders")
      .select("id,order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,grand_total,currency")
      .eq("id", orderId)
      .in("document_type", ["quote", "unconfirmed"])
      .is("archived_at", null)
      .single();
    if (quoteError || !quote) return response({ error: "quote_not_found" }, 404);

    const phone = digits(quote.contact_number_a_snapshot);
    if (!phone || !quote.email_snapshot) {
      return response({ error: "quote_contact_missing", watiSent: false, emailSent: false }, 400);
    }

    const customerName = quote.customer_name_snapshot || quote.company_name_snapshot || "Customer";
    const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
    const pdfUrl = `${appUrl}/quotes/${quote.id}/pdf`;
    const watiEndpoint = requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "");
    const watiTemplate = requiredEnv("WATI_TEMPLATE_NAME");
    const watiResponse = await fetch(
      `${watiEndpoint}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requiredEnv("WATI_API_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_name: watiTemplate,
          broadcast_name: Deno.env.get("WATI_BROADCAST_NAME")?.trim() || "quote_confirmation",
          channel_number: requiredEnv("WATI_CHANNEL_NUMBER"),
          parameters: [
            { name: "customer_name", value: customerName },
            { name: "quote_number", value: quote.order_number || "" },
            { name: "pdf_url", value: pdfUrl },
          ],
        }),
      },
    );
    if (!watiResponse.ok) {
      return response({ error: "wati_send_failed", watiSent: false, emailSent: false }, 502);
    }

    const formattedTotal = new Intl.NumberFormat("zh-HK", {
      style: "currency", currency: quote.currency || "HKD",
    }).format(Number(quote.grand_total) || 0);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: requiredEnv("QUOTE_EMAIL_FROM"),
        to: [quote.email_snapshot],
        subject: `報價確認 ${quote.order_number || ""}`.trim(),
        html: `<p>${html(customerName)} 您好：</p><p>報價單 <strong>${html(quote.order_number)}</strong> 已準備好，總額為 <strong>${html(formattedTotal)}</strong>。</p><p><a href="${html(pdfUrl)}">查看報價單 PDF</a></p>`,
      }),
    });
    if (!emailResponse.ok) {
      return response({ error: "email_send_failed", watiSent: true, emailSent: false }, 502);
    }

    return response({ watiSent: true, emailSent: true });
  } catch (error) {
    return response({
      error: error instanceof Error ? error.message : "quote_confirmation_failed",
      watiSent: false,
      emailSent: false,
    }, 500);
  }
});
