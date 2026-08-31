export const ORDER_SETTINGS_TABS = [
  "wati-notifications",
  "email-notifications",
  "first-notification-recipients",
  "statuses",
  "tags",
  "customer-tags",
  "cost-options",
  "supplier-expenses",
  "quote-sales-sources",
  "quote-communication-channels",
  "festivals",
  "quote-terms",
  "quote-payments",
  "shipping",
  "shipping-fees",
  "payments",
  "add-ons",
  "add-on-block-dates",
] as const;

export type OrderSettingsTab = (typeof ORDER_SETTINGS_TABS)[number];

export function isOrderSettingsTab(
  value: string | undefined,
): value is OrderSettingsTab {
  return ORDER_SETTINGS_TABS.includes(value as OrderSettingsTab);
}
