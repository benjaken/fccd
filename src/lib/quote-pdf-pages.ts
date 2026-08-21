import { supabase } from "@/lib/supabase";

export const QUOTE_PDF_PAGES_BUCKET = "quote-pdf-pages";
export const QUOTE_PDF_PAGES_PAGE_SIZE = 15;
export const MAX_QUOTE_PDF_PAGE_SIZE = 15 * 1024 * 1024;
export const QUOTE_PDF_PAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export type QuotePdfPagePlacement = "front" | "back";

export type QuotePdfBrand = {
  id: string;
  name: string;
};

export type QuotePdfPage = {
  id: string;
  channelId: string;
  channelName: string;
  placement: QuotePdfPagePlacement;
  title: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  isActive: boolean;
  previewUrl: string;
  updatedAt: string;
};

export type QuotePdfPageListResult = {
  items: QuotePdfPage[];
  total: number;
};

type QuotePdfPageRow = {
  id: string;
  channel_id: string;
  placement: QuotePdfPagePlacement;
  title: string;
  object_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
  channels?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function relationName(value: QuotePdfPageRow["channels"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || "";
}

function mapPage(row: QuotePdfPageRow, previewUrl: string): QuotePdfPage {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: relationName(row.channels),
    placement: row.placement,
    title: row.title,
    objectPath: row.object_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    previewUrl,
    updatedAt: row.updated_at,
  };
}

async function signedUrls(rows: QuotePdfPageRow[]) {
  return Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabase.storage
        .from(QUOTE_PDF_PAGES_BUCKET)
        .createSignedUrl(row.object_path, 60 * 60);
      if (error) throw error;
      return mapPage(row, data.signedUrl);
    }),
  );
}

export async function fetchQuotePdfBrands(): Promise<QuotePdfBrand[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as QuotePdfBrand[]).filter((brand) => brand.name.trim());
}

export async function fetchQuotePdfPages({
  page,
  channelId,
  placement,
}: {
  page: number;
  channelId?: string;
  placement?: QuotePdfPagePlacement | "";
}): Promise<QuotePdfPageListResult> {
  const start = (page - 1) * QUOTE_PDF_PAGES_PAGE_SIZE;
  let query = supabase
    .from("quote_pdf_pages")
    .select(
      "id,channel_id,placement,title,object_path,original_filename,mime_type,size_bytes,sort_order,is_active,updated_at,channels(name)",
      { count: "exact" },
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(start, start + QUOTE_PDF_PAGES_PAGE_SIZE - 1);
  if (channelId) query = query.eq("channel_id", channelId);
  if (placement) query = query.eq("placement", placement);
  const { data, error, count } = await query;
  if (error) throw error;
  return {
    items: await signedUrls((data ?? []) as QuotePdfPageRow[]),
    total: count ?? 0,
  };
}

export async function fetchActiveQuotePdfPages(
  channelId: string,
): Promise<QuotePdfPage[]> {
  if (!channelId) return [];
  const { data, error } = await supabase
    .from("quote_pdf_pages")
    .select(
      "id,channel_id,placement,title,object_path,original_filename,mime_type,size_bytes,sort_order,is_active,updated_at,channels(name)",
    )
    .eq("channel_id", channelId)
    .eq("is_active", true)
    .order("placement", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return signedUrls((data ?? []) as QuotePdfPageRow[]);
}

function validatePageFile(file: File) {
  if (!file.size) throw new Error("quote_pdf_page_empty");
  if (file.size > MAX_QUOTE_PDF_PAGE_SIZE) {
    throw new Error("quote_pdf_page_too_large");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("quote_pdf_page_type_not_allowed");
  }
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "page";
}

export async function createQuotePdfPage(input: {
  channelId: string;
  placement: QuotePdfPagePlacement;
  title: string;
  sortOrder: number;
  isActive: boolean;
  file: File;
}): Promise<void> {
  validatePageFile(input.file);
  const title = input.title.trim();
  if (!input.channelId || !title) throw new Error("quote_pdf_page_required");
  const id = crypto.randomUUID();
  const objectPath = `${input.channelId}/${id}-${safeFilename(input.file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(QUOTE_PDF_PAGES_BUCKET)
    .upload(objectPath, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("quote_pdf_pages").insert({
    id,
    channel_id: input.channelId,
    placement: input.placement,
    title,
    object_path: objectPath,
    original_filename: input.file.name,
    mime_type: input.file.type,
    size_bytes: input.file.size,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    created_by: userData.user?.id ?? null,
    updated_by: userData.user?.id ?? null,
  });
  if (!error) return;
  await supabase.storage.from(QUOTE_PDF_PAGES_BUCKET).remove([objectPath]);
  throw error;
}

export async function updateQuotePdfPage(
  id: string,
  input: {
    channelId: string;
    placement: QuotePdfPagePlacement;
    title: string;
    sortOrder: number;
    isActive: boolean;
  },
): Promise<void> {
  const title = input.title.trim();
  if (!id || !input.channelId || !title) throw new Error("quote_pdf_page_required");
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("quote_pdf_pages")
    .update({
      channel_id: input.channelId,
      placement: input.placement,
      title,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteQuotePdfPage(page: Pick<QuotePdfPage, "id" | "objectPath">) {
  const { error } = await supabase.from("quote_pdf_pages").delete().eq("id", page.id);
  if (error) throw error;
  const { error: storageError } = await supabase.storage
    .from(QUOTE_PDF_PAGES_BUCKET)
    .remove([page.objectPath]);
  if (storageError) throw storageError;
}
