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
      setItems(await loadCustomers());
    } catch {
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loadCustomers]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="quotes-page">
      <header className="page-heading quotes-heading">
        <div>
          <span className="eyebrow">{t("famousBrandCustomers.eyebrow")}</span>
          <h1>{t("famousBrandCustomers.title")}</h1>
        </div>
      </header>

      <article className="panel quotes-panel responsive-card-list-panel">
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
          <ListTable
            className="quotes-table-wrap"
            loading={loading}
            loadingLabel={t("famousBrandCustomers.loading")}
            skeletonRows={8}
            skeletonColumns={6}
            onRefresh={load}
            header={<tr>
              <th>{t("famousBrandCustomers.columns.brand")}</th>
              <th>{t("famousBrandCustomers.columns.openQuotes")}</th>
              <th>{t("famousBrandCustomers.columns.doneDeals")}</th>
              <th>{t("famousBrandCustomers.columns.total")}</th>
              <th>{t("famousBrandCustomers.columns.latestDeal")}</th>
              <th>{t("famousBrandCustomers.columns.latestQuote")}</th>
            </tr>}
          >
            {items.map((item) => <tr key={item.key}>
              <td><strong>{item.brandName}</strong></td>
              <td>{item.openQuoteCount.toLocaleString(i18n.language)}</td>
              <td>{item.doneDealCount.toLocaleString(i18n.language)}</td>
              <td>{item.currency === "HKD" ? money.format(item.totalAmount) : `${item.currency} ${item.totalAmount.toLocaleString(i18n.language)}`}</td>
              <td>{date.format(new Date(item.latestDealAt))}</td>
              <td><DetailLink className="order-link" to={`/quotes/${item.latestQuoteId}`}>{item.latestQuoteNumber || t("common.notSet")}</DetailLink></td>
            </tr>)}
          </ListTable>
        )}
      </article>
    </section>
  );
}
