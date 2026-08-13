import { Database, FileArchive, Languages, Network, TableProperties } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { DataMigrationPage } from "@/components/DataMigrationPage";
import { FileMigrationPage } from "@/components/FileMigrationPage";
import { MigrationControlPage } from "@/components/MigrationControlPage";
import { MigratedFkPage } from "@/components/MigratedFkPage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MigrationWorkspace() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const isSuperAdmin = session?.user.app_metadata?.role === "Super Admin";

  const switchLanguage = () => {
    void i18n.changeLanguage(i18n.language === "en" ? "zh-HK" : "en");
  };

  return (
    <main className="public-migration-shell">
      <div className="migration-workspace">
        <header className="migration-workspace-header">
          <div>
            <span className="brand-mark" aria-hidden="true">
              <span>FC</span>
            </span>
            <div>
              <strong>{t("migrationWorkspace.title")}</strong>
              <small>{t("migrationWorkspace.readOnlyPublic")}</small>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={switchLanguage}
            aria-label={t("common.switchLanguage")}
          >
            <Languages />
            {i18n.language === "en" ? "繁體中文" : "English"}
          </Button>
        </header>

        <nav
          className="migration-tabs"
          aria-label={t("migrationWorkspace.navigation")}
        >
          <NavLink
            to="/migration/control"
            className={({ isActive }) =>
              cn("migration-tab", isActive && "active")
            }
          >
            <Database />
            {t("migrationWorkspace.controlTab")}
          </NavLink>
          <NavLink
            to="/migration/inventory"
            className={({ isActive }) =>
              cn("migration-tab", isActive && "active")
            }
          >
            <TableProperties />
            {t("migrationWorkspace.inventoryTab")}
          </NavLink>
          <NavLink
            to="/migration/fk"
            className={({ isActive }) =>
              cn("migration-tab", isActive && "active")
            }
          >
            <Network />
            {t("migrationWorkspace.fkTab")}
          </NavLink>
          <NavLink
            to="/migration/files"
            className={({ isActive }) =>
              cn("migration-tab", isActive && "active")
            }
          >
            <FileArchive />
            {t("migrationWorkspace.filesTab")}
          </NavLink>
        </nav>

        <Routes>
          <Route index element={<Navigate to="control" replace />} />
          <Route
            path="control"
            element={<MigrationControlPage isSuperAdmin={isSuperAdmin} />}
          />
          <Route path="inventory" element={<DataMigrationPage />} />
          <Route path="fk" element={<MigratedFkPage />} />
          <Route
            path="files"
            element={<FileMigrationPage isSuperAdmin={isSuperAdmin} />}
          />
          <Route path="*" element={<Navigate to="control" replace />} />
        </Routes>
      </div>
    </main>
  );
}
