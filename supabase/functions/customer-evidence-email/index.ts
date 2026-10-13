import { createClient } from "npm:@supabase/supabase-js@2";
import { EMAIL_FROM } from "../_shared/email-sender.ts";
import { applyDevelopNotificationMarker, toNotificationEmailRecipients, type NotificationRecipientPolicy } from "../_shared/notification-test-overrides.ts";

type Job = { id: string; recipient: string; order_number: string; amount: number; attempts: number };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function escape(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }

/** Deploy and schedule separately; never send email from a customer browser request. */
Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cronSecret = Deno.env.get("CUSTOMER_EVIDENCE_EMAIL_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return json({ error: "unauthorized" }, 401);
  if (Deno.env.get("CUSTOMER_EVIDENCE_EMAIL_ENABLED") !== "true") return json({ enabled: false });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !key || !resendKey) return json({ error: "email_configuration_missing" }, 503);
  const admin = createClient(url, key);
  const policyResult = await admin.from("notification_recipient_policy").select("recipient_mode,allowed_wati_phones,allowed_emails").eq("singleton", true).single();
  if (policyResult.error || !policyResult.data) return json({ error: "recipient_policy_unavailable" }, 503);
  const row = policyResult.data;
  const policy: NotificationRecipientPolicy = { mode: row.recipient_mode, allowedEmails: row.allowed_emails || [], allowedWatiPhones: row.allowed_wati_phones || [] };
  if (!["environment", "allowlist", "live"].includes(policy.mode)) return json({ error: "invalid_recipient_policy" }, 503);
  const claimed = await admin.rpc("claim_customer_personal_evidence_emails", { p_limit: 20 });
  if (claimed.error) return json({ error: "claim_failed" }, 500);
  let sent = 0;
  let failed = 0;
  for (const job of (claimed.data || []) as Job[]) {
    try {
      const recipients = toNotificationEmailRecipients([job.recipient], policy);
      if (!recipients.length) throw new Error("recipient_not_enabled");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `personal-evidence-${job.id}` },
        body: JSON.stringify({ from: EMAIL_FROM, to: recipients,
          subject: applyDevelopNotificationMarker(`付款單據待核實 · ${job.order_number}`),
          html: `<p>個人客戶已提交付款單據。</p><p>訂單：${escape(job.order_number)}</p><p>金額：HK$${Number(job.amount).toFixed(2)}</p><p>請登入 FCCD 的付款單據審核頁核實。上載單據不代表已完成付款。</p>` }),
      });
      if (!response.ok) throw new Error("email_send_failed");
      const updated = await admin.from("customer_personal_evidence_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
      if (updated.error) throw new Error("email_status_update_failed");
      sent++;
    } catch (error) {
      const updated = await admin.from("customer_personal_evidence_email_outbox").update({ status: job.attempts >= 5 ? "failed" : "pending",
        next_attempt_at: new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString(),
        last_error: error instanceof Error ? error.message : "email_failed" }).eq("id", job.id);
      if (updated.error) return json({ error: "queue_update_failed", sent, failed }, 500);
      failed++;
    }
  }
  return json({ sent, failed });
});
