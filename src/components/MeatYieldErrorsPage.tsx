import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { TablePagination } from "@/components/ui/table-pagination";
import { YIELD_ERROR_THRESHOLD_RATIO } from "@/lib/meat-yield";
import {
  fetchMeatYieldErrors,
  YIELD_ERRORS_PAGE_SIZE,
  type MeatYieldErrorDirection,
  type MeatYieldErrorListFilters,
  type MeatYieldErrorListItem,
  type MeatYieldErrorListResult,
} from "@/lib/meat-yield-errors";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import { cn } from "@/lib/utils";

type YieldErrorsLoader = (
  filters: MeatYieldErrorListFilters,
) => Promise<MeatYieldErrorListResult>;

const DIRECTION_FILTERS: Array<"" | MeatYieldErrorDirection> = [
  "",
  "over",
  "under",
];

const YIELD_ERROR_SKELETON_COLUMNS = [
  { width: "7rem" },
  { width: "10rem" },
  { width: "10rem" },
  { width: "5rem" },
  { width: "4.5rem" },
  { width: "4.5rem" },
  { width: "5rem" },
  { width: "4.5rem" },
  { width: "4.5rem", variant: "badge" as const },
  { width: "28%" },
];

export function MeatYieldErrorsPage({
  loadYieldErrors = fetchMeatYieldErrors,
}: {
  loadYieldErrors?: YieldErrorsLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | MeatYieldErrorDirection>("");
  const [page, setPage] = useState(1);
  const directionFilter = useDeferredFilter(direction, (value) => {
    setPage(1);
    setDirection(value);
  });
  const [items, setItems] = useState<MeatYieldErrorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / YIELD_ERRORS_PAGE_SIZE));
  const visibleFrom = total ? (page - 1) * YIELD_ERRORS_PAGE_SIZE + 1 : 0;
  const visibleTo = Math.min(page * YIELD_ERRORS_PAGE_SIZE, total);
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );
  const kg = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );
  const packs = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const signedPacks = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        signDisplay: "exceptZero",
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "percent",
        signDisplay: "exceptZero",
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadYieldErrors({ page, search, direction });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError("yield_errors_load_failed");
    } finally {
      setLoading(false);
    }
  }, [direction, loadYieldErrors, page, reloadKey, search]);

  useEffect(() => void load(), [load]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  return (
    <section className="orders-page yield-errors-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("yieldErrors.eyebrow")}</span>
          <h1>{t("yieldErrors.title")}</h1>
        </div>
      </header>
      <article className="panel orders-panel">
        <aside
          className="yield-errors-rules"
          aria-label={t("yieldErrors.rulesTitle")}
        >
          <p className="yield-errors-rules-title">
            {t("yieldErrors.rulesTitle")}
          </p>
          <p>{t("yieldErrors.ruleBudget")}</p>
          <p>
            {t("yieldErrors.ruleThreshold", {
              percent: Math.round(YIELD_ERROR_THRESHOLD_RATIO * 100),
            })}
          </p>
        </aside>
        <header className="orders-toolbar">
          <ListSearchBar
            id="yield-errors-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("yieldErrors.search")}
            placeholder={t("yieldErrors.searchPlaceholder")}
            submitLabel={t("yieldErrors.searchAction")}
            filtersActive={Boolean(direction)}
            onConfirmFilters={directionFilter.confirm}
            onDismissFilters={directionFilter.revert}
            filters={
              <label className="orders-status-filter" htmlFor="yield-errors-direction">
                <span>{t("yieldErrors.directionFilter")}</span>
                <select
                  id="yield-errors-direction"
                  value={directionFilter.value}
                  onChange={(event) => {
                    const next = event.target.value;
                    directionFilter.setValue(
                      next === "over" || next === "under" ? next : "",
                    );
                  }}
                >
                  {DIRECTION_FILTERS.map((value) => (
                    <option key={value || "all"} value={value}>
                      {value
                        ? t(`yieldErrors.direction.${value}`)
                        : t("yieldErrors.allDirections")}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>
        {error ? (
          <OperationalListState
            icon={AlertTriangle}
            title={t("yieldErrors.loadError")}
            description={t("yieldErrors.loadErrorDescription")}
            retryLabel={t("yieldErrors.retry")}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        ) : !loading && !items.length ? (
          <OperationalListState
            icon={AlertTriangle}
            title={t("yieldErrors.empty")}
            description={t("yieldErrors.emptyDescription")}
          />
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("yieldErrors.loading")}
            skeletonRows={YIELD_ERRORS_PAGE_SIZE}
            skeletonColumns={YIELD_ERROR_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("yieldErrors.columns.date")}</th>
                <th>{t("yieldErrors.columns.rawMeat")}</th>
                <th>{t("yieldErrors.columns.preparedMeat")}</th>
                <th>{t("yieldErrors.columns.rawKg")}</th>
                <th>{t("yieldErrors.columns.expectedPacks")}</th>
                <th>{t("yieldErrors.columns.actualPacks")}</th>
                <th>{t("yieldErrors.columns.deviationPacks")}</th>
                <th>{t("yieldErrors.columns.deviationPercent")}</th>
                <th>{t("yieldErrors.columns.direction")}</th>
                <th>{t("yieldErrors.columns.remarks")}</th>
              </tr>
            }
          >
            {items.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.productionAt
                    ? date.format(new Date(row.productionAt))
                    : t("common.notSet")}
                </td>
                <td>{row.rawMeatName || t("common.notSet")}</td>
                <td>{row.preparedMeatName || t("common.notSet")}</td>
                <td>{kg.format(row.rawInputKg)}</td>
                <td>
                  <strong>{packs.format(row.expectedPacks)}</strong>
                </td>
                <td>{packs.format(row.actualPacks)}</td>
                <td>{signedPacks.format(row.deviationPacks)}</td>
                <td>{percent.format(row.deviationRatio)}</td>
                <td>
                  <span
                    className={cn(
                      "status-badge",
                      row.direction === "over" ? "red" : "amber",
                    )}
                  >
                    {t(`yieldErrors.direction.${row.direction}`)}
                  </span>
                </td>
                <td>{row.remarks || t("common.notSet")}</td>
              </tr>
            ))}
          </ListTable>
        )}
        <TablePagination
          summary={t("yieldErrors.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
          })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => value + 1)}
          onPageChange={setPage}
          previousLabel={t("yieldErrors.previous")}
          nextLabel={t("yieldErrors.next")}
          pageLabel={t("yieldErrors.pageOf")}
          jumpLabel={t("yieldErrors.jumpToPage")}
        />
      </article>
    </section>
  );
}
