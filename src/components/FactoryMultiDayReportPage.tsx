import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { FactoryQzTrayStatus } from "@/components/FactoryQzTray";
import { FactoryBrandLogo } from "@/components/FactoryBrandLogo";
import { Button } from "@/components/ui/button";
import {
  aggregateFactoryMultiDayMenuRows,
  factoryMultiDayPrintedDate,
  factoryMultiDayRangeLabels,
  fetchFactoryBrands,
  fetchFactoryMultiDayMenu,
  formatFactoryQuantity,
  type FactoryBrand,
  type FactoryMultiDayMenuContribution,
  type FactoryMultiDayMenuRow,
} from "@/lib/factory-board";
import {
  groupFactoryMenuRowsByCategory,
  type FactoryMenuCategory,
} from "@/lib/factory-menu-category";
import { qzTrayClient, useQzTray, type QzTrayClient } from "@/lib/qz-tray";
import { formatFactoryOrderNumber } from "@/lib/factory-order-number";
import { fetchActiveOrderEditIds } from "@/lib/order-edit-lock";
import {
  subscribeActiveOrderEditPresence,
  type ActiveOrderEditPresenceSubscriber,
} from "@/lib/order-edit-presence";

function orderCell(row: FactoryMultiDayMenuRow | undefined) {
  if (!row) return null;
  return (
    <div className="factory-multi-day-orders">
      {row.orders.map((order) => (
        <span key={order.orderId}>
          {order.deliveryDate.slice(5).replace("-", "/")}
          {order.deliveryTime ? ` ${order.deliveryTime}` : ""}
          {` · ${formatFactoryOrderNumber(order.orderNumber, order.orderId)}`}
          {` × ${formatFactoryQuantity(order.quantity)}`}
        </span>
      ))}
    </div>
  );
}

export function FactoryMultiDayReportPage({
  loadBrands = fetchFactoryBrands,
  loadRows = fetchFactoryMultiDayMenu,
  loadActiveEditOrderIds = fetchActiveOrderEditIds,
  subscribeEditPresence = subscribeActiveOrderEditPresence,
  qzClient = qzTrayClient,
}: {
  loadBrands?: typeof fetchFactoryBrands;
  loadRows?: typeof fetchFactoryMultiDayMenu;
  loadActiveEditOrderIds?: typeof fetchActiveOrderEditIds;
  subscribeEditPresence?: ActiveOrderEditPresenceSubscriber;
  qzClient?: QzTrayClient;
}) {
  const { t, i18n } = useTranslation();
  const categoryLabel = (category: FactoryMenuCategory) =>
    t(`factoryBoard.menuCategories.${category}`);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const startDate = params.get("start") ?? "";
  const endDate = params.get("end") ?? "";
  const qz = useQzTray({ client: qzClient });
  const [qzOpen, setQzOpen] = useState(false);
  const [brands, setBrands] = useState<FactoryBrand[]>([]);
  const [rows, setRows] = useState<FactoryMultiDayMenuContribution[]>([]);
  const [activeBrandIds, setActiveBrandIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [printBlocked, setPrintBlocked] = useState(false);
  const [realtimeEditOrderIds, setRealtimeEditOrderIds] =
    useState<Set<string> | null>(null);

  useEffect(() => subscribeEditPresence(setRealtimeEditOrderIds), [subscribeEditPresence]);

  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setError(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    void Promise.all([loadBrands(), loadRows(startDate, endDate)])
      .then(([nextBrands, nextRows]) => {
        if (cancelled) return;
        setBrands(nextBrands);
        setActiveBrandIds(nextBrands.map((brand) => brand.id));
        setRows(nextRows);
        void loadActiveEditOrderIds([
          ...new Set(nextRows.map((row) => row.orderId)),
        ]).then((activeEditOrderIds) => {
          if (!cancelled) setPrintBlocked(activeEditOrderIds.size > 0);
        }).catch(() => {
          if (!cancelled) setPrintBlocked(true);
        });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endDate, loadActiveEditOrderIds, loadBrands, loadRows, startDate]);

  const activeBrands = useMemo(() => new Set(activeBrandIds), [activeBrandIds]);
  const realtimePrintBlocked = realtimeEditOrderIds === null
    ? printBlocked
    : rows.some((row) => realtimeEditOrderIds.has(row.orderId));
  const reportRows = useMemo(
    () => aggregateFactoryMultiDayMenuRows(rows, activeBrands),
    [activeBrands, rows],
  );
  const counts = useMemo(() => {
    const next = new Map<string, number>();
    for (const row of rows) {
      if (row.brandId) next.set(row.brandId, (next.get(row.brandId) ?? 0) + row.quantity);
    }
    return next;
  }, [rows]);
  const reportGroups = useMemo(
    () => groupFactoryMenuRowsByCategory(reportRows),
    [reportRows],
  );
  const rangeLabels = factoryMultiDayRangeLabels(
    startDate,
    endDate,
    i18n.language.startsWith("zh"),
  );

  const closePage = () => {
    window.close();
    if (!window.closed) navigate("/factory");
  };

  return (
    <main className="factory-board factory-multi-day-page">
      <header className="factory-board-top no-print">
        <div className="factory-board-heading factory-page-title-heading">
          <FactoryBrandLogo />
          <p className="factory-order-page-title">{t("factoryBoard.multiDayMenu")}</p>
        </div>
        <div className="factory-board-actions">
          <FactoryQzTrayStatus
            qz={qz}
            open={qzOpen}
            onToggle={() => setQzOpen((current) => !current)}
          />
        </div>
      </header>

      <section className="factory-multi-day-report">
        <header className="factory-multi-day-report-header">
          <Button type="button" variant="outline" className="factory-multi-day-back no-print" onClick={closePage}>
            <ArrowLeft aria-hidden="true" />{t("factoryBoard.back")}
          </Button>
          <h1>
            {t("factoryBoard.multiDayReportTitle", {
              start: rangeLabels.start,
              end: rangeLabels.end,
            })}
          </h1>
          <p>
            {t("factoryBoard.printedAt", {
              date: factoryMultiDayPrintedDate(new Date(), i18n.language),
            })}
          </p>
          <Button type="button" className="factory-multi-day-print no-print" disabled={realtimePrintBlocked} onClick={() => window.print()}>
            <Printer aria-hidden="true" />{t("factoryBoard.print")}
          </Button>
        </header>
        {realtimePrintBlocked ? <p className="factory-edit-lock-warning no-print" role="alert"><TriangleAlert aria-hidden="true" /><strong>{t("factoryBoard.orderEditingPrintBlocked")}</strong></p> : null}

        <div className="factory-multi-day-brands" aria-label={t("factoryBoard.brands")}>
          {brands.filter((brand) => activeBrands.has(brand.id)).map((brand) => (
            <span className="factory-multi-day-brand" key={brand.id}>
              <button
                type="button"
                className="no-print"
                aria-label={t("factoryBoard.removeBrand", { name: brand.name })}
                onClick={() => setActiveBrandIds((current) => current.filter((id) => id !== brand.id))}
              >
                <X aria-hidden="true" />
              </button>
              <span>{brand.name}</span>
              <strong>[{formatFactoryQuantity(counts.get(brand.id) ?? 0)}]</strong>
            </span>
          ))}
        </div>

        {loading ? (
          <p className="factory-multi-day-state">{t("common.loading")}</p>
        ) : error ? (
          <p className="factory-multi-day-state">{t("factoryBoard.multiDayLoadError")}</p>
        ) : reportRows.length === 0 ? (
          <p className="factory-multi-day-state">{t("factoryBoard.emptyMultiDayMenu")}</p>
        ) : (
          <div className="factory-multi-day-table-wrap">
            <table className="factory-multi-day-table is-two-column">
              <thead>
                <tr>
                  <th>{t("factoryBoard.menuDish")}</th>
                  <th>{t("factoryBoard.multiDayTotal")}</th>
                  <th>{t("factoryBoard.orders")}</th>
                  <th>{t("factoryBoard.menuDish")}</th>
                  <th>{t("factoryBoard.multiDayTotal")}</th>
                  <th>{t("factoryBoard.orders")}</th>
                </tr>
              </thead>
              <tbody>
                {reportGroups.map((group) => {
                  const leftGroupRows = group.rows.filter((_, index) => index % 2 === 0);
                  const rightGroupRows = group.rows.filter((_, index) => index % 2 === 1);
                  return (
                    <Fragment key={`group-${group.category}`}>
                      <tr className="factory-menu-category-row">
                        <th colSpan={6}>{categoryLabel(group.category)}</th>
                      </tr>
                      {leftGroupRows.map((left, index) => {
                        const right = rightGroupRows[index];
                        return (
                          <tr key={`${left.label}-${right?.label ?? ""}`}>
                            <td>{left.label}</td><td>{formatFactoryQuantity(left.quantity)}</td><td>{orderCell(left)}</td>
                            {right ? <><td>{right.label}</td><td>{formatFactoryQuantity(right.quantity)}</td><td>{orderCell(right)}</td></> : <td colSpan={3} />}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
