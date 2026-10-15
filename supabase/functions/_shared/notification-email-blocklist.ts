function normalizeNotificationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isBlockedNotificationEmail(
  email: string,
  blockedEmails: readonly string[] | null | undefined,
) {
  const normalized = normalizeNotificationEmail(email);
  if (!normalized) return false;
  return (blockedEmails ?? []).some((item) => normalizeNotificationEmail(item) === normalized);
}
