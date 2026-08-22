import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Minus,
  Plus,
  Printer,
  Search,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PdfAutoResizeTextarea } from "@/components/PdfAutoResizeTextarea";
import { QuoteClauseSearchPicker } from "@/components/QuoteClauseSearchPicker";
import {
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
import { PAYMENT_METHOD_OPTIONS, TERM_OPTIONS } from "@/lib/quote-clause-options";
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

const FIRST_PRODUCT_PAGE_SIZE = 10;
const CONTINUATION_PRODUCT_PAGE_SIZE = 18;

type QuotePdfDraft = {
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
  activityStartsNewPage: boolean;
  notesStartsNewPage: boolean;
  signatureStartsNewPage: boolean;
  showCustomerSignature: boolean;
  activityShippingFeeId: string;
  activityShippingNote: string;
  activityShippingFee: string;
  terms: string[];
  paymentMethods: string[];
  shippingFeeId: string;
  shippingFeeLabel: string;
  shippingFee: string;
  discount: string;
  cashDollarDeduction: string;
  cashDollarPurchase: string;
};

const ADDITIONAL_INFO_OPTIONS = [
  "每個便當包括一份餐具",
  "每款揀選的飯盒最少3盒",
  "以上只列出部份款式，我們另可提供更多選擇及客製款式",
  "以上便當款式每盒可自選一款飲品：烏龍茶／檸檬茶／可口可樂",
  "如需加購紙包飲品 $4／包：烏龍茶／檸檬茶／可口可樂",
];

const ACTIVITY_OPTIONS = [
  { description: "10月15日 120個飯盒", amount: "5400" },
  { description: "活動場地佈置及運送", amount: "800" },
  { description: "即棄餐具及飲品套裝", amount: "480" },
];

function pdfDate(value: string | null | undefined) {
  if (!value) return "";
  const isoDate = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoDate) return value;
  return `${Number(isoDate[3])}/${Number(isoDate[2])}/${isoDate[1]}`;
}

function lineToDraft(line: DetailLine): EditableLine {
  return {
    id: line.id,
    description: line.productName || line.content || "",
    quantity: line.quantity === null ? "" : String(line.quantity),
    unitPrice: line.unitPrice === null ? "0" : String(line.unitPrice),
  };
}

function resultToDraft(result: OrderDetailResult): QuotePdfDraft {
  const order = result.order;
  return {
    brandName: order?.channelName || "Food Channel Catering",
    quoteNumber: order?.orderNumber || "",
    quoteDate: pdfDate(order?.updatedAt),
    customerName: order?.customerName || "",
    companyName: order?.companyName || "",
    contact: [order?.contactA, order?.contactB].filter(Boolean).join(" / "),
    email: order?.email || "",
    deliveryAddress: order?.address || "",
    deliveryDate: pdfDate(order?.deliveryAt),
    deliveryTime: order?.shipOutTime || "",
    lines: result.lines.length
      ? result.lines.map(lineToDraft)
      : [{ id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "0" }],
    additionalInfo: [],
    activities: [],
    utensilPackQuantity: "0",
    activityStartsNewPage: false,
    notesStartsNewPage: false,
    signatureStartsNewPage: false,
    showCustomerSignature: false,
    activityShippingFeeId: "",
    activityShippingNote: "運費－滿 $2800 免運費－地面交收",
    activityShippingFee: "0",
    terms: result.terms.filter((item) => item.trim()),
    paymentMethods: result.paymentMethods.filter((item) => item.trim()),
    shippingFeeId: "",
    shippingFeeLabel: "",
    shippingFee: order ? String(order.shippingFee || 0) : "0",
    discount: order ? String(order.discount || 0) : "0",
    cashDollarDeduction: "0",
    cashDollarPurchase: "0",
  };
}

function normalizeDraft(value: Partial<QuotePdfDraft> | null | undefined, fallback: QuotePdfDraft): QuotePdfDraft {
  const stored = value && typeof value === "object" ? value : {};
  const normalizeItems = (items: unknown, fallbackItems: string[]) => {
    if (Array.isArray(items)) return items.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (typeof items === "string") return items.split(/\r?\n/).filter((item) => item.trim());
    return fallbackItems;
  };
  return {
    ...fallback,
    ...stored,
    brandName: fallback.brandName,
    quoteDate: pdfDate(stored.quoteDate || fallback.quoteDate),
    deliveryDate: pdfDate(stored.deliveryDate || fallback.deliveryDate),
    lines: (Array.isArray(stored.lines) ? stored.lines : fallback.lines).map((line) => ({
      ...line,
      unitPrice: line.unitPrice?.trim() || "0",
    })),
    additionalInfo: stored.additionalInfo ?? [],
    activities: (stored.activities ?? []).map((activity) => ({
      ...activity,
      amount: activity.amount?.trim() || "0",
    })),
    utensilPackQuantity: stored.utensilPackQuantity ?? "0",
    activityStartsNewPage: stored.activityStartsNewPage ?? false,
    notesStartsNewPage: stored.notesStartsNewPage ?? false,
    signatureStartsNewPage: stored.signatureStartsNewPage ?? false,
    showCustomerSignature: stored.showCustomerSignature ?? false,
    activityShippingFeeId: stored.activityShippingFeeId ?? "",
    activityShippingNote:
      stored.activityShippingNote ?? "運費－滿 $2800 免運費－地面交收",
    activityShippingFee: stored.activityShippingFee?.trim() || "0",
    shippingFeeId: stored.shippingFeeId ?? "",
    shippingFeeLabel: stored.shippingFeeLabel ?? "",
    shippingFee: stored.shippingFee?.trim() || "0",
    discount: stored.discount ?? fallback.discount,
    cashDollarDeduction: stored.cashDollarDeduction ?? "0",
    cashDollarPurchase: stored.cashDollarPurchase ?? "0",
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

function QuotePdfPageFooter({ printOnly = false }: { printOnly?: boolean }) {
  return (
    <footer className={`quote-pdf-page-footer${printOnly ? " is-print-only" : ""}`}>
      <span>荃灣華力工業中心5樓D-G室</span>
      <span>(+852) 2185 7373 / 5396 4335</span>
      <span>sales@foodchannels-catering.com</span>
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
  const { t } = useTranslation();
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
  const [sourceBrand, setSourceBrand] = useState<{ channelId: string; name: string; quoteNumber: string }>({ channelId: "", name: "", quoteNumber: "" });
  const [saved, setSaved] = useState(true);
  const editorRef = useRef<HTMLElement>(null);

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
    if (!draft) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
      setSaved(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, storageKey]);

  useLayoutEffect(() => {
    if (!draft) return;
    const frame = window.requestAnimationFrame(() => {
      const overflowingPage = Array.from(
        editorRef.current?.querySelectorAll<HTMLElement>(".quote-pdf-sheet") ?? [],
      ).find((page) => page.scrollHeight > page.clientHeight + 2);
      if (!overflowingPage) return;

      const moveSignature = !draft.signatureStartsNewPage
        && Boolean(overflowingPage.querySelector(".quote-pdf-signature"));
      const moveNotes = !draft.notesStartsNewPage
        && Boolean(overflowingPage.querySelector(".quote-pdf-notes"));
      const moveActivity = !draft.activityStartsNewPage
        && Boolean(overflowingPage.querySelector(".quote-pdf-activity"));
      if (!moveSignature && !moveNotes && !moveActivity) return;

      setDraft((current) => current ? {
        ...current,
        ...(moveSignature ? { signatureStartsNewPage: true } : {}),
        ...(!moveSignature && moveNotes ? { notesStartsNewPage: true } : {}),
        ...(!moveSignature && !moveNotes && moveActivity ? { activityStartsNewPage: true } : {}),
      } : current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft]);

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
    window.print();
  }, []);

  const totals = useMemo(() => {
    const productSubtotal = (draft?.lines ?? []).reduce(
      (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice),
      0,
    );
    const activitySubtotal = (draft?.activities ?? []).reduce(
      (sum, activity) => sum + numberValue(activity.amount),
      0,
    );
    const activityTotal = activitySubtotal + numberValue(draft?.activityShippingFee ?? "");
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
    return ADDITIONAL_INFO_OPTIONS.filter(
      (option) => !term || option.toLocaleLowerCase().includes(term),
    );
  }, [additionalSearch]);

  const update = <K extends keyof QuotePdfDraft>(key: K, value: QuotePdfDraft[K]) => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

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
    if (!draft || !text) return;
    update("additionalInfo", [...draft.additionalInfo, text]);
    setAdditionalSearch("");
  };

  const addActivity = (description: string, amount = "0") => {
    const text = description.trim();
    if (!draft || !text) return;
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
  const brandLogo = getDocumentLogoPath(...brandValues);
  const brandLogoAlt = getBrandLogoAlt(...brandValues);
  const isLunchBox = getBrandKind(...brandValues) === "lunch-box";
  const documentTitle = quoteDocumentTitle(sourceBrand.quoteNumber || draft.quoteNumber, isLunchBox);
  const canAddAdditionalInfo = isLunchBox || getBrandKind(...brandValues) === "party-food";
  const hasActivities = isLunchBox && draft.activities.length > 0;
  // Legacy drafts can retain this flag after their final activity is removed.
  // Treat it as a layout preference only while there is activity content to move.
  const activityStartsNewPage = hasActivities && draft.activityStartsNewPage;
  const frontPages = pdfPages.filter((page) => page.placement === "front");
  const backPages = pdfPages.filter((page) => page.placement === "back");
  const productLinePages = [draft.lines.slice(0, FIRST_PRODUCT_PAGE_SIZE)];
  for (let index = FIRST_PRODUCT_PAGE_SIZE; index < draft.lines.length; index += CONTINUATION_PRODUCT_PAGE_SIZE) {
    productLinePages.push(draft.lines.slice(index, index + CONTINUATION_PRODUCT_PAGE_SIZE));
  }
  const hasUtensilPackLine = draft.lines.some((line) => (line.description ?? "").replace(/\s/g, "").includes("餐具包"));
  const notesControls = (
    <div className="quote-pdf-page-controls quote-pdf-notes-page-controls" aria-label="條款及付款方式分頁控制">
      <Button variant="outline" disabled={draft.notesStartsNewPage} onClick={() => update("notesStartsNewPage", true)}><ChevronDown />下移一頁</Button>
      <Button variant="outline" disabled={!draft.notesStartsNewPage} onClick={() => update("notesStartsNewPage", false)}><ChevronUp />上移一頁</Button>
      <span>{draft.notesStartsNewPage ? "條款及付款方式已移至下一頁" : "條款及付款方式接續在本頁"}</span>
    </div>
  );
  const notesContent = (
    <section className={`quote-pdf-notes${!draft.terms.length && !draft.paymentMethods.length ? " is-empty" : ""}`}>
      <section className={`quote-pdf-note-block${!draft.terms.length ? " is-empty" : ""}`}>
        <button type="button" className="quote-pdf-note-heading" onClick={() => setTermsOpen(true)}>條款及細則：<span className="quote-pdf-edit-only" aria-hidden="true">＋</span></button>
        <ol>{draft.terms.map((item, index) => <li key={`term-${index}`}><textarea rows={1} aria-label={`條款及細則 ${index + 1}`} value={item} onChange={(event) => update("terms", draft.terms.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /></li>)}</ol>
      </section>
      <section className={`quote-pdf-note-block${!draft.paymentMethods.length ? " is-empty" : ""}`}>
        <button type="button" className="quote-pdf-note-heading" onClick={() => setPaymentsOpen(true)}>我們提供以下付款方式：<span className="quote-pdf-edit-only" aria-hidden="true">＋</span></button>
        <ol>{draft.paymentMethods.map((item, index) => <li key={`payment-${index}`}><textarea rows={1} aria-label={`付款方式 ${index + 1}`} value={item} onChange={(event) => update("paymentMethods", draft.paymentMethods.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /></li>)}</ol>
      </section>
    </section>
  );
  const signatureControls = (
    <div className="quote-pdf-page-controls quote-pdf-signature-page-controls" aria-label="客戶簽署分頁控制">
      <Button variant="outline" disabled={draft.signatureStartsNewPage} onClick={() => update("signatureStartsNewPage", true)}><ChevronDown />下移一頁</Button>
      <Button variant="outline" disabled={!draft.signatureStartsNewPage} onClick={() => update("signatureStartsNewPage", false)}><ChevronUp />上移一頁</Button>
      <label className="quote-pdf-customer-signature-toggle">
        <input type="checkbox" checked={draft.showCustomerSignature} onChange={(event) => update("showCustomerSignature", event.target.checked)} />
        顯示客戶簽署
      </label>
    </div>
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
          <em>{draft.customerName || "客戶"}</em>
          <span className="quote-pdf-signature-stamp-spacer" aria-hidden="true" />
          <label><strong>公司蓋印及簽署：</strong><span /></label>
          <label><strong>負責人姓名：</strong><span /></label>
          <label><strong>簽署日期：</strong><span /></label>
        </div>
      ) : null}
    </section>
  );
  const activityControls = isLunchBox ? (
    <div className="quote-pdf-page-controls" aria-label="活動報價分頁控制">
      <Button variant="outline" disabled={!hasActivities || activityStartsNewPage} onClick={() => update("activityStartsNewPage", true)}><ChevronDown />下移一頁</Button>
      <Button variant="outline" disabled={!activityStartsNewPage} onClick={() => update("activityStartsNewPage", false)}><ChevronUp />上移一頁</Button>
      <Button onClick={() => setActivityOpen(true)}><Plus />新增活動項目</Button>
      <span>{!hasActivities ? "尚未新增活動項目" : activityStartsNewPage ? "活動報價將由下一頁開始" : "活動報價接續在本頁"}</span>
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
                <td><input aria-label={`活動報價 ${index + 1}`} value={activity.description} onChange={(event) => updateActivity(index, { description: event.target.value })} /></td>
                <td>$<input aria-label={`活動價錢 ${index + 1}`} inputMode="decimal" value={activity.amount} onChange={(event) => updateActivity(index, { amount: event.target.value })} onBlur={() => { if (!activity.amount.trim()) updateActivity(index, { amount: "0" }); }} /></td>
              </tr>
            ))}
          </tbody>
        </> : null}
        <tfoot>
          <tr><td colSpan={2}>小計：</td><td>${totals.activitySubtotal.toLocaleString("zh-HK")}</td></tr>
          <tr>
            <td colSpan={2}>
              <select className="quote-pdf-edit-only" aria-label="活動運費項目" value={draft.activityShippingFeeId} onChange={(event) => selectActivityShippingFee(event.target.value)}>
                <option value="">選擇運費</option>
                {shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item}</option>)}
              </select>
              <span className="quote-pdf-print-only">{draft.activityShippingNote || "選擇運費"}</span>
            </td>
            <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><input aria-label="活動運費" inputMode="decimal" size={Math.max(draft.activityShippingFee.length, 1)} value={draft.activityShippingFee} onChange={(event) => update("activityShippingFee", event.target.value)} onBlur={() => { if (!draft.activityShippingFee.trim()) update("activityShippingFee", "0"); }} /></span></td>
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
                <td><input className="quote-pdf-product-input" aria-label={`產品 ${index + 1}`} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><input aria-label={`單價 ${index + 1}`} inputMode="decimal" size={Math.max(line.unitPrice.length, 1)} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} onBlur={() => { if (!line.unitPrice.trim()) updateLine(index, { unitPrice: "0" }); }} /></span></td>
                <td><input aria-label={`${isLunchBox ? "份數" : "數量"} ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
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
              <select className="quote-pdf-edit-only" aria-label="運費項目" value={draft.shippingFeeId} onChange={(event) => selectShippingFee(event.target.value)}>
                <option value="">選擇運費</option>
                {shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item}</option>)}
              </select>
              <span className="quote-pdf-print-only">{draft.shippingFeeLabel || "選擇運費"}</span>
            </td>
            <td><span className="quote-pdf-price-input"><span aria-hidden="true">$</span><input aria-label="運費" inputMode="decimal" size={Math.max(draft.shippingFee.length, 1)} value={draft.shippingFee} onChange={(event) => update("shippingFee", event.target.value)} onBlur={() => { if (!draft.shippingFee.trim()) update("shippingFee", "0"); }} /></span></td>
          </tr>
          <tr><td className="quote-pdf-summary-label" colSpan={4}>總數：</td><td><strong>${totals.productTotal.toLocaleString("zh-HK")}</strong></td></tr>
        </tbody> : null}
      </table>
    </div>
  );
  const trailingQuoteContent = (
    <>
      {canAddAdditionalInfo ? <section className={`quote-pdf-additional${draft.additionalInfo.length ? "" : " is-empty"}`} aria-label="額外資訊">
        <div className="quote-pdf-section-title"><Button size="sm" onClick={() => setAdditionalOpen(true)}><Plus />新增額外資訊</Button></div>
        {draft.additionalInfo.length ? <ol>
          {draft.additionalInfo.map((item, index) => (
            <li key={`${item}-${index}`}><textarea aria-label={`額外資訊 ${index + 1}`} value={item} rows={1} onChange={(event) => update("additionalInfo", draft.additionalInfo.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /><button type="button" aria-label={`刪除額外資訊 ${index + 1}`} onClick={() => update("additionalInfo", draft.additionalInfo.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></li>
          ))}
        </ol> : null}
      </section> : null}
      {isLunchBox && !activityStartsNewPage ? <>{activityControls}{activityContent}</> : null}
      {!activityStartsNewPage && !draft.notesStartsNewPage ? <>{notesControls}{notesContent}</> : null}
      {!activityStartsNewPage && !draft.notesStartsNewPage && !draft.signatureStartsNewPage ? <>{signatureControls}{signatureContent}</> : null}
    </>
  );

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

      <main className="quote-pdf-sheet">
        <header className="quote-pdf-letterhead">
          <img src={brandLogo} alt={brandLogoAlt} />
          <div>
            <h1>{documentTitle}</h1>
            <input aria-label="報價單號" value={draft.quoteNumber} onChange={(event) => update("quoteNumber", event.target.value)} />
          </div>
          <img className="quote-pdf-award" src="/assets/award-logo.avif" alt="公司認證及獎項" />
        </header>

        <div className="quote-pdf-meta-grid">
          <div className="quote-pdf-customer-company" data-testid="quote-customer-company">
            <label htmlFor="quote-customer">客戶名稱</label><input id="quote-customer" value={draft.customerName} onChange={(event) => update("customerName", event.target.value)} />
            <label htmlFor="quote-company">公司名稱</label><input id="quote-company" value={draft.companyName} onChange={(event) => update("companyName", event.target.value)} />
          </div>
          <label htmlFor="quote-date">報價日期</label><input id="quote-date" inputMode="numeric" placeholder={t("quotes.pdfEditor.datePlaceholder")} value={draft.quoteDate} onChange={(event) => update("quoteDate", event.target.value)} />
          <label htmlFor="quote-contact">聯絡資料</label><input id="quote-contact" value={draft.contact} onChange={(event) => update("contact", event.target.value)} />
          <label htmlFor="quote-delivery-date">送貨日期</label><input id="quote-delivery-date" inputMode="numeric" placeholder={t("quotes.pdfEditor.datePlaceholder")} value={draft.deliveryDate} onChange={(event) => update("deliveryDate", event.target.value)} />
          <label htmlFor="quote-address">送貨地址</label><PdfAutoResizeTextarea id="quote-address" value={draft.deliveryAddress} onChange={(event) => update("deliveryAddress", event.target.value)} />
          <label htmlFor="quote-delivery-time">送貨時段</label><input id="quote-delivery-time" value={draft.deliveryTime} onChange={(event) => update("deliveryTime", event.target.value)} />
        </div>

        {renderProductTable(productLinePages[0], 0, productLinePages.length === 1)}
        {productLinePages.length === 1 ? trailingQuoteContent : null}
        <QuotePdfPageFooter />
      </main>

      {productLinePages.slice(1).map((lines, pageIndex) => {
        const isFinalProductPage = pageIndex === productLinePages.length - 2;
        const offset = FIRST_PRODUCT_PAGE_SIZE + pageIndex * CONTINUATION_PRODUCT_PAGE_SIZE;
        return (
          <main className="quote-pdf-sheet quote-pdf-sheet-continuation quote-pdf-product-continuation" aria-label={`PDF 第 ${pageIndex + 2} 頁`} key={`products-${pageIndex}`}>
            {continuationLetterhead}
            {renderProductTable(lines, offset, isFinalProductPage)}
            {isFinalProductPage ? trailingQuoteContent : null}
            <QuotePdfPageFooter />
          </main>
        );
      })}

      {activityStartsNewPage ? (
        <main className="quote-pdf-sheet quote-pdf-sheet-continuation" aria-label={`PDF 第 ${productLinePages.length + 1} 頁`}>
          {continuationLetterhead}
          {activityControls}
          {activityContent}
          {!draft.notesStartsNewPage ? <>{notesControls}{notesContent}</> : null}
          {!draft.notesStartsNewPage && !draft.signatureStartsNewPage ? <>{signatureControls}{signatureContent}</> : null}
          <QuotePdfPageFooter />
        </main>
      ) : null}

      {draft.notesStartsNewPage ? (
        <main className="quote-pdf-sheet quote-pdf-sheet-continuation" aria-label={`PDF 第 ${productLinePages.length + 1 + Number(activityStartsNewPage)} 頁`}>
          {continuationLetterhead}
          {notesControls}
          {notesContent}
          {!draft.signatureStartsNewPage ? <>{signatureControls}{signatureContent}</> : null}
          <QuotePdfPageFooter />
        </main>
      ) : null}

      {draft.signatureStartsNewPage ? (
        <main className="quote-pdf-sheet quote-pdf-sheet-continuation" aria-label={`PDF 第 ${productLinePages.length + 1 + Number(activityStartsNewPage) + Number(draft.notesStartsNewPage)} 頁`}>
          {continuationLetterhead}
          {signatureControls}
          {signatureContent}
          <QuotePdfPageFooter />
        </main>
      ) : null}

      {backPages.map((page, index) => (
        <main
          className={`quote-pdf-insert-page quote-pdf-back-page${index === backPages.length - 1 ? " is-final-page" : ""}`}
          key={page.id}
          aria-label={page.title}
        >
          <img src={page.previewUrl} alt={page.title} />
        </main>
      ))}

      <QuotePdfPageFooter printOnly />

      {canAddAdditionalInfo ? <Modal open={additionalOpen} onClose={() => setAdditionalOpen(false)} title="額外資訊" closeLabel="關閉額外資訊" size="lg" footer={<Button onClick={() => setAdditionalOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker">
          <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋額外資訊" placeholder={t("quotes.pdfEditor.additionalSearchPlaceholder")} value={additionalSearch} onChange={(event) => setAdditionalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAdditional(additionalSearch); }} /><Button variant="outline" onClick={() => addAdditional(additionalSearch)}>Add</Button></div>
          <p>可搜尋下列範本，亦可直接輸入任何文字再按 Add。</p>
          <ul>
            {filteredAdditional.map((option) => <li key={option}><span>{option}</span><Button size="sm" variant="outline" onClick={() => addAdditional(option)}><Plus />加入</Button></li>)}
          </ul>
        </div>
      </Modal> : null}

      <Modal open={termsOpen} onClose={() => setTermsOpen(false)} title="條款及細則" closeLabel="關閉條款及細則" size="lg" rootClassName="quote-clause-modal-root" className="quote-clause-modal" footer={<Button onClick={() => setTermsOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker quote-clause-picker">
          <QuoteClauseSearchPicker search={termSearch} onSearchChange={setTermSearch} options={TERM_OPTIONS} searchLabel="搜尋條款及細則" placeholder={t("quotes.pdfEditor.termsSearchPlaceholder")} onAdd={(value) => addDraftItem("terms", value)} />
          <p>可搜尋條款範本，亦可自由輸入內容後按「加入」。</p>
          <div className="quote-clause-selected"><strong>已加入的條例</strong>{draft.terms.map((item, index) => <div key={`selected-term-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除條款及細則 ${index + 1}`} onClick={() => update("terms", draft.terms.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
        </div>
      </Modal>

      <Modal open={paymentsOpen} onClose={() => setPaymentsOpen(false)} title="付款方式" closeLabel="關閉付款方式" size="lg" rootClassName="quote-clause-modal-root" className="quote-clause-modal" footer={<Button onClick={() => setPaymentsOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker quote-clause-picker">
          <QuoteClauseSearchPicker search={paymentSearch} onSearchChange={setPaymentSearch} options={PAYMENT_METHOD_OPTIONS} searchLabel="搜尋付款方式" placeholder={t("quotes.pdfEditor.paymentSearchPlaceholder")} onAdd={(value) => addDraftItem("paymentMethods", value)} />
          <p>可搜尋付款方式範本，亦可自由輸入內容後按「加入」。</p>
          <div className="quote-clause-selected"><strong>已加入的付款方式</strong>{draft.paymentMethods.map((item, index) => <div key={`selected-payment-${index}`}><span>（{index + 1}）{item}</span><button type="button" aria-label={`移除付款方式 ${index + 1}`} onClick={() => update("paymentMethods", draft.paymentMethods.filter((_, itemIndex) => itemIndex !== index))}><Minus /></button></div>)}</div>
        </div>
      </Modal>

      {isLunchBox ? <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="活動報價" closeLabel="關閉活動報價" size="lg" footer={<Button onClick={() => setActivityOpen(false)}>確定</Button>}>
        <div className="quote-additional-picker quote-activity-picker">
          <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋活動報價" placeholder={t("quotes.pdfEditor.activitySearchPlaceholder")} value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addActivity(activitySearch); }} /><Button variant="outline" onClick={() => addActivity(activitySearch)}>Add</Button></div>
          <p>可搜尋活動項目範本，亦可直接輸入任何文字再按 Add。</p>
          <ul>
            {ACTIVITY_OPTIONS.filter((option) => !activitySearch.trim() || option.description.toLocaleLowerCase().includes(activitySearch.trim().toLocaleLowerCase())).map((option) => <li key={option.description}><span>{option.description}</span><span>${Number(option.amount).toLocaleString("zh-HK")}</span><Button size="sm" variant="outline" onClick={() => addActivity(option.description, option.amount)}><Plus />加入</Button></li>)}
          </ul>
          {draft.activities.length ? <div className="quote-activity-selected"><strong>已加入</strong>{draft.activities.map((activity, index) => <div key={activity.id}><span>（{index + 1}） {activity.description}</span><button type="button" aria-label={`移除活動項目 ${index + 1}`} onClick={() => update("activities", draft.activities.filter((_, activityIndex) => activityIndex !== index))}><Minus /></button></div>)}</div> : null}
        </div>
      </Modal> : null}
    </section>
  );
}
