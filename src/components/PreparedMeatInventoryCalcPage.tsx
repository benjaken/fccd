import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Package,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";

import { PreparedMeatOptionsModal } from "@/components/PreparedMeatOptionsModal";
import { PreparedMeatOutboundModal } from "@/components/PreparedMeatOutboundModal";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  currentHongKongYear,
  fetchPreparedMeatItems,
  fetchPreparedMeatMovementsForItem,
  hongKongYearMonthKey,
  PREPARED_MEAT_MOVEMENTS_PAGE_SIZE,
  preparedMeatYearOptions,
  updatePreparedMeatItemFlags,
  type PreparedMeatItemOption,
  type PreparedMeatMovementRow,
} from "@/lib/prepared-meat-inventory";

const MOVEMENT_SKELETON_COLUMNS = [
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
  { width: "9rem" },
  { width: "4.5rem" },
  { width: "4.5rem" },
  { width: "5.5rem" },
  { width: "8rem" },
  { width: "4.5rem" },
];

type ItemsLoader = () => Promise<PreparedMeatItemOption[]>;
type MovementsLoader = (
  itemId: string,
  productName: string,
  year: number,
) => Promise<PreparedMeatMovementRow[]>;
type ItemFlagsSaver = typeof updatePreparedMeatItemFlags;
type OutboundModalProps = Pick<
  ComponentProps<typeof PreparedMeatOutboundModal>,
  "loadCustomers" | "loadShippingMethods" | "loadOrderNumber" | "createOutbound"
>;

type HeaderFilterOption = { key: string; label: string };

function HeaderColumnFilter({
  label,
  ariaLabel,
  value,
  options,
  allLabel,
  open,
  disabled,
  containerRef,
  onToggle,
  onSelect,
}: {
  label: string;
  ariaLabel: string;
  value: string | null;
  options: HeaderFilterOption[];
  allLabel: string;
  open: boolean;
  disabled: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="raw-meat-calc-month-filter" ref={containerRef}>
      <button
        type="button"
        className="raw-meat-calc-month-filter-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled}
        onClick={onToggle}
      >
        <span>{label}</span>
        <ChevronDown />
      </button>
      {open ? (
        <ul
          className="raw-meat-calc-month-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              className={
                value === null
                  ? "raw-meat-calc-month-option active"
                  : "raw-meat-calc-month-option"
              }
              onClick={() => onSelect(null)}
            >
              {allLabel}
            </button>
          </li>
          {options.map((option) => (
            <li key={option.key} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === option.key}
                className={
                  value === option.key
                    ? "raw-meat-calc-month-option active"
                    : "raw-meat-calc-month-option"
                }
                onClick={() => onSelect(option.key)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PreparedMeatInventoryCalcPage({
  loadItems = fetchPreparedMeatItems,
  loadMovements = fetchPreparedMeatMovementsForItem,
  saveItemFlags = updatePreparedMeatItemFlags,
  loadCustomers,
  loadShippingMethods,
  loadOrderNumber,
  createOutbound,
}: {
  loadItems?: ItemsLoader;
  loadMovements?: MovementsLoader;
  saveItemFlags?: ItemFlagsSaver;
} & OutboundModalProps) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<PreparedMeatItemOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [movements, setMovements] = useState<PreparedMeatMovementRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [year, setYear] = useState(() => currentHongKongYear());
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [shopFilter, setShopFilter] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<"month" | "shop" | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [outboundOpen, setOutboundOpen] = useState(false);
  const monthFilterRef = useRef<HTMLDivElement>(null);
  const shopFilterRef = useRef<HTMLDivElement>(null);
  const years = useMemo(() => preparedMeatYearOptions(), []);

  const sidebarItems = useMemo(
    () => items.filter((item) => item.isActive),
    [items],
  );

  const selectedItem =
    sidebarItems.find((item) => item.id === selectedItemId) ?? null;

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

  const formatMonthLabel = useCallback(
    (value: string | null) => {
      if (!value) return t("common.notSet");
      return monthFormatter
        .format(new Date(value))
        .replace(" ", "-")
        .replace(",", "");
    },
    [monthFormatter, t],
  );

  const monthOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of movements) {
      if (!row.movementAt) continue;
      const key = hongKongYearMonthKey(row.movementAt);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, formatMonthLabel(row.movementAt));
    }
    return [...byKey.entries()]
      .sort((left, right) => (left[0] > right[0] ? -1 : 1))
      .map(([key, label]) => ({ key, label }));
  }, [formatMonthLabel, movements]);

  const shopOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of movements) {
      if (!row.shopId || byId.has(row.shopId)) continue;
      byId.set(row.shopId, row.shopName || row.shopId);
    }
    return [...byId.entries()]
      .sort((left, right) => left[1].localeCompare(right[1], "zh-HK"))
      .map(([key, label]) => ({ key, label }));
  }, [movements]);

  const filteredMovements = useMemo(() => {
    return movements.filter((row) => {
      if (
        monthFilter &&
        (row.movementAt === null ||
          hongKongYearMonthKey(row.movementAt) !== monthFilter)
      ) {
        return false;
      }
      if (shopFilter && row.shopId !== shopFilter) return false;
      return true;
    });
  }, [monthFilter, movements, shopFilter]);

  const monthTotals = useMemo(() => {
    if (!monthFilter) return null;
    let inboundPackages = 0;
    let outboundPackages = 0;
    for (const row of filteredMovements) {
      inboundPackages += row.inboundPackages ?? 0;
      outboundPackages += row.outboundPackages ?? 0;
    }
    return { inboundPackages, outboundPackages };
  }, [filteredMovements, monthFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredMovements.length / PREPARED_MEAT_MOVEMENTS_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleFrom =
    filteredMovements.length === 0
      ? 0
      : (currentPage - 1) * PREPARED_MEAT_MOVEMENTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(
    currentPage * PREPARED_MEAT_MOVEMENTS_PAGE_SIZE,
    filteredMovements.length,
  );
  const pageRows = filteredMovements.slice(
    (currentPage - 1) * PREPARED_MEAT_MOVEMENTS_PAGE_SIZE,
    currentPage * PREPARED_MEAT_MOVEMENTS_PAGE_SIZE,
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
  const packageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    [i18n.language],
  );
  const totalPackageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const formatPackages = (value: number | null) => {
    if (value === null) return t("common.notSet");
    return packageFormatter.format(value);
  };

  const selectedMonthLabel =
    monthOptions.find((option) => option.key === monthFilter)?.label ??
    t("preparedMeatInventory.columns.month");
  const selectedShopLabel =
    shopOptions.find((option) => option.key === shopFilter)?.label ??
    t("preparedMeatInventory.columns.shop");

  useEffect(() => {
    if (!openFilter) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const monthOpen =
        openFilter === "month" && monthFilterRef.current?.contains(target);
      const shopOpen =
        openFilter === "shop" && shopFilterRef.current?.contains(target);
      if (!monthOpen && !shopOpen) setOpenFilter(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFilter(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openFilter]);

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
            : t("preparedMeatInventory.loadError"),
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
    setMonthFilter(null);
    setShopFilter(null);
    setOpenFilter(null);

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
            : t("preparedMeatInventory.loadError"),
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

  const handleSaveItemFlags = useEffectEvent(
    async (itemId: string, isActive: boolean) => {
      await saveItemFlags(itemId, isActive);
      setItems((current) => {
        const next = current.map((item) =>
          item.id === itemId ? { ...item, isActive } : item,
        );
        if (!isActive) {
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
    <section className="raw-meat-calc-page prepared-meat-calc-page">
      <header className="page-heading raw-meat-calc-heading prepared-meat-calc-heading">
        <div>
          <span className="eyebrow">{t("preparedMeatInventory.eyebrow")}</span>
          <h1>{t("preparedMeatInventory.title")}</h1>
        </div>
        <div className="raw-meat-calc-heading-actions">
          <Button type="button" disabled title={t("preparedMeatInventory.comingSoon")}>
            {t("preparedMeatInventory.actions.addOption")}
          </Button>
          <Button type="button" disabled title={t("preparedMeatInventory.comingSoon")}>
            {t("preparedMeatInventory.actions.stockInDeduct")}
          </Button>
          <Button type="button" disabled title={t("preparedMeatInventory.comingSoon")}>
            {t("preparedMeatInventory.actions.stockInNoRaw")}
          </Button>
          <Button type="button" onClick={() => setOutboundOpen(true)}>
            {t("preparedMeatInventory.actions.stockOut")}
          </Button>
          <Button type="button" disabled title={t("preparedMeatInventory.comingSoon")}>
            {t("preparedMeatInventory.actions.manageOrders")}
          </Button>
        </div>
      </header>

      <div className="raw-meat-calc-layout">
        <aside
          className="raw-meat-calc-sidebar panel"
          aria-label={t("preparedMeatInventory.items")}
        >
          <div className="raw-meat-calc-sidebar-header">
            <strong>{t("preparedMeatInventory.items")}</strong>
            <div className="raw-meat-calc-sidebar-actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="raw-meat-calc-options-trigger"
                aria-label={t("preparedMeatInventory.openOptions")}
                title={t("preparedMeatInventory.openOptions")}
                onClick={() => setOptionsOpen(true)}
                disabled={itemsLoading || items.length === 0}
              >
                <SlidersHorizontal />
              </Button>
            </div>
          </div>
          {itemsLoading ? (
            <div className="raw-meat-calc-sidebar-state" role="status">
              {t("preparedMeatInventory.loadingItems")}
            </div>
          ) : sidebarItems.length === 0 ? (
            <div className="raw-meat-calc-sidebar-state">
              <Package />
              <span>{t("preparedMeatInventory.emptyItems")}</span>
            </div>
          ) : (
            <ul className="raw-meat-calc-item-list">
              {sidebarItems.map((item) => {
                const active = item.id === selectedItem?.id;
                return (
                  <li key={item.id}>
                    <div
                      className={
                        active
                          ? "raw-meat-calc-item-row active"
                          : "raw-meat-calc-item-row"
                      }
                    >
                      <button
                        type="button"
                        className="raw-meat-calc-item"
                        aria-current={active ? "true" : undefined}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        {item.name}
                      </button>
                    </div>
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
                {selectedItem?.name ?? t("preparedMeatInventory.noSelection")}
              </strong>
              <span>{t("preparedMeatInventory.ledgerHint")}</span>
            </div>
            <label className="raw-meat-calc-year-filter">
              <span>{t("preparedMeatInventory.yearFilter")}</span>
              <select
                aria-label={t("preparedMeatInventory.yearFilter")}
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
          </div>

          {error ? (
            <div className="products-state products-state-error">
              <div>
                <strong>{t("preparedMeatInventory.loadError")}</strong>
                <span>{error}</span>
              </div>
              <Button type="button" variant="outline" onClick={reload}>
                {t("preparedMeatInventory.retry")}
              </Button>
            </div>
          ) : !loading && !selectedItem ? (
            <div className="products-state products-state-empty">
              <Package />
              <div>
                <strong>{t("preparedMeatInventory.emptyItems")}</strong>
                <span>{t("preparedMeatInventory.emptyItemsDescription")}</span>
              </div>
            </div>
          ) : !loading && movements.length === 0 ? (
            <div className="products-state products-state-empty">
              <Package />
              <div>
                <strong>{t("preparedMeatInventory.emptyMovements")}</strong>
                <span>
                  {t("preparedMeatInventory.emptyMovementsDescription")}
                </span>
              </div>
            </div>
          ) : (
            <ListTable
              className="raw-meat-calc-table-wrap"
              loading={loading}
              loadingLabel={t("preparedMeatInventory.loadingMovements")}
              skeletonRows={PREPARED_MEAT_MOVEMENTS_PAGE_SIZE}
              skeletonColumns={MOVEMENT_SKELETON_COLUMNS}
              header={
                <tr>
                  <th>{t("preparedMeatInventory.columns.date")}</th>
                  <th>
                    <HeaderColumnFilter
                      label={selectedMonthLabel}
                      ariaLabel={t("preparedMeatInventory.filterMonth")}
                      value={monthFilter}
                      options={monthOptions}
                      allLabel={t("preparedMeatInventory.allMonths")}
                      open={openFilter === "month"}
                      disabled={loading || monthOptions.length === 0}
                      containerRef={monthFilterRef}
                      onToggle={() =>
                        setOpenFilter((current) =>
                          current === "month" ? null : "month",
                        )
                      }
                      onSelect={(key) => {
                        setMonthFilter(key);
                        setOpenFilter(null);
                        setPage(1);
                      }}
                    />
                  </th>
                  <th>
                    <HeaderColumnFilter
                      label={selectedShopLabel}
                      ariaLabel={t("preparedMeatInventory.filterShop")}
                      value={shopFilter}
                      options={shopOptions}
                      allLabel={t("preparedMeatInventory.allShops")}
                      open={openFilter === "shop"}
                      disabled={loading || shopOptions.length === 0}
                      containerRef={shopFilterRef}
                      onToggle={() =>
                        setOpenFilter((current) =>
                          current === "shop" ? null : "shop",
                        )
                      }
                      onSelect={(key) => {
                        setShopFilter(key);
                        setOpenFilter(null);
                        setPage(1);
                      }}
                    />
                  </th>
                  <th>{t("preparedMeatInventory.columns.product")}</th>
                  <th>{t("preparedMeatInventory.columns.inbound")}</th>
                  <th>{t("preparedMeatInventory.columns.outbound")}</th>
                  <th>{t("preparedMeatInventory.columns.balance")}</th>
                  <th>{t("preparedMeatInventory.columns.remark")}</th>
                  <th>{t("preparedMeatInventory.columns.actions")}</th>
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
                  <td>{formatMonthLabel(row.movementAt)}</td>
                  <td>{row.shopName || t("common.notSet")}</td>
                  <td>
                    <strong>{row.productName}</strong>
                  </td>
                  <td>{formatPackages(row.inboundPackages)}</td>
                  <td>{formatPackages(row.outboundPackages)}</td>
                  <td>
                    <strong>{formatPackages(row.balancePackages)}</strong>
                  </td>
                  <td>{row.remarks || t("common.notSet")}</td>
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      {row.kind === "inbound" || row.kind === "both" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          data-edit-form="inbound"
                          aria-label={t("preparedMeatInventory.editInbound")}
                          title={t("preparedMeatInventory.editInbound")}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      {row.kind === "outbound" || row.kind === "both" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          data-edit-form="outbound"
                          aria-label={t("preparedMeatInventory.editOutbound")}
                          title={t("preparedMeatInventory.editOutbound")}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {monthTotals ? (
                <tr className="raw-meat-calc-month-total-row">
                  <td colSpan={4}>
                    <strong>{t("preparedMeatInventory.monthTotal")}</strong>
                  </td>
                  <td>
                    <span className="raw-meat-calc-month-total-value">
                      {totalPackageFormatter.format(monthTotals.inboundPackages)}
                    </span>
                  </td>
                  <td>
                    <span className="raw-meat-calc-month-total-value">
                      {totalPackageFormatter.format(
                        monthTotals.outboundPackages,
                      )}
                    </span>
                  </td>
                  <td colSpan={3} />
                </tr>
              ) : null}
            </ListTable>
          )}

          <TablePagination
            summary={t("preparedMeatInventory.pagination", {
              from: visibleFrom,
              to: visibleTo,
              total: filteredMovements.length,
            })}
            page={page}
            totalPages={totalPages}
            loading={loading}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
            onPageChange={setPage}
            previousLabel={t("preparedMeatInventory.previous")}
            nextLabel={t("preparedMeatInventory.next")}
            pageLabel={t("preparedMeatInventory.pageOf")}
            jumpLabel={t("preparedMeatInventory.jumpToPage")}
          />
        </article>
      </div>

      <PreparedMeatOptionsModal
        open={optionsOpen}
        items={items}
        onClose={() => setOptionsOpen(false)}
        onSaveFlags={handleSaveItemFlags}
      />
      <PreparedMeatOutboundModal
        open={outboundOpen}
        items={items}
        onClose={() => setOutboundOpen(false)}
        onSaved={reload}
        loadCustomers={loadCustomers}
        loadShippingMethods={loadShippingMethods}
        loadOrderNumber={loadOrderNumber}
        createOutbound={createOutbound}
      />
    </section>
  );
}
