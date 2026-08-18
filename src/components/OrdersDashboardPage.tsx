import { useEffect, useState, type ComponentType } from "react";
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
  type DashboardQuoteItem,
  type OrdersDashboardData,
} from "@/lib/orders-dashboard";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

type OrdersDashboardLoader = () => Promise<OrdersDashboardData>;

const EMPTY_DASHBOARD: OrdersDashboardData = {
  shopifyPending: 0,
  unpaid: 0,
  notSentToFactory: 0,
  pendingQuotes: 0,
  upcomingQuotes: 0,
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

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: "Asia/Hong_Kong",
  });

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
    tone: "red" | "blue" | "green" | "amber";
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
      key: "notSentToFactory",
      label: t("ordersDashboard.notSentToFactory"),
      count: data.notSentToFactory,
      tone: "amber",
      icon: Factory,
      to: "/orders/not-sent-factory",
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
  ];

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

      <section className="orders-dashboard-grid">
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

      <section className="dashboard-grid">
        <QuotePanel
          icon={Inbox}
          title={t("ordersDashboard.latestPendingTitle")}
          description={t("ordersDashboard.latestPendingDescription")}
          action={t("ordersDashboard.viewAll")}
          actionTo="/quotes/pending"
          quotes={data.latestPendingQuotes}
          dateFormatter={dateFormatter}
          emptyLabel={t("ordersDashboard.emptyPendingQuotes")}
        />
        <QuotePanel
          icon={CalendarClock}
          title={t("ordersDashboard.soonestUpcomingTitle")}
          description={t("ordersDashboard.soonestUpcomingDescription")}
          action={t("ordersDashboard.viewAll")}
          actionTo="/quotes/upcoming"
          quotes={data.soonestUpcomingQuotes}
          dateFormatter={dateFormatter}
          emptyLabel={t("ordersDashboard.emptyUpcomingQuotes")}
        />
      </section>
    </section>
  );
}

function QuotePanel({
  icon: PanelIcon,
  title,
  description,
  action,
  actionTo,
  quotes,
  dateFormatter,
  emptyLabel,
}: {
  icon: Icon;
  title: string;
  description: string;
  action: string;
  actionTo: string;
  quotes: DashboardQuoteItem[];
  dateFormatter: Intl.DateTimeFormat;
  emptyLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <article className="panel queue-panel">
      <header className="panel-header">
        <div>
          <h2>
            <PanelIcon className="orders-dashboard-panel-icon" />
            {title}
          </h2>
          <p>{description}</p>
        </div>
        <Button variant="ghost" asChild>
          <Link to={actionTo}>
            {action}
            <ChevronRight />
          </Link>
        </Button>
      </header>
      {quotes.length === 0 ? (
        <div className="orders-dashboard-empty">
          <MessageSquareQuote />
          <span>{emptyLabel}</span>
        </div>
      ) : (
        <ul className="orders-dashboard-quote-list">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <DetailLink to={`/quotes/${quote.id}`}>
                <span className="orders-dashboard-quote-main">
                  <strong>
                    {quote.orderNumber || quote.customerName || t("common.notSet")}
                  </strong>
                  <small>
                    {quote.customerName && quote.orderNumber
                      ? quote.customerName
                      : quote.companyName || t("common.notSet")}
                  </small>
                </span>
                {quote.deliveryAt && (
                  <span className="orders-dashboard-quote-date">
                    <CalendarClock />
                    {dateFormatter.format(new Date(quote.deliveryAt))}
                  </span>
                )}
                <ChevronRight />
              </DetailLink>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
