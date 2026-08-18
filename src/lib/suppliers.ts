import { supabase } from "@/lib/supabase";

export type SupplierLinkedItem = {
  id: string;
  name: string;
};

export type SupplierRow = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phoneNumber: string | null;
  deliverySchedule: string | null;
  paymentSchedule: string | null;
  comment: string | null;
  isActive: boolean;
  cateringIngredients: SupplierLinkedItem[];
  rawMeatItems: SupplierLinkedItem[];
  restaurantIngredients: SupplierLinkedItem[];
  createdAt: string;
};

export type SupplierStatusFilter = "active" | "inactive" | "";

export type SupplierFilters = {
  search?: string;
  status?: SupplierStatusFilter;
};

export type SupplierWriteInput = {
  companyName: string;
  contactPerson: string | null;
  phoneNumber: string | null;
  deliverySchedule: string | null;
  paymentSchedule: string | null;
  comment: string | null;
  isActive: boolean;
};

type SupplierDbRow = {
  id: string;
  company_name: string;
  contact_person: string | null;
  phone_number: string | null;
  delivery_schedule: string | null;
  payment_schedule: string | null;
  comment: string | null;
  is_active: boolean;
  bubble_created_at: string | null;
  created_at: string;
};

const SUPPLIER_SELECT_FIELDS =
  "id,company_name,contact_person,phone_number,delivery_schedule,payment_schedule,comment,is_active,bubble_created_at,created_at";

function mapSupplier(row: SupplierDbRow): SupplierRow {
  return {
    id: row.id,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    phoneNumber: row.phone_number,
    deliverySchedule: row.delivery_schedule,
    paymentSchedule: row.payment_schedule,
    comment: row.comment,
    isActive: row.is_active,
    cateringIngredients: [],
    rawMeatItems: [],
    restaurantIngredients: [],
    createdAt: row.bubble_created_at || row.created_at,
  };
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

function matchesSearch(row: SupplierRow, search: string) {
  if (!search) return true;
  return (
    includesIgnoreCase(row.companyName, search) ||
    includesIgnoreCase(row.contactPerson, search) ||
    includesIgnoreCase(row.phoneNumber, search) ||
    includesIgnoreCase(row.comment, search) ||
    row.cateringIngredients.some((item) =>
      includesIgnoreCase(item.name, search),
    ) ||
    row.rawMeatItems.some((item) => includesIgnoreCase(item.name, search)) ||
    row.restaurantIngredients.some((item) =>
      includesIgnoreCase(item.name, search),
    )
  );
}

function matchesStatus(row: SupplierRow, status: SupplierStatusFilter) {
  if (!status) return true;
  return status === "active" ? row.isActive : !row.isActive;
}

function toLinkedItems(
  rows: Array<{ id: string; name: string | null }> | null | undefined,
): SupplierLinkedItem[] {
  return (rows ?? [])
    .map((row) => ({
      id: row.id,
      name: (row.name ?? "").trim(),
    }))
    .filter((item) => item.name)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));
}

async function linkedItems() {
  const [cateringResult, rawMeatResult, restaurantResult] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, supplier_id")
      .not("supplier_id", "is", null),
    supabase
      .from("raw_meat_item_suppliers")
      .select("supplier_id, raw_meat_items(id, name)"),
    supabase
      .from("restaurant_ingredients")
      .select("id, name, supplier_id")
      .not("supplier_id", "is", null),
  ]);

  // The linked tables have their own role-based RLS (raw meat is available
  // to Factory, restaurant ingredients only to finance/shop roles). A missing
  // permission on one link table should degrade to no links for that
  // category instead of failing the whole supplier list.
  const catering = new Map<string, SupplierLinkedItem[]>();
  if (!cateringResult.error) {
    for (const row of (cateringResult.data ?? []) as Array<{
      id: string;
      name: string | null;
      supplier_id: string | null;
    }>) {
      if (!row.supplier_id) continue;
      const list = catering.get(row.supplier_id) ?? [];
      const name = (row.name ?? "").trim();
      if (name) list.push({ id: row.id, name });
      catering.set(row.supplier_id, list);
    }
  }

  const rawMeat = new Map<string, SupplierLinkedItem[]>();
  if (!rawMeatResult.error) {
    for (const row of (rawMeatResult.data ?? []) as Array<{
      supplier_id: string | null;
      raw_meat_items:
        | Array<{ id: string; name: string | null }>
        | { id: string; name: string | null }
        | null;
    }>) {
      if (!row.supplier_id) continue;
      const items = Array.isArray(row.raw_meat_items)
        ? row.raw_meat_items
        : row.raw_meat_items
          ? [row.raw_meat_items]
          : [];
      const list = rawMeat.get(row.supplier_id) ?? [];
      for (const item of items) {
        const name = (item.name ?? "").trim();
        if (name) list.push({ id: item.id, name });
      }
      rawMeat.set(row.supplier_id, list);
    }
  }

  const restaurant = new Map<string, SupplierLinkedItem[]>();
  if (!restaurantResult.error) {
    for (const row of (restaurantResult.data ?? []) as Array<{
      id: string;
      name: string | null;
      supplier_id: string | null;
    }>) {
      if (!row.supplier_id) continue;
      const list = restaurant.get(row.supplier_id) ?? [];
      const name = (row.name ?? "").trim();
      if (name) list.push({ id: row.id, name });
      restaurant.set(row.supplier_id, list);
    }
  }

  return { catering, rawMeat, restaurant };
}

export async function fetchSuppliers(
  filters: SupplierFilters = {},
): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT_FIELDS)
    .is("archived_at", null)
    .order("company_name", { ascending: true });

  if (error) throw error;

  const { catering, rawMeat, restaurant } = await linkedItems();

  const search = filters.search?.trim() ?? "";
  const status = filters.status ?? "";
  return ((data ?? []) as SupplierDbRow[])
    .map((row) => {
      const mapped = mapSupplier(row);
      mapped.cateringIngredients = toLinkedItems(
        (catering.get(row.id) ?? []).map((item) => ({ id: item.id, name: item.name })),
      );
      mapped.rawMeatItems = toLinkedItems(
        (rawMeat.get(row.id) ?? []).map((item) => ({ id: item.id, name: item.name })),
      );
      mapped.restaurantIngredients = toLinkedItems(
        (restaurant.get(row.id) ?? []).map((item) => ({ id: item.id, name: item.name })),
      );
      return mapped;
    })
    .filter(
      (row) => matchesSearch(row, search) && matchesStatus(row, status),
    );
}

function writeFields(input: SupplierWriteInput) {
  const companyName = input.companyName.trim();
  if (!companyName) throw new Error("company_name_required");
  const clean = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    company_name: companyName,
    contact_person: clean(input.contactPerson),
    phone_number: clean(input.phoneNumber),
    delivery_schedule: clean(input.deliverySchedule),
    payment_schedule: clean(input.paymentSchedule),
    comment: clean(input.comment),
    is_active: input.isActive,
  };
}

export async function createSupplier(
  input: SupplierWriteInput,
): Promise<SupplierRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();
  const legacyId = `web-supplier-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      legacy_id: legacyId,
      ...fields,
      bubble_created_at: now,
      bubble_modified_at: now,
      created_at: now,
    })
    .select(SUPPLIER_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapSupplier(data as SupplierDbRow);
}

export async function updateSupplier(
  supplierId: string,
  input: SupplierWriteInput,
): Promise<SupplierRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("suppliers")
    .update({
      ...fields,
      bubble_modified_at: now,
    })
    .eq("id", supplierId)
    .select(SUPPLIER_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapSupplier(data as SupplierDbRow);
}

export async function archiveSupplier(supplierId: string): Promise<void> {
  const { error } = await supabase
    .from("suppliers")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId);
  if (error) throw error;
}
