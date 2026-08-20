import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { FactoryQzTrayStatus } from "@/components/FactoryQzTray";
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
import { qzTrayClient, useQzTray, type QzTrayClient } from "@/lib/qz-tray";

function orderCell(row: FactoryMultiDayMenuRow | undefined) {
  if (!row) return null;
  return (
    <div className="factory-multi-day-orders">
      {row.orders.map((order) => (
        <span key={order.orderId}>
          {order.deliveryDate.slice(5).replace("-", "/")}
          {order.deliveryTime ? ` ${order.deliveryTime}` : ""}
          {` · #${order.orderNumber?.replace(/^#/, "") || order.orderId}`}
          {` × ${formatFactoryQuantity(order.quantity)}`}
        </span>
      ))}
    </div>
  );
}

export function FactoryMultiDayReportPage({
  loadBrands = fetchFactoryBrands,
  loadRows = fetchFactoryMultiDayMenu,
  qzClient = qzTrayClient,
}: {
  loadBrands?: typeof fetchFactoryBrands;
  loadRows?: typeof fetchFactoryMultiDayMenu;
  qzClient?: QzTrayClient;
}) {
  const { t, i18n } = useTranslation();
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
  }, [endDate, loadBrands, loadRows, startDate]);

  const activeBrands = useMemo(() => new Set(activeBrandIds), [activeBrandIds]);
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
  const splitAt = Math.ceil(reportRows.length / 2);
  const leftRows = reportRows.slice(0, splitAt);
  const rightRows = reportRows.slice(splitAt);
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
        <div className="factory-board-brand">
          <strong>{t("brand.name")}</strong>
          <small>{t("brand.system")}</small>
        </div>
        <p className="factory-order-page-title">{t("factoryBoard.multiDayMenu")}</p>
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
          <Button type="button" className="factory-multi-day-print no-print" onClick={() => window.print()}>
            <Printer aria-hidden="true" />{t("factoryBoard.print")}
          </Button>
        </header>

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
                {leftRows.map((left, index) => {
                  const right = rightRows[index];
                  return (
                    <tr key={`${left.label}-${right?.label ?? ""}`}>
                      <td>{left.label}</td><td>{formatFactoryQuantity(left.quantity)}</td><td>{orderCell(left)}</td>
                      {right ? <><td>{right.label}</td><td>{formatFactoryQuantity(right.quantity)}</td><td>{orderCell(right)}</td></> : <td colSpan={3} />}
                    </tr>
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
