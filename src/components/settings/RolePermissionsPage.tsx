import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Eye,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Switch } from "@/components/ui/switch";
import {
  fetchRolePagePermissions,
  SYSTEM_ROLES,
  updateRolePagePermission,
  updateRolePagePermissionCascade,
  type RolePagePermission,
  type SystemRole,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

type PermissionTreeNode = {
  permission: RolePagePermission;
  children: PermissionTreeNode[];
};

type PermissionTreeSummary = {
  total: number;
  access: number;
  manage: number;
};

function buildPermissionTree(
  permissions: RolePagePermission[],
): PermissionTreeNode[] {
  const nodes = new Map<string, PermissionTreeNode>();
  for (const permission of permissions) {
    nodes.set(permission.pageKey, { permission, children: [] });
  }

  const roots: PermissionTreeNode[] = [];
  for (const permission of permissions) {
    const node = nodes.get(permission.pageKey)!;
    const parent = permission.parentPageKey
      ? nodes.get(permission.parentPageKey)
      : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function filterPermissionTree(
  nodes: PermissionTreeNode[],
  query: string,
): PermissionTreeNode[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return nodes;

  return nodes.flatMap<PermissionTreeNode>((node) => {
    const children: PermissionTreeNode[] = filterPermissionTree(
      node.children,
      normalized,
    );
    const permission = node.permission;
    const matches = [
      permission.displayName,
      permission.route,
      permission.pageKey,
    ].some((value) => value.toLocaleLowerCase().includes(normalized));
    return matches || children.length ? [{ ...node, children }] : [];
  });
}

function summarizeTree(nodes: PermissionTreeNode[]): PermissionTreeSummary {
  return nodes.reduce((summary, node) => {
    const children: PermissionTreeSummary = summarizeTree(node.children);
    return {
      total: summary.total + 1 + children.total,
      access:
        summary.access +
        (node.permission.canAccess ? 1 : 0) +
        children.access,
      manage:
        summary.manage +
        (node.permission.canManage ? 1 : 0) +
        children.manage,
    };
  }, { total: 0, access: 0, manage: 0 });
}

function PermissionRow({
  node,
  depth,
  savingKey,
  onAccessChange,
  onManageChange,
}: {
  node: PermissionTreeNode;
  depth: number;
  savingKey: string | null;
  onAccessChange: (permission: RolePagePermission, checked: boolean) => void;
  onManageChange: (permission: RolePagePermission, checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const { permission } = node;
  const rowKey = `${permission.role}:${permission.pageKey}`;
  const isAction = permission.pageKind === "action";

  return (
    <>
      <div
        className={cn(
          "settings-permission-row",
          permission.isHighRisk && "is-high-risk",
        )}
        data-depth={depth}
        data-page-kind={permission.pageKind}
      >
        <div
          className="settings-permission-identity"
          style={{ "--permission-depth": depth } as CSSProperties}
        >
          <span className="settings-permission-tree-line" aria-hidden="true" />
          <div className="settings-permission-copy">
            <div className="settings-permission-name-line">
              <strong>{permission.displayName}</strong>
              <span className="settings-permission-kind">
                {t(`settings.roles.kinds.${permission.pageKind}`)}
              </span>
              {permission.isHighRisk ? (
                <span className="settings-permission-risk">
                  <TriangleAlert aria-hidden="true" />
                  {t("settings.roles.highRisk")}
                </span>
              ) : null}
            </div>
            <div className="settings-permission-meta">
              <code>{permission.route}</code>
              <span>{permission.pageKey}</span>
            </div>
          </div>
        </div>

        <div className="settings-permission-toggle">
          <Switch
            checked={permission.canAccess}
            disabled={savingKey?.startsWith(rowKey)}
            onCheckedChange={(checked) => onAccessChange(permission, checked)}
            aria-label={`${permission.displayName} ${t(
              "settings.roles.columns.access",
            )}`}
          />
        </div>

        <div className="settings-permission-toggle">
          {isAction ? (
            <span className="settings-permission-not-applicable">
              {t("settings.roles.notApplicable")}
            </span>
          ) : (
            <Switch
              checked={permission.canManage}
              disabled={
                !permission.canAccess || savingKey?.startsWith(rowKey)
              }
              onCheckedChange={(checked) => onManageChange(permission, checked)}
              aria-label={`${permission.displayName} ${t(
                "settings.roles.columns.manage",
              )}`}
            />
          )}
        </div>
      </div>

      {node.children.map((child) => (
        <PermissionRow
          key={child.permission.pageKey}
          node={child}
          depth={depth + 1}
          savingKey={savingKey}
          onAccessChange={onAccessChange}
          onManageChange={onManageChange}
        />
      ))}
    </>
  );
}

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
  const [query, setQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

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
  const permissionTree = useMemo(
    () => buildPermissionTree(visiblePermissions),
    [visiblePermissions],
  );
  const filteredTree = useMemo(
    () => filterPermissionTree(permissionTree, query),
    [permissionTree, query],
  );
  const roleCounts = useMemo(() => {
    const counts = new Map<SystemRole, { access: number; total: number }>();
    for (const role of SYSTEM_ROLES) {
      const rows = permissions.filter((item) => item.role === role);
      counts.set(role, {
        access: rows.filter((item) => item.canAccess).length,
        total: rows.length,
      });
    }
    return counts;
  }, [permissions]);
  const accessCount = visiblePermissions.filter((item) => item.canAccess).length;
  const manageCount = visiblePermissions.filter((item) => item.canManage).length;
  const highRiskCount = visiblePermissions.filter(
    (item) => item.isHighRisk && item.canAccess,
  ).length;
  const allSectionsExpanded =
    permissionTree.length > 0 &&
    permissionTree.every((node) =>
      expandedSections.has(node.permission.pageKey),
    );

  useEffect(() => {
    setExpandedSections(
      new Set(permissionTree.map((node) => node.permission.pageKey)),
    );
  }, [selectedRole, permissionTree.length]);

  const applyUpdates = (
    role: SystemRole,
    updates: Map<string, { canAccess: boolean; canManage: boolean }>,
  ) => {
    setPermissions((current) =>
      current.map((item) => {
        if (item.role !== role) return item;
        const next = updates.get(item.pageKey);
        return next ? { ...item, ...next } : item;
      }),
    );
  };

  const saveCascade = async (
    permission: RolePagePermission,
    field: "canAccess" | "canManage",
    checked: boolean,
  ) => {
    const key = `${permission.role}:${permission.pageKey}${
      field === "canManage" ? ":manage" : ""
    }`;
    setSavingKey(key);
    setError(null);
    try {
      const updates = await updateRolePagePermissionCascade(
        permission.role,
        permission.pageKey,
        field,
        checked,
        permissions,
        savePermission,
      );
      applyUpdates(permission.role, updates);
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

  const selectRole = (role: SystemRole) => {
    setSelectedRole(role);
    setQuery("");
  };

  const toggleAllSections = () => {
    setExpandedSections(
      allSectionsExpanded
        ? new Set()
        : new Set(permissionTree.map((node) => node.permission.pageKey)),
    );
  };

  return (
    <section className="settings-permissions-page">
      <header className="page-heading settings-permissions-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.roles.title")}</h1>
          <p>{t("settings.roles.description")}</p>
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
          <PageSkeleton
            compact
            label={t("settings.roles.loading")}
            variant="table"
          />
        ) : (
          <div className="settings-permissions-layout">
            <aside className="settings-role-sidebar" aria-label={t("settings.roles.roleList")}>
              <div className="settings-role-sidebar-heading">
                <ShieldCheck aria-hidden="true" />
                <span>{t("settings.roles.chooseRole")}</span>
              </div>
              <div className="settings-role-list">
                {SYSTEM_ROLES.map((role) => {
                  const counts = roleCounts.get(role) ?? { access: 0, total: 0 };
                  return (
                    <button
                      type="button"
                      key={role}
                      className={cn(
                        "settings-role-option",
                        selectedRole === role && "is-active",
                      )}
                      onClick={() => selectRole(role)}
                      aria-pressed={selectedRole === role}
                    >
                      <span>{role}</span>
                      <small>{counts.access}/{counts.total}</small>
                    </button>
                  );
                })}
              </div>
              <p>{t("settings.roles.cascadeNotice")}</p>
            </aside>

            <div className="settings-permission-workspace">
              <header className="settings-permissions-toolbar">
                <div>
                  <span>{t("settings.roles.viewingRole")}</span>
                  <strong>{selectedRole}</strong>
                </div>
                <label className="settings-permission-search">
                  <Search aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("settings.roles.searchPlaceholder")}
                    aria-label={t("settings.roles.search")}
                  />
                </label>
                <Button type="button" variant="outline" onClick={toggleAllSections}>
                  {allSectionsExpanded
                    ? t("settings.roles.collapseAll")
                    : t("settings.roles.expandAll")}
                </Button>
              </header>

              <div className="settings-permission-summary">
                <div>
                  <Eye aria-hidden="true" />
                  <span>{t("settings.roles.summary.access")}</span>
                  <strong>{accessCount}<small>/{visiblePermissions.length}</small></strong>
                </div>
                <div>
                  <PencilLine aria-hidden="true" />
                  <span>{t("settings.roles.summary.manage")}</span>
                  <strong>{manageCount}</strong>
                </div>
                <div className={cn(highRiskCount > 0 && "has-risk")}>
                  <TriangleAlert aria-hidden="true" />
                  <span>{t("settings.roles.summary.highRisk")}</span>
                  <strong>{highRiskCount}</strong>
                </div>
              </div>

              <div className="settings-permission-column-labels" aria-hidden="true">
                <span>{t("settings.roles.sitemap")}</span>
                <span>{t("settings.roles.columns.access")}</span>
                <span>{t("settings.roles.columns.manage")}</span>
              </div>

              <PullToRefresh
                className="settings-permission-tree"
                onRefresh={() => setReloadKey((key) => key + 1)}
                refreshing={loading}
              >
                {filteredTree.length ? (
                  <div className="settings-permission-grid">
                    {filteredTree.map((node) => {
                      const pageKey = node.permission.pageKey;
                      const expanded = query.trim()
                        ? true
                        : expandedSections.has(pageKey);
                      const summary = summarizeTree([node]);
                      return (
                        <section className="settings-permission-section" key={pageKey}>
                          <header className="settings-permission-section-heading">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSections((current) => {
                                  const next = new Set(current);
                                  if (next.has(pageKey)) next.delete(pageKey);
                                  else next.add(pageKey);
                                  return next;
                                })
                              }
                              aria-expanded={expanded}
                            >
                              <span className="settings-permission-section-label">
                                <ChevronRight aria-hidden="true" />
                                <strong>{node.permission.displayName}</strong>
                                <small>{summary.total}</small>
                              </span>
                              <span className="settings-permission-section-stat">
                                {summary.access}
                              </span>
                              <span className="settings-permission-section-stat">
                                {summary.manage}
                              </span>
                            </button>
                          </header>
                          {expanded ? (
                            <div className="settings-permission-section-body">
                              <PermissionRow
                                node={node}
                                depth={0}
                                savingKey={savingKey}
                                onAccessChange={(permission, checked) =>
                                  void saveCascade(permission, "canAccess", checked)
                                }
                                onManageChange={(permission, checked) =>
                                  void saveCascade(permission, "canManage", checked)
                                }
                              />
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="settings-permission-empty">
                    <Search aria-hidden="true" />
                    <strong>{t("settings.roles.emptySearch")}</strong>
                    <span>{t("settings.roles.emptySearchDescription")}</span>
                  </div>
                )}
              </PullToRefresh>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
