import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://cs.foodchannels-catering.com/api/1.1/obj";
const SNAPSHOT_AT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT PHASE C TO MAIN";
const ALLOWED_TYPES = new Set([
  "a_order",
  "s_order",
  "s_payment",
  "b_deliveryschedule",
]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;
const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const booleanValue = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;
const dateValue = (value: unknown) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const legacyId = (record: Record<string, unknown>) => {
  if (typeof record._id !== "string" || !record._id) {
    throw new Error("Bubble record is missing _id.");
  }
  return record._id;
};
const metadata = (record: Record<string, unknown>) => ({
  bubble_created_at: dateValue(record["Created Date"]),
  bubble_modified_at: dateValue(record["Modified Date"]),
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) return (JSON.parse(keys) as Record<string, string>).default;
  throw new Error("Supabase service credential is unavailable.");
}

async function resolveIds(
  client: ReturnType<typeof createClient>,
  table: string,
  values: Array<string | null>,
) {
  const unique = [...new Set(values.filter((value): value is string => !!value))];
  const result = new Map<string, string>();
  for (let index = 0; index < unique.length; index += 100) {
    const { data, error } = await client
      .from(table)
      .select("id, legacy_id")
      .in("legacy_id", unique.slice(index, index + 100));
    if (error) throw error;
    data.forEach((row) => result.set(row.legacy_id, row.id));
  }
  return result;
}

async function upsertRows(
  client: ReturnType<typeof createClient>,
  table: string,
  rows: Array<Record<string, unknown>>,
) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(index, index + 500), {
        onConflict: "legacy_id",
      });
    if (error) throw error;
  }
}

async function fetchPages(
  sourceType: string,
  cursor: number,
  constraints: Array<Record<string, unknown>>,
) {
  const records: Array<Record<string, unknown>> = [];
  let nextCursor = cursor;
  let remaining = 0;
  const bubbleToken = Deno.env.get("BUBBLE_API_TOKEN")?.trim();

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({
      limit: "100",
      cursor: String(nextCursor),
      constraints: JSON.stringify([
        ...constraints,
        {
          key: "Created Date",
          constraint_type: "less than",
          value: SNAPSHOT_AT,
        },
      ]),
    });
    const headers: HeadersInit = { Accept: "application/json" };
    if (bubbleToken) headers.Authorization = `Bearer ${bubbleToken}`;
    const bubbleResponse = await fetch(
      `${BASE}/${encodeURIComponent(sourceType)}?${query}`,
      { headers, signal: AbortSignal.timeout(30_000) },
    );
    const payload = await bubbleResponse.json().catch(() => null);
    const pageRecords = payload?.response?.results;
    if (!bubbleResponse.ok || !Array.isArray(pageRecords)) {
      throw new Error(
        payload?.message ||
          payload?.body?.message ||
          `${sourceType} returned HTTP ${bubbleResponse.status}.`,
      );
    }
    records.push(...pageRecords);
    remaining = Number(payload.response.remaining || 0);
    nextCursor += pageRecords.length;
    if (remaining === 0) break;
    if (pageRecords.length === 0) {
      throw new Error(
        `${sourceType} stopped at cursor ${nextCursor} with ${remaining} remaining.`,
      );
    }
  }
  return { records, nextCursor, remaining };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await request.json();
    if (body?.confirmation !== CONFIRMATION) {
      return response({ error: "Confirmation does not match." }, 403);
    }
    const sourceType = text(body.sourceType);
    if (!sourceType || !ALLOWED_TYPES.has(sourceType)) {
      return response({ error: "Source type is not allowed." }, 400);
    }
    const cursor =
      typeof body.cursor === "number" && body.cursor >= 0 ? body.cursor : 0;
    const constraints = Array.isArray(body.constraints)
      ? body.constraints
      : [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Supabase URL is unavailable.");
    const client = createClient(supabaseUrl, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const page = await fetchPages(sourceType, cursor, constraints);
    const source = page.records;

    if (sourceType === "a_order") {
      const customerLegacy = source.map((row) => text(row.A_customer));
      const channelLegacy = source.map((row) => text(row.ORDER_Channel));
      const customers = await resolveIds(client, "customers", customerLegacy);
      const channels = await resolveIds(client, "channels", channelLegacy);
      const rows = source.map((row) => {
        const customer = text(row.A_customer);
        const channel = text(row.ORDER_Channel);
        return {
          legacy_id: legacyId(row),
          customer_id: customer ? customers.get(customer) ?? null : null,
          customer_legacy_id: customer,
          channel_id: channel ? channels.get(channel) ?? null : null,
          channel_legacy_id: channel,
          order_number: text(row["ORDER_Order Number"]),
          document_type:
            row["(Quote)chg to order"] === true ||
            row.AddOrder_DONE === true ||
            row.Shopify_NewOrder === true
              ? "order"
              : row["(Quote) Status"] || row["(Quote)_description"]
                ? "quote"
                : "unconfirmed",
          quote_status:
            row["(Quote) Status"] == null
              ? null
              : String(row["(Quote) Status"]),
          delivery_status:
            row.Delivery_Status == null
              ? null
              : String(row.Delivery_Status),
          order_status_legacy_ids: Array.isArray(row.ORDER_Status)
            ? row.ORDER_Status.filter((value) => typeof value === "string")
            : [],
          customer_name_snapshot: text(row["ORDER_Customer Name"]),
          company_name_snapshot: text(row["ORDER_Company Name"]),
          email_snapshot: text(row["ORDER_Email Address"]),
          contact_number_a_snapshot: text(row["ORDER_Contact Number A"]),
          contact_number_b_snapshot: text(row["ORDER_Contact Number B"]),
          shipping_address_snapshot: text(row["Shipping Address"]),
          customer_note_snapshot: text(row["ORDER_Customer Note"]),
          quote_description_snapshot: text(row["(Quote)_description"]),
          delivery_terms_snapshot: text(row["(Quote) delivery text"]),
          discount_amount: numberValue(row["ORDER_折扣(-)"]) ?? 0,
          shipping_fee: numberValue(row["ORDER_運費(+)"]) ?? 0,
          cashdollar_purchased:
            numberValue(row.ORDER_購買Cashdollar) ?? 0,
          cashdollar_redeemed:
            numberValue(row.ORDER_扣除Cashdollar) ?? 0,
          grand_total: numberValue(row["ORDER_Grand total"]),
          outstanding: numberValue(row.ORDER_oustanding),
          delivery_at: dateValue(row.Delivery_Date),
          factory_date: dateValue(row.Factory_date1_sd),
          factory_print_date: dateValue(row.Factory_date2_Print),
          ship_out_time: text(row["Delivery_Ship Out Time"]),
          remarks: text(row.ORDER_Remarks),
          factory_packing_note: text(row["Factory_Packing Note"]),
          is_shopify_order: booleanValue(row.Shopify_NewOrder),
          is_quote_original: booleanValue(row["(Quote)Original"]),
          is_sent_to_factory: booleanValue(row["Factory_send/not"]),
          bubble_created_by_legacy_id: text(row["Created By"]),
          ...metadata(row),
        };
      });
      const unresolved = rows.filter(
        (row) =>
          (row.customer_legacy_id && !row.customer_id) ||
          (row.channel_legacy_id && !row.channel_id),
      ).length;
      if (unresolved) {
        throw new Error(`${unresolved} order references unresolved.`);
      }
      await upsertRows(client, "orders", rows);
    }

    if (sourceType === "s_order") {
      const orderIds = await resolveIds(
        client,
        "orders",
        source.map((row) => text(row.Order)),
      );
      const productIds = await resolveIds(
        client,
        "products",
        source.map((row) => text(row.Product)),
      );
      const packageIds = await resolveIds(
        client,
        "packages",
        source.map((row) => text(row.Package)),
      );
      const rows = source.map((row) => {
        const order = text(row.Order);
        const product = text(row.Product);
        const packageId = text(row.Package);
        return {
          legacy_id: legacyId(row),
          order_id: order ? orderIds.get(order) ?? null : null,
          order_legacy_id: order,
          product_id: product ? productIds.get(product) ?? null : null,
          product_legacy_id: product,
          package_id: packageId ? packageIds.get(packageId) ?? null : null,
          package_legacy_id: packageId,
          sku_snapshot: text(row.SKU),
          product_name_snapshot: text(row.newproductname),
          content_snapshot: text(row.real_content_info),
          quantity: numberValue(row.Quantity),
          new_quantity_text: text(row.newquantity),
          unit_price: numberValue(row["Unit Price"]),
          total_price: numberValue(row["Total Price"]),
          item_order: numberValue(row["Item order"]),
          type_sort: numberValue(row.TypeSort),
          remarks_1: text(row.remarks1),
          remarks_2: text(row.remarks2),
          delivery_at: dateValue(row.DeliDate),
          is_addon: booleanValue(row["Add-on"]),
          is_void: booleanValue(row.Void),
          is_printed: booleanValue(row.Printed),
          is_sent_to_factory: booleanValue(row["Send to Factory"]),
          ...metadata(row),
        };
      });
      const unresolved = rows.filter(
        (row) =>
          (row.order_legacy_id && !row.order_id) ||
          (row.product_legacy_id && !row.product_id) ||
          (row.package_legacy_id && !row.package_id),
      ).length;
      if (unresolved) {
        throw new Error(`${unresolved} order-line references unresolved.`);
      }
      await upsertRows(client, "order_lines", rows);
    }

    if (sourceType === "s_payment") {
      const orderIds = await resolveIds(
        client,
        "orders",
        source.map((row) => text(row.Order)),
      );
      const channelIds = await resolveIds(
        client,
        "channels",
        source.map((row) => text(row.Channels)),
      );
      const methodIds = await resolveIds(
        client,
        "payment_methods",
        source.map((row) => text(row["Payment Method"])),
      );
      const rows = source.map((row) => {
        const order = text(row.Order);
        const channel = text(row.Channels);
        const method = text(row["Payment Method"]);
        return {
          legacy_id: legacyId(row),
          order_id: order ? orderIds.get(order) ?? null : null,
          order_legacy_id: order,
          channel_id: channel ? channelIds.get(channel) ?? null : null,
          channel_legacy_id: channel,
          payment_method_id: method ? methodIds.get(method) ?? null : null,
          payment_method_legacy_id: method,
          order_number_snapshot: text(row["OrderNo."]),
          amount: numberValue(row.Amount) ?? 0,
          payment_at: dateValue(row["Payment Date"]),
          payout_at: dateValue(row["Payout date"]),
          paypal_reference: text(row["Paypal ID"]),
          receipt_reference: text(row.Rec),
          ...metadata(row),
        };
      });
      const unresolved = rows.filter(
        (row) =>
          (row.order_legacy_id && !row.order_id) ||
          (row.channel_legacy_id && !row.channel_id) ||
          (row.payment_method_legacy_id && !row.payment_method_id),
      ).length;
      if (unresolved) {
        throw new Error(`${unresolved} payment references unresolved.`);
      }
      await upsertRows(client, "payments", rows);
    }

    if (sourceType === "b_deliveryschedule") {
      const orderIds = await resolveIds(
        client,
        "orders",
        source.map((row) => text(row.A_order)),
      );
      const districtIds = await resolveIds(
        client,
        "delivery_districts",
        source.map((row) => text(row["DS_delivery district"])),
      );
      const rows = source.map((row) => {
        const order = text(row.A_order);
        const district = text(row["DS_delivery district"]);
        return {
          legacy_id: legacyId(row),
          order_id: order ? orderIds.get(order) ?? null : null,
          order_legacy_id: order,
          district_id: district ? districtIds.get(district) ?? null : null,
          district_legacy_id: district,
          motorcade_legacy_id: text(row.DS_motorcade),
          subdriver_legacy_id: text(row.DS_Super_Motorcade_supDriver),
          delivery_at: dateValue(row["Delivery Date_A_order"]),
          fulfilled_at: dateValue(row["fulfill_date&time(trigger A_order)"]),
          taken_at: dateValue(row["take_date&time"]),
          ship_out_time: text(row["Ship-out Time_A_order"]),
          driver_confirmation_status:
            row["OS driver conformation"] == null
              ? null
              : String(row["OS driver conformation"]),
          delivery_status:
            row["OS driver delivery status"] == null
              ? null
              : String(row["OS driver delivery status"]),
          basic_fee: numberValue(row["Basic_district deli fee"]),
          total_fee: numberValue(row["Basic+surcharge total"]),
          image_references: Array.isArray(row.image)
            ? row.image.filter((value) => typeof value === "string")
            : [],
          ...metadata(row),
        };
      });
      const unresolved = rows.filter(
        (row) =>
          (row.order_legacy_id && !row.order_id) ||
          (row.district_legacy_id && !row.district_id),
      ).length;
      if (unresolved) {
        throw new Error(`${unresolved} delivery references unresolved.`);
      }
      await upsertRows(client, "deliveries", rows);
    }

    return response({
      status: "completed",
      sourceType,
      imported: source.length,
      nextCursor: page.nextCursor,
      remaining: page.remaining,
      done: page.remaining === 0,
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
          : "Phase C import failed.";
    return response({ error: message }, 400);
  }
});
