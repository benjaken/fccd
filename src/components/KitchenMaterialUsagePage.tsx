import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListTable } from "@/components/ui/list-table";
import {
  fetchStocktakeDates,
  type StocktakeDateItem,
} from "@/lib/packing-stocktakes";
import {
  fetchKitchenMaterialUsageReport,
  type KitchenMaterialUsageReport,
} from "@/lib/kitchen-material-usage";

type ReportLoader = (selection: {
  stocktakeDate: string;
  usageStartDate: string;
  usageEndDate: string;
}) => Promise<KitchenMaterialUsageReport>;
type StocktakeDatesLoader = () => Promise<StocktakeDateItem[]>;
type UsageMode = "single" | "range";

const SKELETON_COLUMNS = [
  { width: "13rem" },
  { width: "7rem" },
  { width: "18rem" },
  { width: "7rem" },
  { width: "7rem" },
  { width: "7rem" },
];
const defaultStocktakeDatesLoader: StocktakeDatesLoader = () =>
  fetchStocktakeDates("ingredient");

function formatQuantity(value: number | null, unit: string | null) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatHongKongDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function KitchenMaterialUsagePage({
  loadReport = fetchKitchenMaterialUsageReport,
  loadStocktakeDates = defaultStocktakeDatesLoader,
}: {
  loadReport?: ReportLoader;
  loadStocktakeDates?: StocktakeDatesLoader;
}) {
  const { t } = useTranslation();
  const [stocktakeDates, setStocktakeDates] = useState<StocktakeDateItem[]>([]);
  const [stocktakeDatesLoading, setStocktakeDatesLoading] = useState(true);
  const [stocktakeDate, setStocktakeDate] = useState("");
  const [usageMode, setUsageMode] = useState<UsageMode>("single");
  const [usageStartDate, setUsageStartDate] = useState("");
  const [usageEndDate, setUsageEndDate] = useState("");
  const [report, setReport] = useState<KitchenMaterialUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedIngredientIds, setExpandedIngredientIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    let active = true;
    setStocktakeDatesLoading(true);
    void loadStocktakeDates()
      .then((dates) => {
        if (!active) return;
        const sortedDates = [...dates].sort((left, right) =>
          right.date.localeCompare(left.date),
        );
        setStocktakeDates(sortedDates);
        setStocktakeDate((current) =>
          current && sortedDates.some((item) => item.date === current) ? current : "",
        );
      })
      .catch(() => {
        if (active) setStocktakeDates([]);
      })
      .finally(() => {
        if (active) setStocktakeDatesLoading(false);
      });
    return () => { active = false; };
  }, [loadStocktakeDates]);

  useEffect(() => {
    let active = true;
    setError(null);
    const hasUsageDates = usageMode === "single"
      ? Boolean(usageStartDate)
      : Boolean(usageStartDate && usageEndDate);

    if (!stocktakeDate || !hasUsageDates) {
      setReport(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void loadReport({ stocktakeDate, usageStartDate, usageEndDate })
      .then((nextReport) => {
        if (active) {
          setReport(nextReport);
          setExpandedIngredientIds(new Set());
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "material_usage_load_failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadReport, refreshKey, stocktakeDate, usageEndDate, usageMode, usageStartDate]);

  const changeUsageStartDate = (nextStartDate: string) => {
    setUsageStartDate(nextStartDate);
    setUsageEndDate((currentEndDate) =>
      !nextStartDate || !currentEndDate || currentEndDate < nextStartDate
        ? nextStartDate && currentEndDate ? nextStartDate : ""
        : currentEndDate,
    );
  };

  const changeUsageSingleDate = (nextDate: string) => {
    setUsageStartDate(nextDate);
    setUsageEndDate(nextDate);
  };

  const changeUsageMode = (nextMode: UsageMode) => {
    setUsageMode(nextMode);
    if (nextMode === "single") setUsageEndDate(usageStartDate);
  };

  const endDate = usageStartDate && usageEndDate && usageEndDate < usageStartDate
    ? usageStartDate
    : usageEndDate;
  const hasUsageDates = usageMode === "single"
    ? Boolean(usageStartDate)
    : Boolean(usageStartDate && usageEndDate);
  const canShowReport = Boolean(stocktakeDate && hasUsageDates);
  const rows = report?.rows.filter((row) => row.details.length > 0) ?? [];
  const toggleIngredientDetails = (ingredientId: string) => {
    setExpandedIngredientIds((current) => {
      const next = new Set(current);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  return (
    <section className="ingredients-page kitchen-material-usage-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t("kitchenMaterialUsage.title")}</h1>
          <p>{t("kitchenMaterialUsage.description")}</p>
        </div>
      </header>

      <article className="panel ingredients-panel kitchen-material-usage-panel">
        <div className="kitchen-material-usage-toolbar">
          <label className="kitchen-material-usage-field">
            <span>{t("kitchenMaterialUsage.stocktakeRecord")}</span>
            <select
              aria-label={t("kitchenMaterialUsage.stocktakeRecord")}
              value={stocktakeDate}
              disabled={stocktakeDatesLoading}
              onChange={(event) => setStocktakeDate(event.target.value)}
            >
              <option value="" disabled>
                {stocktakeDates.length
                  ? t("kitchenMaterialUsage.selectStocktakeRecord")
                  : t("kitchenMaterialUsage.noStocktakeRecords")}
              </option>
              {stocktakeDates.map((item) => (
                <option key={item.date} value={item.date}>
                  {item.date.split("-").reverse().join("/")} {t("kitchenMaterialUsage.stocktakeSuffix")}
                </option>
              ))}
            </select>
          </label>
          <label className="kitchen-material-usage-field">
            <span>{t("kitchenMaterialUsage.usageMode")}</span>
            <select
              aria-label={t("kitchenMaterialUsage.usageMode")}
              value={usageMode}
              onChange={(event) => changeUsageMode(event.target.value as UsageMode)}
            >
              <option value="single">{t("kitchenMaterialUsage.usageModeSingle")}</option>
              <option value="range">{t("kitchenMaterialUsage.usageModeRange")}</option>
            </select>
          </label>
          {usageMode === "single" ? (
            <DatePicker
              id="kitchen-material-usage-single-date"
              value={usageStartDate}
              label={t("kitchenMaterialUsage.usageDate")}
              onChange={changeUsageSingleDate}
            />
          ) : (
            <DateRangePicker
              className="kitchen-material-usage-range"
              startId="kitchen-material-usage-range-start"
              endId="kitchen-material-usage-range-end"
              startValue={usageStartDate}
              endValue={endDate}
              startLabel={t("kitchenMaterialUsage.usageStartDate")}
              endLabel={t("kitchenMaterialUsage.usageEndDate")}
              legend={t("kitchenMaterialUsage.usageDateRange")}
              onStartChange={changeUsageStartDate}
              onEndChange={setUsageEndDate}
            />
          )}
        </div>

        {error ? (
          <div className="products-state products-state-error">
            <Scale />
            <div><strong>{t("kitchenMaterialUsage.loadError")}</strong><span>{t("kitchenMaterialUsage.loadErrorDescription")}</span></div>
            <Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw />{t("kitchenMaterialUsage.retry")}</Button>
          </div>
        ) : !canShowReport ? (
          <div className="products-state products-state-empty">
            <Scale />
            <div><strong>{t("kitchenMaterialUsage.selectFilters")}</strong><span>{t("kitchenMaterialUsage.selectFiltersDescription")}</span></div>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Scale />
            <div><strong>{t("kitchenMaterialUsage.empty")}</strong><span>{t("kitchenMaterialUsage.emptyDescription")}</span></div>
          </div>
        ) : (
          <ListTable
            className="kitchen-material-usage-table-wrap"
            tableClassName="kitchen-material-usage-table"
            loading={loading}
            loadingLabel={t("kitchenMaterialUsage.loading")}
            skeletonRows={8}
            skeletonColumns={SKELETON_COLUMNS}
            header={<tr><th>{t("kitchenMaterialUsage.columns.ingredient")}</th><th>{t("kitchenMaterialUsage.columns.stocktake")}</th><th>{t("kitchenMaterialUsage.columns.foodPortions")}</th><th>{t("kitchenMaterialUsage.columns.ingredientConsumption")}</th><th>{t("kitchenMaterialUsage.columns.totalUsage")}</th><th>{t("kitchenMaterialUsage.columns.difference")}</th></tr>}
          >
            {rows.flatMap((row) => {
              const expanded = expandedIngredientIds.has(row.ingredientId);
              const visibleDetails = expanded ? row.details : row.details.slice(0, 1);
              const hiddenDetailCount = row.details.length - visibleDetails.length;

              return visibleDetails.map((detail, detailIndex) => (
              <tr className="kitchen-material-usage-detail" key={detail.id}>
                {detailIndex === 0 ? (
                  <>
                    <td rowSpan={visibleDetails.length}><strong>{row.ingredientName}</strong>{row.ingredientSku ? <span className="kitchen-material-usage-sku">{row.ingredientSku}</span> : null}</td>
                    <td rowSpan={visibleDetails.length}>{formatQuantity(row.stocktakeQuantity, row.unit)}</td>
                  </>
                ) : null}
                {expanded ? (
                <>
                <td>
                  <strong>{detail.productName || t("kitchenMaterialUsage.unknownProduct")}</strong>
                  {detail.productSku ? <span>{detail.productSku}</span> : null}
                  <span>{t("kitchenMaterialUsage.detailMeta", { date: formatHongKongDateTime(detail.deliveryAt), order: detail.orderId || "—" })}</span>
                  <span className="kitchen-material-usage-portion">{formatQuantity(detail.productQuantity, t("kitchenMaterialUsage.portionUnit"))}</span>
                  {detailIndex === 0 && hiddenDetailCount > 0 ? (
                    <button
                      type="button"
                      className="kitchen-material-usage-more"
                      aria-expanded={expanded}
                      onClick={() => toggleIngredientDetails(row.ingredientId)}
                    >
                      {t("suppliers.more")} ({hiddenDetailCount})
                    </button>
                  ) : null}
                </td>
                <td>{formatQuantity(detail.quantity, row.unit)}</td>
                </>
                ) : (
                  <td colSpan={2} className="kitchen-material-usage-more-cell">
                    <button
                      type="button"
                      className="kitchen-material-usage-more"
                      aria-expanded={false}
                      onClick={() => toggleIngredientDetails(row.ingredientId)}
                    >
                      顯示更多
                    </button>
                  </td>
                )}
                {detailIndex === 0 ? (
                  <>
                    <td rowSpan={visibleDetails.length}>{formatQuantity(row.estimatedUsage, row.unit)}</td>
                    <td rowSpan={visibleDetails.length} className={typeof row.difference === "number" && row.difference < 0 ? "kitchen-material-usage-negative" : ""}>{formatQuantity(row.difference, row.unit)}</td>
                  </>
                ) : null}
              </tr>
              ));
            })}
          </ListTable>
        )}
      </article>
    </section>
  );
}
