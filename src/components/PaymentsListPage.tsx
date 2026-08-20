import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import { Modal } from "@/components/ui/modal";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchPayments,
  fetchPaymentFilterOptions,
  PAYMENTS_PAGE_SIZE,
  settlePayments,
  type PaymentListItem,
  type PaymentFilterOptions,
  type PaymentSettlementInput,
} from "@/lib/payments";

const PAYMENT_SKELETON_COLUMNS = [
  { width: "2.75rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "8rem" },
  { width: "7rem" },
  { width: "8rem" },
  { width: "7rem" },
  { width: "1.75rem", variant: "action" as const },
];

type DateFilterMode = "single" | "range";
type PayoutDateMode = "custom" | "payment";

function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function PaymentsListPage({
  canViewFinance,
  loadPayments = fetchPayments,
  loadPaymentFilterOptions = fetchPaymentFilterOptions,
  saveSettlement = settlePayments,
}: {
  canViewFinance: boolean;
  loadPayments?: typeof fetchPayments;
  loadPaymentFilterOptions?: typeof fetchPaymentFilterOptions;
  saveSettlement?: (input: PaymentSettlementInput) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("single");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentDateStart, setPaymentDateStart] = useState("");
  const [paymentDateEnd, setPaymentDateEnd] = useState("");
  const [channelId, setChannelId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [filterOptions, setFilterOptions] = useState<PaymentFilterOptions>({ channels: [], paymentMethods: [] });
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Map<string, PaymentListItem>>(new Map());
  const [manageOpen, setManageOpen] = useState(false);
  const [payoutDateMode, setPayoutDateMode] = useState<PayoutDateMode>("custom");
  const [payoutAt, setPayoutAt] = useState(localToday);
  const [charges, setCharges] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  const visibleFrom = total ? (page - 1) * PAYMENTS_PAGE_SIZE + 1 : 0;
  const visibleTo = Math.min(page * PAYMENTS_PAGE_SIZE, total);
  const selectedItems = [...selected.values()];
  const selectedChannelIds = new Set(selectedItems.map((item) => item.channelId));
  const selectedPaymentMethodIds = new Set(selectedItems.map((item) => item.paymentMethodId));
  const selectionCompatible =
    selectedItems.length > 0 &&
    selectedChannelIds.size === 1 &&
    selectedPaymentMethodIds.size === 1 &&
    !selectedChannelIds.has(null) &&
    !selectedPaymentMethodIds.has(null);
  const selectionWarning = selectedItems.length && !selectionCompatible
    ? selectedChannelIds.size > 1 || selectedPaymentMethodIds.size > 1
      ? t("payments.selectionMismatch")
      : t("payments.selectionMissingDetails")
    : null;
  const grossAmount = selectedItems.reduce((sum, item) => sum + item.amount, 0);
  const selectedTotal = `${grossAmount < 0 ? "-" : ""}$${Math.abs(grossAmount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const parsedCharges = charges.trim() === "" ? 0 : Number(charges);
  const effectiveCharges = payoutDateMode === "custom" ? parsedCharges : 0;
  const netAmount = grossAmount - effectiveCharges;
  const netAmountInvalid = payoutDateMode === "custom" && (
    !Number.isFinite(parsedCharges) || parsedCharges < 0 || netAmount < 0
  );
  const currencyCode = selectedItems[0]?.currency ?? "HKD";
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 2,
      }),
    [currencyCode, i18n.language],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    if (!canViewFinance) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadPayments({
        page,
        unreconciled: true,
        paymentDate: dateFilterMode === "single" ? paymentDate || null : null,
        paymentDateStart: dateFilterMode === "range" ? paymentDateStart || null : null,
        paymentDateEnd: dateFilterMode === "range" ? paymentDateEnd || null : null,
        channelId: channelId || null,
        paymentMethodId: paymentMethodId || null,
      });
      setItems(result.items);
      setTotal(result.total);
      setSelected((previous) => {
        const next = new Map(previous);
        result.items.forEach((item) => {
          if (next.has(item.id)) next.set(item.id, item);
        });
        return next;
      });
    } catch {
      setItems([]);
      setTotal(0);
      setError("payments_load_failed");
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, channelId, dateFilterMode, loadPayments, page, paymentDate, paymentDateEnd, paymentDateStart, paymentMethodId, reloadKey]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!canViewFinance) return;
    void loadPaymentFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions({ channels: [], paymentMethods: [] }));
  }, [canViewFinance, loadPaymentFilterOptions]);

  const togglePayment = (payment: PaymentListItem, checked: boolean) => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (checked) next.set(payment.id, payment);
      else next.delete(payment.id);
      return next;
    });
  };

  const togglePage = (checked: boolean) => {
    setSelected((previous) => {
      const next = new Map(previous);
      items.forEach((payment) => {
        if (checked) next.set(payment.id, payment);
        else next.delete(payment.id);
      });
      return next;
    });
  };

  const closeManage = () => {
    if (!saving) setManageOpen(false);
  };

  const submitSettlement = async () => {
    if (!selectionCompatible || saving || netAmountInvalid || (payoutDateMode === "custom" && !payoutAt)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveSettlement({
        paymentIds: selectedItems.map((item) => item.id),
        payoutDateMode,
        payoutAt: payoutDateMode === "custom" ? payoutAt : null,
        charges: payoutDateMode === "custom" ? parsedCharges : 0,
      });
      const reconciledIds = new Set(selectedItems.map((item) => item.id));
      setItems((previous) => previous.filter((item) => !reconciledIds.has(item.id)));
      setTotal((previous) => Math.max(0, previous - reconciledIds.size));
      setSelected(new Map());
      setManageOpen(false);
      setCharges("");
      setReloadKey((key) => key + 1);
    } catch {
      setSaveError("payments_save_failed");
    } finally {
      setSaving(false);
    }
  };

  if (!canViewFinance) {
    return (
      <OperationalListState
        icon={HandCoins}
        title={t("payments.restricted")}
        description={t("payments.restrictedDescription")}
      />
    );
  }

  const pageAllSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  return (
    <section className="orders-page payments-reconciliation-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("payments.eyebrow")}</span>
          <h1>{t("payments.title")}</h1>
        </div>
      </header>
      <article className="panel orders-panel payments-reconciliation-panel">
        <header className="orders-toolbar payments-reconciliation-toolbar">
          <label className="payments-date-filter-mode">
            <span>{t("payments.dateFilter")}</span>
            <select
              value={dateFilterMode}
              aria-label={t("payments.dateFilter")}
              onChange={(event) => {
                setDateFilterMode(event.target.value as DateFilterMode);
                setPage(1);
              }}
            >
              <option value="single">{t("payments.singleDate")}</option>
              <option value="range">{t("payments.dateRange")}</option>
            </select>
          </label>
          {dateFilterMode === "single" ? (
            <DatePicker id="payments-payment-date" value={paymentDate} onChange={(value) => { setPaymentDate(value); setPage(1); }} label={t("payments.paymentDate")} hideLabel />
          ) : (
            <DateRangePicker
              startId="payments-payment-date-start"
              endId="payments-payment-date-end"
              startValue={paymentDateStart}
              endValue={paymentDateEnd}
              onStartChange={(value) => { setPaymentDateStart(value); setPage(1); }}
              onEndChange={(value) => { setPaymentDateEnd(value); setPage(1); }}
              startLabel={t("payments.from")}
              endLabel={t("payments.to")}
              legend={t("payments.paymentDateRange")}
            />
          )}
          <div className="payments-filter-fields">
            <label className="payments-filter-field">
              <span>{t("payments.brandFilter")}</span>
              <select
                value={channelId}
                aria-label={t("payments.brandFilter")}
                onChange={(event) => { setChannelId(event.target.value); setPage(1); }}
              >
                <option value="">{t("payments.allBrands")}</option>
                {filterOptions.channels.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            <label className="payments-filter-field">
              <span>{t("payments.paymentMethodFilter")}</span>
              <select
                value={paymentMethodId}
                aria-label={t("payments.paymentMethodFilter")}
                onChange={(event) => { setPaymentMethodId(event.target.value); setPage(1); }}
              >
                <option value="">{t("payments.allPaymentMethods")}</option>
                {filterOptions.paymentMethods.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
          </div>
          <div className="payments-selection-actions">
            {selectedItems.length ? <span>{t("payments.selected", { count: selectedItems.length, amount: selectedTotal })}</span> : null}
            {selectionWarning ? <span className="payments-selection-warning" role="status">{selectionWarning}</span> : null}
            {selectionCompatible ? <Button type="button" onClick={() => { setSaveError(null); setManageOpen(true); }}>{t("payments.manage")}</Button> : null}
          </div>
        </header>
        {error ? (
          <OperationalListState icon={HandCoins} title={t("payments.loadError")} description={t("payments.loadErrorDescription")} retryLabel={t("payments.retry")} onRetry={() => setReloadKey((key) => key + 1)} />
        ) : !loading && !items.length ? (
          <OperationalListState icon={HandCoins} title={t("payments.empty")} description={t("payments.emptyDescription")} />
        ) : (
          <ListTable
            className="orders-table-wrap payments-reconciliation-table"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("payments.loading")}
            skeletonRows={PAYMENTS_PAGE_SIZE}
            skeletonColumns={PAYMENT_SKELETON_COLUMNS}
            header={<tr>
              <th className="payments-select-cell"><input type="checkbox" checked={pageAllSelected} disabled={!items.length || loading} onChange={(event) => togglePage(event.target.checked)} aria-label={t("payments.selectAll")} /></th>
              <th>{t("payments.columns.brand")}</th>
              <th>{t("payments.columns.order")}</th>
              <th>{t("payments.columns.paymentMethod")}</th>
              <th>{t("payments.columns.date")}</th>
              <th>{t("payments.columns.amount")}</th>
              <th>{t("payments.columns.reference")}</th>
              <th />
            </tr>}
          >
            {items.map((payment) => <tr key={payment.id}>
              <td className="payments-select-cell"><input type="checkbox" checked={selected.has(payment.id)} onChange={(event) => togglePayment(payment, event.target.checked)} aria-label={t("payments.selectPayment", { order: payment.orderNumber || payment.id })} /></td>
              <td>{payment.channelName || t("common.notSet")}</td>
              <td>{payment.orderId ? <DetailLink className="order-link" to={`/orders/${payment.orderId}`}>{payment.orderNumber || t("common.notSet")}</DetailLink> : payment.orderNumber || t("common.notSet")}</td>
              <td>{payment.paymentMethodName || t("common.notSet")}</td>
              <td>{payment.paymentAt ? date.format(new Date(payment.paymentAt)) : t("common.notSet")}</td>
              <td><strong>{payment.currency === "HKD" ? currency.format(payment.amount) : `${payment.currency} ${payment.amount}`}</strong></td>
              <td>{payment.reference || t("common.notSet")}</td>
              <td>{payment.orderId && <Button variant="ghost" size="icon" asChild><DetailLink to={`/orders/${payment.orderId}`} aria-label={`${t("payments.open")} ${payment.orderNumber || payment.id}`}><ChevronRight /></DetailLink></Button>}</td>
            </tr>)}
          </ListTable>
        )}
        <TablePagination
          summary={t("payments.pagination", { from: visibleFrom, to: visibleTo, total })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
          onPageChange={setPage}
          previousLabel={t("payments.previous")}
          nextLabel={t("payments.next")}
          pageLabel={t("payments.pageOf")}
          jumpLabel={t("payments.jumpToPage")}
        />
      </article>
      <Modal
        open={manageOpen}
        title={t("payments.manageTitle")}
        description={t("payments.manageDescription", { count: selectedItems.length })}
        onClose={closeManage}
        closeLabel={t("common.close")}
        size="sm"
        closeOnBackdrop={!saving}
        closeOnEscape={!saving}
        footer={<>
          <Button type="button" variant="outline" disabled={saving} onClick={closeManage}>{t("common.cancel")}</Button>
          <Button type="button" disabled={saving || netAmountInvalid || (payoutDateMode === "custom" && !payoutAt)} onClick={() => void submitSettlement()}>{saving ? t("payments.saving") : t("payments.confirm")}</Button>
        </>}
      >
        <div className="payments-manage-form">
          <div className="payments-manage-date-mode" role="radiogroup" aria-label={t("payments.payoutDateMode")}>
            <label><input type="radio" name="payout-date-mode" checked={payoutDateMode === "custom"} onChange={() => setPayoutDateMode("custom")} /> {t("payments.customDate")}</label>
            <label><input type="radio" name="payout-date-mode" checked={payoutDateMode === "payment"} onChange={() => { setPayoutDateMode("payment"); setCharges(""); }} /> {t("payments.paymentDateMode")}</label>
          </div>
          {payoutDateMode === "custom" ? <>
            <DatePicker id="payments-payout-date" value={payoutAt} onChange={setPayoutAt} label={t("payments.payoutDate")} className="payments-payout-date-picker" />
            <label className="payments-charge-field"><span>{t("payments.charges")}</span><div className="currency-input"><span aria-hidden="true">HK$</span><input type="number" min="0" step="0.01" value={charges} onChange={(event) => setCharges(event.target.value)} aria-invalid={netAmountInvalid} /></div></label>
          </> : <p className="payments-payment-date-note">{t("payments.paymentDateModeDescription")}</p>}
          <dl className="payments-settlement-totals">
            <div><dt>{t("payments.grossAmount")}</dt><dd>{currency.format(grossAmount)}</dd></div>
            <div><dt>{t("payments.charges")}</dt><dd>{currency.format(Number.isFinite(effectiveCharges) ? effectiveCharges : 0)}</dd></div>
            <div><dt>{t("payments.netAmount")}</dt><dd>{currency.format(Number.isFinite(netAmount) ? netAmount : 0)}</dd></div>
          </dl>
          {netAmountInvalid ? <p className="payments-form-error" role="alert">{t("payments.netAmountInvalid")}</p> : null}
          {saveError ? <p className="payments-form-error" role="alert">{t("payments.saveError")}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
