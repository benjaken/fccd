import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  fetchReportSuppliers,
  fetchSupplierPurchases,
  type ReportSupplier,
  type SupplierPurchaseRow,
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

export function SupplierPurchaseReport() {
  const { t, i18n } = useTranslation();
  const range = useMemo(currentMonthRange, []);
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [suppliers, setSuppliers] = useState<ReportSupplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [rows, setRows] = useState<SupplierPurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const number = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const selectedSupplierName =
    suppliers.find((supplier) => supplier.id === selectedSupplier)?.name ??
    rows[0]?.supplierName ??
    "—";
  const totalQuantity = rows.reduce(
    (total, row) => total + row.quantityKg,
    0,
  );
  const totalAmount = rows.reduce(
    (total, row) => total + row.purchaseAmount,
    0,
  );
  const averagePrice = totalQuantity ? totalAmount / totalQuantity : null;

  useEffect(() => {
    let active = true;
    void fetchReportSuppliers()
      .then((data) => {
        if (!active) return;
        setSuppliers(data);
        setSelectedSupplier(data[0]?.id ?? "");
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
  }, [t]);

  useEffect(() => {
    if (
      !selectedSupplier ||
      !startDate ||
      !endDate ||
      startDate > endDate
    ) {
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetchSupplierPurchases({
        startDate,
        endDate,
        supplierIds: [selectedSupplier],
      })
        .then((data) => {
          if (active) setRows(data);
        })
        .catch((loadError) => {
          if (!active) return;
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("reports.loadError"),
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [endDate, selectedSupplier, startDate, t]);

  const exportCsv = () => {
    const csv = [
      ["Date range", "Supplier", "Product", "Quantity KG", "Amount", "Average / KG"],
      ...rows.map((row) => [
        `${startDate} - ${endDate}`,
        row.supplierName,
        row.rawMeatName,
        String(row.quantityKg),
        String(row.purchaseAmount),
        String(row.averagePricePerKg),
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
    link.download = `supplier-purchases-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="panel report-filter-panel">
        <div className="report-shop-filter">
          {suppliers.map((supplier) => (
            <button
              className={cn(selectedSupplier === supplier.id && "active")}
              key={supplier.id}
              type="button"
              onClick={() => setSelectedSupplier(supplier.id)}
            >
              {supplier.name}
            </button>
          ))}
        </div>
        <div className="report-date-controls">
          <label>
            <span>{t("reports.startDate")}</span>
            <input
              max={endDate}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <span>—</span>
          <label>
            <span>{t("reports.endDate")}</span>
            <input
              min={startDate}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <Button
            disabled={!rows.length}
            type="button"
            variant="outline"
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
        <section className="panel">
          <div className="report-state">{t("reports.loading")}</div>
        </section>
      ) : !rows.length ? (
        <section className="panel">
          <div className="report-state">{t("reports.supplierPurchaseEmpty")}</div>
        </section>
      ) : (
        <>
          <section
            className="shop-order-summary"
            aria-label={t("reports.supplierPurchaseSummary")}
          >
            <article className="panel">
              <span>{t("reports.supplier")}</span>
              <strong>{selectedSupplierName}</strong>
              <small>
                {startDate} — {endDate}
              </small>
            </article>
            <article className="panel">
              <span>{t("reports.rawMeatTypes")}</span>
              <strong>{rows.length}</strong>
              <small>{t("reports.purchasedProducts")}</small>
            </article>
            <article className="panel">
              <span>{t("reports.totalPurchasedKg")}</span>
              <strong>{number.format(totalQuantity)}</strong>
              <small>KG</small>
            </article>
            <article className="panel">
              <span>{t("reports.totalPurchaseAmount")}</span>
              <strong>{currency.format(totalAmount)}</strong>
              <small>
                {t("reports.averagePerKg")}:{" "}
                {averagePrice === null ? "—" : currency.format(averagePrice)}
              </small>
            </article>
          </section>
          <section className="panel supplier-purchase-report">
            <header>
              <div>
                <span>{t("reports.purchaseBreakdown")}</span>
                <h2>{t("reports.tabs.supplierPurchase")}</h2>
                <p>{selectedSupplierName}</p>
              </div>
              <strong>
                {startDate} — {endDate}
              </strong>
            </header>
            <div className="report-table-wrap">
              <table className="supplier-purchase-table">
                <thead>
                  <tr>
                    <th>{t("reports.rawMeat")}</th>
                    <th>{t("reports.purchaseQuantity")}</th>
                    <th>{t("reports.purchaseAmount")}</th>
                    <th>{t("reports.averagePerKg")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rawMeatItemId}>
                      <th scope="row">{row.rawMeatName}</th>
                      <td>{number.format(row.quantityKg)} KG</td>
                      <td>{currency.format(row.purchaseAmount)}</td>
                      <td>{currency.format(row.averagePricePerKg)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>{t("reports.total")}</th>
                    <td>{number.format(totalQuantity)} KG</td>
                    <td>{currency.format(totalAmount)}</td>
                    <td>
                      {averagePrice === null
                        ? "—"
                        : currency.format(averagePrice)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
