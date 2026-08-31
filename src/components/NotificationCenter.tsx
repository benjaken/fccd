import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Info,
  TriangleAlert,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  fetchNotifications,
  markNotificationRead,
  notificationDestination,
  refreshDueNotifications,
  resolveNotification,
  snoozeNotification,
  subscribeToNotifications,
  type BusinessNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import "@/components/notification-center.css";

type Filter = "all" | "unread" | "action" | "urgent";

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

export function NotificationCenter({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<BusinessNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [urgentPopupVisible, setUrgentPopupVisible] = useState(false);
  const initialLoad = useRef(true);
  const seenUrgentIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      setError(false);
      const next = await fetchNotifications();
      setItems(next);
      const newUrgentReconciliation = next.filter(
        (item) =>
          item.eventType === "order_reconciliation_urgent"
          && item.priority === "urgent"
          && !item.readAt
          && !seenUrgentIds.current.has(item.id),
      );
      if (newUrgentReconciliation.length) {
        setUrgentPopupVisible(true);
        newUrgentReconciliation.forEach((item) => seenUrgentIds.current.add(item.id));
      }
      if (initialLoad.current && next.some((item) => item.category === "action")) {
        setSummaryVisible(true);
        if (next.some((item) =>
          item.priority === "urgent" && item.eventType !== "order_reconciliation_urgent"
        )) setOpen(true);
      }
    } catch {
      setError(true);
    } finally {
      initialLoad.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDueNotifications().catch(() => undefined).finally(load);
    const channel = subscribeToNotifications(userId, load);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearInterval(timer);
      void channel.unsubscribe();
    };
  }, [load, userId]);

  const unreadCount = items.filter((item) => !item.readAt).length;
  const actionCount = items.filter((item) => item.category === "action").length;
  const urgentReconciliationItems = items.filter(
    (item) => item.eventType === "order_reconciliation_urgent" && item.priority === "urgent",
  );
  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "unread") return !item.readAt;
        if (filter === "action") return item.category === "action";
        if (filter === "urgent") return item.priority === "urgent";
        return true;
      }),
    [filter, items],
  );

  const openItem = async (item: BusinessNotification) => {
    const destination = notificationDestination(item);
    await markNotificationRead(item.id).catch(() => undefined);
    if (item.category === "information") {
      await resolveNotification(item.id).catch(() => undefined);
    }
    setOpen(false);
    await load();
    if (destination) navigate(destination);
  };

  const snooze = async (item: BusinessNotification, until: Date) => {
    await snoozeNotification(item.id, until);
    await load();
  };

  const acknowledgeUrgentReconciliation = async () => {
    await Promise.all(
      urgentReconciliationItems
        .filter((item) => !item.readAt)
        .map((item) => markNotificationRead(item.id)),
    );
    setUrgentPopupVisible(false);
    await load();
  };

  return (
    <div className="notification-center">
      <Button
        className="notification-button"
        variant="ghost"
        size="icon"
        aria-label={t("common.notifications")}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setSummaryVisible(false);
        }}
      >
        <Bell />
        {unreadCount > 0 ? (
          <span className="notification-count" aria-label={t("notificationCenter.unreadCount", { count: unreadCount })}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {urgentReconciliationItems.length > 0 ? (
        <button
          type="button"
          className="urgent-reconciliation-banner"
          onClick={() => setUrgentPopupVisible(true)}
        >
          <TriangleAlert aria-hidden="true" />
          <span>緊急漏單：{urgentReconciliationItems.length} 張訂單仍未解決</span>
          <ChevronRight aria-hidden="true" />
        </button>
      ) : null}

      {summaryVisible && actionCount > 0 && !open ? (
        <button
          type="button"
          className={cn(
            "notification-login-summary",
            items.some((item) => item.priority === "urgent") && "is-urgent",
          )}
          onClick={() => {
            setOpen(true);
            setSummaryVisible(false);
          }}
        >
          <Bell aria-hidden="true" />
          <span>{t("notificationCenter.loginSummary", { count: actionCount })}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      ) : null}

      {typeof document !== "undefined"
        ? createPortal(
            <SidePanel
              open={open}
              title={t("notificationCenter.title")}
              description={t("notificationCenter.pendingCount", { count: actionCount })}
              closeLabel={t("common.close")}
              onClose={() => setOpen(false)}
              className="notification-side-panel"
            >
              <div className="notification-panel-content">
                <nav className="notification-filters" aria-label={t("notificationCenter.filtersLabel")}>
            {(["all", "unread", "action", "urgent"] as Filter[]).map((value) => (
              <button
                type="button"
                className={filter === value ? "active" : undefined}
                key={value}
                onClick={() => setFilter(value)}
              >
                {t(`notificationCenter.filters.${value}`)}
              </button>
            ))}
                </nav>
                <div className="notification-list" aria-busy={loading}>
            {error ? <p className="notification-state is-error">{t("notificationCenter.loadError")}</p> : null}
            {!error && !loading && visible.length === 0 ? (
              <p className="notification-state"><CheckCheck />{t("notificationCenter.empty")}</p>
            ) : null}
            {visible.map((item) => (
              <article
                className={cn(
                  "notification-item",
                  `is-${item.priority}`,
                  !item.readAt && "is-unread",
                )}
                key={item.id}
              >
                <button type="button" className="notification-item-main" onClick={() => void openItem(item)}>
                  <span className="notification-priority-icon">
                    {item.priority === "urgent" ? <TriangleAlert /> : item.category === "action" ? <Clock3 /> : <Info />}
                  </span>
                  <span className="notification-item-copy">
                    <strong>{item.title}</strong>
                    {item.body ? <span>{item.body}</span> : null}
                    <small>{new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Hong_Kong" }).format(new Date(item.updatedAt))}</small>
                  </span>
                  <ChevronRight />
                </button>
                <footer>
                  {item.eventType !== "order_reconciliation_urgent" ? (
                    <button type="button" onClick={() => void snooze(item, new Date(Date.now() + 60 * 60 * 1000))}>
                      {t("notificationCenter.snoozeHour")}
                    </button>
                  ) : null}
                  {item.priority !== "urgent" ? (
                    <button type="button" onClick={() => void snooze(item, tomorrowAtNine())}>
                      {t("notificationCenter.snoozeTomorrow")}
                    </button>
                  ) : null}
                  {item.category === "information" ? (
                    <button type="button" onClick={() => void resolveNotification(item.id).then(load)}>
                      <Check />{t("notificationCenter.dismiss")}
                    </button>
                  ) : null}
                </footer>
              </article>
            ))}
                </div>
              </div>
            </SidePanel>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && urgentPopupVisible && urgentReconciliationItems.length > 0
        ? createPortal(
            <div className="urgent-reconciliation-backdrop" role="presentation">
              <section
                className="urgent-reconciliation-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="urgent-reconciliation-title"
              >
                <header>
                  <span className="urgent-reconciliation-icon"><TriangleAlert /></span>
                  <div>
                    <h2 id="urgent-reconciliation-title">緊急漏單預警</h2>
                    <p>以下訂單已進入出餐前6小時，請立即處理。</p>
                  </div>
                </header>
                <div className="urgent-reconciliation-list">
                  {urgentReconciliationItems.map((item) => (
                    <button type="button" key={item.id} onClick={() => void openItem(item)}>
                      <strong>{item.title}</strong>
                      {item.body ? <span>{item.body}</span> : null}
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <footer>
                  <Button type="button" variant="outline" onClick={() => void acknowledgeUrgentReconciliation()}>
                    我已知悉
                  </Button>
                  <Button type="button" onClick={() => void openItem(urgentReconciliationItems[0])}>
                    立即處理訂單
                  </Button>
                </footer>
                <small>此為FCCD內部通知，不會傳送給客戶。</small>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
