import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageMinus, PackagePlus } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    to: "/kitchen/inventory-records",
    key: "outbound",
    icon: PackageMinus,
    permission: "workspace.factory.warehouse.outbound",
    end: true,
  },
  {
    to: "/kitchen/inventory-records/receipts",
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
      <h1 className="sr-only">{t("shopWarehouse.title")}</h1>
      <section className="panel ingredients-panel inventory-records-shell">
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
        <div className="inventory-records-body">
          <Outlet />
        </div>
      </section>
    </main>
  );
}
