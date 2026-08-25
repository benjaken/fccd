import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  REPORT_GROUP_TABS,
  REPORT_TAB_PERMISSION_KEYS,
  REPORT_TAB_ROUTES,
  useCurrentPageAccess,
  type ReportGroup,
  type ReportTabKey,
} from "@/auth/use-page-access";
import { MeatPriceReport } from "@/components/MeatPriceReport";
import {
  PreparedMeatStockReport,
  RawMeatStockReport,
} from "@/components/PreparedMeatStockReport";
import { RawMeatAveragePriceReport } from "@/components/RawMeatAveragePriceReport";
import { RestaurantSalesReportPage } from "@/components/RestaurantSalesReportPage";
import { RestaurantSalesSalaryReport } from "@/components/RestaurantSalesSalaryReport";
import { RestaurantSalesCostReport } from "@/components/RestaurantSalesCostReport";
import { RestaurantPnlReport } from "@/components/RestaurantPnlReport";
import { RestaurantNewProductReport } from "@/components/RestaurantNewProductReport";
import { SupplierPurchaseReport } from "@/components/SupplierPurchaseReport";
import { ShopSalesWorkingHoursReport } from "@/components/ShopSalesWorkingHoursReport";
import {
  ReportAiSnapshotPublisher,
  ReportAiTrigger,
  ReportAiWorkspace,
} from "@/components/report-ai/ReportAiWorkspace";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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

export function ReportsPage({ group }: { group: ReportGroup }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const pageAccess = useCurrentPageAccess();
  const reportTabs = REPORT_GROUP_TABS[group];
  const visibleTabs = useMemo(
    () =>
      reportTabs.filter((tab) =>
        pageAccess.canAccess(REPORT_TAB_PERMISSION_KEYS[tab]),
      ),
    [pageAccess, reportTabs],
  );
  const routeTab = reportTabs.find(
    (tab) => REPORT_TAB_ROUTES[tab] === location.pathname,
  );
  const activeTab =
    routeTab && visibleTabs.includes(routeTab) ? routeTab : visibleTabs[0];
  const canViewShopOrderQuantities = visibleTabs.includes(
    "shopOrderQuantities",
  );
  const range = useMemo(currentMonthRange, []);
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [shops, setShops] = useState<ReportShop[]>([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [rows, setRows] = useState<ShopOrderQuantityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTab) return;
    const activePath = REPORT_TAB_ROUTES[activeTab];
    if (location.pathname !== activePath) navigate(activePath, { replace: true });
  }, [activeTab, location.pathname, navigate]);

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
    return [...grouped.values()].sort(
      (left, right) =>
        right.quantity - left.quantity ||
        left.name.localeCompare(right.name, i18n.language),
    );
  }, [rows, i18n.language]);
  const total = products.reduce((sum, product) => sum + product.quantity, 0);
  const maximumProductQuantity = products.reduce(
    (maximum, product) => Math.max(maximum, product.quantity),
    0,
  );
  const selectedShopName =
    shops.find((shop) => shop.id === selectedShop)?.name ??
    rows[0]?.shopName ??
    "—";
  const selectedDays =
    startDate && endDate
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${endDate}T00:00:00Z`) -
              Date.parse(`${startDate}T00:00:00Z`)) /
              86_400_000,
          ) + 1,
        )
      : 0;
  const shopOrderAiSnapshot = useMemo(
    () =>
      activeTab === "shopOrderQuantities" && !loading
        ? {
            filters: {
              startDate,
              endDate,
              shopId: selectedShop || null,
              shopName: selectedShopName,
            },
            currentAggregates: products.map((product) => ({
              productName: product.name,
              unit: product.unit,
              quantity: product.quantity,
              sharePercent: total ? (product.quantity / total) * 100 : 0,
            })),
            detailRows: rows.map((row) => ({
              orderDate: row.orderDate,
              shopName: row.shopName,
              productName: row.productName,
              quantity: row.totalQuantity,
              unit: row.unit,
            })),
            completeness: {
              status: "complete" as const,
              notes: ["數量是所選店舖及日期範圍的訂貨匯總。"],
            },
          }
        : null,
    [
      activeTab,
      endDate,
      loading,
      products,
      rows,
      selectedShop,
      selectedShopName,
      startDate,
      total,
    ],
  );

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
    if (
      activeTab !== "shopOrderQuantities" ||
      !canViewShopOrderQuantities
    ) return;
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
  }, [activeTab, canViewShopOrderQuantities, t]);

  useEffect(() => {
    if (
      activeTab !== "shopOrderQuantities" ||
      !canViewShopOrderQuantities
    ) return;
    if (!selectedShop || !startDate || !endDate || startDate > endDate) return;
    const timeout = window.setTimeout(() => {
      void loadReport(startDate, endDate, selectedShop);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [activeTab, canViewShopOrderQuantities, endDate, selectedShop, startDate]);

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

  if (!activeTab) return null;

  return (
    <ReportAiWorkspace
      key={activeTab}
      reportKey={activeTab}
      permissionKey={REPORT_TAB_PERMISSION_KEYS[activeTab]}
      reportTitle={t(`reports.tabs.${activeTab}`)}
    >
    <div className="reports-page">
      <ReportAiSnapshotPublisher snapshot={shopOrderAiSnapshot} />
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            {t(`reports.groups.${group}.eyebrow`)}
          </span>
          <h1>{t(`reports.groups.${group}.title`)}</h1>
        </div>
      </section>
      <div className="report-ai-nav-row">
        {visibleTabs.length > 1 || group === "shops" ? (
          <nav className="report-tabs" aria-label={t("reports.navigation")}>
            {visibleTabs.map((tab) => (
              <Link
                aria-current={activeTab === tab ? "page" : undefined}
                className={cn(activeTab === tab && "active")}
                key={tab}
                to={REPORT_TAB_ROUTES[tab]}
              >
                {t(`reports.tabs.${tab}`)}
              </Link>
            ))}
          </nav>
        ) : null}
        <ReportAiTrigger />
      </div>
      {activeTab === "shopSales" ? (
        <RestaurantSalesReportPage embedded />
      ) : activeTab === "shopSalesWorkingHours" ? (
        <ShopSalesWorkingHoursReport />
      ) : activeTab === "restaurantSalesSalary" ? (
        <RestaurantSalesSalaryReport />
      ) : activeTab === "restaurantSalesCost" ? (
        <RestaurantSalesCostReport />
      ) : activeTab === "restaurantPnl" ? (
        <RestaurantPnlReport />
      ) : activeTab === "newProducts" ? (
        <RestaurantNewProductReport />
      ) : activeTab === "shopOrderQuantities" ? (
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
          <DateRangePicker
            startId="shop-order-start-date"
            endId="shop-order-end-date"
            startValue={startDate}
            endValue={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
            startLabel={t("reports.startDate")}
            endLabel={t("reports.endDate")}
            legend={t("reports.dateRange")}
          />
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
          {error ? (
            <section className="panel">
              <div className="report-state error">
                <p>{t("reports.loadError")}</p>
                <small>{error}</small>
              </div>
            </section>
          ) : loading ? (
            <PageSkeleton
              compact
              label={t("reports.loading")}
              variant="report"
            />
          ) : !rows.length ? (
            <section className="panel">
              <div className="report-state">{t("reports.empty")}</div>
            </section>
          ) : (
            <>
              <section
                className="shop-order-summary"
                aria-label={t("reports.orderSummary")}
              >
                <article className="panel">
                  <span>{t("reports.shop")}</span>
                  <strong>{selectedShopName}</strong>
                  <small>{t("reports.consolidatedOrder")}</small>
                </article>
                <article className="panel">
                  <span>{t("reports.selectedPeriod")}</span>
                  <strong>{selectedDays}</strong>
                  <small>{t("reports.days")}</small>
                </article>
                <article className="panel">
                  <span>{t("reports.productTypes")}</span>
                  <strong>{products.length}</strong>
                  <small>{t("reports.distinctProducts")}</small>
                </article>
                <article className="panel">
                  <span>{t("reports.totalQuantity")}</span>
                  <strong>{quantity.format(total)}</strong>
                  <small>{t("reports.allProductsCombined")}</small>
                </article>
              </section>
              <section className="panel shop-order-report">
                <header>
                  <div>
                    <span>{t("reports.quantityRanking")}</span>
                    <h2>{t("reports.tabs.shopOrderQuantities")}</h2>
                    <p>
                      {startDate === endDate
                        ? startDate
                        : `${startDate} — ${endDate}`}
                    </p>
                  </div>
                  <strong>{selectedShopName}</strong>
                </header>
                <div className="shop-order-product-grid">
                  {products.map((product) => {
                    const share = total
                      ? (product.quantity / total) * 100
                      : 0;
                    return (
                      <article
                        key={`${product.name}-${product.unit ?? ""}`}
                      >
                        <div className="shop-order-product-copy">
                          <strong>{product.name}</strong>
                          <small>
                            {t("reports.quantityShare", {
                              share: share.toFixed(1),
                            })}
                          </small>
                        </div>
                        <div className="shop-order-product-bar">
                          <span
                            aria-label={`${product.name} ${quantity.format(product.quantity)}`}
                            role="progressbar"
                            style={{
                              width: `${maximumProductQuantity ? (product.quantity / maximumProductQuantity) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <strong className="shop-order-product-quantity">
                          {quantity.format(product.quantity)}
                          {product.unit ? ` ${product.unit}` : ""}
                        </strong>
                      </article>
                    );
                  })}
                </div>
                <footer>
                  <span>{t("reports.total")}</span>
                  <strong>{quantity.format(total)}</strong>
                </footer>
              </section>
            </>
          )}
        </>
      ) : activeTab === "rawMeatAveragePrice" ? (
        <RawMeatAveragePriceReport />
      ) : activeTab === "preparedMeatStock" ? (
        <PreparedMeatStockReport />
      ) : activeTab === "rawMeatStock" ? (
        <RawMeatStockReport />
      ) : activeTab === "supplierPurchase" ? (
        <SupplierPurchaseReport />
      ) : (
        <MeatPriceReport
          mode={activeTab === "averageSupplyPrice" ? "shop" : "factory"}
        />
      )}
    </div>
    </ReportAiWorkspace>
  );
}
