import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw, ShoppingBag, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  fetchHomeSalesDashboard,
  type HomeSalesComparisonRow,
  type HomeSalesDashboardData,
  type HomeSalesPeriod,
  type HomeSalesPeriodKey,
} from "@/lib/home-sales-dashboard";

export type HomeSalesDashboardLoader = (
  role?: string | null,
) => Promise<HomeSalesDashboardData>;

const defaultLoader: HomeSalesDashboardLoader = () =>
  fetchHomeSalesDashboard(new Date());

function percentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function changeClassName(value: number | null) {
  if (value === null || value === 0) return undefined;
  return value > 0 ? "change-positive" : "change-negative";
}

function totalRowFor(rows: HomeSalesComparisonRow[], name: string): HomeSalesComparisonRow {
  const keys: HomeSalesPeriodKey[] = [
    "previousYearPreviousMonth",
    "previousYearCurrentMonth",
    "previousMonth",
    "currentMonth",
  ];
  return {
    id: "__total__",
    name,
    values: Object.fromEntries(
      keys.map((key) => [key, rows.reduce((sum, row) => sum + row.values[key], 0)]),
    ) as Record<HomeSalesPeriodKey, number>,
  };
}

export function HomeSalesDashboardPage({
  loadDashboard = defaultLoader,
  role,
}: {
  loadDashboard?: HomeSalesDashboardLoader;
  role?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<HomeSalesDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [cateringChannelFilter, setCateringChannelFilter] = useState("");
  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void loadDashboard(role)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadDashboard, reloadKey, role]);

  if (loading && !data) {
    return <PageSkeleton label={t("dashboard.loading")} variant="sales-dashboard" />;
  }

  const periods = data?.periods ?? [];
  const periodByKey = Object.fromEntries(
    periods.map((period) => [period.key, period]),
  ) as Partial<Record<HomeSalesPeriodKey, HomeSalesPeriod>>;
  const periodLabel = (key: HomeSalesPeriodKey) => {
    const period = periodByKey[key];
    if (!period) return "—";
    return new Intl.DateTimeFormat(i18n.language, {
      year: "numeric",
      month: "short",
    }).format(new Date(period.year, period.month - 1, 1));
  };
  const formatChange = (value: number | null) =>
    value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  const cateringChannels = data?.cateringChannels ?? [];
  const visibleCateringChannels = cateringChannelFilter
    ? cateringChannels.filter((row) => row.id === cateringChannelFilter)
    : cateringChannels;
  const tkoChannels = data?.tkoChannels ?? [];

  return (
    <section className="home-sales-dashboard">
      <header className="page-heading home-sales-heading">
        <div>
          <span className="eyebrow">{t("dashboard.eyebrow")}</span>
          <h1>{t("dashboard.salesTitle")}</h1>
          <p>
            {t("dashboard.salesDescription", { date: data?.asOfDate ?? "—" })}
          </p>
        </div>
      </header>

      {error ? (
        <div className="dashboard-state dashboard-state-error" role="alert">
          <div>
            <strong>{t("dashboard.loadError")}</strong>
            <span>{t("dashboard.loadErrorDescription")}</span>
          </div>
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw />
            {t("dashboard.retry")}
          </Button>
        </div>
      ) : null}

      <article className="panel home-sales-panel">
        <SalesPanelHeader
          icon={ShoppingBag}
          title={t("dashboard.brandComparisonTitle")}
          description={t("dashboard.brandComparisonDescription")}
          actionLabel={t("dashboard.viewBrandReport")}
          actionTo="/reports/kitchen/channel-sales"
          controls={
            <label className="home-sales-brand-filter">
              <span>{t("dashboard.brand")}</span>
              <FilterableSelect
                aria-label={t("dashboard.filterBrand")}
                value={cateringChannelFilter}
                onChange={(event) => setCateringChannelFilter(event.target.value)}
              >
                <option value="">{t("dashboard.allBrands")}</option>
                {cateringChannels.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </FilterableSelect>
            </label>
          }
        />
        <CateringComparisonTable
          rows={visibleCateringChannels}
          money={money}
          periodLabel={periodLabel}
          formatChange={formatChange}
          emptyLabel={t("dashboard.noBrandSales")}
          t={t}
        />
      </article>

      <article className="panel home-sales-panel">
        <SalesPanelHeader
          icon={Store}
          title={t("dashboard.storeComparisonTitle")}
          description={t("dashboard.storeComparisonDescription")}
          actionLabel={t("dashboard.viewStoreReport")}
          actionTo="/reports/shops"
        />
        <TkoComparisonTable
          rows={tkoChannels}
          money={money}
          periodLabel={periodLabel}
          formatChange={formatChange}
          emptyLabel={t("dashboard.noStoreSales")}
          t={t}
        />
      </article>
    </section>
  );
}

function SalesPanelHeader({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  controls,
}: {
  icon: typeof ShoppingBag;
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
  controls?: ReactNode;
}) {
  return (
    <header className="panel-header home-sales-panel-header">
      <div className="home-sales-panel-heading">
        <h2><Icon aria-hidden="true" />{title}</h2>
        <p>{description}</p>
      </div>
      <div className="home-sales-panel-actions">
        {controls}
        <Link className="home-sales-report-link" to={actionTo}>{actionLabel}</Link>
      </div>
    </header>
  );
}

function CateringComparisonTable({
  rows,
  money,
  periodLabel,
  formatChange,
  emptyLabel,
  t,
}: {
  rows: HomeSalesComparisonRow[];
  money: Intl.NumberFormat;
  periodLabel: (key: HomeSalesPeriodKey) => string;
  formatChange: (value: number | null) => string;
  emptyLabel: string;
  t: (key: string) => string;
}) {
  const displayRows = rows.length
    ? [...rows, totalRowFor(rows, t("dashboard.total"))]
    : rows;
  return (
    <>
      <div className="table-wrap home-sales-table-wrap">
        <table className="home-sales-table">
          <thead>
            <tr>
              <th rowSpan={2}>{t("dashboard.channel")}</th>
              <th colSpan={4}>{t("dashboard.previousMonthYearComparison")}</th>
              <th className="home-sales-period-divider" colSpan={4}>{t("dashboard.currentMonthYearComparison")}</th>
            </tr>
            <tr>
              <th>{periodLabel("previousYearPreviousMonth")}</th>
              <th>{periodLabel("previousMonth")}</th>
              <th>{t("dashboard.difference")}</th>
              <th>{t("dashboard.yoy")}</th>
              <th className="home-sales-period-divider">{periodLabel("previousYearCurrentMonth")}</th>
              <th className="is-current-month">{periodLabel("currentMonth")} · {t("dashboard.accumulating")}</th>
              <th>{t("dashboard.difference")}</th>
              <th>{t("dashboard.yoy")}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const previousMonthChange = percentageChange(
                row.values.previousMonth,
                row.values.previousYearPreviousMonth,
              );
              const currentMonthChange = percentageChange(
                row.values.currentMonth,
                row.values.previousYearCurrentMonth,
              );
              const previousMonthDifference = row.values.previousMonth - row.values.previousYearPreviousMonth;
              const currentMonthDifference = row.values.currentMonth - row.values.previousYearCurrentMonth;
              return (
                <tr key={row.id} className={row.id === "__total__" ? "home-sales-total-row" : undefined}>
                  <th scope="row">{row.name}</th>
                  <MoneyCell value={row.values.previousYearPreviousMonth} money={money} />
                  <MoneyCell value={row.values.previousMonth} money={money} />
                  <td className={changeClassName(previousMonthDifference)}>
                    {previousMonthDifference > 0 ? "+" : ""}{money.format(previousMonthDifference)}
                  </td>
                  <td className={changeClassName(previousMonthChange)}>
                    {formatChange(previousMonthChange)}
                  </td>
                  <MoneyCell value={row.values.previousYearCurrentMonth} money={money} divider />
                  <MoneyCell value={row.values.currentMonth} money={money} current />
                  <td className={changeClassName(currentMonthDifference)}>
                    {currentMonthDifference > 0 ? "+" : ""}{money.format(currentMonthDifference)}
                  </td>
                  <td className={changeClassName(currentMonthChange)}>
                    {formatChange(currentMonthChange)}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td className="dashboard-empty-row" colSpan={9}>{emptyLabel}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="home-sales-card-list">
        {displayRows.map((row) => (
          <ChannelComparisonCard
            key={row.id}
            name={row.name}
            isTotal={row.id === "__total__"}
            money={money}
            formatChange={formatChange}
            t={t}
            blocks={[
              {
                title: t("dashboard.previousMonthYearComparison"),
                previousLabel: periodLabel("previousYearPreviousMonth"),
                currentLabel: periodLabel("previousMonth"),
                previous: row.values.previousYearPreviousMonth,
                current: row.values.previousMonth,
                changeLabel: t("dashboard.yoy"),
              },
              {
                title: t("dashboard.currentMonthYearComparison"),
                previousLabel: periodLabel("previousYearCurrentMonth"),
                currentLabel: `${periodLabel("currentMonth")} · ${t("dashboard.accumulating")}`,
                previous: row.values.previousYearCurrentMonth,
                current: row.values.currentMonth,
                changeLabel: t("dashboard.yoy"),
              },
            ]}
          />
        ))}
        {!rows.length ? <p className="home-sales-card-empty">{emptyLabel}</p> : null}
      </div>
    </>
  );
}

function TkoComparisonTable({
  rows,
  money,
  periodLabel,
  formatChange,
  emptyLabel,
  t,
}: {
  rows: HomeSalesComparisonRow[];
  money: Intl.NumberFormat;
  periodLabel: (key: HomeSalesPeriodKey) => string;
  formatChange: (value: number | null) => string;
  emptyLabel: string;
  t: (key: string) => string;
}) {
  const displayRows = rows.length
    ? [...rows, totalRowFor(rows, t("dashboard.total"))]
    : rows;
  return (
    <>
      <div className="table-wrap home-sales-table-wrap">
        <table className="home-sales-table home-sales-tko-table">
          <thead>
            <tr>
              <th>{t("dashboard.channel")}</th>
              <th>{periodLabel("previousMonth")}</th>
              <th className="is-current-month home-sales-period-divider">{periodLabel("currentMonth")} · {t("dashboard.accumulating")}</th>
              <th>{t("dashboard.difference")}</th>
              <th>{t("dashboard.mom")}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const difference = row.values.currentMonth - row.values.previousMonth;
              const change = percentageChange(row.values.currentMonth, row.values.previousMonth);
              return (
                <tr key={row.id} className={row.id === "__total__" ? "home-sales-total-row" : undefined}>
                  <th scope="row">{row.name}</th>
                  <MoneyCell value={row.values.previousMonth} money={money} />
                  <MoneyCell value={row.values.currentMonth} money={money} current divider />
                  <td className={changeClassName(difference)}>
                    {difference > 0 ? "+" : ""}{money.format(difference)}
                  </td>
                  <td className={changeClassName(change)}>
                    {formatChange(change)}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td className="dashboard-empty-row" colSpan={5}>{emptyLabel}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="home-sales-card-list">
        {displayRows.map((row) => (
          <ChannelComparisonCard
            key={row.id}
            name={row.name}
            isTotal={row.id === "__total__"}
            money={money}
            formatChange={formatChange}
            t={t}
            blocks={[
              {
                title: "",
                previousLabel: periodLabel("previousMonth"),
                currentLabel: `${periodLabel("currentMonth")} · ${t("dashboard.accumulating")}`,
                previous: row.values.previousMonth,
                current: row.values.currentMonth,
                changeLabel: t("dashboard.mom"),
              },
            ]}
          />
        ))}
        {!rows.length ? <p className="home-sales-card-empty">{emptyLabel}</p> : null}
      </div>
    </>
  );
}

function ChannelComparisonCard({
  name,
  isTotal = false,
  blocks,
  money,
  formatChange,
  t,
}: {
  name: string;
  isTotal?: boolean;
  blocks: Array<{
    title: string;
    previousLabel: string;
    currentLabel: string;
    previous: number;
    current: number;
    changeLabel: string;
  }>;
  money: Intl.NumberFormat;
  formatChange: (value: number | null) => string;
  t: (key: string) => string;
}) {
  return (
    <article className={["home-sales-channel-card", isTotal ? "is-total" : ""].filter(Boolean).join(" ")}>
      <header>
        <strong>{name}</strong>
      </header>
      {blocks.map((block) => {
        const difference = block.current - block.previous;
        const change = percentageChange(block.current, block.previous);
        return (
          <section key={block.title || block.changeLabel}>
            {block.title ? <h4>{block.title}</h4> : null}
            <dl>
              <div>
                <dt>{block.previousLabel}</dt>
                <dd>{money.format(block.previous)}</dd>
              </div>
              <div>
                <dt>{block.currentLabel}</dt>
                <dd>{money.format(block.current)}</dd>
              </div>
              <div>
                <dt>{t("dashboard.difference")}</dt>
                <dd className={changeClassName(difference)}>
                  {difference > 0 ? "+" : ""}{money.format(difference)}
                </dd>
              </div>
              <div>
                <dt>{block.changeLabel}</dt>
                <dd className={changeClassName(change)}>{formatChange(change)}</dd>
              </div>
            </dl>
          </section>
        );
      })}
    </article>
  );
}

function MoneyCell({
  value,
  money,
  current = false,
  divider = false,
}: {
  value: number;
  money: Intl.NumberFormat;
  current?: boolean;
  divider?: boolean;
}) {
  return (
    <td className={[current ? "is-current-month" : "", divider ? "home-sales-period-divider" : ""].filter(Boolean).join(" ") || undefined}>
      <span className="home-sales-money">{money.format(value)}</span>
    </td>
  );
}
