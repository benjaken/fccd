import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  LoaderCircle,
  Minus,
  Plus,
  Printer,
  Search,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PdfBlurCommitInput, PdfBlurCommitTextarea } from "@/components/PdfBlurCommitField";
import { QuoteClauseSearchPicker } from "@/components/QuoteClauseSearchPicker";
import {
  getBrandContactEmail,
  getBrandKind,
  getBrandLogoAlt,
  getDocumentLogoPath,
} from "@/lib/brand-logo";
import {
  fetchOrderDetail,
  type DetailLine,
  type OrderDetailResult,
} from "@/lib/order-details";
import {
  quotePdfDraftStorageKey,
  type QuoteActivityDraft,
} from "@/lib/quote-pdf-draft";
import { DICT_TYPE, dictItemLabel, useDictItems } from "@/lib/dictionaries";
import { hongKongDateKey } from "@/lib/date-time";
import { splitPdfModuleIndexes, usePdfAutoPageBreaks } from "@/lib/pdf-auto-pagination";
import { printPdf } from "@/lib/print-pdf";
import {
  fetchActiveQuotePdfPages,
  type QuotePdfPage,
} from "@/lib/quote-pdf-pages";
import {
  fetchShippingFees,
  type ShippingFee,
} from "@/lib/shipping-fees";

type QuotePdfLoader = typeof fetchOrderDetail;
type ShippingFeeLoader = () => Promise<ShippingFee[]>;
type PdfPageLoader = typeof fetchActiveQuotePdfPages;

const fetchConfiguredShippingFees: ShippingFeeLoader = async () =>
  (await fetchShippingFees(1, 1000)).rows;

type EditableLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type EditableActivity = QuoteActivityDraft;

type QuoteTrailingUnit =
  | { kind: "node"; key: string; node: ReactNode }
  | { kind: "term" | "payment"; itemIndex: number | null };

const FIRST_PRODUCT_PAGE_SIZE = 10;
const CONTINUATION_PRODUCT_PAGE_SIZE = 18;

type QuotePdfDraft = {
  sourceFinancialsVersion: number;
  brandName: string;
  quoteNumber: string;
  quoteDate: string;
  customerName: string;
  companyName: string;
  contact: string;
  email: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryTime: string;
  lines: EditableLine[];
  additionalInfo: string[];
  activities: EditableActivity[];
  utensilPackQuantity: string;
  showCustomerSignature: boolean;
  signaturePartyName: string;
  activityShippingFeeId: string;
  activityShippingNote: string;
  activityShippingFee: string;
  terms: string[];
  paymentMethods: string[];
  shippingFeeId: string;
  shippingFeeLabel: string;
  shippingFee: string;
  discountLabel: string;
  discount: string;
  cashDollarDeduction: string;
  cashDollarPurchase: string;
};

function pdfDate(value: string | null | undefined) {
  if (!value) return "";
  const isoDate = hongKongDateKey(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoDate) return value;
  return `${Number(isoDate[3])}/${Number(isoDate[2])}/${isoDate[1]}`;
}

function lineToDraft(line: DetailLine): EditableLine {
  const quantity = line.quantity ?? 0;
  const sourceUnitPrice = line.unitPrice ?? 0;
  const unitPrice = sourceUnitPrice !== 0 || !line.totalPrice || quantity === 0
    ? sourceUnitPrice
    : line.totalPrice / quantity;
  return {
    id: line.id,
    description: line.productName || line.content || "",
    quantity: line.quantity === null ? "" : String(line.quantity),
    unitPrice: String(unitPrice),
  };
}

function resultToDraft(result: OrderDetailResult): QuotePdfDraft {
  const order = result.order;
  return {
    sourceFinancialsVersion: 1,
    brandName: order?.channelName || "Food Channel Catering",
    quoteNumber: order?.orderNumber || "",
    quoteDate: pdfDate(order?.updatedAt),
    customerName: order?.customerName || "",
    companyName: order?.companyName || "",
    contact: [order?.contactA, order?.contactB].filter(Boolean).join(" / "),
    email: order?.email || "",
    deliveryAddress: order?.address || "",
    deliveryDate: pdfDate(order?.deliveryAt),
    deliveryTime: order?.deliveryTime || order?.shipOutTime || "",
    lines: result.lines.length
      ? result.lines.map(lineToDraft)
      : [{ id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "0" }],
    additionalInfo: [],
    activities: [],
    utensilPackQuantity: "0",
    showCustomerSignature: false,
    signaturePartyName: order?.companyName || order?.customerName || "",
    activityShippingFeeId: "",
    activityShippingNote: "運費－滿 $2800 免運費－地面交收",
    activityShippingFee: "0",
    terms: result.terms.filter((item) => item.trim()),
    paymentMethods: result.paymentMethods.filter((item) => item.trim()),
    shippingFeeId: "",
    shippingFeeLabel: "",
    shippingFee: order ? String(order.shippingFee || 0) : "0",
    discountLabel: "折扣 (-)",
    discount: order ? String(order.discount || 0) : "0",
    cashDollarDeduction: order ? String(order.cashdollarRedeemed || 0) : "0",
    cashDollarPurchase: order ? String(order.cashdollarPurchased || 0) : "0",
  };
}

function normalizeDraft(value: Partial<QuotePdfDraft> | null | undefined, fallback: QuotePdfDraft): QuotePdfDraft {
  const stored = value && typeof value === "object" ? value : {};
  const normalizeItems = (items: unknown, fallbackItems: string[]) => {
    if (Array.isArray(items)) return items.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (typeof items === "string") return items.split(/\r?\n/).filter((item) => item.trim());
    return fallbackItems;
  };
  const hasPdfShippingOverride = Boolean(stored.shippingFeeId?.trim());
  return {
    ...fallback,
    sourceFinancialsVersion: 1,
    // Quote/order data always comes from the latest saved source record. The
    // local PDF draft is merged afterwards only for PDF-specific additions.
    additionalInfo: stored.additionalInfo ?? [],
    activities: (stored.activities ?? []).map((activity) => ({
      ...activity,
      amount: activity.amount?.trim() || "0",
    })),
    utensilPackQuantity: stored.utensilPackQuantity ?? "0",
    // Pagination is calculated from the rendered page. Ignore legacy manual
    // page-placement preferences so every draft starts in document order.
    showCustomerSignature: stored.showCustomerSignature ?? false,
    signaturePartyName: typeof stored.signaturePartyName === "string"
      ? stored.signaturePartyName
      : fallback.signaturePartyName,
    activityShippingFeeId: stored.activityShippingFeeId ?? "",
    activityShippingNote:
      stored.activityShippingNote ?? "運費－滿 $2800 免運費－地面交收",
    activityShippingFee: stored.activityShippingFee?.trim() || "0",
    shippingFeeId: hasPdfShippingOverride ? stored.shippingFeeId ?? "" : fallback.shippingFeeId,
    shippingFeeLabel: hasPdfShippingOverride ? stored.shippingFeeLabel ?? "" : fallback.shippingFeeLabel,
    shippingFee: hasPdfShippingOverride
      ? stored.shippingFee?.trim() || "0"
      : fallback.shippingFee,
    discountLabel: typeof stored.discountLabel === "string"
      ? stored.discountLabel
      : fallback.discountLabel,
    terms: normalizeItems(stored.terms, fallback.terms),
    paymentMethods: normalizeItems(stored.paymentMethods, fallback.paymentMethods),
  };
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteDocumentTitle(quoteNumber: string, isLunchBox: boolean) {
  const normalized = quoteNumber.trim().toUpperCase();
  if (["FCCQ", "FCLQ", "FCPQ", "FCKQ", "FCDQ", "FCRQ"].some((prefix) => normalized.startsWith(prefix))) return "到會套餐報價";
  if (normalized.startsWith("FCBQ") || isLunchBox) return "便當報價";
  return "報價";
}

function QuotePdfPageFooter({ email, printOnly = false }: { email: string; printOnly?: boolean }) {
  return (
    <footer className={`quote-pdf-page-footer${printOnly ? " is-print-only" : ""}`} data-pdf-auto-footer>
      <span>荃灣華力工業中心5樓D-G室</span>
      <span>(+852) 2185 7373 / 5396 4335</span>
      <span>{email}</span>
    </footer>
  );
}

export function QuotePdfEditorPage({
  loadDetail = fetchOrderDetail,
  loadShippingFees = fetchConfiguredShippingFees,
  loadPdfPages = fetchActiveQuotePdfPages,
}: {
  loadDetail?: QuotePdfLoader;
  loadShippingFees?: ShippingFeeLoader;
  loadPdfPages?: PdfPageLoader;
}) {
  const { t, i18n } = useTranslation();
  const termDict = useDictItems(DICT_TYPE.quoteTermTemplate);
  const paymentDict = useDictItems(DICT_TYPE.quotePaymentTemplate);
  const additionalInfoDict = useDictItems(DICT_TYPE.quoteAdditionalInfo);
  const activityDict = useDictItems(DICT_TYPE.quoteActivity);
  const termOptions = termDict.items.map((item) => dictItemLabel(item, i18n.language));
  const paymentOptions = paymentDict.items.map((item) => dictItemLabel(item, i18n.language));
  const additionalInfoOptions = additionalInfoDict.items.map((item) => dictItemLabel(item, i18n.language));
  const activityOptions = activityDict.items.map((item) => ({ description: dictItemLabel(item, i18n.language), amount: String(item.metadata.amount ?? "0") }));
  const { id = "" } = useParams();
  const [draft, setDraft] = useState<QuotePdfDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [additionalSearch, setAdditionalSearch] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const [termSearch, setTermSearch] = useState("");
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [shippingFees, setShippingFees] = useState<ShippingFee[]>([]);
  const [pdfPages, setPdfPages] = useState<QuotePdfPage[]>([]);
  const [pdfPagesError, setPdfPagesError] = useState(false);
  const [sourceBrand, setSourceBrand] = useState<{ channelId: string; name: string; email: string; quoteNumber: string }>({ channelId: "", name: "", email: "", quoteNumber: "" });
  const [saved, setSaved] = useState(true);
  const editorRef = useRef<HTMLElement>(null);
  const paginationBrandKind = getBrandKind(sourceBrand.name, sourceBrand.quoteNumber, draft?.brandName, draft?.quoteNumber);
  const paginationModuleCount = draft
    ? 1
      + Math.max(draft.terms.length, 1)
      + Math.max(draft.paymentMethods.length, 1)
      + (paginationBrandKind === "lunch-box" ? 2 : paginationBrandKind === "party-food" ? 1 : 0)
    : 0;
  // Text edits are measured by ResizeObserver. Resetting every page break for
  // each committed field value makes a continuation page disappear on blur.
  // Only document/brand changes require rebuilding pagination from scratch.
  const paginationResetKey = `${id}:${paginationBrandKind}`;
  const trailingPageBreaks = usePdfAutoPageBreaks(editorRef, paginationModuleCount, paginationResetKey);

  const storageKey = quotePdfDraftStorageKey(id);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadDetail(id, "quote", true);
      if (!result.order) throw new Error("not-found");
      const stored = window.localStorage.getItem(storageKey);
      const fallback = resultToDraft(result);
      setSourceBrand({
        channelId: result.order.channelId || "",
        name: result.order.channelName || "",
        email: result.order.channelEmail || "",
        quoteNumber: result.order.orderNumber || "",
      });
      setPdfPagesError(false);
      if (result.order.channelId) {
        try {
          setPdfPages(await loadPdfPages(result.order.channelId));
        } catch {
          setPdfPages([]);
          setPdfPagesError(true);
        }
      } else {
        setPdfPages([]);
      }
      setDraft(
        stored
          ? normalizeDraft(JSON.parse(stored) as QuotePdfDraft, fallback)
          : fallback,
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id, loadDetail, loadPdfPages, storageKey]);

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
    if (!shippingFees.length) return;
    setDraft((current) => {
      if (!current) return current;
      let next = current;
      const productFee = shippingFees.find((fee) => fee.id === current.shippingFeeId);
      if (productFee) {
        const restoreAmount = !current.shippingFee.trim()
          || (numberValue(current.shippingFee) === 0 && productFee.fee !== 0);
        if (restoreAmount || current.shippingFeeLabel !== productFee.item) {
          next = {
            ...next,
            shippingFeeLabel: productFee.item,
            shippingFee: restoreAmount ? String(productFee.fee) : current.shippingFee,
          };
        }
      }
      const activityFee = shippingFees.find((fee) => fee.id === current.activityShippingFeeId);
      if (activityFee) {
        const restoreAmount = !current.activityShippingFee.trim()
          || (numberValue(current.activityShippingFee) === 0 && activityFee.fee !== 0);
        if (restoreAmount || current.activityShippingNote !== activityFee.item) {
          next = {
            ...next,
            activityShippingNote: activityFee.item,
            activityShippingFee: restoreAmount
              ? String(activityFee.fee)
              : current.activityShippingFee,
          };
        }
      }
      return next;
    });
  }, [draft?.activityShippingFeeId, draft?.shippingFeeId, shippingFees]);

  useEffect(() => {
    if (!draft) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
      setSaved(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, storageKey]);

  const printQuotePdf = useCallback(async () => {
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>(".quote-pdf-insert-page img"),
    );
    await Promise.all(
      images.map(async (image) => {
        if (image.complete) return;
        try {
          await image.decode();
        } catch {
          // A failed image remains visible in print preview instead of printing early.
        }
      }),
    );
    printPdf("報價單", draft?.quoteNumber || sourceBrand.quoteNumber);
  }, [draft?.quoteNumber, sourceBrand.quoteNumber]);

  const totals = useMemo(() => {
    const productSubtotal = (draft?.lines ?? []).reduce(
      (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice),
      0,
    );
    const activityItemsTotal = (draft?.activities ?? []).reduce(
      (sum, activity) => sum + numberValue(activity.amount),
      0,
    );
    const activitySubtotal = productSubtotal + activityItemsTotal;
    const activityTotal = activitySubtotal
      + numberValue(draft?.activityShippingFee ?? "")
      - numberValue(draft?.discount ?? "");
    const isLunchBoxDraft = getBrandKind(
      sourceBrand.name,
      sourceBrand.quoteNumber,
      draft?.brandName ?? "",
      draft?.quoteNumber ?? "",
    ) === "lunch-box";
    const productTotal = productSubtotal
      + numberValue(draft?.shippingFee ?? "")
      - (isLunchBoxDraft ? numberValue(draft?.discount ?? "") : 0)
      - (isLunchBoxDraft ? numberValue(draft?.cashDollarDeduction ?? "") : 0)
      + (isLunchBoxDraft ? numberValue(draft?.cashDollarPurchase ?? "") : 0);
    return { productSubtotal, activitySubtotal, activityTotal, productTotal };
  }, [draft, sourceBrand]);

  const filteredAdditional = useMemo(() => {
    const term = additionalSearch.trim().toLocaleLowerCase();
    return additionalInfoOptions.filter(
      (option) => (!term || option.toLocaleLowerCase().includes(term))
        && !draft?.additionalInfo.includes(option),
    );
  }, [additionalInfoOptions, additionalSearch, draft?.additionalInfo]);

  const update = <K extends keyof QuotePdfDraft>(key: K, value: QuotePdfDraft[K]) => {
    setSaved(false);
    setDraft((current) => (current ? {
      ...current,
      [key]: value,
    } : current));
  };

  const markDraftDirty = () => setSaved(false);

  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    if (!draft) return;
    update(
      "lines",
      draft.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  };

  const selectShippingFee = (shippingFeeId: string) => {
    const selected = shippingFees.find((fee) => fee.id === shippingFeeId);
    setSaved(false);
    setDraft((current) => current ? {
      ...current,
      shippingFeeId,
      shippingFeeLabel: selected?.item ?? "",
      shippingFee: selected ? String(selected.fee) : "0",
    } : current);
  };

  const selectActivityShippingFee = (activityShippingFeeId: string) => {
    const selected = shippingFees.find((fee) => fee.id === activityShippingFeeId);
    setSaved(false);
    setDraft((current) => current ? {
      ...current,
      activityShippingFeeId,
      activityShippingNote: selected?.item ?? "",
      activityShippingFee: selected ? String(selected.fee) : "0",
    } : current);
  };

  const addAdditional = (value: string) => {
    const text = value.trim();
    if (!draft || !text || draft.additionalInfo.includes(text)) return;
    update("additionalInfo", [...draft.additionalInfo, text]);
    setAdditionalSearch("");
  };

  const addActivity = (description: string, amount = "0") => {
    const text = description.trim();
    if (!draft || !text || draft.activities.some((activity) => activity.description === text)) return;
    update("activities", [
      ...draft.activities,
      { id: crypto.randomUUID(), description: text, amount },
    ]);
    setActivitySearch("");
  };

  const updateActivity = (index: number, patch: Partial<EditableActivity>) => {
    if (!draft) return;
    update(
      "activities",
      draft.activities.map((activity, activityIndex) =>
        activityIndex === index ? { ...activity, ...patch } : activity,
      ),
    );
  };

  const addDraftItem = (key: "terms" | "paymentMethods", value: string) => {
    const text = value.trim();
    if (!draft || !text || draft[key].includes(text)) return;
    update(key, [...draft[key], text]);
    if (key === "terms") setTermSearch("");
    else setPaymentSearch("");
  };

  if (loading) {
    return (
      <div className="quote-pdf-state">
        <LoaderCircle className="spin" /> 正在載入報價表…
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="quote-pdf-state" role="alert">
        無法載入報價表。
        <Button variant="outline" onClick={() => void load()}>重試</Button>
      </div>
    );
  }

  const brandValues = [sourceBrand.name, sourceBrand.quoteNumber, draft.brandName, draft.quoteNumber];
  const brandEmail = getBrandContactEmail(sourceBrand.email, ...brandValues);
  const brandLogo = getDocumentLogoPath(...brandValues);
  const brandLogoAlt = getBrandLogoAlt(...brandValues);
  const isLunchBox = getBrandKind(...brandValues) === "lunch-box";
  const documentTitle = quoteDocumentTitle(sourceBrand.quoteNumber || draft.quoteNumber, isLunchBox);
  const canAddAdditionalInfo = isLunchBox || getBrandKind(...brandValues) === "party-food";
  const hasActivities = isLunchBox && draft.activities.length > 0;
  const frontPages = pdfPages.filter((page) => page.placement === "front");
  const backPages = pdfPages.filter((page) => page.placement === "back");
  const productLinePages = [draft.lines.slice(0, FIRST_PRODUCT_PAGE_SIZE)];
  for (let index = FIRST_PRODUCT_PAGE_SIZE; index < draft.lines.length; index += CONTINUATION_PRODUCT_PAGE_SIZE) {
    productLinePages.push(draft.lines.slice(index, index + CONTINUATION_PRODUCT_PAGE_SIZE));
  }
  const hasUtensilPackLine = draft.lines.some((line) => (line.description ?? "").replace(/\s/g, "").includes("餐具包"));
  const signatureToggle = (
    <label className="quote-pdf-customer-signature-toggle quote-pdf-edit-only">
      <input type="checkbox" checked={draft.showCustomerSignature} onChange={(event) => update("showCustomerSignature", event.target.checked)} />
      顯示客戶簽署
    </label>
  );
  const signatureContent = (
    <section className={`quote-pdf-signature${draft.showCustomerSignature ? " has-customer-signature" : ""}`} aria-label="簽署確認">
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
  );
  const activityActions = isLunchBox ? (
    <div className="quote-pdf-section-title quote-pdf-edit-only">
      <Button onClick={() => setActivityOpen(true)}><Plus />新增活動項目</Button>
    </div>
  ) : null;
  const activityContent = isLunchBox ? (
    <section className={`quote-pdf-activity${hasActivities ? "" : " is-empty"}`} aria-label="活動報價表">
      <table>
        {hasActivities ? <>
          <thead><tr><th aria-label="序號" /><th>活動報價</th><th>價錢</th></tr></thead>
          <tbody>
            {draft.activities.map((activity, index) => (
              <tr key={activity.id}>
                <td>{index + 1}</td>
                <td><PdfBlurCommitInput aria-label={`活動報價 ${index + 1}`} value={activity.description} onDirty={markDraftDirty} onCommit={(value) => updateActivity(index, { description: value })} /></td>
                <td>$<PdfBlurCommitInput aria-label={`活動價錢 ${index + 1}`} inputMode="decimal" value={activity.amount} onDirty={markDraftDirty} onCommit={(value) => updateActivity(index, { amount: value.trim() ? value : "0" })} /></td>
              </tr>
            ))}
          </tbody>
        </> : null}
        <tfoot>
          <tr><td colSpan={2}>小計：</td><td>${totals.activitySubtotal.toLocaleString("zh-HK")}</td></tr>
          <tr>
            <td colSpan={2}>
              <FilterableSelect className="quote-pdf-edit-only shipping-fee-select" aria-label="活動運費項目" value={draft.activityShippingFeeId} onChange={(event) => selectActivityShippingFee(event.target.value)}>
                <option value="">選擇運費</option>
                {shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item}</option>)}
              </FilterableSelect>
              <span className="quote-pdf-print-only">{draft.activityShippingNote || "選擇運費"}</span>
            </td>
            <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><PdfBlurCommitInput aria-label="活動運費" inputMode="decimal" size={Math.max(draft.activityShippingFee.length, 1)} value={draft.activityShippingFee} onDirty={markDraftDirty} onCommit={(value) => update("activityShippingFee", value.trim() ? value : "0")} /></span></td>
          </tr>
          <tr>
            <td colSpan={2}><PdfBlurCommitInput className="quote-pdf-adjustment-label" aria-label="折扣顯示文字" value={draft.discountLabel} onDirty={markDraftDirty} onCommit={(value) => update("discountLabel", value)} /></td>
            <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><PdfBlurCommitInput aria-label="活動折扣" inputMode="decimal" size={Math.max(draft.discount.length, 1)} value={draft.discount} onDirty={markDraftDirty} onCommit={(value) => update("discount", value.trim() ? value : "0")} /></span></td>
          </tr>
          <tr><td colSpan={2}>總數：</td><td>${totals.activityTotal.toLocaleString("zh-HK")}</td></tr>
        </tfoot>
      </table>
    </section>
  ) : null;
  const continuationLetterhead = (
    <header className="quote-pdf-letterhead quote-pdf-letterhead-continuation">
      <img src={brandLogo} alt={brandLogoAlt} />
      <div><h1>{documentTitle}</h1><strong>{draft.quoteNumber}</strong></div>
      <img className="quote-pdf-award" src="/assets/award-logo.avif" alt="公司認證及獎項" />
    </header>
  );
  const renderProductTable = (lines: EditableLine[], offset: number, showTotals: boolean) => (
    <div className="quote-pdf-table-wrap">
      <table className={`quote-pdf-table${isLunchBox ? " is-lunch-box" : ""}`}>
        <thead><tr><th aria-label="序號">{isLunchBox ? "" : "#"}</th><th>產品</th><th>單價</th><th>{isLunchBox ? "份數" : "數量"}</th><th>{isLunchBox ? "總數" : "金額"}</th></tr></thead>
        <tbody>
          {lines.map((line, pageIndex) => {
            const index = offset + pageIndex;
            return (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td><PdfBlurCommitInput className="quote-pdf-product-input" aria-label={`產品 ${index + 1}`} value={line.description} onDirty={markDraftDirty} onCommit={(value) => updateLine(index, { description: value })} /></td>
                <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><PdfBlurCommitInput aria-label={`單價 ${index + 1}`} inputMode="decimal" size={Math.max(line.unitPrice.length, 1)} value={line.unitPrice} onDirty={markDraftDirty} onCommit={(value) => updateLine(index, { unitPrice: value.trim() ? value : "0" })} /></span></td>
                <td><PdfBlurCommitInput aria-label={`${isLunchBox ? "份數" : "數量"} ${index + 1}`} inputMode="decimal" value={line.quantity} onDirty={markDraftDirty} onCommit={(value) => updateLine(index, { quantity: value })} /></td>
                <td className="quote-pdf-money">${(numberValue(line.quantity) * numberValue(line.unitPrice)).toLocaleString("zh-HK")}</td>
              </tr>
            );
          })}
          {showTotals && !hasUtensilPackLine && numberValue(draft.utensilPackQuantity) > 0 ? (
            <tr className="quote-pdf-utensil-row">
              <td>{draft.lines.length + 1}</td>
              <td><strong>餐具包</strong></td>
              <td>$0</td>
              <td>{draft.utensilPackQuantity}</td>
              <td className="quote-pdf-money">$0</td>
            </tr>
          ) : null}
        </tbody>
        {showTotals && !isLunchBox ? <tbody className="quote-pdf-summary-rows">
          <tr><td className="quote-pdf-summary-label" colSpan={4}>小計：</td><td><strong>${totals.productSubtotal.toLocaleString("zh-HK")}</strong></td></tr>
          <tr>
            <td colSpan={4}>
              <FilterableSelect className="quote-pdf-edit-only shipping-fee-select" aria-label="運費項目" value={draft.shippingFeeId} onChange={(event) => selectShippingFee(event.target.value)}>
                <option value="">選擇運費</option>
                {shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item}</option>)}
              </FilterableSelect>
              <span className="quote-pdf-print-only">{draft.shippingFeeLabel || "選擇運費"}</span>
            </td>
            <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><PdfBlurCommitInput aria-label="運費" inputMode="decimal" size={Math.max(draft.shippingFee.length, 1)} value={draft.shippingFee} onDirty={markDraftDirty} onCommit={(value) => update("shippingFee", value.trim() ? value : "0")} /></span></td>
          </tr>
          <tr><td className="quote-pdf-summary-label" colSpan={4}>總數：</td><td><strong>${totals.productTotal.toLocaleString("zh-HK")}</strong></td></tr>
        </tbody> : null}
      </table>
    </div>
  );
  const trailingQuoteUnits: QuoteTrailingUnit[] = [
    ...(canAddAdditionalInfo ? [{ kind: "node" as const, key: "additional", node: <section className={`quote-pdf-additional${draft.additionalInfo.length ? "" : " is-empty"}`} aria-label="額外資訊">
        <div className="quote-pdf-section-title"><Button size="sm" onClick={() => setAdditionalOpen(true)}><Plus />新增額外資訊</Button></div>
        {draft.additionalInfo.length ? <ol>
          {draft.additionalInfo.map((item, index) => (
            <li key={`${item}-${index}`}><PdfBlurCommitTextarea aria-label={`額外資訊 ${index + 1}`} value={item} rows={1} onDirty={markDraftDirty} onCommit={(value) => update("additionalInfo", draft.additionalInfo.map((current, itemIndex) => itemIndex === index ? value : current))} /><button type="button" aria-label={`刪除額外資訊 ${index + 1}`} onClick={() => update("additionalInfo", draft.additionalInfo.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></li>
          ))}
        </ol> : null}
      </section> }] : []),
    ...(isLunchBox ? [{ kind: "node" as const, key: "activity", node: <div>{activityActions}{activityContent}</div> }] : []),
    ...(draft.terms.length
      ? draft.terms.map((_, itemIndex) => ({ kind: "term" as const, itemIndex }))
      : [{ kind: "term" as const, itemIndex: null }]),
    ...(draft.paymentMethods.length
      ? draft.paymentMethods.map((_, itemIndex) => ({ kind: "payment" as const, itemIndex }))
      : [{ kind: "payment" as const, itemIndex: null }]),
    { kind: "node", key: "signature", node: <div>{signatureToggle}{signatureContent}</div> },
  ];
  const trailingModulePages = splitPdfModuleIndexes(trailingQuoteUnits.length, trailingPageBreaks);
  const renderTrailingModules = (indexes: number[]) => {
    const rendered: ReactNode[] = [];
    for (let cursor = 0; cursor < indexes.length;) {
      const moduleIndex = indexes[cursor];
      const unit = trailingQuoteUnits[moduleIndex];
      if (unit.kind === "node") {
        rendered.push(
          <div className="quote-pdf-auto-module" data-pdf-auto-module-index={moduleIndex} key={unit.key}>
            {unit.node}
          </div>,
        );
        cursor += 1;
        continue;
      }

      const kind = unit.kind;
      const run: Array<{ moduleIndex: number; itemIndex: number | null }> = [];
      while (cursor < indexes.length) {
        const nextModuleIndex = indexes[cursor];
        const nextUnit = trailingQuoteUnits[nextModuleIndex];
        if (nextUnit.kind !== kind) break;
        run.push({ moduleIndex: nextModuleIndex, itemIndex: nextUnit.itemIndex });
        cursor += 1;
      }
      const isTerm = kind === "term";
      const isEmpty = run.every((item) => item.itemIndex === null);
      const firstItemIndex = run.find((item) => item.itemIndex !== null)?.itemIndex ?? 0;
      rendered.push(
        <section className={`quote-pdf-notes${isEmpty ? " is-empty" : ""}`} key={`${kind}-${moduleIndex}`}>
          <section
            className={`quote-pdf-note-block${isEmpty ? " is-empty" : ""}`}
            {...(isEmpty ? { "data-pdf-auto-module-index": moduleIndex } : {})}
          >
            <button type="button" className="quote-pdf-note-heading" onClick={() => isTerm ? setTermsOpen(true) : setPaymentsOpen(true)}>
              {isTerm ? "條款及細則：" : "我們提供以下付款方式："}<span className="quote-pdf-edit-only" aria-hidden="true">＋</span>
            </button>
            <ol style={{ counterReset: `quote-note ${firstItemIndex}` }}>
              {run.map((item) => item.itemIndex === null ? null : (
                <li data-pdf-auto-module-index={item.moduleIndex} key={`${kind}-${item.itemIndex}`}>
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
                </li>
              ))}
            </ol>
          </section>
        </section>,
      );
    }
    return rendered;
  };

  return (
    <section ref={editorRef} className={`quote-pdf-editor${backPages.length ? " has-back-pages" : ""}`}>
      <div className="quote-pdf-toolbar">
        <div>
          <strong>報價表工作稿</strong>
          <span>所有白色欄位均可直接編輯</span>
        </div>
        <div>
          <span className="quote-pdf-saved">{saved ? <><Check /> 已自動儲存</> : "自動儲存中…"}</span>
          {pdfPagesError ? <span className="quote-pdf-insert-error">{t("quotes.pdfPages.insertLoadWarning")}</span> : null}
          {pdfPages.length ? <span className="quote-pdf-insert-count">{t("quotes.pdfPages.insertCount", { count: pdfPages.length })}</span> : null}
          <Button onClick={() => void printQuotePdf()}><Printer />確定並列印 PDF</Button>
        </div>
      </div>

      {frontPages.map((page) => (
        <main className="quote-pdf-insert-page quote-pdf-front-page" key={page.id} aria-label={page.title}>
          <img src={page.previewUrl} alt={page.title} />
        </main>
      ))}

      <main className="quote-pdf-sheet" data-pdf-auto-page={productLinePages.length === 1 ? "products" : undefined}>
        <header className="quote-pdf-letterhead">
          <img src={brandLogo} alt={brandLogoAlt} />
          <div>
            <h1>{documentTitle}</h1>
            <PdfBlurCommitInput aria-label="報價單號" value={draft.quoteNumber} onDirty={markDraftDirty} onCommit={(value) => update("quoteNumber", value)} />
          </div>
          <img className="quote-pdf-award" src="/assets/award-logo.avif" alt="公司認證及獎項" />
        </header>

        <div className="quote-pdf-meta-grid">
          <div className="quote-pdf-customer-company" data-testid="quote-customer-company">
            <label htmlFor="quote-customer">客戶名稱</label><PdfBlurCommitInput id="quote-customer" value={draft.customerName} onDirty={markDraftDirty} onCommit={(value) => update("customerName", value)} />
            <label htmlFor="quote-company">公司名稱</label><PdfBlurCommitInput id="quote-company" value={draft.companyName} onDirty={markDraftDirty} onCommit={(value) => update("companyName", value)} />
          </div>
          <label htmlFor="quote-date">報價日期</label><PdfBlurCommitInput id="quote-date" inputMode="numeric" placeholder={t("quotes.pdfEditor.datePlaceholder")} value={draft.quoteDate} onDirty={markDraftDirty} onCommit={(value) => update("quoteDate", value)} />
          <label htmlFor="quote-contact">聯絡資料</label><PdfBlurCommitInput id="quote-contact" value={draft.contact} onDirty={markDraftDirty} onCommit={(value) => update("contact", value)} />
          <label htmlFor="quote-delivery-date">送貨日期</label><PdfBlurCommitInput id="quote-delivery-date" inputMode="numeric" placeholder={t("quotes.pdfEditor.datePlaceholder")} value={draft.deliveryDate} onDirty={markDraftDirty} onCommit={(value) => update("deliveryDate", value)} />
          <label htmlFor="quote-address">送貨地址</label><PdfBlurCommitTextarea id="quote-address" rows={1} value={draft.deliveryAddress} onDirty={markDraftDirty} onCommit={(value) => update("deliveryAddress", value)} />
          <label htmlFor="quote-delivery-time">送貨時段</label><PdfBlurCommitInput id="quote-delivery-time" value={draft.deliveryTime} onDirty={markDraftDirty} onCommit={(value) => update("deliveryTime", value)} />
        </div>

        {renderProductTable(productLinePages[0], 0, productLinePages.length === 1)}
        {productLinePages.length === 1 ? renderTrailingModules(trailingModulePages[0] ?? []) : null}
        <QuotePdfPageFooter email={brandEmail} />
      </main>

      {productLinePages.slice(1).map((lines, pageIndex) => {
        const isFinalProductPage = pageIndex === productLinePages.length - 2;
        const offset = FIRST_PRODUCT_PAGE_SIZE + pageIndex * CONTINUATION_PRODUCT_PAGE_SIZE;
        return (
          <main className="quote-pdf-sheet quote-pdf-sheet-continuation quote-pdf-product-continuation" data-pdf-auto-page={isFinalProductPage ? "products" : undefined} aria-label={`PDF 第 ${pageIndex + 2} 頁`} key={`products-${pageIndex}`}>
            {continuationLetterhead}
            {renderProductTable(lines, offset, isFinalProductPage)}
            {isFinalProductPage ? renderTrailingModules(trailingModulePages[0] ?? []) : null}
            <QuotePdfPageFooter email={brandEmail} />
          </main>
        );
      })}

      {trailingModulePages.slice(1).map((moduleIndexes, pageIndex) => (
        <main
          className="quote-pdf-sheet quote-pdf-sheet-continuation quote-pdf-auto-continuation"
          data-pdf-auto-page="modules"
          aria-label={`PDF 第 ${productLinePages.length + pageIndex + 1} 頁`}
          key={`trailing-page-${pageIndex}`}
        >
          {continuationLetterhead}
          {renderTrailingModules(moduleIndexes)}
          <QuotePdfPageFooter email={brandEmail} />
        </main>
      ))}

      {backPages.map((page, index) => (
        <main
          className={`quote-pdf-insert-page quote-pdf-back-page${index === backPages.length - 1 ? " is-final-page" : ""}`}
          key={page.id}
          aria-label={page.title}
        >
          <img src={page.previewUrl} alt={page.title} />
        </main>
      ))}

      <QuotePdfPageFooter email={brandEmail} printOnly />

      {canAddAdditionalInfo ? <Modal open={additionalOpen} onClose={() => setAdditionalOpen(false)} title="額外資訊" closeLabel="關閉額外資訊" size="lg" rootClassName="quote-clause-modal-root" className="quote-supplement-modal quote-pdf-supplement-modal" footer={<Button onClick={() => setAdditionalOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker">
          <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋額外資訊" placeholder={t("quotes.pdfEditor.additionalSearchPlaceholder")} value={additionalSearch} onChange={(event) => setAdditionalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAdditional(additionalSearch); }} /><Button variant="outline" onClick={() => addAdditional(additionalSearch)}><Plus />加入</Button></div>
          <p>可搜尋下列範本，亦可直接輸入任何文字再按 Add。</p>
          <ul>
            {filteredAdditional.map((option) => <li key={option}><span>{option}</span><Button size="sm" variant="outline" onClick={() => addAdditional(option)}><Plus />加入</Button></li>)}
          </ul>
          {draft.additionalInfo.length ? <div className="quote-supplement-selected"><strong>已加入</strong>{draft.additionalInfo.map((item, index) => <div key={`${item}-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除額外資訊 ${index + 1}`} onClick={() => update("additionalInfo", draft.additionalInfo.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div> : null}
        </div>
      </Modal> : null}

      <Modal open={termsOpen} onClose={() => setTermsOpen(false)} title="條款及細則" closeLabel="關閉條款及細則" size="lg" rootClassName="quote-clause-modal-root" className="quote-supplement-modal quote-pdf-supplement-modal" footer={<Button onClick={() => setTermsOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker quote-clause-picker">
          <QuoteClauseSearchPicker search={termSearch} onSearchChange={setTermSearch} options={termOptions.filter((option) => !draft.terms.includes(option))} searchLabel="搜尋條款及細則" placeholder={t("quotes.pdfEditor.termsSearchPlaceholder")} onAdd={(value) => addDraftItem("terms", value)} />
          <p>可搜尋條款範本，亦可自由輸入內容後按「加入」。</p>
          <div className="quote-supplement-selected"><strong>已加入的條例</strong>{draft.terms.map((item, index) => <div key={`selected-term-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除條款及細則 ${index + 1}`} onClick={() => update("terms", draft.terms.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
        </div>
      </Modal>

      <Modal open={paymentsOpen} onClose={() => setPaymentsOpen(false)} title="付款方式" closeLabel="關閉付款方式" size="lg" rootClassName="quote-clause-modal-root" className="quote-supplement-modal quote-pdf-supplement-modal" footer={<Button onClick={() => setPaymentsOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker quote-clause-picker">
          <QuoteClauseSearchPicker search={paymentSearch} onSearchChange={setPaymentSearch} options={paymentOptions.filter((option) => !draft.paymentMethods.includes(option))} searchLabel="搜尋付款方式" placeholder={t("quotes.pdfEditor.paymentSearchPlaceholder")} onAdd={(value) => addDraftItem("paymentMethods", value)} />
          <p>可搜尋付款方式範本，亦可自由輸入內容後按「加入」。</p>
          <div className="quote-supplement-selected"><strong>已加入的付款方式</strong>{draft.paymentMethods.map((item, index) => <div key={`selected-payment-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除付款方式 ${index + 1}`} onClick={() => update("paymentMethods", draft.paymentMethods.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
        </div>
      </Modal>

      {isLunchBox ? <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="活動報價" closeLabel="關閉活動報價" size="lg" rootClassName="quote-clause-modal-root" className="quote-supplement-modal quote-pdf-supplement-modal" footer={<Button onClick={() => setActivityOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker quote-activity-picker">
          <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋活動報價" placeholder={t("quotes.pdfEditor.activitySearchPlaceholder")} value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addActivity(activitySearch); }} /><Button variant="outline" onClick={() => addActivity(activitySearch)}><Plus />加入</Button></div>
          <p>可搜尋活動項目範本，亦可直接輸入任何文字再按 Add。</p>
          <ul>
            {activityOptions.filter((option) => (!activitySearch.trim() || option.description.toLocaleLowerCase().includes(activitySearch.trim().toLocaleLowerCase())) && !draft.activities.some((activity) => activity.description === option.description)).map((option) => <li key={option.description}><span>{option.description}</span><span>${Number(option.amount).toLocaleString("zh-HK")}</span><Button size="sm" variant="outline" onClick={() => addActivity(option.description, option.amount)}><Plus />加入</Button></li>)}
          </ul>
          {draft.activities.length ? <div className="quote-supplement-selected"><strong>已加入</strong>{draft.activities.map((activity, index) => <div key={activity.id}><span>（{index + 1}） {activity.description}</span><button type="button" aria-label={`移除活動項目 ${index + 1}`} onClick={() => update("activities", draft.activities.filter((_, activityIndex) => activityIndex !== index))}><Minus /></button></div>)}</div> : null}
        </div>
      </Modal> : null}
    </section>
  );
}
