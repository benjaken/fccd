import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, HandCoins, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { TablePagination } from "@/components/ui/table-pagination";
import { fetchPayments, PAYMENTS_PAGE_SIZE, type PaymentListItem } from "@/lib/payments";

export function PaymentsListPage({
  canViewFinance,
  loadPayments = fetchPayments,
}: {
  canViewFinance: boolean;
  loadPayments?: typeof fetchPayments;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  const visibleFrom = total ? (page - 1) * PAYMENTS_PAGE_SIZE + 1 : 0;
  const visibleTo = Math.min(page * PAYMENTS_PAGE_SIZE, total);
  const currency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD", maximumFractionDigits: 0 }),
    [i18n.language],
  );
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "Asia/Hong_Kong" }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    if (!canViewFinance) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadPayments({ page, search });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError("payments_load_failed");
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, loadPayments, page, reloadKey, search]);

  useEffect(() => void load(), [load]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  };

  if (!canViewFinance) {
    return (
      <OperationalListState
        icon={HandCoins}
        title={t("payments.restricted")}
        description={t("payments.restrictedDescription")}
      />
    );
  }

  return (
    <section className="orders-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("payments.eyebrow")}</span>
          <h1>{t("payments.title")}</h1>
        </div>
      </header>
      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <form className="orders-search" onSubmit={submitSearch}>
            <Search />
            <label className="sr-only" htmlFor="payments-search">{t("payments.search")}</label>
            <input id="payments-search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder={t("payments.searchPlaceholder")} />
            <Button type="submit" variant="outline">{t("payments.searchAction")}</Button>
          </form>
        </header>
        {loading ? <OperationalListState icon={HandCoins} title={t("payments.loading")} loading /> :
        error ? <OperationalListState icon={HandCoins} title={t("payments.loadError")} description={t("payments.loadErrorDescription")} retryLabel={t("payments.retry")} onRetry={() => setReloadKey((key) => key + 1)} /> :
        !items.length ? <OperationalListState icon={HandCoins} title={t("payments.empty")} description={t("payments.emptyDescription")} /> :
        <div className="table-wrap orders-table-wrap">
          <table><thead><tr><th>{t("payments.columns.date")}</th><th>{t("payments.columns.order")}</th><th>{t("payments.columns.amount")}</th><th>{t("payments.columns.payout")}</th><th>{t("payments.columns.reference")}</th><th /></tr></thead>
            <tbody>{items.map((payment) => <tr key={payment.id}>
              <td>{payment.paymentAt ? date.format(new Date(payment.paymentAt)) : t("common.notSet")}</td>
              <td>{payment.orderId ? <Link className="order-link" to={`/orders/${payment.orderId}`}>{payment.orderNumber || t("common.notSet")}</Link> : (payment.orderNumber || t("common.notSet"))}</td>
              <td><strong>{payment.currency === "HKD" ? currency.format(payment.amount) : `${payment.currency} ${payment.amount}`}</strong></td>
              <td>{payment.payoutAt ? date.format(new Date(payment.payoutAt)) : t("common.notSet")}</td>
              <td>{payment.reference || t("common.notSet")}</td>
              <td>{payment.orderId && <Button variant="ghost" size="icon" asChild><Link to={`/orders/${payment.orderId}`} aria-label={`${t("payments.open")} ${payment.orderNumber || payment.id}`}><ChevronRight /></Link></Button>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <TablePagination summary={t("payments.pagination", { from: visibleFrom, to: visibleTo, total })} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => value + 1)} onPageChange={setPage} previousLabel={t("payments.previous")} nextLabel={t("payments.next")} pageLabel={t("payments.pageOf")} jumpLabel={t("payments.jumpToPage")} />
      </article>
    </section>
  );
}
