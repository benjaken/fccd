import { supabase } from "@/lib/supabase";

export type SalesPartnerRow = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
};

export type SalesPartnerFilters = {
  search?: string;
};

export type SalesPartnerWriteInput = {
  name: string;
  phone: string;
};

type PartnerRow = {
  id: string;
  name: string;
  phone: string | null;
  bubble_created_at: string | null;
  created_at: string;
};

function mapRow(row: PartnerRow): SalesPartnerRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    createdAt: row.bubble_created_at || row.created_at,
  };
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

export function isMissingArchivedAtColumn(error: {
  message?: string;
  code?: string;
}) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    (message.includes("archived_at") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
}

export function filterSalesPartners(
  rows: SalesPartnerRow[],
  filters: SalesPartnerFilters = {},
) {
  const search = filters.search?.trim() ?? "";
  if (!search) return rows;
  return rows.filter(
    (row) =>
      includesIgnoreCase(row.name, search) ||
      includesIgnoreCase(row.phone, search),
  );
}

const SELECT_FIELDS = "id,name,phone,bubble_created_at,created_at";

function partnersQuery() {
  return supabase
    .from("sales_partners")
    .select(SELECT_FIELDS)
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function fetchSalesPartners(
  filters: SalesPartnerFilters = {},
): Promise<SalesPartnerRow[]> {
  let { data, error } = await partnersQuery().is("archived_at", null);

  // Historical Bubble rows live in sales_partners already. If the archive
  // column has not been migrated yet, still return those existing records.
  if (error && isMissingArchivedAtColumn(error)) {
    const retry = await partnersQuery();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return filterSalesPartners(
    ((data ?? []) as PartnerRow[]).map(mapRow),
    filters,
  );
}

function writeFields(input: SalesPartnerWriteInput) {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error("name_required");
  if (!phone) throw new Error("phone_required");
  return { name, phone };
}

export async function createSalesPartner(
  input: SalesPartnerWriteInput,
): Promise<SalesPartnerRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();
  const legacyId = `web-sales-partner-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("sales_partners")
    .insert({
      legacy_id: legacyId,
      ...fields,
      is_active: true,
      bubble_created_at: now,
      bubble_modified_at: now,
      created_at: now,
    })
    .select(SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapRow(data as PartnerRow);
}

export async function updateSalesPartner(
  partnerId: string,
  input: SalesPartnerWriteInput,
): Promise<SalesPartnerRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("sales_partners")
    .update({
      ...fields,
      bubble_modified_at: now,
    })
    .eq("id", partnerId)
    .select(SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapRow(data as PartnerRow);
}

export async function archiveSalesPartner(partnerId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_sales_partner", {
    p_partner_id: partnerId,
  });
  if (error) throw error;
}
