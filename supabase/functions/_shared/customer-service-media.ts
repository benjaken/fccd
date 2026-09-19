const WATI_FILE_PATH = /^\/(?:\d+\/)?api\/(?:v1\/)?file\/showFile\/?$/;

export function isTrustedWatiMediaUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "wati.io" || url.hostname.endsWith(".wati.io"))
      && WATI_FILE_PATH.test(url.pathname)
      && Boolean(url.searchParams.get("fileName"));
  } catch {
    return false;
  }
}

function isTrustedShopifyCdnUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "cdn.shopify.com" ||
      host.endsWith(".shopifycdn.com") ||
      host.endsWith(".myshopify.com")
    );
  } catch {
    return false;
  }
}

export function isTrustedInboundImageUrl(value: string | null | undefined) {
  return isTrustedWatiMediaUrl(value) || isTrustedShopifyCdnUrl(value);
}

export function sniffMediaContentType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
  ) {
    return "audio/ogg";
  }
  return "";
}

export function resolveInboundMediaContentType(declared: string, bytes: Uint8Array) {
  const header = declared.split(";", 1)[0].trim().toLowerCase();
  if (header.startsWith("image/") || header.startsWith("audio/")) return header;
  return sniffMediaContentType(bytes);
}

export function mediaBytesToDataUrl(bytes: Uint8Array, contentType: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)),
    );
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function normalizeMediaToken(token: string) {
  return token.replace(/^Bearer\s+/i, "").trim();
}

export type InboundMediaDownload = {
  bytes: Uint8Array;
  contentType: string;
  dataUrl: string | null;
};

export async function downloadTrustedInboundMedia(
  mediaUrl: string,
  options: {
    tokens?: readonly string[];
    maxBytes: number;
    fetchImpl?: typeof fetch;
  },
): Promise<InboundMediaDownload> {
  if (!isTrustedInboundImageUrl(mediaUrl)) {
    throw new Error("untrusted_media_url");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const needsAuth = isTrustedWatiMediaUrl(mediaUrl);
  const tokens = needsAuth
    ? [...new Set((options.tokens ?? []).map(normalizeMediaToken).filter(Boolean))]
    : [""];
  if (needsAuth && !tokens.length) throw new Error("wati_media_token_missing");

  let lastError = "wati_media_download_failed";
  for (const token of tokens) {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(mediaUrl, { headers });
    if (!response.ok) {
      lastError = `wati_media_download_failed:${response.status}`;
      if (response.status === 401 || response.status === 403) continue;
      throw new Error(lastError);
    }
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > options.maxBytes) throw new Error("wati_media_too_large");
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > options.maxBytes) throw new Error("wati_media_too_large");
    const contentType = resolveInboundMediaContentType(
      response.headers.get("content-type") || "",
      body,
    );
    if (!contentType.startsWith("image/") && !contentType.startsWith("audio/")) {
      throw new Error(
        `wati_media_type_not_allowed:${
          (response.headers.get("content-type") || "unknown").split(";", 1)[0]
        }`,
      );
    }
    return {
      bytes: body,
      contentType,
      dataUrl: contentType.startsWith("image/")
        ? mediaBytesToDataUrl(body, contentType)
        : null,
    };
  }
  throw new Error(lastError);
}

function safePathPart(value: string, fallback: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function extensionFor(input: { mediaUrl: string; contentType?: string | null }) {
  const contentType = (input.contentType || "").split(";", 1)[0].trim().toLowerCase();
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
  };
  if (byMime[contentType]) return byMime[contentType];
  try {
    const sourceName = new URL(input.mediaUrl).searchParams.get("fileName") || "";
    const match = sourceName.match(/\.([a-zA-Z0-9]{1,8})$/);
    if (match) return match[1].toLowerCase();
  } catch {
    // The caller validates the source URL; use a neutral fallback here.
  }
  return "bin";
}

export function mediaStoragePath(input: {
  environment: string;
  phone: string;
  messageId: string;
  mediaUrl: string;
  contentType?: string | null;
}) {
  const environment = safePathPart(input.environment.toLowerCase(), "unknown");
  const phone = input.phone.replace(/\D/g, "") || "unknown";
  const messageId = safePathPart(input.messageId, "message");
  return `${environment}/${phone}/${messageId}.${extensionFor(input)}`;
}

export function buildInboundMediaHandoffSummary(input: {
  label: string;
  caption?: string | null;
  originalUrl?: string | null;
  attachmentUrl?: string | null;
}) {
  const lines = [`客人傳送${input.label}，需要同事查看。`];
  if (input.caption?.trim()) lines.push(`客人附註：${input.caption.trim().slice(0, 500)}`);
  if (input.attachmentUrl) {
    lines.push(`查看客人${input.label}：${input.attachmentUrl}`);
  } else if (input.originalUrl) {
    lines.push("附件未能安全轉存，請到 WATI 對話查看原檔。");
  }
  return lines.join("\n").slice(0, 1_500);
}
