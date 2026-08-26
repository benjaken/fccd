import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import {
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

function PermissionRow({
  node,
  depth,
  savingKey,
  onAccessChange,
  onManageChange,
  selected = false,
  onSelect,
}: {
  node: PermissionTreeNode;
  depth: number;
  savingKey: string | null;
  onAccessChange: (permission: RolePagePermission, checked: boolean) => void;
  onManageChange: (permission: RolePagePermission, checked: boolean) => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { t } = useTranslation();
  const { permission } = node;
  const rowKey = `${permission.role}:${permission.pageKey}`;
  const isAction = permission.pageKind === "action";
  const identity = (
    <>
      <span className="settings-permission-tree-line" aria-hidden="true" />
      <span className="settings-permission-copy">
        <span className="settings-permission-name-line">
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
        </span>
        <span className="settings-permission-meta">
          <code>{permission.route}</code>
          <span>{permission.pageKey}</span>
        </span>
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "settings-permission-row",
        selected && "is-selected",
        permission.isHighRisk && "is-high-risk",
      )}
      data-depth={depth}
      data-page-kind={permission.pageKind}
    >
      {onSelect ? (
        <button
          type="button"
          className="settings-permission-identity settings-permission-select"
          style={{ "--permission-depth": depth } as CSSProperties}
          onClick={onSelect}
          aria-pressed={selected}
        >
          {identity}
        </button>
      ) : (
        <div
          className="settings-permission-identity"
          style={{ "--permission-depth": depth } as CSSProperties}
        >
          {identity}
        </div>
      )}

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
  );
}

function PermissionColumn({
  level,
  title,
  nodes,
  selectedPageKey,
  onSelect,
  savingKey,
  onAccessChange,
  onManageChange,
}: {
  level: "first" | "second" | "third";
  title: string;
  nodes: PermissionTreeNode[];
  selectedPageKey?: string | null;
  onSelect?: (pageKey: string) => void;
  savingKey: string | null;
  onAccessChange: (permission: RolePagePermission, checked: boolean) => void;
  onManageChange: (permission: RolePagePermission, checked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <section
      className="settings-permission-level-column"
      aria-label={t(`settings.roles.levels.${level}`)}
    >
      <header className="settings-permission-level-heading">
        <div className="settings-permission-level-title">
          <span>{t(`settings.roles.levels.${level}`)}</span>
          <strong>{title}</strong>
          <small>{nodes.length}</small>
        </div>
        <span>{t("settings.roles.columns.access")}</span>
        <span>{t("settings.roles.columns.manage")}</span>
      </header>
      <div className="settings-permission-level-list">
        {nodes.length ? (
          nodes.map((node) => (
            <PermissionRow
              key={node.permission.pageKey}
              node={node}
              depth={0}
              selected={node.permission.pageKey === selectedPageKey}
              onSelect={
                onSelect
                  ? () => onSelect(node.permission.pageKey)
                  : undefined
              }
              savingKey={savingKey}
              onAccessChange={onAccessChange}
              onManageChange={onManageChange}
            />
          ))
        ) : (
          <div className="settings-permission-level-empty">
            <span>{t("settings.roles.levelEmpty")}</span>
          </div>
        )}
      </div>
    </section>
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
  const [selectedRootKey, setSelectedRootKey] = useState<string | null>(null);
  const [selectedSecondKey, setSelectedSecondKey] = useState<string | null>(
    null,
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
  const selectedRoot = useMemo(
    () =>
      filteredTree.find(
        (node) => node.permission.pageKey === selectedRootKey,
      ) ?? filteredTree[0],
    [filteredTree, selectedRootKey],
  );
  const secondLevelNodes = selectedRoot?.children ?? [];
  const selectedSecond = useMemo(
    () =>
      secondLevelNodes.find(
        (node) => node.permission.pageKey === selectedSecondKey,
      ) ?? secondLevelNodes[0],
    [secondLevelNodes, selectedSecondKey],
  );
  const thirdLevelNodes = selectedSecond?.children ?? [];

  useEffect(() => {
    const nextRootKey = filteredTree[0]?.permission.pageKey ?? null;
    setSelectedRootKey((current) =>
      current &&
      filteredTree.some((node) => node.permission.pageKey === current)
        ? current
        : nextRootKey,
    );
  }, [filteredTree]);

  useEffect(() => {
    const nextSecondKey = secondLevelNodes[0]?.permission.pageKey ?? null;
    setSelectedSecondKey((current) =>
      current &&
      secondLevelNodes.some((node) => node.permission.pageKey === current)
        ? current
        : nextSecondKey,
    );
  }, [secondLevelNodes]);

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
    setSelectedRootKey(null);
    setSelectedSecondKey(null);
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
              </header>

              <PullToRefresh
                className="settings-permission-tree"
                onRefresh={() => setReloadKey((key) => key + 1)}
                refreshing={loading}
              >
                {filteredTree.length ? (
                  <div className="settings-permission-level-columns">
                    <PermissionColumn
                      level="first"
                      title={t("settings.roles.sitemap")}
                      nodes={filteredTree}
                      selectedPageKey={selectedRoot?.permission.pageKey}
                      onSelect={(pageKey) => {
                        setSelectedRootKey(pageKey);
                        setSelectedSecondKey(null);
                      }}
                      savingKey={savingKey}
                      onAccessChange={(permission, checked) =>
                        void saveCascade(permission, "canAccess", checked)
                      }
                      onManageChange={(permission, checked) =>
                        void saveCascade(permission, "canManage", checked)
                      }
                    />
                    <PermissionColumn
                      level="second"
                      title={
                        selectedRoot?.permission.displayName ??
                        t("settings.roles.levelEmpty")
                      }
                      nodes={secondLevelNodes}
                      selectedPageKey={selectedSecond?.permission.pageKey}
                      onSelect={(pageKey) => setSelectedSecondKey(pageKey)}
                      savingKey={savingKey}
                      onAccessChange={(permission, checked) =>
                        void saveCascade(permission, "canAccess", checked)
                      }
                      onManageChange={(permission, checked) =>
                        void saveCascade(permission, "canManage", checked)
                      }
                    />
                    <PermissionColumn
                      level="third"
                      title={
                        selectedSecond?.permission.displayName ??
                        t("settings.roles.levelEmpty")
                      }
                      nodes={thirdLevelNodes}
                      savingKey={savingKey}
                      onAccessChange={(permission, checked) =>
                        void saveCascade(permission, "canAccess", checked)
                      }
                      onManageChange={(permission, checked) =>
                        void saveCascade(permission, "canManage", checked)
                      }
                    />
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
