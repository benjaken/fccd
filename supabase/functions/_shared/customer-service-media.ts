const WATI_FILE_PATH = /^\/\d+\/api\/file\/showFile$/;

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
