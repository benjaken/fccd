export type ConfirmedEnquiryOrderTaskInput = {
  orderId: string;
  orderNumber: string;
  customerName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  deliveryAt?: string | null;
  deliveryTime?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  enquiryReference?: string | null;
  description?: string | null;
  appUrl?: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hongKongDate(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  const result = `${part("year")}-${part("month")}-${part("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : undefined;
}

function orderUrl(appUrl: string | null | undefined, orderId: string) {
  const base = text(appUrl).replace(/\/$/, "");
  return base ? `${base}/orders/${encodeURIComponent(orderId)}` : "";
}

export function buildConfirmedEnquiryOrderAsanaTask(
  input: ConfirmedEnquiryOrderTaskInput,
) {
  const nameParts = [
    `Confirmed order | ${text(input.orderNumber) || input.orderId}`,
    text(input.customerName),
    text(input.companyName),
  ].filter(Boolean);
  const total = input.amount === null || input.amount === undefined || input.amount === ""
    ? ""
    : `${text(input.currency) || "HKD"} ${input.amount}`;
  const lines = [
    ["Enquiry", text(input.enquiryReference)],
    ["Order", text(input.orderNumber)],
    ["Customer", text(input.customerName)],
    ["Company", text(input.companyName)],
    ["Phone", text(input.phone)],
    ["Email", text(input.email)],
    ["Delivery address", text(input.address)],
    ["Delivery date", hongKongDate(input.deliveryAt) || ""],
    ["Delivery time", text(input.deliveryTime)],
    ["Total", total],
    ["Order details", text(input.description)],
    ["FCCD order", orderUrl(input.appUrl, input.orderId)],
  ].filter(([, value]) => Boolean(value));

  return {
    name: nameParts.join(" | ").slice(0, 255),
    notes: lines.map(([label, value]) => `${label}: ${value}`).join("\n").slice(0, 16000),
    due_on: hongKongDate(input.deliveryAt),
  };
}
