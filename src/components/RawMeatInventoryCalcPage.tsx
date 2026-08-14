import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Beef, RefreshCw, Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchRawMeatItems,
  fetchRawMeatMovementsForItem,
  RAW_MEAT_MOVEMENTS_PAGE_SIZE,
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
  { width: "5rem" },
  { width: "2.5rem" },
];

type ItemsLoader = () => Promise<RawMeatItemOption[]>;
type MovementsLoader = (
  itemId: string,
  productName: string,
) => Promise<RawMeatMovementRow[]>;

export function RawMeatInventoryCalcPage({
  loadItems = fetchRawMeatItems,
  loadMovements = fetchRawMeatMovementsForItem,
}: {
  loadItems?: ItemsLoader;
  loadMovements?: MovementsLoader;
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

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;

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
      new Intl.DateTimeFormat(i18n.language === "zh-HK" ? "en-GB" : i18n.language, {
        month: "short",
        year: "2-digit",
        timeZone: "Asia/Hong_Kong",
      }),
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
          if (current && nextItems.some((item) => item.id === current)) {
            return current;
          }
          return nextItems[0]?.id ?? null;
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

    void loadMovements(itemId, productName)
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
  }, [loadMovements, selectedItemId, selectedItem, reloadKey, t]);

  const reload = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

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
            variant="ghost"
            size="icon"
            aria-label={t("rawMeatInventory.settingsSoon")}
            title={t("rawMeatInventory.settingsSoon")}
            disabled
          >
            <Settings2 />
          </Button>
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
        <aside className="raw-meat-calc-sidebar panel" aria-label={t("rawMeatInventory.items")}>
          <div className="raw-meat-calc-sidebar-header">
            <strong>{t("rawMeatInventory.items")}</strong>
            <span>{items.length}</span>
          </div>
          {itemsLoading ? (
            <div className="raw-meat-calc-sidebar-state" role="status">
              {t("rawMeatInventory.loadingItems")}
            </div>
          ) : items.length === 0 ? (
            <div className="raw-meat-calc-sidebar-state">
              <Beef />
              <span>{t("rawMeatInventory.emptyItems")}</span>
            </div>
          ) : (
            <ul className="raw-meat-calc-item-list">
              {items.map((item) => {
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
              <Button type="button" disabled title={t("rawMeatInventory.comingSoon")}>
                {t("rawMeatInventory.addOption")}
              </Button>
              <Button type="button" disabled title={t("rawMeatInventory.comingSoon")}>
                {t("rawMeatInventory.stockIn")}
              </Button>
              <Button type="button" disabled title={t("rawMeatInventory.comingSoon")}>
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
                  <td>{row.remarks || t("common.notSet")}</td>
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
                        <X />
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
    </section>
  );
}
