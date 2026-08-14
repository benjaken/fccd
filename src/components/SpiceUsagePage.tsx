import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Leaf, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchSeasonings,
  fetchSeasoningUsages,
  type SeasoningOption,
  type SeasoningUsageRow,
} from "@/lib/spice-usage";

type SeasoningsLoader = () => Promise<SeasoningOption[]>;
type UsagesLoader = (seasoningId: string) => Promise<SeasoningUsageRow[]>;

export function SpiceUsagePage({
  loadSeasonings = fetchSeasonings,
  loadUsages = fetchSeasoningUsages,
}: {
  loadSeasonings?: SeasoningsLoader;
  loadUsages?: UsagesLoader;
}) {
  const { t, i18n } = useTranslation();
  const [seasonings, setSeasonings] = useState<SeasoningOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [usages, setUsages] = useState<SeasoningUsageRow[]>([]);
  const [seasoningsLoading, setSeasoningsLoading] = useState(true);
  const [usagesLoading, setUsagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const selected =
    seasonings.find((item) => item.id === selectedId) ?? seasonings[0] ?? null;

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
            <p className="spice-usage-sidebar-state">
              {t("spiceUsage.loadingSeasonings")}
            </p>
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
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <article className="spice-usage-main panel">
          {!selected ? (
            <div className="spice-usage-main-empty">
              <Leaf />
              <strong>{t("spiceUsage.noSelection")}</strong>
              <span>{t("spiceUsage.noSelectionDescription")}</span>
            </div>
          ) : (
            <>
              <header className="spice-usage-main-header">
                <div>
                  <p className="spice-usage-main-eyebrow">
                    {t("spiceUsage.columns.spice")}
                  </p>
                  <h3>{selected.name}</h3>
                </div>
                {!usagesLoading && usages.length > 0 ? (
                  <div className="spice-usage-summary">
                    <div>
                      <span>{t("spiceUsage.summary.recipes")}</span>
                      <strong>{usageSummary.count}</strong>
                    </div>
                    <div>
                      <span>{t("spiceUsage.summary.grams")}</span>
                      <strong>
                        {gramsFormatter.format(usageSummary.grams)}g
                      </strong>
                    </div>
                    <div>
                      <span>{t("spiceUsage.summary.cost")}</span>
                      <strong>
                        {currencyFormatter.format(usageSummary.cost)}
                      </strong>
                    </div>
                  </div>
                ) : null}
              </header>

              <div className="spice-usage-main-body">
                {usagesLoading ? (
                  <p className="spice-usage-main-state">
                    {t("spiceUsage.loadingUsages")}
                  </p>
                ) : usages.length === 0 ? (
                  <div className="spice-usage-main-empty">
                    <Leaf />
                    <strong>{t("spiceUsage.emptyUsages")}</strong>
                  </div>
                ) : (
                  <div className="spice-usage-card-grid">
                    {usages.map((usage, index) => (
                      <article
                        key={usage.id}
                        className="spice-usage-card"
                        aria-label={`${index + 1}. ${usage.preparedMeatName}`}
                      >
                        <div className="spice-usage-card-index" aria-hidden="true">
                          {index + 1}
                        </div>
                        <div className="spice-usage-card-body">
                          <strong className="spice-usage-card-title">
                            {usage.preparedMeatName}
                          </strong>
                          <div className="spice-usage-card-metrics">
                            <span className="spice-usage-card-metric">
                              <small>{t("spiceUsage.metric.grams")}</small>
                              {gramsFormatter.format(usage.quantityGrams)}g
                            </span>
                            <span className="spice-usage-card-metric is-cost">
                              <small>{t("spiceUsage.metric.cost")}</small>
                              {currencyFormatter.format(usage.totalCost)}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </article>
      </div>
      )}
    </section>
  );
}
