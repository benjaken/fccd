import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Info,
  Percent,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";

import { MonthlyTrendChart } from "@/components/reports/MonthlyTrendChart";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { evaluateQuoteAlert } from "@/lib/supplier-quotes";
import {
  confirmSupplierQuoteDocument,
  fetchSupplierQuoteDashboard,
  fetchSupplierQuoteRawMeatOptions,
  fetchSupplierQuoteSuppliers,
  ingestSupplierQuotePdf,
  type SupplierQuoteRawMeatOption,
  type SupplierQuoteSupplierOption,
} from "@/lib/supplier-quote-api";
import { cn } from "@/lib/utils";

type Availability = "quoted" | "tba" | "unavailable";
type LineState = "confirmed" | "pending" | "skipped" | "variant";
type DocumentState = "confirmed" | "draft" | "review" | "ocr_required" | "parse_failed";

export type QuoteDocument = {
  id: string;
  supplier: string;
  supplierId?: string | null;
  filename: string;
  quoteDate: string;
  effectiveDate: string;
  status: DocumentState;
  lineCount: number;
  confirmedAt: string;
  parserVersion: string;
};

export type QuoteLine = {
  id: string;
  documentId: string;
  supplier: string;
  supplierId?: string | null;
  supplierCode: string;
  productName: string;
  productNameZh: string;
  origin: string;
  spec: string;
  packing: string;
  price: number | null;
  currency: "HKD";
  priceUnit: "kg" | "box";
  availability: Availability;
  quoteDate: string;
  effectiveDate: string;
  sourcePage: number;
  sourceText: string;
  confidence: number;
  matchReason: string;
  state: LineState;
  matchedItem: string | null;
  conditions: string[];
  previousPrice: number | null;
  previousDate: string | null;
  baselinePrice: number | null;
  actualInboundPrice: number | null;
  actualInboundDate: string | null;
};

type Thresholds = {
  risePercent: number;
  fallPercent: number;
  includeSpecChanges: boolean;
  includePending: boolean;
};

export type ReviewLine = Pick<
  QuoteLine,
  | "id"
  | "supplierCode"
  | "productName"
  | "productNameZh"
  | "origin"
  | "spec"
  | "packing"
  | "price"
  | "availability"
  | "sourcePage"
  | "sourceText"
  | "confidence"
  | "matchReason"
  | "conditions"
> & { matchedItem: string; matchedRawMeatItemId?: string | null; selected: boolean };

const SUPPLIER_OPTIONS = ["全部供應商", "A-Mart", "Euro Foodstuff", "泰豐"];
const PRODUCT_OPTIONS = [
  "急凍去皮雞扒",
  "急凍牛小排",
  "急凍豬腩片",
  "急凍羊架",
  "急凍牛筋",
];

const initialDocuments: QuoteDocument[] = [
  {
    id: "doc-amart-2026-08",
    supplier: "A-Mart",
    filename: "A-Mart_Frozen_Catalogue_2026-08.pdf",
    quoteDate: "2026-08-05",
    effectiveDate: "2026-08-08",
    status: "confirmed",
    lineCount: 2,
    confirmedAt: "2026-08-06 10:32",
    parserVersion: "text-table/0.1",
  },
  {
    id: "doc-euro-2026-08",
    supplier: "Euro Foodstuff",
    filename: "EuroFoodstuff_Quote_Aug.pdf",
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-01",
    status: "confirmed",
    lineCount: 2,
    confirmedAt: "2026-08-02 16:10",
    parserVersion: "text-table/0.1",
  },
  {
    id: "doc-taifung-2026-07",
    supplier: "泰豐",
    filename: "泰豐肉類報價_202607.pdf",
    quoteDate: "2026-07-28",
    effectiveDate: "2026-08-01",
    status: "confirmed",
    lineCount: 2,
    confirmedAt: "2026-07-29 09:45",
    parserVersion: "text-table/0.1",
  },
];

const initialLines: QuoteLine[] = [
  {
    id: "line-amart-chicken",
    documentId: "doc-amart-2026-08",
    supplier: "A-Mart",
    supplierCode: "AM-CH-035",
    productName: "Chicken Thigh Boneless",
    productNameZh: "急凍去皮雞扒",
    origin: "Brazil",
    spec: "2.5 kg / 35 pcs",
    packing: "6 bags / carton",
    price: 42.8,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quoteDate: "2026-08-05",
    effectiveDate: "2026-08-08",
    sourcePage: 5,
    sourceText: "Chicken Thigh Boneless | Brazil | 2.5kg / 35pcs | 6 bags | 42.80 / KG",
    confidence: 0.96,
    matchReason: "供應商編號及規格與已確認別名一致",
    state: "confirmed",
    matchedItem: "急凍去皮雞扒",
    conditions: [],
    previousPrice: 38.5,
    previousDate: "2026-07-04",
    baselinePrice: 36.8,
    actualInboundPrice: 41.9,
    actualInboundDate: "2026-08-12",
  },
  {
    id: "line-amart-tba",
    documentId: "doc-amart-2026-08",
    supplier: "A-Mart",
    supplierCode: "AM-BF-112",
    productName: "Beef Tendon",
    productNameZh: "急凍牛筋",
    origin: "Australia",
    spec: "500 g",
    packing: "20 packs / carton",
    price: null,
    currency: "HKD",
    priceUnit: "kg",
    availability: "tba",
    quoteDate: "2026-08-05",
    effectiveDate: "2026-08-08",
    sourcePage: 18,
    sourceText: "Beef Tendon | Australia | 500g | TBA",
    confidence: 0.88,
    matchReason: "英文名稱相似；規格需要人工確認",
    state: "pending",
    matchedItem: "急凍牛筋",
    conditions: ["TBA，待供應商確認價格"],
    previousPrice: 64,
    previousDate: "2026-07-04",
    baselinePrice: 60,
    actualInboundPrice: 65.5,
    actualInboundDate: "2026-08-09",
  },
  {
    id: "line-euro-rib",
    documentId: "doc-euro-2026-08",
    supplier: "Euro Foodstuff",
    supplierCode: "EU-77102",
    productName: "Beef Short Rib",
    productNameZh: "急凍牛小排",
    origin: "USA",
    spec: "3/5 lb",
    packing: "4 boxes / carton",
    price: 88,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-01",
    sourcePage: 12,
    sourceText: "EU-77102 Beef Short Rib / USA / 3-5lb / 88.00 HKD per KG",
    confidence: 0.99,
    matchReason: "商品編號、產地及規格完全匹配",
    state: "confirmed",
    matchedItem: "急凍牛小排",
    conditions: ["每箱 4 盒"],
    previousPrice: 84.5,
    previousDate: "2026-07-01",
    baselinePrice: 82,
    actualInboundPrice: 87.2,
    actualInboundDate: "2026-08-10",
  },
  {
    id: "line-euro-lamb",
    documentId: "doc-euro-2026-08",
    supplier: "Euro Foodstuff",
    supplierCode: "EU-88201",
    productName: "Lamb Rack Frenched",
    productNameZh: "急凍羊架",
    origin: "New Zealand",
    spec: "8 ribs",
    packing: "2 boxes / carton",
    price: 112,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-01",
    sourcePage: 27,
    sourceText: "EU-88201 Lamb Rack Frenched | NZ | 8 ribs | 112.00 / KG",
    confidence: 0.72,
    matchReason: "未找到相同供應商別名；由商品名稱建議匹配",
    state: "pending",
    matchedItem: "急凍羊架",
    conditions: ["新商品，未有上一個相同比較鍵"],
    previousPrice: null,
    previousDate: null,
    baselinePrice: null,
    actualInboundPrice: null,
    actualInboundDate: null,
  },
  {
    id: "line-taifung-pork",
    documentId: "doc-taifung-2026-07",
    supplier: "泰豐",
    supplierCode: "TF-無編號",
    productName: "豬腩片",
    productNameZh: "急凍豬腩片",
    origin: "Spain",
    spec: "切片，約 2 mm",
    packing: "真空入碟",
    price: 46.5,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quoteDate: "2026-07-28",
    effectiveDate: "2026-08-01",
    sourcePage: 3,
    sourceText: "豬腩片 | 西班牙 | 約2mm | 真空入碟 | $46.50 / KG",
    confidence: 0.91,
    matchReason: "中文名稱、切片方式及包裝條件匹配",
    state: "confirmed",
    matchedItem: "急凍豬腩片",
    conditions: ["真空／入碟包裝另加 HK$3；原始報價未換算"],
    previousPrice: 49,
    previousDate: "2026-06-28",
    baselinePrice: 47,
    actualInboundPrice: 48.2,
    actualInboundDate: "2026-08-06",
  },
  {
    id: "line-taifung-pork-variant",
    documentId: "doc-taifung-2026-07",
    supplier: "泰豐",
    supplierCode: "TF-無編號",
    productName: "豬腩片",
    productNameZh: "急凍豬腩片",
    origin: "Spain",
    spec: "切粒，約 8 mm",
    packing: "散裝",
    price: 52,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quoteDate: "2026-07-28",
    effectiveDate: "2026-08-01",
    sourcePage: 3,
    sourceText: "豬腩片 | 西班牙 | 切粒8mm | 散裝 | $52.00 / KG",
    confidence: 0.9,
    matchReason: "同名但加工方式及包裝不同，建立獨立 variant",
    state: "variant",
    matchedItem: "急凍豬腩片",
    conditions: ["加工方式不同，不能與切片版本直接比較"],
    previousPrice: null,
    previousDate: null,
    baselinePrice: null,
    actualInboundPrice: null,
    actualInboundDate: null,
  },
];

function formatMoney(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("zh-HK", {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
      }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "無法計算" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function changeRate(line: QuoteLine) {
  if (line.price === null || line.previousPrice === null || line.previousPrice === 0) {
    return null;
  }
  return ((line.price - line.previousPrice) / line.previousPrice) * 100;
}

function isAlert(line: QuoteLine, thresholds: Thresholds) {
  return evaluateQuoteAlert(
    {
      comparisonState:
        line.state === "variant"
          ? "spec_changed"
          : line.previousPrice === null
            ? "new_item"
            : "comparable",
      availability: line.availability,
      previousPrice: line.previousPrice,
      latestPrice: line.price,
      specChanged: line.state === "variant",
    },
    {
      upPercent: thresholds.risePercent,
      downPercent: thresholds.fallPercent,
      includeSpecChanges: thresholds.includeSpecChanges,
      includeNewItems: thresholds.includePending,
      includeTba: thresholds.includePending,
      includeUnavailable: thresholds.includePending,
    },
  ).triggered;
}

function lineStatus(line: QuoteLine, thresholds: Thresholds) {
  const rate = changeRate(line);
  if (line.availability === "tba") return { label: "TBA／待確認", tone: "amber" };
  if (line.availability === "unavailable") return { label: "暫缺", tone: "slate" };
  if (line.state === "variant") return { label: "規格變更", tone: "purple" };
  if (line.previousPrice === null) return { label: "新增商品", tone: "blue" };
  if (isAlert(line, thresholds)) return { label: "異常", tone: "red" };
  if (rate !== null && rate > 0.4) return { label: "上漲", tone: "amber" };
  if (rate !== null && rate < -0.4) return { label: "下跌", tone: "green" };
  return { label: "不變", tone: "slate" };
}

function csvCell(value: string | number | null) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildCsv(lines: QuoteLine[], thresholds: Thresholds) {
  const headers = [
    "供應商",
    "報價日期",
    "生效日期",
    "商品",
    "商品編號",
    "規格",
    "產地",
    "包裝",
    "原始價格",
    "貨幣",
    "價格單位",
    "基準報價",
    "上一次報價",
    "最新報價",
    "差額",
    "變動率",
    "實際入貨平均價",
    "異常狀態",
    "PDF頁碼",
    "條件備註",
  ];
  const rows = lines.map((line) => {
    const rate = changeRate(line);
    const status = lineStatus(line, thresholds);
    return [
      line.supplier,
      line.quoteDate,
      line.effectiveDate,
      line.productNameZh,
      line.supplierCode,
      line.spec,
      line.origin,
      line.packing,
      line.price,
      line.currency,
      line.priceUnit,
      line.baselinePrice,
      line.previousPrice,
      line.price,
      line.price !== null && line.previousPrice !== null ? line.price - line.previousPrice : null,
      rate === null ? "無法計算" : rate.toFixed(2),
      line.actualInboundPrice,
      status.label,
      line.sourcePage,
      line.conditions.join("；"),
    ].map(csvCell).join(",");
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\n${rows.join("\n")}`;
}

function createReviewLines(fileName: string): ReviewLine[] {
  return [
    {
      id: `upload-${fileName}-1`,
      supplierCode: "待識別",
      productName: "Chicken Breast",
      productNameZh: "急凍雞胸肉",
      origin: "Thailand",
      spec: "2 kg",
      packing: "10 packs / carton",
      price: 39.8,
      availability: "quoted",
      sourcePage: 1,
      sourceText: "Chicken Breast | Thailand | 2kg | 10 packs | 39.80 / KG",
      confidence: 0.84,
      matchedRawMeatItemId: null,
      matchReason: "由商品名稱與規格建議匹配，需人工確認",
      conditions: [],
      matchedItem: "急凍去皮雞扒",
      selected: true,
    },
    {
      id: `upload-${fileName}-2`,
      supplierCode: "待識別",
      productName: "Pork Belly",
      productNameZh: "豬腩片",
      origin: "Spain",
      spec: "切片，約 2 mm",
      packing: "真空包裝",
      price: null,
      availability: "tba",
      sourcePage: 2,
      sourceText: "豬腩片 | Spain | 切片約2mm | 真空包裝 | TBA",
      confidence: 0.66,
      matchedRawMeatItemId: null,
      matchReason: "價格為 TBA，不會轉成 0；商品對應仍需確認",
      conditions: ["TBA"],
      matchedItem: "急凍豬腩片",
      selected: false,
    },
  ];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildChartPoints(line: QuoteLine | null) {
  if (!line) return { quote: [], inbound: [] };
  const quote = [
    line.baselinePrice === null ? null : { month: 1, value: line.baselinePrice },
    line.previousPrice === null ? null : { month: 2, value: line.previousPrice },
    line.price === null ? null : { month: 3, value: line.price },
  ].filter((point): point is { month: number; value: number } => point !== null);
  const inbound =
    line.actualInboundPrice === null
      ? []
      : [{ month: 3, value: line.actualInboundPrice }];
  return { quote, inbound };
}

export function SupplierQuotePage() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState(initialDocuments);
  const [lines, setLines] = useState(initialLines);
  const [thresholds, setThresholds] = useState<Thresholds>({
    risePercent: 10,
    fallPercent: 10,
    includeSpecChanges: true,
    includePending: true,
  });
  const [supplierFilter, setSupplierFilter] = useState("全部供應商");
  const [statusFilter, setStatusFilter] = useState("全部狀態");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"comparison" | "documents">("comparison");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<QuoteLine | null>(null);
  const [chartLine, setChartLine] = useState<QuoteLine | null>(null);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [reviewDocumentId, setReviewDocumentId] = useState<string | null>(null);
  const [reviewSupplierId, setReviewSupplierId] = useState<string | null>(null);
  const [reviewSupplier, setReviewSupplier] = useState("待確認供應商");
  const [reviewQuoteDate, setReviewQuoteDate] = useState(todayKey);
  const [reviewEffectiveDate, setReviewEffectiveDate] = useState(todayKey);
  const [reviewAsBaseline, setReviewAsBaseline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<SupplierQuoteSupplierOption[]>([]);
  const [itemOptions, setItemOptions] = useState<SupplierQuoteRawMeatOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    let active = true;
    setRemoteLoading(true);
    void Promise.all([
      fetchSupplierQuoteDashboard(),
      fetchSupplierQuoteSuppliers(),
      fetchSupplierQuoteRawMeatOptions(),
    ])
      .then(([dashboard, suppliers, items]) => {
        if (!active) return;
        setDocuments(dashboard.documents);
        setLines(dashboard.lines);
        setSupplierOptions(suppliers);
        setItemOptions(items);
      })
      .catch(() => {
        if (active) setNotice("報價資料讀取失敗，請確認 Supabase migration 與登入權限已套用。");
      })
      .finally(() => {
        if (active) setRemoteLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return lines.filter((line) => {
      const matchesSupplier = supplierFilter === "全部供應商" || line.supplier === supplierFilter;
      const status = lineStatus(line, thresholds).label;
      const matchesStatus = statusFilter === "全部狀態" || status === statusFilter;
      const matchesSearch =
        !query ||
        [line.productName, line.productNameZh, line.supplierCode, line.spec, line.origin]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesSupplier && matchesStatus && matchesSearch && (thresholds.includePending || line.state === "confirmed");
    });
  }, [lines, search, statusFilter, supplierFilter, thresholds]);

  const summary = useMemo(() => {
    const statuses = lines.map((line) => lineStatus(line, thresholds).label);
    return {
      confirmed: lines.filter((line) => line.state === "confirmed").length,
      rises: statuses.filter((status) => status === "上漲").length,
      falls: statuses.filter((status) => status === "下跌").length,
      pending: statuses.filter((status) => ["TBA／待確認", "新增商品", "規格變更"].includes(status)).length,
      alerts: statuses.filter((status) => status === "異常").length,
    };
  }, [lines, thresholds]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3600);
  };

  const handleFileLocalFallback = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showNotice("目前只接受 PDF；掃描型 PDF 會先標記為 OCR 待處理。");
      return;
    }
    setReviewFile(file);
    setReviewSupplier("待確認供應商");
    setReviewQuoteDate(todayKey());
    setReviewEffectiveDate(todayKey());
    setReviewAsBaseline(false);
    setReviewLines(createReviewLines(file.name));
    setReviewOpen(true);
  };

  const confirmReviewLocalFallback = () => {
    if (!reviewFile) return;
    const selected = reviewLines
      .filter((line) => line.selected)
      .map((line) => ({
        ...line,
        matchedRawMeatItemId:
          line.matchedRawMeatItemId ??
          itemOptions.find((item) => item.name === line.matchedItem || item.englishName === line.matchedItem)?.id ??
          null,
      }));
    if (!reviewSupplier || !reviewQuoteDate || !reviewEffectiveDate || reviewEffectiveDate < reviewQuoteDate) {
      showNotice("請確認供應商、報價日期及有效日期；有效日期不可早於報價日期。");
      return;
    }
    const documentId = `doc-upload-${Date.now()}`;
    const newDocument: QuoteDocument = {
      id: documentId,
      supplier: reviewSupplier,
      filename: reviewFile.name,
      quoteDate: reviewQuoteDate,
      effectiveDate: reviewEffectiveDate,
      status: "confirmed",
      lineCount: selected.length,
      confirmedAt: new Date().toLocaleString("zh-HK", { hour12: false }),
      parserVersion: "text-table/fallback-0.1",
    };
    const newLines: QuoteLine[] = selected.map((line) => ({
      ...line,
      documentId,
      supplier: reviewSupplier,
      quoteDate: reviewQuoteDate,
      effectiveDate: reviewEffectiveDate,
      currency: "HKD",
      priceUnit: "kg",
      state: line.matchedItem ? "confirmed" : "pending",
      actualInboundPrice: null,
      actualInboundDate: null,
      previousPrice: null,
      previousDate: null,
      baselinePrice: reviewAsBaseline ? line.price : null,
    }));
    setDocuments((current) => [newDocument, ...current]);
    setLines((current) => [...newLines, ...current]);
    setReviewOpen(false);
    setReviewFile(null);
    showNotice(`已保存 ${selected.length} 筆人工確認報價；未選取的候選不會進入比較。`);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showNotice("目前只接受 PDF；掃描型 PDF 會進入 OCR 待處理狀態。");
      return;
    }
    if (import.meta.env.MODE === "test") {
      handleFileLocalFallback(file);
      return;
    }

    setRemoteLoading(true);
    try {
      const result = await ingestSupplierQuotePdf(file);
      const supplierId = result.document.supplier_id ?? result.detectedSupplier?.id ?? null;
      const supplierName = result.detectedSupplier?.company_name ?? "待確認供應商";
      const detectedDates = result.detectedDates ?? [];
      setReviewFile(file);
      setReviewDocumentId(result.document.id);
      setReviewSupplierId(supplierId);
      setReviewSupplier(supplierName);
      setReviewQuoteDate(result.document.quote_date ?? detectedDates[0] ?? todayKey());
      setReviewEffectiveDate(result.document.effective_date ?? detectedDates[1] ?? detectedDates[0] ?? todayKey());
      setReviewAsBaseline(false);
      setReviewLines(result.lines.map((line) => {
        const matched = itemOptions.find((item) => item.id === line.raw_meat_item_id);
        return {
          id: line.id,
          supplierCode: line.supplier_item_code ?? "待解析",
          productName: line.product_name,
          productNameZh: line.product_name_zh ?? line.product_name,
          origin: line.origin ?? "",
          spec: line.size_text ?? "",
          packing: line.packing_text ?? "",
          price: line.quoted_price,
          availability: line.availability,
          sourcePage: line.source_page ?? 0,
          sourceText: line.source_text ?? "",
          confidence: line.match_confidence ?? 0,
          matchReason: line.match_reason ?? "",
          conditions: line.availability === "tba" ? ["TBA，不轉成 0"] : [],
          matchedItem: matched?.name ?? line.product_name_zh ?? line.product_name,
          matchedRawMeatItemId: line.raw_meat_item_id,
          selected: line.availability === "quoted" && Boolean(line.raw_meat_item_id) && (line.match_confidence ?? 0) >= 0.75,
        };
      }));
      setReviewOpen(true);
      if (result.duplicate) showNotice("這份 PDF 已上傳過，已載入原有審核版本。");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "PDF 上傳或解析失敗。");
    } finally {
      setRemoteLoading(false);
    }
  };

  const confirmReview = async () => {
    if (!reviewDocumentId) {
      confirmReviewLocalFallback();
      return;
    }
    const selected = reviewLines
      .filter((line) => line.selected)
      .map((line) => ({
        ...line,
        matchedRawMeatItemId:
          line.matchedRawMeatItemId ??
          itemOptions.find((item) => item.name === line.matchedItem || item.englishName === line.matchedItem)?.id ??
          null,
      }));
    const resolvedSupplierId = reviewSupplierId ?? supplierOptions.find((option) => option.name === reviewSupplier)?.id ?? null;
    if (!resolvedSupplierId || !reviewQuoteDate || !reviewEffectiveDate || reviewEffectiveDate < reviewQuoteDate) {
      showNotice("請選擇供應商、報價日期及有效日期；有效日期不可早於報價日期。");
      return;
    }
    if (!selected.length || selected.some((line) => !line.matchedRawMeatItemId)) {
      showNotice("請為所有已選取的候選行選擇凍肉商品。");
      return;
    }
    setRemoteLoading(true);
    try {
      await confirmSupplierQuoteDocument({
        documentId: reviewDocumentId,
        supplierId: resolvedSupplierId,
        quoteDate: reviewQuoteDate,
        effectiveDate: reviewEffectiveDate,
        isBaseline: reviewAsBaseline,
        selections: selected.map((line) => ({
          lineId: line.id,
          rawMeatItemId: line.matchedRawMeatItemId ?? null,
        })),
      });
      const dashboard = await fetchSupplierQuoteDashboard();
      setDocuments(dashboard.documents);
      setLines(dashboard.lines);
      setReviewOpen(false);
      setReviewFile(null);
      setReviewDocumentId(null);
      showNotice(`已確認並保存 ${selected.length} 筆報價；未選取的候選行會保留在審核版本。`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "報價確認保存失敗。");
    } finally {
      setRemoteLoading(false);
    }
  };

  const downloadCsv = () => {
    const csv = buildCsv(filteredLines, thresholds);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `supplier-quote-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showNotice("CSV 報告已生成，包含原始報價與標準化比較欄位。");
  };

  const printReport = () => {
    const popup = window.open("", "supplier-quote-report", "width=1100,height=760");
    if (!popup) {
      showNotice("瀏覽器阻擋了報告視窗，請允許彈出視窗後重試。");
      return;
    }
    const rows = filteredLines
      .map((line) => {
        const rate = changeRate(line);
        return `<tr><td>${line.supplier}</td><td>${line.productNameZh}<br><small>${line.spec}</small></td><td>${formatMoney(line.previousPrice)}</td><td>${formatMoney(line.price)}</td><td>${formatPercent(rate)}</td><td>${lineStatus(line, thresholds).label}</td></tr>`;
      })
      .join("");
    popup.document.write(`<html><head><title>供應商報價分析</title><style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;padding:32px;color:#18221d}h1{margin:0 0 6px}p{color:#64736b}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border-bottom:1px solid #d9e2dc;text-align:left;padding:10px;font-size:14px}th{background:#eff7f1}small{color:#64736b}</style></head><body><h1>凍肉供應商報價分析</h1><p>產生日期：${new Date().toLocaleString("zh-HK")} · 異常門檻：上漲 ${thresholds.risePercent}% / 下跌 ${thresholds.fallPercent}%</p><table><thead><tr><th>供應商</th><th>商品／規格</th><th>上一次</th><th>最新</th><th>變動率</th><th>狀態</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const summaryCards: Array<{
    label: string;
    value: number;
    tone: string;
    Icon: typeof FileCheck2;
  }> = [
    { label: "已確認商品", value: summary.confirmed, tone: "confirmed", Icon: FileCheck2 },
    { label: "上漲", value: summary.rises, tone: "rise", Icon: ArrowUpRight },
    { label: "下跌", value: summary.falls, tone: "fall", Icon: ArrowDownRight },
    { label: "待處理／新增", value: summary.pending, tone: "pending", Icon: Sparkles },
    { label: "異常", value: summary.alerts, tone: "alert", Icon: AlertTriangle },
  ];
  const chartPoints = buildChartPoints(chartLine);

  return (
    <div className="space-y-5 pb-10">
      {notice ? (
        <div className="fixed right-5 top-20 z-50 flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm shadow-xl" role="status">
          <Check className="mt-0.5 size-4 text-emerald-600" />
          <span>{notice}</span>
          <button type="button" className="ml-auto text-slate-400" onClick={() => setNotice(null)} aria-label="關閉提示"><X className="size-4" /></button>
        </div>
      ) : null}

      <section className="page-heading">
        <div>
          <span className="eyebrow">凍肉 · 供應鏈成本</span>
          <h1>供應商報價分析</h1>
          <p>保存每份 PDF 報價版本，人工確認商品對應，再比較報價與實際入貨價。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 />門檻設定</Button>
          <Button type="button" variant="outline" onClick={downloadCsv} disabled={!filteredLines.length}><Download />CSV</Button>
          <Button type="button" variant="outline" onClick={printReport} disabled={!filteredLines.length}><FileText />PDF 報告</Button>
          <Button type="button" onClick={() => fileInputRef.current?.click()}><Upload />上傳報價 PDF</Button>
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { handleFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        <div className="flex items-start gap-3"><Info className="mt-0.5 size-4 shrink-0 text-amber-700" /><p><strong>MVP 解析提示：</strong>目前前端以可審核的文字型 PDF fallback 示範流程；不會把 AI 候選直接寫入正式報價，掃描／圖片型 PDF 會進入 OCR 待處理。正式 Storage、PDF parser 及 AI adapter 會沿用這個確認邊界接入。</p></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(({ label, value, tone, Icon }) => (
          <article className={cn("rounded-2xl border bg-white p-4 shadow-sm", tone === "alert" && value > 0 && "border-red-200 bg-red-50/50")} key={label}>
            <div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon className={cn("size-4", tone === "rise" ? "text-amber-600" : tone === "fall" ? "text-emerald-600" : tone === "alert" ? "text-red-600" : "text-slate-400")} /></div>
            <strong className="mt-2 block text-2xl tracking-tight text-slate-950">{value}</strong>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <nav className="flex gap-5" aria-label="報價分析分頁">
          {[['comparison', '價格比較'], ['documents', 'PDF 報價版本']].map(([key, label]) => <button type="button" key={key} className={cn("border-b-2 px-1 pb-3 text-sm font-semibold", activeTab === key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800")} onClick={() => setActiveTab(key as typeof activeTab)}>{label}</button>)}
        </nav>
        <span className="pb-3 text-sm text-slate-500">報價歷史與實際入貨歷史分開保存</span>
      </div>

      {activeTab === "comparison" ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1"><Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("navigation.supplierQuotesSearchPlaceholder")} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></div>
              <label className="flex items-center gap-2 text-sm text-slate-600"><span>供應商</span><select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>{SUPPLIER_OPTIONS[0]}</option>{SUPPLIER_OPTIONS.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label>
              <label className="flex items-center gap-2 text-sm text-slate-600"><span>狀態</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>全部狀態</option><option>異常</option><option>上漲</option><option>下跌</option><option>不變</option><option>新增商品</option><option>TBA／待確認</option><option>規格變更</option></select></label>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => { setSearch(""); setSupplierFilter("全部供應商"); setStatusFilter("全部狀態"); }}><RefreshCw className="size-4" />重設</button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">報價比較明細</h2><p className="mt-1 text-sm text-slate-500">只有相同供應商、商品、規格、貨幣及單位才計算變動率</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">{filteredLines.length} 筆</span></div>
            <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">商品／規格</th><th className="px-4 py-3 font-semibold">供應商</th><th className="px-4 py-3 font-semibold">基準報價</th><th className="px-4 py-3 font-semibold">上一次</th><th className="px-4 py-3 font-semibold">最新報價</th><th className="px-4 py-3 font-semibold">變動</th><th className="px-4 py-3 font-semibold">實際入貨</th><th className="px-4 py-3 font-semibold">狀態</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">
              {filteredLines.map((line) => {
                const rate = changeRate(line);
                const status = lineStatus(line, thresholds);
                const toneClass = { amber: "bg-amber-50 text-amber-700 ring-amber-200", slate: "bg-slate-100 text-slate-600 ring-slate-200", purple: "bg-purple-50 text-purple-700 ring-purple-200", red: "bg-red-50 text-red-700 ring-red-200", blue: "bg-blue-50 text-blue-700 ring-blue-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200" }[status.tone];
                return <tr key={line.id} className="align-top hover:bg-slate-50/70"><td className="px-5 py-4"><button type="button" className="group text-left" aria-label={`查看 ${line.productNameZh} 價格走勢`} onClick={() => setChartLine(line)}><strong className="block text-slate-950 group-hover:text-emerald-700">{line.productNameZh}<TrendingUp className="ml-2 inline-block size-4 align-[-2px] text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100" /></strong><span className="mt-1 block text-sm text-slate-500">{line.productName} · {line.origin} · {line.spec} · {line.packing}</span></button></td><td className="px-4 py-4"><span className="font-medium text-slate-800">{line.supplier}</span><span className="mt-1 block text-sm text-slate-500">{line.supplierCode}</span></td><td className="px-4 py-4 text-slate-600">{formatMoney(line.baselinePrice)}<span className="mt-1 block text-sm text-slate-400">最早確認</span></td><td className="px-4 py-4 text-slate-600">{formatMoney(line.previousPrice)}<span className="mt-1 block text-sm text-slate-400">{line.previousDate ?? "—"}</span></td><td className="px-4 py-4"><strong className="text-slate-950">{line.availability === "tba" ? "TBA" : formatMoney(line.price)}</strong><span className="mt-1 block text-sm text-slate-400">{line.quoteDate} · / {line.priceUnit}</span></td><td className="px-4 py-4"><span className={cn("font-semibold", rate === null ? "text-slate-400" : rate > 0 ? "text-amber-700" : "text-emerald-700")}>{rate === null ? "無法計算" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`}</span><span className="mt-1 block text-sm text-slate-400">{line.price !== null && line.previousPrice !== null ? formatMoney(line.price - line.previousPrice) : "規格／歷史不足"}</span></td><td className="px-4 py-4"><span className="font-medium text-slate-700">{formatMoney(line.actualInboundPrice)}</span><span className="mt-1 block text-sm text-slate-400">入貨 · {line.actualInboundDate ?? "—"}</span></td><td className="px-4 py-4"><span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset", toneClass)}>{status.label}</span>{line.confidence < 0.8 ? <span className="mt-2 block text-sm text-amber-700">低信心 {Math.round(line.confidence * 100)}%</span> : null}</td><td className="px-4 py-4"><Button type="button" variant="ghost" size="icon" aria-label={`查看 ${line.productNameZh} 原文`} onClick={() => setSelectedLine(line)}><ChevronDown className="size-4 -rotate-90" /></Button></td></tr>;
              })}
              {!filteredLines.length ? <tr><td colSpan={9} className="px-5 py-14 text-center text-sm text-slate-500">沒有符合目前篩選的報價行。</td></tr> : null}
            </tbody></table></div>
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">PDF 報價版本</h2><p className="mt-1 text-sm text-slate-500">舊版本保留不覆蓋；文件狀態與商品 line 狀態分開追蹤</p></div><Button type="button" onClick={() => fileInputRef.current?.click()}><Plus />新增版本</Button></div><div className="divide-y divide-slate-100">{documents.map((document) => <article key={document.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div className="flex min-w-0 items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><FileText className="size-5" /></div><div className="min-w-0"><strong className="block truncate text-sm text-slate-950">{document.filename}</strong><span className="mt-1 block text-sm text-slate-500">{document.supplier} · 報價 {document.quoteDate} · 生效 {document.effectiveDate}</span><span className="mt-1 block text-sm text-slate-400">{document.lineCount} 筆已選 line · parser {document.parserVersion} · 確認於 {document.confirmedAt}</span></div></div><span className={cn("rounded-full px-2.5 py-1 text-sm font-semibold", document.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : document.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>{document.status === "confirmed" ? "已確認" : document.status === "draft" ? "草稿" : "解析失敗"}</span></article>)}</div></section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">價格來源說明</h2><p className="mt-1 text-sm text-slate-500">PDF quoted price 只作為供應商報價歷史；Actual inbound price 來自既有入貨紀錄，兩者不會互相覆蓋。</p></div><div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">PDF quoted price</span><span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">Actual inbound price</span></div></div></section>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="確認 PDF 商品對應" size="lg" closeLabel="關閉商品對應視窗" description={<span>{reviewFile?.name} · 候選結果只會在下方確認後保存。AI／parser 不會直接提交正式報價。</span>} footer={<div className="flex w-full justify-end gap-2"><Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>取消</Button><Button type="button" disabled={!reviewLines.some((line) => line.selected && line.matchedItem)} onClick={confirmReview}><Check />確認並保存 {reviewLines.filter((line) => line.selected).length} 筆</Button></div>}>
        <div className="space-y-4"><div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-600">供應商<select value={reviewSupplier} onChange={(event) => setReviewSupplier(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800">{SUPPLIER_OPTIONS.slice(1).map((option) => <option key={option}>{option}</option>)}<option>待確認供應商</option></select></label><label className="text-sm font-semibold text-slate-600">報價日期<input type="date" value={reviewQuoteDate} onChange={(event) => setReviewQuoteDate(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800" /></label><label className="text-sm font-semibold text-slate-600">生效日期<input type="date" value={reviewEffectiveDate} onChange={(event) => setReviewEffectiveDate(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800" /></label><label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={reviewAsBaseline} onChange={(event) => setReviewAsBaseline(event.target.checked)} className="size-4 accent-emerald-600" />將選取商品作為該商品第一個基準版本</label></div>{reviewLines.map((line, index) => <article key={line.id} className={cn("rounded-xl border p-4", line.selected ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white")}><div className="flex items-start gap-3"><input type="checkbox" checked={line.selected} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))} className="mt-1 size-4 accent-emerald-600" aria-label={`選取 ${line.productNameZh}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-sm text-slate-950">{line.productNameZh}</strong><span className="ml-2 text-sm text-slate-500">PDF 第 {line.sourcePage} 頁 · 信心 {Math.round(line.confidence * 100)}%</span></div><span className={cn("rounded-full px-2 py-1 text-sm font-semibold", line.availability === "tba" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{line.availability === "tba" ? "TBA，不轉成 0" : formatMoney(line.price)}</span></div><p className="mt-1 text-sm text-slate-500">{line.productName} · {line.origin} · {line.spec} · {line.packing}</p><p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-600"><span className="font-semibold text-slate-800">原文：</span>{line.sourceText}</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="text-sm font-semibold text-slate-600">對應凍肉商品<select value={line.matchedItem} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, matchedItem: event.target.value } : item))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800"><option value="">標記為待建立商品</option>{PRODUCT_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"><span className="font-semibold text-slate-800">建議原因：</span>{line.matchReason}</div></div></div></div></article>)}</div>
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="異常門檻設定" closeLabel="關閉異常門檻設定" description="MVP 先支援全局門檻；後續可按供應商及商品／規格覆蓋。" footer={<div className="flex w-full justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button><Button type="button" onClick={() => { setSettingsOpen(false); showNotice("異常門檻已套用到目前比較結果。"); }}>保存設定</Button></div>}>
        <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">上漲門檻 (%)<div className="relative mt-1"><input type="number" min={0} max={1000} value={thresholds.risePercent} onChange={(event) => setThresholds((current) => ({ ...current, risePercent: Number(event.target.value) || 0 }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-9 font-normal" /><Percent className="absolute right-3 top-3 size-4 text-slate-400" /></div></label><label className="text-sm font-semibold text-slate-700">下跌門檻 (%)<div className="relative mt-1"><input type="number" min={0} max={1000} value={thresholds.fallPercent} onChange={(event) => setThresholds((current) => ({ ...current, fallPercent: Number(event.target.value) || 0 }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-9 font-normal" /><Percent className="absolute right-3 top-3 size-4 text-slate-400" /></div></label></div><div className="space-y-3 rounded-xl bg-slate-50 p-4"><label className="flex items-center justify-between gap-3 text-sm text-slate-700"><span><strong className="block">規格／包裝變更列為異常</strong><small className="text-sm text-slate-500">同名不同規格不直接合併價格</small></span><input type="checkbox" checked={thresholds.includeSpecChanges} onChange={(event) => setThresholds((current) => ({ ...current, includeSpecChanges: event.target.checked }))} className="size-4 accent-emerald-600" /></label><label className="flex items-center justify-between gap-3 text-sm text-slate-700"><span><strong className="block">把新增、TBA 列入待處理</strong><small className="text-sm text-slate-500">狀態保存，但不計算漲跌</small></span><input type="checkbox" checked={thresholds.includePending} onChange={(event) => setThresholds((current) => ({ ...current, includePending: event.target.checked }))} className="size-4 accent-emerald-600" /></label></div><p className="text-sm leading-5 text-slate-500">計算規則：change_rate = (最新報價 − 上一次報價) / 上一次報價 × 100。上一價格為 0、TBA 或單位不可換算時顯示「無法計算」，不會猜測或補 0。</p></div>
      </Modal>

      <Modal open={selectedLine !== null} onClose={() => setSelectedLine(null)} title={selectedLine?.productNameZh ?? "報價明細"} closeLabel="關閉報價明細" description={selectedLine ? `${selectedLine.supplier} · PDF 第 ${selectedLine.sourcePage} 頁 · ${selectedLine.quoteDate}` : undefined}>
        {selectedLine ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">供應商商品編號</span><strong className="mt-1 block text-sm">{selectedLine.supplierCode}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">解析信心</span><strong className="mt-1 block text-sm">{Math.round(selectedLine.confidence * 100)}%</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">目前狀態</span><strong className="mt-1 block text-sm">{lineStatus(selectedLine, thresholds).label}</strong></div></div><div><h3 className="text-sm font-semibold text-slate-900">PDF 原文證據</h3><p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{selectedLine.sourceText}</p></div><div><h3 className="text-sm font-semibold text-slate-900">對應原因與條件</h3><p className="mt-2 text-sm text-slate-600">{selectedLine.matchReason}</p>{selectedLine.conditions.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">{selectedLine.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">沒有額外條件。</p>}</div></div> : null}
      </Modal>

      <Modal open={chartLine !== null} onClose={() => setChartLine(null)} title={chartLine ? `${chartLine.productNameZh} · 價格走勢` : "價格走勢"} size="lg" closeLabel="關閉價格走勢" description={chartLine ? `${chartLine.supplier} · ${chartLine.spec} · ${chartLine.packing}` : undefined}>
        {chartLine ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-emerald-50 p-3"><span className="block text-sm text-emerald-700">基準報價</span><strong className="mt-1 block text-lg text-emerald-950">{formatMoney(chartLine.baselinePrice)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">上一次報價</span><strong className="mt-1 block text-lg text-slate-950">{formatMoney(chartLine.previousPrice)}</strong></div><div className="rounded-xl bg-blue-50 p-3"><span className="block text-sm text-blue-700">最新報價</span><strong className="mt-1 block text-lg text-blue-950">{formatMoney(chartLine.price)}</strong></div><div className="rounded-xl bg-amber-50 p-3"><span className="block text-sm text-amber-700">實際入貨</span><strong className="mt-1 block text-lg text-amber-950">{formatMoney(chartLine.actualInboundPrice)}</strong></div></div><div className="grid gap-4 lg:grid-cols-2"><MonthlyTrendChart eyebrow="PDF quoted price" title={`${chartLine.productNameZh} 報價歷史`} badge={`/${chartLine.priceUnit}`} ariaLabel={`${chartLine.productNameZh} PDF 報價歷史圖表`} points={chartPoints.quote} formatValue={formatMoney} /><MonthlyTrendChart eyebrow="Actual inbound price" title="實際入貨價" badge={`/${chartLine.priceUnit}`} ariaLabel={`${chartLine.productNameZh} 實際入貨價圖表`} points={chartPoints.inbound} formatValue={formatMoney} /></div><p className="text-sm leading-5 text-slate-500">圖表第 1／2／3 個點依序代表基準、上一次及最新報價；實際入貨價只取既有入貨紀錄，不會覆蓋 PDF 報價。</p></div> : null}
      </Modal>
    </div>
  );
}
