import { createClient } from "npm:@supabase/supabase-js@2";

import { EMAIL_FROM } from "../_shared/email-sender.ts";
import {
  buildEnquiryAckContent,
  buildEnquiryInternalContent,
} from "../_shared/order-notification-content.ts";
import {
  isNotificationEmailAllowed,
  notificationRecipientAllowlist,
} from "../_shared/notification-recipient-allowlist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SubmissionRow = {
  id: string;
  form_id: string;
  form_title: string;
  reference_code: string;
  customer_name: string | null;
  salutation: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  shipping_address: string | null;
  delivery_date_raw: string | null;
  quote_description: string | null;
  headcount: string | null;
  internal_email_status: string;
  ack_email_status: string;
};

type FormRow = {
  ack_email_subject: string | null;
  ack_email_body: string | null;
  public_title: string | null;
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

function validEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
}

async function sendResendEmail(to: string[], subject: string, html: string) {
  const providerResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });
  if (!providerResponse.ok) {
    const payload = await providerResponse.text();
    throw new Error(`email_send_failed:${providerResponse.status}:${payload.slice(0, 1000)}`);
  }
}

async function claimStatus(
  admin: ReturnType<typeof createClient>,
  id: string,
  column: "internal_email_status" | "ack_email_status",
  current: string[],
) {
  const { data } = await admin
    .from("enquiry_submissions")
    .update({ [column]: "sending", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in(column, current)
    .select("id")
    .maybeSingle();
  return Boolean(data?.id);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  try {
    const { submissionId, force = false, kind = "all" } = await request.json().catch(() => ({})) as {
      submissionId?: string;
      force?: boolean;
      kind?: "all" | "internal" | "ack";
    };
    if (!submissionId) return response({ error: "submission_id_required" }, 400);

    const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());
    const { data: submission, error: submissionError } = await admin
      .from("enquiry_submissions")
      .select("id,form_id,form_title,reference_code,customer_name,salutation,company_name,phone,email,shipping_address,delivery_date_raw,quote_description,headcount,internal_email_status,ack_email_status")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError || !submission) return response({ error: "submission_not_found" }, 404);
    const row = submission as SubmissionRow;

    const { data: form } = await admin
      .from("enquiry_forms")
      .select("ack_email_subject,ack_email_body,public_title")
      .eq("id", row.form_id)
      .maybeSingle();
    const formRow = (form || null) as FormRow | null;
    let allowlist: ReturnType<typeof notificationRecipientAllowlist>;
    try {
      allowlist = notificationRecipientAllowlist();
    } catch {
      // Missing staging allowlist must not block the customer acknowledgement.
      allowlist = { phones: new Set(), emails: new Set(), enforced: true };
    }
    const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
    const sendInternal = kind === "all" || kind === "internal";
    const sendAck = kind === "all" || kind === "ack";
    let internalStatus = row.internal_email_status;
    let ackStatus = row.ack_email_status;

    if (sendInternal) {
      const retryable = force
        ? ["not_sent", "sending", "failed"]
        : ["not_sent"];
      if (retryable.includes(internalStatus) && await claimStatus(admin, row.id, "internal_email_status", retryable)) {
        try {
          const { data: recipients, error: recipientError } = await admin.rpc("enquiry_internal_email_recipients");
          if (recipientError) throw recipientError;
          const addresses = [...new Set(
            ((recipients || []) as Array<{ recipient_address?: string }>)
              .map((item) => (item.recipient_address || "").trim())
              .filter((address) => validEmail(address) && isNotificationEmailAllowed(allowlist, address)),
          )];
          if (!addresses.length) {
            internalStatus = "failed";
          } else {
            const mail = buildEnquiryInternalContent({
              formTitle: row.form_title,
              referenceCode: row.reference_code,
              customerName: row.customer_name || "",
              salutation: row.salutation || "",
              companyName: row.company_name || "",
              phone: row.phone || "",
              email: row.email || "",
              address: row.shipping_address || "",
              deliveryDate: row.delivery_date_raw || "",
              headcount: row.headcount || "",
              quoteDescription: row.quote_description || "",
              detailUrl: appUrl ? `${appUrl}/quotes/pending/${row.id}` : "",
            });
            await sendResendEmail(addresses, mail.subject, mail.html);
            internalStatus = "sent";
          }
        } catch {
          internalStatus = "failed";
        }
        await admin.from("enquiry_submissions").update({
          internal_email_status: internalStatus,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    }

    if (sendAck) {
      if (!validEmail(row.email)) {
        if (ackStatus !== "no_email") {
          ackStatus = "no_email";
          await admin.from("enquiry_submissions").update({
            ack_email_status: "no_email",
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
        }
      } else {
        const retryable = force ? ["not_sent", "sending", "failed"] : ["not_sent"];
        if (retryable.includes(ackStatus) && await claimStatus(admin, row.id, "ack_email_status", retryable)) {
          try {
            const mail = buildEnquiryAckContent({
              salutation: row.salutation || "",
              name: row.customer_name || "",
              title: formRow?.public_title || row.form_title,
              subject: formRow?.ack_email_subject || "",
              body: formRow?.ack_email_body || "",
            });
            await sendResendEmail([row.email!.trim()], mail.subject, mail.html);
            ackStatus = "sent";
          } catch {
            ackStatus = "failed";
          }
          await admin.from("enquiry_submissions").update({
            ack_email_status: ackStatus,
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
        }
      }
    }

    return response({
      internalEmailStatus: internalStatus,
      ackEmailStatus: ackStatus,
    });
  } catch (error) {
    return response({
      error: error instanceof Error ? error.message : "enquiry_notification_failed",
    }, 500);
  }
});
