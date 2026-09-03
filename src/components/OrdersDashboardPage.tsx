import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Factory,
  Inbox,
  MessageSquareQuote,
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
  todayFollowUpQuotes: 0,
  latestPendingOrders: [],
  latestUnpaidOrders: [],
  latestPendingQuotes: [],
  soonestUpcomingQuotes: [],
  todayFollowUpQuoteItems: [],
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
      key: "todayFollowUpQuotes",
      label: t("ordersDashboard.todayFollowUpQuotes"),
      count: data.todayFollowUpQuotes,
      tone: "amber",
      icon: CalendarClock,
      to: "/follow-up#today-quotes",
    },
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

  if (loading) {
    return <PageSkeleton label={t("ordersDashboard.loading")} variant="dashboard" />;
  }

  return (
    <section className="orders-dashboard-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("followUp.eyebrow")}</span>
          <h1>{t("followUp.title")}</h1>
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

      <section className="orders-dashboard-queue-grid">
        <QueuePanel
          id="today-quotes"
          icon={CalendarClock}
          title={t("ordersDashboard.todayFollowUpTitle")}
          description={t("ordersDashboard.todayFollowUpDescription")}
          actionTo="/quotes"
          items={data.todayFollowUpQuoteItems}
          dateFormatter={dateFormatter}
          dateField="followUpDate"
          emptyLabel={t("ordersDashboard.emptyTodayFollowUpQuotes")}
        />
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
    </section>
  );
}

function QueuePanel({
  id,
  icon: PanelIcon,
  title,
  description,
  actionTo,
  items,
  dateFormatter,
  emptyLabel,
  showOutstanding = false,
  dateField = "deliveryAt",
}: {
  id?: string;
  icon: Icon;
  title: string;
  description: string;
  actionTo: string;
  items: DashboardQueueItem[];
  dateFormatter: Intl.DateTimeFormat;
  emptyLabel: string;
  showOutstanding?: boolean;
  dateField?: "deliveryAt" | "followUpDate";
}) {
  const { t, i18n } = useTranslation();

  return (
    <article className="panel queue-panel" id={id}>
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
            const detailTo =
              item.kind === "order"
                ? `/orders/${item.id}`
                : item.kind === "enquiry"
                  ? `/quotes/pending/${item.id}`
                  : `/quotes/${item.id}`;
            const dateValue = item[dateField];
            const amount = showOutstanding && item.outstanding !== null
              ? new Intl.NumberFormat(i18n.language, { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(item.outstanding)
              : null;
            return (
              <li key={item.id}>
                <DetailLink
                  to={detailTo}
                  target={item.kind === "order" ? "_blank" : undefined}
                  rel={item.kind === "order" ? "noopener noreferrer" : undefined}
                >
                  <span className="orders-dashboard-quote-main">
                    <strong>{item.orderNumber || item.customerName || t("common.notSet")}</strong>
                    <small>{item.customerName && item.orderNumber ? item.customerName : item.companyName || t("common.notSet")}</small>
                  </span>
                  {amount ? (
                    <span className="orders-dashboard-amount">{amount}</span>
                  ) : dateValue ? (
                    <span className="orders-dashboard-quote-date"><CalendarClock />{dateFormatter.format(new Date(dateValue.length === 10 ? `${dateValue}T00:00:00+08:00` : dateValue))}</span>
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
