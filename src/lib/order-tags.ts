import { supabase } from "@/lib/supabase";

export type OrderTag = {
  id: string;
  name: string;
  isActive: boolean;
};

type TagRow = {
  id: string;
  name: string;
  is_active: boolean;
};

function mapTag(row: TagRow): OrderTag {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  };
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

export function filterOrderTags(
  rows: readonly OrderTag[],
  search = "",
) {
  const term = search.trim();
  if (!term) return [...rows];
  return rows.filter((row) => includesIgnoreCase(row.name, term));
}

export async function fetchOrderTags(): Promise<OrderTag[]> {
  const { data, error } = await supabase
    .from("order_tags")
    .select("id,name,is_active")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as TagRow[]).map(mapTag);
}

export async function createOrderTag(name: string): Promise<OrderTag> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("name_required");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("order_tags")
    .insert({
      legacy_id: `web-order-tag-${crypto.randomUUID()}`,
      name: trimmed,
      is_active: true,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id,name,is_active")
    .single();
  if (error) throw error;
  return mapTag(data as TagRow);
}

export async function setOrderTagActive(
  id: string,
  isActive: boolean,
): Promise<OrderTag> {
  const { data, error } = await supabase
    .from("order_tags")
    .update({ is_active: isActive })
    .eq("id", id)
    .is("archived_at", null)
    .select("id,name,is_active")
    .single();
  if (error) throw error;
  return mapTag(data as TagRow);
}

export async function archiveOrderTag(id: string): Promise<void> {
  const { error } = await supabase
    .from("order_tags")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw error;
}
