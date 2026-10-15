import { supabase } from "@/lib/supabase";

export type PortalGuide = {
  slug: string;
  title: string;
  body: string;
  isPublished?: boolean;
  sortOrder?: number;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parsePortalGuides(value: unknown): PortalGuide[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const slug = text(record.slug);
    const title = text(record.title).trim();
    if (!/^[a-z0-9-]{2,40}$/.test(slug) || !title) return [];
    return [{
      slug,
      title,
      body: text(record.body),
      isPublished: record.is_published === undefined ? undefined : Boolean(record.is_published),
      sortOrder: typeof record.sort_order === "number" ? record.sort_order : undefined,
    }];
  });
}

export async function fetchPublishedGuides() {
  const { data, error } = await supabase.rpc("customer_portal_list_guides");
  if (error) throw error;
  return parsePortalGuides(data);
}

export async function fetchPortalGuideDrafts() {
  const { data, error } = await supabase.rpc("customer_portal_ops_list_guides");
  if (error) throw error;
  return parsePortalGuides(data);
}

export async function deletePortalGuide(slug: string) {
  const { error } = await supabase.rpc("customer_portal_ops_delete_guide", { p_slug: slug });
  if (error) throw error;
}

export async function savePortalGuide(guide: { slug: string; title: string; body: string; isPublished: boolean }) {
  const { data, error } = await supabase.rpc("customer_portal_ops_save_guide", {
    p_slug: guide.slug,
    p_title: guide.title,
    p_body: guide.body,
    p_published: guide.isPublished,
  });
  if (error) throw error;
  return parsePortalGuides(data);
}
