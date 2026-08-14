import { supabase } from "@/lib/supabase";

export type MeatCustomerRow = {
  id: string;
  customerCode: string | null;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  deliveryNoteRequired: boolean;
};

export type MeatCustomerFilters = {
  search?: string;
  customerCode?: string;
  name?: string;
  phone?: string;
};

type CustomerRow = {
  id: string;
  customer_code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  delivery_note_required: boolean | null;
};

function mapRow(row: CustomerRow): MeatCustomerRow {
  return {
    id: row.id,
    customerCode: row.customer_code,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    address: row.address,
    deliveryNoteRequired: Boolean(row.delivery_note_required),
  };
}

function nullifTrim(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

export function filterMeatCustomers(
  rows: MeatCustomerRow[],
  filters: MeatCustomerFilters = {},
) {
  const search = filters.search?.trim() ?? "";
  const customerCode = filters.customerCode?.trim() ?? "";
  const name = filters.name?.trim() ?? "";
  const phone = filters.phone?.trim() ?? "";

  return rows.filter((row) => {
    if (customerCode && !includesIgnoreCase(row.customerCode, customerCode)) {
      return false;
    }
    if (name && !includesIgnoreCase(row.name, name)) return false;
    if (phone && !includesIgnoreCase(row.phone, phone)) return false;
    if (!search) return true;
    return (
      includesIgnoreCase(row.customerCode, search) ||
      includesIgnoreCase(row.name, search) ||
      includesIgnoreCase(row.contactPerson, search) ||
      includesIgnoreCase(row.phone, search) ||
      includesIgnoreCase(row.address, search)
    );
  });
}

export async function fetchMeatCustomers(
  filters: MeatCustomerFilters = {},
): Promise<MeatCustomerRow[]> {
  const { data, error } = await supabase
    .from("meat_customers")
    .select(
      "id,customer_code,name,contact_person,phone,address,delivery_note_required",
    )
    .is("archived_at", null)
    .order("bubble_modified_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return filterMeatCustomers(
    ((data ?? []) as CustomerRow[]).map(mapRow),
    filters,
  );
}

export type MeatCustomerWriteInput = {
  customerCode?: string | null;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  address?: string | null;
};

function writeFields(input: MeatCustomerWriteInput) {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  return {
    customer_code: nullifTrim(input.customerCode),
    name,
    contact_person: nullifTrim(input.contactPerson),
    phone: nullifTrim(input.phone),
    address: nullifTrim(input.address),
  };
}

export async function createMeatCustomer(
  input: MeatCustomerWriteInput,
): Promise<MeatCustomerRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();
  const legacyId = `web-meat-customer-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("meat_customers")
    .insert({
      legacy_id: legacyId,
      ...fields,
      delivery_note_required: false,
      bubble_created_at: now,
      bubble_modified_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id,customer_code,name,contact_person,phone,address,delivery_note_required",
    )
    .single();

  if (error) throw error;
  return mapRow(data as CustomerRow);
}

export async function updateMeatCustomer(
  customerId: string,
  input: MeatCustomerWriteInput,
): Promise<MeatCustomerRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("meat_customers")
    .update({
      ...fields,
      bubble_modified_at: now,
      updated_at: now,
    })
    .eq("id", customerId)
    .is("archived_at", null)
    .select(
      "id,customer_code,name,contact_person,phone,address,delivery_note_required",
    )
    .single();

  if (error) throw error;
  return mapRow(data as CustomerRow);
}

export async function archiveMeatCustomer(customerId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_meat_customer", {
    p_customer_id: customerId,
  });
  if (error) throw error;
}
