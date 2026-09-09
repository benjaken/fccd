import { createClient } from "npm:@supabase/supabase-js@2";
import { EMAIL_FROM } from "../_shared/email-sender.ts";
import {
  buildInventoryForecastEmail,
  buildMinimumStockEmail,
  type InventoryForecastLine,
  type MinimumStockAlert,
} from "../_shared/inventory-email.ts";

type Job = {
  id: string;
  event_type: "daily_forecast" | "minimum_stock";
  payload: Record<string, unknown>;
  attempt_count: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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

function forecastLine(row: Record<string, unknown>): InventoryForecastLine {
  return {
    sku: row.sku == null ? null : String(row.sku),
    itemName: String(row.item_name ?? ""),
    unit: String(row.unit ?? ""),
    warehouse: String(row.warehouse ?? ""),
    currentStock: row.current_stock == null ? null : Number(row.current_stock),
    requiredStock: Number(row.required_stock ?? 0),
    shortageQuantity: Number(row.shortage_quantity ?? 0),
    stockStatus: String(row.stock_status ?? "shortage"),
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.headers.get("x-cron-secret") !== requiredEnv("INVENTORY_EMAIL_CRON_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey());
  const { data: claimed, error: claimError } = await admin.rpc("claim_inventory_email_notifications", { p_limit: 25 });
  if (claimError) return json({ error: "claim_failed" }, 500);

  const { data: recipientRows, error: recipientError } = await admin.rpc("enquiry_internal_email_recipients");
  if (recipientError) return json({ error: "recipient_lookup_failed" }, 500);
  const recipients = [...new Set((recipientRows ?? []).map((row: { recipient_address?: string }) => row.recipient_address?.trim().toLowerCase()).filter(Boolean))] as string[];
  let sent = 0;
  let failed = 0;

  for (const job of (claimed ?? []) as Job[]) {
    try {
      if (!recipients.length) {
        await admin.from("inventory_email_outbox").update({ status: "skipped", last_error: "recipient_email_missing", updated_at: new Date().toISOString() }).eq("id", job.id);
        continue;
      }

      let email: { subject: string; html: string };
      if (job.event_type === "daily_forecast") {
        const startDate = String(job.payload.startDate ?? "");
        const days = Number(job.payload.days ?? 14);
        const [forecastResult, unmappedResult] = await Promise.all([
          admin.rpc("inventory_forecast_shortages", { p_start_date: startDate, p_days: days }),
          admin.rpc("inventory_forecast_unmapped_order_lines", { p_start_date: startDate, p_days: days }),
        ]);
        if (forecastResult.error || unmappedResult.error) throw new Error("forecast_lookup_failed");
        email = buildInventoryForecastEmail({
          startDate,
          days,
          lines: (forecastResult.data ?? []).map((row: Record<string, unknown>) => forecastLine(row)),
          unmappedLines: (unmappedResult.data ?? []).map((row: Record<string, unknown>) => ({
            orderNumber: String(row.order_number ?? ""),
            itemName: String(row.item_name ?? ""),
            deliveryDate: String(row.delivery_date ?? ""),
          })),
        });
      } else {
        email = buildMinimumStockEmail({
          sku: job.payload.sku == null ? null : String(job.payload.sku),
          name: String(job.payload.name ?? ""),
          unit: String(job.payload.unit ?? ""),
          warehouse: String(job.payload.warehouse ?? ""),
          currentStock: Number(job.payload.currentStock ?? 0),
          minimumStock: Number(job.payload.minimumStock ?? 0),
        } satisfies MinimumStockAlert);
      }

      const provider = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: recipients, subject: email.subject, html: email.html }),
      });
      if (!provider.ok) throw new Error("email_send_failed");
      const payload = await provider.json().catch(() => ({})) as { id?: string };
      await admin.from("inventory_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: payload.id ?? null, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      sent += 1;
    } catch (error) {
      const terminal = job.attempt_count >= 5;
      await admin.from("inventory_email_outbox").update({
        status: terminal ? "failed" : "pending",
        next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** job.attempt_count) * 60_000).toISOString(),
        last_error: error instanceof Error ? error.message : "inventory_email_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      failed += 1;
    }
  }

  return json({ processed: (claimed ?? []).length, sent, failed });
});
