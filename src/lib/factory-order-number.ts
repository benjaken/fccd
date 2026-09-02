import { formatOrderNumber, normalizeOrderNumber } from "@/lib/order-number";

export const normalizeFactoryOrderNumber = normalizeOrderNumber;

export function formatFactoryOrderNumber(
  value: string | null | undefined,
  fallback = "",
): string {
  return formatOrderNumber(value, undefined, fallback);
}
