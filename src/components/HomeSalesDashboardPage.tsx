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

function valueClassName(isTotal: boolean, change?: number | null) {
  return [
    isTotal ? "home-sales-total-value" : "home-sales-channel-value",
    changeClassName(change ?? null),
  ]
    .filter(Boolean)
    .join(" ");
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
  const periodLabel = (key: HomeSalesPeriodKey, accumulating = false) => {
    const period = periodByKey[key];
    if (!period) return "—";
    const label = t("dashboard.yearMonth", { year: period.year, month: period.month });
    return accumulating ? `${label}．${t("dashboard.accumulating")}` : label;
  };
  const formatChange = (value: number | null) =>
    value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  const cateringChannels = data?.cateringChannels ?? [];
  const visibleCateringChannels = cateringChannelFilter
    ? cateringChannels.filter((row) => row.id === cateringChannelFilter)
    : cateringChannels;
  const tkoChannels = (data?.tkoChannels ?? []).map((row) =>
    row.id === "other" ? { ...row, name: t("dashboard.other") } : row,
  );

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
        <YearComparisonPair
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
        <YearComparisonPair
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

function YearComparisonPair({
  rows,
  money,
  periodLabel,
  formatChange,
  emptyLabel,
  t,
}: {
  rows: HomeSalesComparisonRow[];
  money: Intl.NumberFormat;
  periodLabel: (key: HomeSalesPeriodKey, accumulating?: boolean) => string;
  formatChange: (value: number | null) => string;
  emptyLabel: string;
  t: (key: string) => string;
}) {
  const displayRows = rows.length
    ? [totalRowFor(rows, t("dashboard.totalColumn")), ...rows]
    : rows;

  return (
    <>
      <div className="home-sales-comparison-pair">
        <YearComparisonTable
          title={t("dashboard.thisMonthComparison")}
          columns={displayRows}
          currentKey="currentMonth"
          previousKey="previousYearCurrentMonth"
          currentLabel={periodLabel("currentMonth", true)}
          previousLabel={periodLabel("previousYearCurrentMonth")}
          money={money}
          formatChange={formatChange}
          emptyLabel={emptyLabel}
          t={t}
        />
        <YearComparisonTable
          title={t("dashboard.lastMonthComparison")}
          columns={displayRows}
          currentKey="previousMonth"
          previousKey="previousYearPreviousMonth"
          currentLabel={periodLabel("previousMonth")}
          previousLabel={periodLabel("previousYearPreviousMonth")}
          money={money}
          formatChange={formatChange}
          emptyLabel={emptyLabel}
          t={t}
        />
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
                title: t("dashboard.lastMonthComparison"),
                previousLabel: periodLabel("previousYearPreviousMonth"),
                currentLabel: periodLabel("previousMonth"),
                previous: row.values.previousYearPreviousMonth,
                current: row.values.previousMonth,
                changeLabel: t("dashboard.yoy"),
              },
              {
                title: t("dashboard.thisMonthComparison"),
                previousLabel: periodLabel("previousYearCurrentMonth"),
                currentLabel: periodLabel("currentMonth", true),
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

function YearComparisonTable({
  title,
  columns,
  currentKey,
  previousKey,
  currentLabel,
  previousLabel,
  money,
  formatChange,
  emptyLabel,
  t,
}: {
  title: string;
  columns: HomeSalesComparisonRow[];
  currentKey: HomeSalesPeriodKey;
  previousKey: HomeSalesPeriodKey;
  currentLabel: string;
  previousLabel: string;
  money: Intl.NumberFormat;
  formatChange: (value: number | null) => string;
  emptyLabel: string;
  t: (key: string) => string;
}) {
  return (
    <div className="home-sales-matrix">
      <h3>{title}</h3>
      <div className="table-wrap home-sales-table-wrap">
        <table className="home-sales-table home-sales-matrix-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{t("dashboard.period")}</span></th>
              {columns.map((column) => (
                <th
                  scope="col"
                  key={column.id}
                  className={column.id === "__total__" ? "home-sales-total-col" : "home-sales-channel-col"}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.length ? (
              <>
                <tr className="is-current-month-row">
                  <th scope="row">{currentLabel}</th>
                  {columns.map((column) => (
                    <MoneyCell
                      key={column.id}
                      value={column.values[currentKey]}
                      money={money}
                      total={column.id === "__total__"}
                      current
                    />
                  ))}
                </tr>
                <tr>
                  <th scope="row">{previousLabel}</th>
                  {columns.map((column) => (
                    <MoneyCell
                      key={column.id}
                      value={column.values[previousKey]}
                      money={money}
                      total={column.id === "__total__"}
                    />
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t("dashboard.difference")}</th>
                  {columns.map((column) => {
                    const difference = column.values[currentKey] - column.values[previousKey];
                    return (
                      <td
                        key={column.id}
                        className={valueClassName(column.id === "__total__", difference)}
                      >
                        {difference > 0 ? "+" : ""}{money.format(difference)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">{t("dashboard.percent")}</th>
                  {columns.map((column) => {
                    const change = percentageChange(
                      column.values[currentKey],
                      column.values[previousKey],
                    );
                    return (
                      <td
                        key={column.id}
                        className={valueClassName(column.id === "__total__", change)}
                      >
                        {formatChange(change)}
                      </td>
                    );
                  })}
                </tr>
              </>
            ) : (
              <tr>
                <td className="dashboard-empty-row" colSpan={1}>{emptyLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
  total = false,
}: {
  value: number;
  money: Intl.NumberFormat;
  current?: boolean;
  total?: boolean;
}) {
  return (
    <td
      className={[
        current ? "is-current-month" : "",
        total ? "home-sales-total-value" : "home-sales-channel-value",
      ]
        .filter(Boolean)
        .join(" ") || undefined}
    >
      <span className="home-sales-money">{money.format(value)}</span>
    </td>
  );
}
