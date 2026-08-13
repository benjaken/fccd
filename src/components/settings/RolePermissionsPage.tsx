import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchRolePagePermissions,
  SYSTEM_ROLES,
  updateRolePagePermission,
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

  const updatePermission = async (
    permission: RolePagePermission,
    field: "canAccess" | "canManage",
    checked: boolean,
  ) => {
    const next = {
      canAccess:
        field === "canAccess" ? checked : permission.canAccess || checked,
      canManage:
        field === "canManage"
          ? checked
          : checked
            ? permission.canManage
            : false,
    };
    const key = `${permission.role}:${permission.pageKey}`;
    setSavingKey(key);
    setError(null);
    try {
      await savePermission(permission.role, permission.pageKey, next);
      setPermissions((current) =>
        current.map((item) =>
          item.role === permission.role && item.pageKey === permission.pageKey
            ? { ...item, ...next }
            : item,
        ),
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
          <p>{t("settings.roles.description")}</p>
        </div>
        <label className="settings-role-picker">
          <span>{t("settings.roles.role")}</span>
          <select
            value={selectedRole}
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
        </label>
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
            <header className="settings-permissions-summary">
              <ShieldCheck />
              <div>
                <strong>{selectedRole}</strong>
                <span>
                  {selectedRole === "Super Admin"
                    ? t("settings.roles.superAdminNotice")
                    : t("settings.roles.restrictedNotice")}
                </span>
              </div>
            </header>
            <div className="table-wrap settings-permissions-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("settings.roles.columns.page")}</th>
                    <th>{t("settings.roles.columns.route")}</th>
                    <th>{t("settings.roles.columns.risk")}</th>
                    <th>{t("settings.roles.columns.access")}</th>
                    <th>{t("settings.roles.columns.manage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePermissions.map((permission) => {
                    const reserved =
                      permission.pageKey.startsWith("settings.") ||
                      permission.pageKey === "migration";
                    const locked =
                      selectedRole === "Super Admin" ||
                      (selectedRole !== "Super Admin" && reserved);
                    const rowKey = `${permission.role}:${permission.pageKey}`;
                    return (
                      <tr key={permission.pageKey}>
                        <td>
                          <strong>{permission.displayName}</strong>
                        </td>
                        <td>
                          <code>{permission.route}</code>
                        </td>
                        <td>
                          {permission.isHighRisk
                            ? t("settings.roles.highRisk")
                            : t("settings.roles.standard")}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={permission.canAccess}
                            disabled={locked || savingKey === rowKey}
                            onChange={(event) =>
                              void updatePermission(
                                permission,
                                "canAccess",
                                event.target.checked,
                              )
                            }
                            aria-label={`${permission.displayName} ${t(
                              "settings.roles.columns.access",
                            )}`}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={permission.canManage}
                            disabled={
                              locked ||
                              !permission.canAccess ||
                              savingKey === rowKey
                            }
                            onChange={(event) =>
                              void updatePermission(
                                permission,
                                "canManage",
                                event.target.checked,
                              )
                            }
                            aria-label={`${permission.displayName} ${t(
                              "settings.roles.columns.manage",
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
