import { supabase } from "@/lib/supabase";
import { requestShopifyCustomerSync } from "@/lib/shopify-customer-bridge";
import { portalRpc as rpc } from "@/lib/customer-portal-rpc";
import type { CustomerSelfServiceOrderDetail } from "@/lib/customer-self-service";

export type PortalMenu = {
  id: string; name: string; brand: string; channel_id: string;
  delivery_date: string; valid_until?: string; delivery_time: string; cutoff_at: string; shipping_fee: number;
  items: Array<{ id: string; product_id: string; name: string; unit_price: number; available_quantity: number }>;
};
export type PortalSnapshot = {
  organization: { id: string; name: string }; role: "admin" | "member"; balance: number;
  show_prices?: boolean;
  menus: PortalMenu[];
  addresses: Array<{ id: string; label: string; recipient: string; phone: string; address: string; is_default: boolean; delivery_points: Array<{ id: string; name: string }> }>;
  members: Array<{ user_id: string; email: string; role: string; is_active: boolean; menu_ids?: string[];
    department?: string | null; delivery_point_id?: string | null; can_order?: boolean }>;
  me?: { department: string | null; delivery_point_id: string | null; can_order: boolean } | null;
  org_menus?: Array<{ id: string; name: string; brand: string; delivery_date: string; valid_until?: string; is_active: boolean }>;
  invitations: Array<{ id: string; email: string; expires_at: string; created_at: string }>;
  templates: Array<{ id: string; name: string; updated_at: string; items: Array<{ product_id: string; name: string; quantity: number }> }>;
  orders: Array<{ id: string; number: string; delivery_at: string; status: string | null; stage?: "quote" | "order"; total: number;
    outstanding: number; brand: string; points_used: number; cancel_status: string | null;
    lines: Array<{ product_id: string; name: string; quantity: number; unit_price: number }> }>;
  ledger: Array<{ id: string; points: number; kind: string; order_id: string | null; actor_id: string | null; expires_at: string | null; created_at: string }>;
  permissions?: Partial<Record<PortalPermission, boolean>>;
  memberPermissions?: Partial<Record<PortalPermission, boolean>> | null;
};
export const portalPermissionKeys = ["members", "ordering", "orders", "export", "menus", "delivery", "points", "redeem", "settings"] as const;
export type PortalPermission = typeof portalPermissionKeys[number];
const memberPermissionDefaults: PortalPermission[] = ["ordering", "orders", "delivery", "points", "redeem"];
/** Admins always see amounts; members see them only when the company allows it. */
export function portalPricesVisible(data: Pick<PortalSnapshot, "role" | "show_prices"> | null | undefined) {
  return data?.role === "admin" || data?.show_prices !== false;
}
export function portalPermissions(data: Pick<PortalSnapshot, "role" | "permissions"> | null | undefined): Record<PortalPermission, boolean> {
  const admin = data?.role === "admin";
  return Object.fromEntries(portalPermissionKeys.map(key => [key, data?.permissions?.[key] ?? (admin || memberPermissionDefaults.includes(key))])) as Record<PortalPermission, boolean>;
}
export function memberPermissionGrants(data: Pick<PortalSnapshot, "memberPermissions"> | null | undefined): Record<PortalPermission, boolean> {
  return Object.fromEntries(portalPermissionKeys.map(key => [key, data?.memberPermissions?.[key] ?? memberPermissionDefaults.includes(key)])) as Record<PortalPermission, boolean>;
}
export const fetchPortal = (organizationId?: string) => rpc<PortalSnapshot>("customer_portal_workspace", undefined, organizationId);
export const setPortalMemberPermission = (permission: PortalPermission, allowed: boolean, organizationId?: string) =>
  rpc<Record<PortalPermission, boolean>>("customer_portal_set_member_permission", { p_permission: permission, p_allowed: allowed }, organizationId);
export const acceptPortalInvite = (token: string) => rpc<void>("customer_portal_accept_invite", { p_token: token });
export const invitePortalMember = (email: string, organizationId?: string) => rpc<string>("customer_portal_invite", { p_email: email }, organizationId);
export const removePortalMember = (id: string, organizationId?: string) => rpc<void>("customer_portal_remove_member", { p_user_id: id }, organizationId);
export const setPortalMemberRole = (id: string, role: "admin" | "member", organizationId?: string) =>
  rpc<void>("customer_portal_set_member_role", { p_user_id: id, p_role: role }, organizationId);
export const revokePortalInvitation = (id: string, organizationId?: string) =>
  rpc<void>("customer_portal_revoke_invitation", { p_invitation_id: id }, organizationId);
export const setPortalMemberMenuScopes = (userId: string, menuIds: string[], organizationId?: string) =>
  rpc<void>("customer_portal_set_member_menu_scopes", { p_user_id: userId, p_menu_ids: menuIds }, organizationId);
export const setPortalMemberProfile = (
  userId: string, profile: { department: string | null; deliveryPointId: string | null; canOrder: boolean }, organizationId?: string,
) => rpc<void>("customer_portal_set_member_profile", {
  p_user_id: userId, p_department: profile.department, p_delivery_point_id: profile.deliveryPointId, p_can_order: profile.canOrder,
}, organizationId);
export async function savePortalAddress(a: { label: string; recipient: string; phone: string; address: string; is_default: boolean }, organizationId?: string) {
  const id = await rpc<string>("customer_portal_save_address", { p_label: a.label, p_recipient: a.recipient, p_phone: a.phone, p_address: a.address, p_is_default: a.is_default }, organizationId);
  requestShopifyCustomerSync("sync_mine");
  return id;
}
export async function updatePortalAddress(id: string, a: { label: string; recipient: string; phone: string; address: string; is_default: boolean }, organizationId?: string) {
  await rpc<void>("customer_portal_update_address", { p_id: id, p_label: a.label, p_recipient: a.recipient, p_phone: a.phone, p_address: a.address, p_is_default: a.is_default }, organizationId);
  requestShopifyCustomerSync("sync_mine");
}
export async function archivePortalAddress(id: string, organizationId?: string) {
  await rpc<void>("customer_portal_archive_address", { p_id: id }, organizationId);
  requestShopifyCustomerSync("sync_mine");
}
export const portalAddressKinds = ["office", "warehouse", "other"] as const;
export type PortalAddressKind = (typeof portalAddressKinds)[number];
/** New labels store only the kind, e.g. "[office]". Older rows may carry a free-text place name. */
export function splitPortalAddressLabel(label: string): { kind: PortalAddressKind | ""; place: string } {
  const match = /^\[(office|warehouse|other)\]\s*([\s\S]*)$/.exec(label);
  if (!match) return { kind: "", place: label };
  return { kind: match[1] as PortalAddressKind, place: match[2] };
}
export function portalAddressLabel(kind: PortalAddressKind) {
  return `[${kind}]`;
}
export async function savePortalDeliveryPoint(point: { id?: string | null; addressId: string; name: string }, organizationId?: string) {
  return rpc<string>("customer_portal_save_delivery_point", { p_id: point.id ?? null, p_address_id: point.addressId, p_name: point.name }, organizationId);
}
export async function archivePortalDeliveryPoint(id: string, organizationId?: string) {
  await rpc<void>("customer_portal_archive_delivery_point", { p_id: id }, organizationId);
}
export const selectPortalOrganization = (organizationId: string) =>
  rpc<void>("customer_portal_select_organization", { p_organization_id: organizationId });
export type PortalCompanyContact = { name: string; phone: string; title: string; primary: boolean };
export type PortalCompanyPendingBr = { brNumber: string; brExpiresOn: string | null; submittedAt: string } | null;
export type PortalCompany = {
  name: string; brNumber: string; brExpiresOn: string | null; settlementCycle: string | null;
  contacts: PortalCompanyContact[]; pendingBr?: PortalCompanyPendingBr;
};
export const fetchPortalCompany = (organizationId?: string) => rpc<PortalCompany>("customer_portal_company", undefined, organizationId);
export const savePortalCompanyContacts = (contacts: PortalCompanyContact[], organizationId?: string) =>
  rpc<void>("customer_portal_save_company_contacts", {
    p_contacts: contacts.map(contact => ({ name: contact.name, phone: contact.phone, title: contact.title, is_primary: contact.primary })),
  }, organizationId);
export const submitPortalCompanyBr = (
  input: { brNumber: string; brExpiresOn: string; objectPath: string }, organizationId?: string,
) => rpc<string>("customer_portal_submit_company_br", {
  p_br_number: input.brNumber, p_br_expires_on: input.brExpiresOn, p_br_object_path: input.objectPath,
}, organizationId);
export async function uploadPortalCompanyBr(orgId: string, userId: string, file: File) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  if (!/\.(jpg|jpeg|png|pdf)$/i.test(safe)) throw new Error("invalid_br_attachment");
  if (file.size > 10 * 1024 * 1024) throw new Error("invalid_br_attachment");
  const path = `${userId}/${orgId}/${crypto.randomUUID()}.${safe.split(".").pop()!.toLowerCase()}`;
  const uploaded = await supabase.storage.from("customer-br-documents").upload(path, file, { upsert: false });
  if (uploaded.error) throw uploaded.error;
  return path;
}
export const exportPortalOrders = (organizationId?: string) => rpc<string>("customer_portal_export_orders", undefined, organizationId);
export const savePortalTemplate = (name: string, items: Array<{ product_id: string; quantity: number }>, organizationId?: string) =>
  rpc<string>("customer_portal_save_template", { p_name: name, p_items: items }, organizationId);
export const updatePortalTemplate = (id: string, name: string, items: Array<{ product_id: string; quantity: number }>, organizationId?: string) =>
  rpc<void>("customer_portal_update_template", { p_id: id, p_name: name, p_items: items }, organizationId);
export const archivePortalTemplate = (id: string, organizationId?: string) =>
  rpc<void>("customer_portal_archive_template", { p_id: id }, organizationId);
export const submitPortalOrder = (requestId: string, menuId: string, addressId: string,
  items: Array<{ product_id: string; quantity: number }>, serviceDate: string, organizationId?: string) =>
  rpc<string>("customer_portal_submit_order", {
    p_request_id: requestId, p_menu_id: menuId, p_address_id: addressId, p_items: items, p_points: 0, p_service_date: serviceDate,
  }, organizationId);
export type MemberRequestItem = { product_id: string; quantity: number; name?: string };
export type MemberRequest = {
  id: string; member_id: string; created_by: string; menu_id: string; service_date: string;
  address_id: string | null; food_amount: number; items: MemberRequestItem[];
  status: "submitted" | "sent"; order_id: string | null; created_at: string;
};
export const fetchMemberRequests = (menuId?: string, serviceDate?: string, organizationId?: string) =>
  rpc<MemberRequest[]>("customer_portal_member_requests", { p_menu_id: menuId ?? null, p_service_date: serviceDate ?? null }, organizationId);
export const submitMemberRequest = (
  requestId: string, menuId: string, serviceDate: string, addressId: string, items: MemberRequestItem[],
  memberId?: string, organizationId?: string,
) => rpc<string>("customer_portal_submit_member_request", {
  p_request_id: requestId, p_menu_id: menuId, p_service_date: serviceDate, p_address_id: addressId, p_items: items,
  p_member_id: memberId ?? null,
}, organizationId);
export const updateMemberRequest = (
  id: string, items: MemberRequestItem[], serviceDate: string, addressId: string | null, organizationId?: string, menuId?: string,
) => rpc<void>("customer_portal_update_member_request", {
  p_id: id, p_items: items, p_service_date: serviceDate, p_address_id: addressId, p_menu_id: menuId ?? null,
}, organizationId);
export const deleteMemberRequest = (id: string, organizationId?: string) =>
  rpc<void>("customer_portal_delete_member_request", { p_id: id }, organizationId);
export const sendMemberRequests = (menuId: string, serviceDate: string, idempotencyKey: string, organizationId?: string) =>
  rpc<string[]>("customer_portal_send_member_requests", {
    p_menu_id: menuId, p_service_date: serviceDate, p_idempotency_key: idempotencyKey,
  }, organizationId);
export function menuValidUntil(menu: { delivery_date: string; valid_until?: string | null }) {
  return menu.valid_until || menu.delivery_date;
}
export function formatMenuPeriod(menu: { delivery_date: string; valid_until?: string | null }) {
  const end = menuValidUntil(menu);
  return end === menu.delivery_date ? menu.delivery_date : `${menu.delivery_date} – ${end}`;
}
export function hongKongToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
}
/** A live cutoff countdown label. Closed menus stay explicit rather than blank. */
export function cutoffCountdown(cutoffAt: string, now: number, t: (key: string, options?: Record<string, unknown>) => string) {
  const target = new Date(cutoffAt).getTime();
  if (Number.isNaN(target)) return "";
  const remaining = target - now;
  if (remaining <= 0) return t("portal.cutoffPassed");
  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const time = days > 0
    ? `${t("portal.cdDay", { n: days })}${t("portal.cdHour", { n: hours })}`
    : hours > 0 ? `${t("portal.cdHour", { n: hours })}${t("portal.cdMinute", { n: minutes })}`
      : t("portal.cdMinute", { n: Math.max(minutes, 1) });
  return t("portal.cutoffIn", { time });
}
/** The remaining cutoff time (e.g. "2小時26分36秒"), or "" once the cutoff has passed. */
export function cutoffDuration(cutoffAt: string, now: number, t: (key: string, options?: Record<string, unknown>) => string) {
  const target = new Date(cutoffAt).getTime();
  if (Number.isNaN(target)) return "";
  const remaining = target - now;
  if (remaining <= 0) return "";
  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return days > 0
    ? `${t("portal.cdDay", { n: days })}${t("portal.cdHour", { n: hours })}${t("portal.cdMinute", { n: minutes })}`
    : hours > 0 ? `${t("portal.cdHour", { n: hours })}${t("portal.cdMinute", { n: minutes })}${t("portal.cdSecond", { n: seconds })}`
      : minutes > 0 ? `${t("portal.cdMinute", { n: minutes })}${t("portal.cdSecond", { n: seconds })}`
        : `${t("portal.cdSecond", { n: seconds })}`;
}
/** A live cutoff countdown that includes seconds, for the cycle summary. */
export function cutoffCountdownSeconds(cutoffAt: string, now: number, t: (key: string, options?: Record<string, unknown>) => string) {
  const time = cutoffDuration(cutoffAt, now, t);
  return time ? t("portal.cutoffIn", { time }) : t("portal.cutoffPassed");
}
function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function defaultMenuServiceDate(menu: { delivery_date: string; valid_until?: string | null }, blackouts: string[] = []) {
  const end = menuValidUntil(menu);
  const blocked = new Set(blackouts);
  let cursor = hongKongToday() > menu.delivery_date ? hongKongToday() : menu.delivery_date;
  if (cursor > end) return "";
  for (let step = 0; step < 400 && cursor <= end; step += 1) {
    if (!blocked.has(cursor)) return cursor;
    cursor = shiftIsoDate(cursor, 1);
  }
  return "";
}
export const requestPortalCancellation = (orderId: string, reason: string, organizationId?: string) =>
  rpc<void>("customer_portal_request_cancel", { p_order_id: orderId, p_reason: reason }, organizationId);
export type PaymentEvidence = {id:string; order_id:string; amount:number; status:string; review_reason:string|null; created_at:string};
export const fetchPortalEvidence = (organizationId?: string) => rpc<PaymentEvidence[]>("customer_portal_evidence", undefined, organizationId);
export const fetchPortalDocument = (id:string, kind:"receipt"|"invoice", organizationId?: string) =>
  rpc<CustomerSelfServiceOrderDetail>("customer_portal_financial_document",{p_order_id:id,p_kind:kind}, organizationId);
export async function uploadPortalEvidence(orderId:string, file:File, amount:number, organizationId?: string) {
  if(!["image/jpeg","image/png","application/pdf"].includes(file.type) || file.size>10*1024*1024 || !file.size || !Number.isFinite(amount) || amount<=0)
    throw new Error("invalid_payment_evidence");
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)throw new Error("sign_in_required");
  const extension=file.type==="application/pdf"?"pdf":file.type==="image/png"?"png":"jpg";
  const path=`${data.user.id}/${orderId}/${crypto.randomUUID()}.${extension}`;
  const upload=await supabase.storage.from("customer-payment-evidence").upload(path,file,{contentType:file.type,upsert:false});
  if(upload.error)throw upload.error;
  await rpc<void>("customer_portal_submit_evidence",{p_order_id:orderId,p_path:path,p_amount:amount}, organizationId);
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
