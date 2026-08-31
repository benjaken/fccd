export type NotificationRecipientAllowlist = {
  phones: ReadonlySet<string>;
  emails: ReadonlySet<string>;
  enforced: boolean;
};

function configuredEnv(name: string) {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name)?.trim() || "";
}

function configuredValues(value: string) {
  return value
    .split(/[;,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeNotificationPhone(value: string | null | undefined) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `852${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : "";
}

export function normalizeNotificationEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function parseNotificationRecipientAllowlist(
  phoneValues: string,
  emailValues: string,
): NotificationRecipientAllowlist {
  const phones = new Set(
    configuredValues(phoneValues)
      .map(normalizeNotificationPhone)
      .filter(Boolean),
  );
  const emails = new Set(
    configuredValues(emailValues)
      .map(normalizeNotificationEmail)
      .filter(Boolean),
  );
  if (!phones.size || !emails.size) {
    throw new Error("notification_recipient_allowlist_missing");
  }
  return { phones, emails, enforced: true };
}

export function createNotificationRecipientPolicy(
  phoneValues: string,
  emailValues: string,
  enforcedValue: string,
): NotificationRecipientAllowlist {
  const configured = enforcedValue.trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(configured)) {
    return { phones: new Set(), emails: new Set(), enforced: false };
  }
  if (configured && !["true", "1", "yes", "on"].includes(configured)) {
    throw new Error("notification_recipient_allowlist_enforcement_invalid");
  }
  return parseNotificationRecipientAllowlist(phoneValues, emailValues);
}

export function notificationRecipientAllowlist() {
  return createNotificationRecipientPolicy(
    configuredEnv("NOTIFICATION_ALLOWED_PHONES"),
    configuredEnv("NOTIFICATION_ALLOWED_EMAILS"),
    configuredEnv("NOTIFICATION_RECIPIENT_ALLOWLIST_ENFORCED"),
  );
}

export function isNotificationPhoneAllowed(
  allowlist: NotificationRecipientAllowlist,
  phone: string | null | undefined,
) {
  const normalized = normalizeNotificationPhone(phone);
  return Boolean(normalized && (!allowlist.enforced || allowlist.phones.has(normalized)));
}

export function isNotificationEmailAllowed(
  allowlist: NotificationRecipientAllowlist,
  email: string | null | undefined,
) {
  const normalized = normalizeNotificationEmail(email);
  return Boolean(normalized && (!allowlist.enforced || allowlist.emails.has(normalized)));
}

export function isNotificationRecipientPairAllowed(
  allowlist: NotificationRecipientAllowlist,
  phone: string | null | undefined,
  email: string | null | undefined,
) {
  return isNotificationPhoneAllowed(allowlist, phone)
    && isNotificationEmailAllowed(allowlist, email);
}
