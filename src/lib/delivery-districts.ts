import { supabase } from "@/lib/supabase";

export const DELIVERY_DISTRICTS_PAGE_SIZE = 15;

export type DeliveryDistrict = {
  id: string;
  ids: string[];
  name: string;
};

export type DeliveryDistrictResult = {
  items: DeliveryDistrict[];
  total: number;
};

export type DeliveryDistrictWriteInput = {
  name: string;
};

type DistrictRow = {
  id: string;
  name: string;
};

function displayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedName(value: string) {
  return displayName(value).normalize("NFKC").toLocaleLowerCase("zh-HK");
}

export function groupDeliveryDistrictRows(rows: readonly DistrictRow[]): DeliveryDistrict[] {
  const grouped = new Map<string, DeliveryDistrict>();
  for (const row of rows) {
    const name = displayName(row.name);
    const key = normalizedName(name);
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) existing.ids.push(row.id);
    else grouped.set(key, { id: row.id, ids: [row.id], name });
  }
  return [...grouped.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-HK"),
  );
}

function safeSearch(value: string) {
  return value.replace(/[^\p{L}\p{N}\s@+\-_.]/gu, " ").replace(/\s+/g, " ").trim();
}

async function fetchAllDistrictRows(search: string): Promise<DistrictRow[]> {
  const batchSize = 1000;
  const rows: DistrictRow[] = [];
  const term = safeSearch(search);
  for (let start = 0; ; start += batchSize) {
    let query = supabase
      .from("delivery_districts")
      .select("id,name")
      .is("archived_at", null)
      .order("name")
      .range(start, start + batchSize - 1);
    if (term) query = query.ilike("name", `%${term}%`);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as DistrictRow[];
    rows.push(...batch);
    if (batch.length < batchSize) return rows;
  }
}

export async function fetchDeliveryDistricts({
  page,
  search,
}: {
  page: number;
  search: string;
}): Promise<DeliveryDistrictResult> {
  const grouped = groupDeliveryDistrictRows(await fetchAllDistrictRows(search));
  const start = (page - 1) * DELIVERY_DISTRICTS_PAGE_SIZE;
  return {
    items: grouped.slice(start, start + DELIVERY_DISTRICTS_PAGE_SIZE),
    total: grouped.length,
  };
}

function writeFields(input: DeliveryDistrictWriteInput) {
  const name = displayName(input.name);
  if (!name) throw new Error("district_name_required");
  return { name, updated_at: new Date().toISOString() };
}

export async function createDeliveryDistrict(input: DeliveryDistrictWriteInput) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("delivery_districts").insert({
    legacy_id: `web-delivery-district-${crypto.randomUUID()}`,
    bubble_created_at: now,
    ...writeFields(input),
  });
  if (error) throw error;
}

export async function updateDeliveryDistrict(ids: readonly string[], input: DeliveryDistrictWriteInput) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("delivery_districts")
    .update(writeFields(input))
    .in("id", [...ids])
    .is("archived_at", null);
  if (error) throw error;
}

export async function archiveDeliveryDistrict(ids: readonly string[]) {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("delivery_districts")
    .update({ archived_at: now, updated_at: now })
    .in("id", [...ids])
    .is("archived_at", null);
  if (error) throw error;
}
