import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchMeatYieldErrors,
  MEAT_YIELD_ERRORS_PAGE_SIZE,
  type MeatYieldErrorListFilters,
  type MeatYieldErrorListResult,
  type MeatYieldErrorRow,
} from "@/lib/meat-yield-errors";

type ErrorsLoader = (
  filters: MeatYieldErrorListFilters,
) => Promise<MeatYieldErrorListResult>;

const ERROR_SKELETON_COLUMNS = [
  { width: "6rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "5rem" },
  { width: "5rem" },
  { width: "5rem" },
  { width: "5rem" },
  { width: "4.5rem" },
  { width: "4rem" },
];

export function MeatYieldErrorsPage({
  loadErrors = fetchMeatYieldErrors,
}: {
  loadErrors?: ErrorsLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<MeatYieldErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / MEAT_YIELD_ERRORS_PAGE_SIZE));
  const visibleFrom =
    total === 0 ? 0 : (page - 1) * MEAT_YIELD_ERRORS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * MEAT_YIELD_ERRORS_PAGE_SIZE, total);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "zh-HK" ? "en-GB" : i18n.language, {
        timeZone: "Asia/Hong_Kong",
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }),
    [i18n.language],
  );
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "percent",
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  );

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const formatDate = (value: string | null) => {
    if (!value) return t("common.notSet");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("common.notSet");
    return dateFormatter.format(date);
  };

  const formatNumber = (value: number | null) => {
    if (value === null) return t("common.notSet");
    return numberFormatter.format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return t("common.notSet");
    return percentFormatter.format(value);
  };

  const formatDirection = (value: MeatYieldErrorRow["deviationDirection"]) => {
    if (value === "over") return t("yieldErrors.over");
    if (value === "under") return t("yieldErrors.under");
    return t("common.notSet");
  };

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadErrors({ page, search: appliedSearch })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("yieldErrors.loadError"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedSearch, loadErrors, page, reloadKey, t]);

  const reload = () => setReloadKey((current) => current + 1);

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
    setPage(1);
  };

  return (
    <section className="meat-customers-page meat-yield-errors-page">
      <header className="page-heading meat-customers-heading">
        <div>
          <span className="eyebrow">{t("yieldErrors.eyebrow")}</span>
          <h1>{t("yieldErrors.title")}</h1>
        </div>
      </header>

      <article className="panel meat-customers-panel">
        <header className="meat-customers-toolbar">
          <ListSearchBar
            id="meat-yield-errors-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("yieldErrors.search")}
            placeholder={t("yieldErrors.searchPlaceholder")}
            submitLabel={t("yieldErrors.searchAction")}
          />
        </header>

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("yieldErrors.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button type="button" variant="outline" onClick={reload}>
              {t("yieldErrors.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <TriangleAlert />
            <div>
              <strong>{t("yieldErrors.empty")}</strong>
              <span>{t("yieldErrors.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <>
            <ListTable
              className="meat-customers-table-wrap"
              onRefresh={reload}
              loading={loading}
              loadingLabel={t("yieldErrors.loading")}
              skeletonColumns={ERROR_SKELETON_COLUMNS}
              header={
                <tr>
                  <th>{t("yieldErrors.columns.date")}</th>
                  <th>{t("yieldErrors.columns.rawMeat")}</th>
                  <th>{t("yieldErrors.columns.preparedMeat")}</th>
                  <th>{t("yieldErrors.columns.rawInputKg")}</th>
                  <th>{t("yieldErrors.columns.expectedPacks")}</th>
                  <th>{t("yieldErrors.columns.actualPacks")}</th>
                  <th>{t("yieldErrors.columns.deviationPacks")}</th>
                  <th>{t("yieldErrors.columns.deviationPercent")}</th>
                  <th>{t("yieldErrors.columns.direction")}</th>
                </tr>
              }
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.productionAt)}</td>
                  <td>{display(row.rawMeatName)}</td>
                  <td>
                    <strong>{display(row.preparedMeatName)}</strong>
                  </td>
                  <td>{formatNumber(row.rawInputKg)}</td>
                  <td>{formatNumber(row.expectedPacks)}</td>
                  <td>{formatNumber(row.actualPacks)}</td>
                  <td>{formatNumber(row.deviationPacks)}</td>
                  <td>{formatPercent(row.deviationRatio)}</td>
                  <td>{formatDirection(row.deviationDirection)}</td>
                </tr>
              ))}
            </ListTable>
            <TablePagination
              summary={t("yieldErrors.pagination", {
                from: visibleFrom,
                to: visibleTo,
                total,
              })}
              page={page}
              totalPages={totalPages}
              loading={loading}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => current + 1)}
              onPageChange={setPage}
              previousLabel={t("yieldErrors.previous")}
              nextLabel={t("yieldErrors.next")}
              pageLabel={t("yieldErrors.pageOf")}
              jumpLabel={t("yieldErrors.jumpToPage")}
            />
          </>
        )}
      </article>
    </section>
  );
}
