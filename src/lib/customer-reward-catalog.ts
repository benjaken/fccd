import { supabase } from "@/lib/supabase";
import { requestShopifyCustomerSync } from "@/lib/shopify-customer-bridge";
import { portalRpc } from "@/lib/customer-portal-rpc";

export const REWARD_CATALOG_IMAGE_BUCKET = "customer-reward-catalog";
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT = /^(jpg|jpeg|png|webp)$/i;
const PROMPT_MAX = 800;

/** Flat HK-style catalog illustration; vouchers keep prize text, gifts stay textless. */
export function buildRewardCatalogImagePrompt(input: {
  name?: string;
  description?: string;
  kind?: "gift" | "voucher";
} = {}) {
  const name = input.name?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const voucher = input.kind === "voucher";
  return [
    voucher
      ? (name
        ? `Hong Kong cash voucher. Only on-image text:「${name}」(Traditional Chinese Hong Kong).`
        : "Hong Kong cash voucher with one Traditional Chinese (Hong Kong) prize title on the image.")
      : (name
        ? `Physical gift product only: ${name}. No text, letters, numbers, captions, watermarks, or logos on the image.`
        : "Physical gift product only. No text, letters, numbers, captions, watermarks, or logos on the image."),
    voucher
      ? "Do not invent prices, ¥/円, HK$, expiry lines, Japanese, Korean, Simplified Chinese, or extra slogans."
      : "Do not invent labels, price tags, packaging copy, or any writing.",
    "Square 1:1 composition. Keep the full subject inside the frame with clear margin; nothing cropped or overflowing.",
    voucher
      ? "Flat 2D Hong Kong coupon / loyalty voucher illustration, soft anime, vector-like, even lighting, minimal depth,"
      : "Flat 2D product catalog illustration, soft anime, vector-like, even lighting, minimal depth,",
    "front-facing centered subject, plain soft background, no 3D, no strong shadows, no brand logo, no extra props.",
    description ? `Visual details only${voucher ? " (do not print as extra copy)" : ""}: ${description}.` : "",
  ].filter(Boolean).join(" ").slice(0, PROMPT_MAX);
}

export type RewardCatalogItem = {
  id: string;
  name: string;
  kind: "gift" | "voucher";
  points_cost: number;
  description: string;
  stock: number;
  voucher_amount_hkd?: number | null;
  image_object_path?: string | null;
};
export type RewardCatalogOpsItem = RewardCatalogItem & {
  is_active: boolean;
  shopify_store_id?: string | null;
  voucher_valid_days?: number;
};
export type RewardRedemption = {
  id: string;
  name: string;
  kind: "gift" | "voucher";
  points: number;
  status: "pending" | "fulfilled";
  account: string;
  created_at: string;
  voucher_status?: string | null;
  voucher_last4?: string | null;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

function imageExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.test(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "";
}

export async function uploadRewardCatalogImage(file: File) {
  if (file.size > IMAGE_MAX_BYTES || !file.type.startsWith("image/")) throw new Error("invalid_catalog_image");
  const extension = imageExtension(file);
  if (!extension) throw new Error("invalid_catalog_image");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("authentication_required");
  const path = `${userData.user.id}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from(REWARD_CATALOG_IMAGE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  return path;
}

export async function rewardCatalogImageUrl(path: string, expiresIn = 60 * 60) {
  const signed = await supabase.storage.from(REWARD_CATALOG_IMAGE_BUCKET).createSignedUrl(path, expiresIn);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("invalid_catalog_image");
  return signed.data.signedUrl;
}

export async function generateRewardCatalogImage(input: {
  name?: string;
  description?: string;
  kind?: "gift" | "voucher";
  prompt?: string;
}) {
  const { data, error } = await supabase.functions.invoke<{ objectPath?: string; signedUrl?: string; error?: string }>(
    "customer-reward-catalog-image",
    { body: { action: "generate", ...input } },
  );
  if (error) throw error;
  if (!data?.objectPath) throw new Error(data?.error || "image_generation_failed");
  return { objectPath: data.objectPath, signedUrl: data.signedUrl ?? (await rewardCatalogImageUrl(data.objectPath)) };
}

export type RewardRedemptionRecord = {
  id: string;
  name: string;
  kind: "gift" | "voucher";
  points: number;
  status: "pending" | "fulfilled";
  created_at: string;
  voucher_status: "queued" | "issuing" | "issued" | "failed" | null;
  voucher_code: string | null;
  voucher_amount: number | null;
  shop_domain: string | null;
};

export const listPersonalRewardRedemptions = () => rpc<RewardRedemptionRecord[]>("customer_personal_reward_redemptions");
export const listPortalRewardRedemptions = async (organizationId?: string) =>
  (await portalRpc<RewardRedemptionRecord[]>("customer_portal_reward_redemptions", undefined, organizationId)) ?? [];

export const listRewardCatalog = () => rpc<RewardCatalogItem[]>("customer_reward_catalog");
export async function redeemPersonalCatalog(requestId: string, catalogId: string) {
  const result = await rpc<{ id: string; balance: number }>("customer_personal_redeem_catalog", { p_request_id: requestId, p_catalog_id: catalogId });
  requestShopifyCustomerSync("issue_mine");
  return result;
}
export async function redeemOrganizationCatalog(requestId: string, catalogId: string, organizationId?: string) {
  const result = await portalRpc<{ id: string; balance: number }>("customer_portal_redeem_catalog", { p_request_id: requestId, p_catalog_id: catalogId }, organizationId);
  requestShopifyCustomerSync("issue_mine");
  return result;
}
export const listRewardCatalogOps = () => rpc<RewardCatalogOpsItem[]>("customer_portal_ops_list_reward_catalog");
export const deleteRewardCatalogItem = (id: string) => rpc<void>("customer_portal_ops_delete_reward_catalog", { p_id: id });
export const listRewardRedemptions = () => rpc<RewardRedemption[]>("customer_portal_ops_list_reward_redemptions");
export const fetchRewardRedemptionPage = (page: number) =>
  rpc<{ rows: RewardRedemption[]; total: number; page: number }>("customer_portal_ops_redemption_page", { p_page: page });
export const upsertRewardCatalogItem = (input: {
  id?: string | null;
  name: string;
  kind: "gift" | "voucher";
  points: number;
  description: string;
  stock: number;
  active: boolean;
  voucherAmount?: number | null;
  storeId?: string | null;
  validDays?: number;
  imageObjectPath?: string | null;
}) =>
  rpc<string>("customer_portal_ops_upsert_reward_catalog", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_kind: input.kind,
    p_points: input.points,
    p_description: input.description,
    p_stock: input.stock,
    p_active: input.active,
    p_voucher_amount: input.kind === "voucher" ? input.voucherAmount ?? null : null,
    p_store_id: input.kind === "voucher" ? input.storeId ?? null : null,
    p_valid_days: input.validDays ?? 365,
    p_image_object_path: input.imageObjectPath ?? null,
  });
export const fulfillRewardRedemption = (id: string) => rpc<void>("customer_portal_ops_fulfill_reward_redemption", { p_id: id });
