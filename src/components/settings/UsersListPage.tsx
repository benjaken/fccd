import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchUsers,
  SETTINGS_PAGE_SIZE,
  SYSTEM_ROLES,
  type UserListItem,
} from "@/lib/settings";

type UsersLoader = typeof fetchUsers;

export function UsersListPage({
  loadUsers = fetchUsers,
}: {
  loadUsers?: UsersLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  };

  return (
    <section className="orders-page settings-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.users.title")}</h1>
          <p>{t("settings.users.description")}</p>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <form className="orders-search" onSubmit={submitSearch}>
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="settings-users-search">
              {t("settings.users.search")}
            </label>
            <input
              id="settings-users-search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder={t("settings.users.searchPlaceholder")}
            />
            <Button type="submit" variant="outline">
              {t("settings.users.searchAction")}
            </Button>
          </form>

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

        {loading ? (
          <div className="orders-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("settings.users.loading")}</span>
          </div>
        ) : error ? (
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
        ) : items.length === 0 ? (
          <div className="orders-state">
            <Users />
            <div>
              <strong>{t("settings.users.empty")}</strong>
              <span>{t("settings.users.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="table-wrap orders-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("settings.users.columns.name")}</th>
                  <th>{t("settings.users.columns.email")}</th>
                  <th>{t("settings.users.columns.role")}</th>
                  <th>{t("settings.users.columns.restaurant")}</th>
                  <th>{t("settings.users.columns.created")}</th>
                  <th>{t("settings.users.columns.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.userName || t("common.notSet")}</strong>
                    </td>
                    <td>{user.email || t("common.notSet")}</td>
                    <td>
                      <span className="status-badge blue">
                        {user.role || t("common.notSet")}
                      </span>
                    </td>
                    <td>{user.shopRestroLegacyId || t("common.notSet")}</td>
                    <td>{date.format(new Date(user.createdAt))}</td>
                    <td>{date.format(new Date(user.updatedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </section>
  );
}
