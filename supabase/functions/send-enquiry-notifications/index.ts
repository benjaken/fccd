import { createClient } from "npm:@supabase/supabase-js@2";

import { EMAIL_FROM } from "../_shared/email-sender.ts";
import {
  buildEnquiryAckContent,
  buildEnquiryInternalContent,
  buildEnquiryInternalWatiParameters,
  ENQUIRY_INTERNAL_WATI_TEMPLATE,
  enquiryPendingDetailUrl,
} from "../_shared/enquiry-notification-content.ts";
import {
  isNotificationEmailAllowed,
  isNotificationPhoneAllowed,
  normalizeNotificationPhone,
  notificationRecipientAllowlist,
} from "../_shared/notification-recipient-allowlist.ts";
import { watiEmergencySwitchAllows } from "../_shared/wati-notification-controls.ts";

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
  internal_wati_status: string;
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

async function sendEnquiryInternalWati(
  allowlist: ReturnType<typeof notificationRecipientAllowlist>,
  phone: string,
  parameters: Array<{ name: string; value: string }>,
) {
  if (!isNotificationPhoneAllowed(allowlist, phone)) {
    throw new Error("notification_recipient_not_allowlisted");
  }
  const templateName = Deno.env.get("WATI_ENQUIRY_INTERNAL_TEMPLATE_NAME")?.trim()
    || ENQUIRY_INTERNAL_WATI_TEMPLATE;
  const broadcastName = Deno.env.get("WATI_ENQUIRY_INTERNAL_BROADCAST_NAME")?.trim()
    || ENQUIRY_INTERNAL_WATI_TEMPLATE;
  const token = requiredEnv("WATI_API_TOKEN").replace(/^Bearer\s+/i, "");
  const endpoint = requiredEnv("WATI_API_ENDPOINT").replace(/\/$/, "");
  const providerResponse = await fetch(
    `${endpoint}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: broadcastName,
        channel_number: requiredEnv("WATI_CHANNEL_NUMBER"),
        parameters,
      }),
    },
  );
  const raw = await providerResponse.text();
  const payload = (() => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return raw ? { raw: raw.slice(0, 300) } : null;
    }
  })();
  const reportedFailure = payload && typeof payload === "object"
    && (payload as { result?: unknown }).result === false;
  if (!providerResponse.ok || reportedFailure) {
    let host = "invalid_endpoint";
    try {
      host = new URL(endpoint).host;
    } catch {
      host = "invalid_endpoint";
    }
    throw new Error(
      `wati_send_failed:${providerResponse.status}:${host}:bodyLen=${raw.length}:${JSON.stringify(payload).slice(0, 800)}`,
    );
  }
}

async function claimStatus(
  admin: ReturnType<typeof createClient>,
  id: string,
  column: "internal_email_status" | "internal_wati_status" | "ack_email_status",
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
    if (force && !await callerCanManageQuotes(request, admin)) {
      return response({ error: "quotes_manage_required" }, 403);
    }
    const { data: submission, error: submissionError } = await admin
      .from("enquiry_submissions")
      .select("id,form_id,form_title,reference_code,customer_name,salutation,company_name,phone,email,shipping_address,delivery_date_raw,quote_description,headcount,internal_email_status,internal_wati_status,ack_email_status")
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
    } catch (allowlistError) {
      // Missing staging allowlist must not block internal staff or the customer acknowledgement.
      console.error("enquiry notification allowlist unavailable", allowlistError);
      allowlist = { phones: new Set(), emails: new Set(), enforced: false };
    }
    const detailUrl = enquiryPendingDetailUrl(Deno.env.get("APP_URL"), row.id);
    const sendInternal = kind === "all" || kind === "internal";
    const sendAck = kind === "all" || kind === "ack";
    let internalStatus = row.internal_email_status;
    let internalWatiStatus = row.internal_wati_status;
    let ackStatus = row.ack_email_status;

    if (sendInternal) {
      const retryable = force
        ? ["not_sent", "sending", "failed", "sent"]
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
            console.error("enquiry internal email has no recipients");
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
              detailUrl,
            });
            await sendResendEmail(addresses, mail.subject, mail.html);
            internalStatus = "sent";
          }
        } catch (emailError) {
          console.error("enquiry internal email failed", emailError);
          internalStatus = "failed";
        }
        await admin.from("enquiry_submissions").update({
          internal_email_status: internalStatus,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      }

      const watiRetryable = force
        ? ["not_sent", "sending", "failed", "sent"]
        : ["not_sent"];
      if (
        watiEmergencySwitchAllows("WATI_ENQUIRY_INTERNAL_ENABLED")
        && watiRetryable.includes(internalWatiStatus)
        && await claimStatus(admin, row.id, "internal_wati_status", watiRetryable)
      ) {
        try {
          const { data: recipients, error: recipientError } = await admin
            .from("order_first_notification_recipients")
            .select("phone");
          if (recipientError) throw recipientError;
          const phones = [...new Set(
            ((recipients || []) as Array<{ phone?: string }>)
              .map((item) => normalizeNotificationPhone(item.phone))
              .filter((phone): phone is string =>
                Boolean(phone) && isNotificationPhoneAllowed(allowlist, phone)
              ),
          )];
          if (!phones.length) {
            console.error("enquiry internal wati has no recipients");
            internalWatiStatus = "failed";
          } else {
            const parameters = buildEnquiryInternalWatiParameters({
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
              detailUrl,
            });
            const results = await Promise.allSettled(
              phones.map((phone) => sendEnquiryInternalWati(allowlist, phone, parameters)),
            );
            const anySent = results.some((result) => result.status === "fulfilled");
            for (const result of results) {
              if (result.status === "rejected") {
                console.error("enquiry internal wati failed", result.reason);
              }
            }
            internalWatiStatus = anySent ? "sent" : "failed";
          }
        } catch (watiError) {
          console.error("enquiry internal wati failed", watiError);
          internalWatiStatus = "failed";
        }
        await admin.from("enquiry_submissions").update({
          internal_wati_status: internalWatiStatus,
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
        const retryable = force ? ["not_sent", "sending", "failed", "sent"] : ["not_sent"];
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
      internalWatiStatus,
      ackEmailStatus: ackStatus,
    });
  } catch (error) {
    return response({
      error: error instanceof Error ? error.message : "enquiry_notification_failed",
    }, 500);
  }
});
