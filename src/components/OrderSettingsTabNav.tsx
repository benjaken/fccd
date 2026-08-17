export const ORDER_SETTINGS_TABS = [
  "statuses",
  "tags",
  "shipping",
  "payments",
] as const;

export type OrderSettingsTab = (typeof ORDER_SETTINGS_TABS)[number];

export function isOrderSettingsTab(
  value: string | undefined,
): value is OrderSettingsTab {
  return ORDER_SETTINGS_TABS.includes(value as OrderSettingsTab);
}
