import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ClipboardList,
  Receipt,
  ShoppingBag,
  Store,
  ClipboardCheck,
  CircleDollarSign,
} from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/restaurant-workspace", key: "shopOrder", icon: ShoppingBag, permission: "workspace.restaurant.shop_order", end: true },
  { to: "/restaurant-workspace/records", key: "records", icon: ClipboardList, permission: "workspace.restaurant.records" },
  { to: "/restaurant-workspace/daily-sales", key: "dailySales", icon: Store, permission: "restaurant.daily_sales" },
  { to: "/restaurant-workspace/daily-purchases", key: "dailyPurchases", icon: Receipt, permission: "restaurant.daily_purchases" },
  { to: "/restaurant-workspace/inventory", key: "inventory", icon: ClipboardCheck, permission: "restaurant.inventory" },
  { to: "/restaurant-workspace/monthly-expenses", key: "monthlyExpenses", icon: CircleDollarSign, permission: "restaurant.monthly_expenses" },
] as const;

export function RestaurantWorkspacePage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();

  return (
    <main className="restaurant-workspace">
      <header className="restaurant-workspace-bar">
        <div>
          <span className="eyebrow">{t("workspace.restaurant")}</span>
          <h1>{t("shopOrdering.workspaceTitle")}</h1>
        </div>
        <nav className="restaurant-workspace-nav" aria-label={t("workspace.restaurant")}>
          {LINKS.filter((link) => access.canAccess(link.permission)).map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={"end" in link ? link.end : false}
                className={({ isActive }) => cn("restaurant-workspace-link", isActive && "active")}
              >
                <Icon />
                {t(`shopOrdering.nav.${link.key}`)}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <div className="restaurant-workspace-body">
        <Outlet />
      </div>
    </main>
  );
}
