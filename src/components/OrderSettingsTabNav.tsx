import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

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

export function OrderSettingsTabNav() {
  const { t } = useTranslation();
  return (
    <nav className="order-settings-tabs" aria-label={t("orderSettings.tabsNav")}>
      {ORDER_SETTINGS_TABS.map((item) => (
        <NavLink
          key={item}
          to={`/orders/settings/${item}`}
          className={({ isActive }) => cn(isActive && "active")}
        >
          {t(`orderSettings.tabs.${item}`)}
        </NavLink>
      ))}
    </nav>
  );
}
