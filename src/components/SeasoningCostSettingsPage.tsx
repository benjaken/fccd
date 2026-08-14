import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Leaf,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  archiveSeasoningCost,
  createSeasoningCost,
  fetchSeasoningCosts,
  filterSeasoningCosts,
  SEASONING_COST_PAGE_SIZE,
  updateSeasoningCost,
  type SeasoningCostRow,
} from "@/lib/seasoning-cost";
import { tryEvaluateSeasoningExpression } from "@/lib/seasoning-expression";
import { cn } from "@/lib/utils";

type SeasoningsLoader = () => Promise<SeasoningCostRow[]>;
type SeasoningCreator = typeof createSeasoningCost;
type SeasoningUpdater = typeof updateSeasoningCost;
type SeasoningDeleter = typeof archiveSeasoningCost;
type SortKey = "sortOrder" | "updatedAt";
type SortDirection = "asc" | "desc";

const SEASONING_COST_SKELETON_COLUMNS = [
  { width: "4rem" },
  { width: "8rem" },
  { width: "10rem" },
  { width: "6rem" },
  { width: "8rem" },
  { width: "10rem" },
  { width: "4.5rem", variant: "action" as const },
];

function SortHeaderButton({
  label,
  active,
  direction,
  onClick,
  ariaLabel,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={cn("seasoning-cost-sort-button", active && "is-active")}
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp />
        ) : (
          <ArrowDown />
        )
      ) : (
        <ArrowUpDown />
      )}
    </button>
  );
}

function SeasoningCostFormPanel({
  open,
  seasoning,
  onClose,
  onSaved,
  createSeasoning,
  updateSeasoning,
}: {
  open: boolean;
  seasoning: SeasoningCostRow | null;
  onClose: () => void;
  onSaved: (row: SeasoningCostRow, mode: "create" | "edit") => void;
  createSeasoning: SeasoningCreator;
  updateSeasoning: SeasoningUpdater;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const editing = Boolean(seasoning);

  const costFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [i18n.language],
  );

  const previewCost = tryEvaluateSeasoningExpression(expression);

  useEffect(() => {
    if (!open) return;
    setName(seasoning?.name ?? "");
    setExpression(seasoning?.calculationExpression ?? "");
    setRemark(seasoning?.description ?? "");
    setError(null);
    setFieldErrors({});
  }, [open, seasoning]);

  const closeAndReset = () => {
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
    const payload = {
      name,
      calculationExpression: expression,
      description: remark,
    };
    try {
      const row = seasoning
        ? await updateSeasoning(seasoning.id, payload)
        : await createSeasoning(payload);
      onSaved(row, seasoning ? "edit" : "create");
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(
              editing ? "seasoningCost.editError" : "seasoningCost.createError",
            ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(
        editing ? "seasoningCost.editTitle" : "seasoningCost.createTitle",
      )}
      onClose={closeAndReset}
      closeLabel={t("seasoningCost.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("seasoningCost.cancel")}
          </Button>
          <Button
            type="submit"
            form="seasoning-cost-form"
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
        id="seasoning-cost-form"
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

        <label className="seasoning-cost-field">
          <span>{t("seasoningCost.fields.remark")}</span>
          <textarea
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder={t("seasoningCost.fields.remarkPlaceholder")}
            rows={3}
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
  updateSeasoning = updateSeasoningCost,
  deleteSeasoning = archiveSeasoningCost,
}: {
  loadSeasonings?: SeasoningsLoader;
  createSeasoning?: SeasoningCreator;
  updateSeasoning?: SeasoningUpdater;
  deleteSeasoning?: SeasoningDeleter;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<SeasoningCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingSeasoning, setEditingSeasoning] =
    useState<SeasoningCostRow | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sortOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "updatedAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((left, right) => {
      if (sortKey === "sortOrder") {
        const leftSort = left.sortOrder;
        const rightSort = right.sortOrder;
        if (leftSort !== rightSort) {
          if (leftSort === null) return 1;
          if (rightSort === null) return -1;
          const cmp = leftSort - rightSort;
          return sortDirection === "asc" ? cmp : -cmp;
        }
      } else {
        const leftKey = left.lastUpdatedAt || "";
        const rightKey = right.lastUpdatedAt || "";
        if (leftKey !== rightKey) {
          if (!leftKey) return 1;
          if (!rightKey) return -1;
          const cmp = leftKey < rightKey ? -1 : 1;
          return sortDirection === "asc" ? cmp : -cmp;
        }
      }
      return left.name.localeCompare(right.name, "zh-HK");
    });
    return next;
  }, [rows, sortDirection, sortKey]);

  const visibleRows = useMemo(
    () => filterSeasoningCosts(sortedRows, appliedSearch),
    [appliedSearch, sortedRows],
  );

  const total = visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(total / SEASONING_COST_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleFrom =
    total === 0 ? 0 : (currentPage - 1) * SEASONING_COST_PAGE_SIZE + 1;
  const visibleTo = Math.min(currentPage * SEASONING_COST_PAGE_SIZE, total);
  const pagedRows = visibleRows.slice(
    (currentPage - 1) * SEASONING_COST_PAGE_SIZE,
    currentPage * SEASONING_COST_PAGE_SIZE,
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

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

  const openCreate = () => {
    setEditingSeasoning(null);
    setPanelOpen(true);
  };

  const openEdit = (row: SeasoningCostRow) => {
    setEditingSeasoning(row);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingSeasoning(null);
  };

  const handleDelete = useEffectEvent(async (row: SeasoningCostRow) => {
    if (deletingId) return;
    const confirmed = window.confirm(t("seasoningCost.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteSeasoning(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("seasoningCost.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  });

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  return (
    <section className="seasoning-cost-page">
      <header className="page-heading seasoning-cost-heading">
        <div>
          <span className="eyebrow">{t("seasoningCost.eyebrow")}</span>
          <h1>{t("seasoningCost.title")}</h1>
        </div>
        <div className="heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw />
            {t("seasoningCost.refresh")}
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus />
            {t("seasoningCost.add")}
          </Button>
        </div>
      </header>

      <article className="panel seasoning-cost-panel">
        <header className="seasoning-cost-toolbar">
          <ListSearchBar
            id="seasoning-cost-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => {
              setAppliedSearch(draftSearch.trim());
              setPage(1);
            }}
            label={t("seasoningCost.search")}
            placeholder={t("seasoningCost.searchPlaceholder")}
            submitLabel={t("seasoningCost.searchAction")}
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

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
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Leaf />
            <div>
              <strong>{t("seasoningCost.empty")}</strong>
              <span>{t("seasoningCost.emptyDescription")}</span>
            </div>
            <Button type="button" onClick={openCreate}>
              <Plus />
              {t("seasoningCost.add")}
            </Button>
          </div>
        ) : (
          <ListTable
            className="seasoning-cost-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("seasoningCost.loading")}
            skeletonRows={SEASONING_COST_PAGE_SIZE}
            skeletonColumns={SEASONING_COST_SKELETON_COLUMNS}
            header={
              <tr>
                <th>
                  <SortHeaderButton
                    label={t("seasoningCost.columns.sort")}
                    active={sortKey === "sortOrder"}
                    direction={sortDirection}
                    onClick={() => toggleSort("sortOrder")}
                    ariaLabel={t("seasoningCost.sortByOrder")}
                  />
                </th>
                <th>{t("seasoningCost.columns.name")}</th>
                <th>{t("seasoningCost.columns.calculation")}</th>
                <th>{t("seasoningCost.columns.costPerGram")}</th>
                <th>
                  <SortHeaderButton
                    label={t("seasoningCost.columns.updatedAt")}
                    active={sortKey === "updatedAt"}
                    direction={sortDirection}
                    onClick={() => toggleSort("updatedAt")}
                    ariaLabel={t("seasoningCost.sortByUpdated")}
                  />
                </th>
                <th>{t("seasoningCost.columns.remark")}</th>
                <th aria-label={t("seasoningCost.columns.actions")} />
              </tr>
            }
          >
            {pagedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.sortOrder ?? t("common.notSet")}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td className="seasoning-cost-calc-cell">
                  {display(row.calculationExpression)}
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
                  {display(row.description)}
                </td>
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={deletingId === row.id}
                      aria-label={t("seasoningCost.edit")}
                      title={t("seasoningCost.edit")}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={deletingId === row.id}
                      aria-label={t("seasoningCost.delete")}
                      title={t("seasoningCost.delete")}
                      onClick={() => {
                        void handleDelete(row);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </ListTable>
        )}

        <TablePagination
          summary={t("seasoningCost.pagination", {
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
          previousLabel={t("seasoningCost.previous")}
          nextLabel={t("seasoningCost.next")}
          pageLabel={t("seasoningCost.pageOf")}
          jumpLabel={t("seasoningCost.jumpToPage")}
        />
      </article>

      <SeasoningCostFormPanel
        open={panelOpen}
        seasoning={editingSeasoning}
        onClose={closePanel}
        createSeasoning={createSeasoning}
        updateSeasoning={updateSeasoning}
        onSaved={(row, mode) => {
          setRows((current) =>
            mode === "create"
              ? [...current.filter((item) => item.id !== row.id), row]
              : current.map((item) => (item.id === row.id ? row : item)),
          );
          closePanel();
        }}
      />
    </section>
  );
}
