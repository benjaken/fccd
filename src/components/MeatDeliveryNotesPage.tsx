import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Pencil, Trash2 } from "lucide-react";

import { PreparedMeatOutboundModal } from "@/components/PreparedMeatOutboundModal";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  deleteMeatDeliveryNote,
  fetchMeatDeliveryNotes,
  MEAT_DELIVERY_NOTES_PAGE_SIZE,
  type MeatDeliveryNoteListFilters,
  type MeatDeliveryNoteListResult,
  type MeatDeliveryNoteRow,
} from "@/lib/meat-delivery-notes";
import {
  fetchPreparedMeatItems,
  type PreparedMeatItemOption,
} from "@/lib/prepared-meat-inventory";

type NotesLoader = (
  filters: MeatDeliveryNoteListFilters,
) => Promise<MeatDeliveryNoteListResult>;
type NoteDeleter = (orderId: string) => Promise<string>;
type ItemsLoader = () => Promise<PreparedMeatItemOption[]>;
type OutboundModalProps = Pick<
  ComponentProps<typeof PreparedMeatOutboundModal>,
  | "loadCustomers"
  | "loadShippingMethods"
  | "loadOrderNumber"
  | "loadRawItems"
  | "loadStock"
  | "loadOutbound"
  | "createOutbound"
  | "updateOutbound"
  | "sendToFactory"
>;

const NOTE_SKELETON_COLUMNS = [
  { width: "8rem" },
  { width: "6rem" },
  { width: "10rem" },
  { width: "7rem" },
  { width: "10rem" },
  { width: "4.5rem", variant: "action" as const },
];

export function MeatDeliveryNotesPage({
  loadNotes = fetchMeatDeliveryNotes,
  deleteNote = deleteMeatDeliveryNote,
  loadItems = fetchPreparedMeatItems,
  loadCustomers,
  loadShippingMethods,
  loadOrderNumber,
  loadRawItems,
  loadStock,
  loadOutbound,
  createOutbound,
  updateOutbound,
  sendToFactory,
}: {
  loadNotes?: NotesLoader;
  deleteNote?: NoteDeleter;
  loadItems?: ItemsLoader;
} & OutboundModalProps) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<MeatDeliveryNoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<PreparedMeatItemOption[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / MEAT_DELIVERY_NOTES_PAGE_SIZE));
  const visibleFrom =
    total === 0 ? 0 : (page - 1) * MEAT_DELIVERY_NOTES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * MEAT_DELIVERY_NOTES_PAGE_SIZE, total);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "zh-HK" ? "en-GB" : i18n.language, {
        timeZone: "Asia/Hong_Kong",
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }),
    [i18n.language],
  );

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const formatDate = (value: string | null) => {
    if (!value) return t("common.notSet");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("common.notSet");
    return dateFormatter.format(date);
  };

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    let cancelled = false;
    void loadItems()
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadNotes({ page, search: appliedSearch })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("deliveryNotes.loadError"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedSearch, loadNotes, page, reloadKey, t]);

  const reload = () => setReloadKey((current) => current + 1);

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
    setPage(1);
  };

  const handleDelete = async (row: MeatDeliveryNoteRow) => {
    if (deletingId) return;
    const confirmed = window.confirm(t("deliveryNotes.deleteConfirm"));
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteNote(row.id);
      reload();
    } catch (saveError: unknown) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("deliveryNotes.deleteError"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="meat-customers-page meat-delivery-notes-page">
      <header className="page-heading meat-customers-heading">
        <div>
          <span className="eyebrow">{t("deliveryNotes.eyebrow")}</span>
          <h1>{t("deliveryNotes.title")}</h1>
        </div>
      </header>

      <article className="panel meat-customers-panel">
        <header className="meat-customers-toolbar">
          <ListSearchBar
            id="meat-delivery-notes-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("deliveryNotes.search")}
            placeholder={t("deliveryNotes.searchPlaceholder")}
            submitLabel={t("deliveryNotes.searchAction")}
          />
        </header>

        {actionError ? (
          <p className="list-inline-error">{actionError}</p>
        ) : null}

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("deliveryNotes.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button type="button" variant="outline" onClick={reload}>
              {t("deliveryNotes.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <ClipboardList />
            <div>
              <strong>{t("deliveryNotes.empty")}</strong>
              <span>{t("deliveryNotes.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <>
            <ListTable
              className="meat-customers-table-wrap"
              onRefresh={reload}
              loading={loading}
              loadingLabel={t("deliveryNotes.loading")}
              skeletonColumns={NOTE_SKELETON_COLUMNS}
              header={
                <tr>
                  <th>{t("deliveryNotes.columns.orderNumber")}</th>
                  <th>{t("deliveryNotes.columns.shippingDate")}</th>
                  <th>{t("deliveryNotes.columns.shop")}</th>
                  <th>{t("deliveryNotes.columns.shippingMethod")}</th>
                  <th>{t("deliveryNotes.columns.remarks")}</th>
                  <th aria-label={t("deliveryNotes.columns.actions")} />
                </tr>
              }
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{display(row.orderNumber)}</strong>
                  </td>
                  <td>{formatDate(row.shippingAt)}</td>
                  <td>{display(row.shopName)}</td>
                  <td>{display(row.shippingMethodName)}</td>
                  <td>{display(row.remarks)}</td>
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={deletingId === row.id}
                        aria-label={`${t("deliveryNotes.edit")} ${display(row.orderNumber)}`}
                        title={t("deliveryNotes.edit")}
                        onClick={() => setEditingOrderId(row.id)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={deletingId === row.id}
                        aria-label={`${t("deliveryNotes.delete")} ${display(row.orderNumber)}`}
                        title={t("deliveryNotes.delete")}
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
            <TablePagination
              summary={t("deliveryNotes.pagination", {
                from: visibleFrom,
                to: visibleTo,
                total,
              })}
              page={page}
              totalPages={totalPages}
              loading={loading}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => current + 1)}
              onPageChange={setPage}
              previousLabel={t("deliveryNotes.previous")}
              nextLabel={t("deliveryNotes.next")}
              pageLabel={t("deliveryNotes.pageOf")}
              jumpLabel={t("deliveryNotes.jumpToPage")}
            />
          </>
        )}
      </article>

      <PreparedMeatOutboundModal
        open={Boolean(editingOrderId)}
        orderId={editingOrderId}
        items={items}
        onClose={() => setEditingOrderId(undefined)}
        onSaved={() => {
          setEditingOrderId(undefined);
          reload();
        }}
        loadCustomers={loadCustomers}
        loadShippingMethods={loadShippingMethods}
        loadOrderNumber={loadOrderNumber}
        loadRawItems={loadRawItems}
        loadStock={loadStock}
        loadOutbound={loadOutbound}
        createOutbound={createOutbound}
        updateOutbound={updateOutbound}
        sendToFactory={sendToFactory}
      />
    </section>
  );
}
