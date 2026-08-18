import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * EmailMeForm inquiry sync.
 *
 * Receives the form submissions a customer submits on the marketing site
 * (EmailMeForm) and stores them as pending quotes so the sales team can
 * follow up. Each submission becomes an `orders` row with:
 *   document_type = 'quote'
 *   source_system = 'emailmeform'
 *   quote_status  = NULL (pending)
 *
 * Point the EmailMeForm "Send data to another website" action at
 *   POST /functions/v1/emailmeform-inquiry-sync
 * Both JSON and application/x-www-form-urlencoded payloads are accepted.
 * The legacy_id is derived from the submission id so resubmits upsert.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-inquiry-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
}

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    secretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

type InquiryRow = {
  legacyId: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  deliveryAt: string | null;
  guests: string | null;
  message: string | null;
};

const FIELD_KEYS = {
  submissionId: ["id", "submission_id", "submissionid", "entry_id", "entryid"],
  orderNumber: ["order_number", "order no", "order no.", "訂單編號", "訂單號"],
  name: ["name", "full_name", "fullname", "customer_name", "姓名", "名字", "稱呼"],
  company: ["company", "company_name", "公司", "公司名稱"],
  email: ["email", "email_address", "emailaddress", "電郵", "電郵地址", "email 地址"],
  phone: ["phone", "mobile", "contact_number", "tel", "電話", "手機", "聯絡電話"],
  date: [
    "date",
    "event_date",
    "eventdate",
    "delivery_date",
    "delivery date",
    "送餐日期",
    "送貨日期",
    "日期",
    "活動日期",
  ],
  time: ["time", "delivery_time", "送餐時間", "送貨時間", "時間"],
  guests: ["guests", "guest_count", "headcount", "people", "人數", "來賓人數"],
  message: [
    "message",
    "inquiry",
    "details",
    "notes",
    "description",
    "查詢",
    "查詢內容",
    "備註",
    "內容",
    "留言",
  ],
} as const;

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");
}

function pick(values: Map<string, string>, keys: readonly string[]) {
  const wanted = new Set(keys.map((key) => normalizeKey(key)));
  for (const [key, value] of values) {
    const normalized = normalizeKey(key);
    if (wanted.has(normalized) && value.trim()) return value.trim();
  }
  return null;
}

function parsePayload(body: Record<string, unknown>): Map<string, string> {
  const values = new Map<string, string>();
  const visit = (key: string, value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      const existing = values.get(key);
      values.set(key, existing ? `${existing} ${value}` : String(value));
    } else if (Array.isArray(value)) {
      value.forEach((item) => visit(key, item));
    }
  };
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    visit(key, value);
  }
  return values;
}

function parseDeliveryAt(dateValue: string, timeValue: string | null) {
  const parsed = Date.parse(dateValue);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  if (timeValue) {
    const match = timeValue.match(/^(\d{1,2})[:\s](\d{2})/);
    if (match) {
      date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    }
  }
  return date.toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function mapInquiry(
  values: Map<string, string>,
): Promise<InquiryRow> {
  const submissionId = pick(values, FIELD_KEYS.submissionId);
  const email = pick(values, FIELD_KEYS.email);
  const name = pick(values, FIELD_KEYS.name);
  const phone = pick(values, FIELD_KEYS.phone);
  const dateValue = pick(values, FIELD_KEYS.date);
  const timeValue = pick(values, FIELD_KEYS.time);
  const message = pick(values, FIELD_KEYS.message);

  const identity = [email, phone, name, dateValue, message]
    .map((part) => part ?? "")
    .join("|");
  const stableKey = submissionId ?? (await sha256Hex(identity));
  return {
    legacyId: `emailmeform:${stableKey}`,
    orderNumber: pick(values, FIELD_KEYS.orderNumber),
    customerName: name,
    companyName: pick(values, FIELD_KEYS.company),
    email,
    phone,
    deliveryAt: dateValue ? parseDeliveryAt(dateValue, timeValue) : null,
    guests: pick(values, FIELD_KEYS.guests),
    message,
  };
}

async function saveInquiry(admin: AdminClient, row: InquiryRow, now: Date) {
  const timestamp = now.toISOString();
  const existing = await admin
    .from("orders")
    .select("id,created_at")
    .eq("legacy_id", row.legacyId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const content = {
    document_type: "quote",
    source_system: "emailmeform",
    order_number: row.orderNumber,
    customer_name_snapshot: row.customerName,
    company_name_snapshot: row.companyName,
    email_snapshot: row.email?.toLowerCase() ?? null,
    contact_number_a_snapshot: row.phone,
    quote_description_snapshot: row.message,
    remarks: row.guests ? `人數：${row.guests}` : null,
    delivery_at: row.deliveryAt,
    currency: "HKD",
    is_quote_original: true,
  };

  if (existing.data) {
    const { error } = await admin
      .from("orders")
      .update({
        ...content,
        bubble_modified_at: timestamp,
        updated_at: timestamp,
      })
      .eq("id", existing.data.id);
    if (error) throw error;
    return { id: existing.data.id, created: false };
  }

  const { data, error } = await admin
    .from("orders")
    .insert({
      legacy_id: row.legacyId,
      ...content,
      bubble_created_at: timestamp,
      bubble_modified_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data?.id, created: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const configuredSecret = Deno.env.get("EMAILMEFORM_WEBHOOK_SECRET")?.trim();
  if (configuredSecret) {
    const supplied =
      request.headers.get("x-inquiry-secret") ||
      new URL(request.url).searchParams.get("secret") ||
      null;
    if (!supplied || supplied !== configuredSecret) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let body: Record<string, unknown>;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    const values = parsePayload(body);
    const email = pick(values, FIELD_KEYS.email);
    const name = pick(values, FIELD_KEYS.name);
    if (!email && !name) {
      return jsonResponse(
        { error: "missing_identity", detail: "No email or name field found." },
        400,
      );
    }

    const now = new Date();
    const row = await mapInquiry(values);
    const admin = createAdminClient();
    const result = await saveInquiry(admin, row, now);

    return jsonResponse(
      { ok: true, id: result.id, created: result.created, legacy_id: row.legacyId },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return jsonResponse(
      {
        error: "inquiry_sync_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
