import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calculator, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  createCalculationSetting,
  fetchCalculationSettings,
  rateToPercent,
  setCalculationSettingApplied,
  type CalculationSettingRow,
} from "@/lib/calculation-settings";

type SettingsLoader = () => Promise<CalculationSettingRow[]>;
type SettingCreator = typeof createCalculationSetting;
type AppliedSaver = typeof setCalculationSettingApplied;

function parsePercentInput(value: string): number | null {
  const trimmed = value.trim().replace(/%/g, "");
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function CalculationSettingsPage({
  loadSettings = fetchCalculationSettings,
  createSetting = createCalculationSetting,
  saveApplied = setCalculationSettingApplied,
}: {
  loadSettings?: SettingsLoader;
  createSetting?: SettingCreator;
  saveApplied?: AppliedSaver;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<CalculationSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [variationInput, setVariationInput] = useState("");
  const [markupInput, setMarkupInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const formatPercent = (rate: number | null) => {
    if (rate === null) return t("common.notSet");
    return `${percentFormatter.format(rateToPercent(rate))}%`;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadSettings()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("calculationSettings.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSettings, reloadKey, t]);

  const handleCreate = useEffectEvent(async () => {
    if (creating) return;
    const variation = parsePercentInput(variationInput);
    const markup = parsePercentInput(markupInput);
    if (variation === null || markup === null) {
      setCreateError(t("calculationSettings.validation.required"));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createSetting({
        variationPercent: variation,
        markupPercent: markup,
      });
      setRows((current) => [created, ...current]);
      setVariationInput("");
      setMarkupInput("");
    } catch (saveError) {
      setCreateError(
        saveError instanceof Error
          ? saveError.message
          : t("calculationSettings.createError"),
      );
    } finally {
      setCreating(false);
    }
  });

  const handleToggle = useEffectEvent(
    async (row: CalculationSettingRow, next: boolean) => {
      if (togglingId) return;
      if (!next && row.isApplied) {
        const activeCount = rows.filter((item) => item.isApplied).length;
        if (activeCount <= 1) {
          setToggleError(t("calculationSettings.mustKeepOneActive"));
          return;
        }
      }
      setTogglingId(row.id);
      setToggleError(null);
      try {
        const nextRows = await saveApplied(row.id, next);
        setRows(nextRows);
      } catch (saveError) {
        setToggleError(
          saveError instanceof Error
            ? saveError.message
            : t("calculationSettings.toggleError"),
        );
      } finally {
        setTogglingId(null);
      }
    },
  );

  return (
    <section className="page-shell calculation-settings-page">
      <div className="page-heading calculation-settings-heading">
        <div>
          <p className="eyebrow">{t("calculationSettings.eyebrow")}</p>
          <h2>{t("calculationSettings.title")}</h2>
          <p>{t("calculationSettings.description")}</p>
        </div>
        <div className="calculation-settings-heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw />
            {t("calculationSettings.refresh")}
          </Button>
        </div>
      </div>

      <div className="calculation-settings-create-bar">
        <label className="calculation-settings-create-field">
          <span>{t("calculationSettings.fields.variation")}</span>
          <input
            inputMode="decimal"
            value={variationInput}
            placeholder="%"
            aria-label={t("calculationSettings.fields.variation")}
            onChange={(event) => setVariationInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
        </label>
        <label className="calculation-settings-create-field">
          <span>{t("calculationSettings.fields.markup")}</span>
          <input
            inputMode="decimal"
            value={markupInput}
            placeholder="%"
            aria-label={t("calculationSettings.fields.markup")}
            onChange={(event) => setMarkupInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
        </label>
        <Button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || loading}
        >
          {creating
            ? t("calculationSettings.creating")
            : t("calculationSettings.add")}
        </Button>
      </div>
      {createError ? (
        <p className="calculation-settings-inline-error">{createError}</p>
      ) : null}
      {toggleError ? (
        <p className="calculation-settings-inline-error">{toggleError}</p>
      ) : null}

      {error ? (
        <div className="products-state products-state-error">
          <div>
            <strong>{t("calculationSettings.loadError")}</strong>
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {t("calculationSettings.retry")}
          </Button>
        </div>
      ) : loading ? (
        <div className="products-state">
          <Calculator />
          <strong>{t("calculationSettings.loading")}</strong>
        </div>
      ) : rows.length === 0 ? (
        <div className="products-state products-state-empty">
          <Calculator />
          <div>
            <strong>{t("calculationSettings.empty")}</strong>
            <span>{t("calculationSettings.emptyDescription")}</span>
          </div>
        </div>
      ) : (
        <div className="calculation-settings-table-wrap panel">
          <table className="calculation-settings-table">
            <thead>
              <tr>
                <th>{t("calculationSettings.columns.createdAt")}</th>
                <th>{t("calculationSettings.columns.variation")}</th>
                <th>{t("calculationSettings.columns.markup")}</th>
                <th>{t("calculationSettings.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.createdAt
                      ? dateFormatter.format(new Date(row.createdAt))
                      : t("common.notSet")}
                  </td>
                  <td>{formatPercent(row.variationRate)}</td>
                  <td>{formatPercent(row.markupRate)}</td>
                  <td>
                    <Switch
                      checked={row.isApplied}
                      disabled={togglingId === row.id}
                      aria-label={t("calculationSettings.toggleStatus", {
                        date: row.createdAt
                          ? dateFormatter.format(new Date(row.createdAt))
                          : row.id,
                      })}
                      onCheckedChange={(checked) => {
                        void handleToggle(row, checked);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
