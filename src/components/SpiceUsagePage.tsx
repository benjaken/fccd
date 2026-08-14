import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Leaf, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import {
  fetchSeasonings,
  fetchSeasoningUsages,
  filterSeasoningUsages,
  unapplySeasoningUsage,
  type SeasoningOption,
  type SeasoningUsageRow,
} from "@/lib/spice-usage";

type SeasoningsLoader = () => Promise<SeasoningOption[]>;
type UsagesLoader = (seasoningId: string) => Promise<SeasoningUsageRow[]>;
type UsageDeleter = typeof unapplySeasoningUsage;

const SIDEBAR_SKELETON_ROWS = 10;
const SPICE_USAGE_SKELETON_COLUMNS = [
  { width: "10rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "2.5rem", variant: "action" as const },
];

function SpiceUsageSidebarSkeleton() {
  return (
    <ul className="spice-usage-side-list" aria-hidden="true">
      {Array.from({ length: SIDEBAR_SKELETON_ROWS }, (_, index) => (
        <li key={`spice-side-skeleton-${index}`}>
          <span className="spice-usage-side-item is-skeleton">
            <span
              className="table-skeleton-bone spice-usage-skeleton-side"
              style={{ width: `${58 + ((index * 13) % 28)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SpiceUsagePage({
  loadSeasonings = fetchSeasonings,
  loadUsages = fetchSeasoningUsages,
  deleteUsage = unapplySeasoningUsage,
}: {
  loadSeasonings?: SeasoningsLoader;
  loadUsages?: UsagesLoader;
  deleteUsage?: UsageDeleter;
}) {
  const { t, i18n } = useTranslation();
  const [seasonings, setSeasonings] = useState<SeasoningOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [usages, setUsages] = useState<SeasoningUsageRow[]>([]);
  const [seasoningsLoading, setSeasoningsLoading] = useState(true);
  const [usagesLoading, setUsagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selected =
    seasonings.find((item) => item.id === selectedId) ?? seasonings[0] ?? null;

  const visibleUsages = useMemo(
    () => filterSeasoningUsages(usages, appliedSearch),
    [appliedSearch, usages],
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

  const gramsFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );

  const usageSummary = useMemo(() => {
    let grams = 0;
    let cost = 0;
    for (const row of usages) {
      grams += row.quantityGrams;
      cost += row.totalCost;
    }
    return { count: usages.length, grams, cost };
  }, [usages]);

  useEffect(() => {
    let cancelled = false;
    setSeasoningsLoading(true);
    setError(null);

    void loadSeasonings()
      .then((rows) => {
        if (cancelled) return;
        setSeasonings(rows);
        setSelectedId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          return rows[0]?.id ?? null;
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("spiceUsage.loadError"),
        );
        setSeasonings([]);
        setSelectedId(null);
      })
      .finally(() => {
        if (!cancelled) setSeasoningsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadSeasonings, reloadKey, t]);

  useEffect(() => {
    setDraftSearch("");
    setAppliedSearch("");
    setActionError(null);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      setUsages([]);
      setUsagesLoading(false);
      return;
    }

    let cancelled = false;
    setUsagesLoading(true);
    setError(null);

    void loadUsages(selected.id)
      .then((rows) => {
        if (cancelled) return;
        setUsages(rows);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("spiceUsage.loadError"),
        );
        setUsages([]);
      })
      .finally(() => {
        if (!cancelled) setUsagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadUsages, reloadKey, selected?.id, t]);

  const selectSpice = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setUsagesLoading(true);
    setDraftSearch("");
    setAppliedSearch("");
    setActionError(null);
  };

  const handleDelete = useEffectEvent(async (row: SeasoningUsageRow) => {
    if (deletingId) return;
    const confirmed = window.confirm(t("spiceUsage.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteUsage(row.id);
      setUsages((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("spiceUsage.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  });

  const loading = seasoningsLoading || usagesLoading;

  return (
    <section className="spice-usage-page">
      <header className="page-heading spice-usage-heading">
        <div>
          <span className="eyebrow">{t("spiceUsage.eyebrow")}</span>
          <h1>{t("spiceUsage.title")}</h1>
        </div>
        <div className="heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw />
            {t("spiceUsage.refresh")}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="products-state products-state-error">
          <div>
            <strong>{t("spiceUsage.loadError")}</strong>
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {t("spiceUsage.retry")}
          </Button>
        </div>
      ) : (
        <div className="spice-usage-layout">
          <aside
            className="spice-usage-sidebar panel"
            aria-label={t("spiceUsage.tags")}
          >
            <div className="spice-usage-sidebar-header">
              <strong>{t("spiceUsage.tags")}</strong>
              <span>{seasonings.length}</span>
            </div>
            {seasoningsLoading ? (
              <>
                <span className="sr-only" role="status">
                  {t("spiceUsage.loadingSeasonings")}
                </span>
                <SpiceUsageSidebarSkeleton />
              </>
            ) : seasonings.length === 0 ? (
              <p className="spice-usage-sidebar-state">
                {t("spiceUsage.emptySeasonings")}
              </p>
            ) : (
              <ul className="spice-usage-side-list">
                {seasonings.map((item) => {
                  const active = item.id === selected?.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          active
                            ? "spice-usage-side-item active"
                            : "spice-usage-side-item"
                        }
                        aria-current={active ? "true" : undefined}
                        onClick={() => selectSpice(item.id)}
                      >
                        {item.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <article
            className="spice-usage-main panel"
            aria-busy={usagesLoading || undefined}
          >
            {!selected ? (
              <div className="spice-usage-main-empty">
                <Leaf />
                <strong>{t("spiceUsage.noSelection")}</strong>
                <span>{t("spiceUsage.noSelectionDescription")}</span>
              </div>
            ) : (
              <>
                <header className="spice-usage-main-header">
                  <div className="spice-usage-main-title">
                    <p className="spice-usage-main-eyebrow">
                      {t("spiceUsage.columns.spice")}
                    </p>
                    <h3>{selected.name}</h3>
                  </div>
                  <div className="spice-usage-summary">
                    <div>
                      <span>{t("spiceUsage.summary.recipes")}</span>
                      <strong>
                        {usagesLoading ? (
                          <span className="table-skeleton-bone spice-usage-skeleton-value" />
                        ) : (
                          usageSummary.count
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>{t("spiceUsage.summary.grams")}</span>
                      <strong>
                        {usagesLoading ? (
                          <span className="table-skeleton-bone spice-usage-skeleton-value" />
                        ) : (
                          `${gramsFormatter.format(usageSummary.grams)}g`
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>{t("spiceUsage.summary.cost")}</span>
                      <strong>
                        {usagesLoading ? (
                          <span className="table-skeleton-bone spice-usage-skeleton-value" />
                        ) : (
                          currencyFormatter.format(usageSummary.cost)
                        )}
                      </strong>
                    </div>
                  </div>
                </header>

                <header className="spice-usage-toolbar">
                  <ListSearchBar
                    id="spice-usage-search"
                    value={draftSearch}
                    onChange={setDraftSearch}
                    onSubmit={() => setAppliedSearch(draftSearch.trim())}
                    label={t("spiceUsage.search")}
                    placeholder={t("spiceUsage.searchPlaceholder")}
                    submitLabel={t("spiceUsage.searchAction")}
                    disabled={usagesLoading}
                  />
                </header>

                <div className="spice-usage-main-body">
                  {actionError ? (
                    <p className="list-inline-error">{actionError}</p>
                  ) : null}

                  <ListTable
                    className="spice-usage-table-wrap"
                    onRefresh={() => setReloadKey((current) => current + 1)}
                    loading={usagesLoading}
                    loadingLabel={t("spiceUsage.loadingUsages")}
                    skeletonRows={8}
                    skeletonColumns={SPICE_USAGE_SKELETON_COLUMNS}
                    header={
                      <tr>
                        <th>{t("spiceUsage.columns.recipe")}</th>
                        <th>{t("spiceUsage.columns.grams")}</th>
                        <th>{t("spiceUsage.columns.cost")}</th>
                        <th aria-label={t("spiceUsage.columns.actions")} />
                      </tr>
                    }
                  >
                    {visibleUsages.map((usage) => (
                      <tr key={usage.id}>
                        <td>
                          <strong>{usage.preparedMeatName}</strong>
                        </td>
                        <td>
                          {gramsFormatter.format(usage.quantityGrams)}g
                        </td>
                        <td>{currencyFormatter.format(usage.totalCost)}</td>
                        <td className="table-actions-cell">
                          <div className="table-row-actions">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={deletingId === usage.id}
                              aria-label={t("spiceUsage.delete")}
                              title={t("spiceUsage.delete")}
                              onClick={() => {
                                void handleDelete(usage);
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </ListTable>

                  {!usagesLoading && usages.length === 0 ? (
                    <div className="spice-usage-body-empty">
                      <Leaf />
                      <strong>{t("spiceUsage.emptyUsages")}</strong>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
