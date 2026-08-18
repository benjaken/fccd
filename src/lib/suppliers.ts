import { supabase } from "@/lib/supabase";

export type SupplierRow = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phoneNumber: string | null;
  deliverySchedule: string | null;
  paymentSchedule: string | null;
  comment: string | null;
  isActive: boolean;
  suppliesRawMeat: boolean;
  suppliesRestaurantIngredients: boolean;
  createdAt: string;
};

export type SupplierStatusFilter = "active" | "inactive" | "";

export type SupplierFilters = {
  search?: string;
  status?: SupplierStatusFilter;
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
    suppliesRawMeat: false,
    suppliesRestaurantIngredients: false,
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
    includesIgnoreCase(row.comment, search)
  );
}

function matchesStatus(row: SupplierRow, status: SupplierStatusFilter) {
  if (!status) return true;
  return status === "active" ? row.isActive : !row.isActive;
}

async function linkedSupplierIds() {
  const [rawMeatResult, restaurantResult] = await Promise.all([
    supabase.from("raw_meat_item_suppliers").select("supplier_id"),
    supabase
      .from("restaurant_ingredients")
      .select("supplier_id")
      .not("supplier_id", "is", null),
  ]);

  // The linked tables have their own role-based RLS (raw meat is available
  // to Factory, restaurant ingredients only to finance/shop roles). A missing
  // permission on one link table should degrade to "no links" for that
  // category instead of failing the whole supplier list.
  const rawMeatIds = new Set<string>();
  if (!rawMeatResult.error) {
    for (const row of (rawMeatResult.data ?? []) as Array<{
      supplier_id: string | null;
    }>) {
      if (row.supplier_id) rawMeatIds.add(row.supplier_id);
    }
  }
  const restaurantIds = new Set<string>();
  if (!restaurantResult.error) {
    for (const row of (restaurantResult.data ?? []) as Array<{
      supplier_id: string | null;
    }>) {
      if (row.supplier_id) restaurantIds.add(row.supplier_id);
    }
  }
  return { rawMeatIds, restaurantIds };
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

  const { rawMeatIds, restaurantIds } = await linkedSupplierIds();

  const search = filters.search?.trim() ?? "";
  const status = filters.status ?? "";
  return ((data ?? []) as SupplierDbRow[])
    .map((row) => {
      const mapped = mapSupplier(row);
      mapped.suppliesRawMeat = rawMeatIds.has(row.id);
      mapped.suppliesRestaurantIngredients = restaurantIds.has(row.id);
      return mapped;
    })
    .filter(
      (row) => matchesSearch(row, search) && matchesStatus(row, status),
    );
}
