import { createClient } from "npm:@supabase/supabase-js@2";
import { buildDailySalesEmail, type DailySalesEmailLine } from "../_shared/daily-sales-email.ts";
import { EMAIL_FROM } from "../_shared/email-sender.ts";

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

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return "";
  return String((relation as { name?: unknown }).name ?? "").trim();
}

function lines(rows: Array<Record<string, unknown>>, relation: string, valueField: string) {
  return rows.flatMap<DailySalesEmailLine>((row) => {
    const name = relationName(row[relation]);
    if (!name) return [];
    const value = Number(row[valueField] ?? 0);
    return [{ name, value: Number.isFinite(value) ? value : 0 }];
  });
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

    const input = await request.json() as { restaurantId?: string; date?: string };
    if (!input.restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) {
      return response({ error: "invalid_daily_sales_report" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey());
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("email,user_name,role,shop_restro_legacy_id")
      .eq("id", authData.user.id)
      .single();
    if (profileError || !profile) return response({ error: "profile_not_found" }, 403);
    if (!["Shop manager", "Super Admin"].includes(profile.role)) {
      return response({ sent: false, skipped: true });
    }

    const recipient = (
      Deno.env.get("DAILY_SALES_EMAIL_TO") || profile.email || authData.user.email || ""
    ).trim();
    if (!recipient) return response({ error: "recipient_email_missing" }, 400);

    const { data: restaurant, error: restaurantError } = await admin
      .from("restaurants")
      .select("id,legacy_id,name")
      .eq("id", input.restaurantId)
      .single();
    if (restaurantError || !restaurant) return response({ error: "restaurant_not_found" }, 404);
    if (profile.shop_restro_legacy_id && profile.shop_restro_legacy_id !== restaurant.legacy_id) {
      return response({ error: "restaurant_forbidden" }, 403);
    }

    const start = `${input.date}T00:00:00+08:00`;
    const end = `${input.date}T23:59:59.999+08:00`;
    const { data: reportRows, error: reportError } = await admin
      .from("restaurant_daily_sales")
      .select("amount,quantity,is_control_total,manager_hours_department,working_hours,payment:restaurant_payment_methods(name),platform:restaurant_delivery_platforms(name),department:restaurant_departments(name),period:restaurant_service_periods(name),product:restaurant_new_products(name)")
      .eq("restaurant_id", input.restaurantId)
      .gte("sales_at", start)
      .lte("sales_at", end);
    if (reportError) throw new Error(reportError.message);

    const rows = (reportRows ?? []) as Array<Record<string, unknown>>;
    const control = rows.find((row) => row.is_control_total === true);
    if (!control) return response({ error: "daily_sales_report_not_found" }, 404);
    const workingHours = rows.flatMap<DailySalesEmailLine>((row) => {
      const name = String(row.manager_hours_department ?? "").trim();
      if (!name) return [];
      const value = Number(row.working_hours ?? 0);
      return [{ name, value: Number.isFinite(value) ? value : 0 }];
    });
    const email = buildDailySalesEmail({
      date: input.date!,
      restaurantName: String(restaurant.name ?? ""),
      total: Number(control.amount ?? 0),
      payments: [...lines(rows, "payment", "amount"), ...lines(rows, "platform", "amount")],
      departments: lines(rows, "department", "amount"),
      periods: lines(rows, "period", "amount"),
      products: lines(rows, "product", "quantity"),
      workingHours,
    });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [recipient],
        subject: email.subject,
        html: email.html,
      }),
    });
    if (!emailResponse.ok) return response({ error: "email_send_failed" }, 502);
    return response({ sent: true });
  } catch (error) {
    return response({
      error: error instanceof Error ? error.message : "daily_sales_email_failed",
    }, 500);
  }
});
