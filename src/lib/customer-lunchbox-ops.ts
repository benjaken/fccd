import { supabase } from "@/lib/supabase";

export type LunchboxOpsItem = { product_id: string; name: string; sku: string; unit_price: number; available_quantity: number };
export type LunchboxOpsMenu = {
  id: string; name: string; channel_id: string; brand: string; delivery_date: string; delivery_time: string;
  cutoff_at: string; shipping_fee: number; is_active: boolean; items: LunchboxOpsItem[];
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const listLunchboxes = () => rpc<LunchboxOpsMenu[]>("customer_portal_ops_list_lunchboxes");
export const deleteLunchbox = (id: string) => rpc<void>("customer_portal_ops_delete_lunchbox", { p_id: id });
export const upsertLunchbox = (input: {
  id?: string | null; channelId: string; name: string; deliveryDate: string; deliveryTime: string;
  cutoffAt: string; shippingFee: number; isActive: boolean;
}) => rpc<string>("customer_portal_ops_upsert_lunchbox", {
  p_id: input.id ?? null, p_channel_id: input.channelId, p_name: input.name, p_delivery_date: input.deliveryDate,
  p_delivery_time: input.deliveryTime, p_cutoff_at: input.cutoffAt, p_shipping_fee: input.shippingFee, p_is_active: input.isActive,
});
export const replaceLunchboxItems = (menuId: string, items: Array<{ product_id: string; unit_price: number; available_quantity: number }>) =>
  rpc<void>("customer_portal_ops_replace_lunchbox_items", { p_menu_id: menuId, p_items: items });

export type VipCycle = { id: string; name: string; cutoff_at: string; is_active: boolean; menu_ids: string[] };
export const listVipCycles = () => rpc<VipCycle[]>("customer_portal_ops_list_vip_cycles");
export const upsertVipCycle = (input: { id?: string | null; name: string; cutoffAt: string; isActive: boolean }) =>
  rpc<string>("customer_portal_ops_upsert_vip_cycle", { p_id: input.id ?? null, p_name: input.name, p_cutoff_at: input.cutoffAt, p_is_active: input.isActive });
export const setVipCycleMenus = (cycleId: string, menuIds: string[]) =>
  rpc<void>("customer_portal_ops_set_vip_cycle_menus", { p_cycle_id: cycleId, p_menu_ids: menuIds });
