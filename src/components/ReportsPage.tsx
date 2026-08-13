import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MeatPriceReport } from "@/components/MeatPriceReport";
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
  const [selectedShop, setSelectedShop] = useState("");
  const [rows, setRows] = useState<ShopOrderQuantityRow[]>([]);
  const [activeReport, setActiveReport] =
    useState<(typeof reportTabs)[number]>("shopOrderQuantities");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const quantity = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 3,
  });
  const products = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; unit: string | null; quantity: number }
    >();
    for (const row of rows) {
      const key = row.productId ?? `${row.productName}\u001f${row.unit ?? ""}`;
      const current = grouped.get(key) ?? {
        name: row.productName,
        unit: row.unit,
        quantity: 0,
      };
      current.quantity += row.totalQuantity;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) =>
      left.name.localeCompare(right.name, i18n.language),
    );
  }, [rows, i18n.language]);
  const total = products.reduce((sum, product) => sum + product.quantity, 0);

  const loadReport = async (
    nextStart = startDate,
    nextEnd = endDate,
    nextShop = selectedShop,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShopOrderQuantities({
        startDate: nextStart,
        endDate: nextEnd,
        shopIds: nextShop ? [nextShop] : [],
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
        setSelectedShop(data[0]?.id ?? "");
        if (!data.length) setLoading(false);
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

  useEffect(() => {
    if (!selectedShop || !startDate || !endDate || startDate > endDate) return;
    const timeout = window.setTimeout(() => {
      void loadReport(startDate, endDate, selectedShop);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [selectedShop, startDate, endDate]);

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
            className={cn(activeReport === tab && "active")}
            disabled={index > 2}
            key={tab}
            type="button"
            onClick={() => setActiveReport(tab)}
          >
            {t(`reports.tabs.${tab}`)}
          </button>
        ))}
      </nav>
      {activeReport === "shopOrderQuantities" ? (
        <>
          <section className="panel report-filter-panel">
        <div className="report-shop-filter">
          {shops.map((shop) => (
            <button
              className={cn(selectedShop === shop.id && "active")}
              key={shop.id}
              type="button"
              onClick={() => setSelectedShop(shop.id)}
            >
              {shop.name}
            </button>
          ))}
        </div>
        <div className="report-date-controls">
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
          <Button
            type="button"
            variant="outline"
            disabled={!rows.length}
            onClick={exportCsv}
          >
            <Download />
            {t("reports.export")}
          </Button>
        </div>
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
                <tr>
                  <td>
                    {startDate === endDate
                      ? startDate
                      : `${startDate} — ${endDate}`}
                  </td>
                  <td>{rows[0]?.shopName}</td>
                  <td className="report-product-list">
                    {products.map((product) => (
                      <span key={`${product.name}-${product.unit ?? ""}`}>
                        {product.name}
                      </span>
                    ))}
                    <strong>{t("reports.total")}</strong>
                  </td>
                  <td className="report-quantity-list">
                    {products.map((product) => (
                      <span key={`${product.name}-${product.unit ?? ""}`}>
                        {quantity.format(product.quantity)}
                        {product.unit ? ` ${product.unit}` : ""}
                      </span>
                    ))}
                    <strong>{quantity.format(total)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
          </section>
        </>
      ) : (
        <MeatPriceReport
          mode={activeReport === "averageSupplyPrice" ? "shop" : "factory"}
        />
      )}
    </div>
  );
}
