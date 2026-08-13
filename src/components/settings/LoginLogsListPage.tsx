import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchLoginLogs,
  LOGIN_LOG_EVENT_TYPES,
  SETTINGS_PAGE_SIZE,
  type LoginLogItem,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

type LoginLogsLoader = typeof fetchLoginLogs;

export function LoginLogsListPage({
  loadLogs = fetchLoginLogs,
}: {
  loadLogs?: LoginLogsLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LoginLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / SETTINGS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * SETTINGS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * SETTINGS_PAGE_SIZE, total);
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadLogs({ page, search, eventType });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "login_logs_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [eventType, loadLogs, page, reloadKey, search]);

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
          <h1>{t("settings.loginLogs.title")}</h1>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <form className="orders-search" onSubmit={submitSearch}>
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="settings-login-logs-search">
              {t("settings.loginLogs.search")}
            </label>
            <input
              id="settings-login-logs-search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder={t("settings.loginLogs.searchPlaceholder")}
            />
            <Button type="submit" variant="outline">
              {t("settings.loginLogs.searchAction")}
            </Button>
          </form>

          <label className="orders-status-filter">
            <span>{t("settings.loginLogs.eventFilter")}</span>
            <select
              value={eventType}
              onChange={(event) => {
                setPage(1);
                setEventType(event.target.value);
              }}
            >
              <option value="">{t("settings.loginLogs.allEvents")}</option>
              {LOGIN_LOG_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`settings.loginLogs.events.${type}`)}
                </option>
              ))}
            </select>
          </label>
        </header>

        {loading ? (
          <div className="orders-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("settings.loginLogs.loading")}</span>
          </div>
        ) : error ? (
          <div className="orders-state orders-state-error" role="alert">
            <History />
            <div>
              <strong>{t("settings.loginLogs.loadError")}</strong>
              <span>{t("settings.loginLogs.loadErrorDescription")}</span>
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
            <History />
            <div>
              <strong>{t("settings.loginLogs.empty")}</strong>
              <span>{t("settings.loginLogs.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="table-wrap orders-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("settings.loginLogs.columns.time")}</th>
                  <th>{t("settings.loginLogs.columns.event")}</th>
                  <th>{t("settings.loginLogs.columns.user")}</th>
                  <th>{t("settings.loginLogs.columns.email")}</th>
                  <th>{t("settings.loginLogs.columns.role")}</th>
                  <th>{t("settings.loginLogs.columns.ip")}</th>
                  <th>{t("settings.loginLogs.columns.detail")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{date.format(new Date(item.createdAt))}</td>
                    <td>
                      <span
                        className={cn(
                          "status-badge",
                          item.eventType === "login_success" && "green",
                          item.eventType === "login_failure" && "red",
                          item.eventType === "logout" && "blue",
                          item.eventType === "password_reset_request" &&
                            "amber",
                          item.eventType === "password_change" && "amber",
                        )}
                      >
                        {t(`settings.loginLogs.events.${item.eventType}`)}
                      </span>
                    </td>
                    <td>
                      <strong>{item.userName || t("common.notSet")}</strong>
                    </td>
                    <td>{item.email || t("common.notSet")}</td>
                    <td>{item.role || t("common.notSet")}</td>
                    <td>
                      <code>{item.ipAddress || t("common.notSet")}</code>
                    </td>
                    <td>
                      {item.errorCode ||
                        (item.userAgent
                          ? item.userAgent.slice(0, 48)
                          : t("common.notSet"))}
                    </td>
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
