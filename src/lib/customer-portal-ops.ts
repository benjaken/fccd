import { supabase } from "@/lib/supabase";

export type OpsOrgListItem = {
  id: string;
  name: string;
  customer_id: string | null;
  is_active: boolean;
  is_vip: boolean;
  created_at: string;
  member_count: number;
  admin_count: number;
  menu_count: number;
};

export type OpsOrgMember = {
  user_id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

export type OpsMenuSummary = {
  id: string;
  name: string;
  channel_id: string;
  brand: string;
  delivery_date: string;
  valid_until: string;
  delivery_time: string;
  cutoff_at: string;
  shipping_fee: number;
  is_active: boolean;
  item_count: number;
};

export type OpsOrgDetail = {
  id: string;
  name: string;
  customer_id: string | null;
  is_active: boolean;
  is_vip: boolean;
  created_at: string;
  members: OpsOrgMember[];
  menus: OpsMenuSummary[];
};

export type OpsMenuItem = {
  id?: string;
  product_id: string;
  name: string;
  sku: string | null;
  unit_price: number;
  available_quantity: number;
};

export type OpsMenuDetail = {
  id: string;
  organization_id: string;
  name: string;
  channel_id: string;
  brand: string;
  delivery_date: string;
  valid_until: string;
  delivery_time: string;
  cutoff_at: string;
  shipping_fee: number;
  is_active: boolean;
  items: OpsMenuItem[];
};

export function formatMenuPeriod(menu: { delivery_date: string; valid_until?: string | null }) {
  const end = menu.valid_until || menu.delivery_date;
  return end === menu.delivery_date ? menu.delivery_date : `${menu.delivery_date} – ${end}`;
}

export type OpsChannel = { id: string; name: string };
export type OpsProduct = { id: string; name: string; sku: string | null; price: number | null };

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const listPortalOpsOrgs = () => rpc<OpsOrgListItem[]>("customer_portal_ops_list_orgs");
export const deletePortalOpsOrg = (orgId: string) => rpc<void>("customer_portal_ops_delete_org", { p_id: orgId });
export const getPortalOpsOrg = (orgId: string) =>
  rpc<OpsOrgDetail>("customer_portal_ops_get_org", { p_org_id: orgId });
export const upsertPortalOpsOrg = (input: {
  id?: string | null;
  name: string;
  customerId?: string | null;
  isActive: boolean;
  isVip?: boolean;
}) =>
  rpc<string>("customer_portal_ops_upsert_org", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_customer_id: input.customerId ?? null,
    p_is_active: input.isActive,
    p_is_vip: input.isVip ?? false,
  });
export const assignPortalOpsAdmin = (orgId: string, email: string) =>
  rpc<string>("customer_portal_ops_assign_admin", { p_org_id: orgId, p_email: email });
export const getPortalOpsMenu = (menuId: string) =>
  rpc<OpsMenuDetail>("customer_portal_ops_get_menu", { p_menu_id: menuId });
export const upsertPortalOpsMenu = (input: {
  id?: string | null;
  orgId: string;
  channelId: string;
  name: string;
  deliveryDate: string;
  validUntil: string;
  deliveryTime: string;
  cutoffAt: string;
  shippingFee: number;
  isActive: boolean;
}) =>
  rpc<string>("customer_portal_ops_upsert_menu", {
    p_id: input.id ?? null,
    p_org_id: input.orgId,
    p_channel_id: input.channelId,
    p_name: input.name,
    p_delivery_date: input.deliveryDate,
    p_valid_until: input.validUntil,
    p_delivery_time: input.deliveryTime,
    p_cutoff_at: input.cutoffAt,
    p_shipping_fee: input.shippingFee,
    p_is_active: input.isActive,
  });
export const replacePortalOpsMenuItems = (
  menuId: string,
  items: Array<{ product_id: string; unit_price: number; available_quantity: number }>,
) => rpc<void>("customer_portal_ops_replace_menu_items", { p_menu_id: menuId, p_items: items });
export const listPortalOpsChannels = () => rpc<OpsChannel[]>("customer_portal_ops_list_channels");
export const listPortalOpsProducts = (channelId: string) =>
  rpc<OpsProduct[]>("customer_portal_ops_list_products", { p_channel_id: channelId });
