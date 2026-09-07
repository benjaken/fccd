export function normalizeNotificationPhone(value: string | null | undefined) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `852${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : "";
}
