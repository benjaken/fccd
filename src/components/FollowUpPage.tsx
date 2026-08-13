import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ClipboardCheck, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { OperationalListState } from "@/components/ui/operational-list-state";
import { fetchDashboardData, type DashboardData } from "@/lib/dashboard";
import { usePageAccess } from "@/auth/use-page-access";

const emptyData: DashboardData = {
  metrics: { ordersToday: 0, ordersChange: null, revenueToday: null, revenueChange: null, pendingDeliveries: 0, lowStock: null },
  queues: { highChanceQuotes: 0, largeQuotes: 0, unpaidOrders: 0, unassignedDrivers: 0, deliveredUnpaid: 0 },
  progress: { confirmed: 0, preparing: 0, ready: 0, shipping: 0, completed: 0 },
  jobs: [],
};

export function FollowUpPage({ role }: { role: string | null }) {
  const { t } = useTranslation();
  const access = usePageAccess(role);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await fetchDashboardData(new Date(), role));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [reloadKey, role]);

  useEffect(() => void load(), [load]);

  const queues = [
    access.canAccess("quotes") && { label: t("dashboard.highChanceQuotes"), count: data.queues.highChanceQuotes, to: "/quotes/high-chance", tone: "red" },
    access.canAccess("quotes") && { label: t("dashboard.largeQuotes"), count: data.queues.largeQuotes, to: "/quotes/large", tone: "amber" },
    { label: t("followUp.pendingOrders"), count: data.progress.confirmed, to: "/orders/pending", tone: "blue" },
    access.canAccess("finance") && { label: t("dashboard.unpaidOrders"), count: data.queues.unpaidOrders, to: "/orders/unpaid", tone: "blue" },
    { label: t("dashboard.unassignedDrivers"), count: data.queues.unassignedDrivers, to: "/delivery/unassigned", tone: "purple" },
    access.canAccess("finance") && { label: t("dashboard.deliveredUnpaid"), count: data.queues.deliveredUnpaid, to: "/orders/delivered-unpaid", tone: "green" },
    access.canAccess("inventory") && data.metrics.lowStock !== null && { label: t("followUp.lowStock"), count: data.metrics.lowStock, to: "/inventory/low-stock", tone: "amber" },
  ].filter(Boolean) as { label: string; count: number; to: string; tone: string }[];

  if (loading) {
    return <OperationalListState icon={ClipboardCheck} title={t("followUp.loading")} loading />;
  }
  if (error) {
    return <OperationalListState icon={ClipboardCheck} title={t("followUp.loadError")} description={t("followUp.loadErrorDescription")} retryLabel={t("followUp.retry")} onRetry={() => setReloadKey((key) => key + 1)} />;
  }

  return (
    <section className="follow-up-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("followUp.eyebrow")}</span>
          <h1>{t("followUp.title")}</h1>
        </div>
      </header>
      <article className="panel follow-up-panel">
        <div className="queue-list">
          {queues.map((item) => (
            <Link key={item.label} to={item.to} className="queue-item">
              <span className={`queue-dot ${item.tone}`} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
              <ChevronRight />
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
