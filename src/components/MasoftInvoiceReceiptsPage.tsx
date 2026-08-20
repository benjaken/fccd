import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Pencil, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  fetchMasoftFilterOptions,
  fetchMasoftSettlements,
  fetchSettlementPaymentCandidates,
  assignMasoftInvoiceNumber,
  deleteMasoftSettlement,
  MASOFT_PAGE_SIZE,
  updateMasoftSettlement,
  type MasoftFilterOptions,
  type MasoftPayment,
  type MasoftSettlement,
} from "@/lib/masoft-invoice-receipts";

type DateMode = "single" | "range";

function dateValue(value: string | null) { return value ? value.slice(0, 10) : ""; }

function hasVerifiedOrderLinks(settlement: MasoftSettlement) {
  if (!settlement.payments.length || settlement.payments.some((payment) => !payment.orderId)) return false;
  const linkedTotal = settlement.payments.reduce((total, payment) => total + payment.amount, 0);
  return Math.abs(settlement.grossAmount - linkedTotal) < 0.01;
}

export function MasoftInvoiceReceiptsPage({ canViewFinance }: { canViewFinance: boolean }) {
  const { t, i18n } = useTranslation();
  const [dateMode, setDateMode] = useState<DateMode>("single");
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [channelId, setChannelId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [payoutAscending, setPayoutAscending] = useState(false);
  const [options, setOptions] = useState<MasoftFilterOptions>({ channels: [], paymentMethods: [] });
  const [items, setItems] = useState<MasoftSettlement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<MasoftSettlement | null>(null);
  const [candidates, setCandidates] = useState<MasoftPayment[]>([]);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [payoutAt, setPayoutAt] = useState("");
  const [charges, setCharges] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [selected, setSelected] = useState<Map<string, MasoftSettlement>>(new Map());
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [batchInvoiceNumber, setBatchInvoiceNumber] = useState("");
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceError, setInvoiceError] = useState(false);

  const load = useCallback(async () => {
    if (!canViewFinance) { setLoading(false); return; }
    setLoading(true); setError(false);
    try {
      const result = await fetchMasoftSettlements({ page, payoutDate: dateMode === "single" ? date || null : null, payoutDateStart: dateMode === "range" ? startDate || null : null, payoutDateEnd: dateMode === "range" ? endDate || null : null, channelId: channelId || null, paymentMethodId: methodId || null, payoutAscending });
      setItems(result.items);
      setTotal(result.total);
      setSelected((previous) => {
        const next = new Map(previous);
        result.items.forEach((item) => { if (next.has(item.id)) next.set(item.id, item); });
        return next;
      });
    } catch { setItems([]); setTotal(0); setError(true); }
    finally { setLoading(false); }
  }, [canViewFinance, channelId, date, dateMode, endDate, methodId, page, payoutAscending, reloadKey, startDate]);

  useEffect(() => void load(), [load]);
  useEffect(() => { if (canViewFinance) void fetchMasoftFilterOptions().then(setOptions).catch(() => setOptions({ channels: [], paymentMethods: [] })); }, [canViewFinance]);

  const formatter = useMemo(() => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD" }), [i18n.language]);
  const selectedPayments = candidates.filter((payment) => paymentIds.includes(payment.id));
  const gross = selectedPayments.reduce((total, payment) => total + payment.amount, 0);
  const isPendingEditing = editing ? !hasVerifiedOrderLinks(editing) : false;
  const displayedGross = isPendingEditing && editing ? editing.grossAmount : gross;
  const chargeAmount = charges.trim() === "" ? 0 : Number(charges);
  const invalid = !Number.isFinite(chargeAmount) || chargeAmount < 0 || displayedGross - chargeAmount < 0 || (!isPendingEditing && !paymentIds.length) || !payoutAt;
  const totalPages = Math.max(1, Math.ceil(total / MASOFT_PAGE_SIZE));
  const visibleFrom = total ? (page - 1) * MASOFT_PAGE_SIZE + 1 : 0;
  const visibleTo = Math.min(page * MASOFT_PAGE_SIZE, total);
  const resetPage = () => setPage(1);
  const selectedItems = [...selected.values()];
  const selectedNet = selectedItems.reduce((total, item) => total + item.netAmount, 0);
  const canDeleteEditing = editing ? !hasVerifiedOrderLinks(editing) : false;
  const pageAllSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const toggleSelection = (item: MasoftSettlement, checked: boolean) => setSelected((previous) => {
    const next = new Map(previous); if (checked) next.set(item.id, item); else next.delete(item.id); return next;
  });
  const togglePageSelection = (checked: boolean) => setSelected((previous) => {
    const next = new Map(previous); items.forEach((item) => { if (checked) next.set(item.id, item); else next.delete(item.id); }); return next;
  });
  const openInvoiceModal = () => { setBatchInvoiceNumber(""); setInvoiceError(false); setInvoiceModalOpen(true); };
  const saveInvoiceNumber = async () => {
    if (!selectedItems.length || !batchInvoiceNumber.trim() || invoiceSaving) return;
    setInvoiceSaving(true); setInvoiceError(false);
    try { await assignMasoftInvoiceNumber(selectedItems.map((item) => item.id), batchInvoiceNumber); setSelected(new Map()); setInvoiceModalOpen(false); setReloadKey((key) => key + 1); }
    catch { setInvoiceError(true); }
    finally { setInvoiceSaving(false); }
  };

  const openEdit = (settlement: MasoftSettlement) => {
    setEditing(settlement); setCandidates(settlement.payments); setPaymentIds(settlement.payments.map((payment) => payment.id));
    setInvoiceNumber(settlement.invoiceNumber ?? ""); setReceiptNumber(settlement.receiptNumber ?? ""); setPayoutAt(dateValue(settlement.payoutAt)); setCharges(String(settlement.charges)); setSaveError(false); setDeleteError(false);
    void fetchSettlementPaymentCandidates(settlement).then(setCandidates).catch(() => setCandidates(settlement.payments));
  };
  const togglePayment = (id: string) => setPaymentIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const save = async () => {
    if (!editing || invalid || saving) return;
    setSaving(true); setSaveError(false);
    try {
      await updateMasoftSettlement({ settlementId: editing.id, invoiceNumber, receiptNumber, payoutAt, charges: chargeAmount, paymentIds, preservePaymentAmount: isPendingEditing });
      setEditing(null); setReloadKey((key) => key + 1);
    } catch { setSaveError(true); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editing || deleting || !window.confirm(t("masoft.deleteConfirm"))) return;
    setDeleting(true); setDeleteError(false);
    try {
      await deleteMasoftSettlement(editing.id);
      setSelected((previous) => { const next = new Map(previous); next.delete(editing.id); return next; });
      setEditing(null); setReloadKey((key) => key + 1);
    } catch { setDeleteError(true); }
    finally { setDeleting(false); }
  };

  if (!canViewFinance) return <OperationalListState icon={ReceiptText} title={t("masoft.restricted")} description={t("masoft.restrictedDescription")} />;

  return <section className="orders-page masoft-page">
    <header className="page-heading orders-heading"><div><span className="eyebrow">{t("masoft.eyebrow")}</span><h1>{t("masoft.title")}</h1><p>{t("masoft.description")}</p></div></header>
    <article className="panel orders-panel">
      <header className="orders-toolbar payments-reconciliation-toolbar">
        <label className="payments-date-filter-mode"><span>{t("masoft.payoutFilter")}</span><select value={dateMode} onChange={(event) => { setDateMode(event.target.value as DateMode); resetPage(); }}><option value="single">{t("masoft.singleDate")}</option><option value="range">{t("masoft.dateRange")}</option></select></label>
        {dateMode === "single" ? <DatePicker id="masoft-payout-date" value={date} onChange={(value) => { setDate(value); resetPage(); }} label={t("masoft.payoutFilter")} hideLabel /> : <DateRangePicker startId="masoft-payout-start" endId="masoft-payout-end" startValue={startDate} endValue={endDate} onStartChange={(value) => { setStartDate(value); resetPage(); }} onEndChange={(value) => { setEndDate(value); resetPage(); }} startLabel={t("masoft.from")} endLabel={t("masoft.to")} legend={t("masoft.payoutRange")} />}
        <div className="payments-filter-fields">
          <label className="payments-filter-field"><span>{t("masoft.brand")}</span><select value={channelId} onChange={(event) => { setChannelId(event.target.value); resetPage(); }}><option value="">{t("masoft.allBrands")}</option>{options.channels.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="payments-filter-field"><span>{t("masoft.paymentMethod")}</span><select value={methodId} onChange={(event) => { setMethodId(event.target.value); resetPage(); }}><option value="">{t("masoft.allPaymentMethods")}</option>{options.paymentMethods.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        </div>
        {selectedItems.length ? <div className="masoft-selection-actions"><span>{t("masoft.selected", { count: selectedItems.length, amount: formatter.format(selectedNet) })}</span><Button type="button" variant="outline" onClick={openInvoiceModal}>{t("masoft.addInvoice")}</Button></div> : null}
      </header>
      {error ? <OperationalListState icon={ReceiptText} title={t("masoft.loadError")} description={t("masoft.loadErrorDescription")} retryLabel={t("masoft.retry")} onRetry={() => setReloadKey((key) => key + 1)} /> : !loading && !items.length ? <OperationalListState icon={ReceiptText} title={t("masoft.empty")} description={t("masoft.emptyDescription")} /> : <ListTable className="orders-table-wrap masoft-table" loading={loading} loadingLabel={t("masoft.loading")} skeletonColumns={11} skeletonRows={MASOFT_PAGE_SIZE} onRefresh={() => setReloadKey((key) => key + 1)} header={<tr><th className="payments-select-cell"><input type="checkbox" checked={pageAllSelected} disabled={!items.length || loading} onChange={(event) => togglePageSelection(event.target.checked)} aria-label={t("masoft.selectAll")} /></th><th>{t("masoft.columns.invoice")}</th><th>{t("masoft.columns.brand")}</th><th><button type="button" className="table-sort-button" onClick={() => { setPayoutAscending((value) => !value); resetPage(); }} aria-label={t("masoft.sortPayoutDate")}>{t("masoft.columns.payout")}{payoutAscending ? <ArrowUp /> : <ArrowDown />}</button></th><th>{t("masoft.columns.orders")}</th><th>{t("masoft.columns.paymentMethod")}</th><th>{t("masoft.columns.gross")}</th><th>{t("masoft.columns.charges")}</th><th>{t("masoft.columns.net")}</th><th>{t("masoft.columns.receipt")}</th><th /></tr>}>
        {items.map((item) => <tr key={item.id}><td className="payments-select-cell"><input type="checkbox" checked={selected.has(item.id)} onChange={(event) => toggleSelection(item, event.target.checked)} aria-label={t("masoft.selectRecord", { value: item.invoiceNumber || item.id })} /></td><td>{item.invoiceNumber || "—"}</td><td>{item.channelName || "—"}</td><td>{item.payoutAt ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "Asia/Hong_Kong" }).format(new Date(item.payoutAt)) : "—"}</td><td><div className="masoft-orders-cell">{hasVerifiedOrderLinks(item) ? item.payments.map((payment) => <DetailLink key={payment.id} className="masoft-order-tag" to={`/orders/${payment.orderId}`}>{payment.orderNumber || "—"}</DetailLink>) : <span className="masoft-order-pending">{t("masoft.pendingConfirmation")}</span>}</div></td><td>{item.paymentMethodName || "—"}</td><td>{formatter.format(item.grossAmount)}</td><td>{formatter.format(item.charges)}</td><td><strong>{formatter.format(item.netAmount)}</strong></td><td>{item.receiptNumber || "—"}</td><td><Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label={t("masoft.edit")}><Pencil /></Button></td></tr>)}
      </ListTable>}
      <TablePagination summary={t("masoft.pagination", { from: visibleFrom, to: visibleTo, total })} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} onPageChange={setPage} previousLabel={t("masoft.previous")} nextLabel={t("masoft.next")} pageLabel={t("masoft.pageOf")} jumpLabel={t("masoft.jumpToPage")} />
    </article>
    <SidePanel open={Boolean(editing)} title={t("masoft.editTitle")} description={t("masoft.editDescription")} onClose={() => !saving && !deleting && setEditing(null)} closeLabel={t("common.close")} wide footer={<>{canDeleteEditing ? <Button variant="destructive" disabled={saving || deleting} onClick={() => void remove()}>{deleting ? t("masoft.deleting") : t("masoft.delete")}</Button> : null}<Button variant="outline" disabled={saving || deleting} onClick={() => setEditing(null)}>{t("common.cancel")}</Button>{!canDeleteEditing ? <Button disabled={saving || deleting || invalid} onClick={() => void save()}>{saving ? t("masoft.saving") : t("masoft.save")}</Button> : null}</>}>
      <div className="masoft-edit-form"><label><span>{t("masoft.invoice")}</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label><label><span>{t("masoft.receipt")}</span><input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} /></label><DatePicker id="masoft-edit-payout" value={payoutAt} onChange={setPayoutAt} label={t("masoft.payoutDate")} /><label><span>{t("masoft.charges")}</span><div className="currency-input"><span aria-hidden="true">HK$</span><input type="number" min="0" step="0.01" value={charges} onChange={(event) => setCharges(event.target.value)} /></div></label><fieldset hidden={!(editing && hasVerifiedOrderLinks(editing))}><legend>{t("masoft.paymentOrders")}</legend>{candidates.map((payment) => <label key={payment.id} className="masoft-payment-option"><input type="checkbox" checked={paymentIds.includes(payment.id)} onChange={() => togglePayment(payment.id)} /><span>{payment.orderNumber || "—"}</span><strong>{formatter.format(payment.amount)}</strong></label>)}</fieldset><dl className="payments-settlement-totals"><div><dt>{t("masoft.gross")}</dt><dd>{formatter.format(displayedGross)}</dd></div><div><dt>{t("masoft.charges")}</dt><dd>{formatter.format(Number.isFinite(chargeAmount) ? chargeAmount : 0)}</dd></div><div><dt>{t("masoft.net")}</dt><dd>{formatter.format(Number.isFinite(displayedGross - chargeAmount) ? displayedGross - chargeAmount : 0)}</dd></div></dl>{invalid ? <p className="payments-form-error">{t("masoft.netInvalid")}</p> : null}{saveError ? <p className="payments-form-error">{t("masoft.saveError")}</p> : null}{deleteError ? <p className="payments-form-error">{t("masoft.deleteError")}</p> : null}</div>
    </SidePanel>
    <Modal open={invoiceModalOpen} title={t("masoft.addInvoice")} description={t("masoft.invoiceModalDescription", { count: selectedItems.length, amount: formatter.format(selectedNet) })} onClose={() => !invoiceSaving && setInvoiceModalOpen(false)} closeLabel={t("common.close")} size="sm" closeOnBackdrop={!invoiceSaving} closeOnEscape={!invoiceSaving} footer={<Button disabled={invoiceSaving || !batchInvoiceNumber.trim()} onClick={() => void saveInvoiceNumber()}>{invoiceSaving ? t("masoft.saving") : t("masoft.submit")}</Button>}>
      <div className="masoft-edit-form"><label><span>{t("masoft.invoice")}</span><input autoFocus value={batchInvoiceNumber} onChange={(event) => setBatchInvoiceNumber(event.target.value)} placeholder={t("masoft.invoicePlaceholder")} /></label>{invoiceError ? <p className="payments-form-error">{t("masoft.invoiceSaveError")}</p> : null}</div>
    </Modal>
  </section>;
}
