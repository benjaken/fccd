import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleAlert,
  CircleCheckBig,
  CreditCard,
  Factory,
  FileText,
  GripVertical,
  LoaderCircle,
  Mail,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Undo2,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { OrderFactorySettingsControls } from "@/components/order-factory-settings-controls";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  addQuoteLine,
  addQuoteUtensilLine,
  createQuote,
  duplicateQuote,
  fetchQuoteEditorOptions,
  fetchQuoteEditorSummary,
  fetchQuoteLines,
  removeQuoteLine,
  searchQuoteCatalog,
  dedupeQuoteOptions,
  updateQuote,
  updateQuoteLine,
  updateQuoteLineOrder,
  updateQuoteFinancials,
  updateOrderFactoryStatus,
  saveQuotePayments,
  sendQuoteConfirmation,
  type CreatedQuote,
  type QuoteCatalogItem,
  type QuoteDraft,
  type QuoteEditorOptions,
  type QuoteEditorDocumentType,
  type QuoteFinancials,
  type QuoteLine,
  type QuotePayment,
} from "@/lib/quote-editor";
import { cn } from "@/lib/utils";
import {
  QUOTE_ACTIVITY_OPTIONS,
  QUOTE_ADDITIONAL_INFO_OPTIONS,
  readQuotePdfSupplements,
  writeQuotePdfSupplements,
  type QuotePdfSupplementDraft,
} from "@/lib/quote-pdf-draft";
import { fetchShippingFees, type ShippingFee } from "@/lib/shipping-fees";
import { convertQuoteToOrder, QUOTE_STATUS_OPTIONS } from "@/lib/quotes";
import { useDetailBackTo } from "@/lib/detail-navigation";
import {
  normalizeDoNotSendToFactory,
  saveOrderFactorySettings,
  type OrderFactorySettings,
} from "@/lib/order-factory-settings";

const loadConfiguredShippingFees = async () => (await fetchShippingFees(1, 1000)).rows;

const EMPTY_OPTIONS: QuoteEditorOptions = {
  channels: [],
  quoteSalesSources: [],
  quoteCommunicationChannels: [],
  districts: [],
  shippingMethods: [],
  salesPartners: [],
  orderTags: [],
  paymentMethods: [],
};

const DELIVERY_TIME_OPTIONS = [
  "10:00 - 11:00",
  "11:00 - 12:00",
  "12:00 - 13:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
  "16:00 - 17:00",
  "17:00 - 18:00",
  "18:00 - 19:00",
  "19:00 - 20:00",
];

const DELIVERY_ADDRESS_METHODS = new Set(["車邊交收", "送貨上門"]);

function automaticDistrictForMethod(name: string) {
  if (name === "門市自取") return "門市自取";
  if (name.startsWith("品酒室")) return "品酒室";
  if (name.startsWith("寫字樓")) return "寫字樓";
  return null;
}

function quarterHourOptions(startHour = 8, startMinute = 30, endHour = 20) {
  const values: string[] = [];
  for (let minutes = startHour * 60 + startMinute; minutes <= endHour * 60; minutes += 15) {
    const hours = Math.floor(minutes / 60);
    const minute = minutes % 60;
    values.push(`${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }
  return values;
}

const SHIP_OUT_TIME_OPTIONS = quarterHourOptions();

function hongKongToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function emptyDraft(): QuoteDraft {
  return {
    channelId: "",
    quoteStatus: "",
    quoteSalesSourceId: "",
    quoteCommunicationChannelId: "",
    customerName: "",
    companyName: "",
    contactA: "",
    contactB: "",
    email: "",
    asanaLink: "",
    address: "",
    districtId: "",
    districtName: "",
    shippingMethodId: "",
    deliveryDate: hongKongToday(),
    deliveryTime: "",
    shipOutTime: "",
    customerNote: "",
    packingNote: "",
    salesPartnerId: "",
    internalNote: "",
    tagIds: [],
  };
}

function OrderPaymentStatus({
  total,
  paid,
  formatMoney,
}: {
  total: number;
  paid: number;
  formatMoney: (value: number) => string;
}) {
  const outstanding = Math.max(0, total - paid);
  const status = outstanding <= 0 && (total > 0 || paid > 0)
    ? "paid"
    : paid > 0
      ? "partial"
      : "unpaid";

  return (
    <aside
      className={`order-editor-payment-status is-${status}`}
      role="status"
      aria-label={status === "paid" ? "付款狀態：完成付款" : status === "partial" ? `付款狀態：尚欠 ${formatMoney(outstanding)}` : "付款狀態：尚未付款"}
    >
      <span className="order-editor-payment-status-icon" aria-hidden="true">
        {status === "paid" ? <CircleCheckBig /> : status === "partial" ? <CreditCard /> : <CircleAlert />}
      </span>
      <span className="order-editor-payment-status-copy">
        <small>付款狀態</small>
        {status === "paid" ? (
          <><strong>完成付款</strong><em>款項已收齊</em></>
        ) : status === "partial" ? (
          <><strong>尚欠 {formatMoney(outstanding)}</strong><em>已收 {formatMoney(paid)}</em></>
        ) : (
          <><strong>尚未付款</strong><em>尚未收到任何款項</em></>
        )}
      </span>
    </aside>
  );
}

type Props = {
  combined?: boolean;
  readOnly?: boolean;
  documentType?: QuoteEditorDocumentType;
  canEdit?: boolean;
  loadOptions?: typeof fetchQuoteEditorOptions;
  saveQuote?: typeof createQuote;
  loadSummary?: typeof fetchQuoteEditorSummary;
  loadLines?: typeof fetchQuoteLines;
  searchCatalog?: typeof searchQuoteCatalog;
  saveLine?: typeof addQuoteLine;
  deleteLine?: typeof removeQuoteLine;
  saveDetails?: typeof updateQuote;
  saveExistingLine?: typeof updateQuoteLine;
  saveLineOrder?: typeof updateQuoteLineOrder;
  saveFinancialDetails?: typeof updateQuoteFinancials;
  saveUtensilLine?: typeof addQuoteUtensilLine;
  loadShippingFeeOptions?: () => Promise<ShippingFee[]>;
  savePayments?: typeof saveQuotePayments;
  sendConfirmation?: typeof sendQuoteConfirmation;
  convertQuote?: typeof convertQuoteToOrder;
  copyQuote?: typeof duplicateQuote;
  setFactoryStatus?: typeof updateOrderFactoryStatus;
  saveFactorySettings?: typeof saveOrderFactorySettings;
};

export function QuoteEditorPage({
  combined = false,
  readOnly = false,
  documentType = "quote",
  canEdit = false,
  loadOptions = fetchQuoteEditorOptions,
  saveQuote = createQuote,
  loadSummary = fetchQuoteEditorSummary,
  loadLines = fetchQuoteLines,
  searchCatalog = searchQuoteCatalog,
  saveLine = addQuoteLine,
  deleteLine = removeQuoteLine,
  saveDetails = updateQuote,
  saveExistingLine = updateQuoteLine,
  saveLineOrder = updateQuoteLineOrder,
  saveFinancialDetails = updateQuoteFinancials,
  saveUtensilLine = addQuoteUtensilLine,
  loadShippingFeeOptions = loadConfiguredShippingFees,
  savePayments = saveQuotePayments,
  sendConfirmation = sendQuoteConfirmation,
  convertQuote = convertQuoteToOrder,
  copyQuote = duplicateQuote,
  setFactoryStatus = updateOrderFactoryStatus,
  saveFactorySettings = saveOrderFactorySettings,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const copyFrom = id ? "" : searchParams.get("copyFrom") ?? "";
  const sourceId = id || copyFrom;
  const isOrder = documentType === "order";
  const listPath = isOrder ? "/orders" : "/quotes";
  const backTo = useDetailBackTo(listPath);
  const [draft, setDraft] = useState<QuoteDraft>(emptyDraft);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [created, setCreated] = useState<CreatedQuote | null>(null);
  const [channelId, setChannelId] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<QuoteCatalogItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<QuoteCatalogItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lineRemarks, setLineRemarks] = useState("");
  const [deliveryTimeMode, setDeliveryTimeMode] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [financials, setFinancials] = useState({
    shippingFee: "0",
    discount: "0",
    cashdollarRedeemed: "0",
    cashdollarPurchased: "0",
  });
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [financialError, setFinancialError] = useState(false);
  const [addingUtensil, setAddingUtensil] = useState(false);
  const [shippingFees, setShippingFees] = useState<ShippingFee[]>([]);
  const [shippingFeeId, setShippingFeeId] = useState("");
  const [activeTab, setActiveTab] = useState<"details" | "items" | "payments">("details");
  const [payments, setPayments] = useState<QuotePayment[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<"save" | "send" | null>(null);
  const [converting, setConverting] = useState(false);
  const [conversionError, setConversionError] = useState(false);
  const [expandedRemarkIds, setExpandedRemarkIds] = useState<Set<string>>(new Set());
  const [supplements, setSupplements] = useState<QuotePdfSupplementDraft>({
    additionalInfo: [],
    activities: [],
    utensilPackQuantity: "0",
  });
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [additionalSearch, setAdditionalSearch] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [supplementsLoadedFor, setSupplementsLoadedFor] = useState("");
  const [isSentToFactory, setIsSentToFactory] = useState(false);
  const [changingFactoryStatus, setChangingFactoryStatus] = useState(false);
  const [factoryStatusError, setFactoryStatusError] = useState(false);
  const [factorySettings, setFactorySettings] = useState<OrderFactorySettings>({
    doNotSendToFactory: false,
    suppressFactoryReprint: false,
    factoryPrintDate: null,
    originalFactoryReprintRequired: false,
  });
  const [savingFactorySettings, setSavingFactorySettings] = useState(false);
  const [factorySettingsError, setFactorySettingsError] = useState(false);

  const activeQuote = useMemo(
    () => created ?? (id ? { id, orderNumber: "" } : null),
    [created, id],
  );

  useEffect(() => {
    let active = true;
    void loadShippingFeeOptions()
      .then((fees) => {
        if (!active) return;
        setShippingFees(fees);
      })
      .catch(() => { if (active) setShippingFees([]); });
    return () => { active = false; };
  }, [loadShippingFeeOptions]);

  useEffect(() => {
    if (shippingFeeId || !shippingFees.length) return;
    const savedShippingFee = Number(financials.shippingFee) || 0;
    if (savedShippingFee <= 0) return;
    const matched = shippingFees.find((fee) => fee.fee === savedShippingFee);
    if (matched) setShippingFeeId(matched.id);
  }, [financials.shippingFee, shippingFeeId, shippingFees]);

  useEffect(() => {
    if (!activeQuote) return;
    setSupplements(readQuotePdfSupplements(activeQuote.id));
    setSupplementsLoadedFor(activeQuote.id);
  }, [activeQuote?.id]);

  useEffect(() => {
    if (!activeQuote || supplementsLoadedFor !== activeQuote.id) return;
    writeQuotePdfSupplements(activeQuote.id, supplements);
  }, [activeQuote?.id, supplements, supplementsLoadedFor]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      loadOptions(),
      sourceId
        ? (isOrder ? loadSummary(sourceId, "order") : loadSummary(sourceId))
        : Promise.resolve(null),
      sourceId ? loadLines(sourceId) : Promise.resolve([]),
    ])
      .then(([nextOptions, summary, nextLines]) => {
        if (!active) return;
        setOptions(nextOptions);
        if (sourceId && !summary) {
          setError("quote_not_found");
          return;
        }
        if (summary) {
          if (id) setCreated(summary);
          setChannelId(summary.channelId);
          if (summary.draft) {
            const loadedDraft = { ...emptyDraft(), ...summary.draft };
            setDraft(copyFrom
              ? {
                  ...loadedDraft,
                  quoteStatus: "",
                  quoteSalesSourceId: "",
                  quoteCommunicationChannelId: "",
                  deliveryTime: "",
                  shipOutTime: "",
                }
              : loadedDraft);
          }
          setFinancials({
            shippingFee: String(summary.financials?.shippingFee ?? 0),
            discount: String(summary.financials?.discount ?? 0),
            cashdollarRedeemed: String(summary.financials?.cashdollarRedeemed ?? 0),
            cashdollarPurchased: String(summary.financials?.cashdollarPurchased ?? 0),
          });
          setPayments(copyFrom ? [] : summary.payments ?? []);
          const sentToFactory = id ? summary.isSentToFactory === true : false;
          setIsSentToFactory(sentToFactory);
          setFactorySettings({
            doNotSendToFactory: id
              ? normalizeDoNotSendToFactory(summary.doNotSendToFactory)
              : false,
            suppressFactoryReprint: false,
            factoryPrintDate: summary.factoryPrintDate ?? null,
            originalFactoryReprintRequired: Boolean(summary.factoryReprintRequired),
          });
        }
        setLines(id ? nextLines : []);
      })
      .catch(() => {
        if (active) setError("quote_editor_load_failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [copyFrom, id, isOrder, loadLines, loadOptions, loadSummary, sourceId]);

  const saveCurrentDetails = (orderId: string) =>
    isOrder ? saveDetails(orderId, draft, "order") : saveDetails(orderId, draft);

  useEffect(() => {
    if (!activeQuote || selectedItem) return;
    const term = catalogSearch.trim();
    if (!term) {
      setCatalogResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchCatalog(term, channelId)
        .then((items) => {
          if (active) setCatalogResults(items);
        })
        .catch(() => {
          if (active) setCatalogResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeQuote, catalogSearch, channelId, searchCatalog, selectedItem]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const total = lines.reduce((sum, line) => sum + line.totalPrice, 0);
  const hasUtensilPack = lines.some((line) => line.name?.trim() === "餐具包");
  const financialValues: QuoteFinancials = {
    shippingFee: Math.max(0, Number(financials.shippingFee) || 0),
    discount: Math.max(0, Number(financials.discount) || 0),
    cashdollarRedeemed: Math.max(0, Number(financials.cashdollarRedeemed) || 0),
    cashdollarPurchased: Math.max(0, Number(financials.cashdollarPurchased) || 0),
  };
  const grandTotal = Math.max(
    0,
    total + financialValues.shippingFee - financialValues.discount - financialValues.cashdollarRedeemed,
  );
  const paidTotal = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const districts = useMemo(() => dedupeQuoteOptions(options.districts), [options.districts]);
  const selectedShippingMethod = options.shippingMethods.find((item) => item.id === draft.shippingMethodId);
  const automaticDistrictName = automaticDistrictForMethod(selectedShippingMethod?.name ?? "");
  const showDeliveryAddress = DELIVERY_ADDRESS_METHODS.has(selectedShippingMethod?.name ?? "");

  const patchDraft = (partial: Partial<QuoteDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const changeShippingMethod = (shippingMethodId: string) => {
    const method = options.shippingMethods.find((item) => item.id === shippingMethodId);
    const automaticDistrict = automaticDistrictForMethod(method?.name ?? "");
    patchDraft({
      shippingMethodId,
      ...(automaticDistrict
        ? { districtId: "", districtName: automaticDistrict, address: "" }
        : { districtName: "", ...(!DELIVERY_ADDRESS_METHODS.has(method?.name ?? "") ? { address: "" } : {}) }),
    });
  };

  const validateDetails = () => {
    const nextErrors: Record<string, string> = {};
    if (!draft.channelId) nextErrors.channelId = t("quoteEditor.validation.brand");
    if (!draft.customerName.trim()) nextErrors.customerName = t("quoteEditor.validation.customer");
    if (!draft.companyName.trim()) nextErrors.companyName = t("quoteEditor.validation.company");
    if (!draft.contactA.trim()) nextErrors.contactA = t("quoteEditor.validation.contact");
    if (!draft.email.trim()) nextErrors.email = t("quoteEditor.validation.email");
    if (!draft.shippingMethodId) nextErrors.shippingMethodId = t("quoteEditor.validation.shippingMethod");
    if (!draft.districtId && !draft.districtName.trim() && !automaticDistrictName) {
      nextErrors.districtId = t("quoteEditor.validation.district");
    }
    if (!draft.deliveryTime.trim()) nextErrors.deliveryTime = t("quoteEditor.validation.deliveryTime");
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitHeader = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateDetails()) return;

    setSaving(true);
    setError(null);
    try {
      if (activeQuote) {
        await saveCurrentDetails(activeQuote.id);
        setChannelId(draft.channelId);
      } else {
        const quote = copyFrom
          ? await copyQuote(copyFrom, draft)
          : await saveQuote(draft);
        if (copyFrom) {
          writeQuotePdfSupplements(
            quote.id,
            readQuotePdfSupplements(copyFrom),
          );
        }
        setCreated(quote);
        setChannelId(draft.channelId);
        setActiveTab("items");
        navigate(`/quotes/${quote.id}/edit`, { replace: true });
      }
    } catch {
      setError("quote_create_failed");
    } finally {
      setSaving(false);
    }
  };

  const convertCurrentQuote = async () => {
    if (!activeQuote || !validateDetails()) return;
    setConverting(true);
    setConversionError(false);
    try {
      await saveCurrentDetails(activeQuote.id);
      await saveFinancialDetails(activeQuote.id, financialValues);
      const order = await convertQuote(activeQuote.id);
      navigate(`/orders/${order.id}`);
    } catch {
      setConversionError(true);
    } finally {
      setConverting(false);
    }
  };

  const refreshLines = useCallback(async () => {
    if (!activeQuote) return;
    setLines(await loadLines(activeQuote.id));
  }, [activeQuote, loadLines]);

  const selectCatalogItem = (item: QuoteCatalogItem) => {
    setSelectedItem(item);
    setCatalogSearch(`${item.sku ? `${item.sku} · ` : ""}${item.name}`);
    setUnitPrice(item.price === null ? "" : String(item.price));
    setCatalogResults([]);
  };

  const submitLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeQuote || !selectedItem) return;
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("quote_line_invalid");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await saveLine({
        orderId: activeQuote.id,
        item: selectedItem,
        quantity: parsedQuantity,
        unitPrice: parsedPrice,
        remarks: lineRemarks,
      });
      await refreshLines();
      setCatalogSearch("");
      setSelectedItem(null);
      setQuantity("1");
      setUnitPrice("");
      setLineRemarks("");
    } catch {
      setError("quote_line_save_failed");
    } finally {
      setAdding(false);
    }
  };

  const removeLine = async (lineId: string) => {
    setRemovingId(lineId);
    setError(null);
    try {
      await deleteLine(lineId);
      await refreshLines();
    } catch {
      setError("quote_line_delete_failed");
    } finally {
      setRemovingId(null);
    }
  };

  const patchLine = (lineId: string, partial: Partial<QuoteLine>) => {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const next = { ...line, ...partial };
      return { ...next, totalPrice: next.quantity * next.unitPrice };
    }));
  };

  const saveEditedLine = async (line: QuoteLine) => {
    if (line.quantity <= 0 || line.unitPrice < 0) {
      setError("quote_line_invalid");
      return;
    }
    setSavingLineId(line.id);
    setError(null);
    try {
      if (isOrder) await saveExistingLine(line, "order");
      else await saveExistingLine(line);
    } catch {
      setError("quote_line_save_failed");
    } finally {
      setSavingLineId(null);
    }
  };

  const reorderLines = async (targetLineId: string) => {
    if (!draggedLineId || draggedLineId === targetLineId || reordering) return;
    const previousLines = lines;
    const sourceIndex = previousLines.findIndex((line) => line.id === draggedLineId);
    const targetIndex = previousLines.findIndex((line) => line.id === targetLineId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextLines = [...previousLines];
    const [movedLine] = nextLines.splice(sourceIndex, 1);
    nextLines.splice(targetIndex, 0, movedLine);
    setLines(nextLines);
    setDraggedLineId(null);
    setDragOverLineId(null);
    setReordering(true);
    setError(null);
    try {
      await saveLineOrder(nextLines.map((line) => line.id));
    } catch {
      setLines(previousLines);
      setError("quote_line_save_failed");
    } finally {
      setReordering(false);
    }
  };

  const allowLineDrop = (event: DragEvent<HTMLTableRowElement>, lineId: string) => {
    if (!draggedLineId || reordering) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverLineId(lineId);
  };

  const saveFinancialAdjustments = async (values = financialValues) => {
    if (!activeQuote) return;
    setSavingFinancials(true);
    setFinancialError(false);
    try {
      await saveFinancialDetails(activeQuote.id, values);
    } catch {
      setFinancialError(true);
    } finally {
      setSavingFinancials(false);
    }
  };

  const addUtensilPack = async () => {
    if (!activeQuote || hasUtensilPack) return;
    setAddingUtensil(true);
    setError(null);
    try {
      await saveUtensilLine(activeQuote.id);
      await refreshLines();
    } catch {
      setError("quote_line_save_failed");
    } finally {
      setAddingUtensil(false);
    }
  };

  const addAdditionalInfo = (value: string) => {
    const text = value.trim();
    if (!text) return;
    setSupplements((current) => ({
      ...current,
      additionalInfo: [...current.additionalInfo, text],
    }));
    setAdditionalSearch("");
  };

  const addActivity = (description: string, amount = "0") => {
    const text = description.trim();
    if (!text) return;
    setSupplements((current) => ({
      ...current,
      activities: [
        ...current.activities,
        { id: crypto.randomUUID(), description: text, amount },
      ],
    }));
    setActivitySearch("");
  };

  const addPayment = () => {
    const paid = paidTotal;
    setPayments((current) => [...current, {
      id: crypto.randomUUID(),
      paymentAt: hongKongToday(),
      paymentMethodId: "",
      amount: Math.max(0, grandTotal - paid),
      reference: "",
    }]);
  };

  const toggleFactoryStatus = async () => {
    if (!isOrder || !activeQuote || changingFactoryStatus) return;
    const next = !isSentToFactory;
    setChangingFactoryStatus(true);
    setFactoryStatusError(false);
    try {
      await setFactoryStatus(activeQuote.id, next);
      setIsSentToFactory(next);
    } catch {
      setFactoryStatusError(true);
    } finally {
      setChangingFactoryStatus(false);
    }
  };

  const saveCurrentFactorySettings = async () => {
    if (!isOrder || !activeQuote || savingFactorySettings) return;
    setSavingFactorySettings(true);
    setFactorySettingsError(false);
    try {
      await saveFactorySettings(activeQuote.id, factorySettings);
    } catch {
      setFactorySettingsError(true);
    } finally {
      setSavingFactorySettings(false);
    }
  };

  const factorySettingsPanel =
    isOrder && activeQuote && !readOnly ? (
      <OrderFactorySettingsControls
        className="quote-order-factory-settings"
        doNotSendToFactory={factorySettings.doNotSendToFactory}
        suppressFactoryReprint={factorySettings.suppressFactoryReprint}
        onDoNotSendChange={(checked) =>
          setFactorySettings((current) => ({
            ...current,
            doNotSendToFactory: checked,
          }))
        }
        onSuppressFactoryReprintChange={(checked) =>
          setFactorySettings((current) => ({
            ...current,
            suppressFactoryReprint: checked,
          }))
        }
        actions={
          <>
            {factorySettingsError ? (
              <span role="alert">{t("orderEditor.factorySettings.saveError")}</span>
            ) : null}
            {readOnly && !factorySettings.doNotSendToFactory ? (
              <Button
                type="button"
                variant={isSentToFactory ? "outline" : "default"}
                disabled={changingFactoryStatus}
                onClick={() => void toggleFactoryStatus()}
              >
                {isSentToFactory ? <Undo2 /> : <Factory />}
                {changingFactoryStatus
                  ? t("quoteEditor.factoryStatus.saving")
                  : isSentToFactory
                    ? t("quoteEditor.factoryStatus.cancel")
                    : t("quoteEditor.factoryStatus.send")}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void saveCurrentFactorySettings()}
              disabled={savingFactorySettings}
            >
              {savingFactorySettings ? <LoaderCircle className="spin" /> : <Factory />}
              {savingFactorySettings
                ? t("orderEditor.factorySettings.saving")
                : t("orderEditor.factorySettings.save")}
            </Button>
          </>
        }
      />
    ) : null;

  const patchPayment = (paymentId: string, partial: Partial<QuotePayment>) => {
    setPayments((current) => current.map((payment) => payment.id === paymentId ? { ...payment, ...partial } : payment));
  };

  const completeQuote = async (notify: boolean) => {
    if (!activeQuote) return;
    if (payments.some((payment) => !payment.paymentAt || !payment.paymentMethodId || payment.amount <= 0)) {
      setCompletionError("save");
      return;
    }
    setCompleting(true);
    setCompletionError(null);
    try {
      await saveCurrentDetails(activeQuote.id);
      await saveFinancialDetails(activeQuote.id, financialValues);
      if (isOrder) await savePayments(activeQuote.id, activeQuote.orderNumber, draft.channelId, payments, "order");
      else await savePayments(activeQuote.id, activeQuote.orderNumber, draft.channelId, payments);
      if (notify) {
        try {
          await sendConfirmation(activeQuote.id);
        } catch {
          setCompletionError("send");
          return;
        }
      }
      navigate(listPath, { replace: true });
    } catch {
      setCompletionError("save");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <PageSkeleton cards={2} label={t("quoteEditor.loading")} variant="detail" />;

  if (readOnly && activeQuote) {
    const displayValue = (value?: string | number | null) =>
      value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
    const displayDate = (value: string) => {
      const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      return matched ? `${matched[3]}/${matched[2]}/${matched[1]}` : displayValue(value);
    };
    const optionName = (items: Array<{ id: string; name: string }>, value: string) =>
      items.find((item) => item.id === value)?.name || value || "-";
    const districtName = automaticDistrictName || draft.districtName || optionName(districts, draft.districtId);
    const selectedTags = options.orderTags.filter((item) => draft.tagIds.includes(item.id));
    const paid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    const ReadonlyField = ({ label, value, hint }: { label: string; value?: string | number | null; hint?: string }) => (
      <div className="quote-readonly-field">
        <span>{label}{hint ? <small>{hint}</small> : null}</span>
        <strong>{displayValue(value)}</strong>
      </div>
    );

    return (
      <section className="quote-editor-page quote-detail-readonly">
        <header className="page-heading quote-editor-heading">
          <div>
            <Link className="detail-back" to={backTo}><ChevronLeft />{isOrder ? t("details.back") : t("quoteEditor.back")}</Link>
            <span className="eyebrow">{isOrder ? t("details.orderTitle") : t("quoteEditor.eyebrow")}</span>
            <h1>{activeQuote.orderNumber || (isOrder ? t("details.orderTitle") : t("quoteEditor.title"))}</h1>
            <p>{t(isOrder ? "quoteEditor.orderItemsReady" : "quoteEditor.itemsReady")}</p>
          </div>
          {isOrder && canEdit ? <Button asChild variant="outline"><Link to={`/orders/${activeQuote.id}/edit`}><Pencil />編輯</Link></Button> : null}
          {isOrder ? <OrderPaymentStatus total={grandTotal} paid={paidTotal} formatMoney={money.format} /> : null}
        </header>

        <section className="panel quote-editor-form quote-editor-readonly-form">
          <div className="quote-editor-form-column">
            <h2><FileText />{t("quoteEditor.customerSection")}</h2>
            <ReadonlyField label={t("quoteEditor.fields.number")} value={activeQuote.orderNumber} />
            <ReadonlyField label={t("quoteEditor.fields.brand")} value={optionName(options.channels, draft.channelId)} />
            <ReadonlyField label={t("quoteEditor.fields.customerName")} value={draft.customerName} />
            <ReadonlyField label={t("quoteEditor.fields.companyName")} value={draft.companyName} />
            <ReadonlyField label={t("quoteEditor.fields.contactA")} value={draft.contactA} />
            <ReadonlyField label={t("quoteEditor.fields.contactB")} value={draft.contactB} />
            <ReadonlyField label={t("quoteEditor.fields.email")} value={draft.email} />
            <ReadonlyField label={t("quoteEditor.fields.asanaLink")} value={draft.asanaLink} />
            {isOrder ? <ReadonlyField label={t("quoteEditor.fields.customerMatters")} value={draft.customerNote} /> : null}
            {showDeliveryAddress ? <ReadonlyField label={t("quoteEditor.fields.address")} value={draft.address} /> : null}
            <div className="quote-readonly-field">
              <span>{t("quoteEditor.fields.tags")}</span>
              <div className="quote-readonly-tags">
                {selectedTags.length
                  ? selectedTags.map((tag) => <span key={tag.id}>{tag.name}</span>)
                  : <strong>-</strong>}
              </div>
            </div>
          </div>

          <div className="quote-editor-form-column">
            <h2><PackagePlus />{t("quoteEditor.deliverySection")}</h2>
            <ReadonlyField label={t("quoteEditor.fields.district")} value={districtName} />
            <ReadonlyField label={t("quoteEditor.fields.shippingMethod")} value={optionName(options.shippingMethods, draft.shippingMethodId)} />
            <ReadonlyField label={t("quoteEditor.fields.deliveryDate")} value={displayDate(draft.deliveryDate)} />
            <ReadonlyField label={t("quoteEditor.fields.deliveryTime")} value={draft.deliveryTime} />
            <ReadonlyField label={t("quoteEditor.fields.shipOutTime")} value={draft.shipOutTime} />
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.customerNote")} hint={t("quoteEditor.fields.customerNoteHint")} value={draft.customerNote} /> : null}
            <ReadonlyField label={t("quoteEditor.fields.packingNote")} hint={t("quoteEditor.fields.packingNoteHint")} value={draft.packingNote} />
            <ReadonlyField label={t("quoteEditor.fields.salesPartner")} value={optionName(options.salesPartners, draft.salesPartnerId)} />
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.quoteStatus")} value={draft.quoteStatus} /> : null}
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.quoteSalesSource")} value={optionName(options.quoteSalesSources, draft.quoteSalesSourceId)} /> : null}
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.quoteCommunicationChannel")} value={optionName(options.quoteCommunicationChannels, draft.quoteCommunicationChannelId)} /> : null}
            <ReadonlyField label={t("quoteEditor.fields.internalNote")} hint={t("quoteEditor.fields.internalNoteHint")} value={draft.internalNote} />
          </div>
        </section>

        <article className="panel quote-lines-panel quote-lines-readonly-panel">
          <header><div><span className="eyebrow">{t(isOrder ? "quoteEditor.orderSummaryEyebrow" : "quoteEditor.items.summaryEyebrow")}</span><h2>{t("quoteEditor.items.summaryTitle")}</h2></div><strong>{money.format(total)}</strong></header>
          <div className="table-wrap"><table><thead><tr><th>{t("quoteEditor.items.sequence")}</th><th>{t("quoteEditor.items.sku")}</th><th>{t("quoteEditor.items.product")}</th><th>{t("quoteEditor.items.quantity")}</th><th>{t("quoteEditor.items.unitPrice")}</th><th>{t("quoteEditor.items.subtotal")}</th></tr></thead><tbody>
            {lines.map((line, index) => <tr key={line.id}>
              <td className="quote-line-sequence">{index + 1}</td>
              <td className="quote-line-sku">{displayValue(line.sku)}</td>
              <td className="quote-line-product"><strong>{displayValue(line.name)}</strong>{line.remarks ? <small>{line.remarks}</small> : null}</td>
              <td>{line.quantity}</td>
              <td>{money.format(line.unitPrice)}</td>
              <td>{money.format(line.totalPrice)}</td>
            </tr>)}
            {!lines.length ? <tr><td colSpan={6} className="quote-lines-empty"><PackagePlus /><strong>{t("quoteEditor.items.empty")}</strong></td></tr> : null}
          </tbody></table></div>
          <div className="quote-editor-totals-row">
            <div className="quote-editor-item-count">
              <span>{t("quoteEditor.items.totalQuantity")}</span><strong>{lines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
              <span>{t("quoteEditor.items.subtotal")}</span><strong>{money.format(total)}</strong>
            </div>
            <section className="quote-financial-card quote-financial-readonly" aria-label={t("quoteEditor.financials.title")}>
              <header><div><span className="eyebrow">{t("quoteEditor.financials.eyebrow")}</span><h3>{t("quoteEditor.financials.title")}</h3></div></header>
              <ReadonlyField label={t("quoteEditor.financials.shippingFee")} value={money.format(financialValues.shippingFee)} />
              <ReadonlyField label={t("quoteEditor.financials.discount")} value={money.format(financialValues.discount)} />
              <ReadonlyField label={t("quoteEditor.financials.cashdollarRedeemed")} value={money.format(financialValues.cashdollarRedeemed)} />
              <ReadonlyField label={t("quoteEditor.financials.cashdollarPurchased")} value={money.format(financialValues.cashdollarPurchased)} />
              <footer><span>{t("quoteEditor.financials.grandTotal")}</span><strong>{money.format(grandTotal)}</strong></footer>
            </section>
          </div>
        </article>

        {factorySettingsPanel}

        {supplements.additionalInfo.length || supplements.activities.length ? (
          <section className="panel quote-editor-supplements quote-editor-supplements-readonly">
            <div className={cn("quote-editor-supplement-grid", (!supplements.additionalInfo.length || !supplements.activities.length) && "is-single")}>
              {supplements.additionalInfo.length ? <article><h3>額外資訊</h3>{supplements.additionalInfo.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</article> : null}
              {supplements.activities.length ? <article><h3>活動項目</h3>{supplements.activities.map((activity) => <p key={activity.id}><span>{activity.description}</span><strong>{money.format(Number(activity.amount) || 0)}</strong></p>)}</article> : null}
            </div>
          </section>
        ) : null}

        <section className="panel quote-payment-step quote-payment-readonly">
          <header><div><h2><CreditCard />{t("quoteEditor.payments.title")}</h2></div></header>
          <div className="quote-payment-list">
            {payments.map((payment) => <div className="quote-payment-row" key={payment.id}>
              <ReadonlyField label={t("quoteEditor.payments.date")} value={displayDate(payment.paymentAt)} />
              <ReadonlyField label={t("quoteEditor.payments.method")} value={optionName(options.paymentMethods, payment.paymentMethodId)} />
              <ReadonlyField label={t("quoteEditor.payments.amount")} value={money.format(payment.amount)} />
              <ReadonlyField label={t("quoteEditor.payments.reference")} value={payment.reference} />
            </div>)}
            {!payments.length ? <div className="quote-payment-empty"><CreditCard /><strong>{t("quoteEditor.payments.empty")}</strong></div> : null}
          </div>
          <div className="quote-payment-summary">
            <div><span>{t("quoteEditor.payments.receivable")}</span><strong>{money.format(grandTotal)}</strong></div>
            <div><span>{t("quoteEditor.payments.paid")}</span><strong>{money.format(paid)}</strong></div>
            <div><span>{t("quoteEditor.payments.outstanding")}</span><strong>{money.format(Math.max(0, grandTotal - paid))}</strong></div>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="quote-editor-page">
      <header className="page-heading quote-editor-heading">
        <div>
          <Link className="detail-back" to={backTo}>
            <ChevronLeft />
            {isOrder ? t("details.back") : t("quoteEditor.back")}
          </Link>
          <span className="eyebrow">{isOrder ? t("details.orderTitle") : t("quoteEditor.eyebrow")}</span>
          <h1>{activeQuote?.orderNumber || (isOrder ? t("details.orderTitle") : t("quoteEditor.title"))}</h1>
          <p>{activeQuote ? t(isOrder ? "quoteEditor.orderItemsReady" : "quoteEditor.itemsReady") : t("quoteEditor.description")}</p>
        </div>
        {activeQuote && (
          <span className="quote-editor-saved-badge"><Check />{t("quoteEditor.saved")}</span>
        )}
        {isOrder && activeQuote ? <OrderPaymentStatus total={grandTotal} paid={paidTotal} formatMoney={money.format} /> : null}
      </header>

      {!combined ? <nav className="quote-editor-tabs" aria-label={t(isOrder ? "quoteEditor.orderStepLabel" : "quoteEditor.steps.label")} role="tablist">
        <button
          type="button"
          role="tab"
          aria-label={t(isOrder ? "quoteEditor.orderDetailsStep" : "quoteEditor.steps.details")}
          aria-selected={activeTab === "details"}
          className={cn(activeTab === "details" && "is-active")}
          onClick={() => setActiveTab("details")}
        >
          <span><FileText /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 1 })}</small>
            <strong>{t(isOrder ? "quoteEditor.orderDetailsStep" : "quoteEditor.steps.details")}</strong>
          </div>
        </button>
        <button
          type="button"
          role="tab"
          aria-label={t("quoteEditor.steps.items")}
          aria-selected={activeTab === "items"}
          disabled={!activeQuote}
          className={cn(activeTab === "items" && "is-active")}
          onClick={() => setActiveTab("items")}
        >
          <span><PackagePlus /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 2 })}</small>
            <strong>{t("quoteEditor.steps.items")}</strong>
          </div>
        </button>
        <button
          type="button"
          role="tab"
          aria-label={t("quoteEditor.steps.payments")}
          aria-selected={activeTab === "payments"}
          disabled={!activeQuote}
          className={cn(activeTab === "payments" && "is-active")}
          onClick={() => setActiveTab("payments")}
        >
          <span><CreditCard /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 3 })}</small>
            <strong>{t("quoteEditor.steps.payments")}</strong>
          </div>
        </button>
      </nav> : null}

      {combined || activeTab === "details" ? (
        <form className="panel quote-editor-form" onSubmit={submitHeader}>
          <div className="quote-editor-form-column">
            <h2><FileText />{t("quoteEditor.customerSection")}</h2>
            <label><span>{t("quoteEditor.fields.number")}</span><input value={activeQuote?.orderNumber || t("quoteEditor.autoNumber")} disabled /></label>
            <label><span>{t("quoteEditor.fields.brand")} *</span>
              <select value={draft.channelId} onChange={(event) => patchDraft({ channelId: event.target.value })} aria-invalid={Boolean(fieldErrors.channelId)}>
                <option value="">{t("quoteEditor.placeholders.brand")}</option>
                {options.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {fieldErrors.channelId && <em>{fieldErrors.channelId}</em>}
            </label>
            <label><span>{t("quoteEditor.fields.customerName")} *</span><input required aria-label={t("quoteEditor.fields.customerName")} value={draft.customerName} onChange={(event) => patchDraft({ customerName: event.target.value })} aria-invalid={Boolean(fieldErrors.customerName)} />{fieldErrors.customerName && <em>{fieldErrors.customerName}</em>}</label>
            <label><span>{t("quoteEditor.fields.companyName")} *</span><input required aria-label={t("quoteEditor.fields.companyName")} value={draft.companyName} onChange={(event) => patchDraft({ companyName: event.target.value })} aria-invalid={Boolean(fieldErrors.companyName)} />{fieldErrors.companyName && <em>{fieldErrors.companyName}</em>}</label>
            <label><span>{t("quoteEditor.fields.contactA")} *</span><input required aria-label={t("quoteEditor.fields.contactA")} type="tel" value={draft.contactA} onChange={(event) => patchDraft({ contactA: event.target.value })} aria-invalid={Boolean(fieldErrors.contactA)} />{fieldErrors.contactA && <em>{fieldErrors.contactA}</em>}</label>
            <label><span>{t("quoteEditor.fields.contactB")}</span><input type="tel" value={draft.contactB} onChange={(event) => patchDraft({ contactB: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.email")} *</span><input required aria-label={t("quoteEditor.fields.email")} type="email" value={draft.email} onChange={(event) => patchDraft({ email: event.target.value })} aria-invalid={Boolean(fieldErrors.email)} />{fieldErrors.email && <em>{fieldErrors.email}</em>}</label>
            <label><span>{t("quoteEditor.fields.asanaLink")}</span><input type="url" value={draft.asanaLink} onChange={(event) => patchDraft({ asanaLink: event.target.value })} placeholder={t("quoteEditor.placeholders.asanaLinkPlaceholder")} /></label>
            {isOrder ? <label><span>{t("quoteEditor.fields.customerMatters")}</span><textarea rows={2} value={draft.customerNote} onChange={(event) => patchDraft({ customerNote: event.target.value })} /></label> : null}
            {showDeliveryAddress && <label><span>{t("quoteEditor.fields.address")}</span><textarea rows={2} value={draft.address} onChange={(event) => patchDraft({ address: event.target.value })} /></label>}
            <div className="quote-editor-tags">
              <span id="quote-order-tags-label">{t("quoteEditor.fields.tags")}</span>
              <MultiSelect
                id="quote-order-tags"
                labelledBy="quote-order-tags-label"
                options={options.orderTags}
                value={draft.tagIds}
                onChange={(tagIds) => patchDraft({ tagIds })}
                placeholder={t("quoteEditor.placeholders.tagsPlaceholder")}
                searchPlaceholder={t("quoteEditor.placeholders.tagsSearchPlaceholder")}
                emptyLabel={t("quoteEditor.noTagResults")}
              />
            </div>
          </div>

          <div className="quote-editor-form-column">
            <h2><PackagePlus />{t("quoteEditor.deliverySection")}</h2>
            {!isOrder ? <label><span>{t("quoteEditor.fields.quoteStatus")}</span><select aria-label={t("quoteEditor.fields.quoteStatus")} value={draft.quoteStatus} onChange={(event) => patchDraft({ quoteStatus: event.target.value })}><option value="">{t("common.notSet")}</option>{QUOTE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label> : null}
            {!isOrder ? <label><span>{t("quoteEditor.fields.quoteSalesSource")}</span><select aria-label={t("quoteEditor.fields.quoteSalesSource")} value={draft.quoteSalesSourceId} onChange={(event) => patchDraft({ quoteSalesSourceId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.quoteSalesSources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
            {!isOrder ? <label><span>{t("quoteEditor.fields.quoteCommunicationChannel")}</span><select aria-label={t("quoteEditor.fields.quoteCommunicationChannel")} value={draft.quoteCommunicationChannelId} onChange={(event) => patchDraft({ quoteCommunicationChannelId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.quoteCommunicationChannels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
            <label><span>{t("quoteEditor.fields.district")} *</span><select aria-label={t("quoteEditor.fields.district")} value={automaticDistrictName ? `auto:${automaticDistrictName}` : draft.districtId} disabled={Boolean(automaticDistrictName)} onChange={(event) => patchDraft({ districtId: event.target.value, districtName: "" })} aria-invalid={Boolean(fieldErrors.districtId)}>{automaticDistrictName && <option value={`auto:${automaticDistrictName}`}>{automaticDistrictName}</option>}<option value="">{t("common.notSet")}</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{fieldErrors.districtId && <em>{fieldErrors.districtId}</em>}</label>
            <label><span>{t("quoteEditor.fields.shippingMethod")} *</span><select required aria-label={t("quoteEditor.fields.shippingMethod")} value={draft.shippingMethodId} onChange={(event) => changeShippingMethod(event.target.value)} aria-invalid={Boolean(fieldErrors.shippingMethodId)}><option value="">{t("common.notSet")}</option>{options.shippingMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{fieldErrors.shippingMethodId && <em>{fieldErrors.shippingMethodId}</em>}</label>
            <label><span>{t("quoteEditor.fields.deliveryDate")}</span><input type="date" value={draft.deliveryDate} onChange={(event) => patchDraft({ deliveryDate: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.deliveryTime")} *</span><div className="quote-time-control"><select required aria-label={t("quoteEditor.fields.deliveryTime")} value={deliveryTimeMode === "custom" ? "custom" : draft.deliveryTime} onChange={(event) => { const value = event.target.value; setDeliveryTimeMode(value === "custom" ? "custom" : ""); patchDraft({ deliveryTime: value === "custom" ? "" : value }); }} aria-invalid={Boolean(fieldErrors.deliveryTime)}><option value="">{t("quoteEditor.placeholders.deliveryTimeSelectPlaceholder")}</option><option value="custom">{t("quoteEditor.custom")}</option>{DELIVERY_TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}</select>{deliveryTimeMode === "custom" && <input required value={draft.deliveryTime} onChange={(event) => patchDraft({ deliveryTime: event.target.value })} placeholder={t("quoteEditor.placeholders.customDeliveryTimePlaceholder")} />}</div>{fieldErrors.deliveryTime && <em>{fieldErrors.deliveryTime}</em>}</label>
            <label><span>{t("quoteEditor.fields.shipOutTime")}</span><select value={draft.shipOutTime} onChange={(event) => patchDraft({ shipOutTime: event.target.value })}><option value="">{t("quoteEditor.placeholders.shipOutTimeSelectPlaceholder")}</option>{SHIP_OUT_TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
            {!isOrder ? <label><span>{t("quoteEditor.fields.customerNote")}<small>{t("quoteEditor.fields.customerNoteHint")}</small></span><textarea rows={2} value={draft.customerNote} onChange={(event) => patchDraft({ customerNote: event.target.value })} /></label> : null}
            <label><span>{t("quoteEditor.fields.packingNote")}<small>{t("quoteEditor.fields.packingNoteHint")}</small></span><textarea rows={2} value={draft.packingNote} onChange={(event) => patchDraft({ packingNote: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.salesPartner")}</span><select value={draft.salesPartnerId} onChange={(event) => patchDraft({ salesPartnerId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.salesPartners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>{t("quoteEditor.fields.internalNote")}<small>{t("quoteEditor.fields.internalNoteHint")}</small></span><textarea rows={2} value={draft.internalNote} onChange={(event) => patchDraft({ internalNote: event.target.value })} /></label>
          </div>

          {error && <p className="quote-editor-error" role="alert">{t("quoteEditor.errors.create")}</p>}
          {conversionError && <p className="quote-editor-error" role="alert">{t("quoteEditor.errors.convert")}</p>}
          <footer>
            {activeQuote && !isOrder ? <Button type="button" variant="outline" disabled={converting || saving} onClick={() => void convertCurrentQuote()}><ShoppingCart />{converting ? t("quotes.actions.converting") : t("quotes.actions.convert")}</Button> : <span />}
            <Button type="submit" disabled={saving || converting}>{saving ? t("quoteEditor.saving") : activeQuote ? t("quoteEditor.saveChanges") : t("quoteEditor.saveAndContinue")}</Button>
          </footer>
        </form>
      ) : null}

      {(combined || activeTab === "items") && activeQuote ? (
        <>
        <div className="quote-items-layout">
          <form className="panel quote-item-form" onSubmit={submitLine}>
            <header><div><span className="eyebrow">{t("quoteEditor.items.addEyebrow")}</span><h2>{t("quoteEditor.items.addTitle")}</h2></div></header>
            <label><span>{t("quoteEditor.fields.brand")}</span><select value={channelId} onChange={(event) => { setChannelId(event.target.value); setCatalogSearch(""); setSelectedItem(null); }}><option value="">{t("quoteEditor.placeholders.brand")}</option>{options.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="quote-catalog-control">
              <label className="quote-catalog-search"><span>{t("quoteEditor.items.product")}</span><div><Search /><input value={catalogSearch} onChange={(event) => { setCatalogSearch(event.target.value); setSelectedItem(null); }} placeholder={t("quoteEditor.items.searchPlaceholder")} /></div></label>
              {catalogSearch && !selectedItem && (
                <div className="quote-catalog-results" role="listbox" aria-label={t("quoteEditor.items.results")}>
                  {searching ? <p>{t("quoteEditor.items.searching")}</p> : catalogResults.length ? catalogResults.map((item) => <button type="button" role="option" aria-selected="false" key={`${item.kind}-${item.id}`} onClick={() => selectCatalogItem(item)}><strong>{item.name}</strong><span>{item.sku || "—"} · {item.kind === "package" ? t("quoteEditor.items.package") : t("quoteEditor.items.singleProduct")}</span><b>{item.price === null ? "—" : money.format(item.price)}</b></button>) : <p>{t("quoteEditor.items.noResults")}</p>}
                </div>
              )}
            </div>
            <div className="quote-item-numbers">
              <label><span>{t("quoteEditor.items.quantity")}</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
              <label><span>{t("quoteEditor.items.unitPrice")}</span><input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></label>
            </div>
            <label><span>{t("quoteEditor.items.remarks")}</span><textarea rows={1} maxLength={16} value={lineRemarks} onChange={(event) => setLineRemarks(event.target.value)} /></label>
            {error && <p className="quote-editor-error" role="alert">{t(`quoteEditor.errors.${error === "quote_line_invalid" ? "invalidLine" : "line"}`)}</p>}
            <Button type="submit" disabled={!selectedItem || adding}><PackagePlus />{adding ? t("quoteEditor.items.adding") : t(isOrder ? "quoteEditor.orderAdd" : "quoteEditor.items.add")}</Button>
          </form>

          <article className="panel quote-lines-panel">
            <header><div><span className="eyebrow">{t(isOrder ? "quoteEditor.orderSummaryEyebrow" : "quoteEditor.items.summaryEyebrow")}</span><h2>{t("quoteEditor.items.summaryTitle")}</h2></div><strong>{money.format(total)}</strong></header>
            <div className="table-wrap"><table><thead><tr><th>{t("quoteEditor.items.sequence")}</th><th>{t("quoteEditor.items.sku")}</th><th>{t("quoteEditor.items.product")}</th><th>{t("quoteEditor.items.quantity")}</th><th>{t("quoteEditor.items.unitPrice")}</th><th>{t("quoteEditor.items.subtotal")}</th><th><span className="sr-only">{t("quoteEditor.items.actions")}</span></th></tr></thead><tbody>
              {lines.map((line, index) => <tr
                key={line.id}
                className={cn(draggedLineId === line.id && "is-dragging", dragOverLineId === line.id && draggedLineId !== line.id && "is-drag-over")}
                onDragOver={(event) => allowLineDrop(event, line.id)}
                onDragLeave={() => setDragOverLineId((current) => current === line.id ? null : current)}
                onDrop={(event) => { event.preventDefault(); void reorderLines(line.id); }}
              >
                <td className="quote-line-sequence">
                  <button
                    type="button"
                    className="quote-line-drag-handle"
                    draggable={!reordering}
                    aria-label={t("quoteEditor.items.reorder", { number: index + 1, name: line.name || "" })}
                    onDragStart={(event) => {
                      setDraggedLineId(line.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", line.id);
                    }}
                    onDragEnd={() => { setDraggedLineId(null); setDragOverLineId(null); }}
                  ><GripVertical /><span>{index + 1}</span></button>
                </td>
                <td className="quote-line-sku">{line.sku || "—"}</td>
                <td className="quote-line-product">
                  <strong>{line.name || "—"}</strong>
                  <button
                    type="button"
                    className="quote-line-remarks-toggle"
                    aria-expanded={expandedRemarkIds.has(line.id)}
                    onClick={() => setExpandedRemarkIds((current) => {
                      const next = new Set(current);
                      if (next.has(line.id)) next.delete(line.id);
                      else next.add(line.id);
                      return next;
                    })}
                  >
                    <span>{line.remarks ? line.remarks.slice(0, 16) : t("quoteEditor.items.remarks")}</span>
                    {expandedRemarkIds.has(line.id) ? <ChevronUp /> : <ChevronDown />}
                  </button>
                  {expandedRemarkIds.has(line.id) ? (
                    <textarea
                      className="quote-line-edit-remarks"
                      rows={2}
                      value={line.remarks || ""}
                      maxLength={16}
                      aria-label={`${t("quoteEditor.items.remarks")} ${line.name || ""}`}
                      onChange={(event) => patchLine(line.id, { remarks: event.target.value })}
                      onBlur={() => void saveEditedLine(line)}
                    />
                  ) : null}
                </td>
                <td><input className="quote-line-edit-number" type="number" min="0.001" step="0.001" value={line.quantity} aria-label={`${t("quoteEditor.items.quantity")} ${line.name || ""}`} disabled={savingLineId === line.id} onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })} onBlur={() => void saveEditedLine(line)} /></td>
                <td><input className="quote-line-edit-number" type="number" min="0" step="0.01" value={line.unitPrice} aria-label={`${t("quoteEditor.items.unitPrice")} ${line.name || ""}`} disabled={savingLineId === line.id} onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })} onBlur={() => void saveEditedLine(line)} /></td>
                <td>{money.format(line.totalPrice)}</td>
                <td><button type="button" className="quote-line-delete" aria-label={t("quoteEditor.items.remove", { name: line.name || "" })} disabled={removingId === line.id || savingLineId === line.id} onClick={() => void removeLine(line.id)}><Trash2 /></button></td>
              </tr>)}
              {!lines.length && <tr><td colSpan={7} className="quote-lines-empty"><PackagePlus /><strong>{t("quoteEditor.items.empty")}</strong><span>{t("quoteEditor.items.emptyHint")}</span></td></tr>}
            </tbody></table></div>
            <div className="quote-editor-totals-row">
              <div className="quote-editor-item-count">
                <span>{t("quoteEditor.items.totalQuantity")}</span>
                <strong>{lines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
                <span>{t("quoteEditor.items.subtotal")}</span>
                <strong>{money.format(total)}</strong>
              </div>
              <section className="quote-financial-card" aria-label={t("quoteEditor.financials.title")}>
                <header>
                  <div><span className="eyebrow">{t("quoteEditor.financials.eyebrow")}</span><h3>{t("quoteEditor.financials.title")}</h3></div>
                  <span>{savingFinancials ? t("quoteEditor.financials.saving") : t("quoteEditor.financials.autoSave")}</span>
                </header>
                <label><span>{t("quoteEditor.financials.shippingFee")}</span><div className="quote-shipping-fee-control"><select aria-label={t("quoteEditor.financials.shippingFeeOption")} value={shippingFeeId} onChange={(event) => {
                  const nextId = event.target.value;
                  const selected = shippingFees.find((fee) => fee.id === nextId);
                  const shippingFee = selected?.fee ?? 0;
                  setShippingFeeId(nextId);
                  setFinancials((current) => ({ ...current, shippingFee: String(shippingFee) }));
                  void saveFinancialAdjustments({ ...financialValues, shippingFee });
                }}><option value="">{t("quoteEditor.financials.chooseShippingFee")}</option>{shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item} · {money.format(fee.fee)}</option>)}</select><span className="quote-money-input">HK$<input type="number" min="0" step="0.01" aria-label={t("quoteEditor.financials.shippingFeeAmount")} value={financials.shippingFee} onChange={(event) => setFinancials((current) => ({ ...current, shippingFee: event.target.value }))} onBlur={() => void saveFinancialAdjustments()} /></span></div></label>
                <label><span>{t("quoteEditor.financials.discount")}</span><span className="quote-money-input">HK$<input type="number" min="0" step="0.01" aria-label={t("quoteEditor.financials.discount")} value={financials.discount} onChange={(event) => setFinancials((current) => ({ ...current, discount: event.target.value }))} onBlur={() => void saveFinancialAdjustments()} /></span></label>
                <label><span>{t("quoteEditor.financials.cashdollarRedeemed")}</span><span className="quote-money-input">HK$<input type="number" min="0" step="0.01" aria-label={t("quoteEditor.financials.cashdollarRedeemed")} value={financials.cashdollarRedeemed} onChange={(event) => setFinancials((current) => ({ ...current, cashdollarRedeemed: event.target.value }))} onBlur={() => void saveFinancialAdjustments()} /></span></label>
                <label><span>{t("quoteEditor.financials.cashdollarPurchased")}</span><span className="quote-money-input">HK$<input type="number" min="0" step="0.01" aria-label={t("quoteEditor.financials.cashdollarPurchased")} value={financials.cashdollarPurchased} onChange={(event) => setFinancials((current) => ({ ...current, cashdollarPurchased: event.target.value }))} onBlur={() => void saveFinancialAdjustments()} /></span></label>
                <footer><span>{t("quoteEditor.financials.grandTotal")}</span><strong>{money.format(grandTotal)}</strong></footer>
                {financialError ? <p role="alert">{t("quoteEditor.financials.saveError")}</p> : null}
              </section>
            </div>
            <footer>
              {isOrder && !factorySettings.doNotSendToFactory ? <div className="quote-factory-status-action"><Button type="button" variant={isSentToFactory ? "outline" : "default"} disabled={changingFactoryStatus} onClick={() => void toggleFactoryStatus()}>{isSentToFactory ? <Undo2 /> : <Factory />}{changingFactoryStatus ? t("quoteEditor.factoryStatus.saving") : isSentToFactory ? t("quoteEditor.factoryStatus.cancel") : t("quoteEditor.factoryStatus.send")}</Button>{factoryStatusError ? <span role="alert">{t("quoteEditor.factoryStatus.error")}</span> : null}</div> : null}
              <Button type="button" className="quote-utensil-button" variant="outline" disabled={addingUtensil || hasUtensilPack} onClick={() => void addUtensilPack()}>{hasUtensilPack ? <Check /> : <Plus />}{hasUtensilPack ? t("quoteEditor.items.utensilAdded") : addingUtensil ? t("quoteEditor.items.addingUtensil") : t("quoteEditor.items.addUtensil")}</Button>
              {!combined ? <Button type="button" onClick={() => setActiveTab("payments")}>{t("quoteEditor.items.next")}</Button> : null}
            </footer>
          </article>
        </div>
        {factorySettingsPanel}
        <section className="panel quote-editor-supplements">
          <header className="quote-editor-supplement-actions">
            <div>
              <Button type="button" variant="outline" onClick={() => setAdditionalOpen(true)}><Plus />新增額外資訊</Button>
              <Button type="button" variant="outline" onClick={() => setActivityOpen(true)}><Plus />新增活動項目</Button>
            </div>
          </header>
          <div className="quote-editor-supplement-grid">
            <article>
              <h3>額外資訊</h3>
              {supplements.additionalInfo.length ? supplements.additionalInfo.map((item, index) => (
                <div key={`${item}-${index}`}>
                  <input value={item} aria-label={`額外資訊 ${index + 1}`} onChange={(event) => setSupplements((current) => ({ ...current, additionalInfo: current.additionalInfo.map((value, itemIndex) => itemIndex === index ? event.target.value : value) }))} />
                  <button type="button" aria-label={`刪除額外資訊 ${index + 1}`} onClick={() => setSupplements((current) => ({ ...current, additionalInfo: current.additionalInfo.filter((_, itemIndex) => itemIndex !== index) }))}><Minus /></button>
                </div>
              )) : <p>尚未新增額外資訊</p>}
            </article>
            <article>
              <h3>活動項目</h3>
              {supplements.activities.length ? supplements.activities.map((activity, index) => (
                <div key={activity.id}>
                  <input value={activity.description} aria-label={`活動項目 ${index + 1}`} onChange={(event) => setSupplements((current) => ({ ...current, activities: current.activities.map((value) => value.id === activity.id ? { ...value, description: event.target.value } : value) }))} />
                  <input className="is-amount" type="number" min="0" step="0.01" value={activity.amount} aria-label={`活動價錢 ${index + 1}`} onChange={(event) => setSupplements((current) => ({ ...current, activities: current.activities.map((value) => value.id === activity.id ? { ...value, amount: event.target.value } : value) }))} />
                  <button type="button" aria-label={`刪除活動項目 ${index + 1}`} onClick={() => setSupplements((current) => ({ ...current, activities: current.activities.filter((value) => value.id !== activity.id) }))}><Minus /></button>
                </div>
              )) : <p>尚未新增活動項目</p>}
            </article>
          </div>
        </section>

        <Modal open={additionalOpen} onClose={() => setAdditionalOpen(false)} title="額外資訊" closeLabel="關閉額外資訊" size="lg" footer={<Button onClick={() => setAdditionalOpen(false)}>確定</Button>}>
          <div className="quote-additional-picker">
            <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋額外資訊" placeholder={t("quoteEditor.placeholders.additionalSearchPlaceholder")} value={additionalSearch} onChange={(event) => setAdditionalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAdditionalInfo(additionalSearch); }} /><Button variant="outline" onClick={() => addAdditionalInfo(additionalSearch)}>Add</Button></div>
            <ul>{QUOTE_ADDITIONAL_INFO_OPTIONS.filter((option) => !additionalSearch.trim() || option.toLocaleLowerCase().includes(additionalSearch.trim().toLocaleLowerCase())).map((option) => <li key={option}><span>{option}</span><Button size="sm" variant="outline" onClick={() => addAdditionalInfo(option)}><Plus />加入</Button></li>)}</ul>
          </div>
        </Modal>

        <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="活動項目" closeLabel="關閉活動項目" size="lg" footer={<Button onClick={() => setActivityOpen(false)}>確定</Button>}>
          <div className="quote-additional-picker quote-activity-picker">
            <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋活動項目" placeholder={t("quoteEditor.placeholders.activitySearchPlaceholder")} value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addActivity(activitySearch); }} /><Button variant="outline" onClick={() => addActivity(activitySearch)}>Add</Button></div>
            <ul>{QUOTE_ACTIVITY_OPTIONS.filter((option) => !activitySearch.trim() || option.description.toLocaleLowerCase().includes(activitySearch.trim().toLocaleLowerCase())).map((option) => <li key={option.description}><span>{option.description}</span><span>${Number(option.amount).toLocaleString("zh-HK")}</span><Button size="sm" variant="outline" onClick={() => addActivity(option.description, option.amount)}><Plus />加入</Button></li>)}</ul>
          </div>
        </Modal>
        </>
      ) : null}

      {(combined || activeTab === "payments") && activeQuote ? (
        <section className="panel quote-payment-step">
          <header>
            <div>
              <h2><CreditCard />{t("quoteEditor.payments.title")}</h2>
            </div>
            <Button type="button" variant="outline" onClick={addPayment}><Plus />{t("quoteEditor.payments.add")}</Button>
          </header>
          <div className="quote-payment-list">
            {payments.map((payment, index) => (
              <div className="quote-payment-row" key={payment.id}>
                <label><span>{t("quoteEditor.payments.date")}</span><input type="date" value={payment.paymentAt} onChange={(event) => patchPayment(payment.id, { paymentAt: event.target.value })} /></label>
                <label><span>{t("quoteEditor.payments.method")}</span><select aria-label={`${t("quoteEditor.payments.method")} ${index + 1}`} value={payment.paymentMethodId} onChange={(event) => patchPayment(payment.id, { paymentMethodId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
                <label><span>{t("quoteEditor.payments.amount")}</span><span className="quote-money-input">HK$<input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => patchPayment(payment.id, { amount: Number(event.target.value) })} /></span></label>
                <label><span>{t("quoteEditor.payments.reference")}</span><input value={payment.reference} onChange={(event) => patchPayment(payment.id, { reference: event.target.value })} /></label>
                <button type="button" className="quote-line-delete" aria-label={`${t("quoteEditor.payments.remove")} ${index + 1}`} onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))}><Trash2 /></button>
              </div>
            ))}
            {!payments.length ? <div className="quote-payment-empty"><CreditCard /><strong>{t("quoteEditor.payments.empty")}</strong></div> : null}
          </div>
          <div className="quote-payment-summary">
            <div><span>{t("quoteEditor.payments.receivable")}</span><strong>{money.format(grandTotal)}</strong></div>
            <div><span>{t("quoteEditor.payments.paid")}</span><strong>{money.format(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))}</strong></div>
            <div><span>{t("quoteEditor.payments.outstanding")}</span><strong>{money.format(Math.max(0, grandTotal - payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)))}</strong></div>
          </div>
          {completionError ? <p className="quote-editor-error" role="alert">{t(`quoteEditor.payments.${completionError === "send" ? "sendError" : "saveError"}`)}</p> : null}
          <footer>
            {!combined ? <Button type="button" variant="outline" onClick={() => setActiveTab("items")}>{t("quoteEditor.payments.previous")}</Button> : <span />}
            <div>
              {!isOrder ? <Button type="button" variant="outline" disabled={completing} onClick={() => void completeQuote(true)}><Mail />{t("quoteEditor.payments.sendAndComplete")}</Button> : null}
              <Button type="button" disabled={completing} onClick={() => void completeQuote(false)}>{completing ? <LoaderCircle className="spin" /> : <Check />}{isOrder ? t("quoteEditor.saveChanges") : t("quoteEditor.payments.complete")}</Button>
            </div>
          </footer>
        </section>
      ) : null}
    </section>
  );
}
