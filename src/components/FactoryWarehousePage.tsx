import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageMinus, PackagePlus, Warehouse } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    to: "/restaurant/ordering/inventory",
    key: "outbound",
    icon: PackageMinus,
    permission: "workspace.factory.warehouse.outbound",
    end: true,
  },
  {
    to: "/restaurant/ordering/inventory/receipts",
    key: "inbound",
    icon: PackagePlus,
    permission: "workspace.factory.warehouse.inbound",
  },
] as const;

export function FactoryWarehousePage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();

  return (
    <main className="inventory-records-workspace">
      <header className="inventory-records-hero">
        <div className="inventory-records-title">
          <span className="inventory-records-icon" aria-hidden="true"><Warehouse /></span>
          <div>
            <span className="eyebrow">{t("shopOrdering.office")}</span>
            <h1>{t("shopWarehouse.title")}</h1>
            <p>{t("shopWarehouse.description")}</p>
          </div>
        </div>
        <nav className="inventory-records-nav" aria-label={t("shopWarehouse.title")}>
          {LINKS.filter((link) => access.canAccess(link.permission)).map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={"end" in link ? link.end : false}
                className={({ isActive }) => cn("inventory-records-link", isActive && "active")}
              >
                <Icon />
                {t(`shopWarehouse.nav.${link.key}`)}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <div className="inventory-records-body">
        <Outlet />
      </div>
    </main>
  );
}
