import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, LoaderCircle, Minus, Plus, Printer } from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PdfBlurCommitInput, PdfBlurCommitTextarea } from "@/components/PdfBlurCommitField";
import { QuoteClauseSearchPicker } from "@/components/QuoteClauseSearchPicker";
import { getBrandContactEmail, getBrandLogoAlt, getDocumentLogoPath } from "@/lib/brand-logo";
import {
  fetchOrderDetail,
  type DetailLine,
  type OrderDetailResult,
} from "@/lib/order-details";
import {
  paginatePdfProductLines,
  paginateReceiptPdfLines,
  RECEIPT_PDF_CONTINUATION_PAGE_SIZE,
  RECEIPT_PDF_FIRST_PAGE_WITH_TRAILING,
  receiptPdfDraftStorageKey,
  type ReceiptPdfDraft,
  type ReceiptPdfLineDraft,
} from "@/lib/receipt-pdf-draft";
import { DICT_TYPE, dictItemLabel, useDictItems } from "@/lib/dictionaries";
import { splitPdfModuleIndexes, usePdfAutoPageBreaks } from "@/lib/pdf-auto-pagination";
import { printPdf } from "@/lib/print-pdf";
import { fetchShippingFees, type ShippingFee } from "@/lib/shipping-fees";

type ReceiptPdfLoader = typeof fetchOrderDetail;
type ShippingFeeLoader = () => Promise<ShippingFee[]>;
type FinancialDocumentKind = "receipt" | "invoice";
type ReceiptTrailingUnit =
  | { kind: "node"; key: string; node: ReactNode }
  | { kind: "term" | "payment"; itemIndex: number | null };

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

function ReceiptPdfPageFooter({ email, page, total }: { email: string; page: number; total: number }) {
  return (
    <footer className="receipt-pdf-page-footer" data-pdf-auto-footer>
      <span>5D-G Wah Lik Ind Ctr Tsuen Wan</span>
      <span>(+852) 2185 7373 / 5396 4335</span>
      <span>{email}</span>
      <span>{`第${page}頁 | 共${total}頁`}</span>
    </footer>
  );
}

function lineToDraft(line: DetailLine): ReceiptPdfLineDraft {
  const quantity = line.quantity ?? 0;
  const sourceUnitPrice = line.unitPrice ?? 0;
  const unitPrice = sourceUnitPrice !== 0 || !line.totalPrice || quantity === 0
    ? sourceUnitPrice
    : line.totalPrice / quantity;
  return {
    id: line.id,
    description: line.productName || line.content || "",
    unitPrice: String(unitPrice),
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
    sourceFinancialsVersion: 1,
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
    signaturePartyName: order?.companyName || order?.customerName || "",
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
  const hasPdfDeliveryFeeOverride = Boolean(value.deliveryFeeId?.trim());
  return {
    ...fallback,
    // Customer, delivery, payment and product data is refreshed from the
    // latest order. Only settings that belong to this PDF stay local.
    invoiceSourceContentVersion: 1,
    sourceFinancialsVersion: 1,
    deliveryFeeId: hasPdfDeliveryFeeOverride ? value.deliveryFeeId ?? "" : fallback.deliveryFeeId,
    deliveryFeeLabel: hasPdfDeliveryFeeOverride ? value.deliveryFeeLabel ?? "Delivery Fee" : fallback.deliveryFeeLabel,
    deliveryFee: hasPdfDeliveryFeeOverride
      ? value.deliveryFee?.trim() || "0"
      : fallback.deliveryFee,
    terms: storedTerms && (sourceContentInitialized || storedTerms.length)
      ? storedTerms
      : fallback.terms,
    paymentMethods: storedPaymentMethods && (sourceContentInitialized || storedPaymentMethods.length)
      ? storedPaymentMethods
      : fallback.paymentMethods,
    showCustomerSignature: value.showCustomerSignature ?? false,
    signaturePartyName: typeof value.signaturePartyName === "string"
      ? value.signaturePartyName
      : fallback.signaturePartyName,
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
  const { t, i18n } = useTranslation();
  const termDict = useDictItems(DICT_TYPE.quoteTermTemplate);
  const paymentDict = useDictItems(DICT_TYPE.quotePaymentTemplate);
  const termOptions = termDict.items.map((item) => dictItemLabel(item, i18n.language));
  const paymentOptions = paymentDict.items.map((item) => dictItemLabel(item, i18n.language));
  const { id = "" } = useParams();
  const [draft, setDraft] = useState<ReceiptPdfDraft | null>(null);
  const [sourceBrand, setSourceBrand] = useState({
    channelName: "",
    channelEmail: "",
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
  const editorRef = useRef<HTMLElement>(null);
  const paginationResetKey = draft ? JSON.stringify([draft, sourceBrand, documentKind]) : "";
  const paginationModuleCount = draft
    ? documentKind === "invoice"
      ? Math.max(draft.terms.length, 1) + Math.max(draft.paymentMethods.length, 1) + 1
      : 2
    : 0;
  const trailingPageBreaks = usePdfAutoPageBreaks(editorRef, paginationModuleCount, paginationResetKey);
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
        channelEmail: result.order.channelEmail || "",
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
    setDraft((current) => (current ? {
      ...current,
      [key]: value,
    } : current));
  };

  const markDraftDirty = () => setSaved(false);

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
  const productLinePages = isInvoice
    ? paginatePdfProductLines(
        draft.lines,
        RECEIPT_PDF_FIRST_PAGE_WITH_TRAILING,
        RECEIPT_PDF_CONTINUATION_PAGE_SIZE,
      )
    : paginateReceiptPdfLines(draft.lines);
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
  const receiptPaymentContent = (
    <div className="receipt-pdf-trailing" aria-label="付款資料及公司蓋章">
      <section className="receipt-pdf-payment">
        <strong>Payment information:</strong>
        <PdfBlurCommitInput className="receipt-pdf-payment-summary-input" aria-label="付款資料" size={Math.max(draft.paymentInformation.length, 1)} value={draft.paymentInformation} onDirty={markDraftDirty} onCommit={(value) => update("paymentInformation", value)} />
        {draft.receiptPayments.map((payment, index) => {
          const suffix = draft.receiptPayments.length > 1 ? ` ${index + 1}` : "";
          return (
            <div className="receipt-pdf-payment-record" key={payment.id}>
              <label><span>{`Payment Method${suffix}:`}</span><PdfBlurCommitInput aria-label={`付款方式${suffix}`} size={Math.max(payment.method.length, 1)} value={payment.method} onDirty={markDraftDirty} onCommit={(value) => updateReceiptPayment(index, { method: value })} /><span className="receipt-pdf-payment-amount"><span aria-hidden="true">$</span><PdfBlurCommitInput aria-label={`支付金額${suffix}`} inputMode="decimal" size={Math.max(payment.amount.length, 1)} value={payment.amount} onDirty={markDraftDirty} onCommit={(value) => updateReceiptPayment(index, { amount: value.trim() ? value : "0" })} /></span></label>
              <label><span>{`Payment Date${suffix}:`}</span><PdfBlurCommitInput aria-label={`付款日期${suffix}`} size={Math.max(payment.date.length, 1)} value={payment.date} onDirty={markDraftDirty} onCommit={(value) => updateReceiptPayment(index, { date: value })} /></label>
            </div>
          );
        })}
      </section>
    </div>
  );
  const receiptSignatureContent = (
    <div className="receipt-pdf-trailing receipt-pdf-trailing-signature">
      <section className="receipt-pdf-signature" aria-label="公司簽署">
        <span>For and on behalf of</span>
        <strong>Food Channels Limited</strong>
        <img src="/assets/fc-ltd-stamp.avif" alt="Food Channels Limited 公司蓋印" />
        <span>Authorized Signature &amp; Co. Chop</span>
      </section>
    </div>
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
            <PdfBlurCommitInput
              className="quote-pdf-signature-party-name"
              aria-label="簽署公司或客戶名稱"
              value={draft.signaturePartyName}
              placeholder={t("quotes.pdfEditor.signaturePartyPlaceholder")}
              onDirty={markDraftDirty}
              onCommit={(value) => update("signaturePartyName", value)}
            />
            <span className="quote-pdf-signature-stamp-spacer" aria-hidden="true" />
            <label><strong>公司蓋印及簽署：</strong><span /></label>
            <label><strong>負責人姓名：</strong><span /></label>
            <label><strong>簽署日期：</strong><span /></label>
          </div>
        ) : null}
      </section>
    </>
  );
  const brandEmail = getBrandContactEmail(
    sourceBrand.channelEmail,
    sourceBrand.channelName,
    sourceBrand.shopifyStoreDomain,
    sourceBrand.orderNumber,
  );
  const trailingUnits: ReceiptTrailingUnit[] = isInvoice
    ? [
        ...(draft.terms.length
          ? draft.terms.map((_, itemIndex) => ({ kind: "term" as const, itemIndex }))
          : [{ kind: "term" as const, itemIndex: null }]),
        ...(draft.paymentMethods.length
          ? draft.paymentMethods.map((_, itemIndex) => ({ kind: "payment" as const, itemIndex }))
          : [{ kind: "payment" as const, itemIndex: null }]),
        { kind: "node", key: "invoice-signature", node: <div className="receipt-invoice-trailing">{invoiceSignature}</div> },
      ]
    : [
        { kind: "node", key: "receipt-payment", node: receiptPaymentContent },
        { kind: "node", key: "receipt-signature", node: receiptSignatureContent },
      ];
  const trailingModulePages = splitPdfModuleIndexes(trailingUnits.length, trailingPageBreaks);
  const totalPdfPages = productLinePages.length + Math.max(trailingModulePages.length - 1, 0);
  const renderTrailingModules = (indexes: number[]) => {
    const rendered: ReactNode[] = [];
    for (let cursor = 0; cursor < indexes.length;) {
      const moduleIndex = indexes[cursor];
      const unit = trailingUnits[moduleIndex];
      if (unit.kind === "node") {
        rendered.push(
          <div className="quote-pdf-auto-module" data-pdf-auto-module-index={moduleIndex} key={unit.key}>{unit.node}</div>,
        );
        cursor += 1;
        continue;
      }

      const kind = unit.kind;
      const run: Array<{ moduleIndex: number; itemIndex: number | null }> = [];
      while (cursor < indexes.length) {
        const nextModuleIndex = indexes[cursor];
        const nextUnit = trailingUnits[nextModuleIndex];
        if (nextUnit.kind !== kind) break;
        run.push({ moduleIndex: nextModuleIndex, itemIndex: nextUnit.itemIndex });
        cursor += 1;
      }
      const isTerm = kind === "term";
      const isEmpty = run.every((item) => item.itemIndex === null);
      const firstItemIndex = run.find((item) => item.itemIndex !== null)?.itemIndex ?? 0;
      rendered.push(
        <section
          className={`quote-pdf-notes receipt-invoice-notes${isEmpty ? " is-empty" : ""}`}
          aria-label={isTerm ? "條款、付款方式及簽署" : undefined}
          key={`${kind}-${moduleIndex}`}
        >
          <section
            className={`quote-pdf-note-block receipt-invoice-note-block${isEmpty ? " is-empty" : ""}`}
            aria-label={isTerm ? "條款及付款方式" : undefined}
            {...(isEmpty ? { "data-pdf-auto-module-index": moduleIndex } : {})}
          >
            <button type="button" className="quote-pdf-note-heading quote-pdf-edit-only" onClick={() => isTerm ? setTermsOpen(true) : setPaymentsOpen(true)}>
              {isTerm ? "條款及細則：" : "付款方式："}<Plus aria-hidden="true" />
            </button>
            <strong className="quote-pdf-print-only receipt-invoice-print-heading">{isTerm ? "條款及細則：" : "付款方式："}</strong>
            <ol style={{ counterReset: `quote-note ${firstItemIndex}` }}>
              {run.map((item) => item.itemIndex === null ? null : (
                <li
                  className={`receipt-invoice-clause${(isTerm ? draft.terms[item.itemIndex] : draft.paymentMethods[item.itemIndex]).trim() ? "" : " is-empty"}`}
                  data-pdf-auto-module-index={item.moduleIndex}
                  key={`${kind}-${item.itemIndex}`}
                >
                  <PdfBlurCommitTextarea
                    rows={1}
                    aria-label={`${isTerm ? "條款及細則" : "付款方式"} ${item.itemIndex + 1}`}
                    value={isTerm ? draft.terms[item.itemIndex] : draft.paymentMethods[item.itemIndex]}
                    onDirty={markDraftDirty}
                    onCommit={(value) => {
                      if (isTerm) update("terms", draft.terms.map((current, itemIndex) => itemIndex === item.itemIndex ? value : current));
                      else update("paymentMethods", draft.paymentMethods.map((current, itemIndex) => itemIndex === item.itemIndex ? value : current));
                    }}
                  />
                  <button
                    type="button"
                    className="quote-pdf-edit-only receipt-invoice-clause-delete"
                    aria-label={`刪除${isTerm ? "條款及細則" : "付款方式"} ${item.itemIndex + 1}`}
                    onClick={() => isTerm
                      ? update("terms", draft.terms.filter((_, itemIndex) => itemIndex !== item.itemIndex))
                      : update("paymentMethods", draft.paymentMethods.filter((_, itemIndex) => itemIndex !== item.itemIndex))}
                  ><Minus /></button>
                </li>
              ))}
            </ol>
          </section>
        </section>,
      );
    }
    return rendered;
  };
  const renderProductTable = (
    lines: ReceiptPdfLineDraft[],
    offset: number,
    showTotals: boolean,
  ) => (
    <div className="receipt-pdf-table-wrap">
      <table className="receipt-pdf-table">
        <thead><tr><th aria-label="序號" /><th>Description</th><th>Unit Price</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>
          {lines.map((line, pageIndex) => {
            const index = offset + pageIndex;
            return (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td><PdfBlurCommitTextarea aria-label={`產品 ${index + 1}`} rows={1} value={line.description} onDirty={markDraftDirty} onCommit={(value) => updateLine(index, { description: value })} /></td>
                <td><span className="receipt-pdf-price-input"><span aria-hidden="true">$</span><input aria-label={`單價 ${index + 1}`} inputMode="decimal" size={Math.max(line.unitPrice.length, 1)} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} onBlur={() => { if (!line.unitPrice.trim()) updateLine(index, { unitPrice: "0" }); }} /></span></td>
                <td><input aria-label={`數量 ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                <td>{money(numberValue(line.unitPrice) * numberValue(line.quantity))}</td>
              </tr>
            );
          })}
        </tbody>
        {showTotals ? <tfoot>
          <tr><td colSpan={4}>Subtotal:</td><td>{money(totals.subtotal)}</td></tr>
          <tr><td colSpan={4}><FilterableSelect className="quote-pdf-edit-only shipping-fee-select" aria-label="運費選項" value={draft.deliveryFeeId} onChange={(event) => selectDeliveryFee(event.target.value)}><option value="">Delivery Fee</option>{shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item}</option>)}</FilterableSelect><span className="quote-pdf-print-only">{draft.deliveryFeeLabel}</span></td><td><span className="receipt-pdf-price-input">{draft.deliveryFee ? <span aria-hidden="true">$</span> : null}<input aria-label="運費" inputMode="decimal" size={Math.max(draft.deliveryFee.length, 1)} value={draft.deliveryFee} onChange={(event) => update("deliveryFee", event.target.value)} /></span></td></tr>
          <tr><td colSpan={4}>Grand Total:</td><td>{money(totals.grandTotal)}</td></tr>
        </tfoot> : null}
      </table>
    </div>
  );

  return (
    <section ref={editorRef} className="quote-pdf-editor receipt-pdf-editor">
      <div className="quote-pdf-toolbar receipt-pdf-toolbar">
        <div>
          <strong>{documentName}工作稿</strong>
          <span>所有白色欄位均可直接編輯</span>
        </div>
        <div>
          <span className="quote-pdf-saved">{saved ? <><Check /> 已自動儲存</> : "自動儲存中…"}</span>
          <Button onClick={() => printPdf(isInvoice ? "發票" : "收據", isInvoice ? sourceBrand.orderNumber : draft.receiptNumber)}><Printer />確定並列印 PDF</Button>
        </div>
      </div>

      <main className="quote-pdf-sheet receipt-pdf-sheet" data-pdf-auto-page={productLinePages.length === 1 ? "products" : undefined} aria-label={`${documentName} PDF`}>
        {letterhead}

        <div className="receipt-pdf-meta-grid">
          <label htmlFor="receipt-customer">Customer:</label>
          <PdfBlurCommitInput id="receipt-customer" value={draft.customer} onDirty={markDraftDirty} onCommit={(value) => update("customer", value)} />
          <label htmlFor="receipt-invoice-date">Invoice Date:</label>
          <PdfBlurCommitInput id="receipt-invoice-date" value={draft.invoiceDate} onDirty={markDraftDirty} onCommit={(value) => update("invoiceDate", value)} />
          <label htmlFor="receipt-contact">Contact Person:</label>
          <PdfBlurCommitInput id="receipt-contact" value={draft.contactPerson} onDirty={markDraftDirty} onCommit={(value) => update("contactPerson", value)} />
          <label htmlFor="receipt-delivery-date">Delivery Date:</label>
          <PdfBlurCommitInput id="receipt-delivery-date" value={draft.deliveryDate} onDirty={markDraftDirty} onCommit={(value) => update("deliveryDate", value)} />
          <label htmlFor="receipt-address">Delivery Address:</label>
          <PdfBlurCommitTextarea id="receipt-address" value={draft.deliveryAddress} onDirty={markDraftDirty} onCommit={(value) => update("deliveryAddress", value)} />
          <label htmlFor="receipt-delivery-time">Delivery Time:</label>
          <PdfBlurCommitInput id="receipt-delivery-time" value={draft.deliveryTime} onDirty={markDraftDirty} onCommit={(value) => update("deliveryTime", value)} />
        </div>

        {renderProductTable(productLinePages[0], 0, productLinePages.length === 1)}

        {productLinePages.length === 1 ? renderTrailingModules(trailingModulePages[0] ?? []) : null}
        <ReceiptPdfPageFooter email={brandEmail} page={1} total={totalPdfPages} />
      </main>

      {productLinePages.slice(1).map((lines, pageIndex) => {
        const page = pageIndex + 2;
        const isFinalProductPage = page === productLinePages.length;
        const offset = productLinePages.slice(0, pageIndex + 1).reduce((sum, page) => sum + page.length, 0);
        return (
          <main className="quote-pdf-sheet quote-pdf-sheet-continuation receipt-pdf-sheet receipt-pdf-sheet-continuation receipt-pdf-product-continuation" data-pdf-auto-page={isFinalProductPage ? "products" : undefined} aria-label={`${documentName} PDF 第 ${page} 頁`} key={`products-${page}`}>
            {letterhead}
            {renderProductTable(lines, offset, isFinalProductPage)}
            {isFinalProductPage ? renderTrailingModules(trailingModulePages[0] ?? []) : null}
            <ReceiptPdfPageFooter email={brandEmail} page={page} total={totalPdfPages} />
          </main>
        );
      })}

      {trailingModulePages.slice(1).map((moduleIndexes, pageIndex) => {
        const page = productLinePages.length + pageIndex + 1;
        return (
          <main
            className="quote-pdf-sheet quote-pdf-sheet-continuation receipt-pdf-sheet receipt-pdf-sheet-continuation quote-pdf-auto-continuation"
            data-pdf-auto-page="modules"
            aria-label={`${documentName} PDF 第 ${page} 頁`}
            key={`trailing-page-${page}`}
          >
            {letterhead}
            {renderTrailingModules(moduleIndexes)}
            <ReceiptPdfPageFooter email={brandEmail} page={page} total={totalPdfPages} />
          </main>
        );
      })}

      {isInvoice ? (
        <>
          <Modal open={termsOpen} onClose={() => setTermsOpen(false)} title="條款及細則" closeLabel="關閉條款及細則" size="lg" rootClassName="quote-clause-modal-root" className="quote-clause-modal" footer={<Button onClick={() => setTermsOpen(false)}>確定</Button>}>
            <div className="quote-additional-picker quote-clause-picker">
              <QuoteClauseSearchPicker search={termSearch} onSearchChange={setTermSearch} options={termOptions} searchLabel="搜尋條款及細則" placeholder={t("quotes.pdfEditor.termsSearchPlaceholder")} onAdd={(value) => addDraftItem("terms", value)} />
              <p>可搜尋條款範本，亦可自由輸入內容後按「加入」。</p>
              <div className="quote-clause-selected"><strong>已加入的條例</strong>{draft.terms.map((item, index) => <div key={`selected-invoice-term-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除條款及細則 ${index + 1}`} onClick={() => update("terms", draft.terms.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
            </div>
          </Modal>

          <Modal open={paymentsOpen} onClose={() => setPaymentsOpen(false)} title="付款方式" closeLabel="關閉付款方式" size="lg" rootClassName="quote-clause-modal-root" className="quote-clause-modal" footer={<Button onClick={() => setPaymentsOpen(false)}>確定</Button>}>
            <div className="quote-additional-picker quote-clause-picker">
              <QuoteClauseSearchPicker search={paymentSearch} onSearchChange={setPaymentSearch} options={paymentOptions} searchLabel="搜尋付款方式" placeholder={t("quotes.pdfEditor.paymentSearchPlaceholder")} onAdd={(value) => addDraftItem("paymentMethods", value)} />
              <p>可搜尋付款方式範本，亦可自由輸入內容後按「加入」。</p>
              <div className="quote-clause-selected"><strong>已加入的付款方式</strong>{draft.paymentMethods.map((item, index) => <div key={`selected-invoice-payment-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除付款方式 ${index + 1}`} onClick={() => update("paymentMethods", draft.paymentMethods.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
            </div>
          </Modal>
        </>
      ) : null}
    </section>
  );
}
