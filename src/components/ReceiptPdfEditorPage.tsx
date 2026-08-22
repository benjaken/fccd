import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, LoaderCircle, Minus, Plus, Printer } from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PdfAutoResizeTextarea } from "@/components/PdfAutoResizeTextarea";
import { QuoteClauseSearchPicker } from "@/components/QuoteClauseSearchPicker";
import { getBrandLogoAlt, getDocumentLogoPath } from "@/lib/brand-logo";
import {
  fetchOrderDetail,
  type DetailLine,
  type OrderDetailResult,
} from "@/lib/order-details";
import {
  receiptPdfDraftStorageKey,
  type ReceiptPdfDraft,
  type ReceiptPdfLineDraft,
} from "@/lib/receipt-pdf-draft";
import { PAYMENT_METHOD_OPTIONS, TERM_OPTIONS } from "@/lib/quote-clause-options";
import { fetchShippingFees, type ShippingFee } from "@/lib/shipping-fees";

type ReceiptPdfLoader = typeof fetchOrderDetail;
type ShippingFeeLoader = () => Promise<ShippingFee[]>;
type FinancialDocumentKind = "receipt" | "invoice";

const fetchConfiguredShippingFees: ShippingFeeLoader = async () =>
  (await fetchShippingFees(1, 1000)).rows;

function pdfDate(value: string | null | undefined) {
  if (!value) return "";
  const isoDate = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoDate) return value;
  return `${Number(isoDate[3])}/${Number(isoDate[2])}/${isoDate[1]}`;
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function documentNumber(value: string | null | undefined, prefix: "REC" | "INV") {
  const number = value?.trim() ?? "";
  if (!number) return `${prefix}/`;
  return number.toUpperCase().startsWith(`${prefix}/`) ? number : `${prefix}/${number}`;
}

function money(value: number, decimals = false) {
  return `$${value.toLocaleString("en-HK", {
    minimumFractionDigits: decimals ? 2 : Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function ReceiptPdfPageFooter({ page, total }: { page: number; total: number }) {
  return (
    <footer className="receipt-pdf-page-footer">
      <span>5D-G Wah Lik Ind Ctr Tsuen Wan</span>
      <span>(+852) 2185 7373 / 5396 4335</span>
      <span>sales@hkpartyfood.com</span>
      <span>{`第${page}頁 | 共${total}頁`}</span>
    </footer>
  );
}

function lineToDraft(line: DetailLine): ReceiptPdfLineDraft {
  return {
    id: line.id,
    description: line.productName || line.content || "",
    unitPrice: line.unitPrice === null ? "0" : String(line.unitPrice),
    quantity: line.quantity === null ? "" : String(line.quantity),
  };
}

function resultToDraft(
  result: OrderDetailResult,
  documentKind: FinancialDocumentKind,
): ReceiptPdfDraft {
  const order = result.order;
  const outstanding = order?.outstanding ?? 0;
  const receiptNumber = result.payments
    .map((payment) => payment.receiptNumber?.trim() || payment.receiptReference?.trim())
    .find(Boolean);
  return {
    invoiceSourceContentVersion: 1,
    receiptNumber: documentNumber(
      documentKind === "receipt" ? receiptNumber : undefined,
      documentKind === "receipt" ? "REC" : "INV",
    ),
    customer: order?.companyName || order?.customerName || "",
    contactPerson: [order?.contactA, order?.contactB].filter(Boolean).join(" / "),
    deliveryAddress: order?.address || "",
    invoiceDate: pdfDate(order?.createdAt || order?.updatedAt),
    deliveryDate: pdfDate(order?.deliveryAt),
    deliveryTime: order?.deliveryTime || order?.shipOutTime || "",
    lines: result.lines.length
      ? result.lines.map(lineToDraft)
      : [{ id: "receipt-line-1", description: "", unitPrice: "0", quantity: "1" }],
    deliveryFeeId: "",
    deliveryFeeLabel: "Delivery Fee",
    deliveryFee: order?.shippingFee ? String(order.shippingFee) : "",
    paymentInformation:
      outstanding > 0
        ? `Outstanding: ${money(outstanding, true)}`
        : "Payment Status: Paid",
    receiptPayments: documentKind === "receipt"
      ? result.payments.map((payment) => ({
          id: payment.id,
          method: payment.paymentMethod || "",
          date: pdfDate(payment.paymentAt),
          amount: payment.amount.toLocaleString("en-HK", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        }))
      : [],
    terms: documentKind === "invoice" ? result.terms : [],
    paymentMethods: documentKind === "invoice" ? result.paymentMethods : [],
    showCustomerSignature: false,
    trailingStartsNewPage:
      documentKind === "invoice" &&
      (result.lines.length >= 8 || result.terms.length + result.paymentMethods.length >= 6),
  };
}

function normalizeDraft(
  value: Partial<ReceiptPdfDraft> | null | undefined,
  fallback: ReceiptPdfDraft,
): ReceiptPdfDraft {
  if (!value || typeof value !== "object") return fallback;
  const sourceContentInitialized = value.invoiceSourceContentVersion === 1;
  const storedTerms = Array.isArray(value.terms)
    ? value.terms.filter((item): item is string => typeof item === "string")
    : null;
  const storedPaymentMethods = Array.isArray(value.paymentMethods)
    ? value.paymentMethods.filter((item): item is string => typeof item === "string")
    : null;
  return {
    ...fallback,
    ...value,
    receiptNumber: fallback.receiptNumber,
    invoiceSourceContentVersion: 1,
    terms: storedTerms && (sourceContentInitialized || storedTerms.length)
      ? storedTerms
      : fallback.terms,
    paymentMethods: storedPaymentMethods && (sourceContentInitialized || storedPaymentMethods.length)
      ? storedPaymentMethods
      : fallback.paymentMethods,
    receiptPayments: Array.isArray(value.receiptPayments)
      ? value.receiptPayments.map((payment, index) => ({
          id: typeof payment?.id === "string" ? payment.id : `receipt-payment-${index + 1}`,
          method: typeof payment?.method === "string" ? payment.method : "",
          date: typeof payment?.date === "string" ? payment.date : "",
          amount: typeof payment?.amount === "string" && payment.amount.trim() ? payment.amount : "0",
        }))
      : fallback.receiptPayments,
    lines: Array.isArray(value.lines) && value.lines.length
      ? value.lines.map((line, index) => ({
          id: typeof line?.id === "string" ? line.id : `receipt-line-${index + 1}`,
          description: typeof line?.description === "string" ? line.description : "",
          unitPrice: typeof line?.unitPrice === "string" && line.unitPrice.trim() ? line.unitPrice : "0",
          quantity: typeof line?.quantity === "string" ? line.quantity : "1",
        }))
      : fallback.lines,
  };
}

export function ReceiptPdfEditorPage({
  loadDetail = fetchOrderDetail,
  loadShippingFees = fetchConfiguredShippingFees,
  documentKind = "receipt",
}: {
  loadDetail?: ReceiptPdfLoader;
  loadShippingFees?: ShippingFeeLoader;
  documentKind?: FinancialDocumentKind;
}) {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [draft, setDraft] = useState<ReceiptPdfDraft | null>(null);
  const [sourceBrand, setSourceBrand] = useState({
    channelName: "",
    shopifyStoreDomain: "",
    orderNumber: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(true);
  const [shippingFees, setShippingFees] = useState<ShippingFee[]>([]);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termSearch, setTermSearch] = useState("");
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const storageKey = receiptPdfDraftStorageKey(id, documentKind);
  const isInvoice = documentKind === "invoice";
  const documentTitle = isInvoice ? "INVOICE" : "RECEIPT";
  const documentName = isInvoice ? "發票" : "收據";

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadDetail(id, "order", true);
      if (!result.order) throw new Error("not-found");
      const fallback = resultToDraft(result, documentKind);
      const stored = window.localStorage.getItem(storageKey);
      setSourceBrand({
        channelName: result.order.channelName || "",
        shopifyStoreDomain: result.order.shopifyStoreDomain || "",
        orderNumber: result.order.orderNumber || "",
      });
      setDraft(
        stored
          ? normalizeDraft(JSON.parse(stored) as Partial<ReceiptPdfDraft>, fallback)
          : fallback,
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [documentKind, id, loadDetail, storageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void loadShippingFees()
      .then((fees) => {
        if (active) setShippingFees(fees);
      })
      .catch(() => {
        if (active) setShippingFees([]);
      });
    return () => {
      active = false;
    };
  }, [loadShippingFees]);

  useEffect(() => {
    if (!draft) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
      setSaved(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, storageKey]);

  const totals = useMemo(() => {
    const subtotal = (draft?.lines ?? []).reduce(
      (sum, line) => sum + numberValue(line.unitPrice) * numberValue(line.quantity),
      0,
    );
    const deliveryFee = numberValue(draft?.deliveryFee ?? "");
    return { subtotal, grandTotal: subtotal + deliveryFee };
  }, [draft]);

  const update = <K extends keyof ReceiptPdfDraft>(
    key: K,
    value: ReceiptPdfDraft[K],
  ) => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateLine = (index: number, patch: Partial<ReceiptPdfLineDraft>) => {
    if (!draft) return;
    update(
      "lines",
      draft.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  };

  const selectDeliveryFee = (deliveryFeeId: string) => {
    const selected = shippingFees.find((fee) => fee.id === deliveryFeeId);
    setSaved(false);
    setDraft((current) => current ? {
      ...current,
      deliveryFeeId,
      deliveryFeeLabel: selected?.item ?? "Delivery Fee",
      deliveryFee: selected ? String(selected.fee) : "",
    } : current);
  };

  const addDraftItem = (key: "terms" | "paymentMethods", value: string) => {
    const text = value.trim();
    if (!draft || !text || draft[key].includes(text)) return;
    update(key, [...draft[key], text]);
    if (key === "terms") setTermSearch("");
    else setPaymentSearch("");
  };

  const updateReceiptPayment = (
    index: number,
    patch: Partial<ReceiptPdfDraft["receiptPayments"][number]>,
  ) => {
    if (!draft) return;
    update("receiptPayments", draft.receiptPayments.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, ...patch } : payment));
  };

  if (loading) {
    return <div className="quote-pdf-state"><LoaderCircle className="spin" />正在載入{documentName}…</div>;
  }
  if (error || !draft) {
    return <div className="quote-pdf-state"><span>無法載入{documentName}。</span><Button variant="outline" onClick={() => void load()}>重新載入</Button></div>;
  }

  const brandLogo = getDocumentLogoPath(
    sourceBrand.channelName,
    sourceBrand.shopifyStoreDomain,
    sourceBrand.orderNumber,
  );
  const brandLogoAlt = getBrandLogoAlt(
    sourceBrand.channelName,
    sourceBrand.shopifyStoreDomain,
    sourceBrand.orderNumber,
  );
  const invoiceTermsHaveContent = draft.terms.some((item) => item.trim());
  const invoicePaymentsHaveContent = draft.paymentMethods.some((item) => item.trim());
  const totalPdfPages = draft.trailingStartsNewPage ? 2 : 1;
  const letterhead = (
    <header className="receipt-pdf-letterhead">
      <img src={brandLogo} alt={brandLogoAlt} />
      <div className={`receipt-pdf-document-heading${isInvoice ? " is-invoice" : ""}`}>
        <h1>{documentTitle}</h1>
        {!isInvoice ? (
          <input aria-label={`${documentName}編號`} value={draft.receiptNumber} readOnly />
        ) : null}
      </div>
    </header>
  );
  const trailingLabel = isInvoice ? "條款、付款方式及簽署" : "付款資料及公司蓋章";
  const trailingControls = (
    <div className="quote-pdf-page-controls receipt-pdf-page-controls" aria-label={isInvoice ? "條款、付款方式及簽署分頁控制" : "付款及蓋章分頁控制"}>
      <Button variant="outline" disabled={draft.trailingStartsNewPage} onClick={() => update("trailingStartsNewPage", true)}><ChevronDown />下移一頁</Button>
      <Button variant="outline" disabled={!draft.trailingStartsNewPage} onClick={() => update("trailingStartsNewPage", false)}><ChevronUp />上移一頁</Button>
      <span>{draft.trailingStartsNewPage ? `${trailingLabel}已移至下一頁` : `${trailingLabel}接續在本頁`}</span>
    </div>
  );
  const receiptTrailingContent = (
    <div className="receipt-pdf-trailing" aria-label="付款資料及公司蓋章">
      <section className="receipt-pdf-payment">
        <strong>Payment information:</strong>
        <input className="receipt-pdf-payment-summary-input" aria-label="付款資料" size={Math.max(draft.paymentInformation.length, 1)} value={draft.paymentInformation} onChange={(event) => update("paymentInformation", event.target.value)} />
        {draft.receiptPayments.map((payment, index) => {
          const suffix = draft.receiptPayments.length > 1 ? ` ${index + 1}` : "";
          return (
            <div className="receipt-pdf-payment-record" key={payment.id}>
              <label><span>{`Payment Method${suffix}:`}</span><input aria-label={`付款方式${suffix}`} size={Math.max(payment.method.length, 1)} value={payment.method} onChange={(event) => updateReceiptPayment(index, { method: event.target.value })} /><span className="receipt-pdf-payment-amount"><span aria-hidden="true">$</span><input aria-label={`支付金額${suffix}`} inputMode="decimal" size={Math.max(payment.amount.length, 1)} value={payment.amount} onChange={(event) => updateReceiptPayment(index, { amount: event.target.value })} onBlur={() => { if (!payment.amount.trim()) updateReceiptPayment(index, { amount: "0" }); }} /></span></label>
              <label><span>{`Payment Date${suffix}:`}</span><input aria-label={`付款日期${suffix}`} size={Math.max(payment.date.length, 1)} value={payment.date} onChange={(event) => updateReceiptPayment(index, { date: event.target.value })} /></label>
            </div>
          );
        })}
      </section>

      <section className="receipt-pdf-signature" aria-label="公司簽署">
        <span>For and on behalf of</span>
        <strong>Food Channels Limited</strong>
        <img src="/assets/fc-ltd-stamp.avif" alt="Food Channels Limited 公司蓋印" />
        <span>Authorized Signature &amp; Co. Chop</span>
      </section>
    </div>
  );
  const invoiceNotes = (
    <section className={`quote-pdf-notes receipt-invoice-notes${!invoiceTermsHaveContent && !invoicePaymentsHaveContent ? " is-empty" : ""}`} aria-label="條款及付款方式">
      <section className={`quote-pdf-note-block receipt-invoice-note-block${!invoiceTermsHaveContent ? " is-empty" : ""}`}>
        <button type="button" className="quote-pdf-note-heading quote-pdf-edit-only" onClick={() => setTermsOpen(true)}>條款及細則：<Plus aria-hidden="true" /></button>
        <strong className="quote-pdf-print-only receipt-invoice-print-heading">條款及細則：</strong>
        <ol>{draft.terms.map((item, index) => <li className={`receipt-invoice-clause${item.trim() ? "" : " is-empty"}`} key={`invoice-term-${index}`}><textarea rows={1} aria-label={`條款及細則 ${index + 1}`} value={item} onChange={(event) => update("terms", draft.terms.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /><button type="button" className="quote-pdf-edit-only receipt-invoice-clause-delete" aria-label={`刪除條款及細則 ${index + 1}`} onClick={() => update("terms", draft.terms.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></li>)}</ol>
      </section>
      <section className={`quote-pdf-note-block receipt-invoice-note-block${!invoicePaymentsHaveContent ? " is-empty" : ""}`}>
        <button type="button" className="quote-pdf-note-heading quote-pdf-edit-only" onClick={() => setPaymentsOpen(true)}>付款方式：<Plus aria-hidden="true" /></button>
        <strong className="quote-pdf-print-only receipt-invoice-print-heading">付款方式：</strong>
        <ol>{draft.paymentMethods.map((item, index) => <li className={`receipt-invoice-clause${item.trim() ? "" : " is-empty"}`} key={`invoice-payment-${index}`}><textarea rows={1} aria-label={`付款方式 ${index + 1}`} value={item} onChange={(event) => update("paymentMethods", draft.paymentMethods.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /><button type="button" className="quote-pdf-edit-only receipt-invoice-clause-delete" aria-label={`刪除付款方式 ${index + 1}`} onClick={() => update("paymentMethods", draft.paymentMethods.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></li>)}</ol>
      </section>
    </section>
  );
  const invoiceSignature = (
    <>
      <label className="quote-pdf-customer-signature-toggle receipt-invoice-customer-toggle quote-pdf-edit-only">
        <input type="checkbox" checked={draft.showCustomerSignature} onChange={(event) => update("showCustomerSignature", event.target.checked)} />
        顯示客戶簽署
      </label>
      <section className={`quote-pdf-signature receipt-invoice-signature${draft.showCustomerSignature ? " has-customer-signature" : ""}`} aria-label="發票簽署">
        <div className="quote-pdf-signature-party quote-pdf-signature-issuer">
          <strong>發出者：</strong>
          <em>Food Channels Limited</em>
          <img src="/assets/fc-ltd-stamp.avif" alt="Food Channels Limited 公司蓋印" />
          <label><strong>公司蓋印：</strong><span /></label>
        </div>
        {draft.showCustomerSignature ? (
          <div className="quote-pdf-signature-party quote-pdf-signature-customer">
            <strong>請仔細閱讀以上內容並簽署確認：</strong>
            <em>{draft.customer || "客戶"}</em>
            <span className="quote-pdf-signature-stamp-spacer" aria-hidden="true" />
            <label><strong>公司蓋印及簽署：</strong><span /></label>
            <label><strong>負責人姓名：</strong><span /></label>
            <label><strong>簽署日期：</strong><span /></label>
          </div>
        ) : null}
      </section>
    </>
  );
  const invoiceTrailingContent = (
    <div className="receipt-invoice-trailing" aria-label="條款、付款方式及簽署">
      {invoiceNotes}
      {invoiceSignature}
    </div>
  );
  const trailingContent = isInvoice ? invoiceTrailingContent : receiptTrailingContent;

  return (
    <section className="quote-pdf-editor receipt-pdf-editor">
      <div className="quote-pdf-toolbar receipt-pdf-toolbar">
        <div>
          <strong>{documentName}工作稿</strong>
          <span>所有白色欄位均可直接編輯</span>
        </div>
        <div>
          <span className="quote-pdf-saved">{saved ? <><Check /> 已自動儲存</> : "自動儲存中…"}</span>
          <Button onClick={() => window.print()}><Printer />確定並列印 PDF</Button>
        </div>
      </div>

      <main className="quote-pdf-sheet receipt-pdf-sheet" aria-label={`${documentName} PDF`}>
        {letterhead}

        <div className="receipt-pdf-meta-grid">
          <label htmlFor="receipt-customer">Customer:</label>
          <input id="receipt-customer" value={draft.customer} onChange={(event) => update("customer", event.target.value)} />
          <label htmlFor="receipt-invoice-date">Invoice Date:</label>
          <input id="receipt-invoice-date" value={draft.invoiceDate} onChange={(event) => update("invoiceDate", event.target.value)} />
          <label htmlFor="receipt-contact">Contact Person:</label>
          <input id="receipt-contact" value={draft.contactPerson} onChange={(event) => update("contactPerson", event.target.value)} />
          <label htmlFor="receipt-delivery-date">Delivery Date:</label>
          <input id="receipt-delivery-date" value={draft.deliveryDate} onChange={(event) => update("deliveryDate", event.target.value)} />
          <label htmlFor="receipt-address">Delivery Address:</label>
          <PdfAutoResizeTextarea id="receipt-address" value={draft.deliveryAddress} onChange={(event) => update("deliveryAddress", event.target.value)} />
          <label htmlFor="receipt-delivery-time">Delivery Time:</label>
          <input id="receipt-delivery-time" value={draft.deliveryTime} onChange={(event) => update("deliveryTime", event.target.value)} />
        </div>

        <div className="receipt-pdf-table-wrap">
          <table className="receipt-pdf-table">
            <thead><tr><th aria-label="序號" /><th>Description</th><th>Unit Price</th><th>Qty</th><th>Total</th></tr></thead>
            <tbody>
              {draft.lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td><textarea aria-label={`產品 ${index + 1}`} rows={1} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                  <td><span className="receipt-pdf-price-input"><span aria-hidden="true">$</span><input aria-label={`單價 ${index + 1}`} inputMode="decimal" size={Math.max(line.unitPrice.length, 1)} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} onBlur={() => { if (!line.unitPrice.trim()) updateLine(index, { unitPrice: "0" }); }} /></span></td>
                  <td><input aria-label={`數量 ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                  <td>{money(numberValue(line.unitPrice) * numberValue(line.quantity))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4}>Subtotal:</td><td>{money(totals.subtotal)}</td></tr>
              <tr><td colSpan={4}><select className="quote-pdf-edit-only" aria-label="運費選項" value={draft.deliveryFeeId} onChange={(event) => selectDeliveryFee(event.target.value)}><option value="">Delivery Fee</option>{shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item}</option>)}</select><span className="quote-pdf-print-only">{draft.deliveryFeeLabel}</span></td><td><span className="receipt-pdf-price-input">{draft.deliveryFee ? <span aria-hidden="true">$</span> : null}<input aria-label="運費" inputMode="decimal" size={Math.max(draft.deliveryFee.length, 1)} value={draft.deliveryFee} onChange={(event) => update("deliveryFee", event.target.value)} /></span></td></tr>
              <tr><td colSpan={4}>Grand Total:</td><td>{money(totals.grandTotal)}</td></tr>
            </tfoot>
          </table>
        </div>

        {!draft.trailingStartsNewPage ? <>{trailingControls}{trailingContent}</> : null}
        <ReceiptPdfPageFooter page={1} total={totalPdfPages} />
      </main>

      {draft.trailingStartsNewPage ? (
        <main className="quote-pdf-sheet quote-pdf-sheet-continuation receipt-pdf-sheet receipt-pdf-sheet-continuation" aria-label={`${documentName} PDF 第 2 頁`}>
          {letterhead}
          {trailingControls}
          {trailingContent}
          <ReceiptPdfPageFooter page={2} total={totalPdfPages} />
        </main>
      ) : null}

      {isInvoice ? (
        <>
          <Modal open={termsOpen} onClose={() => setTermsOpen(false)} title="條款及細則" closeLabel="關閉條款及細則" size="lg" rootClassName="quote-clause-modal-root" className="quote-clause-modal" footer={<Button onClick={() => setTermsOpen(false)}>確定</Button>}>
            <div className="quote-additional-picker quote-clause-picker">
              <QuoteClauseSearchPicker search={termSearch} onSearchChange={setTermSearch} options={TERM_OPTIONS} searchLabel="搜尋條款及細則" placeholder={t("quotes.pdfEditor.termsSearchPlaceholder")} onAdd={(value) => addDraftItem("terms", value)} />
              <p>可搜尋條款範本，亦可自由輸入內容後按「加入」。</p>
              <div className="quote-clause-selected"><strong>已加入的條例</strong>{draft.terms.map((item, index) => <div key={`selected-invoice-term-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除條款及細則 ${index + 1}`} onClick={() => update("terms", draft.terms.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
            </div>
          </Modal>

          <Modal open={paymentsOpen} onClose={() => setPaymentsOpen(false)} title="付款方式" closeLabel="關閉付款方式" size="lg" rootClassName="quote-clause-modal-root" className="quote-clause-modal" footer={<Button onClick={() => setPaymentsOpen(false)}>確定</Button>}>
            <div className="quote-additional-picker quote-clause-picker">
              <QuoteClauseSearchPicker search={paymentSearch} onSearchChange={setPaymentSearch} options={PAYMENT_METHOD_OPTIONS} searchLabel="搜尋付款方式" placeholder={t("quotes.pdfEditor.paymentSearchPlaceholder")} onAdd={(value) => addDraftItem("paymentMethods", value)} />
              <p>可搜尋付款方式範本，亦可自由輸入內容後按「加入」。</p>
              <div className="quote-clause-selected"><strong>已加入的付款方式</strong>{draft.paymentMethods.map((item, index) => <div key={`selected-invoice-payment-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除付款方式 ${index + 1}`} onClick={() => update("paymentMethods", draft.paymentMethods.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
            </div>
          </Modal>
        </>
      ) : null}
    </section>
  );
}
