import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
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

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderFactorySettingsControls } from "@/components/order-factory-settings-controls";
import { LunchboxProductPicker } from "@/components/LunchboxProductPicker";
import { FactoryDishLabelPreview } from "@/components/FactoryDishLabelPreview";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { SearchSelect } from "@/components/ui/search-select";
import { createDeliveryDistrictOption } from "@/lib/delivery-districts";
import {
  fetchPackageDetail,
  type PackageChoiceSet,
} from "@/lib/packages";
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
  updateQuoteLineLabel,
  updateQuoteLineOrder,
  updateQuoteFinancials,
  updateOrderFactoryStatus,
  saveQuotePayments,
  saveSalesDocumentBatch,
  sendQuoteConfirmation,
  type CreatedQuote,
  type QuoteCatalogItem,
  type QuoteDraft,
  type QuoteEditorOptions,
  type QuoteEditorDocumentType,
  type QuoteFinancials,
  type QuoteLine,
  type QuotePayment,
  type QuotePackageChoiceGroup,
  type QuotePackageChoiceSelection,
} from "@/lib/quote-editor";
import { cn } from "@/lib/utils";
import {
  readQuotePdfSupplements,
  writeQuotePdfSupplements,
  type QuotePdfSupplementDraft,
} from "@/lib/quote-pdf-draft";
import { fetchShippingFees, type ShippingFee } from "@/lib/shipping-fees";
import { convertQuoteToOrder } from "@/lib/quotes";
import { confirmOrderAddonShopifyInput } from "@/lib/order-editor";
import { useDetailBackTo } from "@/lib/detail-navigation";
import {
  normalizeDoNotSendToFactory,
  saveOrderFactorySettings,
  type OrderFactorySettings,
} from "@/lib/order-factory-settings";
import { DICT_TYPE, dictItemLabel, useDictItems } from "@/lib/dictionaries";
import { matchDeliveryTimeOption, normalizeDeliveryTimeRange } from "@/lib/delivery-time";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  fetchLunchboxPickerFilterOptions,
  fetchProducts,
  type ProductListItem,
} from "@/lib/products";

const loadConfiguredShippingFees = async () => (await fetchShippingFees(1, 1000)).rows;

function shopifyOrderUrl(order: CreatedQuote): string | null {
  if (!order.shopifyOrderId || !order.shopifyStoreDomain) return null;
  const shop = order.shopifyStoreDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${shop}/orders/${order.shopifyOrderId}`;
}

function isFreeUtensilPackLine(line: QuoteLine) {
  return !line.productId && !line.packageId && line.name?.trim() === "餐具包";
}

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

const DELIVERY_ADDRESS_METHODS = new Set(["車邊交收", "送貨上門"]);

function automaticDistrictForMethod(name: string) {
  if (name === "門市自取") return "門市自取";
  if (name.startsWith("品酒室")) return "品酒室";
  if (name.startsWith("寫字樓")) return "寫字樓";
  return null;
}

function requiredPackageChoiceCount(choiceSet: PackageChoiceSet) {
  if (!choiceSet.products.length) return 0;
  const configured = Math.floor(choiceSet.maximumChoices ?? 1);
  return Math.min(choiceSet.products.length, Math.max(1, configured));
}

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
    followUpDate: "",
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
  navigationStuck,
}: {
  total: number;
  paid: number;
  formatMoney: (value: number) => string;
  navigationStuck: boolean;
}) {
  const outstanding = Math.max(0, total - paid);
  const status = outstanding <= 0 && (total > 0 || paid > 0)
    ? "paid"
    : paid > 0
      ? "partial"
      : "unpaid";

  return (
    <aside
      className={cn(
        `order-editor-payment-status is-${status}`,
        navigationStuck && "is-navigation-stuck",
      )}
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
  createDistrict?: typeof createDeliveryDistrictOption;
  saveQuote?: typeof createQuote;
  loadSummary?: typeof fetchQuoteEditorSummary;
  loadLines?: typeof fetchQuoteLines;
  searchCatalog?: typeof searchQuoteCatalog;
  saveLine?: typeof addQuoteLine;
  loadPackageDetail?: typeof fetchPackageDetail;
  deleteLine?: typeof removeQuoteLine;
  saveDetails?: typeof updateQuote;
  saveExistingLine?: typeof updateQuoteLine;
  saveLineLabel?: typeof updateQuoteLineLabel;
  saveLineOrder?: typeof updateQuoteLineOrder;
  saveFinancialDetails?: typeof updateQuoteFinancials;
  saveUtensilLine?: typeof addQuoteUtensilLine;
  loadShippingFeeOptions?: () => Promise<ShippingFee[]>;
  savePayments?: typeof saveQuotePayments;
  saveBatch?: typeof saveSalesDocumentBatch;
  sendConfirmation?: typeof sendQuoteConfirmation;
  convertQuote?: typeof convertQuoteToOrder;
  copyQuote?: typeof duplicateQuote;
  setFactoryStatus?: typeof updateOrderFactoryStatus;
  saveFactorySettings?: typeof saveOrderFactorySettings;
  loadLunchboxProducts?: typeof fetchProducts;
  loadLunchboxFilterOptions?: typeof fetchLunchboxPickerFilterOptions;
  confirmAddonShopify?: typeof confirmOrderAddonShopifyInput;
};

export function QuoteEditorPage({
  readOnly = false,
  documentType = "quote",
  canEdit = false,
  loadOptions = fetchQuoteEditorOptions,
  createDistrict = createDeliveryDistrictOption,
  saveQuote = createQuote,
  loadSummary = fetchQuoteEditorSummary,
  loadLines = fetchQuoteLines,
  searchCatalog = searchQuoteCatalog,
  saveLine = addQuoteLine,
  loadPackageDetail = fetchPackageDetail,
  deleteLine = removeQuoteLine,
  saveDetails = updateQuote,
  saveExistingLine = updateQuoteLine,
  saveLineLabel = updateQuoteLineLabel,
  saveLineOrder = updateQuoteLineOrder,
  saveFinancialDetails = updateQuoteFinancials,
  saveUtensilLine = addQuoteUtensilLine,
  loadShippingFeeOptions = loadConfiguredShippingFees,
  savePayments = saveQuotePayments,
  saveBatch,
  sendConfirmation = sendQuoteConfirmation,
  convertQuote = convertQuoteToOrder,
  copyQuote = duplicateQuote,
  setFactoryStatus = updateOrderFactoryStatus,
  saveFactorySettings = saveOrderFactorySettings,
  loadLunchboxProducts = fetchProducts,
  loadLunchboxFilterOptions = fetchLunchboxPickerFilterOptions,
  confirmAddonShopify = confirmOrderAddonShopifyInput,
}: Props) {
  const { t, i18n } = useTranslation();
  const additionalInfoDict = useDictItems(DICT_TYPE.quoteAdditionalInfo);
  const activityDict = useDictItems(DICT_TYPE.quoteActivity);
  const deliveryTimeDict = useDictItems(DICT_TYPE.deliveryTimeSlot);
  const shipOutTimeDict = useDictItems(DICT_TYPE.shipOutTimeSlot);
  const quoteStatusDict = useDictItems(DICT_TYPE.quoteStatus);
  const additionalInfoOptions = additionalInfoDict.items.map((item) => dictItemLabel(item, i18n.language));
  const activityOptions = activityDict.items.map((item) => ({ description: dictItemLabel(item, i18n.language), amount: String(item.metadata.amount ?? "0") }));
  const deliveryTimeOptions = useMemo(
    () => deliveryTimeDict.items.map((item) => item.value),
    [deliveryTimeDict.items],
  );
  const shipOutTimeOptions = shipOutTimeDict.items.map((item) => item.value);
  const quoteStatusOptions = quoteStatusDict.items.map((item) => ({
    value: item.value,
    label: dictItemLabel(item, i18n.language),
  }));
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
  const [confirmingAddonShopify, setConfirmingAddonShopify] = useState(false);
  const [addonShopifyError, setAddonShopifyError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [creatingDistrict, setCreatingDistrict] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<QuoteCatalogItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<QuoteCatalogItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lineRemarks, setLineRemarks] = useState("");
  const [deliveryTimeMode, setDeliveryTimeMode] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [packageChoiceOpen, setPackageChoiceOpen] = useState(false);
  const [packageChoiceSets, setPackageChoiceSets] = useState<PackageChoiceSet[]>([]);
  const [packageSelections, setPackageSelections] = useState<Record<string, string[]>>({});
  const [pendingPackageLine, setPendingPackageLine] = useState<Parameters<typeof addQuoteLine>[0] | null>(null);
  const [packageChoiceError, setPackageChoiceError] = useState(false);
  const [customProductOpen, setCustomProductOpen] = useState(false);
  const [lunchboxPickerOpen, setLunchboxPickerOpen] = useState(false);
  const [customProductName, setCustomProductName] = useState("");
  const [customProductPrice, setCustomProductPrice] = useState("");
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
  const isMobileEditor = useMediaQuery("(max-width: 760px)");
  const [payments, setPayments] = useState<QuotePayment[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<"save" | "send" | null>(null);
  const [sendingConfirmation, setSendingConfirmation] = useState(false);
  const [confirmationSendError, setConfirmationSendError] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionError, setConversionError] = useState(false);
  const [labelModalLineId, setLabelModalLineId] = useState<string | null>(null);
  const [labelModalDraft, setLabelModalDraft] = useState({ displayA: "", displayB: "", remarks: "" });
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
  const [factoryValidationOpen, setFactoryValidationOpen] = useState(false);
  const [factorySettings, setFactorySettings] = useState<OrderFactorySettings>({
    doNotSendToFactory: false,
    suppressFactoryReprint: false,
    factoryPrintDate: null,
    originalFactoryReprintRequired: false,
  });
  const [savingFactorySettings, setSavingFactorySettings] = useState(false);
  const [factorySettingsError, setFactorySettingsError] = useState(false);
  const sectionNavigationRef = useRef<HTMLElement>(null);
  const [sectionNavigationStuck, setSectionNavigationStuck] = useState(false);

  useEffect(() => {
    if (deliveryTimeDict.loading || !draft.deliveryTime.trim()) return;
    const matched = matchDeliveryTimeOption(draft.deliveryTime, deliveryTimeOptions);
    if (matched) {
      if (matched !== draft.deliveryTime) {
        setDraft((current) => ({ ...current, deliveryTime: matched }));
      }
      setDeliveryTimeMode("");
      return;
    }

    setDraft((current) => {
      const normalized = normalizeDeliveryTimeRange(current.deliveryTime);
      return normalized === current.deliveryTime
        ? current
        : { ...current, deliveryTime: normalized };
    });
    setDeliveryTimeMode("custom");
  }, [deliveryTimeDict.loading, deliveryTimeOptions, draft.deliveryTime]);

  const activeQuote = useMemo(
    () => created ?? (id ? { id, orderNumber: "" } : null),
    [created, id],
  );
  const activeShopifyUrl = isOrder && activeQuote ? shopifyOrderUrl(activeQuote) : null;

  useEffect(() => {
    const navigation = sectionNavigationRef.current;
    if (!navigation) {
      setSectionNavigationStuck(false);
      return;
    }

    let animationFrame = 0;
    const update = () => {
      animationFrame = 0;
      const stickyTop = Number.parseFloat(window.getComputedStyle(navigation).top) || 0;
      const stuck = window.scrollY > 0 && navigation.getBoundingClientRect().top <= stickyTop + 1;
      setSectionNavigationStuck((current) => current === stuck ? current : stuck);
    };
    const scheduleUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [activeQuote?.id, loading, readOnly]);

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
                  followUpDate: "",
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
  const districts = useMemo(
    () => dedupeQuoteOptions(options.districts, draft.districtId),
    [draft.districtId, options.districts],
  );
  const selectedShippingMethod = options.shippingMethods.find((item) => item.id === draft.shippingMethodId);
  const automaticDistrictName = automaticDistrictForMethod(selectedShippingMethod?.name ?? "");
  const showDeliveryAddress = Boolean(draft.address.trim()) ||
    DELIVERY_ADDRESS_METHODS.has(selectedShippingMethod?.name ?? "");
  const factoryMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!draft.channelId) missing.push(t("quoteEditor.fields.brand"));
    if (!draft.customerName.trim()) missing.push(t("quoteEditor.fields.customerName"));
    if (!draft.contactA.trim()) missing.push(t("quoteEditor.fields.contactA"));
    if (!draft.email.trim()) missing.push(t("quoteEditor.fields.email"));
    if (!draft.shippingMethodId) missing.push(t("quoteEditor.fields.shippingMethod"));
    if (!draft.districtId && !draft.districtName.trim() && !automaticDistrictName) {
      missing.push(t("quoteEditor.fields.district"));
    }
    if (!draft.deliveryDate.trim()) missing.push(t("quoteEditor.fields.deliveryDate"));
    if (!draft.deliveryTime.trim()) missing.push(t("quoteEditor.fields.deliveryTime"));
    if (!draft.shipOutTime.trim()) missing.push(t("quoteEditor.fields.shipOutTime"));
    return missing;
  }, [automaticDistrictName, draft, t]);

  const patchDraft = (partial: Partial<QuoteDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const addDistrict = async (name: string) => {
    if (creatingDistrict) return;
    setCreatingDistrict(true);
    setFieldErrors((current) => ({ ...current, districtId: "" }));
    try {
      const district = await createDistrict(name);
      setOptions((current) => ({
        ...current,
        districts: [...current.districts.filter((item) => item.id !== district.id), district]
          .sort((left, right) => left.name.localeCompare(right.name, "zh-HK")),
      }));
      patchDraft({ districtId: district.id, districtName: "" });
    } catch {
      setFieldErrors((current) => ({
        ...current,
        districtId: t("quoteEditor.validation.districtCreateFailed"),
      }));
    } finally {
      setCreatingDistrict(false);
    }
  };

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
    if (!draft.contactA.trim()) nextErrors.contactA = t("quoteEditor.validation.contact");
    if (!draft.email.trim()) nextErrors.email = t("quoteEditor.validation.email");
    if (!draft.shippingMethodId) nextErrors.shippingMethodId = t("quoteEditor.validation.shippingMethod");
    if (!draft.districtId && !draft.districtName.trim() && !automaticDistrictName) {
      nextErrors.districtId = t("quoteEditor.validation.district");
    }
    if (!draft.deliveryDate.trim()) nextErrors.deliveryDate = t("quoteEditor.validation.deliveryDate");
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const flushPendingLines = async (orderId: string) => {
    const pendingLines = lines.filter(
      (line): line is QuoteLine & { pendingItem: QuoteCatalogItem } =>
        Boolean(line.isPending && line.pendingItem),
    );
    if (!pendingLines.length) return;

    const savedIds = new Set<string>();
    try {
      for (const line of pendingLines) {
        const lineId = await saveLine({
          orderId,
          item: line.pendingItem,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          remarks: line.remarks || "",
          packageChoices: line.pendingPackageChoices ?? [],
        });
        if (line.labelEdited) {
          await saveLineLabel({ ...line, id: lineId, isPending: false });
        }
        savedIds.add(line.id);
      }
      setLines(await loadLines(orderId));
    } catch (cause) {
      const remainingDrafts = pendingLines.filter((line) => !savedIds.has(line.id));
      try {
        setLines([...(await loadLines(orderId)), ...remainingDrafts]);
      } catch {
        setLines((current) => current.filter((line) => !savedIds.has(line.id)));
      }
      throw cause;
    }
  };

  const persistAllChanges = async (quote: CreatedQuote) => {
    const invalidLine = lines.find(
      (line) => !Number.isInteger(line.quantity) || line.quantity < 0 || line.unitPrice < 0,
    );
    if (invalidLine) {
      throw new Error("quote_line_invalid");
    }
    if (isOrder && payments.some((payment) => !payment.paymentAt || !payment.paymentMethodId || payment.amount <= 0)) {
      throw new Error("quote_payment_invalid");
    }

    await saveCurrentDetails(quote.id);
    await flushPendingLines(quote.id);
    const batchSaver = saveBatch ?? (
      saveDetails === updateQuote
      && saveExistingLine === updateQuoteLine
      && saveFinancialDetails === updateQuoteFinancials
      && savePayments === saveQuotePayments
      && saveFactorySettings === saveOrderFactorySettings
        ? saveSalesDocumentBatch
        : null
    );
    const persistedLines = lines
      .filter((item) => !item.isPending)
      .map((line) => isFreeUtensilPackLine(line)
        ? { ...line, unitPrice: 0, totalPrice: 0 }
        : line);
    if (batchSaver) {
      await batchSaver({
        orderId: quote.id,
        documentType: isOrder ? "order" : "quote",
        lines: persistedLines,
        financials: financialValues,
        payments: isOrder ? payments : [],
        channelId: draft.channelId,
        orderNumber: quote.orderNumber,
        factorySettings,
      });
    } else {
      for (const line of persistedLines) {
        await saveExistingLine(line, isOrder ? "order" : "quote");
      }
      await saveFinancialDetails(quote.id, financialValues);
      if (isOrder) {
        await savePayments(quote.id, quote.orderNumber, draft.channelId, payments, "order");
        await saveFactorySettings(quote.id, factorySettings);
      }
    }
    writeQuotePdfSupplements(quote.id, supplements);
  };

  const saveAllChanges = async () => {
    if (!activeQuote || saving) return;
    if (!validateDetails()) {
      scrollToSection("details");
      return;
    }

    setSaving(true);
    setError(null);
    setCompletionError(null);
    try {
      await persistAllChanges(activeQuote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "quote_save_failed");
      setCompletionError("save");
    } finally {
      setSaving(false);
    }
  };

  const submitHeader = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateDetails()) return;

    if (activeQuote) {
      await saveAllChanges();
      return;
    }

    setSaving(true);
    setError(null);
    try {
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
      await flushPendingLines(activeQuote.id);
      await saveFinancialDetails(activeQuote.id, financialValues);
      const order = await convertQuote(activeQuote.id);
      navigate(`/orders/${order.id}`);
    } catch {
      setConversionError(true);
    } finally {
      setConverting(false);
    }
  };

  const sendCurrentQuoteConfirmation = async () => {
    if (!activeQuote || sendingConfirmation) return;
    setSendingConfirmation(true);
    setConfirmationSendError(false);
    try {
      await flushPendingLines(activeQuote.id);
      await sendConfirmation(activeQuote.id);
    } catch {
      setConfirmationSendError(true);
    } finally {
      setSendingConfirmation(false);
    }
  };

  const refreshLines = useCallback(async () => {
    if (!activeQuote) return;
    const savedLines = await loadLines(activeQuote.id);
    setLines((current) => [
      ...savedLines,
      ...current.filter((line) => line.isPending),
    ]);
  }, [activeQuote, loadLines]);

  const selectCatalogItem = (item: QuoteCatalogItem) => {
    setSelectedItem(item);
    setCatalogSearch(`${item.sku ? `${item.sku} · ` : ""}${item.name}`);
    setUnitPrice(item.price === null ? "" : String(item.price));
    setCatalogResults([]);
  };

  const resetLineDraft = () => {
    setCatalogSearch("");
    setSelectedItem(null);
    setQuantity("1");
    setUnitPrice("");
    setLineRemarks("");
  };

  const stageLine = (
    input: Parameters<typeof addQuoteLine>[0],
    packageChoices: QuotePackageChoiceSelection[] = [],
    packageChoiceGroups: QuotePackageChoiceGroup[] = [],
    additionalLines: Array<Parameters<typeof addQuoteLine>[0]> = [],
  ) => {
    setError(null);
    setPackageChoiceError(false);
    const toPendingLine = (
      lineInput: Parameters<typeof addQuoteLine>[0],
      choices: QuotePackageChoiceSelection[] = [],
      groups: QuotePackageChoiceGroup[] = [],
    ): QuoteLine => ({
      id: `draft-${crypto.randomUUID()}`,
      productId: lineInput.item.kind === "product" ? lineInput.item.id : null,
      packageId: lineInput.item.kind === "package" ? lineInput.item.id : null,
      sku: lineInput.item.sku,
      name: lineInput.item.name,
      quantity: lineInput.quantity,
      unitPrice: lineInput.unitPrice,
      totalPrice: lineInput.quantity * lineInput.unitPrice,
      remarks: lineInput.remarks.trim() || null,
      labelId: lineInput.item.labelId ?? null,
      labelDisplayA: lineInput.item.labelDisplayA ?? null,
      labelDisplayB: lineInput.item.labelDisplayB ?? null,
      packageChoiceGroups: groups,
      isPending: true,
      pendingItem: lineInput.item,
      pendingPackageChoices: choices,
    });
    setLines((current) => [
      ...current,
      toPendingLine(input, packageChoices, packageChoiceGroups),
      ...additionalLines.map((line) => toPendingLine(line)),
    ]);
    resetLineDraft();
    setPackageChoiceOpen(false);
    setPackageChoiceSets([]);
    setPackageSelections({});
    setPendingPackageLine(null);
  };

  const closeCustomProductModal = () => {
    setCustomProductOpen(false);
    setCustomProductName("");
    setCustomProductPrice("");
  };

  const customProductPriceValue = Number(customProductPrice);
  const customProductValid = Boolean(customProductName.trim())
    && Number.isFinite(customProductPriceValue)
    && customProductPriceValue >= 0;

  const addCustomProduct = () => {
    if (!activeQuote || !customProductValid) return;
    const name = customProductName.trim();
    stageLine({
      orderId: activeQuote.id,
      item: {
        id: `custom-${crypto.randomUUID()}`,
        kind: "custom",
        sku: null,
        name,
        price: customProductPriceValue,
      },
      quantity: 1,
      unitPrice: customProductPriceValue,
      remarks: "",
    });
    closeCustomProductModal();
  };

  const addLunchboxProducts = (items: ProductListItem[]) => {
    if (!activeQuote || !items.length) return;
    const inputs = items.map((item) => {
      const unitPrice = item.price ?? item.priceMin ?? 0;
      return {
        orderId: activeQuote.id,
        item: {
          id: item.id,
          kind: "product" as const,
          sku: item.sku,
          name: item.name || item.chineseName || item.sku || "-",
          price: unitPrice,
        },
        quantity: 1,
        unitPrice,
        remarks: "",
      };
    });
    stageLine(inputs[0], [], [], inputs.slice(1));
    setLunchboxPickerOpen(false);
  };

  const submitLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeQuote || !selectedItem) return;
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0 || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("quote_line_invalid");
      return;
    }
    const input = {
      orderId: activeQuote.id,
      item: selectedItem,
      quantity: parsedQuantity,
      unitPrice: parsedPrice,
      remarks: lineRemarks,
    };
    if (selectedItem.kind === "package") {
      setAdding(true);
      setError(null);
      try {
        const detail = await loadPackageDetail(selectedItem.id);
        if (!detail) throw new Error("package_not_found");
        const choiceSets = detail.choiceSets.filter(
          (choiceSet) => requiredPackageChoiceCount(choiceSet) > 0,
        );
        if (choiceSets.length) {
          setPendingPackageLine(input);
          setPackageChoiceSets(choiceSets);
          setPackageSelections(Object.fromEntries(choiceSets.map((choiceSet) => {
            const required = requiredPackageChoiceCount(choiceSet);
            return [
              choiceSet.id,
              choiceSet.products
                .filter((product) => product.isSelected)
                .slice(0, required)
                .map((product) => product.id),
            ];
          })));
          setPackageChoiceError(false);
          setPackageChoiceOpen(true);
          return;
        }
      } catch {
        setError("quote_line_save_failed");
        return;
      } finally {
        setAdding(false);
      }
    }
    stageLine(input);
  };

  const packageChoicesComplete = packageChoiceSets.every(
    (choiceSet) =>
      (packageSelections[choiceSet.id]?.length ?? 0) === requiredPackageChoiceCount(choiceSet),
  );

  const togglePackageChoice = (choiceSet: PackageChoiceSet, packageProductId: string) => {
    const required = requiredPackageChoiceCount(choiceSet);
    setPackageSelections((current) => {
      const selected = current[choiceSet.id] ?? [];
      const next = selected.includes(packageProductId)
        ? selected.filter((id) => id !== packageProductId)
        : selected.length < required
          ? [...selected, packageProductId]
          : selected;
      return { ...current, [choiceSet.id]: next };
    });
  };

  const confirmPackageChoices = () => {
    if (!pendingPackageLine || !packageChoicesComplete) return;
    const selectedPackageProducts = packageChoiceSets.flatMap((choiceSet) =>
      (packageSelections[choiceSet.id] ?? []).flatMap((packageProductId) => {
        const product = choiceSet.products.find((item) => item.id === packageProductId);
        return product ? [product] : [];
      }),
    );
    stageLine(
      pendingPackageLine,
      packageChoiceSets.map((choiceSet) => ({
        choiceSetId: choiceSet.id,
        packageProductIds: packageSelections[choiceSet.id] ?? [],
      })),
      packageChoiceSets.map((choiceSet) => ({
        choiceSetId: choiceSet.id,
        choiceSetName: choiceSet.name,
        products: (packageSelections[choiceSet.id] ?? []).map((packageProductId) => {
          const product = choiceSet.products.find((item) => item.id === packageProductId);
          return {
            packageProductId,
            name: product?.productName || product?.productChineseName || product?.productSku || "-",
          };
        }),
      })),
      selectedPackageProducts.map((product) => {
        const addonPrice = Number(product.addonPrice);
        return {
          orderId: pendingPackageLine.orderId,
          item: {
            id: product.productId ?? `package-choice-${product.id}`,
            kind: product.productId ? "product" as const : "custom" as const,
            sku: product.productSku,
            name: product.productName || product.productChineseName || product.productSku || "-",
            price: Number.isFinite(addonPrice) && addonPrice >= 0 ? addonPrice : 0,
          },
          quantity: pendingPackageLine.quantity,
          unitPrice: Number.isFinite(addonPrice) && addonPrice >= 0 ? addonPrice : 0,
          remarks: "",
        };
      }),
    );
  };

  const closePackageChoiceModal = () => {
    if (adding) return;
    setPackageChoiceOpen(false);
    setPackageChoiceSets([]);
    setPackageSelections({});
    setPendingPackageLine(null);
    setPackageChoiceError(false);
  };

  const removeLine = async (lineId: string) => {
    if (lines.some((line) => line.id === lineId && line.isPending)) {
      setLines((current) => current.filter((line) => line.id !== lineId));
      return;
    }
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
    const nextLine = isFreeUtensilPackLine(line)
      ? { ...line, unitPrice: 0, totalPrice: 0 }
      : line;
    if (!Number.isInteger(nextLine.quantity) || nextLine.quantity < 0 || nextLine.unitPrice < 0) {
      setError("quote_line_invalid");
      return;
    }
    if (nextLine.isPending) return;
    setSavingLineId(nextLine.id);
    setError(null);
    try {
      if (isOrder) await saveExistingLine(nextLine, "order");
      else await saveExistingLine(nextLine);
    } catch {
      setError("quote_line_save_failed");
    } finally {
      setSavingLineId(null);
    }
  };

  const openLabelModal = (line: QuoteLine) => {
    setLabelModalDraft({
      displayA: line.labelDisplayA || "",
      displayB: line.labelDisplayB || "",
      remarks: line.remarks || "",
    });
    setLabelModalLineId(line.id);
  };

  const closeLabelModal = () => setLabelModalLineId(null);

  const saveLabelModal = async (line: QuoteLine) => {
    const labelChanged = labelModalDraft.displayA !== (line.labelDisplayA || "")
      || labelModalDraft.displayB !== (line.labelDisplayB || "");
    const remarksChanged = labelModalDraft.remarks !== (line.remarks || "");
    const nextLine = {
      ...line,
      labelDisplayA: labelModalDraft.displayA,
      labelDisplayB: labelModalDraft.displayB,
      remarks: labelModalDraft.remarks,
      labelEdited: line.labelEdited || labelChanged,
    };
    if (line.isPending) {
      patchLine(line.id, nextLine);
      closeLabelModal();
      return;
    }
    if (!labelChanged && !remarksChanged) {
      closeLabelModal();
      return;
    }
    setSavingLineId(line.id);
    setError(null);
    try {
      if (remarksChanged) {
        await saveExistingLine(nextLine, isOrder ? "order" : "quote");
      }
      if (labelChanged) await saveLineLabel(nextLine);
      patchLine(line.id, {
        labelDisplayA: labelModalDraft.displayA,
        labelDisplayB: labelModalDraft.displayB,
        remarks: labelModalDraft.remarks,
        labelEdited: false,
      });
      closeLabelModal();
    } catch {
      setError("quote_line_save_failed");
    } finally {
      setSavingLineId(null);
    }
  };

  const labelNameForPrint = (line: QuoteLine) =>
    [line.labelDisplayA, line.labelDisplayB]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .join("\n") || line.name || "—";

  const labelPreviewInput = (line: QuoteLine) => ({
    orderNumber: activeQuote?.orderNumber || "—",
    deliveryDate: draft.deliveryDate,
    labelName: labelNameForPrint(line),
    remarks: [line.remarks || "", draft.packingNote].filter(Boolean),
    copies: Math.max(1, Math.floor(line.quantity || 1)),
  });

  const labelModalLine = lines.find((line) => line.id === labelModalLineId) ?? null;
  const labelModalPreviewLine = labelModalLine
    ? {
        ...labelModalLine,
        ...(!readOnly ? {
          labelDisplayA: labelModalDraft.displayA,
          labelDisplayB: labelModalDraft.displayB,
          remarks: labelModalDraft.remarks,
        } : {}),
      }
    : null;
  const labelPreviewModal = labelModalLine ? (
    <Modal
      open
      onClose={closeLabelModal}
      title={t(readOnly ? "quoteEditor.items.viewLabelTitle" : "quoteEditor.items.editLabelTitle", {
        name: labelModalLine.name || "",
      })}
      description={t("quoteEditor.items.labelSizeHint")}
      closeLabel={t("quoteEditor.items.closeLabelModal")}
      size="md"
      className="quote-label-modal"
      footer={readOnly ? undefined : (
        <>
          <Button type="button" variant="outline" onClick={closeLabelModal}>
            {t("quoteEditor.items.labelCancel")}
          </Button>
          <Button
            type="button"
            disabled={savingLineId === labelModalLine.id}
            onClick={() => void saveLabelModal(labelModalLine)}
          >
            {savingLineId === labelModalLine.id ? <LoaderCircle className="spin" /> : <Check />}
            {savingLineId === labelModalLine.id
              ? t("quoteEditor.items.labelSaving")
              : t("quoteEditor.items.labelSave")}
          </Button>
        </>
      )}
    >
      <div className="quote-label-modal-content">
        <FactoryDishLabelPreview input={labelPreviewInput(labelModalPreviewLine!)} />
        <small>{t(labelModalLine.labelId ? "quoteEditor.items.linkedLabel" : "quoteEditor.items.temporaryLabel")}</small>
        {!readOnly ? (
          <div className="quote-line-label-editor">
            <label>
              <span>{t("quoteEditor.items.labelDisplayA")}</span>
              <input
                value={labelModalDraft.displayA}
                disabled={savingLineId === labelModalLine.id}
                onChange={(event) => setLabelModalDraft((current) => ({ ...current, displayA: event.target.value }))}
              />
            </label>
            <label>
              <span>{t("quoteEditor.items.labelDisplayB")}</span>
              <input
                value={labelModalDraft.displayB}
                disabled={savingLineId === labelModalLine.id}
                onChange={(event) => setLabelModalDraft((current) => ({ ...current, displayB: event.target.value }))}
              />
            </label>
            <label>
              <span>{t("quoteEditor.items.remarks")}</span>
              <textarea
                rows={2}
                maxLength={16}
                value={labelModalDraft.remarks}
                disabled={savingLineId === labelModalLine.id}
                onChange={(event) => setLabelModalDraft((current) => ({ ...current, remarks: event.target.value }))}
              />
            </label>
          </div>
        ) : null}
      </div>
    </Modal>
  ) : null;

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
    if (nextLines.some((line) => line.isPending)) return;
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
    if (next && factoryMissingFields.length) {
      setFactoryValidationOpen(true);
      return;
    }
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

  type EditorSection = "details" | "items" | "payments";
  const sectionId = (section: EditorSection) =>
    `quote-editor-${readOnly ? "readonly" : "editable"}-${section}`;
  const scrollToSection = (section: EditorSection) => {
    setActiveTab(section);
    document.getElementById(sectionId(section))?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
  };

  const moveLine = async (lineId: string, direction: -1 | 1) => {
    if (reordering) return;
    const sourceIndex = lines.findIndex((line) => line.id === lineId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= lines.length) return;
    const previousLines = lines;
    const nextLines = [...previousLines];
    const [movedLine] = nextLines.splice(sourceIndex, 1);
    nextLines.splice(targetIndex, 0, movedLine);
    setLines(nextLines);
    if (nextLines.some((line) => line.isPending)) return;
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
  const sectionNavigation = (
    <nav
      ref={sectionNavigationRef}
      className={cn(
        "quote-editor-tabs quote-editor-section-navigation",
        !isOrder && "is-quote",
      )}
      aria-label={t(isOrder ? "quoteEditor.orderStepLabel" : "quoteEditor.steps.label")}
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        aria-label={t(isOrder ? "quoteEditor.orderDetailsStep" : "quoteEditor.steps.details")}
        aria-controls={sectionId("details")}
        aria-selected={activeTab === "details"}
        className={cn(activeTab === "details" && "is-active")}
        onClick={() => scrollToSection("details")}
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
        aria-controls={sectionId("items")}
        aria-selected={activeTab === "items"}
        disabled={!activeQuote}
        className={cn(activeTab === "items" && "is-active")}
        onClick={() => scrollToSection("items")}
      >
        <span><PackagePlus /></span>
        <div>
          <small>{t("quoteEditor.steps.number", { number: 2 })}</small>
          <strong>{t("quoteEditor.steps.items")}</strong>
        </div>
      </button>
      {isOrder ? (
        <button
          type="button"
          role="tab"
          aria-label={t("quoteEditor.steps.payments")}
          aria-controls={sectionId("payments")}
          aria-selected={activeTab === "payments"}
          disabled={!activeQuote}
          className={cn(activeTab === "payments" && "is-active")}
          onClick={() => scrollToSection("payments")}
        >
          <span><CreditCard /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 3 })}</small>
            <strong>{t("quoteEditor.steps.payments")}</strong>
          </div>
        </button>
      ) : null}
    </nav>
  );

  const factoryValidationModal = (
    <Modal
      open={factoryValidationOpen}
      onClose={() => setFactoryValidationOpen(false)}
      title={t("quoteEditor.factoryStatus.blockedTitle")}
      description={t("quoteEditor.factoryStatus.blockedDescription")}
      closeLabel={t("quoteEditor.factoryStatus.closeBlocked")}
      role="alertdialog"
      size="sm"
      footer={<Button type="button" onClick={() => setFactoryValidationOpen(false)}>{t("quoteEditor.factoryStatus.acknowledge")}</Button>}
    >
      <ul className="quote-factory-missing-list">
        {factoryMissingFields.map((field) => <li key={field}>{field}</li>)}
      </ul>
    </Modal>
  );

  const patchPayment = (paymentId: string, partial: Partial<QuotePayment>) => {
    setPayments((current) => current.map((payment) => payment.id === paymentId ? { ...payment, ...partial } : payment));
  };

  const completeQuote = async (notify: boolean) => {
    if (!activeQuote) return;
    setCompleting(true);
    setCompletionError(null);
    try {
      await persistAllChanges(activeQuote);
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

  const confirmAddonEnteredInShopify = async () => {
    if (!activeQuote || confirmingAddonShopify) return;
    setConfirmingAddonShopify(true);
    setAddonShopifyError(false);
    try {
      await confirmAddonShopify(activeQuote.id);
      setCreated((current) => current ? { ...current, addonShopifyPending: false } : current);
    } catch {
      setAddonShopifyError(true);
    } finally {
      setConfirmingAddonShopify(false);
    }
  };

  if (loading) return <PageSkeleton detailLayout="document" label={t("quoteEditor.loading")} variant="detail" />;

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
    const showConfirmationAction = !isOrder && !draft.quoteStatus;
    const showConvertAction = !isOrder;

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
            <div className="order-number-cell">
              <h1>{activeQuote.orderNumber || (isOrder ? t("details.orderTitle") : t("quoteEditor.title"))}</h1>
              {isOrder && activeQuote.addonShopifyPending ? <span className="status-badge amber">未處理加單</span> : null}
              {activeShopifyUrl ? (
                <a
                  className="shopify-order-icon"
                  href={activeShopifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("orders.openInShopify", { order: activeQuote.orderNumber || activeQuote.id })}
                  title={t("orders.openInShopify", { order: activeQuote.orderNumber || activeQuote.id })}
                >
                  <span aria-hidden="true">S</span>
                </a>
              ) : null}
            </div>
            <p>{t(isOrder ? "quoteEditor.orderItemsReady" : "quoteEditor.itemsReady")}</p>
          </div>
          {showConfirmationAction || showConvertAction ? (
            <div className="quote-detail-actions">
              {canEdit ? (
                <Button asChild variant="outline">
                  <Link to={`/quotes/${activeQuote.id}/edit`}><Pencil />編輯</Link>
                </Button>
              ) : null}
              {showConfirmationAction ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={sendingConfirmation || converting}
                  onClick={() => void sendCurrentQuoteConfirmation()}
                >
                  {sendingConfirmation ? <LoaderCircle className="spin" /> : <Mail />}
                  {t("quoteEditor.detailActions.sendConfirmation")}
                </Button>
              ) : null}
              {showConvertAction ? (
                <Button
                  type="button"
                  disabled={converting || sendingConfirmation}
                  onClick={() => void convertCurrentQuote()}
                >
                  {converting ? <LoaderCircle className="spin" /> : <ShoppingCart />}
                  {converting ? t("quotes.actions.converting") : t("quotes.actions.convert")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {isOrder ? (
            <div className="quote-order-detail-summary">
              <OrderPaymentStatus total={grandTotal} paid={paidTotal} formatMoney={money.format} navigationStuck={sectionNavigationStuck} />
              <div className="quote-detail-actions">
                {activeQuote.addonShopifyPending && canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={confirmingAddonShopify}
                    onClick={() => void confirmAddonEnteredInShopify()}
                  >
                    {confirmingAddonShopify ? <LoaderCircle className="spin" /> : <Check />}
                    确认已手动加入 Shopify
                  </Button>
                ) : null}
                {!isSentToFactory && !factorySettings.doNotSendToFactory ? (
                  <Button
                    type="button"
                    disabled={changingFactoryStatus}
                    onClick={() => void toggleFactoryStatus()}
                  >
                    {changingFactoryStatus ? <LoaderCircle className="spin" /> : <Factory />}
                    {changingFactoryStatus
                      ? t("quoteEditor.factoryStatus.saving")
                      : t("quoteEditor.factoryStatus.send")}
                  </Button>
                ) : null}
                {canEdit ? <Button asChild variant="outline"><Link to={`/orders/${activeQuote.id}/edit`} target="_blank" rel="noopener noreferrer"><Pencil />編輯</Link></Button> : null}
              </div>
            </div>
          ) : null}
        </header>

        {!isOrder && (confirmationSendError || conversionError) ? (
          <p className="quote-editor-error" role="alert">
            {t(confirmationSendError ? "quoteEditor.payments.sendError" : "quoteEditor.errors.convert")}
          </p>
        ) : null}
        {isOrder && factoryStatusError ? (
          <p className="quote-editor-error" role="alert">{t("quoteEditor.factoryStatus.error")}</p>
        ) : null}
        {isOrder && addonShopifyError ? (
          <p className="quote-editor-error" role="alert">未能更新加單狀態，請稍後再試。</p>
        ) : null}

        {sectionNavigation}

        <section
          id={sectionId("details")}
          className="panel quote-editor-form quote-editor-readonly-form quote-editor-scroll-section"
        >
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
            <ReadonlyField label={t("quoteEditor.fields.customerNote")} hint={t("quoteEditor.fields.customerNoteHint")} value={draft.customerNote} />
            <ReadonlyField label={t("quoteEditor.fields.packingNote")} hint={t("quoteEditor.fields.packingNoteHint")} value={draft.packingNote} />
            <ReadonlyField label={t("quoteEditor.fields.salesPartner")} value={optionName(options.salesPartners, draft.salesPartnerId)} />
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.quoteStatus")} value={draft.quoteStatus} /> : null}
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.followUpDate")} value={displayDate(draft.followUpDate)} /> : null}
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.quoteSalesSource")} value={optionName(options.quoteSalesSources, draft.quoteSalesSourceId)} /> : null}
            {!isOrder ? <ReadonlyField label={t("quoteEditor.fields.quoteCommunicationChannel")} value={optionName(options.quoteCommunicationChannels, draft.quoteCommunicationChannelId)} /> : null}
            <ReadonlyField label={t("quoteEditor.fields.internalNote")} hint={t("quoteEditor.fields.internalNoteHint")} value={draft.internalNote} />
          </div>
        </section>

        <article
          id={sectionId("items")}
          className="panel quote-lines-panel quote-lines-readonly-panel quote-editor-scroll-section"
        >
          <header><div><span className="eyebrow">{t(isOrder ? "quoteEditor.orderSummaryEyebrow" : "quoteEditor.items.summaryEyebrow")}</span><h2>{t("quoteEditor.items.summaryTitle")}</h2></div><strong>{money.format(total)}</strong></header>
          <div className="table-wrap"><table><thead><tr><th>{t("quoteEditor.items.sequence")}</th><th>{t("quoteEditor.items.sku")}</th><th>{t("quoteEditor.items.product")}</th><th>{t("quoteEditor.items.labelPreview")}</th><th>{t("quoteEditor.items.quantity")}</th><th>{t("quoteEditor.items.unitPrice")}</th><th>{t("quoteEditor.items.subtotal")}</th></tr></thead><tbody>
            {lines.map((line, index) => <tr key={line.id}>
              <td className="quote-line-sequence">{index + 1}</td>
              <td className="quote-line-sku">{displayValue(line.sku)}</td>
              <td className="quote-line-product">
                {line.isAddon ? <span className="status-badge blue quote-line-addon-label">加單</span> : null}
                <strong>{displayValue(line.name)}</strong>
                {line.remarks ? <small title={line.remarks}>{line.remarks}</small> : null}
              </td>
              <td><Button type="button" variant="outline" size="sm" onClick={() => openLabelModal(line)}><Search />{t("quoteEditor.items.viewLabel")}</Button></td>
              <td>{line.quantity}</td>
              <td>{money.format(line.unitPrice)}</td>
              <td>{money.format(line.totalPrice)}</td>
            </tr>)}
            {!lines.length ? <tr><td colSpan={7} className="quote-lines-empty"><PackagePlus /><strong>{t("quoteEditor.items.empty")}</strong></td></tr> : null}
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

        {labelPreviewModal}

        {supplements.additionalInfo.length || supplements.activities.length ? (
          <section className="panel quote-editor-supplements quote-editor-supplements-readonly">
            <div className={cn("quote-editor-supplement-grid", (!supplements.additionalInfo.length || !supplements.activities.length) && "is-single")}>
              {supplements.additionalInfo.length ? <article><h3>額外資訊</h3>{supplements.additionalInfo.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</article> : null}
              {supplements.activities.length ? <article><h3>活動項目</h3>{supplements.activities.map((activity) => <p key={activity.id}><span>{activity.description}</span><strong>{money.format(Number(activity.amount) || 0)}</strong></p>)}</article> : null}
            </div>
          </section>
        ) : null}

        {isOrder ? <section
          id={sectionId("payments")}
          className="panel quote-payment-step quote-payment-readonly quote-editor-scroll-section"
        >
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
        </section> : null}
        {factoryValidationModal}
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
          <div className="order-number-cell">
            <h1>{activeQuote?.orderNumber || (isOrder ? t("details.orderTitle") : t("quoteEditor.title"))}</h1>
            {activeQuote && activeShopifyUrl ? (
              <a
                className="shopify-order-icon"
                href={activeShopifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("orders.openInShopify", { order: activeQuote.orderNumber || activeQuote.id })}
                title={t("orders.openInShopify", { order: activeQuote.orderNumber || activeQuote.id })}
              >
                <span aria-hidden="true">S</span>
              </a>
            ) : null}
          </div>
          <p>{activeQuote ? t(isOrder ? "quoteEditor.orderItemsReady" : "quoteEditor.itemsReady") : t("quoteEditor.description")}</p>
        </div>
        {activeQuote && (
          <span className="quote-editor-saved-badge"><Check />{t("quoteEditor.saved")}</span>
        )}
        {isOrder && activeQuote ? <OrderPaymentStatus total={grandTotal} paid={paidTotal} formatMoney={money.format} navigationStuck={sectionNavigationStuck} /> : null}
      </header>

      {sectionNavigation}

      <form
        id={sectionId("details")}
        className="panel quote-editor-form quote-editor-scroll-section"
        onSubmit={submitHeader}
      >
          <div className="quote-editor-form-column">
            <h2><FileText />{t("quoteEditor.customerSection")}</h2>
            <label><span>{t("quoteEditor.fields.number")}</span><input value={activeQuote?.orderNumber || t("quoteEditor.autoNumber")} disabled /></label>
            <label><span>{t("quoteEditor.fields.brand")} *</span>
              <FilterableSelect required value={draft.channelId} onChange={(event) => patchDraft({ channelId: event.target.value })} aria-invalid={Boolean(fieldErrors.channelId)}>
                <option value="">{t("quoteEditor.placeholders.brand")}</option>
                {options.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </FilterableSelect>
              {fieldErrors.channelId && <em>{fieldErrors.channelId}</em>}
            </label>
            <label><span>{t("quoteEditor.fields.customerName")} *</span><input required aria-label={t("quoteEditor.fields.customerName")} value={draft.customerName} onChange={(event) => patchDraft({ customerName: event.target.value })} aria-invalid={Boolean(fieldErrors.customerName)} />{fieldErrors.customerName && <em>{fieldErrors.customerName}</em>}</label>
            <label><span>{t("quoteEditor.fields.companyName")}</span><input aria-label={t("quoteEditor.fields.companyName")} value={draft.companyName} onChange={(event) => patchDraft({ companyName: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.contactA")} *</span><input required aria-label={t("quoteEditor.fields.contactA")} type="tel" value={draft.contactA} onChange={(event) => patchDraft({ contactA: event.target.value })} aria-invalid={Boolean(fieldErrors.contactA)} />{fieldErrors.contactA && <em>{fieldErrors.contactA}</em>}</label>
            <label><span>{t("quoteEditor.fields.contactB")}</span><input type="tel" value={draft.contactB} onChange={(event) => patchDraft({ contactB: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.email")} *</span><input required aria-label={t("quoteEditor.fields.email")} type="email" value={draft.email} onChange={(event) => patchDraft({ email: event.target.value })} aria-invalid={Boolean(fieldErrors.email)} />{fieldErrors.email && <em>{fieldErrors.email}</em>}</label>
            <label><span>{t("quoteEditor.fields.asanaLink")}</span><input type="url" value={draft.asanaLink} onChange={(event) => patchDraft({ asanaLink: event.target.value })} placeholder={t("quoteEditor.placeholders.asanaLinkPlaceholder")} /></label>
            {showDeliveryAddress && <label><span>{t("quoteEditor.fields.address")}</span><textarea rows={2} value={draft.address} onChange={(event) => patchDraft({ address: event.target.value })} /></label>}
            <div className="quote-editor-tags">
              <span id="quote-order-tags-label">{t("quoteEditor.fields.tags")}</span>
              <div
                id="quote-order-tags"
                className="quote-editor-tag-options"
                role="group"
                aria-labelledby="quote-order-tags-label"
              >
                {options.orderTags.length ? options.orderTags.map((tag) => {
                  const selected = draft.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(selected && "is-selected")}
                      onClick={() => patchDraft({
                        tagIds: selected
                          ? draft.tagIds.filter((tagId) => tagId !== tag.id)
                          : [...draft.tagIds, tag.id],
                      })}
                    >
                      {tag.name}
                    </button>
                  );
                }) : <span className="quote-editor-tags-empty">{t("quoteEditor.noTagResults")}</span>}
              </div>
            </div>
          </div>

          <div className="quote-editor-form-column">
            <h2><PackagePlus />{t("quoteEditor.deliverySection")}</h2>
            {!isOrder ? <label><span>{t("quoteEditor.fields.quoteStatus")}</span><FilterableSelect aria-label={t("quoteEditor.fields.quoteStatus")} value={draft.quoteStatus} onChange={(event) => patchDraft({ quoteStatus: event.target.value })}><option value="">{t("common.notSet")}</option>{draft.quoteStatus && !quoteStatusOptions.some((option) => option.value === draft.quoteStatus) ? <option value={draft.quoteStatus}>{draft.quoteStatus}</option> : null}{quoteStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</FilterableSelect></label> : null}
            {!isOrder ? <label><span>{t("quoteEditor.fields.followUpDate")}</span><input aria-label={t("quoteEditor.fields.followUpDate")} type="date" value={draft.followUpDate} onChange={(event) => patchDraft({ followUpDate: event.target.value })} /></label> : null}
            {!isOrder && draft.quoteAutoClosedAt && draft.quoteStatus !== "Case Closed" ? <label><span>{t("quoteEditor.fields.quoteReopenReason")}</span><textarea rows={2} value={draft.quoteReopenReason ?? ""} onChange={(event) => patchDraft({ quoteReopenReason: event.target.value })} /></label> : null}
            {!isOrder ? <label><span>{t("quoteEditor.fields.quoteSalesSource")}</span><FilterableSelect aria-label={t("quoteEditor.fields.quoteSalesSource")} value={draft.quoteSalesSourceId} onChange={(event) => patchDraft({ quoteSalesSourceId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.quoteSalesSources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label> : null}
            {!isOrder ? <label><span>{t("quoteEditor.fields.quoteCommunicationChannel")}</span><FilterableSelect aria-label={t("quoteEditor.fields.quoteCommunicationChannel")} value={draft.quoteCommunicationChannelId} onChange={(event) => patchDraft({ quoteCommunicationChannelId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.quoteCommunicationChannels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label> : null}
            <label><span>{t("quoteEditor.fields.district")} *</span><SearchSelect id="quote-editor-district" label={t("quoteEditor.fields.district")} value={automaticDistrictName ? `auto:${automaticDistrictName}` : draft.districtId} options={automaticDistrictName ? [{ id: `auto:${automaticDistrictName}`, name: automaticDistrictName }] : districts} placeholder={t("quoteEditor.placeholders.districtPlaceholder")} disabled={Boolean(automaticDistrictName) || creatingDistrict} required={!automaticDistrictName} invalid={Boolean(fieldErrors.districtId)} onCreate={automaticDistrictName ? undefined : (name) => void addDistrict(name)} onChange={(option) => patchDraft({ districtId: option.id, districtName: "" })} />{fieldErrors.districtId && <em>{fieldErrors.districtId}</em>}</label>
            <label><span>{t("quoteEditor.fields.shippingMethod")} *</span><FilterableSelect required aria-label={t("quoteEditor.fields.shippingMethod")} value={draft.shippingMethodId} onChange={(event) => changeShippingMethod(event.target.value)} aria-invalid={Boolean(fieldErrors.shippingMethodId)}><option value="">{t("common.notSet")}</option>{options.shippingMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect>{fieldErrors.shippingMethodId && <em>{fieldErrors.shippingMethodId}</em>}</label>
            <label><span>{t("quoteEditor.fields.deliveryDate")} *</span><input required aria-label={t("quoteEditor.fields.deliveryDate")} type="date" value={draft.deliveryDate} onChange={(event) => patchDraft({ deliveryDate: event.target.value })} aria-invalid={Boolean(fieldErrors.deliveryDate)} />{fieldErrors.deliveryDate && <em>{fieldErrors.deliveryDate}</em>}</label>
            <label><span>{t("quoteEditor.fields.deliveryTime")}</span><div className="quote-time-control"><FilterableSelect aria-label={t("quoteEditor.fields.deliveryTime")} value={deliveryTimeMode === "custom" ? "custom" : draft.deliveryTime} onChange={(event) => { const value = event.target.value; setDeliveryTimeMode(value === "custom" ? "custom" : ""); patchDraft({ deliveryTime: value === "custom" ? "" : value }); }}><option value="">{t("quoteEditor.placeholders.deliveryTimeSelectPlaceholder")}</option><option value="custom">{t("quoteEditor.custom")}</option>{deliveryTimeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</FilterableSelect>{deliveryTimeMode === "custom" && <input value={draft.deliveryTime} onChange={(event) => patchDraft({ deliveryTime: event.target.value })} placeholder={t("quoteEditor.placeholders.customDeliveryTimePlaceholder")} />}</div></label>
            <label><span>{t("quoteEditor.fields.shipOutTime")}</span><FilterableSelect value={draft.shipOutTime} onChange={(event) => patchDraft({ shipOutTime: event.target.value })}><option value="">{t("quoteEditor.placeholders.shipOutTimeSelectPlaceholder")}</option>{shipOutTimeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</FilterableSelect></label>
            <label><span>{t("quoteEditor.fields.customerNote")}<small>{t("quoteEditor.fields.customerNoteHint")}</small></span><textarea rows={2} value={draft.customerNote} onChange={(event) => patchDraft({ customerNote: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.packingNote")}<small>{t("quoteEditor.fields.packingNoteHint")}</small></span><textarea rows={2} value={draft.packingNote} onChange={(event) => patchDraft({ packingNote: event.target.value })} /></label>
            <label><span>{t("quoteEditor.fields.salesPartner")}</span><FilterableSelect value={draft.salesPartnerId} onChange={(event) => patchDraft({ salesPartnerId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.salesPartners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
            <label><span>{t("quoteEditor.fields.internalNote")}<small>{t("quoteEditor.fields.internalNoteHint")}</small></span><textarea rows={2} value={draft.internalNote} onChange={(event) => patchDraft({ internalNote: event.target.value })} /></label>
          </div>

          {error && <p className="quote-editor-error" role="alert">{t("quoteEditor.errors.create")}</p>}
          {conversionError && <p className="quote-editor-error" role="alert">{t("quoteEditor.errors.convert")}</p>}
          <footer>
            {activeQuote && !isOrder ? <Button type="button" variant="outline" disabled={completing || saving} onClick={() => void completeQuote(true)}><Mail />{t("quoteEditor.payments.sendAndComplete")}</Button> : null}
            {activeQuote && !isOrder ? <Button type="button" variant="outline" disabled={converting || saving} onClick={() => void convertCurrentQuote()}><ShoppingCart />{converting ? t("quotes.actions.converting") : t("quotes.actions.convert")}</Button> : <span />}
            <Button type="submit" disabled={saving || converting}>{saving ? t("quoteEditor.saving") : activeQuote ? t("quoteEditor.saveChanges") : t("quoteEditor.saveAndContinue")}</Button>
          </footer>
      </form>

      {activeQuote ? (
        <>
        <div
          id={sectionId("items")}
          className="quote-items-layout quote-editor-scroll-section"
        >
          <form className="panel quote-item-form" onSubmit={submitLine}>
            <header><div><span className="eyebrow">{t("quoteEditor.items.addEyebrow")}</span><h2>{t("quoteEditor.items.addTitle")}</h2></div></header>
            <label><span>{t("quoteEditor.fields.brand")}</span><FilterableSelect value={channelId} onChange={(event) => { setChannelId(event.target.value); setCatalogSearch(""); setSelectedItem(null); }}><option value="">{t("quoteEditor.placeholders.brand")}</option>{options.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterableSelect></label>
            <div className="quote-catalog-control">
              <label className="quote-catalog-search"><span>{t("quoteEditor.items.product")}</span><div><Search /><input value={catalogSearch} onChange={(event) => { setCatalogSearch(event.target.value); setSelectedItem(null); }} placeholder={t("quoteEditor.items.searchPlaceholder")} /></div></label>
              {catalogSearch && !selectedItem && (
                <div className="quote-catalog-results" role="listbox" aria-label={t("quoteEditor.items.results")}>
                  {searching ? <p>{t("quoteEditor.items.searching")}</p> : catalogResults.length ? catalogResults.map((item) => <button type="button" role="option" aria-selected="false" key={`${item.kind}-${item.id}`} onClick={() => selectCatalogItem(item)}><strong>{item.name}</strong><span>{item.sku || "—"} · {item.kind === "package" ? t("quoteEditor.items.package") : t("quoteEditor.items.singleProduct")}</span><b>{item.price === null ? "—" : money.format(item.price)}</b></button>) : <p>{t("quoteEditor.items.noResults")}</p>}
                </div>
              )}
            </div>
            <div className="quote-item-numbers">
              <label><span>{t("quoteEditor.items.quantity")}</span><input type="number" inputMode="numeric" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
              <label><span>{t("quoteEditor.items.unitPrice")}</span><input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></label>
            </div>
            <label><span>{t("quoteEditor.items.remarks")}</span><textarea rows={1} maxLength={16} value={lineRemarks} onChange={(event) => setLineRemarks(event.target.value)} /></label>
            {error && <p className="quote-editor-error" role="alert">{t(`quoteEditor.errors.${error === "quote_line_invalid" ? "invalidLine" : "line"}`)}</p>}
            <div className="quote-item-form-actions">
              <Button type="button" variant="outline" onClick={() => setLunchboxPickerOpen(true)}><Search />{t("quoteEditor.items.lunchboxSearchButton")}</Button>
              <Button type="button" variant="outline" onClick={() => setCustomProductOpen(true)}><Pencil />{t("quoteEditor.items.customProduct")}</Button>
              <Button type="submit" disabled={!selectedItem || adding}><PackagePlus />{adding ? t("quoteEditor.items.adding") : t(isOrder ? "quoteEditor.orderAdd" : "quoteEditor.items.add")}</Button>
            </div>
          </form>

          <article className="panel quote-lines-panel">
            <header><div><span className="eyebrow">{t(isOrder ? "quoteEditor.orderSummaryEyebrow" : "quoteEditor.items.summaryEyebrow")}</span><h2>{t("quoteEditor.items.summaryTitle")}</h2></div><strong>{money.format(total)}</strong></header>
            {isMobileEditor ? (
              <div className="quote-mobile-lines" role="list" aria-label={t("quoteEditor.items.summaryTitle")}>
                {lines.map((line, index) => (
                  <article className="quote-mobile-line" role="listitem" key={line.id}>
                    <header>
                      <span>{index + 1}</span>
                      <div><strong>{line.name || "—"}</strong><small>{line.sku || "—"}</small></div>
                      <div className="quote-mobile-line-actions">
                        <button type="button" disabled={!index || reordering} aria-label={`${t("quoteEditor.items.sequence")} ${index}`} onClick={() => void moveLine(line.id, -1)}><ChevronUp /></button>
                        <button type="button" disabled={index === lines.length - 1 || reordering} aria-label={`${t("quoteEditor.items.sequence")} ${index + 2}`} onClick={() => void moveLine(line.id, 1)}><ChevronDown /></button>
                        <button type="button" className="quote-line-delete" aria-label={t("quoteEditor.items.remove", { name: line.name || "" })} disabled={removingId === line.id || savingLineId === line.id} onClick={() => void removeLine(line.id)}><Trash2 /></button>
                      </div>
                    </header>
                    <div className="quote-mobile-line-fields">
                      <label><span>{t("quoteEditor.items.quantity")}</span><input type="number" inputMode="numeric" min="0" step="1" value={line.quantity} disabled={savingLineId === line.id} onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })} onBlur={() => void saveEditedLine(line)} /></label>
                      <label><span>{t("quoteEditor.items.unitPrice")}</span><input type="number" inputMode="decimal" min="0" step="0.01" value={isFreeUtensilPackLine(line) ? 0 : line.unitPrice} disabled={savingLineId === line.id || isFreeUtensilPackLine(line)} onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })} onBlur={() => void saveEditedLine(line)} /></label>
                    </div>
                    <Button type="button" variant="outline" className="quote-mobile-label-button" onClick={() => openLabelModal(line)}><Pencil />{t("quoteEditor.items.editLabelButton")}</Button>
                    <footer><span>{t("quoteEditor.items.subtotal")}</span><strong>{money.format(line.totalPrice)}</strong></footer>
                  </article>
                ))}
                {!lines.length ? <div className="quote-lines-empty"><PackagePlus /><strong>{t("quoteEditor.items.empty")}</strong><span>{t("quoteEditor.items.emptyHint")}</span></div> : null}
              </div>
            ) : (
            <div className="table-wrap"><table><thead><tr><th>{t("quoteEditor.items.sequence")}</th><th>{t("quoteEditor.items.sku")}</th><th>{t("quoteEditor.items.product")}</th><th>{t("quoteEditor.items.labelPreview")}</th><th>{t("quoteEditor.items.quantity")}</th><th>{t("quoteEditor.items.unitPrice")}</th><th>{t("quoteEditor.items.subtotal")}</th><th><span className="sr-only">{t("quoteEditor.items.actions")}</span></th></tr></thead><tbody>
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
                </td>
                <td className="quote-line-label-cell">
                  <Button type="button" variant="outline" size="sm" onClick={() => openLabelModal(line)}><Pencil />{t("quoteEditor.items.editLabelButton")}</Button>
                </td>
                <td><input className="quote-line-edit-number" type="number" inputMode="numeric" min="0" step="1" value={line.quantity} aria-label={`${t("quoteEditor.items.quantity")} ${line.name || ""}`} disabled={savingLineId === line.id} onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })} onBlur={() => void saveEditedLine(line)} /></td>
                <td><input className="quote-line-edit-number" type="number" min="0" step="0.01" value={isFreeUtensilPackLine(line) ? 0 : line.unitPrice} aria-label={`${t("quoteEditor.items.unitPrice")} ${line.name || ""}`} disabled={savingLineId === line.id || isFreeUtensilPackLine(line)} onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })} onBlur={() => void saveEditedLine(line)} /></td>
                <td>{money.format(line.totalPrice)}</td>
                <td><button type="button" className="quote-line-delete" aria-label={t("quoteEditor.items.remove", { name: line.name || "" })} disabled={removingId === line.id || savingLineId === line.id} onClick={() => void removeLine(line.id)}><Trash2 /></button></td>
              </tr>)}
              {!lines.length && <tr><td colSpan={8} className="quote-lines-empty"><PackagePlus /><strong>{t("quoteEditor.items.empty")}</strong><span>{t("quoteEditor.items.emptyHint")}</span></td></tr>}
            </tbody></table></div>
            )}
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
                <label><span>{t("quoteEditor.financials.shippingFee")}</span><div className="quote-shipping-fee-control"><FilterableSelect className="shipping-fee-select" aria-label={t("quoteEditor.financials.shippingFeeOption")} value={shippingFeeId} onChange={(event) => {
                  const nextId = event.target.value;
                  const selected = shippingFees.find((fee) => fee.id === nextId);
                  const shippingFee = selected?.fee ?? 0;
                  setShippingFeeId(nextId);
                  setFinancials((current) => ({ ...current, shippingFee: String(shippingFee) }));
                  void saveFinancialAdjustments({ ...financialValues, shippingFee });
                }}><option value="">{t("quoteEditor.financials.chooseShippingFee")}</option>{shippingFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.item} · {money.format(fee.fee)}</option>)}</FilterableSelect><span className="quote-money-input">HK$<input type="number" min="0" step="0.01" aria-label={t("quoteEditor.financials.shippingFeeAmount")} value={financials.shippingFee} onChange={(event) => setFinancials((current) => ({ ...current, shippingFee: event.target.value }))} onBlur={() => void saveFinancialAdjustments()} /></span></div></label>
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
              <Button type="button" disabled={saving} onClick={() => void saveAllChanges()}>{saving ? t("quoteEditor.saving") : t("quoteEditor.saveChanges")}</Button>
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

        <Modal
          open={packageChoiceOpen}
          onClose={closePackageChoiceModal}
          title={t("quoteEditor.items.packageChoicesTitle")}
          description={pendingPackageLine?.item.name}
          closeLabel={t("quoteEditor.items.packageChoicesCancel")}
          size="lg"
          closeOnBackdrop={!adding}
          closeOnEscape={!adding}
          className="quote-package-choice-modal"
          footer={(
            <>
              <Button type="button" variant="outline" disabled={adding} onClick={closePackageChoiceModal}>
                {t("quoteEditor.items.packageChoicesCancel")}
              </Button>
              <Button type="button" disabled={!packageChoicesComplete || adding} onClick={() => void confirmPackageChoices()}>
                {adding ? <LoaderCircle className="spin" /> : <Check />}
                {adding ? t("quoteEditor.items.adding") : t("quoteEditor.items.packageChoicesConfirm")}
              </Button>
            </>
          )}
        >
          <div className="quote-package-choice-groups">
            <p>{t("quoteEditor.items.packageChoicesDescription")}</p>
            {packageChoiceSets.map((choiceSet) => {
              const selected = packageSelections[choiceSet.id] ?? [];
              const required = requiredPackageChoiceCount(choiceSet);
              return (
                <fieldset key={choiceSet.id} className="quote-package-choice-group">
                  <legend>
                    <strong>{choiceSet.name || t("quoteEditor.items.packageChoicesFallbackGroup")}</strong>
                    <span>{t("quoteEditor.items.packageChoicesRequired", { count: required })}</span>
                  </legend>
                  <div className="quote-package-choice-options">
                    {choiceSet.products.map((product) => {
                      const checked = selected.includes(product.id);
                      const disabled = !checked && selected.length >= required;
                      return (
                        <label key={product.id} className={cn(checked && "is-selected", disabled && "is-disabled")}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled || adding}
                            onChange={() => togglePackageChoice(choiceSet, product.id)}
                          />
                          <span>
                            <strong>{product.productName || product.productChineseName || product.productSku || "-"}</strong>
                            {product.productSku ? <small>{product.productSku}</small> : null}
                          </span>
                          {product.addonPrice ? <b>+{money.format(product.addonPrice)}</b> : null}
                        </label>
                      );
                    })}
                  </div>
                  <p className={cn(selected.length === required && "is-complete")}>
                    {t("quoteEditor.items.packageChoicesSelected", { selected: selected.length, count: required })}
                  </p>
                </fieldset>
              );
            })}
            {packageChoiceError ? <p className="quote-editor-error" role="alert">{t("quoteEditor.errors.line")}</p> : null}
          </div>
        </Modal>

        <LunchboxProductPicker
          open={lunchboxPickerOpen}
          initialSelectedProductIds={lines.flatMap((line) => line.productId ? [line.productId] : [])}
          onClose={() => setLunchboxPickerOpen(false)}
          onConfirm={addLunchboxProducts}
          loadProducts={loadLunchboxProducts}
          loadFilterOptions={loadLunchboxFilterOptions}
        />

        <Modal
          open={customProductOpen}
          onClose={closeCustomProductModal}
          title={t("quoteEditor.items.customProduct")}
          closeLabel={t("quoteEditor.items.customProductCancel")}
          size="sm"
          footer={(
            <>
              <Button type="button" variant="outline" onClick={closeCustomProductModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" form="quote-custom-product-form" disabled={!customProductValid}>
                {t("quoteEditor.items.customProductAdd")}
              </Button>
            </>
          )}
        >
          <form
            id="quote-custom-product-form"
            className="grid gap-4"
            onSubmit={(event) => { event.preventDefault(); addCustomProduct(); }}
          >
            <label className="grid gap-2 text-sm font-medium">
              {t("quoteEditor.items.customProductName")}
              <Input
                autoFocus
                className="focus-visible:border-input focus-visible:ring-0"
                value={customProductName}
                placeholder={t("quoteEditor.items.customProductNamePlaceholder")}
                aria-label={t("quoteEditor.items.customProductName")}
                onChange={(event) => setCustomProductName(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t("quoteEditor.items.unitPrice")}
              <Input
                type="number"
                className="focus-visible:border-input focus-visible:ring-0"
                min="0"
                step="0.01"
                value={customProductPrice}
                placeholder={t("quoteEditor.items.customProductPricePlaceholder")}
                aria-label={t("quoteEditor.items.unitPrice")}
                onChange={(event) => setCustomProductPrice(event.target.value)}
              />
            </label>
          </form>
        </Modal>

        <Modal open={additionalOpen} onClose={() => setAdditionalOpen(false)} title="額外資訊" closeLabel="關閉額外資訊" size="lg" className="quote-supplement-modal" footer={<Button onClick={() => setAdditionalOpen(false)}>確定</Button>}>
          <div className="quote-additional-picker">
            <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋額外資訊" placeholder={t("quoteEditor.placeholders.additionalSearchPlaceholder")} value={additionalSearch} onChange={(event) => setAdditionalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAdditionalInfo(additionalSearch); }} /><Button variant="outline" onClick={() => addAdditionalInfo(additionalSearch)}><Plus />{t("quoteEditor.items.customProductAdd")}</Button></div>
            <ul>{additionalInfoOptions.filter((option) => !additionalSearch.trim() || option.toLocaleLowerCase().includes(additionalSearch.trim().toLocaleLowerCase())).map((option) => <li key={option}><span>{option}</span><Button size="sm" variant="outline" onClick={() => addAdditionalInfo(option)}><Plus />加入</Button></li>)}</ul>
          </div>
        </Modal>

        <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="活動項目" closeLabel="關閉活動項目" size="lg" className="quote-supplement-modal" footer={<Button onClick={() => setActivityOpen(false)}>確定</Button>}>
          <div className="quote-additional-picker quote-activity-picker">
            <div className="quote-additional-search"><Search /><input autoFocus aria-label="搜尋活動項目" placeholder={t("quoteEditor.placeholders.activitySearchPlaceholder")} value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addActivity(activitySearch); }} /><Button variant="outline" onClick={() => addActivity(activitySearch)}><Plus />{t("quoteEditor.items.customProductAdd")}</Button></div>
            <ul>{activityOptions.filter((option) => !activitySearch.trim() || option.description.toLocaleLowerCase().includes(activitySearch.trim().toLocaleLowerCase())).map((option) => <li key={option.description}><span>{option.description}</span><span>${Number(option.amount).toLocaleString("zh-HK")}</span><Button size="sm" variant="outline" onClick={() => addActivity(option.description, option.amount)}><Plus />加入</Button></li>)}</ul>
          </div>
        </Modal>
        </>
      ) : null}

      {activeQuote && isOrder ? (
        <section
          id={sectionId("payments")}
          className="panel quote-payment-step quote-editor-scroll-section"
        >
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
                <label><span>{t("quoteEditor.payments.method")}</span><FilterableSelect aria-label={`${t("quoteEditor.payments.method")} ${index + 1}`} value={payment.paymentMethodId} onChange={(event) => patchPayment(payment.id, { paymentMethodId: event.target.value })}><option value="">{t("common.notSet")}</option>{options.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</FilterableSelect></label>
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
            <Button type="button" variant="outline" onClick={() => scrollToSection("items")}>{t("quoteEditor.payments.previous")}</Button>
            <div>
              <Button type="button" disabled={saving || completing} onClick={() => void saveAllChanges()}>{saving ? <LoaderCircle className="spin" /> : <Check />}{saving ? t("quoteEditor.saving") : t("quoteEditor.saveChanges")}</Button>
            </div>
          </footer>
        </section>
      ) : null}
      {labelPreviewModal}
      {factoryValidationModal}
    </section>
  );
}
