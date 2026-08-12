import { createClient } from "npm:@supabase/supabase-js@2";

const BUBBLE_BASE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj";
const SNAPSHOT_AT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT PHASE B TO MAIN";

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

function requireLegacyId(record: BubbleRecord) {
  if (typeof record._id !== "string" || !record._id) {
    throw new Error("Bubble record is missing _id.");
  }
  return record._id;
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

async function upsertChunks(
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

async function idMap(
  client: ReturnType<typeof createClient>,
  table: string,
) {
  const rows: Array<{ id: string; legacy_id: string }> = [];
  for (let start = 0; ; start += 1_000) {
    const { data, error } = await client
      .from(table)
      .select("id, legacy_id")
      .range(start, start + 999);
    if (error) throw error;
    rows.push(...(data as Array<{ id: string; legacy_id: string }>));
    if (data.length < 1_000) break;
  }
  return new Map(rows.map((row) => [row.legacy_id, row.id]));
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

    const channelIds = await idMap(supabase, "channels");
    const productSource = await fetchType("a_products");
    const packageSource = await fetchType("a_packages");
    const productRows = productSource.map((record) => {
      const channelLegacyId = text(record.R_Channel);
      return {
        legacy_id: requireLegacyId(record),
        channel_id: channelLegacyId
          ? channelIds.get(channelLegacyId) ?? null
          : null,
        channel_legacy_id: channelLegacyId,
        sku: text(record.SKU),
        name: text(record["Product Name"]) || requireLegacyId(record),
        chinese_name: text(record["Chinese Name"]),
        description: text(record.Description),
        image_url: text(record.Image),
        price: numberValue(record.Price),
        price_min: numberValue(record.PriceRange_Min),
        price_max: numberValue(record.PriceRange_Max),
        status:
          record.Status === null || record.Status === undefined
            ? null
            : String(record.Status),
        is_active: booleanValue(record.Active, true),
        ...metadata(record),
      };
    });
    const packageRows = packageSource.map((record) => {
      const channelLegacyId = text(record.Channel);
      return {
        legacy_id: requireLegacyId(record),
        channel_id: channelLegacyId
          ? channelIds.get(channelLegacyId) ?? null
          : null,
        channel_legacy_id: channelLegacyId,
        sku: text(record.SKU),
        name: text(record["Package Name"]) || requireLegacyId(record),
        chinese_name: text(record["Chinese Name"]),
        description: text(record.Description),
        price: numberValue(record.Price),
        status:
          record.Status === null || record.Status === undefined
            ? null
            : String(record.Status),
        is_active: true,
        ...metadata(record),
      };
    });

    const unresolvedChannels =
      productRows.filter(
        (row) => row.channel_legacy_id && !row.channel_id,
      ).length +
      packageRows.filter(
        (row) => row.channel_legacy_id && !row.channel_id,
      ).length;
    if (unresolvedChannels) {
      throw new Error(`${unresolvedChannels} channel references unresolved.`);
    }

    await upsertChunks(supabase, "products", productRows);
    await upsertChunks(supabase, "packages", packageRows);

    const productIds = await idMap(supabase, "products");
    const packageIds = await idMap(supabase, "packages");
    const packageProductSource = await fetchType("s_packages_product");
    const packageProductRows = packageProductSource.map((record) => {
      const packageLegacyId = text(record.Package);
      const productLegacyId = text(record.Product);
      return {
        legacy_id: requireLegacyId(record),
        package_id: packageLegacyId
          ? packageIds.get(packageLegacyId) ?? null
          : null,
        package_legacy_id: packageLegacyId,
        product_id: productLegacyId
          ? productIds.get(productLegacyId) ?? null
          : null,
        product_legacy_id: productLegacyId,
        package_choice_set_legacy_id: text(record.Package_ChoiceSet),
        quantity: numberValue(record.Quantity),
        addon_price: numberValue(record["Add-on Price"]),
        is_selected: booleanValue(record.Selected),
        ...metadata(record),
      };
    });

    const unresolvedPackageProducts = packageProductRows.filter(
      (row) =>
        (row.package_legacy_id && !row.package_id) ||
        (row.product_legacy_id && !row.product_id),
    ).length;
    if (unresolvedPackageProducts) {
      throw new Error(
        `${unresolvedPackageProducts} package/product references unresolved.`,
      );
    }

    await upsertChunks(
      supabase,
      "package_products",
      packageProductRows,
    );

    return jsonResponse({
      status: "completed",
      snapshotAt: SNAPSHOT_AT,
      imported: {
        customers: 0,
        products: productRows.length,
        packages: packageRows.length,
        package_products: packageProductRows.length,
      },
      unresolvedReferences: 0,
      total:
        productRows.length +
        packageRows.length +
        packageProductRows.length,
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
          : "Phase B import failed.";
    return jsonResponse({ error: message }, 400);
  }
});

