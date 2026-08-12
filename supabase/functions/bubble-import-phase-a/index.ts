import { createClient } from "npm:@supabase/supabase-js@2";

const BUBBLE_BASE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj";
const SNAPSHOT_AT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT PHASE A TO MAIN";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BubbleRecord = Record<string, unknown> & {
  _id?: string;
  "Created Date"?: string;
  "Modified Date"?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const value = (JSON.parse(keys) as Record<string, string>).default;
    if (value) return value;
  }
  throw new Error("Supabase service credential is unavailable.");
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function dateValue(value: unknown) {
  if (typeof value !== "string") return null;
  const valueAsDate = new Date(value);
  return Number.isNaN(valueAsDate.getTime())
    ? null
    : valueAsDate.toISOString();
}

function metadata(record: BubbleRecord) {
  return {
    bubble_created_at: dateValue(record["Created Date"]),
    bubble_modified_at: dateValue(record["Modified Date"]),
  };
}

async function fetchType(type: string) {
  const records: BubbleRecord[] = [];
  let cursor = 0;
  const bubbleToken = Deno.env.get("BUBBLE_API_TOKEN")?.trim();

  while (true) {
    const query = new URLSearchParams({
      limit: "100",
      cursor: String(cursor),
      constraints: JSON.stringify([
        {
          key: "Created Date",
          constraint_type: "less than",
          value: SNAPSHOT_AT,
        },
      ]),
    });
    const headers: HeadersInit = { Accept: "application/json" };
    if (bubbleToken) headers.Authorization = `Bearer ${bubbleToken}`;
    const response = await fetch(
      `${BUBBLE_BASE_URL}/${encodeURIComponent(type)}?${query}`,
      { headers, signal: AbortSignal.timeout(30_000) },
    );
    const payload = await response.json().catch(() => null);
    const results = payload?.response?.results;
    if (!response.ok || !Array.isArray(results)) {
      throw new Error(
        payload?.message ||
          payload?.body?.message ||
          `${type} returned HTTP ${response.status}.`,
      );
    }
    records.push(...results);
    const remaining = Number(payload.response.remaining || 0);
    if (remaining === 0) break;
    if (results.length === 0) {
      throw new Error(
        `${type} stopped at cursor ${cursor} with ${remaining} remaining.`,
      );
    }
    cursor += results.length;
  }

  return records;
}

function requireLegacyId(record: BubbleRecord) {
  if (typeof record._id !== "string" || !record._id) {
    throw new Error("Bubble record is missing _id.");
  }
  return record._id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await request.json();
    if (body?.confirmation !== CONFIRMATION) {
      return jsonResponse({ error: "Confirmation does not match." }, 403);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Supabase URL is unavailable.");
    const supabase = createClient(supabaseUrl, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const imported: Record<string, number> = {};

    const channels = (await fetchType("ds_channel")).map((record) => ({
      legacy_id: requireLegacyId(record),
      name:
        text(record["Display Name"]) ||
        text(record["Brand Name"]) ||
        requireLegacyId(record),
      short_name: text(record.Shortform),
      website: text(record.Website),
      email: text(record.Email),
      sort_order: numberValue(record.sort),
      is_active: true,
      ...metadata(record),
    }));
    const { error: channelError } = await supabase
      .from("channels")
      .upsert(channels, { onConflict: "legacy_id" });
    if (channelError) throw channelError;
    imported.channels = channels.length;

    const paymentMethods = (await fetchType("ds_paymentmethod")).map(
      (record) => ({
        legacy_id: requireLegacyId(record),
        name: text(record["Method Name"]) || requireLegacyId(record),
        paypal_reference:
          record["Paypal ID"] === null || record["Paypal ID"] === undefined
            ? null
            : String(record["Paypal ID"]),
        is_active: booleanValue(record.active, true),
        ...metadata(record),
      }),
    );
    const { error: paymentMethodError } = await supabase
      .from("payment_methods")
      .upsert(paymentMethods, { onConflict: "legacy_id" });
    if (paymentMethodError) throw paymentMethodError;
    imported.payment_methods = paymentMethods.length;

    const districts = (await fetchType("ds_deliverydistrict")).map(
      (record) => ({
        legacy_id: requireLegacyId(record),
        name: text(record.District) || requireLegacyId(record),
        default_fee: numberValue(record.DeliveryFee),
        driver_team_legacy_id: text(record["Driver team"]),
        ...metadata(record),
      }),
    );
    const { error: districtError } = await supabase
      .from("delivery_districts")
      .upsert(districts, { onConflict: "legacy_id" });
    if (districtError) throw districtError;
    imported.delivery_districts = districts.length;

    const shippingMethods = (await fetchType("ds_shippingmethod")).map(
      (record) => ({
        legacy_id: requireLegacyId(record),
        name:
          text(record.Real_Name) ||
          text(record["Display Name"]) ||
          requireLegacyId(record),
        display_name: text(record["Display Name"]),
        display_order: numberValue(record["Display Order"]),
        requires_address_check: booleanValue(record["Address check"]),
        is_editable: booleanValue(record.editable),
        is_active: booleanValue(record.active, true),
        ...metadata(record),
      }),
    );
    const { error: shippingError } = await supabase
      .from("shipping_methods")
      .upsert(shippingMethods, { onConflict: "legacy_id" });
    if (shippingError) throw shippingError;
    imported.shipping_methods = shippingMethods.length;

    const statuses = (await fetchType("ds_status")).map((record) => ({
      legacy_id: requireLegacyId(record),
      name: text(record["Display Name"]) || requireLegacyId(record),
      color: text(record.color),
      sort_order: numberValue(record.order),
      is_follow_up: booleanValue(record["follow up"]),
      is_editable: booleanValue(record.editable),
      ...metadata(record),
    }));
    const { error: statusError } = await supabase
      .from("order_statuses")
      .upsert(statuses, { onConflict: "legacy_id" });
    if (statusError) throw statusError;
    imported.order_statuses = statuses.length;

    const tags = (await fetchType("nos_ordertag")).map((record) => ({
      legacy_id: requireLegacyId(record),
      name: text(record.Display) || requireLegacyId(record),
      is_active: booleanValue(record.active, true),
      ...metadata(record),
    }));
    const { error: tagError } = await supabase
      .from("order_tags")
      .upsert(tags, { onConflict: "legacy_id" });
    if (tagError) throw tagError;
    imported.order_tags = tags.length;

    const suppliers = (await fetchType("ds__ingredient_supplier")).map(
      (record) => ({
        legacy_id: requireLegacyId(record),
        company_name: text(record["Company name"]) || requireLegacyId(record),
        contact_person: text(record["Contact person"]),
        phone_number: text(record["Phone no."]),
        delivery_schedule: text(record.deliver_schedule),
        payment_schedule: text(record.payment_schedule),
        comment: text(record.comment),
        is_active: booleanValue(record.Active, true),
        ...metadata(record),
      }),
    );
    const { error: supplierError } = await supabase
      .from("suppliers")
      .upsert(suppliers, { onConflict: "legacy_id" });
    if (supplierError) throw supplierError;
    imported.suppliers = suppliers.length;

    const restaurants = (await fetchType("shopdsrestro")).map((record) => ({
      legacy_id: requireLegacyId(record),
      name: text(record.Name) || requireLegacyId(record),
      is_active: booleanValue(record.active, true),
      ...metadata(record),
    }));
    const { error: restaurantError } = await supabase
      .from("restaurants")
      .upsert(restaurants, { onConflict: "legacy_id" });
    if (restaurantError) throw restaurantError;
    imported.restaurants = restaurants.length;

    const departments = (await fetchType("shop_ds_restro_depart")).map(
      (record) => ({
        legacy_id: requireLegacyId(record),
        name: text(record.depart_name) || requireLegacyId(record),
        sort_order: numberValue(record.sort),
        is_active: booleanValue(record.active, true),
        ...metadata(record),
      }),
    );
    const { error: departmentError } = await supabase
      .from("restaurant_departments")
      .upsert(departments, { onConflict: "legacy_id" });
    if (departmentError) throw departmentError;
    imported.restaurant_departments = departments.length;

    return jsonResponse({
      status: "completed",
      snapshotAt: SNAPSHOT_AT,
      imported,
      total: Object.values(imported).reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error &&
            "message" in error &&
            typeof error.message === "string"
          ? error.message
          : "Phase A import failed.";
    return jsonResponse({ error: message }, 400);
  }
});

