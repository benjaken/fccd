import { supabase } from "@/lib/supabase";

export const QUOTE_FILE_BUCKET = "attachments";
export const MAX_QUOTE_FILE_SIZE = 20 * 1024 * 1024;
export const QUOTE_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp";
const ALLOWED_QUOTE_FILE_EXTENSIONS = new Set(
  QUOTE_FILE_ACCEPT.split(",").map((extension) => extension.slice(1)),
);

export type QuoteFile = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  bucketId: string | null;
  objectPath: string | null;
  available: boolean;
};

export type QuoteFileMetadataRecord = {
  id: string;
  legacy_id: string;
  display_name: string | null;
  source_file_name: string | null;
  bubble_created_at: string | null;
  created_at: string;
};

export type QuoteAttachmentRecord = {
  id: string;
  source_legacy_row_id: string | null;
  original_filename: string | null;
  bucket_id: string;
  object_path: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  source_modified_at: string | null;
  created_at: string;
};

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: ArrayBuffer | string) {
  const input =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToHex(await crypto.subtle.digest("SHA-256", input));
}

function safeFileName(name: string) {
  const parts = name.trim().split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : "";
  const base = parts
    .join(".")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${extension.slice(0, 12)}`;
}

export async function fetchQuoteFiles(quoteId: string): Promise<QuoteFile[]> {
  const { data: metadataData, error: metadataError } = await supabase
    .from("quote_file_metadata")
    .select(
      "id,legacy_id,display_name,source_file_name,bubble_created_at,created_at",
    )
    .eq("order_id", quoteId)
    .order("created_at", { ascending: false });
  if (metadataError) throw metadataError;

  const metadata = (metadataData ?? []) as QuoteFileMetadataRecord[];
  const legacyIds = metadata.map((row) => row.legacy_id).filter(Boolean);
  const attachmentQueries = [
    supabase
      .from("attachments")
      .select(
        "id,source_legacy_row_id,original_filename,bucket_id,object_path,mime_type,size_bytes,source_modified_at,created_at",
      )
      .eq("owner_type", "order")
      .eq("owner_id", quoteId),
  ];
  if (legacyIds.length) {
    attachmentQueries.push(
      supabase
        .from("attachments")
        .select(
          "id,source_legacy_row_id,original_filename,bucket_id,object_path,mime_type,size_bytes,source_modified_at,created_at",
        )
        .eq("source_type", "quote_file")
        .in("source_legacy_row_id", legacyIds),
    );
  }

  const attachmentResults = await Promise.all(attachmentQueries);
  for (const result of attachmentResults) {
    if (result.error) throw result.error;
  }
  const attachments = new Map<string, QuoteAttachmentRecord>();
  for (const result of attachmentResults) {
    for (const row of (result.data ?? []) as QuoteAttachmentRecord[]) {
      attachments.set(row.id, row);
    }
  }

  return mergeQuoteFileRecords(metadata, [...attachments.values()]);
}

function normalizedFileName(value: string | null | undefined) {
  return value?.trim().normalize("NFC").toLocaleLowerCase() ?? "";
}

export function mergeQuoteFileRecords(
  metadata: QuoteFileMetadataRecord[],
  attachmentRows: QuoteAttachmentRecord[],
): QuoteFile[] {
  const attachments = new Map(
    attachmentRows.map((attachment) => [attachment.id, attachment]),
  );

  const attachmentByLegacyId = new Map(
    [...attachments.values()]
      .filter((row) => row.source_legacy_row_id)
      .map((row) => [row.source_legacy_row_id as string, row]),
  );
  const matchedAttachmentIds = new Set<string>();
  const files: QuoteFile[] = metadata.map((row) => {
    let attachment = attachmentByLegacyId.get(row.legacy_id);
    if (!attachment && row.source_file_name) {
      const sourceName = normalizedFileName(row.source_file_name);
      attachment = [...attachments.values()].find(
        (candidate) =>
          !matchedAttachmentIds.has(candidate.id) &&
          normalizedFileName(candidate.original_filename) === sourceName,
      );
    }
    if (attachment) matchedAttachmentIds.add(attachment.id);
    return {
      id: attachment?.id ?? `metadata:${row.id}`,
      name:
        row.display_name ||
        attachment?.original_filename ||
        row.source_file_name ||
        "file",
      mimeType: attachment?.mime_type ?? null,
      sizeBytes:
        attachment?.size_bytes == null ? null : Number(attachment.size_bytes),
      createdAt:
        row.bubble_created_at ||
        attachment?.source_modified_at ||
        row.created_at,
      bucketId: attachment?.bucket_id ?? null,
      objectPath: attachment?.object_path ?? null,
      available: Boolean(attachment?.object_path),
    };
  });

  for (const attachment of attachments.values()) {
    if (matchedAttachmentIds.has(attachment.id)) continue;
    files.push({
      id: attachment.id,
      name: attachment.original_filename || "file",
      mimeType: attachment.mime_type,
      sizeBytes:
        attachment.size_bytes == null ? null : Number(attachment.size_bytes),
      createdAt: attachment.source_modified_at || attachment.created_at,
      bucketId: attachment.bucket_id,
      objectPath: attachment.object_path,
      available: Boolean(attachment.object_path),
    });
  }

  return files.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export async function uploadQuoteFile(quoteId: string, file: File) {
  if (!quoteId) throw new Error("quote_id_missing");
  if (!file.size) throw new Error("quote_file_empty");
  if (file.size > MAX_QUOTE_FILE_SIZE) throw new Error("quote_file_too_large");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_QUOTE_FILE_EXTENSIONS.has(extension)) {
    throw new Error("quote_file_type_not_allowed");
  }

  const attachmentId = crypto.randomUUID();
  const objectPath = `quotes/${quoteId}/${attachmentId}-${safeFileName(file.name)}`;
  const contents = await file.arrayBuffer();
  const checksum = await sha256(contents);
  const sourceHash = await sha256(`quote-upload:${attachmentId}`);
  const now = new Date().toISOString();

  const { error: uploadError } = await supabase.storage
    .from(QUOTE_FILE_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("attachments").insert({
    id: attachmentId,
    deterministic_key: sourceHash,
    source_type: "quote_upload",
    source_legacy_row_id: null,
    source_field: "quote.file",
    owner_type: "order",
    owner_id: quoteId,
    owner_legacy_id: null,
    original_filename: file.name,
    source_url_hash: sourceHash,
    bucket_id: QUOTE_FILE_BUCKET,
    object_path: objectPath,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256: checksum,
    source_modified_at: now,
    migration_mode: "incremental",
    migration_status: "verified",
    uploaded_at: now,
    verified_at: now,
  });
  if (insertError) {
    await supabase.storage.from(QUOTE_FILE_BUCKET).remove([objectPath]);
    throw insertError;
  }
}

export async function createQuoteFileUrl(file: QuoteFile) {
  if (!file.bucketId || !file.objectPath) {
    throw new Error("quote_file_unavailable");
  }
  const { data, error } = await supabase.storage
    .from(file.bucketId)
    .createSignedUrl(file.objectPath, 60);
  if (error) throw error;
  return data.signedUrl;
}
