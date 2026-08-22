import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Factory,
  Inbox,
  MessageSquareQuote,
  PieChart,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  fetchOrdersDashboardData,
  type DashboardQueueItem,
  type OrdersDashboardData,
} from "@/lib/orders-dashboard";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;
type OrdersDashboardLoader = () => Promise<OrdersDashboardData>;
type Tone = "red" | "blue" | "green" | "amber";

const EMPTY_DASHBOARD: OrdersDashboardData = {
  shopifyPending: 0,
  unpaid: 0,
  notSentToFactory: 0,
  pendingQuotes: 0,
  upcomingQuotes: 0,
  latestPendingOrders: [],
  latestUnpaidOrders: [],
  latestPendingQuotes: [],
  soonestUpcomingQuotes: [],
};

export function OrdersDashboardPage({
  loadDashboard = fetchOrdersDashboardData,
}: {
  loadDashboard?: OrdersDashboardLoader;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<OrdersDashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadDashboard()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const code =
          typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
            ? loadError.code
            : "orders_dashboard_load_failed";
        setError(code);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadDashboard, reloadKey]);

  const cards: Array<{
    key: string;
    label: string;
    count: number;
    tone: Tone;
    icon: Icon;
    to: string;
  }> = [
    {
      key: "shopifyPending",
      label: t("ordersDashboard.shopifyPending"),
      count: data.shopifyPending,
      tone: "blue",
      icon: ShoppingBag,
      to: "/orders/shopify-pending",
    },
    {
      key: "unpaid",
      label: t("ordersDashboard.unpaid"),
      count: data.unpaid,
      tone: "red",
      icon: CircleDollarSign,
      to: "/orders/unpaid",
    },
    {
      key: "pendingQuotes",
      label: t("ordersDashboard.pendingQuotes"),
      count: data.pendingQuotes,
      tone: "green",
      icon: Inbox,
      to: "/quotes/pending",
    },
    {
      key: "upcomingQuotes",
      label: t("ordersDashboard.upcomingQuotes"),
      count: data.upcomingQuotes,
      tone: "amber",
      icon: CalendarClock,
      to: "/quotes/upcoming",
    },
    {
      key: "notSentToFactory",
      label: t("ordersDashboard.notSentToFactory"),
      count: data.notSentToFactory,
      tone: "amber",
      icon: Factory,
      to: "/orders/not-sent-factory",
    },
  ];

  const primaryQueues = cards.slice(0, 4);

  if (loading) {
    return <PageSkeleton label={t("ordersDashboard.loading")} variant="dashboard" />;
  }

  return (
    <section className="orders-dashboard-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("orders.eyebrow")}</span>
          <h1>{t("ordersDashboard.title")}</h1>
          <p>{t("ordersDashboard.description")}</p>
        </div>
      </header>

      {error && (
        <div className="dashboard-state dashboard-state-error" role="alert">
          <div>
            <strong>{t("ordersDashboard.loadError")}</strong>
            <span>{t("ordersDashboard.loadErrorDescription")}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw />
            {t("ordersDashboard.retry")}
          </Button>
        </div>
      )}

      <section className="orders-dashboard-grid" aria-label={t("ordersDashboard.queueSummary")}>
        {cards.map(({ key, label, count, tone, icon: CardIcon, to }) => (
          <Link className="metric-card" to={to} key={key}>
            <div className={cn("metric-icon", tone)}>
              <CardIcon />
            </div>
            <div>
              <p>{label}</p>
              <strong>{count.toLocaleString(i18n.language)}</strong>
              <small>{t("ordersDashboard.openTable")}</small>
            </div>
            <ChevronRight className="metric-chevron" />
          </Link>
        ))}
      </section>

      <section className="orders-dashboard-body-layout">
        <section className="orders-dashboard-queue-grid">
          <QueuePanel
            icon={ShoppingBag}
            title={t("ordersDashboard.latestPendingOrdersTitle")}
            description={t("ordersDashboard.latestPendingOrdersDescription")}
            actionTo="/orders/shopify-pending"
            items={data.latestPendingOrders}
            dateFormatter={dateFormatter}
            emptyLabel={t("ordersDashboard.emptyPendingOrders")}
          />
          <QueuePanel
            icon={CircleDollarSign}
            title={t("ordersDashboard.latestUnpaidTitle")}
            description={t("ordersDashboard.latestUnpaidDescription")}
            actionTo="/orders/unpaid"
            items={data.latestUnpaidOrders}
            dateFormatter={dateFormatter}
            emptyLabel={t("ordersDashboard.emptyUnpaidOrders")}
            showOutstanding
          />
          <QueuePanel
            icon={Inbox}
            title={t("ordersDashboard.latestPendingTitle")}
            description={t("ordersDashboard.latestPendingDescription")}
            actionTo="/quotes/pending"
            items={data.latestPendingQuotes}
            dateFormatter={dateFormatter}
            emptyLabel={t("ordersDashboard.emptyPendingQuotes")}
          />
          <QueuePanel
            icon={CalendarClock}
            title={t("ordersDashboard.soonestUpcomingTitle")}
            description={t("ordersDashboard.soonestUpcomingDescription")}
            actionTo="/quotes/upcoming"
            items={data.soonestUpcomingQuotes}
            dateFormatter={dateFormatter}
            emptyLabel={t("ordersDashboard.emptyUpcomingQuotes")}
          />
        </section>
        <aside className="orders-dashboard-chart-column">
          <DashboardCharts queues={primaryQueues} locale={i18n.language} />
        </aside>
      </section>
    </section>
  );
}

function DashboardCharts({
  queues,
  locale,
}: {
  queues: Array<{ key: string; label: string; count: number; tone: Tone; to: string }>;
  locale: string;
}) {
  const { t } = useTranslation();
  const max = Math.max(...queues.map((queue) => queue.count), 1);
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);
  let cursor = 0;
  const colors: Record<Tone, string> = {
    blue: "#4f7ee8",
    red: "#e05f65",
    green: "#35a46f",
    amber: "#d6952f",
  };
  const gradient = total
    ? `conic-gradient(${queues
        .map((queue) => {
          const start = (cursor / total) * 100;
          cursor += queue.count;
          const end = (cursor / total) * 100;
          return `${colors[queue.tone]} ${start}% ${end}%`;
        })
        .join(",")})`
    : "var(--secondary)";

  return (
    <section className="orders-dashboard-charts">
      <article className="panel dashboard-chart-panel">
        <header className="panel-header">
          <div>
            <h2><BarChart3 className="orders-dashboard-panel-icon" />{t("ordersDashboard.queueChartTitle")}</h2>
            <p>{t("ordersDashboard.queueChartDescription")}</p>
          </div>
        </header>
        <div className="orders-dashboard-bars">
          {queues.map((queue) => (
            <Link to={queue.to} className="orders-dashboard-bar-row" key={queue.key}>
              <span>{queue.label}</span>
              <div className="orders-dashboard-bar-track">
                <i className={`tone-${queue.tone}`} style={{ width: `${(queue.count / max) * 100}%` }} />
              </div>
              <strong>{queue.count.toLocaleString(locale)}</strong>
            </Link>
          ))}
        </div>
      </article>

      <article className="panel dashboard-chart-panel dashboard-share-panel">
        <header className="panel-header">
          <div>
            <h2><PieChart className="orders-dashboard-panel-icon" />{t("ordersDashboard.shareChartTitle")}</h2>
            <p>{t("ordersDashboard.shareChartDescription")}</p>
          </div>
        </header>
        <div className="orders-dashboard-share">
          <div className="orders-dashboard-donut" style={{ background: gradient }} role="img" aria-label={t("ordersDashboard.shareChartAria", { count: total })}>
            <span><strong>{total.toLocaleString(locale)}</strong><small>{t("ordersDashboard.totalActions")}</small></span>
          </div>
          <ul>
            {queues.map((queue) => (
              <li key={queue.key}>
                <i className={`tone-${queue.tone}`} />
                <span>{queue.label}</span>
                <strong>{total ? Math.round((queue.count / total) * 100) : 0}%</strong>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </section>
  );
}

function QueuePanel({
  icon: PanelIcon,
  title,
  description,
  actionTo,
  items,
  dateFormatter,
  emptyLabel,
  showOutstanding = false,
}: {
  icon: Icon;
  title: string;
  description: string;
  actionTo: string;
  items: DashboardQueueItem[];
  dateFormatter: Intl.DateTimeFormat;
  emptyLabel: string;
  showOutstanding?: boolean;
}) {
  const { t, i18n } = useTranslation();

  return (
    <article className="panel queue-panel">
      <header className="panel-header">
        <div>
          <h2><PanelIcon className="orders-dashboard-panel-icon" />{title}</h2>
          <p>{description}</p>
        </div>
        <Button variant="ghost" asChild>
          <Link to={actionTo}>{t("ordersDashboard.viewAll")}<ChevronRight /></Link>
        </Button>
      </header>
      {items.length === 0 ? (
        <div className="orders-dashboard-empty">
          <MessageSquareQuote />
          <span>{emptyLabel}</span>
        </div>
      ) : (
        <ul className="orders-dashboard-quote-list">
          {items.map((item) => {
            const detailTo = item.kind === "order" ? `/orders/${item.id}` : `/quotes/${item.id}`;
            const amount = showOutstanding && item.outstanding !== null
              ? new Intl.NumberFormat(i18n.language, { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(item.outstanding)
              : null;
            return (
              <li key={item.id}>
                <DetailLink to={detailTo}>
                  <span className="orders-dashboard-quote-main">
                    <strong>{item.orderNumber || item.customerName || t("common.notSet")}</strong>
                    <small>{item.customerName && item.orderNumber ? item.customerName : item.companyName || t("common.notSet")}</small>
                  </span>
                  {amount ? (
                    <span className="orders-dashboard-amount">{amount}</span>
                  ) : item.deliveryAt ? (
                    <span className="orders-dashboard-quote-date"><CalendarClock />{dateFormatter.format(new Date(item.deliveryAt))}</span>
                  ) : null}
                  <ChevronRight />
                </DetailLink>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
