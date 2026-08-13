import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  fetchRolePagePermissions,
  isPagePermissionLocked,
  SYSTEM_ROLES,
  updateRolePagePermission,
  updateRolePagePermissionCascade,
  type RolePagePermission,
  type SystemRole,
} from "@/lib/settings";

export function RolePermissionsPage({
  loadPermissions = fetchRolePagePermissions,
  savePermission = updateRolePagePermission,
}: {
  loadPermissions?: typeof fetchRolePagePermissions;
  savePermission?: typeof updateRolePagePermission;
}) {
  const { t } = useTranslation();
  const [selectedRole, setSelectedRole] = useState<SystemRole>("Super Admin");
  const [permissions, setPermissions] = useState<RolePagePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPermissions(await loadPermissions());
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "permissions_load_failed";
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [loadPermissions, reloadKey]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const visiblePermissions = useMemo(
    () => permissions.filter((item) => item.role === selectedRole),
    [permissions, selectedRole],
  );

  const updateAccess = async (
    permission: RolePagePermission,
    checked: boolean,
  ) => {
    const key = `${permission.role}:${permission.pageKey}`;
    setSavingKey(key);
    setError(null);
    try {
      const updates = await updateRolePagePermissionCascade(
        permission.role,
        permission.pageKey,
        "canAccess",
        checked,
        permissions,
        savePermission,
      );
      setPermissions((current) =>
        current.map((item) => {
          if (item.role !== permission.role) return item;
          const next = updates.get(item.pageKey);
          return next ? { ...item, ...next } : item;
        }),
      );
    } catch (saveError) {
      const code =
        typeof saveError === "object" &&
        saveError &&
        "code" in saveError &&
        typeof saveError.code === "string"
          ? saveError.code
          : "permissions_save_failed";
      setError(code);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="settings-permissions-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.roles.title")}</h1>
        </div>
      </header>

      {error && (
        <div className="dashboard-state dashboard-state-error" role="alert">
          <div>
            <strong>{t("settings.roles.error")}</strong>
            <span>{t("settings.roles.errorDescription")}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw />
            {t("settings.retry")}
          </Button>
        </div>
      )}

      <article className="panel settings-permissions-panel">
        {loading ? (
          <div className="orders-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("settings.roles.loading")}</span>
          </div>
        ) : (
          <>
            <header className="settings-permissions-toolbar">
              <label className="settings-role-select">
                <span className="settings-role-select-hint">
                  {t("settings.roles.viewingRole")}
                </span>
                <select
                  value={selectedRole}
                  aria-label={t("settings.roles.viewingRole")}
                  onChange={(event) =>
                    setSelectedRole(event.target.value as SystemRole)
                  }
                >
                  {SYSTEM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            </header>
            <div className="table-wrap settings-permissions-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("settings.roles.columns.page")}</th>
                    <th>{t("settings.roles.columns.route")}</th>
                    <th>{t("settings.roles.columns.kind")}</th>
                    <th>{t("settings.roles.columns.risk")}</th>
                    <th>{t("settings.roles.columns.access")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePermissions.map((permission) => {
                    const locked = isPagePermissionLocked(
                      selectedRole,
                      permission.pageKey,
                    );
                    const rowKey = `${permission.role}:${permission.pageKey}`;
                    const kindLabel = t(
                      `settings.roles.kinds.${permission.pageKind}`,
                    );
                    return (
                      <tr
                        key={permission.pageKey}
                        className={
                          permission.depth > 0
                            ? "settings-permission-child"
                            : "settings-permission-parent"
                        }
                        data-depth={permission.depth}
                        data-page-kind={permission.pageKind}
                      >
                        <td>
                          <div
                            className="settings-permission-label"
                            style={{
                              paddingInlineStart: `${permission.depth * 20}px`,
                            }}
                          >
                            {permission.depth > 0 && (
                              <span
                                className="settings-permission-branch"
                                aria-hidden="true"
                              >
                                └
                              </span>
                            )}
                            <strong>{permission.displayName}</strong>
                          </div>
                        </td>
                        <td>
                          <code>{permission.route}</code>
                        </td>
                        <td>{kindLabel}</td>
                        <td>
                          {permission.isHighRisk
                            ? t("settings.roles.highRisk")
                            : t("settings.roles.standard")}
                        </td>
                        <td>
                          <Switch
                            checked={permission.canAccess}
                            disabled={locked || savingKey === rowKey}
                            onCheckedChange={(checked) =>
                              void updateAccess(permission, checked)
                            }
                            aria-label={`${permission.displayName} ${t(
                              "settings.roles.columns.access",
                            )}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
