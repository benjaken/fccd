import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, PackageMinus, PackagePlus } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    to: "/factory/warehouse",
    key: "pending",
    icon: ClipboardList,
    permission: "workspace.factory.warehouse.pending",
    end: true,
  },
  {
    to: "/factory/warehouse/shipments",
    key: "outbound",
    icon: PackageMinus,
    permission: "workspace.factory.warehouse.outbound",
  },
  {
    to: "/factory/warehouse/receipts",
    key: "inbound",
    icon: PackagePlus,
    permission: "workspace.factory.warehouse.inbound",
  },
] as const;

export function FactoryWarehousePage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();

  return (
    <main className="factory-warehouse">
      <header className="restaurant-workspace-bar">
        <div>
          <span className="eyebrow">{t("workspace.factory")}</span>
          <h1>{t("shopWarehouse.title")}</h1>
          <p>{t("shopWarehouse.description")}</p>
        </div>
        <nav className="restaurant-workspace-nav" aria-label={t("shopWarehouse.title")}>
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
                {t(`shopWarehouse.nav.${link.key}`)}
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
