import { createClient } from "npm:@supabase/supabase-js@2";

import { buildConfirmedEnquiryOrderAsanaTask } from "../_shared/enquiry-asana-task.ts";

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

async function callerCanManageQuotes(
  request: Request,
  admin: ReturnType<typeof createClient>,
) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) return false;
  const role = typeof data.user.app_metadata?.role === "string"
    ? data.user.app_metadata.role
    : "";
  if (role === "Super Admin") return true;
  if (!role) return false;
  const { data: permission, error: permissionError } = await admin
    .from("role_page_permissions")
    .select("can_manage")
    .eq("role", role)
    .eq("page_key", "quotes")
    .maybeSingle();
  return !permissionError && permission?.can_manage === true;
}

function safeProviderError(status: number, raw: string) {
  const compact = raw.replace(/\s+/g, " ").slice(0, 500);
  return `asana_create_failed:${status}${compact ? `:${compact}` : ""}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  let submissionId = "";
  try {
    const { orderId } = await request.json().catch(() => ({})) as { orderId?: string };
    if (!orderId) return response({ error: "order_id_required" }, 400);

    const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());
    if (!await callerCanManageQuotes(request, admin)) {
      return response({ error: "quotes_manage_required" }, 403);
    }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,source_quote_id,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,grand_total,currency,quote_description_snapshot,asana_link")
      .eq("id", orderId)
      .eq("document_type", "order")
      .is("archived_at", null)
      .maybeSingle();
    if (orderError || !order) return response({ error: "confirmed_order_not_found" }, 404);
    if (!order.source_quote_id) return response({ status: "not_enquiry_order" });

    const { data: sourceQuote, error: quoteError } = await admin
      .from("orders")
      .select("id,enquiry_submission_id,asana_link")
      .eq("id", order.source_quote_id)
      .maybeSingle();
    if (quoteError || !sourceQuote?.enquiry_submission_id) {
      return response({ status: "not_enquiry_order" });
    }
    submissionId = sourceQuote.enquiry_submission_id;

    const { data: submission, error: submissionError } = await admin
      .from("enquiry_submissions")
      .select("id,form_id,reference_code,customer_name,salutation,company_name,phone,email,shipping_address,delivery_date,delivery_time,quote_description,asana_status,asana_link")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError || !submission) return response({ error: "enquiry_not_found" }, 404);

    const existingLink = submission.asana_link || order.asana_link || sourceQuote.asana_link;
    if (existingLink) {
      await Promise.all([
        admin.from("orders").update({ asana_link: existingLink }).in("id", [sourceQuote.id, order.id]),
        admin.from("enquiry_submissions").update({
          asana_status: "created",
          asana_link: existingLink,
          asana_error: null,
        }).eq("id", submission.id),
      ]);
      return response({ status: "created", permalinkUrl: existingLink, existing: true });
    }

    const { data: claimed } = await admin
      .from("enquiry_submissions")
      .update({ asana_status: "creating", asana_error: null, updated_at: new Date().toISOString() })
      .eq("id", submission.id)
      .is("asana_link", null)
      .in("asana_status", ["not_created", "failed"])
      .select("id")
      .maybeSingle();
    if (!claimed) return response({ status: "creating" }, 202);

    const { data: form } = await admin
      .from("enquiry_forms")
      .select("asana_project_gid")
      .eq("id", submission.form_id)
      .maybeSingle();
    const projectGid = form?.asana_project_gid?.trim()
      || Deno.env.get("ASANA_DEFAULT_PROJECT_GID")?.trim();
    if (!projectGid) throw new Error("missing_asana_default_project_gid");

    const task = buildConfirmedEnquiryOrderAsanaTask({
      orderId: order.id,
      orderNumber: order.order_number || order.id,
      customerName: order.customer_name_snapshot || submission.customer_name,
      companyName: order.company_name_snapshot || submission.company_name,
      phone: order.contact_number_a_snapshot || submission.phone,
      email: order.email_snapshot || submission.email,
      address: order.shipping_address_snapshot || submission.shipping_address,
      deliveryAt: order.delivery_at || submission.delivery_date,
      deliveryTime: order.delivery_time || submission.delivery_time,
      amount: order.grand_total,
      currency: order.currency,
      enquiryReference: submission.reference_code,
      description: order.quote_description_snapshot || submission.quote_description,
      appUrl: Deno.env.get("APP_URL"),
    });
    const asanaResponse = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("ASANA_ACCESS_TOKEN").replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name: task.name,
          notes: task.notes,
          projects: [projectGid],
          ...(task.due_on ? { due_on: task.due_on } : {}),
        },
      }),
    });
    const raw = await asanaResponse.text();
    if (!asanaResponse.ok) throw new Error(safeProviderError(asanaResponse.status, raw));
    const payload = JSON.parse(raw) as { data?: { gid?: string; permalink_url?: string } };
    const taskGid = payload.data?.gid?.trim();
    const permalinkUrl = payload.data?.permalink_url?.trim()
      || (taskGid ? `https://app.asana.com/0/0/${taskGid}` : "");
    if (!taskGid || !permalinkUrl) throw new Error("asana_response_invalid");

    const { error: submissionUpdateError } = await admin
      .from("enquiry_submissions")
      .update({
        asana_status: "created",
        asana_link: permalinkUrl,
        asana_task_gid: taskGid,
        asana_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.id);
    if (submissionUpdateError) throw submissionUpdateError;
    await admin.from("orders").update({ asana_link: permalinkUrl }).in("id", [sourceQuote.id, order.id]);

    return response({ status: "created", permalinkUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "asana_create_failed";
    if (submissionId) {
      try {
        const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());
        await admin.from("enquiry_submissions").update({
          asana_status: "failed",
          asana_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("id", submissionId).is("asana_link", null);
      } catch {
        // Preserve the original provider/configuration failure.
      }
    }
    console.error("confirmed enquiry order Asana creation failed", message);
    return response({ error: "asana_create_failed" }, 502);
  }
});
