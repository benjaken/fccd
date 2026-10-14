import { supabase } from "@/lib/supabase";
import { requestShopifyCustomerSync } from "@/lib/shopify-customer-bridge";
import type { CustomerSelfServiceOrderDetail } from "@/lib/customer-self-service";

export type PortalMenu = {
  id: string; name: string; brand: string; channel_id: string;
  delivery_date: string; delivery_time: string; cutoff_at: string; shipping_fee: number;
  items: Array<{ id: string; product_id: string; name: string; unit_price: number; available_quantity: number }>;
};
export type PortalSnapshot = {
  organization: { id: string; name: string }; role: "admin" | "member"; balance: number;
  menus: PortalMenu[];
  addresses: Array<{ id: string; label: string; recipient: string; phone: string; address: string }>;
  members: Array<{ user_id: string; email: string; role: string; is_active: boolean; menu_ids?: string[] }>;
  org_menus?: Array<{ id: string; name: string; brand: string; delivery_date: string; is_active: boolean }>;
  invitations: Array<{ id: string; email: string; expires_at: string; created_at: string }>;
  templates: Array<{ id: string; name: string; updated_at: string; items: Array<{ product_id: string; name: string; quantity: number }> }>;
  orders: Array<{ id: string; number: string; delivery_at: string; status: string | null; stage?: "quote" | "order"; total: number;
    outstanding: number; brand: string; points_used: number; cancel_status: string | null;
    lines: Array<{ product_id: string; name: string; quantity: number; unit_price: number }> }>;
  ledger: Array<{ id: string; points: number; kind: string; order_id: string | null; actor_id: string | null; expires_at: string | null; created_at: string }>;
};
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const fetchPortal = () => rpc<PortalSnapshot>("customer_portal_snapshot");
export const acceptPortalInvite = (token: string) => rpc<void>("customer_portal_accept_invite", { p_token: token });
export const invitePortalMember = (email: string) => rpc<string>("customer_portal_invite", { p_email: email });
export const removePortalMember = (id: string) => rpc<void>("customer_portal_remove_member", { p_user_id: id });
export const setPortalMemberRole = (id: string, role: "admin" | "member") =>
  rpc<void>("customer_portal_set_member_role", { p_user_id: id, p_role: role });
export const revokePortalInvitation = (id: string) =>
  rpc<void>("customer_portal_revoke_invitation", { p_invitation_id: id });
export const setPortalMemberMenuScopes = (userId: string, menuIds: string[]) =>
  rpc<void>("customer_portal_set_member_menu_scopes", { p_user_id: userId, p_menu_ids: menuIds });
export async function savePortalAddress(a: { label: string; recipient: string; phone: string; address: string }) {
  const id = await rpc<string>("customer_portal_save_address", { p_label: a.label, p_recipient: a.recipient, p_phone: a.phone, p_address: a.address });
  requestShopifyCustomerSync("sync_mine");
  return id;
}
export async function updatePortalAddress(id: string, a: { label: string; recipient: string; phone: string; address: string }) {
  await rpc<void>("customer_portal_update_address", { p_id: id, p_label: a.label, p_recipient: a.recipient, p_phone: a.phone, p_address: a.address });
  requestShopifyCustomerSync("sync_mine");
}
export async function archivePortalAddress(id: string) {
  await rpc<void>("customer_portal_archive_address", { p_id: id });
  requestShopifyCustomerSync("sync_mine");
}
export const savePortalTemplate = (name: string, items: Array<{ product_id: string; quantity: number }>) =>
  rpc<string>("customer_portal_save_template", { p_name: name, p_items: items });
export const updatePortalTemplate = (id: string, name: string, items: Array<{ product_id: string; quantity: number }>) =>
  rpc<void>("customer_portal_update_template", { p_id: id, p_name: name, p_items: items });
export const archivePortalTemplate = (id: string) =>
  rpc<void>("customer_portal_archive_template", { p_id: id });
export const submitPortalOrder = (requestId: string, menuId: string, addressId: string,
  items: Array<{ product_id: string; quantity: number }>) =>
  rpc<string>("customer_portal_submit_order", { p_request_id: requestId, p_menu_id: menuId, p_address_id: addressId, p_items: items, p_points: 0 });
export const requestPortalCancellation = (orderId: string, reason: string) =>
  rpc<void>("customer_portal_request_cancel", { p_order_id: orderId, p_reason: reason });
export type PaymentEvidence = {id:string; order_id:string; amount:number; status:string; review_reason:string|null; created_at:string};
export const fetchPortalEvidence = () => rpc<PaymentEvidence[]>("customer_portal_evidence");
export const fetchPortalDocument = (id:string, kind:"receipt"|"invoice") =>
  rpc<CustomerSelfServiceOrderDetail>("customer_portal_financial_document",{p_order_id:id,p_kind:kind});
export async function uploadPortalEvidence(orderId:string, file:File, amount:number) {
  if(!["image/jpeg","image/png","application/pdf"].includes(file.type) || file.size>10*1024*1024 || !file.size || !Number.isFinite(amount) || amount<=0)
    throw new Error("invalid_payment_evidence");
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)throw new Error("sign_in_required");
  const extension=file.type==="application/pdf"?"pdf":file.type==="image/png"?"png":"jpg";
  const path=`${data.user.id}/${orderId}/${crypto.randomUUID()}.${extension}`;
  const upload=await supabase.storage.from("customer-payment-evidence").upload(path,file,{contentType:file.type,upsert:false});
  if(upload.error)throw upload.error;
  await rpc<void>("customer_portal_submit_evidence",{p_order_id:orderId,p_path:path,p_amount:amount});
}

// Money calculations in the UI use cents. Final authority is always the RPC.
export function portalCart(menu: PortalMenu, quantities: Record<string, number>) {
  const items = menu.items.filter(i => (quantities[i.product_id] || 0) > 0);
  const cents = items.reduce((sum, i) => sum + Math.round(Number(i.unit_price) * 100) * quantities[i.product_id], 0);
  const valid = items.length > 0 && items.every(i => Number.isSafeInteger(quantities[i.product_id]) &&
    quantities[i.product_id] <= i.available_quantity);
  return { valid, foodCents: cents, payableCents: cents + Math.round(Number(menu.shipping_fee) * 100),
    items: items.map(i => ({ product_id: i.product_id, quantity: quantities[i.product_id] })) };
}
