import { supabase } from "@/lib/supabase";

export type AddonChannel = { id: string; name: string };
export type AddonProductSearchItem = {
  id: string;
  channelId: string;
  channelName: string;
  sku: string | null;
  name: string;
  price: number | null;
};
export type AddonProductSetting = AddonProductSearchItem & {
  settingId: string;
  channelName: string;
  priceOverride: number | null;
  minQuantity: number;
  maxQuantity: number;
  sortOrder: number;
  isActive: boolean;
};
export type AddonBlockDate = {
  id: string;
  blockDate: string;
  reason: string | null;
  createdAt: string;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function fetchAddonChannels(): Promise<AddonChannel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,name")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export async function searchAddonProducts(
  channelId: string,
  search: string,
): Promise<AddonProductSearchItem[]> {
  const term = search.trim().toLocaleLowerCase("zh-Hant");
  let query = supabase
    .from("products")
    .select("id,channel_id,sku,name,chinese_name,price,channels!inner(name,is_active,archived_at)")
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("channels.is_active", true)
    .is("channels.archived_at", null)
    .not("sku", "is", null)
    .order("sku")
    .limit(500);
  if (channelId) query = query.eq("channel_id", channelId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .filter((row) => {
      if (!term) return true;
      return [row.sku, row.name, row.chinese_name]
        .some((value) => String(value ?? "").toLocaleLowerCase("zh-Hant").includes(term));
    })
    .slice(0, 50)
    .map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      channelName: one(row.channels)?.name ?? "—",
      sku: row.sku,
      name: row.chinese_name?.trim() || row.name,
      price: row.price === null ? null : Number(row.price),
    }));
}

export async function fetchAddonProductSettings(): Promise<AddonProductSetting[]> {
  const { data, error } = await supabase
    .from("self_service_addon_products")
    .select("id,channel_id,product_id,price_override,min_quantity,max_quantity,sort_order,is_active,channels(name),products(sku,name,chinese_name,price)")
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const channel = one(row.channels);
    const product = one(row.products);
    if (!channel || !product) return [];
    return [{
      settingId: row.id,
      id: row.product_id,
      channelId: row.channel_id,
      channelName: channel.name,
      sku: product.sku,
      name: product.chinese_name?.trim() || product.name,
      price: product.price === null ? null : Number(product.price),
      priceOverride: row.price_override === null ? null : Number(row.price_override),
      minQuantity: row.min_quantity,
      maxQuantity: row.max_quantity,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }];
  });
}

export async function addAddonProduct(channelId: string, productId: string) {
  const { data: last } = await supabase
    .from("self_service_addon_products")
    .select("sort_order")
    .eq("channel_id", channelId)
    .is("archived_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("self_service_addon_products").insert({
    channel_id: channelId,
    product_id: productId,
    sort_order: Number(last?.sort_order ?? 0) + 1,
  });
  if (error) throw error;
}

export async function setAddonProductActive(settingId: string, isActive: boolean) {
  const { error } = await supabase
    .from("self_service_addon_products")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", settingId);
  if (error) throw error;
}

export async function archiveAddonProduct(settingId: string) {
  const { error } = await supabase
    .from("self_service_addon_products")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", settingId);
  if (error) throw error;
}

export async function fetchAddonBlockDates(): Promise<AddonBlockDate[]> {
  const { data, error } = await supabase
    .from("self_service_addon_block_dates")
    .select("id,block_date,reason,created_at")
    .is("archived_at", null)
    .order("block_date");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    blockDate: row.block_date,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export async function addAddonBlockDate(blockDate: string, reason: string) {
  const { error } = await supabase.from("self_service_addon_block_dates").insert({
    block_date: blockDate,
    reason: reason.trim() || null,
  });
  if (error) throw error;
}

export async function archiveAddonBlockDate(id: string) {
  const { error } = await supabase
    .from("self_service_addon_block_dates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

