import { supabase } from "@/lib/supabase";
import { requestShopifyCustomerSync } from "@/lib/shopify-customer-bridge";

export type PersonalAddress = { id: string; label: string; recipient: string; phone: string; address: string; is_default: boolean };
export type PersonalProfile = { name: string; phone: string; email: string; notify_email: boolean; notify_whatsapp: boolean };
export type PersonalStore = { id: string; name: string; domain: string };
export type PersonalEvidence = { id: string; order_id: string; amount: number; status: "pending" | "accepted" | "rejected"; review_reason: string | null; created_at: string };
export type PersonalSnapshot = { profile: PersonalProfile; addresses: PersonalAddress[]; stores: PersonalStore[]; evidence: PersonalEvidence[]; order_states: Record<string, { delivery_status: string | null; paid: boolean }> };
export type ReorderCart = { domain: string; items: Array<{ variant: string; quantity: number }> };

export const fetchPersonalReorder = (orderId: string) =>
  rpc<ReorderCart>("customer_personal_reorder", { p_order_id: orderId });

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function fetchPersonalSnapshot(): Promise<PersonalSnapshot> {
  const data = await rpc<PersonalSnapshot>("customer_personal_snapshot");
  if (!data?.profile || !Array.isArray(data.addresses) || !Array.isArray(data.stores) || !Array.isArray(data.evidence) || !data.order_states)
    throw new Error("personal_snapshot_unavailable");
  return { ...data, stores: data.stores.filter(store => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(store.domain)) };
}
export const savePersonalProfile = (profile: Omit<PersonalProfile, "email">) => rpc<void>("customer_personal_save_profile", { p_profile: profile });
export async function savePersonalAddress(address: Omit<PersonalAddress, "id">, id: string | null = null) {
  const saved = await rpc<string>("customer_personal_save_address", { p_id: id, p_address: address });
  requestShopifyCustomerSync("sync_mine");
  return saved;
}
export async function deletePersonalAddress(id: string) {
  await rpc<void>("customer_personal_delete_address", { p_id: id });
  requestShopifyCustomerSync("sync_mine");
}
export type PersonalPoints = {
  balance: number;
  pending: number;
  incoming?: number;
  incoming_at?: string | null;
  ledger: Array<{ id: string; points: number; kind: string; order_id: string | null; expires_at: string | null; available_at?: string | null; created_at: string }>;
};
export async function fetchPersonalPoints(): Promise<PersonalPoints> {
  const data = await rpc<PersonalPoints>("customer_personal_points");
  if (!data || typeof data.balance !== "number" || !Array.isArray(data.ledger)) throw new Error("personal_points_unavailable");
  return data;
}

/** Only configured Shopify hostnames, never arbitrary URLs returned by a user. */
export function shopifyStoreUrl(domain: string): string {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain)) throw new Error("invalid_shopify_domain");
  return `https://${domain.toLowerCase()}`;
}

export function shopifyCartUrl(cart: ReorderCart): string {
  const origin = shopifyStoreUrl(cart.domain);
  if (!cart.items.length || cart.items.some(item => !/^[1-9]\d*$/.test(item.variant) || !Number.isSafeInteger(item.quantity) || item.quantity < 1))
    throw new Error("reorder_unavailable");
  return `${origin}/cart/${cart.items.map(item => `${item.variant}:${item.quantity}`).join(",")}?storefront=true`;
}

const evidenceAttempts = new WeakMap<File, Map<string, { path: string; uploaded: boolean }>>();
export async function uploadPersonalEvidence(orderId: string, file: File, amount: number) {
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024 ||
      !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
    throw new Error("invalid_payment_evidence");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("sign_in_required");
  const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const key = `${data.user.id}/${orderId}/${amount}`;
  const attempts = evidenceAttempts.get(file) || new Map<string, { path: string; uploaded: boolean }>();
  evidenceAttempts.set(file, attempts);
  const attempt = attempts.get(key) || { path: `${data.user.id}/${orderId}/${crypto.randomUUID()}.${extension}`, uploaded: false };
  attempts.set(key, attempt);
  const path = attempt.path;
  const bucket = supabase.storage.from("customer-payment-evidence");
  if (!attempt.uploaded) {
    const upload = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    // A retry after a lost upload response may encounter the same random object.
    if (upload.error && String(upload.error.statusCode) !== "409") throw upload.error;
    attempt.uploaded = true;
  }
  // Keep the uploaded object on RPC/network failure: a committed submission may already reference it.
  await rpc<void>("customer_personal_submit_evidence", { p_order_id: orderId, p_path: path, p_amount: amount });
}
