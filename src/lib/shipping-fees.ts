import { supabase } from "@/lib/supabase";

export const SHIPPING_FEES_PAGE_SIZE = 15;

export type ShippingFee = {
  id: string;
  item: string;
  fee: number;
  createdAt: string;
};

export type ShippingFeePage = {
  rows: ShippingFee[];
  total: number;
};

type ShippingFeeRow = {
  id: string;
  item: string;
  fee: number | string;
  created_at: string;
};

const SELECT_FIELDS = "id,item,fee,created_at";

function mapShippingFee(row: ShippingFeeRow): ShippingFee {
  return {
    id: row.id,
    item: row.item,
    fee: Number(row.fee),
    createdAt: row.created_at,
  };
}

export async function fetchShippingFees(
  page: number,
  pageSize = SHIPPING_FEES_PAGE_SIZE,
): Promise<ShippingFeePage> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("order_shipping_fees")
    .select(SELECT_FIELDS, { count: "exact" })
    .is("archived_at", null)
    .order("created_at")
    .order("item")
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return {
    rows: ((data ?? []) as ShippingFeeRow[]).map(mapShippingFee),
    total: count ?? 0,
  };
}

export async function createShippingFee(input: {
  item: string;
  fee: number;
}): Promise<ShippingFee> {
  const item = input.item.trim();
  if (!item) throw new Error("item_required");
  if (!Number.isFinite(input.fee) || input.fee < 0) {
    throw new Error("fee_invalid");
  }
  const { data, error } = await supabase
    .from("order_shipping_fees")
    .insert({ item, fee: input.fee })
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return mapShippingFee(data as ShippingFeeRow);
}

export async function updateShippingFee(
  id: string,
  input: { item: string; fee: number },
): Promise<ShippingFee> {
  const item = input.item.trim();
  if (!item) throw new Error("item_required");
  if (!Number.isFinite(input.fee) || input.fee < 0) {
    throw new Error("fee_invalid");
  }
  const { data, error } = await supabase
    .from("order_shipping_fees")
    .update({ item, fee: input.fee })
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return mapShippingFee(data as ShippingFeeRow);
}

export async function archiveShippingFee(id: string): Promise<void> {
  const { error } = await supabase
    .from("order_shipping_fees")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw error;
}
