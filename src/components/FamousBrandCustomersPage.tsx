import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import {
  fetchFamousBrandCustomers,
  type FamousBrandCustomer,
} from "@/lib/famous-brand-customers";

export function FamousBrandCustomersPage({
  loadCustomers = fetchFamousBrandCustomers,
}: {
  loadCustomers?: () => Promise<FamousBrandCustomer[]>;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<FamousBrandCustomer[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const money = useMemo(() => new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "HKD",
  }), [i18n.language]);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: "Asia/Hong_Kong",
  }), [i18n.language]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const nextItems = [...await loadCustomers()].sort((a, b) =>
        b.quoteCount - a.quoteCount
          || b.latestDealAt.localeCompare(a.latestDealAt)
          || a.brandName.localeCompare(b.brandName, i18n.language),
      );
      setItems(nextItems);
      setSelectedKey((current) =>
        current && nextItems.some((item) => item.key === current)
          ? current
          : nextItems[0]?.key ?? null,
      );
    } catch {
      setItems([]);
      setSelectedKey(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [i18n.language, loadCustomers]);

  useEffect(() => { void load(); }, [load]);

  const selectedCustomer = useMemo(
    () => items.find((item) => item.key === selectedKey) ?? items[0] ?? null,
    [items, selectedKey],
  );

  return (
    <section className="quotes-page">
      <header className="page-heading quotes-heading">
        <div>
          <span className="eyebrow">{t("famousBrandCustomers.eyebrow")}</span>
          <h1>{t("famousBrandCustomers.title")}</h1>
        </div>
      </header>

      <article className="panel quotes-panel famous-brand-customers-panel">
        {error ? (
          <div className="quotes-state quotes-state-error" role="alert">
            <Award />
            <div>
              <strong>{t("famousBrandCustomers.loadError")}</strong>
              <span>{t("famousBrandCustomers.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw />{t("famousBrandCustomers.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="quotes-state quotes-state-empty">
            <Award />
            <div>
              <strong>{t("famousBrandCustomers.empty")}</strong>
              <span>{t("famousBrandCustomers.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="famous-brand-master-detail">
            <aside className="famous-brand-customer-list" aria-label={t("famousBrandCustomers.customerList")}>
              <div className="famous-brand-customer-list-header">
                <span>{t("famousBrandCustomers.columns.customer")}</span>
                <span>{t("famousBrandCustomers.columns.orderCount")}</span>
              </div>
              {loading ? (
                <div className="famous-brand-customer-list-skeleton" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
                </div>
              ) : (
                items.map((item) => (
                  <button
                    type="button"
                    className={item.key === selectedCustomer?.key ? "is-selected" : undefined}
                    aria-pressed={item.key === selectedCustomer?.key}
                    key={item.key}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <strong>{item.brandName}</strong>
                    <span>{item.quoteCount.toLocaleString(i18n.language)}</span>
                  </button>
                ))
              )}
            </aside>

            <section className="famous-brand-order-detail" aria-label={selectedCustomer?.brandName}>
              <div className="famous-brand-order-detail-heading">
                <strong>{selectedCustomer?.brandName ?? t("famousBrandCustomers.orders")}</strong>
                {selectedCustomer ? (
                  <span>{t("famousBrandCustomers.orderCount", { count: selectedCustomer.quoteCount })}</span>
                ) : null}
              </div>
              <ListTable
                className="quotes-table-wrap famous-brand-orders-table"
                loading={loading}
                loadingLabel={t("famousBrandCustomers.loading")}
                skeletonRows={8}
                skeletonColumns={4}
                onRefresh={load}
                header={<tr>
                  <th>{t("famousBrandCustomers.columns.orderNumber")}</th>
                  <th>{t("famousBrandCustomers.columns.status")}</th>
                  <th>{t("famousBrandCustomers.columns.amount")}</th>
                  <th>{t("famousBrandCustomers.columns.updatedAt")}</th>
                </tr>}
              >
                {(selectedCustomer?.orders ?? []).map((order) => <tr key={order.id}>
                  <td><DetailLink className="order-link" to={`/orders/${order.id}`}>{order.orderNumber || t("common.notSet")}</DetailLink></td>
                  <td>{order.status || t("common.notSet")}</td>
                  <td>{order.currency === "HKD" ? money.format(order.amount) : `${order.currency} ${order.amount.toLocaleString(i18n.language)}`}</td>
                  <td>{date.format(new Date(order.updatedAt))}</td>
                </tr>)}
              </ListTable>
            </section>
          </div>
        )}
      </article>
    </section>
  );
}
