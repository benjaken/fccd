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
    <section className="page-shell spice-usage-page">
      <div className="page-heading spice-usage-heading">
        <div>
          <p className="eyebrow">{t("spiceUsage.eyebrow")}</p>
          <h2>{t("spiceUsage.title")}</h2>
          <p>{t("spiceUsage.description")}</p>
        </div>
        <div className="spice-usage-heading-actions">
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
      </div>

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
      ) : null}

      <div className="spice-usage-tags panel" aria-label={t("spiceUsage.tags")}>
        {seasoningsLoading ? (
          <p className="spice-usage-tags-state">{t("spiceUsage.loadingSeasonings")}</p>
        ) : seasonings.length === 0 ? (
          <p className="spice-usage-tags-state">{t("spiceUsage.emptySeasonings")}</p>
        ) : (
          <ul className="spice-usage-tag-list">
            {seasonings.map((item) => {
              const active = item.id === selected?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      active ? "spice-usage-tag active" : "spice-usage-tag"
                    }
                    aria-pressed={active}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {item.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="spice-usage-table-wrap panel">
        <table className="spice-usage-table">
          <thead>
            <tr>
              <th scope="col">{t("spiceUsage.columns.spice")}</th>
              <th scope="col">{t("spiceUsage.columns.usage")}</th>
            </tr>
          </thead>
          <tbody>
            {usagesLoading ? (
              <tr>
                <td colSpan={2} className="spice-usage-empty-cell">
                  {t("spiceUsage.loadingUsages")}
                </td>
              </tr>
            ) : !selected ? (
              <tr>
                <td colSpan={2} className="spice-usage-empty-cell">
                  <div className="spice-usage-empty">
                    <Leaf />
                    <strong>{t("spiceUsage.noSelection")}</strong>
                    <span>{t("spiceUsage.noSelectionDescription")}</span>
                  </div>
                </td>
              </tr>
            ) : usages.length === 0 ? (
              <tr>
                <td className="spice-usage-name-cell">
                  <strong>{selected.name}</strong>
                </td>
                <td className="spice-usage-empty-cell">
                  {t("spiceUsage.emptyUsages")}
                </td>
              </tr>
            ) : (
              <tr>
                <td className="spice-usage-name-cell">
                  <strong>{selected.name}</strong>
                </td>
                <td>
                  <div className="spice-usage-cards">
                    {usages.map((usage, index) => (
                      <article
                        key={usage.id}
                        className="spice-usage-card"
                        aria-label={`${index + 1}. ${usage.preparedMeatName}`}
                      >
                        <strong className="spice-usage-card-title">
                          {index + 1}. {usage.preparedMeatName}
                        </strong>
                        <span className="spice-usage-card-metric">
                          {gramsFormatter.format(usage.quantityGrams)}g
                        </span>
                        <span className="spice-usage-card-metric">
                          {currencyFormatter.format(usage.totalCost)}
                        </span>
                      </article>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
