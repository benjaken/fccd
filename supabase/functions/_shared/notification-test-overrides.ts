const TEST_EMAIL_RECIPIENT = "cfb.app02@chifung.net";
const TEST_WATI_PHONE = "8613828747224";
const TEST_MARKER = "【develop】";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.trim().replace(/\D/g, "");
}

function normalizeNotificationEnvironment(): "develop" | "production" | "main" {
  const overrides = [
    Deno.env.get("NOTIFICATION_ENVIRONMENT"),
    Deno.env.get("CUSTOMER_SERVICE_ENVIRONMENT"),
    Deno.env.get("APP_ENV"),
    Deno.env.get("ENVIRONMENT"),
    Deno.env.get("NODE_ENV"),
  ];
  for (const value of overrides) {
    const normalized = (value || "").trim().toLowerCase();
    if (normalized === "develop" || normalized === "development") return "develop";
    if (normalized === "main" || normalized === "production") return normalized === "production"
      ? "production"
      : "main";
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  return supabaseUrl.includes("vignxasvlxqnyvuhtjlu")
    ? "production"
    : "develop";
}

export function isDevelopNotificationEnvironment() {
  return normalizeNotificationEnvironment() === "develop";
}

export function applyNotificationTestEmailRecipients(recipients: string[]) {
  if (!isDevelopNotificationEnvironment()) {
    return recipients;
  }
  return [TEST_EMAIL_RECIPIENT];
}

export function applyNotificationTestWatiPhones(phones: string[]) {
  if (!isDevelopNotificationEnvironment()) {
    return phones;
  }
  return [TEST_WATI_PHONE];
}

export function applyDevelopNotificationMarker(value: string) {
  if (!isDevelopNotificationEnvironment()) return value;
  const text = value.trim();
  if (!text) return TEST_MARKER;
  if (text.startsWith(TEST_MARKER)) return text;
  return `${TEST_MARKER} ${text}`;
}

export function normalizeNotificationEmailRecipients(recipients: string[]) {
  const seen = new Set<string>();
  return recipients
    .map(normalizeEmail)
    .filter(Boolean)
    .filter((address) => {
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    });
}

export function normalizeNotificationPhones(phones: string[]) {
  const seen = new Set<string>();
  return phones
    .map(normalizePhone)
    .filter(Boolean)
    .filter((phone) => {
      if (seen.has(phone)) return false;
      seen.add(phone);
      return true;
    });
}

export function toNotificationEmailRecipients(recipients: string[]) {
  return applyNotificationTestEmailRecipients(normalizeNotificationEmailRecipients(recipients));
}

export function toNotificationWatiPhones(phones: string[]) {
  return applyNotificationTestWatiPhones(normalizeNotificationPhones(phones));
}

