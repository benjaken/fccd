import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchProductChannels,
  fetchProductCollections,
  fetchProductTypes,
  type CatalogOption,
} from "@/lib/products";
import {
  fetchKitchenProductSalesPackages,
  fetchKitchenProductSalesReport,
  type KitchenProductSalesFilters,
  type KitchenProductSalesPackageRow,
  type KitchenProductSalesRow,
} from "@/lib/kitchen-product-sales-report";

const PAGE_SIZE = 12;
const SKELETON_COLUMNS = [
  { width: "18rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "10rem" },
  { width: "6rem" },
  { width: "8rem" },
];

const quantityFormatter = new Intl.NumberFormat("zh-HK", {
  maximumFractionDigits: 3,
});
const moneyFormatter = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0,
});

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthToToday() {
  const now = new Date();
  return {
    startDate: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: formatDate(now),
  };
}

function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

function formatMoney(value: number) {
  return moneyFormatter.format(value).replace("HK$", "$");
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: CatalogOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="kitchen-product-sales-filter-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuantitySortButton({
  direction,
  onChange,
}: {
  direction: "asc" | "desc";
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="kitchen-product-sales-sort-button"
      aria-label={`數量排序，目前${direction === "desc" ? "由多至少" : "由少至多"}`}
      onClick={onChange}
    >
      <span>數量</span>
      {direction === "desc" ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
    </button>
  );
}

function PackageSummary({ rows }: { rows: KitchenProductSalesPackageRow[] }) {
  return (
    <section className="panel kitchen-product-sales-package-card">
      <header>
        <h2>套餐</h2>
        <span>數量</span>
        <span>總金額</span>
      </header>
      {rows.length ? (
        <table className="kitchen-product-sales-package-table">
          <thead className="sr-only">
            <tr>
              <th scope="col">套餐</th>
              <th scope="col">數量</th>
              <th scope="col">總金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.packageId}>
                <th scope="row">
                  <strong>{row.packageName}</strong>
                  {row.sku ? (
                    <small>
                      <DetailLink className="order-link kitchen-product-sales-sku-link" to={`/products/packages/${row.packageId}`}>
                        {row.sku}
                      </DetailLink>
                    </small>
                  ) : null}
                </th>
                <td>{formatQuantity(row.quantity)}</td>
                <td>{formatMoney(row.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="kitchen-product-sales-summary-empty">目前沒有套餐銷售資料</p>
      )}
    </section>
  );
}

function CategorySummary({
  rows,
  packageRows,
}: {
  rows: KitchenProductSalesRow[];
  packageRows: KitchenProductSalesPackageRow[];
}) {
  const categories = useMemo(() => {
    const grouped = new Map<string, { key: string; name: string; quantity: number }>();
    for (const row of rows) {
      const key = `${row.brandName}\u0000${row.categoryName}`;
      const current = grouped.get(key);
      grouped.set(key, {
        key,
        name: row.categoryName,
        quantity: (current?.quantity ?? 0) + 1,
      });
    }
    return [...grouped.values()]
      .sort((left, right) => right.quantity - left.quantity || left.key.localeCompare(right.key, "zh-HK"));
  }, [rows]);

  return (
    <aside className="kitchen-product-sales-summary" aria-label="類別銷售統計">
      <section className="panel kitchen-product-sales-summary-card">
        <header>
          <h2>類別</h2>
          <span>數量</span>
        </header>
        {categories.length ? (
          <table className="kitchen-product-sales-summary-table">
            <thead className="sr-only">
              <tr>
                <th scope="col">類別</th>
                <th scope="col">數量</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.key}>
                  <th scope="row">{category.name}</th>
                  <td>{formatQuantity(category.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="kitchen-product-sales-summary-empty">目前沒有類別銷售資料</p>
        )}
      </section>
      <PackageSummary rows={packageRows} />
    </aside>
  );
}

export function KitchenProductSalesReportPage() {
  const range = useMemo(currentMonthToToday, []);
  const [startDate, setStartDate] = useState(range.startDate);
  const [endDate, setEndDate] = useState(range.endDate);
  const [brandId, setBrandId] = useState("");
  const [productTypeName, setProductTypeName] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [brands, setBrands] = useState<CatalogOption[]>([]);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [collections, setCollections] = useState<CatalogOption[]>([]);
  const [rows, setRows] = useState<KitchenProductSalesRow[] | null>(null);
  const [packageRows, setPackageRows] = useState<KitchenProductSalesPackageRow[]>([]);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    setOptionsError(null);
    void Promise.all([
      fetchProductChannels(),
      fetchProductTypes(),
      fetchProductCollections(),
    ])
      .then(([nextBrands, nextCategories, nextCollections]) => {
        if (!active) return;
        setBrands(nextBrands);
        setCategories(nextCategories);
        setCollections(nextCollections);
      })
      .catch((loadError) => {
        if (active) {
          setOptionsError(loadError instanceof Error ? loadError.message : "篩選選項載入失敗");
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    if (!startDate || !endDate || startDate > endDate) {
      setRows([]);
      setPackageRows([]);
      setLoading(false);
      setError("請選擇有效的日期範圍");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    const filters: KitchenProductSalesFilters = {
      startDate,
      endDate,
      brandId,
      productTypeName,
      collectionId,
    };
    void Promise.all([
      fetchKitchenProductSalesReport(filters),
      fetchKitchenProductSalesPackages(filters),
    ])
      .then(([nextRows, nextPackageRows]) => {
        if (!active) return;
        setRows(nextRows);
        setPackageRows(nextPackageRows);
      })
      .catch((loadError) => {
        if (active) {
          setRows([]);
          setPackageRows([]);
          setError(loadError instanceof Error ? loadError.message : "產品銷售報表載入失敗");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [brandId, collectionId, endDate, productTypeName, reloadKey, startDate]);

  const sortedRows = useMemo(() => {
    const nextRows = [...(rows ?? [])];
    nextRows.sort(
      (left, right) =>
        (sortDirection === "desc" ? right.quantity - left.quantity : left.quantity - right.quantity) ||
        left.productName.localeCompare(right.productName, "zh-HK"),
    );
    return nextRows;
  }, [rows, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const pageStart = sortedRows.length ? (visiblePage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(visiblePage * PAGE_SIZE, sortedRows.length);

  useEffect(() => {
    setPage(1);
  }, [brandId, collectionId, endDate, productTypeName, sortDirection, startDate]);

  const onRefresh = () => setReloadKey((value) => value + 1);

  return (
    <div className="kitchen-product-sales-page kitchen-sales-cost-report-page">
      <header className="page-heading kitchen-sales-cost-page-heading">
        <div>
          <span className="eyebrow">中央廚房報表</span>
          <h1>產品銷售</h1>
        </div>
      </header>

      <nav className="report-tabs kitchen-sales-cost-tabs" aria-label="中央廚房報表分類">
        <Link to="/reports/kitchen">所有銷售及成本</Link>
        <Link to="/reports/kitchen/channel-sales">渠道銷售</Link>
        <Link className="active" to="/reports/kitchen/product-sales">產品銷售</Link>
        <button disabled type="button">訂單明細報表</button>
        <Link to="/reports/kitchen/advertising-performance">廣告表現</Link>
      </nav>

      <section className="panel kitchen-product-sales-filters" aria-label="產品銷售篩選">
        <FilterSelect label="品牌" value={brandId} options={brands} onChange={setBrandId} disabled={optionsLoading} />
        <FilterSelect label="類別" value={productTypeName} options={categories} onChange={setProductTypeName} disabled={optionsLoading} />
        <FilterSelect label="產品集" value={collectionId} options={collections} onChange={setCollectionId} disabled={optionsLoading} />
        <DateRangePicker
          className="kitchen-product-sales-date-range"
          startId="kitchen-product-sales-start-date"
          endId="kitchen-product-sales-end-date"
          startValue={startDate}
          endValue={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          startLabel="開始日期"
          endLabel="結束日期"
          legend="日期範圍"
          allowOutOfOrder
          disabled={loading}
        />
        <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw aria-hidden="true" />
          重新整理
        </Button>
      </section>

      {optionsError ? (
        <section className="panel kitchen-product-sales-error" role="alert">
          <strong>篩選選項載入失敗</strong>
          <span>{optionsError}</span>
        </section>
      ) : null}
      {error ? (
        <section className="panel kitchen-product-sales-error" role="alert">
          <strong>產品銷售報表載入失敗</strong>
          <span>{error}</span>
          <Button type="button" variant="outline" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            重試
          </Button>
        </section>
      ) : null}

      {!error && !loading && rows?.length === 0 ? (
        <section className="panel kitchen-product-sales-empty">
          <strong>目前沒有符合條件的產品銷售資料</strong>
          <span>請調整品牌、類別、產品集或日期範圍後再試。</span>
        </section>
      ) : null}

      {!error && (loading || Boolean(rows?.length)) ? (
        <div className="kitchen-product-sales-layout">
          <section className="panel kitchen-product-sales-table-card">
            <ListTable
              className="kitchen-product-sales-table-wrap"
              tableClassName="kitchen-product-sales-table"
              loading={loading || rows === null}
              loadingLabel="正在載入產品銷售報表"
              skeletonRows={PAGE_SIZE}
              skeletonColumns={SKELETON_COLUMNS}
              header={
                <tr>
                  <th scope="col">單點產品 ({sortedRows.length})</th>
                  <th scope="col">品牌</th>
                  <th scope="col">類別</th>
                  <th scope="col">產品集</th>
                  <th scope="col" className="is-number">
                    <QuantitySortButton
                      direction={sortDirection}
                      onChange={() => setSortDirection((current) => current === "desc" ? "asc" : "desc")}
                    />
                  </th>
                  <th scope="col" className="is-number">總金額</th>
                </tr>
              }
            >
              {pageRows.map((row) => (
                <tr key={row.productId}>
                  <td>
                    <div className="kitchen-product-sales-product-cell">
                      <strong>{row.productName}</strong>
                      {row.sku ? (
                        <span>
                          <DetailLink className="order-link kitchen-product-sales-sku-link" to={`/products/${row.productId}`}>
                            {row.sku}
                          </DetailLink>
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>{row.brandName}</td>
                  <td>{row.categoryName}</td>
                  <td>{row.productSetName}</td>
                  <td className="is-number kitchen-product-sales-quantity">{formatQuantity(row.quantity)}</td>
                  <td className="is-number kitchen-product-sales-amount">{formatMoney(row.totalAmount)}</td>
                </tr>
              ))}
            </ListTable>
            {rows?.length ? (
              <TablePagination
                summary={`顯示 ${pageStart}–${pageEnd} 筆，共 ${sortedRows.length} 筆`}
                page={visiblePage}
                totalPages={totalPages}
                loading={loading}
                onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
                previousLabel="上一頁"
                nextLabel="下一頁"
                pageLabel="/"
                jumpLabel="跳至頁數"
                onPageChange={setPage}
              />
            ) : null}
          </section>
          <CategorySummary rows={sortedRows} packageRows={packageRows} />
        </div>
      ) : null}
    </div>
  );
}
