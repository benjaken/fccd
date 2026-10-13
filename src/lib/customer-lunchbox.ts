import { supabase } from "@/lib/supabase";

export type LunchboxItem = { product_id: string; name: string; unit_price: number; available_quantity: number };
export type LunchboxMenu = {
  id: string; name: string; brand: string; delivery_date: string; delivery_time: string;
  cutoff_at: string; shipping_fee: number; items: LunchboxItem[];
};
export type LunchboxOrder = { id: string; number: string | null; delivery_at: string; total: number; outstanding: number; stage: "quote" | "order" };
export type LunchboxCatalog = { menus: LunchboxMenu[]; orders: LunchboxOrder[] };

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const fetchLunchboxCatalog = () => rpc<LunchboxCatalog>("customer_personal_lunchbox_catalog");
export const submitLunchbox = (requestId: string, menuId: string, addressId: string, items: Array<{ product_id: string; quantity: number }>) =>
  rpc<string>("customer_personal_submit_lunchbox", { p_request_id: requestId, p_menu_id: menuId, p_address_id: addressId, p_items: items });
