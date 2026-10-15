import { supabase } from "@/lib/supabase";

export type LunchboxItem = { product_id: string; name: string; unit_price: number; available_quantity: number; image_url?: string | null; description?: string | null };
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

export type VipCycleMenu = LunchboxMenu;
export type VipCycleCatalog = { id: string; name: string; cutoff_at: string; menus: VipCycleMenu[] };
export const fetchVipCatalog = () => rpc<VipCycleCatalog[]>("customer_portal_vip_catalog");
export const submitVipCycle = (requestId: string, cycleId: string, addressId: string, days: Array<{ menu_id: string; items: Array<{ product_id: string; quantity: number }> }>) =>
  rpc<string[]>("customer_portal_submit_vip", { p_request_id: requestId, p_cycle_id: cycleId, p_address_id: addressId, p_days: days });

export type VipCycleSummary = {
  cycle_id: string; cycle_name: string; cutoff_at: string;
  members: number | null; ordered: number | null; amount: number | null;
  me: { ordered: boolean; amount: number | null } | null;
};
export const fetchVipSummary = () => rpc<VipCycleSummary | null>("customer_portal_vip_summary");
