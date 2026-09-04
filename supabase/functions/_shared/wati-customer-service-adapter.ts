export const BRAND_WHATSAPP_CHANNEL = "85253964335";

export type WatiInboundEvent = {
  eventType: string;
  id: string;
  whatsappMessageId: string;
  text: string;
  type: string;
  owner: boolean;
  waId: string;
  channelPhoneNumber: string;
  operatorName: string;
  operatorEmail: string;
};

export function excludeGuestContacts(values: readonly string[], guest: string) {
  const guestPhone = normalizeWhatsAppChannel(guest);
  const guestEmail = guest.trim().toLowerCase();
  return values.filter((value) => {
    const phone = normalizeWhatsAppChannel(value);
    const email = value.trim().toLowerCase();
    if (guestPhone && phone === guestPhone) return false;
    if (guestEmail && email === guestEmail) return false;
    return true;
  });
}

export function normalizeWhatsAppChannel(value: string | null | undefined) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `852${digits}`;
  return digits;
}

export function timingSafeEqual(left: string, right: string) {
  const max = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < max; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function extractWebhookSecret(request: Request) {
  const header =
    request.headers.get("x-wati-secret")
    || request.headers.get("x-webhook-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
  const query = new URL(request.url).searchParams.get("secret") || "";
  return (header || query).trim();
}

export function extractWebhookSignature(request: Request) {
  return (
    request.headers.get("x-wati-signature")
    || request.headers.get("x-hub-signature-256")
    || ""
  ).trim();
}

export async function verifyWatiWebhook({
  request,
  rawBody,
  secret,
}: {
  request: Request;
  rawBody: string;
  secret: string;
}) {
  if (!secret) return false;
  const provided = extractWebhookSecret(request);
  if (provided && timingSafeEqual(provided, secret)) return true;
  const signature = extractWebhookSignature(request);
  if (!signature) return false;
  const hex = signature.replace(/^sha256=/i, "");
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(hex.toLowerCase(), expected.toLowerCase());
}

export function parseWatiInboundEvent(payload: Record<string, unknown>): WatiInboundEvent | null {
  const waId = normalizeWhatsAppChannel(String(payload.waId || payload.whatsappNumber || ""));
  const id = String(payload.id || payload.whatsappMessageId || "").trim();
  if (!waId || !id) return null;
  return {
    eventType: String(payload.eventType || payload.event || "message"),
    id,
    whatsappMessageId: String(payload.whatsappMessageId || id),
    text: String(payload.text || payload.data || "").trim(),
    type: String(payload.type || "text"),
    owner: payload.owner === true,
    waId,
    channelPhoneNumber: normalizeWhatsAppChannel(
      String(payload.channelPhoneNumber || payload.channel_number || ""),
    ),
    operatorName: String(payload.operatorName || "").trim(),
    operatorEmail: String(payload.operatorEmail || "").trim(),
  };
}

export function isBrandWhatsAppChannel(channelPhoneNumber: string, configured = BRAND_WHATSAPP_CHANNEL) {
  if (!channelPhoneNumber) return true;
  return normalizeWhatsAppChannel(channelPhoneNumber) === normalizeWhatsAppChannel(configured);
}

export function isHumanOperatorMessage(event: WatiInboundEvent) {
  if (!event.owner) return false;
  if (event.operatorEmail) return true;
  if (!event.operatorName) return false;
  return !/^(api|bot|system|wati)$/i.test(event.operatorName);
}

export function buildSessionMessageUrl({
  endpoint,
  phone,
  text,
  channelNumber,
}: {
  endpoint: string;
  phone: string;
  text: string;
  channelNumber: string;
}) {
  const base = endpoint.replace(/\/$/, "");
  const url = new URL(`${base}/api/v1/sendSessionMessage/${encodeURIComponent(phone)}`);
  url.searchParams.set("messageText", text);
  if (channelNumber) url.searchParams.set("channelPhoneNumber", channelNumber);
  return url.toString();
}

export async function sendWatiSessionMessage({
  endpoint,
  token,
  phone,
  text,
  channelNumber,
  fetchImpl = fetch,
}: {
  endpoint: string;
  token: string;
  phone: string;
  text: string;
  channelNumber: string;
  fetchImpl?: typeof fetch;
}) {
  const url = buildSessionMessageUrl({ endpoint, phone, text, channelNumber });
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`wati_session_failed:${response.status}:${raw.slice(0, 500)}`);
  }
  return raw;
}
