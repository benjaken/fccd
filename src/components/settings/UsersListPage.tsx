import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { usePageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { ChangePasswordSidePanel } from "@/components/settings/ChangePasswordSidePanel";
import { CreateUserSidePanel } from "@/components/settings/CreateUserSidePanel";
import { EditUserSidePanel } from "@/components/settings/EditUserSidePanel";
import { restaurantLabel } from "@/components/settings/RestaurantSelect";
import {
  fetchRestaurantOptions,
  fetchUsers,
  SETTINGS_PAGE_SIZE,
  SYSTEM_ROLES,
  USER_ACTION_PERMISSION_KEYS,
  type RestaurantOption,
  type UserListItem,
} from "@/lib/settings";

type UsersLoader = typeof fetchUsers;

const USER_SKELETON_COLUMNS = [
  { width: "65%" },
  { width: "72%" },
  { width: "6rem" },
  { width: "5rem", variant: "badge" as const },
  { width: "60%" },
  { width: "7rem" },
  { width: "7rem" },
];

export function UsersListPage({
  loadUsers = fetchUsers,
  loadRestaurants = fetchRestaurantOptions,
  createUser,
  updatePassword,
  updateProfile,
}: {
  loadUsers?: UsersLoader;
  loadRestaurants?: typeof fetchRestaurantOptions;
  createUser?: typeof import("@/lib/settings").createManagedUser;
  updatePassword?: typeof import("@/lib/settings").updateManagedUserPassword;
  updateProfile?: typeof import("@/lib/settings").updateManagedUserProfile;
}) {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const authorizationRole =
    typeof user?.app_metadata?.role === "string"
      ? user.app_metadata.role
      : profile?.role;
  const pageAccess = usePageAccess(authorizationRole);
  const canCreate = pageAccess.canAccess(USER_ACTION_PERMISSION_KEYS.create);
  const canEdit = pageAccess.canAccess(USER_ACTION_PERMISSION_KEYS.edit);
  const canChangePassword = pageAccess.canAccess(
    USER_ACTION_PERMISSION_KEYS.changePassword,
  );
  const showActions = canEdit || canChangePassword;

  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<UserListItem[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserListItem | null>(null);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / SETTINGS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * SETTINGS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * SETTINGS_PAGE_SIZE, total);
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: "Asia/Hong_Kong",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadUsers({ page, search, role });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "users_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [loadUsers, page, reloadKey, role, search]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    let active = true;
    void loadRestaurants()
      .then((options) => {
        if (active) setRestaurants(options);
      })
      .catch(() => {
        if (active) setRestaurants([]);
      });
    return () => {
      active = false;
    };
  }, [loadRestaurants]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  return (
    <section className="orders-page settings-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.users.title")}</h1>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("settings.users.createAction")}
          </Button>
        ) : null}
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="settings-users-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("settings.users.search")}
            placeholder={t("settings.users.searchPlaceholder")}
            submitLabel={t("settings.users.searchAction")}
          />

          <label className="orders-status-filter">
            <span>{t("settings.users.roleFilter")}</span>
            <select
              value={role}
              onChange={(event) => {
                setPage(1);
                setRole(event.target.value);
              }}
            >
              <option value="">{t("settings.users.allRoles")}</option>
              {SYSTEM_ROLES.map((systemRole) => (
                <option key={systemRole} value={systemRole}>
                  {systemRole}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <Users />
            <div>
              <strong>{t("settings.users.loadError")}</strong>
              <span>{t("settings.users.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw />
              {t("settings.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <Users />
            <div>
              <strong>{t("settings.users.empty")}</strong>
              <span>{t("settings.users.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("settings.users.loading")}
            skeletonRows={SETTINGS_PAGE_SIZE}
            skeletonColumns={
              showActions
                ? [
                    ...USER_SKELETON_COLUMNS,
                    { width: "4rem", variant: "action" as const },
                  ]
                : USER_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("settings.users.columns.name")}</th>
                <th>{t("settings.users.columns.email")}</th>
                <th>{t("settings.users.columns.phone")}</th>
                <th>{t("settings.users.columns.role")}</th>
                <th>{t("settings.users.columns.restaurant")}</th>
                <th>{t("settings.users.columns.created")}</th>
                <th>{t("settings.users.columns.updated")}</th>
                {showActions ? (
                  <th>{t("settings.users.columns.actions")}</th>
                ) : null}
              </tr>
            }
          >
            {items.map((listUser) => (
              <tr key={listUser.id}>
                <td>
                  <strong>{listUser.userName || t("common.notSet")}</strong>
                </td>
                <td>{listUser.email || t("common.notSet")}</td>
                <td>{listUser.phone || t("common.notSet")}</td>
                <td>
                  <span className="status-badge blue">
                    {listUser.role || t("common.notSet")}
                  </span>
                </td>
                <td>
                  {restaurantLabel(
                    listUser.shopRestroLegacyId,
                    restaurants,
                    t("common.notSet"),
                  )}
                </td>
                <td>{date.format(new Date(listUser.createdAt))}</td>
                <td>{date.format(new Date(listUser.updatedAt))}</td>
                {showActions ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setEditUser(listUser)}
                          aria-label={t("settings.users.editAction")}
                          title={t("settings.users.editAction")}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      {canChangePassword ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setPasswordUser(listUser)}
                          aria-label={t("settings.users.changePassword")}
                          title={t("settings.users.changePassword")}
                        >
                          <KeyRound />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}

        <footer className="orders-pagination">
          <span>
            {t("settings.pagination", {
              from: visibleFrom,
              to: visibleTo,
              total,
            })}
          </span>
          <div>
            <Button
              variant="outline"
              size="icon"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t("settings.previous")}
            >
              <ChevronLeft />
            </Button>
            <strong>
              {page} / {totalPages}
            </strong>
            <Button
              variant="outline"
              size="icon"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              aria-label={t("settings.next")}
            >
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </article>

      {canCreate ? (
        <CreateUserSidePanel
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setPage(1);
            setReloadKey((key) => key + 1);
          }}
          createUser={createUser}
          loadRestaurants={loadRestaurants}
        />
      ) : null}
      {canEdit ? (
        <EditUserSidePanel
          user={editUser}
          open={Boolean(editUser)}
          onClose={() => setEditUser(null)}
          onUpdated={() => setReloadKey((key) => key + 1)}
          updateProfile={updateProfile}
          loadRestaurants={loadRestaurants}
        />
      ) : null}
      {canChangePassword ? (
        <ChangePasswordSidePanel
          user={passwordUser}
          open={Boolean(passwordUser)}
          onClose={() => setPasswordUser(null)}
          updatePassword={updatePassword}
        />
      ) : null}
    </section>
  );
}
