import { CalendarDays, Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  fetchReportShops,
  fetchShopOrderQuantities,
  type ReportShop,
  type ShopOrderQuantityRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { start: format(start), end: format(end) };
}

const reportTabs = [
  "shopOrderQuantities",
  "averageSupplyPrice",
  "productionCostPrice",
  "rawMeatAveragePrice",
  "preparedMeatStock",
  "rawMeatStock",
  "supplierPurchase",
] as const;

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const range = useMemo(currentMonthRange, []);
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [shops, setShops] = useState<ReportShop[]>([]);
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [rows, setRows] = useState<ShopOrderQuantityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const quantity = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 3,
  });
  const total = rows.reduce((sum, row) => sum + row.totalQuantity, 0);

  const loadReport = async (
    nextStart = startDate,
    nextEnd = endDate,
    nextShops = selectedShops,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShopOrderQuantities({
        startDate: nextStart,
        endDate: nextEnd,
        shopIds: nextShops,
      });
      setRows(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("reports.loadError"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void fetchReportShops()
      .then((data) => {
        if (!active) return;
        setShops(data);
        return loadReport(range.start, range.end, []);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("reports.loadError"),
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void loadReport();
  };

  const toggleShop = (id: string) => {
    setSelectedShops((current) =>
      current.includes(id)
        ? current.filter((shopId) => shopId !== id)
        : [...current, id],
    );
  };

  const exportCsv = () => {
    const csv = [
      ["Date", "Shop", "Product", "Quantity", "Unit"],
      ...rows.map((row) => [
        row.orderDate,
        row.shopName,
        row.productName,
        String(row.totalQuantity),
        row.unit ?? "",
      ]),
    ]
      .map((line) =>
        line.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `shop-order-quantities-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{t("reports.eyebrow")}</span>
          <h1>{t("reports.title")}</h1>
          <p>{t("reports.description")}</p>
        </div>
      </section>
      <nav className="report-tabs" aria-label={t("reports.navigation")}>
        {reportTabs.map((tab, index) => (
          <button
            className={cn(index === 0 && "active")}
            disabled={index !== 0}
            key={tab}
            type="button"
          >
            {t(`reports.tabs.${tab}`)}
          </button>
        ))}
      </nav>
      <section className="panel report-filter-panel">
        <div className="report-shop-filter">
          <button
            className={cn(!selectedShops.length && "active")}
            type="button"
            onClick={() => setSelectedShops([])}
          >
            {t("reports.allShops")}
          </button>
          {shops.map((shop) => (
            <button
              className={cn(selectedShops.includes(shop.id) && "active")}
              key={shop.id}
              type="button"
              onClick={() => toggleShop(shop.id)}
            >
              {shop.name}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          <label>
            <span>{t("reports.startDate")}</span>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <span>—</span>
          <label>
            <span>{t("reports.endDate")}</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? <RefreshCw className="spin" /> : <CalendarDays />}
            {t("reports.query")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!rows.length}
            onClick={exportCsv}
          >
            <Download />
            {t("reports.export")}
          </Button>
        </form>
      </section>
      <section className="panel shop-order-report">
        <header>
          <div>
            <h2>{t("reports.tabs.shopOrderQuantities")}</h2>
            <p>
              {startDate} — {endDate}
            </p>
          </div>
          <strong>
            {t("reports.totalQuantity")}: {quantity.format(total)}
          </strong>
        </header>
        {error ? (
          <div className="report-state error">
            <p>{t("reports.loadError")}</p>
            <small>{error}</small>
          </div>
        ) : loading ? (
          <div className="report-state">{t("reports.loading")}</div>
        ) : !rows.length ? (
          <div className="report-state">{t("reports.empty")}</div>
        ) : (
          <div className="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("reports.date")}</th>
                  <th>{t("reports.shop")}</th>
                  <th>{t("reports.product")}</th>
                  <th>{t("reports.quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.orderDate}-${row.shopId}-${row.productId ?? row.productName}`}
                  >
                    <td>{row.orderDate}</td>
                    <td>{row.shopName}</td>
                    <td>{row.productName}</td>
                    <td>
                      <strong>{quantity.format(row.totalQuantity)}</strong>
                      {row.unit ? ` ${row.unit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t("reports.total")}</td>
                  <td>{quantity.format(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
