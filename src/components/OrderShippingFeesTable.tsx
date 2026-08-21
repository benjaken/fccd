import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, ReceiptText, Trash2 } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  archiveShippingFee,
  createShippingFee,
  fetchShippingFees,
  SHIPPING_FEES_PAGE_SIZE,
  updateShippingFee,
  type ShippingFee,
  type ShippingFeePage,
} from "@/lib/shipping-fees";

type FeesLoader = (page: number, pageSize: number) => Promise<ShippingFeePage>;

function ShippingFeePanel({
  open,
  row,
  onClose,
  onSaved,
  createFee,
  updateFee,
}: {
  open: boolean;
  row: ShippingFee | null;
  onClose: () => void;
  onSaved: () => void;
  createFee: typeof createShippingFee;
  updateFee: typeof updateShippingFee;
}) {
  const { t } = useTranslation();
  const [item, setItem] = useState("");
  const [fee, setFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItem(row?.item ?? "");
    setFee(row ? String(row.fee) : "");
    setError(null);
  }, [open, row]);

  const closeAndReset = () => {
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item.trim()) {
      setError("item_required");
      return;
    }
    const numericFee = Number(fee);
    if (fee.trim() === "" || !Number.isFinite(numericFee) || numericFee < 0) {
      setError("fee_invalid");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (row) {
        await updateFee(row.id, { item, fee: numericFee });
      } else {
        await createFee({ item, fee: numericFee });
      }
      onSaved();
      onClose();
    } catch {
      setError(row ? "update_failed" : "create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t(
        row
          ? "orderSettings.shippingFees.editTitle"
          : "orderSettings.shippingFees.createTitle",
      )}
      onClose={closeAndReset}
      closeLabel={t("orderSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("orderSettings.cancel")}
          </Button>
          <Button type="submit" form="shipping-fee-form" disabled={submitting}>
            {submitting
              ? t("orderSettings.shippingFees.saving")
              : t("orderSettings.shippingFees.saveAction")}
          </Button>
        </>
      }
    >
      <form
        id="shipping-fee-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.shippingFees.fields.item")}</span>
          <input
            value={item}
            autoComplete="off"
            aria-label={t("orderSettings.shippingFees.fields.item")}
            placeholder={t("orderSettings.shippingFees.fields.itemPlaceholder")}
            aria-invalid={error === "item_required"}
            onChange={(event) => setItem(event.target.value)}
          />
        </label>
        <label className="order-settings-field">
          <span>{t("orderSettings.shippingFees.fields.fee")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={fee}
            aria-label={t("orderSettings.shippingFees.fields.fee")}
            placeholder={t("orderSettings.shippingFees.fields.feePlaceholder")}
            aria-invalid={error === "fee_invalid"}
            onChange={(event) => setFee(event.target.value)}
          />
        </label>
        {error ? (
          <p className="list-inline-error" role="alert">
            {t(`orderSettings.shippingFees.errors.${error}`)}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderShippingFeesTable({
  loadFees = fetchShippingFees,
  createFee = createShippingFee,
  updateFee = updateShippingFee,
  deleteFee = archiveShippingFee,
  createOpen,
  onCreateOpenChange,
}: {
  loadFees?: FeesLoader;
  createFee?: typeof createShippingFee;
  updateFee?: typeof updateShippingFee;
  deleteFee?: typeof archiveShippingFee;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const [rows, setRows] = useState<ShippingFee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<ShippingFee | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / SHIPPING_FEES_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * SHIPPING_FEES_PAGE_SIZE + 1;
  const to = Math.min(page * SHIPPING_FEES_PAGE_SIZE, total);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void loadFees(page, SHIPPING_FEES_PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
        const lastPage = Math.max(
          1,
          Math.ceil(result.total / SHIPPING_FEES_PAGE_SIZE),
        );
        if (page > lastPage) setPage(lastPage);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadFees, page, reloadKey]);

  useEffect(() => {
    if (createOpen) setEditing(null);
  }, [createOpen]);

  const refresh = () => setReloadKey((value) => value + 1);
  const remove = async (row: ShippingFee) => {
    if (!canManage || deletingId) return;
    if (!window.confirm(t("orderSettings.shippingFees.deleteConfirm", { item: row.item }))) {
      return;
    }
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteFee(row.id);
      if (rows.length === 1 && page > 1) setPage((value) => value - 1);
      else refresh();
    } catch {
      setActionError(t("orderSettings.shippingFees.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div className="orders-state orders-state-error" role="alert">
        <ReceiptText />
        <div>
          <strong>{t("orderSettings.shippingFees.loadError")}</strong>
          <span>{t("orderSettings.shippingFees.loadErrorDescription")}</span>
        </div>
        <Button type="button" variant="outline" onClick={refresh}>
          {t("orderSettings.retry")}
        </Button>
      </div>
    );
  }

  return (
    <>
      {actionError ? (
        <p className="list-inline-error" role="alert">{actionError}</p>
      ) : null}
      <ListTable
        className="order-settings-table-wrap"
        loading={loading}
        loadingLabel={t("orderSettings.shippingFees.loading")}
        skeletonRows={SHIPPING_FEES_PAGE_SIZE}
        skeletonColumns={canManage ? 4 : 2}
        onRefresh={refresh}
        header={
          <tr>
            <th>{t("orderSettings.shippingFees.columns.item")}</th>
            <th>{t("orderSettings.shippingFees.columns.fee")}</th>
            {canManage ? (
              <>
                <th className="order-settings-action-col">
                  {t("orderSettings.shippingFees.columns.edit")}
                </th>
                <th className="order-settings-action-col">
                  {t("orderSettings.shippingFees.columns.delete")}
                </th>
              </>
            ) : null}
          </tr>
        }
      >
        {rows.length ? (
          rows.map((row) => (
            <tr key={row.id}>
              <td>{row.item}</td>
              <td>
                {new Intl.NumberFormat(i18n.language, {
                  style: "currency",
                  currency: "HKD",
                }).format(row.fee)}
              </td>
              {canManage ? (
                <>
                  <td className="table-actions-cell">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("orderSettings.shippingFees.edit", { item: row.item })}
                      title={t("orderSettings.shippingFees.edit", { item: row.item })}
                      onClick={() => {
                        onCreateOpenChange(false);
                        setEditing(row);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </td>
                  <td className="table-actions-cell">
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      disabled={deletingId === row.id}
                      aria-label={t("orderSettings.shippingFees.delete", { item: row.item })}
                      title={t("orderSettings.shippingFees.delete", { item: row.item })}
                      onClick={() => void remove(row)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </>
              ) : null}
            </tr>
          ))
        ) : !loading ? (
          <tr>
            <td colSpan={canManage ? 4 : 2} className="table-empty-cell">
              {t("orderSettings.shippingFees.empty")}
            </td>
          </tr>
        ) : null}
      </ListTable>
      <TablePagination
        summary={t("orderSettings.shippingFees.pagination", { from, to, total })}
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((value) => Math.max(1, value - 1))}
        onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        onPageChange={setPage}
        previousLabel={t("orderSettings.shippingFees.previous")}
        nextLabel={t("orderSettings.shippingFees.next")}
        pageLabel={t("orderSettings.shippingFees.pageOf")}
        jumpLabel={t("orderSettings.shippingFees.jumpToPage")}
      />
      <ShippingFeePanel
        open={createOpen || Boolean(editing)}
        row={editing}
        createFee={createFee}
        updateFee={updateFee}
        onClose={() => {
          onCreateOpenChange(false);
          setEditing(null);
        }}
        onSaved={() => {
          if (!editing) setPage(1);
          refresh();
        }}
      />
    </>
  );
}
