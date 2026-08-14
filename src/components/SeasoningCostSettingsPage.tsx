import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Leaf,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createSeasoningCost,
  fetchSeasoningCosts,
  updateSeasoningCalculation,
  updateSeasoningRemark,
  type SeasoningCostRow,
} from "@/lib/seasoning-cost";
import { tryEvaluateSeasoningExpression } from "@/lib/seasoning-expression";

type SeasoningsLoader = () => Promise<SeasoningCostRow[]>;
type SeasoningCreator = typeof createSeasoningCost;
type CalculationSaver = typeof updateSeasoningCalculation;
type RemarkSaver = typeof updateSeasoningRemark;
type DateSort = "none" | "desc" | "asc";

function InlineTextEditor({
  value,
  disabled,
  emptyLabel,
  editLabel,
  saveLabel,
  cancelLabel,
  placeholder,
  onSave,
  className,
}: {
  value: string | null;
  disabled?: boolean;
  emptyLabel: string;
  editLabel: string;
  saveLabel: string;
  cancelLabel: string;
  placeholder: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [editing, value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const cancel = () => {
    setDraft(value ?? "");
    setSaveError(null);
    setEditing(false);
  };

  const save = async () => {
    if (saving) return;
    const next = draft.trim();
    const current = (value ?? "").trim();
    if (next === current) {
      setEditing(false);
      setSaveError(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={
          value
            ? `seasoning-cost-inline-trigger ${className ?? ""}`.trim()
            : `seasoning-cost-inline-trigger is-empty ${className ?? ""}`.trim()
        }
        onClick={() => {
          if (disabled) return;
          setEditing(true);
        }}
        disabled={disabled}
        title={value || editLabel}
        aria-label={editLabel}
      >
        {value || emptyLabel}
      </button>
    );
  }

  return (
    <div className="seasoning-cost-inline-editor">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={saving}
        placeholder={placeholder}
        aria-label={editLabel}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
      <div className="seasoning-cost-inline-actions">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={saving}
          aria-label={saveLabel}
          title={saveLabel}
          onClick={() => void save()}
        >
          <Check />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={saving}
          aria-label={cancelLabel}
          title={cancelLabel}
          onClick={cancel}
        >
          <X />
        </Button>
      </div>
      {saveError ? (
        <span className="seasoning-cost-inline-error">{saveError}</span>
      ) : null}
    </div>
  );
}

function CreateSeasoningCostPanel({
  open,
  onClose,
  onCreated,
  createSeasoning,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: SeasoningCostRow) => void;
  createSeasoning: SeasoningCreator;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const costFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [i18n.language],
  );

  const previewCost = tryEvaluateSeasoningExpression(expression);

  const closeAndReset = () => {
    setName("");
    setExpression("");
    setError(null);
    setFieldErrors({});
    onClose();
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) {
      next.name = t("seasoningCost.validation.nameRequired");
    }
    if (!expression.trim()) {
      next.expression = t("seasoningCost.validation.expressionRequired");
    } else if (tryEvaluateSeasoningExpression(expression) === null) {
      next.expression = t("seasoningCost.validation.expressionInvalid");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const row = await createSeasoning({
        name,
        calculationExpression: expression,
      });
      setName("");
      setExpression("");
      onCreated(row);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("seasoningCost.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("seasoningCost.createTitle")}
      description={t("seasoningCost.createDescription")}
      onClose={closeAndReset}
      closeLabel={t("seasoningCost.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("seasoningCost.cancel")}
          </Button>
          <Button
            type="submit"
            form="create-seasoning-cost-form"
            disabled={submitting}
          >
            {submitting
              ? t("seasoningCost.creating")
              : t("seasoningCost.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="create-seasoning-cost-form"
        className="seasoning-cost-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="seasoning-cost-field">
          <span>{t("seasoningCost.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("seasoningCost.fields.namePlaceholder")}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? (
            <em className="seasoning-cost-field-error">{fieldErrors.name}</em>
          ) : null}
        </label>

        <label className="seasoning-cost-field">
          <span>{t("seasoningCost.fields.calculation")}</span>
          <input
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder={t("seasoningCost.fields.calculationPlaceholder")}
            aria-invalid={Boolean(fieldErrors.expression)}
            spellCheck={false}
          />
          {fieldErrors.expression ? (
            <em className="seasoning-cost-field-error">
              {fieldErrors.expression}
            </em>
          ) : (
            <small>{t("seasoningCost.fields.calculationHint")}</small>
          )}
        </label>

        <label className="seasoning-cost-field">
          <span>{t("seasoningCost.fields.costPerGram")}</span>
          <input
            value={
              previewCost === null ? "" : costFormatter.format(previewCost)
            }
            readOnly
            disabled
            placeholder={t("seasoningCost.fields.costPerGramAuto")}
          />
        </label>

        {error ? <p className="seasoning-cost-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function SeasoningCostSettingsPage({
  loadSeasonings = fetchSeasoningCosts,
  createSeasoning = createSeasoningCost,
  saveCalculation = updateSeasoningCalculation,
  saveRemark = updateSeasoningRemark,
}: {
  loadSeasonings?: SeasoningsLoader;
  createSeasoning?: SeasoningCreator;
  saveCalculation?: CalculationSaver;
  saveRemark?: RemarkSaver;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<SeasoningCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [dateSort, setDateSort] = useState<DateSort>("none");

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const costFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [i18n.language],
  );

  const sortedRows = useMemo(() => {
    const next = [...rows];
    if (dateSort === "none") {
      next.sort((left, right) => {
        const leftSort = left.sortOrder;
        const rightSort = right.sortOrder;
        if (leftSort !== rightSort) {
          if (leftSort === null) return 1;
          if (rightSort === null) return -1;
          return leftSort - rightSort;
        }
        return left.name.localeCompare(right.name, "zh-HK");
      });
      return next;
    }

    next.sort((left, right) => {
      const leftKey = left.lastUpdatedAt || "";
      const rightKey = right.lastUpdatedAt || "";
      if (leftKey === rightKey) {
        return left.name.localeCompare(right.name, "zh-HK");
      }
      if (!leftKey) return 1;
      if (!rightKey) return -1;
      if (dateSort === "asc") return leftKey < rightKey ? -1 : 1;
      return leftKey > rightKey ? -1 : 1;
    });
    return next;
  }, [dateSort, rows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadSeasonings()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("seasoningCost.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSeasonings, reloadKey, t]);

  const handleSaveCalculation = useEffectEvent(
    async (seasoningId: string, expression: string) => {
      const updated = await saveCalculation(seasoningId, expression);
      setRows((current) =>
        current.map((row) => (row.id === seasoningId ? updated : row)),
      );
    },
  );

  const handleSaveRemark = useEffectEvent(
    async (seasoningId: string, remark: string) => {
      const saved = await saveRemark(seasoningId, remark);
      setRows((current) =>
        current.map((row) =>
          row.id === seasoningId ? { ...row, description: saved } : row,
        ),
      );
    },
  );

  const toggleDateSort = () => {
    setDateSort((current) => {
      if (current === "none") return "desc";
      if (current === "desc") return "asc";
      return "none";
    });
  };

  return (
    <section className="page-shell seasoning-cost-page">
      <div className="page-heading seasoning-cost-heading">
        <div>
          <p className="eyebrow">{t("seasoningCost.eyebrow")}</p>
          <h2>{t("seasoningCost.title")}</h2>
          <p>{t("seasoningCost.description")}</p>
        </div>
        <div className="seasoning-cost-heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw />
            {t("seasoningCost.refresh")}
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("seasoningCost.add")}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="products-state products-state-error">
          <div>
            <strong>{t("seasoningCost.loadError")}</strong>
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {t("seasoningCost.retry")}
          </Button>
        </div>
      ) : loading ? (
        <div className="products-state">
          <Leaf />
          <strong>{t("seasoningCost.loading")}</strong>
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="products-state products-state-empty">
          <Leaf />
          <div>
            <strong>{t("seasoningCost.empty")}</strong>
            <span>{t("seasoningCost.emptyDescription")}</span>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("seasoningCost.add")}
          </Button>
        </div>
      ) : (
        <div className="seasoning-cost-table-wrap panel">
          <table className="seasoning-cost-table">
            <thead>
              <tr>
                <th>{t("seasoningCost.columns.sort")}</th>
                <th>{t("seasoningCost.columns.name")}</th>
                <th>{t("seasoningCost.columns.calculation")}</th>
                <th>{t("seasoningCost.columns.costPerGram")}</th>
                <th>
                  <button
                    type="button"
                    className="seasoning-cost-sort-button"
                    onClick={toggleDateSort}
                    aria-label={t("seasoningCost.sortByUpdated")}
                    title={t("seasoningCost.sortByUpdated")}
                  >
                    <span>{t("seasoningCost.columns.updatedAt")}</span>
                    {dateSort === "asc" ? (
                      <ArrowUp />
                    ) : dateSort === "desc" ? (
                      <ArrowDown />
                    ) : null}
                  </button>
                </th>
                <th>{t("seasoningCost.columns.remark")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sortOrder ?? t("common.notSet")}</td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td className="seasoning-cost-calc-cell">
                    <InlineTextEditor
                      value={row.calculationExpression}
                      emptyLabel={t("common.notSet")}
                      editLabel={t("seasoningCost.editCalculation")}
                      saveLabel={t("seasoningCost.save")}
                      cancelLabel={t("seasoningCost.cancel")}
                      placeholder={t(
                        "seasoningCost.fields.calculationPlaceholder",
                      )}
                      className="is-mono"
                      onSave={async (next) => {
                        if (tryEvaluateSeasoningExpression(next) === null) {
                          throw new Error(
                            t("seasoningCost.validation.expressionInvalid"),
                          );
                        }
                        await handleSaveCalculation(row.id, next);
                      }}
                    />
                  </td>
                  <td>
                    {row.costPerGram === null
                      ? t("common.notSet")
                      : costFormatter.format(row.costPerGram)}
                  </td>
                  <td>
                    {row.lastUpdatedAt
                      ? dateFormatter.format(new Date(row.lastUpdatedAt))
                      : t("common.notSet")}
                  </td>
                  <td className="seasoning-cost-remark-cell">
                    <InlineTextEditor
                      value={row.description}
                      emptyLabel={t("common.notSet")}
                      editLabel={t("seasoningCost.editRemark")}
                      saveLabel={t("seasoningCost.save")}
                      cancelLabel={t("seasoningCost.cancel")}
                      placeholder={t("seasoningCost.remarkPlaceholder")}
                      onSave={async (next) => {
                        await handleSaveRemark(row.id, next);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateSeasoningCostPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        createSeasoning={createSeasoning}
        onCreated={(row) => {
          setRows((current) => [...current, row]);
          setCreateOpen(false);
        }}
      />
    </section>
  );
}
