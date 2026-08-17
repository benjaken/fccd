import {
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Flame, Plus, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import {
  COOK_TYPE_WORKLOAD_MAX,
  COOK_TYPE_WORKLOAD_MIN,
  createCookType,
  deleteCookType,
  fetchCookTypes,
  formatWorkloadScore,
  parseWorkloadScore,
  type CookTypeRow,
} from "@/lib/cook-types";
import { KITCHEN_ACTION_PERMISSION_KEYS } from "@/lib/kitchen-action-permissions";

type CookTypesLoader = typeof fetchCookTypes;
type CookTypeCreator = typeof createCookType;
type CookTypeDeleter = typeof deleteCookType;

const COOK_TYPE_SKELETON_COLUMNS = [{ width: "10rem" }, { width: "8rem" }];
const COOK_TYPE_ACTION_SKELETON = {
  width: "2.5rem",
  variant: "action" as const,
};

const WORKLOAD_OPTIONS = Array.from(
  { length: COOK_TYPE_WORKLOAD_MAX - COOK_TYPE_WORKLOAD_MIN + 1 },
  (_, index) => COOK_TYPE_WORKLOAD_MIN + index,
);

function CreateCookTypePanel({
  open,
  onClose,
  onCreated,
  createType,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: CookTypeRow) => void;
  createType: CookTypeCreator;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [workloadScore, setWorkloadScore] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const closeAndReset = () => {
    setName("");
    setWorkloadScore("");
    setError(null);
    setFieldErrors({});
    onClose();
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) {
      next.name = t("kitchenSettings.validation.nameRequired");
    }
    if (parseWorkloadScore(workloadScore) === null) {
      next.workloadScore = t("kitchenSettings.validation.workloadRange");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    const score = parseWorkloadScore(workloadScore);
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createType({
        name,
        workloadScore: score,
      });
      setName("");
      setWorkloadScore("");
      setFieldErrors({});
      onCreated(created);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("kitchenSettings.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("kitchenSettings.createTitle")}
      onClose={closeAndReset}
      closeLabel={t("kitchenSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("kitchenSettings.cancel")}
          </Button>
          <Button
            type="submit"
            form="create-cook-type-form"
            disabled={submitting}
          >
            {submitting
              ? t("kitchenSettings.creating")
              : t("kitchenSettings.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="create-cook-type-form"
        className="kitchen-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="kitchen-settings-field">
          <span>{t("kitchenSettings.fields.name")}</span>
          <input
            value={name}
            placeholder={t("kitchenSettings.fields.namePlaceholder")}
            aria-label={t("kitchenSettings.fields.name")}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => setName(event.target.value)}
          />
          {fieldErrors.name ? (
            <em className="kitchen-settings-field-error">{fieldErrors.name}</em>
          ) : null}
        </label>

        <label className="kitchen-settings-field">
          <span>{t("kitchenSettings.fields.workloadScore")}</span>
          <select
            value={workloadScore}
            aria-label={t("kitchenSettings.fields.workloadScore")}
            aria-invalid={Boolean(fieldErrors.workloadScore)}
            onChange={(event) => setWorkloadScore(event.target.value)}
          >
            <option value="">
              {t("kitchenSettings.fields.workloadPlaceholder")}
            </option>
            {WORKLOAD_OPTIONS.map((score) => (
              <option key={score} value={String(score)}>
                {score}
              </option>
            ))}
          </select>
          <small>{t("kitchenSettings.fields.workloadHint")}</small>
          {fieldErrors.workloadScore ? (
            <em className="kitchen-settings-field-error">
              {fieldErrors.workloadScore}
            </em>
          ) : null}
        </label>

        {error ? <p className="kitchen-settings-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function KitchenSettingsPage({
  loadCookTypes = fetchCookTypes,
  createType = createCookType,
  deleteType = deleteCookType,
  canDelete: canDeleteProp,
}: {
  loadCookTypes?: CookTypesLoader;
  createType?: CookTypeCreator;
  deleteType?: CookTypeDeleter;
  canDelete?: boolean;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canDeleteRecords =
    canDeleteProp ??
    pageAccess.canAccess(KITCHEN_ACTION_PERMISSION_KEYS.cookTypes.delete);
  const [rows, setRows] = useState<CookTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadCookTypes()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("kitchenSettings.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadCookTypes, reloadKey, t]);

  const handleDelete = useEffectEvent(async (row: CookTypeRow) => {
    if (!canDeleteRecords || deletingId) return;
    const confirmed = window.confirm(t("kitchenSettings.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteType(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      const code =
        saveError instanceof Error ? saveError.message : "delete_failed";
      setActionError(
        code === "cook_type_in_use"
          ? t("kitchenSettings.deleteInUse")
          : t("kitchenSettings.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  });

  return (
    <section className="kitchen-settings-page">
      <header className="page-heading kitchen-settings-heading">
        <div>
          <span className="eyebrow">{t("kitchenSettings.eyebrow")}</span>
          <h1>{t("kitchenSettings.title")}</h1>
        </div>
        <div className="heading-actions">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("kitchenSettings.add")}
          </Button>
        </div>
      </header>

      <article className="panel kitchen-settings-panel">
        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("kitchenSettings.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              {t("kitchenSettings.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Flame />
            <div>
              <strong>{t("kitchenSettings.empty")}</strong>
              <span>{t("kitchenSettings.emptyDescription")}</span>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("kitchenSettings.add")}
            </Button>
          </div>
        ) : (
          <ListTable
            className="kitchen-settings-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("kitchenSettings.loading")}
            skeletonRows={8}
            skeletonColumns={
              canDeleteRecords
                ? [...COOK_TYPE_SKELETON_COLUMNS, COOK_TYPE_ACTION_SKELETON]
                : COOK_TYPE_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("kitchenSettings.columns.name")}</th>
                <th>{t("kitchenSettings.columns.workloadScore")}</th>
                {canDeleteRecords ? (
                  <th aria-label={t("kitchenSettings.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{formatWorkloadScore(row.workloadScore) || t("common.notSet")}</td>
                {canDeleteRecords ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={deletingId === row.id}
                        aria-label={t("kitchenSettings.delete")}
                        title={t("kitchenSettings.delete")}
                        onClick={() => {
                          void handleDelete(row);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}
      </article>

      <CreateCookTypePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        createType={createType}
        onCreated={(row) => {
          setRows((current) => [...current, row]);
          setCreateOpen(false);
        }}
      />
    </section>
  );
}
