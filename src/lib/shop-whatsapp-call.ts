/** Normalize a Hong Kong / E.164 shop-contact number for WhatsApp or tel:. */

const HK_CC = "852";

export function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

export function toWhatsAppNumber(phone: string) {
  const digits = digitsOnly(phone);
  if (!digits) return "";
  if (digits.startsWith(HK_CC) && digits.length >= 11) return digits;
  if (digits.startsWith("0") && digits.length === 9) return `${HK_CC}${digits.slice(1)}`;
  if (digits.length === 8) return `${HK_CC}${digits}`;
  return digits;
}

export function buildWhatsAppCallUrl(phone: string) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `whatsapp://call?number=${number}`;
}

export function buildWhatsAppMessageUrl(phone: string, message: string) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildSmsUrl(phone: string, message: string) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `sms:+${number}?body=${encodeURIComponent(message)}`;
}

export function buildTelUrl(phone: string) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `tel:+${number}`;
}

export type WhatsAppCallStatus =
  | "whatsapp_call_opened"
  | "whatsapp_call_failed"
  | "whatsapp_blocked_no_phone";

export function resolveWhatsAppCallStatus(phone: string | null | undefined): WhatsAppCallStatus {
  if (!phone || !toWhatsAppNumber(phone)) return "whatsapp_blocked_no_phone";
  return "whatsapp_call_opened";
}
