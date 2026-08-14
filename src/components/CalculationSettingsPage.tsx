import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Calculator, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  coercePercentInput,
  createCalculationSetting,
  deleteCalculationSetting,
  fetchCalculationSettings,
  parsePercentInput,
  rateToPercent,
  setCalculationSettingApplied,
  type CalculationSettingRow,
} from "@/lib/calculation-settings";

type SettingsLoader = () => Promise<CalculationSettingRow[]>;
type SettingCreator = typeof createCalculationSetting;
type AppliedSaver = typeof setCalculationSettingApplied;
type SettingDeleter = typeof deleteCalculationSetting;

const CALCULATION_SETTINGS_SKELETON_COLUMNS = [
  { width: "8rem" },
  { width: "7rem" },
  { width: "7rem" },
  { width: "5rem" },
  { width: "2.5rem", variant: "action" as const },
];

function CreateCalculationSettingPanel({
  open,
  onClose,
  onCreated,
  createSetting,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: CalculationSettingRow) => void;
  createSetting: SettingCreator;
}) {
  const { t } = useTranslation();
  const [variationInput, setVariationInput] = useState("");
  const [markupInput, setMarkupInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const closeAndReset = () => {
    setVariationInput("");
    setMarkupInput("");
    setError(null);
    setFieldError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const variation = parsePercentInput(variationInput);
    const markup = parsePercentInput(markupInput);
    if (variation === null || markup === null) {
      setFieldError(t("calculationSettings.validation.percentRange"));
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldError(null);
    try {
      const created = await createSetting({
        variationPercent: variation,
        markupPercent: markup,
      });
      setVariationInput("");
      setMarkupInput("");
      onCreated(created);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("calculationSettings.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("calculationSettings.createTitle")}
      onClose={closeAndReset}
      closeLabel={t("calculationSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("calculationSettings.cancel")}
          </Button>
          <Button
            type="submit"
            form="create-calculation-setting-form"
            disabled={submitting}
          >
            {submitting
              ? t("calculationSettings.creating")
              : t("calculationSettings.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="create-calculation-setting-form"
        className="calculation-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="calculation-settings-field">
          <span>{t("calculationSettings.fields.variation")}</span>
          <input
            inputMode="decimal"
            value={variationInput}
            placeholder="0.00"
            min={0}
            max={100}
            step={0.01}
            aria-label={t("calculationSettings.fields.variation")}
            aria-invalid={Boolean(fieldError)}
            onChange={(event) =>
              setVariationInput(coercePercentInput(event.target.value))
            }
          />
          <small>{t("calculationSettings.fields.percentHint")}</small>
        </label>

        <label className="calculation-settings-field">
          <span>{t("calculationSettings.fields.markup")}</span>
          <input
            inputMode="decimal"
            value={markupInput}
            placeholder="0.00"
            min={0}
            max={100}
            step={0.01}
            aria-label={t("calculationSettings.fields.markup")}
            aria-invalid={Boolean(fieldError)}
            onChange={(event) =>
              setMarkupInput(coercePercentInput(event.target.value))
            }
          />
          <small>{t("calculationSettings.fields.percentHint")}</small>
        </label>

        {fieldError ? (
          <em className="calculation-settings-field-error">{fieldError}</em>
        ) : null}
        {error ? <p className="calculation-settings-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function CalculationSettingsPage({
  loadSettings = fetchCalculationSettings,
  createSetting = createCalculationSetting,
  saveApplied = setCalculationSettingApplied,
  deleteSetting = deleteCalculationSetting,
}: {
  loadSettings?: SettingsLoader;
  createSetting?: SettingCreator;
  saveApplied?: AppliedSaver;
  deleteSetting?: SettingDeleter;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<CalculationSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const handleToggle = useEffectEvent(
    async (row: CalculationSettingRow, next: boolean) => {
      if (togglingId) return;
      if (!next && row.isApplied) {
        const activeCount = rows.filter((item) => item.isApplied).length;
        if (activeCount <= 1) {
          setActionError(t("calculationSettings.mustKeepOneActive"));
          return;
        }
      }
      setTogglingId(row.id);
      setActionError(null);
      try {
        const nextRows = await saveApplied(row.id, next);
        setRows(nextRows);
      } catch (saveError) {
        setActionError(
          saveError instanceof Error
            ? saveError.message
            : t("calculationSettings.toggleError"),
        );
      } finally {
        setTogglingId(null);
      }
    },
  );

  const handleDelete = useEffectEvent(async (row: CalculationSettingRow) => {
    if (deletingId || togglingId) return;
    if (rows.length <= 1) {
      setActionError(t("calculationSettings.mustKeepOne"));
      return;
    }
    const confirmed = window.confirm(t("calculationSettings.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      const nextRows = await deleteSetting(row.id);
      setRows(nextRows);
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("calculationSettings.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  });

  return (
    <section className="calculation-settings-page">
      <header className="page-heading calculation-settings-heading">
        <div>
          <span className="eyebrow">{t("calculationSettings.eyebrow")}</span>
          <h1>{t("calculationSettings.title")}</h1>
        </div>
        <div className="heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw />
            {t("calculationSettings.refresh")}
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("calculationSettings.add")}
          </Button>
        </div>
      </header>

      <article className="panel calculation-settings-panel">
        {actionError ? (
          <p className="calculation-settings-inline-error">{actionError}</p>
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
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Calculator />
            <div>
              <strong>{t("calculationSettings.empty")}</strong>
              <span>{t("calculationSettings.emptyDescription")}</span>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("calculationSettings.add")}
            </Button>
          </div>
        ) : (
          <ListTable
            className="calculation-settings-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("calculationSettings.loading")}
            skeletonRows={8}
            skeletonColumns={CALCULATION_SETTINGS_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("calculationSettings.columns.createdAt")}</th>
                <th>{t("calculationSettings.columns.variation")}</th>
                <th>{t("calculationSettings.columns.markup")}</th>
                <th>{t("calculationSettings.columns.status")}</th>
                <th aria-label={t("calculationSettings.columns.actions")} />
              </tr>
            }
          >
            {rows.map((row) => {
              const canDelete = rows.length > 1;
              return (
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
                    disabled={togglingId === row.id || deletingId === row.id}
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
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!canDelete || deletingId === row.id}
                      aria-label={
                        canDelete
                          ? t("calculationSettings.delete")
                          : t("calculationSettings.cannotDeleteLast")
                      }
                      title={
                        canDelete
                          ? t("calculationSettings.delete")
                          : t("calculationSettings.cannotDeleteLast")
                      }
                      onClick={() => {
                        void handleDelete(row);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
          </ListTable>
        )}
      </article>

      <CreateCalculationSettingPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        createSetting={createSetting}
        onCreated={(row) => {
          setRows((current) => [row, ...current]);
          setCreateOpen(false);
        }}
      />
    </section>
  );
}
