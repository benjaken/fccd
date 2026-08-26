import { createClient } from "npm:@supabase/supabase-js@2";

const BUBBLE_BASE_URL = "https://cs.foodchannels-catering.com/api/1.1/obj";
const CONFIRMATION = "REFRESH_PREPARED_MEAT_FROM_BUBBLE";
const DEFAULT_ITEM_LEGACY_ID = "1697175689128x911263524366297900";
const PAGE_SIZE = 100;
const UPSERT_CHUNK = 250;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminClient = ReturnType<typeof createClient>;
type BubbleRecord = Record<string, unknown> & { _id?: string };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
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
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function list(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function requireLegacyId(record: BubbleRecord) {
  if (typeof record._id !== "string" || !record._id) {
    throw new Error("Bubble record is missing _id.");
  }
  return record._id;
}

function metadata(record: BubbleRecord) {
  return {
    bubble_created_at: dateValue(record["Created Date"]),
    bubble_modified_at: dateValue(record["Modified Date"]),
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticateCron(request: Request, client: AdminClient) {
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const { data, error } = await client
    .from("bubble_incremental_cron_auth")
    .select("secret_sha256")
    .eq("singleton", true)
    .single();
  if (error || !data?.secret_sha256) return false;
  const expected = String(data.secret_sha256);
  const actual = await sha256Hex(supplied);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

async function fetchBubble(
  sourceType: string,
  token: string,
  constraints: unknown[],
) {
  const records: BubbleRecord[] = [];
  let cursor = 0;
  while (true) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      cursor: String(cursor),
    });
    if (constraints.length) query.set("constraints", JSON.stringify(constraints));
    const response = await fetch(
      `${BUBBLE_BASE_URL}/${encodeURIComponent(sourceType)}?${query}`,
      {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = await response.json().catch(() => null);
    const page = payload?.response?.results;
    const remaining = Number(payload?.response?.remaining ?? Number.NaN);
    if (!response.ok || !Array.isArray(page) || !Number.isFinite(remaining)) {
      throw new Error(`Bubble fetch for ${sourceType} failed with HTTP ${response.status}.`);
    }
    records.push(...(page as BubbleRecord[]));
    if (remaining <= 0) return records;
    if (page.length === 0) throw new Error(`Bubble pagination stalled for ${sourceType}.`);
    cursor += page.length;
  }
}

async function legacyIds(
  client: AdminClient,
  table: string,
  ids: string[],
) {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows: Array<{ id: string; legacy_id: string }> = [];
  for (let index = 0; index < unique.length; index += 100) {
    const { data, error } = await client
      .from(table)
      .select("id,legacy_id")
      .in("legacy_id", unique.slice(index, index + 100));
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ id: string; legacy_id: string }>));
  }
  return new Map(rows.map((row) => [row.legacy_id, row.id]));
}

async function upsert(
  client: AdminClient,
  table: string,
  rows: Array<Record<string, unknown>>,
) {
  let written = 0;
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { data, error } = await client
      .from(table)
      .upsert(chunk, { onConflict: "legacy_id" })
      .select("legacy_id");
    if (error) throw error;
    written += data?.length ?? 0;
  }
  return written;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const client = createClient(
    requiredEnv("SUPABASE_URL"),
    serviceKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  if (!(await authenticateCron(request, client))) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== CONFIRMATION) {
      throw new Error("confirmation is invalid.");
    }
    const itemLegacyId = typeof body?.itemLegacyId === "string" && body.itemLegacyId
      ? body.itemLegacyId
      : DEFAULT_ITEM_LEGACY_ID;
    const bubbleToken = requiredEnv("BUBBLE_API_TOKEN").replace(/^Bearer\s+/i, "").trim();

    const equals = (key: string, value: string) => [{
      key,
      constraint_type: "equals",
      value,
    }];

    const [items, stocks, orderLines, seasoning] = await Promise.all([
      fetchBubble("m_donemeat", bubbleToken, equals("_id", itemLegacyId)),
      fetchBubble("m_donemeat_stock", bubbleToken, equals("DoneMeat", itemLegacyId)),
      fetchBubble("m_outdone_donemeat", bubbleToken, equals("M_doneMeat", itemLegacyId)),
      fetchBubble("m_meatseasoning_cost", bubbleToken, equals("M_doneMeat", itemLegacyId)),
    ]);
    if (!items.length) throw new Error("Bubble m_donemeat record was not found.");

    const item = items[0];
    const rawMeatIds = await legacyIds(client, "raw_meat_items", [
      text(item.raw_meat) ?? "",
      ...orderLines.map((row) => text(row.M_rawMeat) ?? ""),
      ...seasoning.map((row) => text(row.M_rawMeat) ?? ""),
    ]);
    const customerIds = await legacyIds(
      client,
      "meat_customers",
      stocks.map((row) => text(row.Shop_M_cust) ?? ""),
    );
    const orderIds = await legacyIds(
      client,
      "meat_orders",
      orderLines.map((row) => text(row.M_outDone_order) ?? ""),
    );
    const seasoningIds = await legacyIds(
      client,
      "seasonings",
      seasoning.map((row) => text(row.seasoning) ?? ""),
    );

    const itemRow = {
      legacy_id: requireLegacyId(item),
      ...metadata(item),
      raw_meat_item_legacy_id: text(item.raw_meat),
      raw_meat_item_id: rawMeatIds.get(text(item.raw_meat) ?? "") ?? null,
      sku: text(item.SKU),
      name: text(item.Name) || requireLegacyId(item),
      english_name: text(item.Name_Eng),
      unit: text(item.Unit),
      kg_per_package: numberValue(item["kg/包"]),
      sort_order: numberValue(item.sort_order),
      is_active: booleanValue(item.active, true),
    };
    await upsert(client, "prepared_meat_items", [itemRow]);
    const preparedIds = await legacyIds(client, "prepared_meat_items", [itemLegacyId]);
    const preparedId = preparedIds.get(itemLegacyId);
    if (!preparedId) throw new Error("Unable to resolve prepared meat item after upsert.");

    const orderLineRows = orderLines.map((row) => ({
      legacy_id: requireLegacyId(row),
      ...metadata(row),
      meat_order_legacy_id: text(row.M_outDone_order),
      meat_order_id: orderIds.get(text(row.M_outDone_order) ?? "") ?? null,
      prepared_meat_item_legacy_id: itemLegacyId,
      prepared_meat_item_id: preparedId,
      raw_meat_item_legacy_id: text(row.M_rawMeat),
      raw_meat_item_id: rawMeatIds.get(text(row.M_rawMeat) ?? "") ?? null,
      quantity: numberValue(row.quantity),
      sort_order: numberValue(row.sortNo),
      remarks: text(row.remarks),
    }));
    const orderLinesWritten = await upsert(client, "meat_order_lines", orderLineRows);
    const orderLineIds = await legacyIds(
      client,
      "meat_order_lines",
      orderLineRows.map((row) => String(row.legacy_id)),
    );

    const stockRows = stocks.map((row) => ({
      legacy_id: requireLegacyId(row),
      ...metadata(row),
      prepared_meat_item_legacy_id: itemLegacyId,
      prepared_meat_item_id: preparedId,
      meat_customer_legacy_id: text(row.Shop_M_cust),
      meat_customer_id: customerIds.get(text(row.Shop_M_cust) ?? "") ?? null,
      meat_order_line_legacy_id: text(row.M_outDone_doneMeat),
      meat_order_line_id: orderLineIds.get(text(row.M_outDone_doneMeat) ?? "") ?? null,
      movement_at: dateValue(row.Date),
      inbound_packages: numberValue(row["in/包"]),
      outbound_packages: numberValue(row["out/包"]),
      prepared_meat_order: numberValue(row.DoneMeat_order),
      remarks: text(row.remark),
    }));
    const stocksWritten = await upsert(client, "prepared_meat_stock_movements", stockRows);
    const stockIds = await legacyIds(
      client,
      "prepared_meat_stock_movements",
      stockRows.map((row) => String(row.legacy_id)),
    );

    const rawMovementLegacyIds = stocks.flatMap((row) => list(row.from_rawStock_list));
    const rawMovementIds = await legacyIds(client, "raw_meat_stock_movements", rawMovementLegacyIds);
    const sourceRows = stocks.flatMap((row) => {
      const parentId = stockIds.get(requireLegacyId(row));
      if (!parentId) return [];
      return list(row.from_rawStock_list).map((rawLegacyId) => ({
        prepared_movement_id: parentId,
        prepared_movement_legacy_id: requireLegacyId(row),
        raw_stock_movement_id: rawMovementIds.get(rawLegacyId) ?? null,
        raw_stock_movement_legacy_id: rawLegacyId,
      }));
    });
    const movementIds = [...stockIds.values()];
    for (let index = 0; index < movementIds.length; index += 100) {
      const { error } = await client
        .from("prepared_meat_stock_raw_sources")
        .delete()
        .in("prepared_movement_id", movementIds.slice(index, index + 100));
      if (error) throw error;
    }
    let sourcesWritten = 0;
    for (let index = 0; index < sourceRows.length; index += UPSERT_CHUNK) {
      const { data, error } = await client
        .from("prepared_meat_stock_raw_sources")
        .upsert(sourceRows.slice(index, index + UPSERT_CHUNK), {
          onConflict: "prepared_movement_id,raw_stock_movement_legacy_id",
        })
        .select("prepared_movement_id");
      if (error) throw error;
      sourcesWritten += data?.length ?? 0;
    }

    const keptStockLegacyIds = new Set(stockRows.map((row) => String(row.legacy_id)));
    const existingMovements: Array<{ id: string; legacy_id: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await client
        .from("prepared_meat_stock_movements")
        .select("id,legacy_id")
        .eq("prepared_meat_item_id", preparedId)
        .range(offset, offset + 999);
      if (page.error) throw page.error;
      const rows = (page.data ?? []) as Array<{ id: string; legacy_id: string }>;
      existingMovements.push(...rows);
      if (rows.length < 1000) break;
    }
    const extraIds = existingMovements
      .filter((row) => !keptStockLegacyIds.has(row.legacy_id))
      .map((row) => row.id);
    if (extraIds.length) {
      await client.from("prepared_meat_stock_raw_sources").delete().in("prepared_movement_id", extraIds);
      await client.from("prepared_meat_stock_movements").delete().in("id", extraIds);
    }

    const seasoningRows = seasoning.map((row) => ({
      legacy_id: requireLegacyId(row),
      ...metadata(row),
      prepared_meat_item_legacy_id: itemLegacyId,
      prepared_meat_item_id: preparedId,
      raw_meat_item_legacy_id: text(row.M_rawMeat),
      raw_meat_item_id: rawMeatIds.get(text(row.M_rawMeat) ?? "") ?? null,
      seasoning_legacy_id: text(row.seasoning),
      seasoning_id: seasoningIds.get(text(row.seasoning) ?? "") ?? null,
      production_raw_meat_kg: numberValue(row["製作生肉份量KG"]),
      seasoning_quantity_grams: numberValue(row["quantity(g)"]),
      total_cost: numberValue(row["Total($*q)"]),
      unit_cost: numberValue(row.unit_cost),
      version_code: numberValue(row.code),
      seasoning_sort: numberValue(row.seasoning_sort),
      is_applied: booleanValue(row.apply),
    }));
    const seasoningWritten = await upsert(client, "meat_seasoning_cost_versions", seasoningRows);

    return jsonResponse({
      status: "completed",
      itemLegacyId,
      itemName: itemRow.name,
      fetched: {
        item: items.length,
        stocks: stocks.length,
        orderLines: orderLines.length,
        seasoning: seasoning.length,
      },
      written: {
        stocks: stocksWritten,
        orderLines: orderLinesWritten,
        sources: sourcesWritten,
        seasoning: seasoningWritten,
        extraMovementsRemoved: extraIds.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh_failed";
    console.error("refresh-prepared-meat-from-bubble failed", message);
    return jsonResponse({ error: message }, 500);
  }
});
