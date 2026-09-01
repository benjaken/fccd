import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, MailCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import {
  fetchWatiEmailSendLogs,
  WATI_EMAIL_LOG_PAGE_SIZE,
  type WatiEmailLogChannel,
  type WatiEmailSendLogItem,
} from "@/lib/wati-email-send-logs";

type LogsLoader = typeof fetchWatiEmailSendLogs;

const SKELETON_COLUMNS = [
  { width: "8rem" },
  { width: "5rem", variant: "badge" as const },
  { width: "10rem" },
  { width: "10rem" },
  { width: "12rem" },
  { width: "8rem" },
];

function detailSummary(detail: Record<string, unknown>) {
  if (!Array.isArray(detail.parameters)) return null;
  const values = detail.parameters.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const parameter = entry as { name?: unknown; value?: unknown };
    if (typeof parameter.name !== "string" || typeof parameter.value !== "string") return [];
    return [`${parameter.name}: ${parameter.value}`];
  });
  return values.length > 0 ? values.join(" · ") : null;
}

export function WatiEmailSendLogsPage({
  loadLogs = fetchWatiEmailSendLogs,
}: {
  loadLogs?: LogsLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<"" | WatiEmailLogChannel>("");
  const [page, setPage] = useState(1);
  const channelFilter = useDeferredFilter(channel, (value) => {
    setPage(1);
    setChannel(value as "" | WatiEmailLogChannel);
  });
  const [items, setItems] = useState<WatiEmailSendLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / WATI_EMAIL_LOG_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * WATI_EMAIL_LOG_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * WATI_EMAIL_LOG_PAGE_SIZE, total);
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadLogs({ page, search, channel });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [channel, loadLogs, page, reloadKey, search]);

  useEffect(() => void loadPage(), [loadPage]);

  return (
    <section className="orders-page settings-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.watiEmailLogs.title")}</h1>
          <p>{t("settings.watiEmailLogs.description")}</p>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="settings-wati-email-logs-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => {
              setPage(1);
              setSearch(draftSearch.trim());
            }}
            label={t("settings.watiEmailLogs.search")}
            placeholder={t("settings.watiEmailLogs.searchPlaceholder")}
            submitLabel={t("settings.watiEmailLogs.searchAction")}
            filtersActive={Boolean(channel)}
            onConfirmFilters={channelFilter.confirm}
            onDismissFilters={channelFilter.revert}
            filters={
              <label className="orders-status-filter">
                <span>{t("settings.watiEmailLogs.channelFilter")}</span>
                <select
                  value={channelFilter.value}
                  onChange={(event) => channelFilter.setValue(event.target.value as "" | WatiEmailLogChannel)}
                >
                  <option value="">{t("settings.watiEmailLogs.allChannels")}</option>
                  <option value="wati">WATI</option>
                  <option value="email">Email</option>
                </select>
              </label>
            }
          />
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <MailCheck />
            <div>
              <strong>{t("settings.watiEmailLogs.loadError")}</strong>
              <span>{t("settings.watiEmailLogs.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />{t("settings.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <MailCheck />
            <div>
              <strong>{t("settings.watiEmailLogs.empty")}</strong>
              <span>{t("settings.watiEmailLogs.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("settings.watiEmailLogs.loading")}
            skeletonRows={WATI_EMAIL_LOG_PAGE_SIZE}
            skeletonColumns={SKELETON_COLUMNS}
            header={<tr>
              <th>{t("settings.watiEmailLogs.columns.time")}</th>
              <th>{t("settings.watiEmailLogs.columns.channel")}</th>
              <th>{t("settings.watiEmailLogs.columns.content")}</th>
              <th>{t("settings.watiEmailLogs.columns.recipient")}</th>
              <th>{t("settings.watiEmailLogs.columns.address")}</th>
              <th>{t("settings.watiEmailLogs.columns.order")}</th>
            </tr>}
          >
            {items.map((item) => (
              <tr key={item.id}>
                <td>{date.format(new Date(item.sentAt))}</td>
                <td><span className={`status-badge ${item.channel === "wati" ? "green" : "blue"}`}>
                  {item.channel === "wati" ? "WATI" : "Email"}
                </span></td>
                <td>
                  <strong>{t(`settings.watiEmailLogs.events.${item.eventKey}`, { defaultValue: item.eventKey })}</strong>
                  {item.templateName ? <small>{item.templateName}</small> : null}
                  {detailSummary(item.detail) ? <small>{detailSummary(item.detail)}</small> : null}
                </td>
                <td>{item.recipientName || t("common.notSet")}</td>
                <td>{item.recipientAddress || t("common.notSet")}</td>
                <td>{item.orderNumber || t("common.notSet")}</td>
              </tr>
            ))}
          </ListTable>
        )}

        <footer className="orders-pagination">
          <span>{t("settings.pagination", { from: visibleFrom, to: visibleTo, total })}</span>
          <div>
            <Button variant="outline" size="icon" disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t("settings.previous")}><ChevronLeft /></Button>
            <strong>{page} / {totalPages}</strong>
            <Button variant="outline" size="icon" disabled={loading || page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              aria-label={t("settings.next")}><ChevronRight /></Button>
          </div>
        </footer>
      </article>
    </section>
  );
}
