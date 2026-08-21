import { Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RestaurantNewProductsSettings } from "@/components/RestaurantNewProductsPage";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  defaultNewProductReportDates,
  fetchRestaurantNewProductReport,
  type RestaurantNewProductReportRow,
} from "@/lib/restaurant-new-product-report";

const PAGE_SIZE = 20;

export function RestaurantNewProductReport({
  loadReport = fetchRestaurantNewProductReport,
}: {
  loadReport?: typeof fetchRestaurantNewProductReport;
}) {
  const { t, i18n } = useTranslation();
  const defaults = useMemo(() => defaultNewProductReportDates(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RestaurantNewProductReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!validRange) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void loadReport({ startDate, endDate, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setRows([]);
        setTotal(0);
        setError(loadError instanceof Error ? loadError.message : "load_failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endDate, loadReport, page, reloadKey, startDate, validRange]);

  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);
  const quantity = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 3,
  });

  return (
    <section className="restaurant-new-product-report">
      <header className="restaurant-new-product-report-toolbar">
        <DateRangePicker
          startId="new-product-report-start-date"
          endId="new-product-report-end-date"
          startValue={startDate}
          endValue={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          startLabel={t("reports.startDate")}
          endLabel={t("reports.endDate")}
          legend={t("reports.dateRange")}
          allowOutOfOrder
        />
        <Button type="button" onClick={() => setSettingsOpen(true)}>
          <Settings />
          {t("restaurantNewProductReport.settings")}
        </Button>
      </header>

      {!validRange ? (
        <section className="panel restaurant-new-product-report-state">
          {t("restaurantNewProductReport.invalidRange")}
        </section>
      ) : error ? (
        <section className="panel restaurant-new-product-report-state is-error">
          <strong>{t("restaurantNewProductReport.loadError")}</strong>
          <span>{error}</span>
        </section>
      ) : (
        <section className="panel restaurant-new-product-report-panel">
          <ListTable
            loading={loading}
            loadingLabel={t("restaurantNewProductReport.loading")}
            skeletonColumns={3}
            skeletonRows={PAGE_SIZE}
            onRefresh={() => setReloadKey((key) => key + 1)}
            header={
              <tr>
                <th>{t("restaurantNewProductReport.columns.date")}</th>
                <th>{t("restaurantNewProductReport.columns.product")}</th>
                <th>{t("restaurantNewProductReport.columns.quantity")}</th>
              </tr>
            }
          >
            {rows.length ? rows.map((row) => (
              <tr key={`${row.saleDate}:${row.productId}`}>
                <td>{startDate === endDate ? startDate : `${startDate} — ${endDate}`}</td>
                <td><strong>{row.productName}</strong></td>
                <td>{quantity.format(row.quantity)}</td>
              </tr>
            )) : (
              <tr>
                <td className="restaurant-new-product-report-empty" colSpan={3}>
                  {t("restaurantNewProductReport.empty")}
                </td>
              </tr>
            )}
          </ListTable>
          <TablePagination
            summary={t("restaurantNewProductReport.pagination", { from, to, total })}
            page={page}
            totalPages={totalPages}
            loading={loading}
            onPrevious={() => setPage((value) => Math.max(1, value - 1))}
            onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
            onPageChange={setPage}
            previousLabel={t("restaurantNewProductReport.previous")}
            nextLabel={t("restaurantNewProductReport.next")}
            pageLabel={t("restaurantNewProductReport.pageOf")}
            jumpLabel={t("restaurantNewProductReport.jumpToPage")}
          />
        </section>
      )}
      <SidePanel
        open={settingsOpen}
        title={t("restaurantNewProducts.title")}
        description={t("restaurantNewProducts.panelDescription")}
        onClose={() => setSettingsOpen(false)}
        closeLabel={t("restaurantNewProducts.close")}
        className="side-panel-majority restaurant-new-products-panel"
      >
        <RestaurantNewProductsSettings />
      </SidePanel>
    </section>
  );
}
