import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Beef, Check, RefreshCw, SlidersHorizontal, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { RawMeatOptionsModal } from "@/components/RawMeatOptionsModal";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchRawMeatItems,
  fetchRawMeatMovementsForItem,
  currentHongKongYear,
  RAW_MEAT_MOVEMENTS_PAGE_SIZE,
  rawMeatYearOptions,
  updateRawMeatItemFlags,
  updateRawMeatMovementRemark,
  type RawMeatItemOption,
  type RawMeatMovementRow,
} from "@/lib/raw-meat-inventory";

const MOVEMENT_SKELETON_COLUMNS = [
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "9rem" },
  { width: "4.5rem" },
  { width: "4.5rem" },
  { width: "4.5rem" },
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "6rem" },
  { width: "8rem" },
  { width: "2.5rem" },
];

type ItemsLoader = () => Promise<RawMeatItemOption[]>;
type MovementsLoader = (
  itemId: string,
  productName: string,
  year: number,
) => Promise<RawMeatMovementRow[]>;
type RemarkSaver = (
  movementId: string,
  remarks: string,
) => Promise<string | null>;
type ItemFlagsSaver = (
  itemId: string,
  flags: { canShipDirectly: boolean; isActive: boolean },
) => Promise<void>;

function RemarkEditor({
  value,
  disabled,
  onSave,
}: {
  value: string | null;
  disabled?: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const { t } = useTranslation();
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
      setSaveError(
        error instanceof Error
          ? error.message
          : t("rawMeatInventory.remarkSaveError"),
      );
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
            ? "raw-meat-calc-remark-trigger"
            : "raw-meat-calc-remark-trigger is-empty"
        }
        onClick={() => {
          if (disabled) return;
          setEditing(true);
        }}
        disabled={disabled}
        title={value || t("rawMeatInventory.editRemark")}
        aria-label={t("rawMeatInventory.editRemark")}
      >
        {value || t("common.notSet")}
      </button>
    );
  }

  return (
    <div className="raw-meat-calc-remark-editor">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={saving}
        placeholder={t("rawMeatInventory.remarkPlaceholder")}
        aria-label={t("rawMeatInventory.editRemark")}
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
      <div className="raw-meat-calc-remark-actions">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={saving}
          aria-label={t("rawMeatInventory.saveRemark")}
          title={t("rawMeatInventory.saveRemark")}
          onClick={() => void save()}
        >
          <Check />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={saving}
          aria-label={t("rawMeatInventory.cancelRemark")}
          title={t("rawMeatInventory.cancelRemark")}
          onClick={cancel}
        >
          <X />
        </Button>
      </div>
      {saving ? (
        <span className="raw-meat-calc-remark-status" role="status">
          {t("rawMeatInventory.savingRemark")}
        </span>
      ) : null}
      {saveError ? (
        <span className="raw-meat-calc-remark-error" role="alert">
          {saveError}
        </span>
      ) : null}
    </div>
  );
}

export function RawMeatInventoryCalcPage({
  loadItems = fetchRawMeatItems,
  loadMovements = fetchRawMeatMovementsForItem,
  saveRemark = updateRawMeatMovementRemark,
  saveItemFlags = updateRawMeatItemFlags,
}: {
  loadItems?: ItemsLoader;
  loadMovements?: MovementsLoader;
  saveRemark?: RemarkSaver;
  saveItemFlags?: ItemFlagsSaver;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<RawMeatItemOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [movements, setMovements] = useState<RawMeatMovementRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [year, setYear] = useState(() => currentHongKongYear());
  const years = useMemo(() => rawMeatYearOptions(), []);

  const sidebarItems = useMemo(
    () => items.filter((item) => item.isActive),
    [items],
  );

  const selectedItem =
    sidebarItems.find((item) => item.id === selectedItemId) ?? null;

  const totalPages = Math.max(
    1,
    Math.ceil(movements.length / RAW_MEAT_MOVEMENTS_PAGE_SIZE),
  );
  const visibleFrom =
    movements.length === 0
      ? 0
      : (page - 1) * RAW_MEAT_MOVEMENTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(
    page * RAW_MEAT_MOVEMENTS_PAGE_SIZE,
    movements.length,
  );
  const pageRows = useMemo(
    () =>
      movements.slice(
        (page - 1) * RAW_MEAT_MOVEMENTS_PAGE_SIZE,
        page * RAW_MEAT_MOVEMENTS_PAGE_SIZE,
      ),
    [movements, page],
  );

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
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        i18n.language === "zh-HK" ? "en-GB" : i18n.language,
        {
          month: "short",
          year: "2-digit",
          timeZone: "Asia/Hong_Kong",
        },
      ),
    [i18n.language],
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const kgFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );

  const formatKg = (value: number | null) => {
    if (value === null) return t("common.notSet");
    return `${kgFormatter.format(value)} kg`;
  };

  const formatMonth = (value: string | null) => {
    if (!value) return t("common.notSet");
    const label = monthFormatter.format(new Date(value));
    return label.replace(" ", "-").replace(",", "");
  };

  useEffect(() => {
    let cancelled = false;
    setItemsLoading(true);
    setError(null);

    void loadItems()
      .then((nextItems) => {
        if (cancelled) return;
        setItems(nextItems);
        setSelectedItemId((current) => {
          const active = nextItems.filter((item) => item.isActive);
          if (current && active.some((item) => item.id === current)) {
            return current;
          }
          return active[0]?.id ?? null;
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("rawMeatInventory.loadError"),
        );
        setItems([]);
        setSelectedItemId(null);
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadItems, reloadKey, t]);

  useEffect(() => {
    if (!selectedItemId || !selectedItem) {
      setMovements([]);
      setMovementsLoading(false);
      return;
    }

    let cancelled = false;
    const itemId = selectedItem.id;
    const productName = selectedItem.name;
    setMovementsLoading(true);
    setError(null);
    setPage(1);

    void loadMovements(itemId, productName, year)
      .then((rows) => {
        if (cancelled) return;
        setMovements(rows);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("rawMeatInventory.loadError"),
        );
        setMovements([]);
      })
      .finally(() => {
        if (!cancelled) setMovementsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadMovements, selectedItemId, selectedItem, reloadKey, year, t]);

  const reload = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  const handleSaveRemark = useEffectEvent(
    async (movementId: string, nextRemark: string) => {
      const saved = await saveRemark(movementId, nextRemark);
      setMovements((current) =>
        current.map((row) =>
          row.id === movementId ? { ...row, remarks: saved } : row,
        ),
      );
    },
  );

  const handleSaveItemFlags = useEffectEvent(
    async (
      itemId: string,
      flags: { canShipDirectly: boolean; isActive: boolean },
    ) => {
      await saveItemFlags(itemId, flags);
      setItems((current) => {
        const next = current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                canShipDirectly: flags.canShipDirectly,
                isActive: flags.isActive,
              }
            : item,
        );
        if (!flags.isActive) {
          const active = next.filter((item) => item.isActive);
          setSelectedItemId((currentId) => {
            if (currentId !== itemId) return currentId;
            return active[0]?.id ?? null;
          });
        }
        return next;
      });
    },
  );

  const loading = itemsLoading || movementsLoading;

  return (
    <section className="raw-meat-calc-page">
      <header className="page-heading raw-meat-calc-heading">
        <div>
          <p className="eyebrow">{t("rawMeatInventory.eyebrow")}</p>
          <h1>{t("rawMeatInventory.title")}</h1>
          <p>{t("rawMeatInventory.description")}</p>
        </div>
        <div className="raw-meat-calc-heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw />
            {t("rawMeatInventory.refresh")}
          </Button>
        </div>
      </header>

      <div className="raw-meat-calc-layout">
        <aside
          className="raw-meat-calc-sidebar panel"
          aria-label={t("rawMeatInventory.items")}
        >
          <div className="raw-meat-calc-sidebar-header">
            <strong>{t("rawMeatInventory.items")}</strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="raw-meat-calc-options-trigger"
              aria-label={t("rawMeatInventory.openOptions")}
              title={t("rawMeatInventory.openOptions")}
              onClick={() => setOptionsOpen(true)}
              disabled={itemsLoading || items.length === 0}
            >
              <SlidersHorizontal />
            </Button>
          </div>
          {itemsLoading ? (
            <div className="raw-meat-calc-sidebar-state" role="status">
              {t("rawMeatInventory.loadingItems")}
            </div>
          ) : sidebarItems.length === 0 ? (
            <div className="raw-meat-calc-sidebar-state">
              <Beef />
              <span>{t("rawMeatInventory.emptyItems")}</span>
            </div>
          ) : (
            <ul className="raw-meat-calc-item-list">
              {sidebarItems.map((item) => {
                const active = item.id === selectedItem?.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? "raw-meat-calc-item active"
                          : "raw-meat-calc-item"
                      }
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <article className="raw-meat-calc-main panel">
          <div className="raw-meat-calc-toolbar">
            <div>
              <strong>
                {selectedItem?.name ?? t("rawMeatInventory.noSelection")}
              </strong>
              <span>{t("rawMeatInventory.ledgerHint")}</span>
            </div>
            <div className="raw-meat-calc-actions">
              <label className="raw-meat-calc-year-filter">
                <span>{t("rawMeatInventory.yearFilter")}</span>
                <select
                  aria-label={t("rawMeatInventory.yearFilter")}
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  disabled={loading}
                >
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                disabled
                title={t("rawMeatInventory.comingSoon")}
              >
                {t("rawMeatInventory.addOption")}
              </Button>
              <Button
                type="button"
                disabled
                title={t("rawMeatInventory.comingSoon")}
              >
                {t("rawMeatInventory.stockIn")}
              </Button>
              <Button
                type="button"
                disabled
                title={t("rawMeatInventory.comingSoon")}
              >
                {t("rawMeatInventory.stockOut")}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="products-state products-state-error">
              <div>
                <strong>{t("rawMeatInventory.loadError")}</strong>
                <span>{error}</span>
              </div>
              <Button type="button" variant="outline" onClick={reload}>
                {t("rawMeatInventory.retry")}
              </Button>
            </div>
          ) : !loading && !selectedItem ? (
            <div className="products-state products-state-empty">
              <Beef />
              <div>
                <strong>{t("rawMeatInventory.emptyItems")}</strong>
                <span>{t("rawMeatInventory.emptyItemsDescription")}</span>
              </div>
            </div>
          ) : !loading && movements.length === 0 ? (
            <div className="products-state products-state-empty">
              <Beef />
              <div>
                <strong>{t("rawMeatInventory.emptyMovements")}</strong>
                <span>{t("rawMeatInventory.emptyMovementsDescription")}</span>
              </div>
            </div>
          ) : (
            <ListTable
              className="raw-meat-calc-table-wrap"
              loading={loading}
              loadingLabel={t("rawMeatInventory.loadingMovements")}
              skeletonRows={RAW_MEAT_MOVEMENTS_PAGE_SIZE}
              skeletonColumns={MOVEMENT_SKELETON_COLUMNS}
              header={
                <tr>
                  <th>{t("rawMeatInventory.columns.date")}</th>
                  <th>{t("rawMeatInventory.columns.month")}</th>
                  <th>{t("rawMeatInventory.columns.product")}</th>
                  <th>{t("rawMeatInventory.columns.unitPrice")}</th>
                  <th>{t("rawMeatInventory.columns.inbound")}</th>
                  <th>{t("rawMeatInventory.columns.outbound")}</th>
                  <th>{t("rawMeatInventory.columns.balance")}</th>
                  <th>{t("rawMeatInventory.columns.amount")}</th>
                  <th>{t("rawMeatInventory.columns.supplier")}</th>
                  <th>{t("rawMeatInventory.columns.remark")}</th>
                  <th>{t("rawMeatInventory.columns.actions")}</th>
                </tr>
              }
            >
              {pageRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.movementAt
                      ? dateFormatter.format(new Date(row.movementAt))
                      : t("common.notSet")}
                  </td>
                  <td>{formatMonth(row.movementAt)}</td>
                  <td>
                    <strong>{row.productName}</strong>
                  </td>
                  <td>
                    {row.inboundUnitPrice === null
                      ? t("common.notSet")
                      : currencyFormatter.format(row.inboundUnitPrice)}
                  </td>
                  <td>{formatKg(row.inboundQuantityKg)}</td>
                  <td>{formatKg(row.outboundQuantityKg)}</td>
                  <td>
                    <strong>{formatKg(row.balanceKg)}</strong>
                  </td>
                  <td>
                    {row.totalAmount === null
                      ? t("common.notSet")
                      : currencyFormatter.format(row.totalAmount)}
                  </td>
                  <td>{row.supplierName || t("common.notSet")}</td>
                  <td className="raw-meat-calc-remark-cell">
                    <RemarkEditor
                      value={row.remarks}
                      disabled={loading}
                      onSave={(next) => handleSaveRemark(row.id, next)}
                    />
                  </td>
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled
                        aria-label={t("rawMeatInventory.deleteSoon")}
                        title={t("rawMeatInventory.deleteSoon")}
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
            summary={t("rawMeatInventory.pagination", {
              from: visibleFrom,
              to: visibleTo,
              total: movements.length,
            })}
            page={page}
            totalPages={totalPages}
            loading={loading}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
            onPageChange={setPage}
            previousLabel={t("rawMeatInventory.previous")}
            nextLabel={t("rawMeatInventory.next")}
            pageLabel={t("rawMeatInventory.pageOf")}
            jumpLabel={t("rawMeatInventory.jumpToPage")}
          />
        </article>
      </div>

      <RawMeatOptionsModal
        open={optionsOpen}
        items={items}
        onClose={() => setOptionsOpen(false)}
        onSaveFlags={handleSaveItemFlags}
      />
    </section>
  );
}
