import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Receipt, Send } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import { FROZEN_ACTION_PERMISSION_KEYS } from "@/lib/frozen-action-permissions";
import { cn } from "@/lib/utils";
import {
  averageMonthlySupplyPrices,
  fetchSellingPriceCostRows,
  fetchSellingPriceRawMeatOptions,
  filterSellingPriceCostRows,
  formatSignedPercent,
  hongKongYearMonthKey,
  isHongKongYearMonth,
  pushSellingPriceMonthlyPrices,
  SELLING_PRICE_COST_PAGE_SIZE,
  type MonthlyMeatPricePushResult,
  type SellingPriceCostRow,
  type SellingPriceRawMeatOption,
} from "@/lib/selling-price-cost";

type OptionsLoader = () => Promise<SellingPriceRawMeatOption[]>;
type RowsLoader = (rawMeatItemId: string) => Promise<SellingPriceCostRow[]>;
type MonthlyPricesPusher = (
  rawMeatItemId: string,
  yearMonth: string,
) => Promise<MonthlyMeatPricePushResult>;

const SIDEBAR_SKELETON_ROWS = 10;
const SELLING_PRICE_COST_SKELETON_COLUMNS = [
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
  { width: "5.5rem" },
  { width: "5.5rem" },
  { width: "5.5rem" },
  { width: "5rem" },
  { width: "5rem" },
  { width: "5rem" },
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
  { width: "7rem" },
  { width: "5.5rem" },
];

function SellingPriceCostSidebarSkeleton() {
  return (
    <ul className="selling-price-cost-side-list" aria-hidden="true">
      {Array.from({ length: SIDEBAR_SKELETON_ROWS }, (_, index) => (
        <li key={`spc-side-skeleton-${index}`}>
          <span className="selling-price-cost-side-item is-skeleton">
            <span
              className="table-skeleton-bone selling-price-cost-skeleton-side"
              style={{ width: `${58 + ((index * 13) % 28)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function AmountWithRate({
  amount,
  rate,
  currencyFormatter,
  empty,
}: {
  amount: number | null;
  rate: number | null;
  currencyFormatter: Intl.NumberFormat;
  empty: string;
}) {
  if (amount === null) return <>{empty}</>;
  return (
    <span className="selling-price-cost-with-rate">
      <strong>{currencyFormatter.format(amount)}</strong>
      {rate !== null ? (
        <span className="selling-price-cost-rate-badge">
          ({formatSignedPercent(rate)})
        </span>
      ) : null}
    </span>
  );
}

export function SellingPriceCostPage({
  loadOptions = fetchSellingPriceRawMeatOptions,
  loadRows = fetchSellingPriceCostRows,
  pushMonthlyPrices = pushSellingPriceMonthlyPrices,
  canPush: canPushProp,
}: {
  loadOptions?: OptionsLoader;
  loadRows?: RowsLoader;
  pushMonthlyPrices?: MonthlyPricesPusher;
  canPush?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canPush =
    canPushProp ??
    pageAccess.canAccess(FROZEN_ACTION_PERMISSION_KEYS.sellingPriceCost.push);
  const [options, setOptions] = useState<SellingPriceRawMeatOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<SellingPriceCostRow[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pushing, setPushing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const monthFilterRef = useRef<HTMLDivElement>(null);

  const selected =
    options.find((item) => item.id === selectedId) ?? options[0] ?? null;
  const loading = optionsLoading || rowsLoading;

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        i18n.language === "zh-HK" ? "en-GB" : i18n.language,
        {
          month: "short",
          year: "2-digit",
          timeZone: "Asia/Hong_Kong",
        },
      ),
    [i18n.language],
  );

  const formatMonthLabel = useCallback(
    (value: string | null) => {
      if (!value) return t("common.notSet");
      return monthFormatter
        .format(new Date(value))
        .replace(" ", "-")
        .replace(",", "");
    },
    [monthFormatter, t],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const currencyFormatter = useMemo(
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

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const formatDate = useCallback(
    (value: string | null) =>
      value ? dateFormatter.format(new Date(value)) : t("common.notSet"),
    [dateFormatter, t],
  );

  const monthOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of rows) {
      if (!row.movementAt) continue;
      const key = hongKongYearMonthKey(row.movementAt);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, formatMonthLabel(row.movementAt));
    }
    return [...byKey.entries()]
      .sort((left, right) => (left[0] > right[0] ? -1 : 1))
      .map(([key, label]) => ({ key, label }));
  }, [formatMonthLabel, rows]);

  const visibleRows = useMemo(
    () =>
      filterSellingPriceCostRows(
        rows,
        appliedSearch,
        monthFilter,
        formatDate,
        formatMonthLabel,
      ),
    [appliedSearch, formatDate, formatMonthLabel, monthFilter, rows],
  );

  const total = visibleRows.length;
  const totalPages = Math.max(
    1,
    Math.ceil(total / SELLING_PRICE_COST_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleFrom =
    total === 0 ? 0 : (currentPage - 1) * SELLING_PRICE_COST_PAGE_SIZE + 1;
  const visibleTo = Math.min(
    currentPage * SELLING_PRICE_COST_PAGE_SIZE,
    total,
  );
  const pageRows = visibleRows.slice(
    (currentPage - 1) * SELLING_PRICE_COST_PAGE_SIZE,
    currentPage * SELLING_PRICE_COST_PAGE_SIZE,
  );

  const selectedMonthLabel =
    monthOptions.find((option) => option.key === monthFilter)?.label ??
    t("sellingPriceCost.columns.month");

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!monthMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!monthFilterRef.current?.contains(event.target as Node)) {
        setMonthMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMonthMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [monthMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setError(null);
    void loadOptions()
      .then((next) => {
        if (cancelled) return;
        setOptions(next);
        setSelectedId((current) => {
          if (current && next.some((item) => item.id === current)) return current;
          return next[0]?.id ?? null;
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("sellingPriceCost.loadError"),
        );
        setOptions([]);
        setSelectedId(null);
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOptions, reloadKey, t]);

  useEffect(() => {
    if (!selected?.id) {
      setRows([]);
      setRowsLoading(false);
      return;
    }

    let cancelled = false;
    setRowsLoading(true);
    setError(null);
    setPage(1);
    setMonthFilter(null);
    setMonthMenuOpen(false);
    setConfirmOpen(false);
    setPushMessage(null);
    setPushError(null);

    void loadRows(selected.id)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("sellingPriceCost.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setRowsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadRows, reloadKey, selected?.id, t]);

  const reload = () => setReloadKey((current) => current + 1);

  const monthRows = useMemo(
    () =>
      isHongKongYearMonth(monthFilter)
        ? filterSellingPriceCostRows(rows, "", monthFilter)
        : [],
    [monthFilter, rows],
  );
  const reportPreviewAverages = useMemo(
    () => averageMonthlySupplyPrices(monthRows),
    [monthRows],
  );
  const showSendButton =
    canPush && Boolean(selected?.id) && isHongKongYearMonth(monthFilter);

  const closeConfirm = () => {
    if (pushing) return;
    setConfirmOpen(false);
  };

  const pushSelectedMonth = async () => {
    if (!canPush || !selected?.id || !isHongKongYearMonth(monthFilter)) return;

    setPushing(true);
    setPushMessage(null);
    setPushError(null);
    try {
      const result = await pushMonthlyPrices(selected.id, monthFilter);
      if (result.status === "skipped_no_versions") {
        setPushMessage(t("sellingPriceCost.pushSkippedNoVersions"));
      } else if (result.status === "skipped_no_computable_rows") {
        setPushMessage(t("sellingPriceCost.pushSkippedNoRows"));
      } else if (result.status === "updated") {
        setPushMessage(
          t("sellingPriceCost.pushSuccess", { month: selectedMonthLabel }),
        );
      } else {
        setPushError(t("sellingPriceCost.pushError"));
      }
      setConfirmOpen(false);
    } catch (pushFailure: unknown) {
      setPushError(
        pushFailure instanceof Error
          ? pushFailure.message
          : t("sellingPriceCost.pushError"),
      );
    } finally {
      setPushing(false);
    }
  };

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
    setPage(1);
  };

  const formatNumber = (value: number | null) =>
    value === null ? t("common.notSet") : numberFormatter.format(value);

  const formatMoney = (value: number | null) =>
    value === null ? t("common.notSet") : currencyFormatter.format(value);

  return (
    <section className="selling-price-cost-page">
      <header className="page-heading selling-price-cost-heading">
        <div>
          <span className="eyebrow">{t("sellingPriceCost.eyebrow")}</span>
          <h1>{t("sellingPriceCost.title")}</h1>
        </div>
        {showSendButton ? (
          <div className="heading-actions">
            <Button
              type="button"
              disabled={pushing}
              onClick={() => {
                setPushMessage(null);
                setPushError(null);
                setConfirmOpen(true);
              }}
            >
              <Send />
              {t("sellingPriceCost.sendToReport")}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="selling-price-cost-layout">
        <aside
          className="selling-price-cost-sidebar panel"
          aria-label={t("sellingPriceCost.items")}
        >
          <div className="selling-price-cost-sidebar-header">
            <strong>{t("sellingPriceCost.items")}</strong>
            <span>{options.length}</span>
          </div>
          {optionsLoading ? (
            <>
              <span className="sr-only" role="status">
                {t("sellingPriceCost.loading")}
              </span>
              <SellingPriceCostSidebarSkeleton />
            </>
          ) : options.length === 0 ? (
            <p className="selling-price-cost-sidebar-state">
              {t("sellingPriceCost.emptyItems")}
            </p>
          ) : (
            <ul
              className="selling-price-cost-side-list"
              role="tablist"
              aria-label={t("sellingPriceCost.items")}
            >
              {options.map((item) => {
                const active = item.id === selected?.id;
                return (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      className={cn(
                        "selling-price-cost-side-item",
                        active && "is-active",
                      )}
                      aria-selected={active}
                      onClick={() => {
                        if (item.id === selectedId) return;
                        setSelectedId(item.id);
                        setRowsLoading(true);
                      }}
                    >
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <article className="panel selling-price-cost-panel">
          {pushError ? (
            <p className="list-inline-error">{pushError}</p>
          ) : pushMessage ? (
            <p className="list-inline-status" role="status">
              {pushMessage}
            </p>
          ) : null}
          <header className="selling-price-cost-toolbar">
          <ListSearchBar
            id="selling-price-cost-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("sellingPriceCost.search")}
            placeholder={t("sellingPriceCost.searchPlaceholder")}
            submitLabel={t("sellingPriceCost.searchAction")}
            disabled={loading}
          />
        </header>

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("sellingPriceCost.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button type="button" variant="outline" onClick={reload}>
              {t("sellingPriceCost.retry")}
            </Button>
          </div>
        ) : !loading && options.length === 0 ? (
          <div className="products-state products-state-empty">
            <Receipt />
            <div>
              <strong>{t("sellingPriceCost.emptyItems")}</strong>
              <span>{t("sellingPriceCost.emptyItemsDescription")}</span>
            </div>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Receipt />
            <div>
              <strong>{t("sellingPriceCost.emptyRows")}</strong>
              <span>{t("sellingPriceCost.emptyRowsDescription")}</span>
            </div>
          </div>
        ) : !loading && visibleRows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Receipt />
            <div>
              <strong>{t("sellingPriceCost.emptySearch")}</strong>
              <span>{t("sellingPriceCost.emptySearchDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="selling-price-cost-table-wrap"
            loading={loading}
            loadingLabel={t("sellingPriceCost.loading")}
            skeletonRows={SELLING_PRICE_COST_PAGE_SIZE}
            skeletonColumns={SELLING_PRICE_COST_SKELETON_COLUMNS}
            onRefresh={reload}
            header={
              <tr>
                <th>{t("sellingPriceCost.columns.date")}</th>
                <th>
                  <div
                    className="selling-price-cost-month-filter"
                    ref={monthFilterRef}
                  >
                    <button
                      type="button"
                      className="selling-price-cost-month-filter-button"
                      aria-haspopup="listbox"
                      aria-expanded={monthMenuOpen}
                      aria-label={t("sellingPriceCost.filterMonth")}
                      title={t("sellingPriceCost.filterMonth")}
                      disabled={loading || monthOptions.length === 0}
                      onClick={() => setMonthMenuOpen((open) => !open)}
                    >
                      <span>{selectedMonthLabel}</span>
                      <ChevronDown />
                    </button>
                    {monthMenuOpen ? (
                      <ul
                        className="selling-price-cost-month-menu"
                        role="listbox"
                        aria-label={t("sellingPriceCost.filterMonth")}
                      >
                        <li role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={monthFilter === null}
                            className={cn(
                              "selling-price-cost-month-option",
                              monthFilter === null && "is-active",
                            )}
                            onClick={() => {
                              setMonthFilter(null);
                              setMonthMenuOpen(false);
                              setPage(1);
                              setConfirmOpen(false);
                              setPushMessage(null);
                              setPushError(null);
                            }}
                          >
                            {t("sellingPriceCost.allMonths")}
                          </button>
                        </li>
                        {monthOptions.map((option) => (
                          <li key={option.key} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={monthFilter === option.key}
                              className={cn(
                                "selling-price-cost-month-option",
                                monthFilter === option.key && "is-active",
                              )}
                              onClick={() => {
                                setMonthFilter(option.key);
                                setMonthMenuOpen(false);
                                setPage(1);
                                setConfirmOpen(false);
                                setPushMessage(null);
                                setPushError(null);
                              }}
                            >
                              {option.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </th>
                <th>{t("sellingPriceCost.columns.product")}</th>
                <th>{t("sellingPriceCost.columns.rawMeatName")}</th>
                <th>{t("sellingPriceCost.columns.rawMeatWeight")}</th>
                <th>{t("sellingPriceCost.columns.inboundPrice")}</th>
                <th>{t("sellingPriceCost.columns.seasoningCode")}</th>
                <th>{t("sellingPriceCost.columns.seasoningPerKg")}</th>
                <th>{t("sellingPriceCost.columns.seasoningCost")}</th>
                <th>{t("sellingPriceCost.columns.yieldKg")}</th>
                <th>{t("sellingPriceCost.columns.yieldPercent")}</th>
                <th>{t("sellingPriceCost.columns.totalCost")}</th>
                <th>{t("sellingPriceCost.columns.yieldDifference")}</th>
                <th>{t("sellingPriceCost.columns.listPrice")}</th>
              </tr>
            }
          >
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.movementAt)}</td>
                <td>{formatMonthLabel(row.movementAt)}</td>
                <td>
                  <strong>{row.productName || t("common.notSet")}</strong>
                </td>
                <td>{row.rawMeatName || t("common.notSet")}</td>
                <td>{formatNumber(row.rawMeatWeightKg)}</td>
                <td>{formatMoney(row.inboundUnitPrice)}</td>
                <td>{row.seasoningCode || t("common.notSet")}</td>
                <td>{formatMoney(row.seasoningPerKg)}</td>
                <td>{formatMoney(row.seasoningCost)}</td>
                <td>{formatNumber(row.yieldKg)}</td>
                <td>
                  {row.yieldPercent === null
                    ? t("common.notSet")
                    : percentFormatter.format(row.yieldPercent)}
                </td>
                <td>
                  <AmountWithRate
                    amount={row.totalCost}
                    rate={row.markupRate}
                    currencyFormatter={currencyFormatter}
                    empty={t("common.notSet")}
                  />
                </td>
                <td>
                  <AmountWithRate
                    amount={row.yieldDifferencePerKg}
                    rate={row.variationRate}
                    currencyFormatter={currencyFormatter}
                    empty={t("common.notSet")}
                  />
                </td>
                <td>
                  <strong>{formatMoney(row.listPricePerKg)}</strong>
                </td>
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("sellingPriceCost.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
          })}
          page={currentPage}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() =>
            setPage((current) => Math.max(1, Math.min(current, totalPages) - 1))
          }
          onNext={() =>
            setPage((current) =>
              Math.min(totalPages, Math.min(current, totalPages) + 1),
            )
          }
          onPageChange={setPage}
          previousLabel={t("sellingPriceCost.previous")}
          nextLabel={t("sellingPriceCost.next")}
          pageLabel={t("sellingPriceCost.pageOf")}
          jumpLabel={t("sellingPriceCost.jumpToPage")}
        />
        </article>
      </div>

      <SidePanel
        open={confirmOpen}
        title={t("sellingPriceCost.confirmSendTitle")}
        description={t("sellingPriceCost.confirmSendDescription", {
          month: selectedMonthLabel,
        })}
        onClose={closeConfirm}
        closeLabel={t("sellingPriceCost.closePanel")}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={pushing}
              onClick={closeConfirm}
            >
              {t("sellingPriceCost.confirmCancel")}
            </Button>
            <Button
              type="button"
              disabled={pushing}
              onClick={() => {
                void pushSelectedMonth();
              }}
            >
              {pushing
                ? t("sellingPriceCost.sendingToReport")
                : t("sellingPriceCost.sendToReport")}
            </Button>
          </>
        }
      >
        <dl className="selling-price-cost-push-metrics">
          <div className="selling-price-cost-push-metric">
            <dt>
              <span>{t("sellingPriceCost.factoryPreviewTitle")}</span>
            </dt>
            <dd>
              <strong>{formatMoney(reportPreviewAverages?.roomPrice ?? null)}</strong>
            </dd>
          </div>
          <div className="selling-price-cost-push-metric">
            <dt>
              <span>{t("sellingPriceCost.shopPreviewTitle")}</span>
            </dt>
            <dd>
              <strong>{formatMoney(reportPreviewAverages?.shopPrice ?? null)}</strong>
            </dd>
          </div>
        </dl>
      </SidePanel>
    </section>
  );
}
