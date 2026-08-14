import { supabase } from "@/lib/supabase";

export const MEAT_DELIVERY_NOTES_PAGE_SIZE = 15;

export type MeatDeliveryNoteRow = {
  id: string;
  orderNumber: string | null;
  shippingAt: string | null;
  shopName: string | null;
  shippingMethodName: string | null;
  remarks: string | null;
};

export type MeatDeliveryNoteListFilters = {
  page: number;
  search?: string;
};

export type MeatDeliveryNoteListResult = {
  items: MeatDeliveryNoteRow[];
  total: number;
};

type NestedName = { name: string | null } | { name: string | null }[] | null;

type DeliveryNoteRow = {
  id: string;
  order_number: string | null;
  shipping_at: string | null;
  remarks: string | null;
  meat_customers: NestedName;
  meat_shipping_methods: NestedName;
};

function nestedName(value: NestedName) {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.name?.trim();
  return name || null;
}

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapRow(row: DeliveryNoteRow): MeatDeliveryNoteRow {
  return {
    id: row.id,
    orderNumber: row.order_number,
    shippingAt: row.shipping_at,
    shopName: nestedName(row.meat_customers),
    shippingMethodName: nestedName(row.meat_shipping_methods),
    remarks: row.remarks,
  };
}

export async function fetchMeatDeliveryNotes({
  page,
  search,
}: MeatDeliveryNoteListFilters): Promise<MeatDeliveryNoteListResult> {
  const start = (page - 1) * MEAT_DELIVERY_NOTES_PAGE_SIZE;
  const end = start + MEAT_DELIVERY_NOTES_PAGE_SIZE - 1;
  let query = supabase
    .from("meat_orders")
    .select(
      "id,order_number,shipping_at,remarks,meat_customers(name),meat_shipping_methods(name)",
      { count: "exact" },
    )
    .order("shipping_at", { ascending: false, nullsFirst: false })
    .order("order_number", { ascending: false, nullsFirst: false })
    .range(start, end);

  const term = safeSearchTerm(search ?? "");
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,remarks.ilike.%${term}%,meat_customers.name.ilike.%${term}%`,
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as DeliveryNoteRow[]).map(mapRow),
    total: count ?? 0,
  };
}

export async function deleteMeatDeliveryNote(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc("delete_meat_delivery_note", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data as string;
}
