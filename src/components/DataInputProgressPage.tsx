import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CircleDollarSign, ClipboardCheck, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import { fetchDataInputProgressSummary, type DataInputProgressSummary } from "@/lib/data-input-progress";
import { fetchPayments, type PaymentListItem } from "@/lib/payments";

type InputStatus = "attention" | "upcoming" | "entered" | "recorded" | "missing" | "current" | "complete";
type ProgressRow = { year: string; month: string; period: string; count: number; requiredCount?: number; status: InputStatus; to: string };

type ProgressLoaders = {
  summary: () => Promise<DataInputProgressSummary[]>;
};

const BANK_SETTLEMENT_PANEL_PAGE_SIZE = 25;

function ProgressRowLink({ row, label, onOpen }: { row: ProgressRow; label: string; onOpen?: () => void }) {
  const percentage = row.requiredCount && row.requiredCount > 0
    ? Math.min(100, (row.count / row.requiredCount) * 100)
    : row.count > 0 ? 100 : 0;
  const content = <>
      <span className="data-input-progress-row-main">
        <strong>{row.period}</strong>
        <span className={`data-input-progress-bar${percentage > 0 ? " has-progress" : ""}`}>
          <i style={{ width: `${percentage}%` }} />
          <b>{row.requiredCount && row.requiredCount > 0 ? `${row.count} / ${row.requiredCount}` : row.count}</b>
        </span>
    </span>
    <strong className={`data-input-status ${row.status}`}><i aria-hidden="true" />{label}</strong>
  </>;
  if (onOpen) {
    return <button type="button" className={`data-input-progress-row ${row.status}`} onClick={onOpen}>{content}</button>;
  }
  return (
    <Link className={`data-input-progress-row ${row.status}`} to={row.to}>
      {content}
    </Link>
  );
}

function BankSettlementMonthPanel({ month, onClose }: { month: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / BANK_SETTLEMENT_PANEL_PAGE_SIZE));
  const visibleFrom = total ? (page - 1) * BANK_SETTLEMENT_PANEL_PAGE_SIZE + 1 : 0;
  const visibleTo = Math.min(page * BANK_SETTLEMENT_PANEL_PAGE_SIZE, total);
  const currency = useMemo(() => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD", maximumFractionDigits: 0 }), [i18n.language]);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "Asia/Hong_Kong" }), [i18n.language]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void fetchPayments({ page, search, month, pageSize: BANK_SETTLEMENT_PANEL_PAGE_SIZE })
      .then((result) => { if (active) { setItems(result.items); setTotal(result.total); } })
      .catch(() => { if (active) { setItems([]); setTotal(0); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, page, reloadKey, search]);

  return (
    <SidePanel
      open
      title={`${formatMonth(month)} ${t("payments.title")}`}
      description={t("payments.description")}
      onClose={onClose}
      closeLabel={t("common.close")}
      className="side-panel-majority"
      footer={<TablePagination
        summary={t("payments.pagination", { from: visibleFrom, to: visibleTo, total })}
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((value) => Math.max(1, value - 1))}
        onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        onPageChange={setPage}
        previousLabel={t("payments.previous")}
        nextLabel={t("payments.next")}
        pageLabel={t("payments.pageOf")}
        jumpLabel={t("payments.jumpToPage")}
      />}
    >
      <div className="data-input-payments-panel">
        <header className="data-input-payments-toolbar">
          <ListSearchBar
            id="data-input-payments-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => { setPage(1); setSearch(draftSearch.trim()); }}
            label={t("payments.search")}
            placeholder={t("payments.searchPlaceholder")}
            submitLabel={t("payments.searchAction")}
          />
        </header>
        {error ? <p className="data-input-payments-error">{t("payments.loadError")}</p> : <ListTable
          className="orders-table-wrap"
          loading={loading}
          loadingLabel={t("payments.loading")}
          skeletonRows={BANK_SETTLEMENT_PANEL_PAGE_SIZE}
          skeletonColumns={5}
          onRefresh={() => setReloadKey((value) => value + 1)}
          header={<tr><th>{t("payments.columns.date")}</th><th>{t("payments.columns.order")}</th><th>{t("payments.columns.amount")}</th><th>{t("payments.columns.payout")}</th><th>{t("payments.columns.reference")}</th></tr>}
        >
          {items.map((payment) => <tr key={payment.id}>
            <td>{payment.paymentAt ? date.format(new Date(payment.paymentAt)) : t("common.notSet")}</td>
            <td>{payment.orderNumber || t("common.notSet")}</td>
            <td><strong>{payment.currency === "HKD" ? currency.format(payment.amount) : `${payment.currency} ${payment.amount}`}</strong></td>
            <td>{payment.payoutAt ? date.format(new Date(payment.payoutAt)) : t("common.notSet")}</td>
            <td>{payment.reference || t("common.notSet")}</td>
          </tr>)}
          {!loading && items.length === 0 ? <tr><td colSpan={5} className="data-input-payments-empty">{t("payments.empty")}</td></tr> : null}
        </ListTable>}
      </div>
    </SidePanel>
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit",
});

function monthKey(value: Date) {
  return dateFormatter.format(value).slice(0, 7);
}

function dayKey(value: Date | string | null) {
  return value ? dateFormatter.format(new Date(value)) : null;
}

function currentMondayKey() {
  const current = new Date();
  const day = current.getUTCDay();
  current.setUTCDate(current.getUTCDate() - ((day + 6) % 7));
  return current.toISOString().slice(0, 10);
}

function monthPeriods(keys: Array<string | null>) {
  const current = monthKey(new Date());
  const oldest = [...new Set([current, ...keys.filter((key): key is string => Boolean(key))])].sort()[0] ?? current;
  const [year, month] = current.split("-").map(Number);
  const [oldestYear, oldestMonth] = oldest.split("-").map(Number);
  const result: string[] = [];
  for (let value = new Date(Date.UTC(year, month - 1, 1)); value >= new Date(Date.UTC(oldestYear, oldestMonth - 1, 1)); value.setUTCMonth(value.getUTCMonth() - 1)) {
    result.push(value.toISOString().slice(0, 7));
  }
  return result;
}

function mondayPeriods(keys: Array<string | null>) {
  const current = currentMondayKey();
  const oldest = [...new Set([current, ...keys.filter((key): key is string => Boolean(key))])].sort()[0] ?? current;
  const result: string[] = [];
  for (let value = new Date(`${current}T12:00:00Z`); value >= new Date(`${oldest}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - 7)) {
    result.push(value.toISOString().slice(0, 10));
  }
  return result;
}

function mondayForPeriod(period: string) {
  const date = new Date(`${period}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

function formatWeek(key: string) {
  const start = new Date(`${key}T12:00:00+08:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
}

function groupRowsByYear(rows: ProgressRow[]) {
  return rows.reduce<Array<{ year: string; rows: ProgressRow[] }>>((groups, row) => {
    const group = groups.at(-1);
    if (group?.year === row.year) group.rows.push(row);
    else groups.push({ year: row.year, rows: [row] });
    return groups;
  }, []);
}

function groupRowsByMonth(rows: ProgressRow[]) {
  return rows.reduce<Array<{ month: string; rows: ProgressRow[] }>>((groups, row) => {
    const group = groups.at(-1);
    if (group?.month === row.month) group.rows.push(row);
    else groups.push({ month: row.month, rows: [row] });
    return groups;
  }, []);
}

const defaultLoaders: ProgressLoaders = {
  summary: fetchDataInputProgressSummary,
};

export function DataInputProgressPage({ loaders = defaultLoaders }: { loaders?: ProgressLoaders }) {
  const { t } = useTranslation();
  const progressLabel = (row: ProgressRow) =>
    row.status === "complete"
      ? t("dataInputProgress.status.complete")
      : row.status === "entered" || row.status === "recorded"
        ? t("dataInputProgress.status.entered")
        : row.status === "current" || row.status === "attention"
          ? t("dataInputProgress.status.attention")
          : t("dataInputProgress.status.missing");
  const [data, setData] = useState<DataInputProgressSummary[]>([]);
  const [paymentMonth, setPaymentMonth] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loaders.summary().then((next) => {
        if (active) setData(next);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [loaders]);

  const sections = useMemo(() => {
    const summaries = new Map(data.map((row) => [`${row.source}:${row.periodStart}`, row]));
    const summary = (source: DataInputProgressSummary["source"], period: string) =>
      summaries.get(`${source}:${period}`);
    const monthlyCompletionStatus = (entered: number, required: number, period: string): InputStatus => {
      if (entered > 0) return required > 0 && entered >= required ? "complete" : "entered";
      return period === monthKey(new Date()) ? "current" : "missing";
    };
    const recurringStatus = (entered: number, period: string): InputStatus => {
      if (entered > 0) return "recorded";
      return period.slice(0, 7) === monthKey(new Date()) ? "current" : "missing";
    };
    const weeklyCompletionStatus = (entered: number, required: number, period: string): InputStatus => {
      if (entered > 0) return required > 0 && entered >= required ? "complete" : "entered";
      return period === currentMondayKey() ? "current" : "missing";
    };
    const weeklyRecurringStatus = (entered: number, period: string): InputStatus =>
      entered > 0 ? "recorded" : period === currentMondayKey() ? "current" : "missing";

    const months = monthPeriods(data.filter((row) => row.source === "monthly_costs").map((row) => row.periodStart.slice(0, 7)));
    const monthlyRows = months.map((period, index) => {
      const item = summary("monthly_costs", `${period}-01`);
      const count = item?.enteredCount ?? 0;
      return { year: period.slice(0, 4), month: period, period: formatMonth(period), count, requiredCount: item?.requiredCount, status: recurringStatus(count, period), to: `/finance/cost-input?tab=monthly-non-festival&month=${period}` } satisfies ProgressRow;
    });
    const paymentMonths = monthPeriods(data.filter((row) => row.source === "bank_settlements").map((row) => row.periodStart.slice(0, 7)));
    const paymentRows = paymentMonths.map((period) => {
      const item = summary("bank_settlements", `${period}-01`);
      const count = item?.enteredCount ?? 0;
      return { year: period.slice(0, 4), month: period, period: formatMonth(period), count, requiredCount: item?.requiredCount, status: monthlyCompletionStatus(count, item?.requiredCount ?? 0, period), to: `/orders/payments/bank-arrival-date?month=${period}` } satisfies ProgressRow;
    });
    const stocktakesByWeek = new Map<string, {
      enteredCount: number;
      requiredCount: number;
      stocktakeDate: string;
    }>();
    for (const item of data.filter((row) => row.source === "packing_stocktakes")) {
      const week = mondayForPeriod(item.periodStart);
      const existing = stocktakesByWeek.get(week);
      stocktakesByWeek.set(week, {
        enteredCount: (existing?.enteredCount ?? 0) + item.enteredCount,
        requiredCount: (existing?.requiredCount ?? 0) + item.requiredCount,
        // The report displays the Monday of the week, but the destination must
        // remain the actual day that has the saved stocktake sheet.
        stocktakeDate: existing?.stocktakeDate ?? item.periodStart,
      });
    }
    const stocktakeWeeks = mondayPeriods([...stocktakesByWeek.keys()]);
    const stocktakeRows = stocktakeWeeks.map((period) => {
      const item = stocktakesByWeek.get(period);
      const count = item?.enteredCount ?? 0;
      return { year: period.slice(0, 4), month: period.slice(0, 7), period, count, requiredCount: item?.requiredCount, status: weeklyCompletionStatus(count, item?.requiredCount ?? 0, period), to: `/kitchen/packing-stocktakes?date=${item?.stocktakeDate ?? period}` } satisfies ProgressRow;
    });
    const advertisingMondays = mondayPeriods(data.filter((row) => row.source === "weekly_advertising").map((row) => row.periodStart));
    const advertisingRows = advertisingMondays.map((period, index) => {
      const item = summary("weekly_advertising", period);
      const count = item?.enteredCount ?? 0;
      return { year: period.slice(0, 4), month: period.slice(0, 7), period: formatWeek(period), count, requiredCount: item?.requiredCount, status: weeklyRecurringStatus(count, period), to: `/finance/cost-input?tab=weekly-advertising&week=${period}` } satisfies ProgressRow;
    });
    return [
      { key: "monthlyCosts", icon: CircleDollarSign, rows: monthlyRows },
      { key: "bankPayments", icon: Landmark, rows: paymentRows },
      { key: "mondayStocktake", icon: ClipboardCheck, rows: stocktakeRows },
      { key: "weeklyAdvertising", icon: CalendarDays, rows: advertisingRows },
    ] as const;
  }, [data]);

  return (
    <section className="data-input-progress-page">
      <header className="page-heading data-input-progress-heading">
        <div><span className="eyebrow">{t("dataInputProgress.eyebrow")}</span><h1>{t("dataInputProgress.title")}</h1><p>{t("dataInputProgress.description")}</p></div>
        <div className="data-input-progress-legend" aria-label={t("dataInputProgress.statusLegend")}>
          {(["current", "missing", "entered", "complete"] as const).map((status) => <span key={status} className={`data-input-status ${status}`}><i aria-hidden="true" />{t(`dataInputProgress.status.${status}`)}</span>)}
        </div>
      </header>
      <div className="data-input-progress-grid">
        {sections.map(({ key, icon: Icon, rows }) => (
          <article className="data-input-progress-card panel" key={key}>
            <div className="data-input-progress-card-top"><span className="data-input-progress-icon"><Icon /></span><span>{t(`dataInputProgress.items.${key}.period`)}</span></div>
            <div className="data-input-progress-card-copy"><h2>{t(`dataInputProgress.items.${key}.title`)}</h2></div>
            <ul className="data-input-progress-rows" aria-label={t(`dataInputProgress.items.${key}.title`)}>
              {groupRowsByYear(rows).map((group) => <li className="data-input-progress-year" key={group.year}>
                <strong>{group.year}年</strong>
                {key === "mondayStocktake" || key === "weeklyAdvertising" ? groupRowsByMonth(group.rows).map((monthGroup) => <div className="data-input-progress-month" key={monthGroup.month}><strong>{formatMonth(monthGroup.month)}</strong><ul>{monthGroup.rows.map((row) => <li key={row.to}><ProgressRowLink row={row} label={progressLabel(row)} /></li>)}</ul></div>) : <ul>{group.rows.map((row) => <li key={row.to}><ProgressRowLink row={row} label={progressLabel(row)} onOpen={key === "bankPayments" ? () => setPaymentMonth(row.month) : undefined} /></li>)}</ul>}
              </li>)}
            </ul>
          </article>
        ))}
      </div>
      {paymentMonth ? <BankSettlementMonthPanel month={paymentMonth} onClose={() => setPaymentMonth(null)} /> : null}
    </section>
  );
}
