import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type BubbleRecord,
  canAdvanceCheckpoint,
  hashBubblePayload,
  partitionConflicts,
  requireLegacyId,
  sha256Hex,
} from "./helpers.ts";
import {
  coreMappings,
  type Phase,
  type Relation,
  type SourceMapping,
  unsupportedMappings,
} from "./mappings.ts";
import { remainingMappings } from "./remaining-mappings.ts";
import {
  AUGUST_OVERWRITE_CONFIRMATION,
  changedOverwriteFields,
  isFieldAwareOverwriteSourceType,
  isOverwriteSourceType,
  mergeOverwriteRow,
  normalizeOrderNumber,
  overwriteSince,
  overwriteFieldSources,
  type OverwriteSourceType,
} from "./overwrite.ts";
import {
  fallbackDeliveryLegacyId,
  orderMetadataFromRecord,
} from "./order-metadata.ts";

const BUBBLE_BASE_URL = "https://cs.foodchannels-catering.com/api/1.1/obj";
const INITIAL_CHECKPOINT = "2026-08-12T02:39:34.000Z";
const PHASE_ORDER: Phase[] = ["a", "b", "c", "d1", "d2", "e", "remaining"];
const FETCH_LIMIT = 100;
const MAX_PAGES_PER_TYPE = 100;
const INSERT_CHUNK = 250;
const QUERY_CHUNK = 100;
const SOFT_RUNTIME_MS = 60_000;
const OVERWRITE_RUNTIME_MS = 150_000;
const ORDER_METADATA_BACKFILL_CONFIRMATION = "APPLY_ORDER_METADATA_BACKFILL";

type AdminClient = ReturnType<typeof createClient<any>>;
type Checkpoint = {
  source_type: string;
  checkpoint_at: string;
  records_inserted: number;
  conflicts_logged: number;
};
type TypeResult = {
  sourceType: string;
  table: string;
  checkpoint: string;
  watermark: string;
  fetched: number;
  inserted: number;
  conflicts: number;
  junctionsInserted: number;
  metadataUpdated?: number;
  snapshotsUpdated?: number;
  pages: number;
  status: "completed" | "failed" | "resumable";
  error?: string;
  errorDetail?: string;
};

async function hydrateOrderLineSnapshots(
  client: AdminClient,
  records: BubbleRecord[],
): Promise<number> {
  const candidates = records.flatMap((record) => {
    const lineLegacyId = requireLegacyId(record);
    const productLegacyId = typeof record.Product === "string"
      ? record.Product.trim()
      : "";
    if (!productLegacyId) return [];
    return [{ lineLegacyId, productLegacyId }];
  });
  if (!candidates.length) return 0;

  const [lineRows, productRows] = await Promise.all([
    selectedLegacyRows(
      client,
      "order_lines",
      candidates.map((item) => item.lineLegacyId),
      ["id", "sku_snapshot", "product_name_snapshot"],
    ),
    selectedLegacyRows(
      client,
      "products",
      candidates.map((item) => item.productLegacyId),
      ["sku", "name", "chinese_name"],
    ),
  ]);
  const lines = new Map(
    lineRows.map((row) => [String(row.legacy_id), row]),
  );
  const products = new Map(
    productRows.map((row) => [String(row.legacy_id), row]),
  );

  let updated = 0;
  for (const candidate of candidates) {
    const line = lines.get(candidate.lineLegacyId);
    const product = products.get(candidate.productLegacyId);
    if (!line || !product) continue;
    const patch: Record<string, unknown> = {};
    if (!String(line.sku_snapshot ?? "").trim()) {
      const sku = String(product.sku ?? "").trim();
      if (sku) patch.sku_snapshot = sku;
    }
    if (!String(line.product_name_snapshot ?? "").trim()) {
      const name = String(product.name ?? product.chinese_name ?? "").trim();
      if (name) patch.product_name_snapshot = name;
    }
    if (!Object.keys(patch).length) continue;
    const { error } = await client
      .from("order_lines")
      .update(patch)
      .eq("id", line.id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    try {
      const fallback = (JSON.parse(configured) as Record<string, unknown>)
        .default;
      if (typeof fallback === "string" && fallback.trim()) {
        return fallback.trim();
      }
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS is not valid JSON.");
    }
  }
  throw new Error("Supabase server secret is not configured.");
}

async function constantTimeEqual(
  supplied: string | null,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = (supplied ?? "").length ^ expected.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authenticateCron(
  request: Request,
  client: AdminClient,
): Promise<boolean> {
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const { data, error } = await client
    .from("bubble_incremental_cron_auth")
    .select("secret_sha256")
    .eq("singleton", true)
    .single();
  if (error || !data?.secret_sha256) {
    console.error("bubble-daily-incremental cron auth is not configured");
    return false;
  }
  return constantTimeEqual(
    await sha256Hex(supplied),
    String(data.secret_sha256),
  );
}

function safeError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" &&
        "message" in error && typeof error.message === "string"
    ? error.message
    : "Unknown error";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted]")
    .slice(0, 500);
}

function errorCode(error: unknown): string {
  const message = safeError(error);
  if (message.includes("required") && message.includes("unresolved")) {
    return "unresolved_required_foreign_key";
  }
  if (message.startsWith("Bubble ")) return "bubble_fetch_failed";
  if (
    message.includes("missing _id") || message.includes("duplicate _id") ||
    message.includes("out-of-window")
  ) {
    return "invalid_bubble_record";
  }
  if (message.includes("Checkpoint changed concurrently")) {
    return "checkpoint_concurrency_conflict";
  }
  return "source_type_failed";
}

function selectedPhases(value: unknown): Phase[] {
  if (value == null || value === "" || value === "all") return PHASE_ORDER;
  if (typeof value !== "string" || !PHASE_ORDER.includes(value as Phase)) {
    throw new Error(
      "phase must be one of a, b, c, d1, d2, e, remaining, or all.",
    );
  }
  return [value as Phase];
}

function loginCodeFromRecord(record: BubbleRecord): string | null {
  const value = record.Login_code;
  if (value == null || value === "") return null;
  return String(value);
}

function bankAccountFromRecord(record: BubbleRecord): string | null {
  const value = record["payment method(text)"];
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function syncDeliveryTeamLoginCodes(
  client: AdminClient,
  records: BubbleRecord[],
): Promise<number> {
  let updated = 0;
  for (const record of records) {
    const { data, error } = await client
      .from("delivery_teams")
      .update({ login_code: loginCodeFromRecord(record) })
      .eq("legacy_id", requireLegacyId(record))
      .select("legacy_id");
    if (error) throw error;
    if (data?.length) updated += data.length;
  }
  return updated;
}

async function syncOrderShippingMethods(
  client: AdminClient,
  records: BubbleRecord[],
): Promise<number> {
  const mapping = coreMappings.find((item) => item.sourceType === "a_order");
  if (!mapping) throw new Error("a_order mapping is missing.");
  const shippingRelation = (mapping.relations ?? []).filter(
    (item) => item.idField === "shipping_method_id",
  );
  const rows = records
    .map(mapping.map)
    .filter((row) =>
      typeof row.shipping_method_legacy_id === "string" &&
      row.shipping_method_legacy_id
    );
  if (!rows.length) return 0;
  await resolveRelations(client, rows, shippingRelation);

  let updated = 0;
  for (const row of rows) {
    if (!row.shipping_method_id || typeof row.legacy_id !== "string") continue;
    const { data, error } = await client
      .from("orders")
      .update({
        shipping_method_id: row.shipping_method_id,
        shipping_method_legacy_id: row.shipping_method_legacy_id,
      })
      .eq("legacy_id", row.legacy_id)
      .is("shipping_method_id", null)
      .select("id,shipping_method_id,shipping_method_legacy_id");
    if (error) throw error;
    for (const order of data ?? []) {
      updated += 1;
      const { error: deliveryError } = await client
        .from("deliveries")
        .update({
          shipping_method_id: order.shipping_method_id,
          shipping_method_legacy_id: order.shipping_method_legacy_id,
        })
        .eq("order_id", order.id)
        .is("shipping_method_id", null);
      if (deliveryError) throw deliveryError;
    }
  }
  return updated;
}

async function backfillDeliveryTeamBankAccounts(
  client: AdminClient,
  records: BubbleRecord[],
): Promise<number> {
  let updated = 0;
  for (const record of records) {
    const bankAccount = bankAccountFromRecord(record);
    if (!bankAccount) continue;
    const { data, error } = await client
      .from("delivery_teams")
      .update({ bank_account: bankAccount })
      .eq("legacy_id", requireLegacyId(record))
      .is("bank_account", null)
      .select("legacy_id");
    if (error) throw error;
    if (data?.length) updated += data.length;
  }
  return updated;
}

async function authenticateAdmin(
  request: Request,
  client: AdminClient,
): Promise<boolean> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return false;
  const role = data.user.app_metadata?.role;
  return role === "Super Admin" || role === "Admin";
}

type OrderMetadataSyncResult = {
  tagsInserted: number;
  districtsUpdated: number;
  deliveriesCreated: number;
};

async function deliveriesByOrderId(
  client: AdminClient,
  orderIds: string[],
): Promise<Map<string, Array<{
  id: string;
  legacy_id: string;
  order_id: string;
  district_id: string | null;
}>>> {
  const result = new Map<string, Array<{
    id: string;
    legacy_id: string;
    order_id: string;
    district_id: string | null;
  }>>();
  const unique = [...new Set(orderIds)];
  for (let index = 0; index < unique.length; index += QUERY_CHUNK) {
    const { data, error } = await client
      .from("deliveries")
      .select("id,legacy_id,order_id,district_id")
      .in("order_id", unique.slice(index, index + QUERY_CHUNK))
      .order("created_at", { ascending: true });
    if (error) throw error;
    for (const row of data ?? []) {
      const orderId = String(row.order_id);
      result.set(orderId, [
        ...(result.get(orderId) ?? []),
        {
          id: String(row.id),
          legacy_id: String(row.legacy_id),
          order_id: orderId,
          district_id: row.district_id ? String(row.district_id) : null,
        },
      ]);
    }
  }
  return result;
}

async function syncOrderMetadata(
  client: AdminClient,
  records: BubbleRecord[],
): Promise<OrderMetadataSyncResult> {
  const result: OrderMetadataSyncResult = {
    tagsInserted: 0,
    districtsUpdated: 0,
    deliveriesCreated: 0,
  };
  if (!records.length) return result;

  const mapping = coreMappings.find((item) => item.sourceType === "a_order");
  if (!mapping) throw new Error("a_order mapping is missing.");
  const metadata = records.map(orderMetadataFromRecord);
  const mappedOrders = new Map(
    records.map((record) => {
      const row = mapping.map(record);
      return [String(row.legacy_id), row] as const;
    }),
  );
  const orderRows = await selectedLegacyRows(
    client,
    "orders",
    metadata.map((item) => item.orderLegacyId),
    [
      "id",
      "document_type",
      "delivery_district_id",
      "shipping_method_id",
      "shipping_method_legacy_id",
    ],
  );
  const orders = new Map(orderRows.map((row) => [String(row.legacy_id), row]));
  const tagLegacyIds = metadata.flatMap((item) => item.tagLegacyIds);
  const districtLegacyIds = metadata.flatMap((item) =>
    item.districtLegacyId ? [item.districtLegacyId] : []
  );
  const [tagRows, districtRows] = await Promise.all([
    legacyIdRows(client, "order_tags", tagLegacyIds),
    legacyIdRows(client, "delivery_districts", districtLegacyIds),
  ]);
  const tags = new Map(tagRows.map((row) => [row.legacy_id, row.id]));
  const districts = new Map(
    districtRows.map((row) => [row.legacy_id, row.id]),
  );
  const unresolvedTags = tagLegacyIds.filter((id) => !tags.has(id));
  const unresolvedDistricts = districtLegacyIds.filter((id) =>
    !districts.has(id)
  );
  if (unresolvedTags.length) {
    throw new Error(
      `${new Set(unresolvedTags).size} required order_tags references are unresolved.`,
    );
  }
  if (unresolvedDistricts.length) {
    throw new Error(
      `${new Set(unresolvedDistricts).size} required delivery_districts references are unresolved.`,
    );
  }

  const tagAssignments = metadata.flatMap((item) => {
    const order = orders.get(item.orderLegacyId);
    if (!order) return [];
    return item.tagLegacyIds.map((tagLegacyId) => ({
      order_id: order.id,
      order_tag_id: tags.get(tagLegacyId),
    }));
  });
  if (tagAssignments.length) {
    result.tagsInserted = await insertOnlyJunctions(
      client,
      "order_tag_assignments",
      "order_id,order_tag_id",
      tagAssignments,
    );
  }

  const deliveries = await deliveriesByOrderId(
    client,
    orderRows.map((row) => String(row.id)),
  );
  const deliveryUpdates: Array<Record<string, unknown>> = [];
  const deliveryInserts: Array<Record<string, unknown>> = [];
  const orderDistrictUpdates: Array<{ id: string; districtId: string }> = [];
  for (const item of metadata) {
    if (!item.districtLegacyId) continue;
    const order = orders.get(item.orderLegacyId);
    const districtId = districts.get(item.districtLegacyId);
    if (!order || !districtId) continue;
    if (!order.delivery_district_id) {
      orderDistrictUpdates.push({ id: String(order.id), districtId });
    }
    const existing = deliveries.get(String(order.id)) ?? [];
    if (existing.length) {
      deliveryUpdates.push(...existing.flatMap((delivery) =>
        delivery.district_id ? [] : [{
          id: delivery.id,
          legacy_id: delivery.legacy_id,
          order_id: delivery.order_id,
          district_id: districtId,
          district_legacy_id: item.districtLegacyId,
        }]
      ));
      continue;
    }

    const mapped = mappedOrders.get(item.orderLegacyId) ?? {};
    if (order.document_type !== "order") continue;
    deliveryInserts.push({
      id: crypto.randomUUID(),
      legacy_id: fallbackDeliveryLegacyId(item.orderLegacyId),
      order_id: order.id,
      order_legacy_id: item.orderLegacyId,
      district_id: districtId,
      district_legacy_id: item.districtLegacyId,
      shipping_method_id: order.shipping_method_id ?? null,
      shipping_method_legacy_id:
        order.shipping_method_legacy_id ?? null,
      delivery_at: mapped.delivery_at ?? null,
      delivery_time: mapped.delivery_time ?? null,
      ship_out_time: mapped.ship_out_time ?? null,
      delivery_status: mapped.delivery_status ?? null,
      bubble_created_at: mapped.bubble_created_at ?? null,
      bubble_modified_at: mapped.bubble_modified_at ?? null,
    });
  }
  for (const update of orderDistrictUpdates) {
    const { data, error } = await client
      .from("orders")
      .update({ delivery_district_id: update.districtId })
      .eq("id", update.id)
      .is("delivery_district_id", null)
      .select("id");
    if (error) throw error;
    result.districtsUpdated += data?.length ?? 0;
  }
  for (let index = 0; index < deliveryUpdates.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from("deliveries")
      .upsert(deliveryUpdates.slice(index, index + INSERT_CHUNK), {
        onConflict: "id",
      })
      .select("id");
    if (error) throw error;
    result.districtsUpdated += data?.length ?? 0;
  }
  for (let index = 0; index < deliveryInserts.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from("deliveries")
      .upsert(deliveryInserts.slice(index, index + INSERT_CHUNK), {
        onConflict: "legacy_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    result.deliveriesCreated += data?.length ?? 0;
  }
  return result;
}

async function syncDeliveryFulfillment(
  client: AdminClient,
  records: BubbleRecord[],
): Promise<number> {
  const mapping = coreMappings.find(
    (item) => item.sourceType === "b_deliveryschedule",
  );
  if (!mapping) throw new Error("b_deliveryschedule mapping is missing.");
  const rows = records.map(mapping.map);
  await resolveRelations(client, rows, mapping.relations);

  let updated = 0;
  for (const row of rows) {
    if (typeof row.legacy_id !== "string" || !row.legacy_id) continue;
    if (
      typeof row.order_legacy_id === "string" && row.order_legacy_id &&
      typeof row.order_id === "string" && row.order_id
    ) {
      const { data: existing, error: existingError } = await client
        .from("deliveries")
        .select("id")
        .eq("legacy_id", row.legacy_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        const { error: promoteError } = await client
          .from("deliveries")
          .update({
            legacy_id: row.legacy_id,
            order_id: row.order_id,
            order_legacy_id: row.order_legacy_id,
            district_id: row.district_id ?? null,
            district_legacy_id: row.district_legacy_id ?? null,
            delivery_at: row.delivery_at ?? null,
            delivery_time: row.delivery_time ?? null,
            ship_out_time: row.ship_out_time ?? null,
            basic_fee: row.basic_fee ?? null,
            total_fee: row.total_fee ?? null,
            image_references: row.image_references ?? [],
            bubble_created_at: row.bubble_created_at ?? null,
            bubble_modified_at: row.bubble_modified_at ?? null,
          })
          .eq(
            "legacy_id",
            fallbackDeliveryLegacyId(row.order_legacy_id),
          );
        if (promoteError) throw promoteError;
      }
    }
    const { data, error } = await client
      .from("deliveries")
      .update({
        taken_at: row.taken_at ?? null,
        fulfilled_at: row.fulfilled_at ?? null,
        delivery_status: row.delivery_status ?? null,
      })
      .eq("legacy_id", row.legacy_id)
      .select("legacy_id");
    if (error) throw error;
    if (data?.length) updated += data.length;

    // Incremental imports preserve existing delivery rows. Fill a missing UUID
    // link when Bubble already has a valid fleet, without overwriting a fleet
    // that operations assigned in the new system.
    if (
      typeof row.motorcade_id === "string" && row.motorcade_id &&
      typeof row.motorcade_legacy_id === "string" && row.motorcade_legacy_id
    ) {
      const { error: motorcadeError } = await client
        .from("deliveries")
        .update({
          motorcade_id: row.motorcade_id,
          motorcade_legacy_id: row.motorcade_legacy_id,
        })
        .eq("legacy_id", row.legacy_id)
        .is("motorcade_id", null);
      if (motorcadeError) throw motorcadeError;
    }
  }
  return updated;
}

async function fetchBubbleType(
  sourceType: string,
  checkpoint: string,
  watermark: string,
  bubbleToken: string,
  deadline: number,
  constraints?: unknown[],
): Promise<{
  records: BubbleRecord[];
  pages: number;
  resumable: boolean;
}> {
  const records: BubbleRecord[] = [];
  let cursor = 0;
  let pages = 0;
  let remaining = 0;
  const queryConstraints = constraints ?? [
    {
      key: "Modified Date",
      constraint_type: "greater than",
      value: checkpoint,
    },
    {
      key: "Modified Date",
      constraint_type: "less than",
      value: watermark,
    },
  ];

  while (pages < MAX_PAGES_PER_TYPE) {
    if (Date.now() >= deadline) {
      return { records: [], pages, resumable: true };
    }
    const query = new URLSearchParams({
      limit: String(FETCH_LIMIT),
      cursor: String(cursor),
      sort_field: "Modified Date",
      descending: "false",
    });
    if (queryConstraints.length) {
      query.set("constraints", JSON.stringify(queryConstraints));
    }
    const response = await fetch(
      `${BUBBLE_BASE_URL}/${encodeURIComponent(sourceType)}?${query}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bubbleToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = await response.json().catch(() => null);
    const pageRows = payload?.response?.results;
    if (!response.ok || !Array.isArray(pageRows)) {
      throw new Error(
        `Bubble fetch for ${sourceType} failed with HTTP ${response.status}.`,
      );
    }
    records.push(...(pageRows as BubbleRecord[]));
    pages += 1;
    remaining = Number(payload.response.remaining ?? 0);
    if (!Number.isFinite(remaining) || remaining < 0) {
      throw new Error(`Bubble returned invalid pagination for ${sourceType}.`);
    }
    if (remaining === 0) break;
    if (pageRows.length === 0) {
      throw new Error(
        `Bubble pagination stalled for ${sourceType} at cursor ${cursor}.`,
      );
    }
    cursor += pageRows.length;
  }

  if (remaining > 0) return { records: [], pages, resumable: true };
  const seen = new Set<string>();
  for (const record of records) {
    const legacyId = requireLegacyId(record);
    if (seen.has(legacyId)) {
      throw new Error(`Bubble returned a duplicate _id for ${sourceType}.`);
    }
    seen.add(legacyId);
    if (constraints && constraints.length === 0) continue;
    const modified = record["Modified Date"];
    const modifiedAt = typeof modified === "string"
      ? Date.parse(modified)
      : Number.NaN;
    if (
      Number.isNaN(modifiedAt) ||
      modifiedAt <= Date.parse(checkpoint) ||
      modifiedAt >= Date.parse(watermark)
    ) {
      throw new Error(
        `Bubble returned an out-of-window record for ${sourceType}.`,
      );
    }
  }
  return { records, pages, resumable: false };
}

async function fetchBubblePage(
  sourceType: string,
  cursor: number,
  bubbleToken: string,
): Promise<{ records: BubbleRecord[]; remaining: number }> {
  const query = new URLSearchParams({
    limit: String(FETCH_LIMIT),
    cursor: String(cursor),
    sort_field: "Modified Date",
    descending: "false",
  });
  const response = await fetch(
    `${BUBBLE_BASE_URL}/${encodeURIComponent(sourceType)}?${query}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bubbleToken}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await response.json().catch(() => null);
  const pageRows = payload?.response?.results;
  const remaining = Number(payload?.response?.remaining ?? Number.NaN);
  if (
    !response.ok || !Array.isArray(pageRows) || !Number.isFinite(remaining) ||
    remaining < 0
  ) {
    throw new Error(
      `Bubble fetch for ${sourceType} failed with HTTP ${response.status}.`,
    );
  }
  if (remaining > 0 && pageRows.length === 0) {
    throw new Error(
      `Bubble pagination stalled for ${sourceType} at cursor ${cursor}.`,
    );
  }
  return { records: pageRows as BubbleRecord[], remaining };
}

async function getCheckpoint(
  client: AdminClient,
  sourceType: string,
): Promise<Checkpoint> {
  const { error: initializeError } = await client
    .from("bubble_incremental_checkpoints")
    .upsert(
      { source_type: sourceType, checkpoint_at: INITIAL_CHECKPOINT },
      { onConflict: "source_type", ignoreDuplicates: true },
    );
  if (initializeError) throw initializeError;
  const { data, error } = await client
    .from("bubble_incremental_checkpoints")
    .select(
      "source_type,checkpoint_at,records_inserted,conflicts_logged",
    )
    .eq("source_type", sourceType)
    .single();
  if (error) throw error;
  return data as Checkpoint;
}

async function legacyIdRows(
  client: AdminClient,
  table: string,
  legacyIds: string[],
): Promise<Array<{ id: string; legacy_id: string }>> {
  const rows: Array<{ id: string; legacy_id: string }> = [];
  const unique = [...new Set(legacyIds)];
  for (let index = 0; index < unique.length; index += QUERY_CHUNK) {
    const { data, error } = await client
      .from(table)
      .select("id,legacy_id")
      .in("legacy_id", unique.slice(index, index + QUERY_CHUNK));
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ id: string; legacy_id: string }>));
  }
  return rows;
}

async function resolveRelations(
  client: AdminClient,
  rows: Array<Record<string, unknown>>,
  relations: Relation[] = [],
): Promise<void> {
  for (const spec of relations) {
    const legacyIds = rows.flatMap((row) =>
      typeof row[spec.legacyField] === "string" && row[spec.legacyField]
        ? [row[spec.legacyField] as string]
        : []
    );
    if (!legacyIds.length) continue;
    const resolved = new Map(
      (await legacyIdRows(client, spec.table, legacyIds)).map((row) => [
        row.legacy_id,
        row.id,
      ]),
    );
    let unresolved = 0;
    for (const row of rows) {
      const legacyId = row[spec.legacyField];
      if (typeof legacyId !== "string" || !legacyId) continue;
      row[spec.idField] = resolved.get(legacyId) ?? null;
      if (spec.required !== false && !row[spec.idField]) unresolved += 1;
    }
    if (unresolved) {
      throw new Error(
        `${unresolved} required ${spec.table} references are unresolved.`,
      );
    }
  }
}

async function insertOnlyParents(
  client: AdminClient,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<Array<{ id: string; legacy_id: string }>> {
  const inserted: Array<{ id: string; legacy_id: string }> = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), {
        onConflict: "legacy_id",
        ignoreDuplicates: true,
      })
      .select("id,legacy_id");
    if (error) throw error;
    inserted.push(
      ...((data ?? []) as Array<{ id: string; legacy_id: string }>),
    );
  }
  return inserted;
}

async function insertOnlyJunctions(
  client: AdminClient,
  table: string,
  onConflict: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), {
        onConflict,
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function upsertJunctions(
  client: AdminClient,
  table: string,
  onConflict: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  let updated = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), { onConflict })
      .select("id");
    if (error) throw error;
    updated += data?.length ?? 0;
  }
  return updated;
}

async function backfillPaymentReports(
  client: AdminClient,
  bubbleToken: string,
  watermark: string,
  deadline: number,
) {
  const mapping = remainingMappings.find((item) => item.sourceType === "s_paymentreport");
  if (!mapping) throw new Error("payment report mapping is missing");
  const fetched = await fetchBubbleType(
    mapping.sourceType, INITIAL_CHECKPOINT, watermark, bubbleToken, deadline, [],
  );
  if (fetched.resumable) return { status: "paused" as const, fetched: 0, updated: 0, linksUpdated: 0, pages: fetched.pages };
  const rows = fetched.records.map(mapping.map);
  await resolveRelations(client, rows, mapping.relations);
  let updated = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(mapping.table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), { onConflict: "legacy_id" })
      .select("id");
    if (error) throw error;
    updated += data?.length ?? 0;
  }
  let linksUpdated = 0;
  if (mapping.children) {
    const parentRows = await legacyIdRows(client, mapping.table, fetched.records.map(requireLegacyId));
    const parentIds = new Map(parentRows.map((row) => [row.legacy_id, row.id]));
    for (const child of mapping.children(fetched.records, parentIds)) {
      await resolveRelations(client, child.rows, child.relations);
      linksUpdated += await upsertJunctions(client, child.table, child.onConflict, child.rows);
    }
  }
  return { status: "completed" as const, fetched: fetched.records.length, updated, linksUpdated, pages: fetched.pages };
}

async function logConflicts(
  client: AdminClient,
  runId: string,
  sourceType: string,
  records: BubbleRecord[],
): Promise<number> {
  let logged = 0;
  for (let index = 0; index < records.length; index += INSERT_CHUNK) {
    const values = await Promise.all(
      records.slice(index, index + INSERT_CHUNK).map(async (record) => ({
        run_id: runId,
        source_type: sourceType,
        source_legacy_id: requireLegacyId(record),
        bubble_modified_at: record["Modified Date"],
        reason: "existing_legacy_id_preserved",
        payload_sha256: await hashBubblePayload(record),
      })),
    );
    const { data, error } = await client
      .from("bubble_incremental_conflicts")
      .upsert(values, {
        onConflict: "run_id,source_type,source_legacy_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    logged += data?.length ?? 0;
  }
  return logged;
}

async function advanceCheckpoint(
  client: AdminClient,
  checkpoint: Checkpoint,
  watermark: string,
  runId: string,
  inserted: number,
  conflicts: number,
): Promise<void> {
  const { data, error } = await client
    .from("bubble_incremental_checkpoints")
    .update({
      checkpoint_at: watermark,
      last_successful_run_id: runId,
      records_inserted: Number(checkpoint.records_inserted) + inserted,
      conflicts_logged: Number(checkpoint.conflicts_logged) + conflicts,
      updated_at: new Date().toISOString(),
    })
    .eq("source_type", checkpoint.source_type)
    .eq("checkpoint_at", checkpoint.checkpoint_at)
    .select("source_type")
    .maybeSingle();
  if (error) throw error;
  if (data) return;

  const { data: current, error: currentError } = await client
    .from("bubble_incremental_checkpoints")
    .select("checkpoint_at")
    .eq("source_type", checkpoint.source_type)
    .single();
  if (currentError) throw currentError;
  if (Date.parse(current.checkpoint_at) < Date.parse(watermark)) {
    throw new Error(
      `Checkpoint changed concurrently for ${checkpoint.source_type}.`,
    );
  }
}

async function processType(
  client: AdminClient,
  mapping: SourceMapping,
  runId: string,
  watermark: string,
  bubbleToken: string,
  deadline: number,
): Promise<TypeResult> {
  const checkpoint = await getCheckpoint(client, mapping.sourceType);
  const result: TypeResult = {
    sourceType: mapping.sourceType,
    table: mapping.table,
    checkpoint: checkpoint.checkpoint_at,
    watermark,
    fetched: 0,
    inserted: 0,
    conflicts: 0,
    junctionsInserted: 0,
    pages: 0,
    status: "failed",
  };

  try {
    const fetched = await fetchBubbleType(
      mapping.sourceType,
      checkpoint.checkpoint_at,
      watermark,
      bubbleToken,
      deadline,
    );
    result.pages = fetched.pages;
    if (fetched.resumable) {
      result.status = "resumable";
      return result;
    }
    if (Date.now() >= deadline) {
      result.status = "resumable";
      return result;
    }
    result.fetched = fetched.records.length;
    if (mapping.sourceType === "ds_super_motorcade" && fetched.records.length) {
      await syncDeliveryTeamLoginCodes(client, fetched.records);
      await backfillDeliveryTeamBankAccounts(client, fetched.records);
    }
    if (mapping.sourceType === "a_order" && fetched.records.length) {
      await syncOrderShippingMethods(client, fetched.records);
    }
    if (mapping.sourceType === "b_deliveryschedule" && fetched.records.length) {
      await syncDeliveryFulfillment(client, fetched.records);
    }
    const ids = fetched.records.map(requireLegacyId);
    const existingRows = await legacyIdRows(client, mapping.table, ids);
    const existingIds = new Set(existingRows.map((row) => row.legacy_id));
    const partitioned = partitionConflicts(fetched.records, existingIds);
    result.conflicts += await logConflicts(
      client,
      runId,
      mapping.sourceType,
      partitioned.conflicts,
    );

    const parentRows = partitioned.fresh.map(mapping.map);
    await resolveRelations(client, parentRows, mapping.relations);
    const insertedParents = await insertOnlyParents(
      client,
      mapping.table,
      parentRows,
    );
    result.inserted = insertedParents.length;

    // Metadata references the order UUID, so it must run after fresh A_Order
    // rows have been inserted. Running it before the parent write silently
    // skipped tags and fallback districts on an order's first sync.
    if (mapping.sourceType === "a_order" && fetched.records.length) {
      const metadata = await syncOrderMetadata(client, fetched.records);
      result.junctionsInserted += metadata.tagsInserted;
      result.metadataUpdated =
        metadata.districtsUpdated + metadata.deliveriesCreated;
    }
    if (mapping.sourceType === "s_order" && fetched.records.length) {
      result.snapshotsUpdated = await hydrateOrderLineSnapshots(
        client,
        fetched.records,
      );
    }

    const insertedIds = new Set(
      insertedParents.map((row) => row.legacy_id),
    );
    const racingConflicts = partitioned.fresh.filter((record) =>
      !insertedIds.has(requireLegacyId(record))
    );
    result.conflicts += await logConflicts(
      client,
      runId,
      mapping.sourceType,
      racingConflicts,
    );

    const insertedRecords = partitioned.fresh.filter((record) =>
      insertedIds.has(requireLegacyId(record))
    );
    if (mapping.children && insertedRecords.length) {
      const insertedLegacyIds = insertedRecords.map(requireLegacyId);
      const allParentRows = await legacyIdRows(
        client,
        mapping.table,
        insertedLegacyIds,
      );
      const parentIds = new Map(
        allParentRows.map((row) => [row.legacy_id, row.id]),
      );
      if (parentIds.size !== new Set(insertedLegacyIds).size) {
        throw new Error("Unable to resolve newly inserted parent rows.");
      }
      for (const child of mapping.children(insertedRecords, parentIds)) {
        await resolveRelations(client, child.rows, child.relations);
        result.junctionsInserted += await insertOnlyJunctions(
          client,
          child.table,
          child.onConflict,
          child.rows,
        );
      }
    }

    if (canAdvanceCheckpoint(true, false, false)) {
      await advanceCheckpoint(
        client,
        checkpoint,
        watermark,
        runId,
        result.inserted,
        result.conflicts,
      );
    }
    result.status = "completed";
    return result;
  } catch (error) {
    result.status = "failed";
    result.error = errorCode(error);
    result.errorDetail = safeError(error);
    console.error(
      `bubble-daily-incremental source failed: ${mapping.sourceType} (${result.error})`,
    );
    return result;
  }
}

type OverwriteMode = "dry-run" | "apply";

async function selectedLegacyRows(
  client: AdminClient,
  table: string,
  legacyIds: string[],
  fields: string[],
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  const unique = [...new Set(legacyIds)];
  const select = [...new Set(["legacy_id", ...fields])].join(",");
  for (let index = 0; index < unique.length; index += QUERY_CHUNK) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .in("legacy_id", unique.slice(index, index + QUERY_CHUNK));
    if (error) throw error;
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  return rows;
}

async function activeShopifyOrderNumbers(
  client: AdminClient,
): Promise<Map<string, Array<{ id: string; legacy_id: string }>>> {
  const { data, error } = await client
    .from("orders")
    .select("id,legacy_id,order_number")
    .is("archived_at", null)
    .or("source_system.eq.shopify,shopify_order_id.not.is.null");
  if (error) throw error;
  const result = new Map<string, Array<{ id: string; legacy_id: string }>>();
  for (const row of data ?? []) {
    const key = normalizeOrderNumber(row.order_number);
    if (!key) continue;
    const values = result.get(key) ?? [];
    values.push({ id: String(row.id), legacy_id: String(row.legacy_id) });
    result.set(key, values);
  }
  return result;
}

async function writeOverwriteRows(
  client: AdminClient,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  let written = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), {
        onConflict: "legacy_id",
      })
      .select("legacy_id");
    if (error) throw error;
    written += data?.length ?? 0;
  }
  return written;
}

async function replaceOverwriteChildren(
  client: AdminClient,
  mapping: SourceMapping,
  records: BubbleRecord[],
): Promise<{ deleted: number; written: number }> {
  if (!mapping.children || records.length === 0) {
    return { deleted: 0, written: 0 };
  }
  const parentRows = await legacyIdRows(
    client,
    mapping.table,
    records.map(requireLegacyId),
  );
  if (parentRows.length !== records.length) {
    throw new Error("Overwrite child rebuild could not resolve every parent.");
  }
  const parentIds = new Map(parentRows.map((row) => [row.legacy_id, row.id]));
  let deleted = 0;
  let written = 0;
  for (const child of mapping.children(records, parentIds)) {
    const parentField = child.onConflict.split(",")[0]?.trim();
    if (!parentField) throw new Error("Overwrite child conflict key is invalid.");
    const ids = parentRows.map((row) => row.id);
    for (let index = 0; index < ids.length; index += QUERY_CHUNK) {
      const { data, error } = await client
        .from(child.table)
        .delete()
        .in(parentField, ids.slice(index, index + QUERY_CHUNK))
        .select("id");
      if (error) throw error;
      deleted += data?.length ?? 0;
    }
    await resolveRelations(client, child.rows, child.relations);
    written += await upsertJunctions(
      client,
      child.table,
      child.onConflict,
      child.rows,
    );
  }
  return { deleted, written };
}

async function processAugustOverwrite(
  client: AdminClient,
  sourceType: OverwriteSourceType,
  mode: OverwriteMode,
  watermark: string,
  bubbleToken: string,
  deadline: number,
) {
  const since = overwriteSince(sourceType);
  const mapping = [...coreMappings, ...remainingMappings].find((item) =>
    item.sourceType === sourceType
  );
  if (!mapping) throw new Error("Overwrite source mapping is unavailable.");
  const fetched = await fetchBubbleType(
    sourceType,
    since,
    watermark,
    bubbleToken,
    deadline,
  );
  if (fetched.resumable) {
    return { status: "paused" as const, sourceType, pages: fetched.pages };
  }

  const mappedRows = fetched.records.map(mapping.map);
  await resolveRelations(client, mappedRows, mapping.relations);
  const fieldAware = isFieldAwareOverwriteSourceType(sourceType);
  const fields = fieldAware
    ? [
      ...Object.keys(overwriteFieldSources[sourceType]),
      ...(sourceType === "a_order"
        ? ["shopify_order_id", "payment_status_source"]
        : []),
    ]
    : [...new Set(mappedRows.flatMap((row) => Object.keys(row)))].filter(
      (field) => field !== "legacy_id",
    );
  const existingRows = await selectedLegacyRows(
    client,
    mapping.table,
    fetched.records.map(requireLegacyId),
    fields,
  );
  const existingByLegacyId = new Map(
    existingRows.map((row) => [String(row.legacy_id), row]),
  );
  const shopifyNumbers = sourceType === "a_order"
    ? await activeShopifyOrderNumbers(client)
    : new Map<string, Array<{ id: string; legacy_id: string }>>();
  const rowsToWrite: Array<Record<string, unknown>> = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let blockedShopifyDuplicates = 0;
  let activeShopifyShadows = 0;
  const changedFieldCounts: Record<string, number> = {};
  const changePreview: Array<{
    legacyId: string;
    changedFields: string[];
    newValues: Record<string, unknown>;
  }> = [];

  for (let index = 0; index < fetched.records.length; index += 1) {
    const source = fetched.records[index];
    const mapped = mappedRows[index];
    const legacyId = requireLegacyId(source);
    const existing = existingByLegacyId.get(legacyId);
    const orderKey = sourceType === "a_order"
      ? normalizeOrderNumber(mapped.order_number)
      : "";
    const otherShopifyRows = orderKey
      ? (shopifyNumbers.get(orderKey) ?? []).filter((row) =>
        row.legacy_id !== legacyId
      )
      : [];
    if (otherShopifyRows.length) activeShopifyShadows += 1;
    if (!existing && otherShopifyRows.length) {
      blockedShopifyDuplicates += 1;
      continue;
    }
    const row = fieldAware
      ? mergeOverwriteRow(sourceType, source, mapped, existing)
      : mapped;
    const changedFields = existing ? changedOverwriteFields(row, existing) : [];
    if (!existing) inserted += 1;
    else if (changedFields.length) updated += 1;
    else unchanged += 1;
    for (const field of changedFields) {
      changedFieldCounts[field] = (changedFieldCounts[field] ?? 0) + 1;
    }
    if (changedFields.length && changePreview.length < 100) {
      changePreview.push({
        legacyId,
        changedFields,
        newValues: Object.fromEntries(
          changedFields.map((field) => [field, row[field]]),
        ),
      });
    }
    if (!existing || changedFields.length) {
      rowsToWrite.push(row);
    }
  }

  const written = mode === "apply"
    ? await writeOverwriteRows(client, mapping.table, rowsToWrite)
    : 0;
  if (mode === "apply" && written !== rowsToWrite.length) {
    throw new Error("Overwrite write count did not match the dry-run set.");
  }
  const children = mode === "apply" && !fieldAware
    ? await replaceOverwriteChildren(client, mapping, fetched.records)
    : { deleted: 0, written: 0 };
  return {
    status: "completed" as const,
    operation: "august_2026_overwrite",
    mode,
    sourceType,
    table: mapping.table,
    since,
    watermark,
    fetched: fetched.records.length,
    inserted,
    updated,
    unchanged,
    blockedShopifyDuplicates,
    activeShopifyShadows,
    changedFieldCounts,
    changePreview,
    written,
    childRowsDeleted: children.deleted,
    childRowsWritten: children.written,
    pages: fetched.pages,
  };
}

async function handleRequest(request: Request): Promise<Response> {
  const invocationStartedAt = new Date().toISOString();
  const watermark = invocationStartedAt;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let client: AdminClient;
  try {
    client = createClient<any>(requiredEnv("SUPABASE_URL"), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    console.error("bubble-daily-incremental configuration error");
    return jsonResponse({ error: "Function is not configured." }, 500);
  }
  const body = await request.json().catch(() => ({}));
  const cronAuthenticated = await authenticateCron(request, client);
  const adminBackfillRequested =
    body?.backfillOrderMetadata === true &&
    body?.confirmation === ORDER_METADATA_BACKFILL_CONFIRMATION;
  const adminOverwriteRequested = body?.overwrite != null;
  if (
    !cronAuthenticated &&
    !((adminBackfillRequested || adminOverwriteRequested) &&
      await authenticateAdmin(request, client))
  ) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }
  let bubbleToken: string;
  try {
    bubbleToken = requiredEnv("BUBBLE_API_TOKEN")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!bubbleToken) throw new Error("Bubble token is empty.");
  } catch {
    console.error("bubble-daily-incremental Bubble token is not configured");
    return jsonResponse({ error: "Function is not configured." }, 500);
  }

  let phases: Phase[];
  let requestedSourceType: string | null = null;
  let backfillLoginCodes = false;
  let backfillPaymentReportsRequested = false;
  let backfillOrderMetadataRequested = false;
  let orderMetadataBackfillCursor = 0;
  let overwriteRequest: {
    mode: OverwriteMode;
    sourceType: OverwriteSourceType;
    watermark: string;
  } | null = null;
  try {
    backfillLoginCodes = body?.backfillLoginCodes === true;
    backfillPaymentReportsRequested = body?.backfillPaymentReports === true;
    backfillOrderMetadataRequested = body?.backfillOrderMetadata === true;
    if (
      backfillOrderMetadataRequested &&
      body?.confirmation !== ORDER_METADATA_BACKFILL_CONFIRMATION
    ) {
      throw new Error("order metadata backfill confirmation is invalid.");
    }
    if (backfillOrderMetadataRequested) {
      const cursor = body?.cursor ?? 0;
      if (!Number.isInteger(cursor) || cursor < 0) {
        throw new Error("order metadata backfill cursor is invalid.");
      }
      orderMetadataBackfillCursor = cursor;
    }
    phases = selectedPhases(body?.phase);
    if (body?.overwrite != null) {
      const mode = body.overwrite.mode;
      if (mode !== "dry-run" && mode !== "apply") {
        throw new Error("overwrite.mode must be dry-run or apply.");
      }
      if (!isOverwriteSourceType(body.overwrite.sourceType)) {
        throw new Error("overwrite.sourceType is not approved.");
      }
      const overwriteCheckpoint = overwriteSince(body.overwrite.sourceType);
      const overwriteWatermark = mode === "dry-run"
        ? String(body.overwrite.watermark ?? invocationStartedAt)
        : String(body.overwrite.watermark ?? "");
      if (
        !overwriteWatermark ||
        Number.isNaN(Date.parse(overwriteWatermark)) ||
        Date.parse(overwriteWatermark) <= Date.parse(overwriteCheckpoint) ||
        Date.parse(overwriteWatermark) > Date.parse(invocationStartedAt)
      ) {
        throw new Error("overwrite.watermark is invalid.");
      }
      if (
        mode === "apply" &&
        body.overwrite.confirmation !== AUGUST_OVERWRITE_CONFIRMATION
      ) {
        throw new Error("overwrite confirmation is invalid.");
      }
      overwriteRequest = {
        mode,
        sourceType: body.overwrite.sourceType,
        watermark: new Date(overwriteWatermark).toISOString(),
      };
    }
    if (body?.sourceType != null) {
      if (
        typeof body.sourceType !== "string" ||
        !body.sourceType ||
        body.sourceType.length > 120
      ) {
        throw new Error("sourceType must be a valid Bubble type.");
      }
      requestedSourceType = body.sourceType;
    }
  } catch (error) {
    return jsonResponse({ error: safeError(error) }, 400);
  }

  if (overwriteRequest) {
    const deadline = Date.parse(invocationStartedAt) + OVERWRITE_RUNTIME_MS;
    let overwriteRunId: string | null = null;
    try {
      if (overwriteRequest.mode === "apply") {
        const { data: overwriteRun, error: overwriteRunError } = await client
          .from("migration")
          .insert({
            migration_key:
              `bubble-august-overwrite-${overwriteRequest.sourceType}-${invocationStartedAt}-${crypto.randomUUID()}`,
            mode: "reconciliation",
            status: "running",
            source_system: "bubble",
            target_system: "supabase",
            snapshot_at: overwriteRequest.watermark,
            checkpoint_at: overwriteSince(overwriteRequest.sourceType),
            started_at: invocationStartedAt,
            details: {
              operation: "august_2026_overwrite",
              source_type: overwriteRequest.sourceType,
              watermark: overwriteRequest.watermark,
            },
          })
          .select("id")
          .single();
        if (overwriteRunError || !overwriteRun) {
          throw new Error("Unable to create overwrite audit run.");
        }
        overwriteRunId = String(overwriteRun.id);
      }
      const result = await processAugustOverwrite(
        client,
        overwriteRequest.sourceType,
        overwriteRequest.mode,
        overwriteRequest.watermark,
        bubbleToken,
        deadline,
      );
      if (overwriteRunId) {
        const { error: auditError } = await client.from("migration").update({
          status: result.status === "paused" ? "paused" : "completed",
          records_expected: result.status === "completed" ? result.fetched : 0,
          records_processed: result.status === "completed" ? result.written : 0,
          records_failed: 0,
          error_count: 0,
          completed_at: result.status === "completed"
            ? new Date().toISOString()
            : null,
          details: result,
          updated_at: new Date().toISOString(),
        }).eq("id", overwriteRunId);
        if (auditError) throw new Error("Unable to finalize overwrite audit run.");
      }
      return jsonResponse(result, result.status === "paused" ? 202 : 200);
    } catch (error) {
      if (overwriteRunId) {
        await client.from("migration").update({
          status: "failed",
          records_failed: 1,
          error_count: 1,
          completed_at: new Date().toISOString(),
          details: {
            operation: "august_2026_overwrite",
            source_type: overwriteRequest.sourceType,
            error: errorCode(error),
          },
          updated_at: new Date().toISOString(),
        }).eq("id", overwriteRunId);
      }
      return jsonResponse({
        status: "failed",
        sourceType: overwriteRequest.sourceType,
        error: errorCode(error),
        detail: safeError(error),
      }, 500);
    }
  }

  if (backfillLoginCodes) {
    const deadline = Date.parse(invocationStartedAt) + SOFT_RUNTIME_MS;
    try {
      const fetched = await fetchBubbleType(
        "ds_super_motorcade",
        INITIAL_CHECKPOINT,
        watermark,
        bubbleToken,
        deadline,
        [],
      );
      if (fetched.resumable) {
        return jsonResponse({
          status: "paused",
          error: "login_code_backfill_incomplete",
          pages: fetched.pages,
        }, 504);
      }
      const updated = await syncDeliveryTeamLoginCodes(client, fetched.records);
      const bankAccountsUpdated = await backfillDeliveryTeamBankAccounts(
        client,
        fetched.records,
      );
      return jsonResponse({
        status: "completed",
        sourceType: "ds_super_motorcade",
        fetched: fetched.records.length,
        loginCodesUpdated: updated,
        bankAccountsUpdated,
        pages: fetched.pages,
      });
    } catch (error) {
      return jsonResponse({
        status: "failed",
        error: errorCode(error),
        detail: safeError(error),
      }, 500);
    }
  }

  if (backfillPaymentReportsRequested) {
    const deadline = Date.parse(invocationStartedAt) + SOFT_RUNTIME_MS;
    try {
      const result = await backfillPaymentReports(client, bubbleToken, watermark, deadline);
      return jsonResponse({ sourceType: "s_paymentreport", ...result }, result.status === "paused" ? 202 : 200);
    } catch (error) {
      return jsonResponse({ status: "failed", sourceType: "s_paymentreport", error: errorCode(error), detail: safeError(error) }, 500);
    }
  }

  if (backfillOrderMetadataRequested) {
    try {
      const fetched = await fetchBubblePage(
        "a_order",
        orderMetadataBackfillCursor,
        bubbleToken,
      );
      const shippingMethodsUpdated = await syncOrderShippingMethods(
        client,
        fetched.records,
      );
      const result = await syncOrderMetadata(client, fetched.records);
      const nextCursor = fetched.remaining > 0
        ? orderMetadataBackfillCursor + fetched.records.length
        : null;
      return jsonResponse({
        status: nextCursor == null ? "completed" : "paused",
        sourceType: "a_order",
        fetched: fetched.records.length,
        shippingMethodsUpdated,
        ...result,
        cursor: orderMetadataBackfillCursor,
        nextCursor,
        remaining: fetched.remaining,
      }, nextCursor == null ? 200 : 202);
    } catch (error) {
      return jsonResponse({
        status: "failed",
        sourceType: "a_order",
        error: errorCode(error),
        detail: safeError(error),
      }, 500);
    }
  }

  const invocationId = crypto.randomUUID();
  const migrationKey =
    `bubble-incremental-${invocationStartedAt}-${invocationId}`;
  const { data: run, error: runError } = await client
    .from("migration")
    .insert({
      migration_key: migrationKey,
      mode: "incremental",
      status: "running",
      source_system: "bubble",
      target_system: "supabase",
      snapshot_at: watermark,
      checkpoint_at: INITIAL_CHECKPOINT,
      started_at: invocationStartedAt,
      details: {
        invocation_id: invocationId,
        requested_phases: phases,
        requested_source_type: requestedSourceType,
        watermark,
      },
    })
    .select("id")
    .single();
  if (runError || !run) {
    console.error("bubble-daily-incremental could not create migration run");
    return jsonResponse({ error: "Unable to create migration run." }, 500);
  }

  const runId = run.id as string;
  const mappings = [...coreMappings, ...remainingMappings].filter((mapping) =>
    phases.includes(mapping.phase) &&
    (!requestedSourceType || mapping.sourceType === requestedSourceType)
  );
  if (requestedSourceType && mappings.length !== 1) {
    await client.from("migration").update({
      status: "failed",
      records_failed: 1,
      error_count: 1,
      completed_at: new Date().toISOString(),
      details: {
        invocation_id: invocationId,
        requested_phases: phases,
        requested_source_type: requestedSourceType,
        error: "source_type_not_mapped_in_phase",
      },
    }).eq("id", runId);
    return jsonResponse(
      { error: "Source type is not mapped in phase.", runId },
      400,
    );
  }
  const unsupported = phases.flatMap((phase) =>
    unsupportedMappings[phase].map((mapping) => ({ phase, mapping }))
  );
  const results: TypeResult[] = [];
  const deadline = Date.parse(invocationStartedAt) + SOFT_RUNTIME_MS;

  for (const mapping of mappings) {
    if (Date.now() >= deadline) {
      results.push({
        sourceType: mapping.sourceType,
        table: mapping.table,
        checkpoint: "",
        watermark,
        fetched: 0,
        inserted: 0,
        conflicts: 0,
        junctionsInserted: 0,
        pages: 0,
        status: "resumable",
      });
      break;
    }
    const result = await processType(
      client,
      mapping,
      runId,
      watermark,
      bubbleToken,
      deadline,
    );
    results.push(result);
    if (result.status !== "completed") break;
  }

  const aggregate = results.reduce(
    (total, result) => ({
      fetched: total.fetched + result.fetched,
      inserted: total.inserted + result.inserted,
      conflicts: total.conflicts + result.conflicts,
      junctionsInserted: total.junctionsInserted + result.junctionsInserted,
    }),
    { fetched: 0, inserted: 0, conflicts: 0, junctionsInserted: 0 },
  );
  const failed = results.filter((result) => result.status === "failed");
  const resumable = results.some((result) => result.status === "resumable");
  const status = failed.length ? "failed" : resumable ? "paused" : "completed";
  const completedAt = new Date().toISOString();
  const details = {
    invocation_id: invocationId,
    requested_phases: phases,
    requested_source_type: requestedSourceType,
    watermark,
    source_types: results,
    unsupported_mappings: unsupported,
    aggregate,
    resumable,
  };

  const { error: finishError } = await client
    .from("migration")
    .update({
      status,
      records_expected: aggregate.fetched,
      records_processed: aggregate.inserted + aggregate.conflicts,
      records_failed: failed.length,
      error_count: failed.length,
      completed_at: status === "paused" ? null : completedAt,
      details,
      updated_at: completedAt,
    })
    .eq("id", runId);
  if (finishError) {
    console.error("bubble-daily-incremental could not finalize migration run");
    return jsonResponse(
      { error: "Unable to finalize migration run.", runId },
      500,
    );
  }

  const responseBody = {
    runId,
    status,
    watermark,
    phases,
    aggregate,
    sourceTypes: results.map((result) => ({
      sourceType: result.sourceType,
      table: result.table,
      status: result.status,
      fetched: result.fetched,
      inserted: result.inserted,
      conflicts: result.conflicts,
      junctionsInserted: result.junctionsInserted,
      pages: result.pages,
      error: result.error,
      errorDetail: result.errorDetail,
    })),
    unsupportedMappings: unsupported,
    resumable,
  };
  if (failed.length) return jsonResponse(responseBody, 500);
  if (resumable) return jsonResponse(responseBody, 202);
  return jsonResponse(responseBody);
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("bubble-daily-incremental unhandled error");
    return jsonResponse(
      { error: "Unhandled synchronization error.", detail: safeError(error) },
      500,
    );
  }
});
