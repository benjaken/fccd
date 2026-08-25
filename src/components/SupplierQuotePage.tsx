import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
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
import { SupplierQuotePdfPreview } from "@/components/SupplierQuotePdfPreview";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { SidePanel } from "@/components/ui/side-panel";
import { DICT_TYPE, dictItemLabel, useDictItems } from "@/lib/dictionaries";
import { normalizeSupplierQuotePrice } from "@/lib/supplier-quote-price";
import { evaluateQuoteAlert } from "@/lib/supplier-quotes";
import {
  confirmSupplierQuoteDocument,
  createSupplierFromQuoteReview,
  fetchSupplierQuoteDashboard,
  fetchSupplierQuotePdfPreview,
  fetchSupplierQuoteRawMeatOptions,
  fetchSupplierQuoteReviewDocument,
  fetchSupplierQuoteSuppliers,
  ingestSupplierQuotePdf,
  retrySupplierQuoteDocument,
  type SupplierQuoteEvidence,
  type SupplierQuoteExtraction,
  type SupplierQuoteSourceCandidate,
  type SupplierQuoteIngestResult,
  type SupplierQuoteRawMeatOption,
  type SupplierQuoteSupplierOption,
} from "@/lib/supplier-quote-api";
import { cn } from "@/lib/utils";

type Availability = "quoted" | "tba" | "unavailable";
type LineState = "confirmed" | "pending" | "skipped" | "variant";
type DocumentState = "confirmed" | "draft" | "uploading" | "processing" | "review" | "ocr_required" | "parse_failed";
type UploadProgress = {
  fileName: string;
  percent: number;
  label: string;
  status: "active" | "success" | "error";
  stage: "upload" | "review" | "saving" | "done";
};

const NEW_SUPPLIER_OPTION_ID = "__new_supplier__";

function isSupplierPlaceholder(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase().replace(/[.\s_-]+/g, "");
  return !normalized || ["na", "n/a", "unknown", "unknownsupplier", "未知", "不詳", "待確認供應商"].includes(normalized);
}

function supplierNameParts(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase()
    .replace(/有限公司|有限責任公司|有限责任公司|股份有限公司/g, " ")
    .replace(/\b(?:limited|ltd|company|corporation|corp|co)\b\.?/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  return {
    latin: new Set(normalized.match(/[a-z0-9]{2,}/g) ?? []),
    han: normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [],
    compact: normalized.replace(/\s+/g, ""),
  };
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  return [...left].filter((item) => right.has(item)).length / Math.min(left.size, right.size);
}

function hanBigramScore(left: string[], right: string[]) {
  const bigrams = (values: string[]) => new Set(values.flatMap((value) => [...value].slice(0, -1).map((char, index) => char + [...value][index + 1])));
  const a = bigrams(left); const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  return (2 * [...a].filter((item) => b.has(item)).length) / (a.size + b.size);
}

export function findSimilarSupplierOptions(name: string, options: SupplierQuoteSupplierOption[]) {
  const proposed = supplierNameParts(name);
  return options.map((option) => {
    const existing = supplierNameParts(option.name);
    const latin = overlapRatio(proposed.latin, existing.latin);
    const han = hanBigramScore(proposed.han, existing.han);
    const contains = proposed.compact.length >= 4 && existing.compact.length >= 4
      && (proposed.compact.includes(existing.compact) || existing.compact.includes(proposed.compact));
    const score = Math.max(contains ? 0.86 : 0, han * 0.65 + latin * 0.35,
      latin === 1 && [...proposed.latin].some((token) => token.length >= 4 && existing.latin.has(token)) ? 0.72 : 0);
    return { option, score };
  }).filter((match) => match.score >= 0.55)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

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
  errorCode?: string | null;
  errorSummary?: string | null;
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
  priceUnit: string;
  sourcePriceUnitLabel?: string | null;
  comparablePricePerKg?: number | null;
  containerPrice?: number | null;
  conversionIssue?: string | null;
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
  previousComparablePricePerKg?: number | null;
  previousDate: string | null;
  baselinePrice: number | null;
  baselineComparablePricePerKg?: number | null;
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
> & {
  matchedItem: string;
  matchedRawMeatItemId?: string | null;
  selected: boolean;
  priceUnit: string | null;
  normalizedSpecFingerprint: string;
  rawFields: Record<string, string | null>;
  validationErrors: string[];
  validationWarnings: string[];
  newItemRequested: boolean;
  evidence: SupplierQuoteEvidence[];
};

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
  {
    id: "doc-review-demo",
    supplier: "待確認供應商",
    filename: "review-pending.pdf",
    quoteDate: "",
    effectiveDate: "",
    status: "review",
    lineCount: 2,
    confirmedAt: "",
    parserVersion: "pdf-layout/1.0",
  },
  {
    id: "doc-ocr-demo",
    supplier: "待確認供應商",
    filename: "scanned-price-list.pdf",
    quoteDate: "",
    effectiveDate: "",
    status: "ocr_required",
    lineCount: 0,
    confirmedAt: "",
    parserVersion: "pdf-layout/1.0",
  },
  {
    id: "doc-failed-demo",
    supplier: "待確認供應商",
    filename: "retryable-price-list.pdf",
    quoteDate: "",
    effectiveDate: "",
    status: "parse_failed",
    lineCount: 0,
    confirmedAt: "",
    parserVersion: "pdf-layout/1.0",
    errorSummary: "解析服务暂时未能完成，请稍后重试",
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

function latestComparisonPrice(line: QuoteLine) {
  if (line.comparablePricePerKg !== undefined) return line.comparablePricePerKg;
  return line.priceUnit === "kg" ? line.price : null;
}

function previousComparisonPrice(line: QuoteLine) {
  if (line.previousComparablePricePerKg !== undefined) return line.previousComparablePricePerKg;
  return line.priceUnit === "kg" ? line.previousPrice : null;
}

function baselineComparisonPrice(line: QuoteLine) {
  if (line.baselineComparablePricePerKg !== undefined) return line.baselineComparablePricePerKg;
  return line.priceUnit === "kg" ? line.baselinePrice : null;
}

function changeRate(line: QuoteLine) {
  const latest = latestComparisonPrice(line);
  const previous = previousComparisonPrice(line);
  if (latest === null || previous === null || previous === 0) {
    return null;
  }
  return ((latest - previous) / previous) * 100;
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
      previousPrice: previousComparisonPrice(line),
      latestPrice: latestComparisonPrice(line),
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
  if (line.conversionIssue) return { label: "單位待確認", tone: "amber" };
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
    "PDF 原始價格單位",
    "折算整箱價格",
    "基準報價每公斤",
    "上一次報價每公斤",
    "最新報價每公斤",
    "每公斤差額",
    "變動率",
    "實際入貨平均價",
    "異常狀態",
    "PDF頁碼",
    "條件備註",
  ];
  const rows = lines.map((line) => {
    const rate = changeRate(line);
    const status = lineStatus(line, thresholds);
    const latestComparable = latestComparisonPrice(line);
    const previousComparable = previousComparisonPrice(line);
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
      line.sourcePriceUnitLabel ?? line.priceUnit,
      line.containerPrice ?? null,
      baselineComparisonPrice(line),
      previousComparable,
      latestComparable,
      latestComparable !== null && previousComparable !== null ? latestComparable - previousComparable : null,
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
      matchedRawMeatItemId: "fixture-existing-chicken-item",
      matchReason: "由商品名稱與規格建議匹配，需人工確認",
      conditions: [],
      matchedItem: "急凍去皮雞扒",
      selected: true,
      priceUnit: "kg",
      normalizedSpecFingerprint: "chicken breast|2 kg|kg",
      rawFields: { product: "Chicken Breast", price: "39.80 / KG" },
      validationErrors: [],
      validationWarnings: [],
      newItemRequested: false,
      evidence: [{ page: 1, blockId: "fixture-b1", cellIds: ["fixture-c1"], field: "record", text: "Chicken Breast | Thailand | 2kg | 10 packs | 39.80 / KG" }],
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
      priceUnit: null,
      normalizedSpecFingerprint: "pork belly|2 mm|vacuum",
      rawFields: { product: "Pork Belly", price: "TBA" },
      validationErrors: [],
      validationWarnings: ["price_unit_requires_review"],
      newItemRequested: false,
      evidence: [{ page: 1, blockId: "fixture-b2", cellIds: ["fixture-c2"], field: "record", text: "Pork Belly | 2mm | vacuum | TBA" }],
    },
  ];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function initialReviewDates(
  candidates: SupplierQuoteSourceCandidate[],
  documentQuoteDate: string | null,
  documentEffectiveDate: string | null,
) {
  const uniqueDates = [...new Set(candidates.map((candidate) => candidate.value))];
  const conflict = uniqueDates.length > 1;
  return {
    conflict,
    quoteDate: documentQuoteDate ?? (conflict ? "" : uniqueDates[0] ?? ""),
    effectiveDate: documentEffectiveDate ?? (conflict ? "" : uniqueDates[1] ?? uniqueDates[0] ?? ""),
  };
}

function documentStatusMeta(status: DocumentState) {
  return {
    uploading: { label: "上傳中", className: "bg-blue-50 text-blue-700" },
    processing: { label: "識別中", className: "bg-blue-50 text-blue-700" },
    review: { label: "待確認", className: "bg-amber-50 text-amber-700" },
    draft: { label: "草稿", className: "bg-slate-100 text-slate-700" },
    ocr_required: { label: "需 OCR", className: "bg-purple-50 text-purple-700" },
    parse_failed: { label: "識別失敗", className: "bg-red-50 text-red-700" },
    confirmed: { label: "已確認", className: "bg-emerald-50 text-emerald-700" },
  }[status];
}

function buildChartPoints(line: QuoteLine | null) {
  if (!line) return { quote: [], inbound: [] };
  const quote = [
    baselineComparisonPrice(line) === null ? null : { month: 1, value: baselineComparisonPrice(line)! },
    previousComparisonPrice(line) === null ? null : { month: 2, value: previousComparisonPrice(line)! },
    latestComparisonPrice(line) === null ? null : { month: 3, value: latestComparisonPrice(line)! },
  ].filter((point): point is { month: number; value: number } => point !== null);
  const inbound =
    line.actualInboundPrice === null
      ? []
      : [{ month: 3, value: line.actualInboundPrice }];
  return { quote, inbound };
}

export function initialSupplierQuoteDashboard(mode: string) {
  return mode === "test"
    ? { documents: initialDocuments, lines: initialLines }
    : { documents: [] as QuoteDocument[], lines: [] as QuoteLine[] };
}

export function preferredSupplierQuoteTab(dashboard: { documents: QuoteDocument[]; lines: QuoteLine[] }) {
  return dashboard.documents.length > 0 && dashboard.lines.length === 0 ? "documents" as const : "comparison" as const;
}

export function reviewLinesFromIngestResult(result: SupplierQuoteIngestResult, itemOptions: SupplierQuoteRawMeatOption[]): ReviewLine[] {
  return result.lines.map((line) => {
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
      priceUnit: line.price_unit ?? null,
      normalizedSpecFingerprint: line.normalized_spec_fingerprint ?? "",
      rawFields: line.raw_fields ?? {},
      validationErrors: line.validation_errors ?? [],
      validationWarnings: line.validation_warnings ?? [],
      newItemRequested: line.new_item_requested ?? false,
      evidence: line.evidence ?? [],
      selected: line.availability === "quoted" && Boolean(line.raw_meat_item_id)
        && (line.match_confidence ?? 0) >= 0.9 && (line.match_reason ?? "").includes("alias")
        && !(line.validation_errors?.length) && !(line.validation_warnings?.length),
    };
  });
}

export function SupplierQuotePage({
  canUpload = true,
  canReview = true,
  canExport = true,
  canConfigure = true,
}: {
  canUpload?: boolean;
  canReview?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const priceUnitDictionary = useDictItems(DICT_TYPE.supplierQuotePriceUnit);
  const initialDashboard = initialSupplierQuoteDashboard(import.meta.env.MODE);
  const [documents, setDocuments] = useState(initialDashboard.documents);
  const [lines, setLines] = useState(initialDashboard.lines);
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
  const [reviewNewSupplierName, setReviewNewSupplierName] = useState<string | null>(null);
  const [supplierSimilarityPrompt, setSupplierSimilarityPrompt] = useState<{
    proposedName: string;
    matches: ReturnType<typeof findSimilarSupplierOptions>;
  } | null>(null);
  const [reviewQuoteDate, setReviewQuoteDate] = useState(todayKey);
  const [reviewEffectiveDate, setReviewEffectiveDate] = useState(todayKey);
  const [reviewAsBaseline, setReviewAsBaseline] = useState(false);
  const [reviewIdentityConfirmed, setReviewIdentityConfirmed] = useState(false);
  const [showUnmatchedReviewLines, setShowUnmatchedReviewLines] = useState(false);
  const [reviewDateCandidates, setReviewDateCandidates] = useState<SupplierQuoteSourceCandidate[]>([]);
  const [reviewSupplierCandidates, setReviewSupplierCandidates] = useState<SupplierQuoteSourceCandidate[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<SupplierQuoteSupplierOption[]>([]);
  const [itemOptions, setItemOptions] = useState<SupplierQuoteRawMeatOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(import.meta.env.MODE !== "test");
  const [dashboardLoading, setDashboardLoading] = useState(import.meta.env.MODE !== "test");
  const [openingReviewDocumentId, setOpeningReviewDocumentId] = useState<string | null>(null);
  const [recognizingDocumentId, setRecognizingDocumentId] = useState<string | null>(null);
  const [reviewPdfSource, setReviewPdfSource] = useState<string | File | null>(null);
  const [reviewPdfPending, setReviewPdfPending] = useState(false);
  const [reviewExtraction, setReviewExtraction] = useState<SupplierQuoteExtraction | null>(null);
  const [activeReviewLineId, setActiveReviewLineId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewListRef = useRef<HTMLDivElement>(null);
  const uploadProgressResetRef = useRef<number | null>(null);
  const supplierFilterOptions = supplierOptions.length
    ? supplierOptions.map((option) => option.name)
    : [...new Set(lines.map((line) => line.supplier).filter(Boolean))];

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    let active = true;
    setRemoteLoading(true);
    setDashboardLoading(true);
    void Promise.all([
      fetchSupplierQuoteDashboard(),
      fetchSupplierQuoteSuppliers(),
      fetchSupplierQuoteRawMeatOptions(),
    ])
      .then(([dashboard, suppliers, items]) => {
        if (!active) return;
        setDocuments(dashboard.documents);
        setLines(dashboard.lines);
        setActiveTab(preferredSupplierQuoteTab(dashboard));
        setSupplierOptions(suppliers);
        setItemOptions(items);
      })
      .catch(() => {
        if (active) setNotice("報價資料讀取失敗，請確認 Supabase migration 與登入權限已套用。");
      })
      .finally(() => {
        if (active) {
          setRemoteLoading(false);
          setDashboardLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!reviewOpen || !reviewDocumentId || import.meta.env.MODE === "test") return;
    let active = true;
    if (!reviewPdfSource) setReviewPdfPending(true);
    void fetchSupplierQuotePdfPreview(reviewDocumentId).then((preview) => {
      if (!active) return;
      setReviewPdfSource(preview.pdfUrl);
      setReviewExtraction(preview.extraction);
    }).catch(() => {
      if (active) showNotice("原 PDF 預覽暫時無法載入；商品審核資料仍可繼續處理。");
    }).finally(() => {
      if (active) setReviewPdfPending(false);
    });
    return () => { active = false; };
  }, [reviewDocumentId, reviewOpen]);

  useEffect(() => {
    if (!reviewOpen) return;
    const root = reviewListRef.current;
    if (!root) return;
    let frame = 0;
    const updateActiveLine = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rootTop = root.getBoundingClientRect().top;
        const candidates = [...root.querySelectorAll<HTMLElement>("[data-review-line-id]")];
        const nearest = candidates.sort((left, right) =>
          Math.abs(left.getBoundingClientRect().top - rootTop - 16) - Math.abs(right.getBoundingClientRect().top - rootTop - 16))[0];
        if (nearest?.dataset.reviewLineId) setActiveReviewLineId(nearest.dataset.reviewLineId);
      });
    };
    updateActiveLine();
    root.addEventListener("scroll", updateActiveLine, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      root.removeEventListener("scroll", updateActiveLine);
    };
  }, [reviewLines, reviewOpen, showUnmatchedReviewLines]);

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
      pending: statuses.filter((status) => ["TBA／待確認", "新增商品", "規格變更", "單位待確認"].includes(status)).length,
      alerts: statuses.filter((status) => status === "異常").length,
    };
  }, [lines, thresholds]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3600);
  };

  const stageNewSupplier = (name: string) => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    setReviewSupplier(cleanName);
    setReviewSupplierId(null);
    setReviewNewSupplierName(cleanName);
    setReviewIdentityConfirmed(false);
    const matches = findSimilarSupplierOptions(cleanName, supplierOptions);
    setSupplierSimilarityPrompt(matches.length ? { proposedName: cleanName, matches } : null);
  };

  const beginUploadProgress = (file: File) => {
    if (uploadProgressResetRef.current !== null) window.clearTimeout(uploadProgressResetRef.current);
    uploadProgressResetRef.current = null;
    setUploadProgress({ fileName: file.name, percent: 8, label: "正在檢查 PDF 檔案", status: "active", stage: "upload" });
  };

  const finishUploadProgress = (file: File | string, status: UploadProgress["status"], label: string) => {
    const fileName = typeof file === "string" ? file : file.name;
    setUploadProgress({ fileName, percent: 100, label, status, stage: "done" });
    uploadProgressResetRef.current = window.setTimeout(() => {
      setUploadProgress(null);
      uploadProgressResetRef.current = null;
    }, status === "success" ? 1800 : 5000);
  };

  const handleFileLocalFallback = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showNotice("目前只接受 PDF；掃描型 PDF 會先標記為 OCR 待處理。");
      return;
    }
    setReviewFile(file);
    setReviewPdfSource(file.size ? file : null);
    setReviewPdfPending(false);
    setReviewExtraction(null);
    setActiveReviewLineId(null);
    setReviewSupplier("待確認供應商");
    setReviewSupplierId(null);
    setReviewNewSupplierName(null);
    setSupplierSimilarityPrompt(null);
    setReviewQuoteDate(todayKey());
    setReviewEffectiveDate(todayKey());
    setReviewAsBaseline(false);
    setReviewIdentityConfirmed(false);
    setShowUnmatchedReviewLines(false);
    setReviewDateCandidates([]);
    setReviewSupplierCandidates([]);
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
    setUploadProgress({ fileName: reviewFile.name, percent: 96, label: "正在保存審核結果", status: "active", stage: "saving" });
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
      priceUnit: line.priceUnit ?? "kg",
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
    finishUploadProgress(reviewFile, "success", "審核完成，報價已保存");
    showNotice(`已保存 ${selected.length} 筆人工確認報價；未選取的候選不會進入比較。`);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showNotice("目前只接受 PDF；掃描型 PDF 會進入 OCR 待處理狀態。");
      return;
    }
    beginUploadProgress(file);
    if (import.meta.env.MODE === "test") {
      handleFileLocalFallback(file);
      setUploadProgress({ fileName: file.name, percent: 72, label: "識別完成，等待人工審核", status: "active", stage: "review" });
      return;
    }

    setRemoteLoading(true);
    setUploadProgress({ fileName: file.name, percent: 16, label: "正在安全上傳 PDF", status: "active", stage: "upload" });
    const progressTimer = window.setInterval(() => {
      setUploadProgress((current) => {
        if (!current || current.status !== "active") return current;
        const percent = Math.min(current.percent + (current.percent < 42 ? 5 : 2), 70);
        const label = percent < 34
          ? "正在安全上傳 PDF"
          : percent < 52 ? "正在提取文字與表格" : "正在等待 AI 識別報價內容";
        return { ...current, percent, label };
      });
    }, 700);
    try {
      const result = await ingestSupplierQuotePdf(file);
      setUploadProgress({ fileName: file.name, percent: 71, label: "正在準備審核結果", status: "active", stage: "upload" });
      const supplierId = result.document.supplier_id ?? result.detectedSupplier?.id ?? null;
      const detectedSupplierName = result.detectedSupplier?.company_name
        ?? supplierOptions.find((option) => option.id === supplierId)?.name
        ?? "待確認供應商";
      const supplierName = isSupplierPlaceholder(detectedSupplierName) ? "待確認供應商" : detectedSupplierName;
      const detectedDates = (result.detectedDates ?? []).map((entry) => typeof entry === "string"
        ? { value: entry, sourceType: "content" as const, sourcePage: null, sourceText: entry, confidence: 0.5 }
        : entry);
      const detectedSuppliers = result.document.detected_suppliers ?? [];
      const proposedSupplierName = supplierId ? null : detectedSuppliers
        .find((candidate) => candidate.isNew && !isSupplierPlaceholder(candidate.value))?.value ?? null;
      const initialDates = initialReviewDates(detectedDates, result.document.quote_date, result.document.effective_date);
      setReviewFile(file);
      setReviewPdfSource(file);
      setReviewPdfPending(false);
      setReviewExtraction(null);
      setActiveReviewLineId(null);
      setReviewDocumentId(result.document.id);
      setReviewSupplierId(supplierId);
      if (proposedSupplierName) stageNewSupplier(proposedSupplierName);
      else {
        setReviewSupplier(supplierName);
        setReviewNewSupplierName(null);
        setSupplierSimilarityPrompt(null);
      }
      setReviewQuoteDate(initialDates.quoteDate);
      setReviewEffectiveDate(initialDates.effectiveDate);
      setReviewAsBaseline(false);
      setReviewIdentityConfirmed(false);
      setShowUnmatchedReviewLines(false);
      setReviewDateCandidates(detectedDates);
      setReviewSupplierCandidates(detectedSuppliers);
      setReviewLines(reviewLinesFromIngestResult(result, itemOptions));
      if (result.document.status === "ocr_required") {
        showNotice("這份 PDF 沒有可抽取文字，已標記為需 OCR；本期不會產生虛構候選。");
        finishUploadProgress(file, "success", "PDF 已完成檢查，等待 OCR 處理");
      } else if (result.document.status === "parse_failed") {
        showNotice(result.document.last_error_summary ?? "识别失败，可在 PDF 报价版本中重试。");
        finishUploadProgress(file, "error", "PDF 識別失敗，可在版本列表重試");
      } else {
        setReviewOpen(true);
        setUploadProgress({ fileName: file.name, percent: 72, label: "識別完成，等待人工審核", status: "active", stage: "review" });
      }
      if (result.duplicate) showNotice("這份 PDF 已上傳過，已載入原有審核版本。");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "PDF 上傳或解析失敗。");
      finishUploadProgress(file, "error", "上傳或識別失敗，請稍後重試");
    } finally {
      window.clearInterval(progressTimer);
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
    let resolvedSupplierId = reviewSupplierId ?? supplierOptions.find((option) => option.name === reviewSupplier)?.id ?? null;
    if (!reviewIdentityConfirmed || (!resolvedSupplierId && !reviewNewSupplierName) || !reviewQuoteDate || !reviewEffectiveDate || reviewEffectiveDate < reviewQuoteDate) {
      showNotice("請選擇供應商、報價日期及有效日期；有效日期不可早於報價日期。");
      return;
    }
    if (!selected.length || selected.some((line) => line.validationErrors.length > 0 || !line.normalizedSpecFingerprint
      || !line.priceUnit || (!line.matchedRawMeatItemId && !line.newItemRequested))) {
      showNotice("請處理所有已選行的驗證錯誤，並完成商品、variant 與價格單位對應。");
      return;
    }
    const progressFileName = reviewFile?.name ?? uploadProgress?.fileName ?? "PDF 報價";
    setRemoteLoading(true);
    setUploadProgress({ fileName: progressFileName, percent: 96, label: "正在保存審核結果", status: "active", stage: "saving" });
    try {
      if (!resolvedSupplierId && reviewNewSupplierName) {
        const createdSupplier = await createSupplierFromQuoteReview(reviewNewSupplierName);
        resolvedSupplierId = createdSupplier.id;
        setReviewSupplierId(createdSupplier.id);
        setReviewNewSupplierName(null);
        setSupplierOptions((current) => current.some((option) => option.id === createdSupplier.id)
          ? current : [...current, createdSupplier].sort((left, right) => left.name.localeCompare(right.name)));
      }
      if (!resolvedSupplierId) throw new Error("supplier_required");
      await confirmSupplierQuoteDocument({
        documentId: reviewDocumentId,
        supplierId: resolvedSupplierId,
        quoteDate: reviewQuoteDate,
        effectiveDate: reviewEffectiveDate,
        isBaseline: reviewAsBaseline,
        selections: selected.map((line) => ({
          lineId: line.id,
          rawMeatItemId: line.matchedRawMeatItemId ?? null,
          normalizedSpecFingerprint: line.normalizedSpecFingerprint,
          priceUnit: line.priceUnit!,
          newItemRequested: line.newItemRequested,
        })),
      });
      const dashboard = await fetchSupplierQuoteDashboard();
      setDocuments(dashboard.documents);
      setLines(dashboard.lines);
      setReviewOpen(false);
      setReviewFile(null);
      setReviewDocumentId(null);
      finishUploadProgress(progressFileName, "success", "審核完成，報價已保存");
      showNotice(`已確認並保存 ${selected.length} 筆報價；未選取的候選行會保留在審核版本。`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "報價確認保存失敗。");
      setUploadProgress({ fileName: progressFileName, percent: 95, label: "審核保存失敗，請修正後重試", status: "error", stage: "review" });
    } finally {
      setRemoteLoading(false);
    }
  };

  const handleRetryDocument = async (document: QuoteDocument) => {
    if (import.meta.env.MODE === "test") {
      setUploadProgress({ fileName: document.filename, percent: 100, label: "重新識別完成", status: "success", stage: "done" });
      return;
    }
    setRemoteLoading(true);
    setRecognizingDocumentId(document.id);
    setUploadProgress({ fileName: document.filename, percent: 18, label: "正在讀取已保存的 PDF", status: "active", stage: "upload" });
    const progressTimer = window.setInterval(() => setUploadProgress((current) => current?.status === "active"
      ? { ...current, percent: Math.min(88, current.percent + 4), label: current.percent < 48 ? "正在重新提取文字與表格" : "正在等待 AI 重新識別" }
      : current), 700);
    try {
      const result = await retrySupplierQuoteDocument(document.id, undefined, (run) => {
        const completed = Number(run.stage_stats?.completedChunks ?? 0);
        const total = Number(run.stage_stats?.chunkCount ?? 0);
        const pageFrom = Number(run.stage_stats?.pageFrom ?? 0);
        const pageTo = Number(run.stage_stats?.pageTo ?? 0);
        if (run.current_stage === "recognition" && total > 0) {
          setUploadProgress({ fileName: document.filename,
            percent: 48 + Math.round(40 * completed / total),
            label: `AI 分段識別 ${completed}/${total}${pageFrom && pageTo ? ` · 第 ${pageFrom}–${pageTo} 頁` : ""}`,
            status: "active", stage: "upload" });
        }
      });
      const dashboard = await fetchSupplierQuoteDashboard();
      setDocuments(dashboard.documents);
      setLines(dashboard.lines);
      finishUploadProgress(document.filename, "success", "重新識別完成，可進入審核");
      showNotice(result.document.status === "review" ? "重新識別完成，已產生新的隔離候選。" : "重試已建立並完成記錄。");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "重試失敗，請稍後再試。");
      finishUploadProgress(document.filename, "error", "重新識別失敗，請稍後再試");
    } finally {
      window.clearInterval(progressTimer);
      setRemoteLoading(false);
      setRecognizingDocumentId(null);
    }
  };

  const handleOpenReviewDocument = async (document: QuoteDocument) => {
    const file = new File([], document.filename, { type: "application/pdf" });
    if (import.meta.env.MODE === "test") {
      handleFileLocalFallback(file);
      setReviewDocumentId(document.id);
      setReviewPdfSource(null);
      setReviewPdfPending(true);
      setReviewExtraction(null);
      setActiveReviewLineId(null);
      setUploadProgress({ fileName: document.filename, percent: 72, label: "已載入候選，等待人工審核", status: "active", stage: "review" });
      return;
    }
    setRemoteLoading(true);
    setOpeningReviewDocumentId(document.id);
    try {
      const result = await fetchSupplierQuoteReviewDocument(document.id);
      const supplierId = result.document.supplier_id ?? null;
      const detectedDates = (result.detectedDates ?? []).map((entry) => typeof entry === "string"
        ? { value: entry, sourceType: "content" as const, sourcePage: null, sourceText: entry, confidence: 0.5 }
        : entry);
      const detectedSuppliers = result.document.detected_suppliers ?? [];
      const proposedSupplierName = supplierId ? null : detectedSuppliers
        .find((candidate) => candidate.isNew && !isSupplierPlaceholder(candidate.value))?.value ?? null;
      const supplierName = supplierOptions.find((option) => option.id === supplierId)?.name ?? "待確認供應商";
      const initialDates = initialReviewDates(detectedDates, result.document.quote_date, result.document.effective_date);
      setReviewFile(file);
      setReviewPdfSource(null);
      setReviewPdfPending(true);
      setReviewExtraction(null);
      setActiveReviewLineId(null);
      setReviewDocumentId(document.id);
      setReviewSupplierId(supplierId);
      if (proposedSupplierName) stageNewSupplier(proposedSupplierName);
      else {
        setReviewSupplier(supplierName);
        setReviewNewSupplierName(null);
        setSupplierSimilarityPrompt(null);
      }
      setReviewQuoteDate(initialDates.quoteDate);
      setReviewEffectiveDate(initialDates.effectiveDate);
      setReviewAsBaseline(false);
      setReviewIdentityConfirmed(false);
      setShowUnmatchedReviewLines(false);
      setReviewDateCandidates(detectedDates);
      setReviewSupplierCandidates(detectedSuppliers);
      setReviewLines(reviewLinesFromIngestResult(result, itemOptions));
      setReviewOpen(true);
      setUploadProgress({ fileName: document.filename, percent: 72, label: "已載入候選，等待人工審核", status: "active", stage: "review" });
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "無法載入這份 PDF 的審核候選。");
    } finally {
      setRemoteLoading(false);
      setOpeningReviewDocumentId(null);
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
        return `<tr><td>${line.supplier}</td><td>${line.productNameZh}<br><small>${line.spec}</small></td><td>${formatMoney(previousComparisonPrice(line))} / kg</td><td>${formatMoney(latestComparisonPrice(line))} / kg<br><small>PDF 原價 ${formatMoney(line.price)} / ${line.sourcePriceUnitLabel ?? line.priceUnit}</small></td><td>${formatPercent(rate)}</td><td>${lineStatus(line, thresholds).label}</td></tr>`;
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
  const reviewReadyLines = reviewLines.filter((line) => !line.selected || (
    !line.validationErrors.length && Boolean(line.normalizedSpecFingerprint) && Boolean(line.priceUnit)
    && Boolean(line.matchedItem || line.newItemRequested)
  )).length;
  const reviewTotalSteps = reviewLines.length + 1;
  const reviewCompletedSteps = reviewReadyLines + Number(reviewIdentityConfirmed);
  const reviewPercent = 72 + Math.round(23 * reviewCompletedSteps / Math.max(1, reviewTotalSteps));
  const hiddenUnmatchedReviewCount = reviewLines.filter((line) => !line.matchedRawMeatItemId).length;
  const visibleReviewLineEntries = reviewLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => showUnmatchedReviewLines || Boolean(line.matchedRawMeatItemId));
  const activeReviewLine = reviewLines.find((line) => line.id === activeReviewLineId)
    ?? visibleReviewLineEntries[0]?.line ?? null;
  const displayedUploadProgress = uploadProgress?.stage === "review" && uploadProgress.status === "active"
    ? { ...uploadProgress, percent: reviewPercent,
      label: `人工審核中：${reviewCompletedSteps}/${reviewTotalSteps} 個步驟已完成` }
    : uploadProgress;
  const closeReview = () => {
    if (remoteLoading) return;
    setReviewOpen(false);
    setSupplierSimilarityPrompt(null);
    setUploadProgress(null);
    setReviewPdfSource(null);
    setReviewPdfPending(false);
    setReviewExtraction(null);
    setActiveReviewLineId(null);
  };
  const closeProgress = () => {
    if (displayedUploadProgress?.status === "active") return;
    setUploadProgress(null);
  };

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
          {canConfigure ? <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 />門檻設定</Button> : null}
          {canExport ? <Button type="button" variant="outline" onClick={downloadCsv} disabled={!filteredLines.length}><Download />CSV</Button> : null}
          {canExport ? <Button type="button" variant="outline" onClick={printReport} disabled={!filteredLines.length}><FileText />PDF 報告</Button> : null}
          {canUpload ? <Button type="button" disabled={displayedUploadProgress?.status === "active"} onClick={() => fileInputRef.current?.click()}>
            {displayedUploadProgress?.status === "active" ? <RefreshCw className="animate-spin" /> : <Upload />}
            {displayedUploadProgress?.status === "active" ? `處理中 ${displayedUploadProgress.percent}%` : "上傳報價 PDF"}
          </Button> : null}
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={displayedUploadProgress?.status === "active"} onChange={(event) => { handleFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        <div className="flex items-start gap-3"><Info className="mt-0.5 size-4 shrink-0 text-amber-700" /><p><strong>解析提示：</strong>文字型 PDF 會安全上傳並進入表格及 AI 識別；候選結果只會在人工確認後保存。掃描／圖片型 PDF 會標記為 OCR 待處理，不會虛構候選。</p></div>
      </section>

      {dashboardLoading ? <section className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status" aria-live="polite"><RefreshCw className="size-4 animate-spin" /><span><strong>正在讀取資料庫報價</strong>，完成前不會顯示示例或舊資料。</span></section> : null}

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
              <label className="flex items-center gap-2 text-sm text-slate-600"><span>供應商</span><select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>全部供應商</option>{supplierFilterOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label className="flex items-center gap-2 text-sm text-slate-600"><span>狀態</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>全部狀態</option><option>異常</option><option>上漲</option><option>下跌</option><option>不變</option><option>新增商品</option><option>TBA／待確認</option><option>單位待確認</option><option>規格變更</option></select></label>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => { setSearch(""); setSupplierFilter("全部供應商"); setStatusFilter("全部狀態"); }}><RefreshCw className="size-4" />重設</button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">報價比較明細</h2><p className="mt-1 text-sm text-slate-500">PDF 原始單價會保留；報價與實際入貨價統一折算為每公斤後才計算變動。</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">{filteredLines.length} 筆</span></div>
            <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">商品／規格</th><th className="px-4 py-3 font-semibold">供應商</th><th className="px-4 py-3 font-semibold">基準報價</th><th className="px-4 py-3 font-semibold">上一次</th><th className="px-4 py-3 font-semibold">最新報價</th><th className="px-4 py-3 font-semibold">變動</th><th className="px-4 py-3 font-semibold">實際入貨</th><th className="px-4 py-3 font-semibold">狀態</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">
              {filteredLines.map((line) => {
                const rate = changeRate(line);
                const status = lineStatus(line, thresholds);
                const latestComparable = latestComparisonPrice(line);
                const previousComparable = previousComparisonPrice(line);
                const toneClass = { amber: "bg-amber-50 text-amber-700 ring-amber-200", slate: "bg-slate-100 text-slate-600 ring-slate-200", purple: "bg-purple-50 text-purple-700 ring-purple-200", red: "bg-red-50 text-red-700 ring-red-200", blue: "bg-blue-50 text-blue-700 ring-blue-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200" }[status.tone];
                return <tr key={line.id} className="align-top hover:bg-slate-50/70"><td className="px-5 py-4"><button type="button" className="group text-left" aria-label={`查看 ${line.productNameZh} 價格走勢`} onClick={() => setChartLine(line)}><strong className="block text-slate-950 group-hover:text-emerald-700">{line.productNameZh}<TrendingUp className="ml-2 inline-block size-4 align-[-2px] text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100" /></strong><span className="mt-1 block text-sm text-slate-500">{line.productName} · {line.origin} · {line.spec} · {line.packing}</span></button></td><td className="px-4 py-4"><span className="font-medium text-slate-800">{line.supplier}</span><span className="mt-1 block text-sm text-slate-500">{line.supplierCode}</span></td><td className="px-4 py-4 text-slate-600">{formatMoney(baselineComparisonPrice(line))}<span className="mt-1 block text-sm text-slate-400">每公斤 · 最早確認</span></td><td className="px-4 py-4 text-slate-600">{formatMoney(previousComparable)}<span className="mt-1 block text-sm text-slate-400">每公斤 · {line.previousDate ?? "—"}</span></td><td className="px-4 py-4"><strong className="text-slate-950">{line.availability === "tba" ? "TBA" : formatMoney(latestComparable)}</strong><span className="mt-1 block text-sm text-slate-400">{latestComparable === null ? "未能折算每公斤" : `${line.quoteDate} · / kg`}</span>{line.price !== null ? <span className="mt-1 block text-sm font-medium text-blue-700">PDF 原價 {formatMoney(line.price)} / {line.sourcePriceUnitLabel ?? line.priceUnit}{line.containerPrice !== null && line.containerPrice !== undefined && line.containerPrice !== line.price ? ` · 整箱 ${formatMoney(line.containerPrice)}` : ""}</span> : null}</td><td className="px-4 py-4"><span className={cn("font-semibold", rate === null ? "text-slate-400" : rate > 0 ? "text-amber-700" : "text-emerald-700")}>{rate === null ? "無法計算" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`}</span><span className="mt-1 block text-sm text-slate-400">{latestComparable !== null && previousComparable !== null ? `${formatMoney(latestComparable - previousComparable)} / kg` : "單位／歷史不足"}</span></td><td className="px-4 py-4"><span className="font-medium text-slate-700">{formatMoney(line.actualInboundPrice)}</span><span className="mt-1 block text-sm text-slate-400">/ kg · 入貨 {line.actualInboundDate ?? "—"}</span></td><td className="px-4 py-4"><span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset", toneClass)}>{status.label}</span>{line.conversionIssue ? <span className="mt-2 block text-sm text-amber-700">請確認價格單位及每件重量</span> : null}{line.confidence < 0.8 ? <span className="mt-2 block text-sm text-amber-700">低信心 {Math.round(line.confidence * 100)}%</span> : null}</td><td className="px-4 py-4"><Button type="button" variant="ghost" size="icon" aria-label={`查看 ${line.productNameZh} 原文`} onClick={() => setSelectedLine(line)}><ChevronDown className="size-4 -rotate-90" /></Button></td></tr>;
              })}
              {!filteredLines.length ? <tr><td colSpan={9} className="px-5 py-14 text-center text-sm text-slate-500">{dashboardLoading ? <span className="inline-flex items-center gap-2"><RefreshCw className="size-4 animate-spin" />正在讀取已確認報價…</span> : documents.length ? <span><strong className="block text-slate-800">資料庫內有 {documents.length} 份 PDF 版本，但尚未有已審核確認的報價商品。</strong><button type="button" className="mt-3 font-semibold text-emerald-700 underline underline-offset-4" onClick={() => setActiveTab("documents")}>前往 PDF 報價版本完成審核</button></span> : "目前資料庫沒有報價資料，請先上傳供應商 PDF。"}</td></tr> : null}
            </tbody></table></div>
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><h2 className="font-semibold text-slate-950">PDF 報價版本</h2><p className="mt-1 text-sm text-slate-500">舊版本及已確認 line 永不被重試覆蓋；每次識別均有獨立 parse run。</p></div>
            {canUpload ? <Button type="button" disabled={displayedUploadProgress?.status === "active"} onClick={() => fileInputRef.current?.click()}><Plus />新增版本</Button> : null}
          </div>
          <div className="divide-y divide-slate-100">{documents.map((document) => {
            const meta = documentStatusMeta(document.status);
            return <article key={document.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><FileText className="size-5" /></div><div className="min-w-0"><strong className="block truncate text-sm text-slate-950">{document.filename}</strong><span className="mt-1 block text-sm text-slate-500">{document.supplier} · 報價 {document.quoteDate || "待確認"} · 生效 {document.effectiveDate || "待確認"}</span><span className="mt-1 block text-sm text-slate-400">{document.lineCount} 筆已選 line · parser {document.parserVersion}{document.confirmedAt ? ` · 確認於 ${document.confirmedAt}` : ""}</span>{document.status === "ocr_required" ? <span className="mt-1 block text-sm text-purple-700">PDF 沒有可抽取文字；本期需另行 OCR，不會產生候選。</span> : null}{document.errorSummary ? <span className="mt-1 block text-sm text-red-700">{document.errorSummary}</span> : null}</div></div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-sm font-semibold", meta.className)}>{meta.label}</span>
                {canReview && (document.status === "review" || document.status === "confirmed") ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={remoteLoading}
                    aria-label={`審核 ${document.filename}`}
                    onClick={() => void handleOpenReviewDocument(document)}
                  >
                    {openingReviewDocumentId === document.id ? <RefreshCw className="animate-spin" /> : <FileCheck2 />}
                    {openingReviewDocumentId === document.id ? "載入中" : "審核"}
                  </Button>
                ) : null}
                {canReview && document.status !== "uploading" && document.status !== "processing" ? <Button type="button" variant="outline" disabled={remoteLoading} aria-label={`重新識別 ${document.filename}`} onClick={() => void handleRetryDocument(document)}>{recognizingDocumentId === document.id ? <RefreshCw className="animate-spin" /> : <Sparkles />}{recognizingDocumentId === document.id ? "識別中" : "重新識別"}</Button> : null}
              </div>
            </article>;
          })}</div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">價格來源說明</h2><p className="mt-1 text-sm text-slate-500">PDF quoted price 只作為供應商報價歷史；Actual inbound price 來自既有入貨紀錄，兩者不會互相覆蓋。</p></div><div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">PDF quoted price</span><span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">Actual inbound price</span></div></div></section>

      <Modal open={Boolean(displayedUploadProgress && !reviewOpen)} onClose={closeProgress}
        closeOnBackdrop={displayedUploadProgress?.status !== "active"} closeOnEscape={displayedUploadProgress?.status !== "active"}
        title={displayedUploadProgress?.status === "error" ? "PDF 處理失敗" : displayedUploadProgress?.status === "success" ? "PDF 處理完成" : "正在處理 PDF"}
        size="sm" closeLabel="關閉 PDF 處理進度"
        description={displayedUploadProgress?.fileName}
        footer={displayedUploadProgress?.status !== "active" ? <Button type="button" onClick={closeProgress}>關閉</Button> : undefined}>
        {displayedUploadProgress ? (
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-center gap-3">
              {displayedUploadProgress.status === "active" ? <RefreshCw className="size-6 shrink-0 animate-spin text-blue-600" />
                : displayedUploadProgress.status === "success" ? <FileCheck2 className="size-6 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="size-6 shrink-0 text-red-600" />}
              <div className="min-w-0 flex-1"><strong className="block text-slate-900">{displayedUploadProgress.label}</strong><span className="mt-1 block text-sm text-slate-500">{displayedUploadProgress.status === "active" ? "請勿關閉或重新整理此頁。" : displayedUploadProgress.status === "success" ? "處理已完成，可以關閉此提示。" : "請關閉提示後檢查錯誤並重試。"}</span></div>
              <span className="font-semibold tabular-nums text-slate-700">{displayedUploadProgress.percent}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${displayedUploadProgress.fileName} PDF 處理進度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayedUploadProgress.percent}>
              <div className={cn("h-full rounded-full transition-[width] duration-500",
                displayedUploadProgress.status === "error" ? "bg-red-500" : displayedUploadProgress.status === "success" ? "bg-emerald-500" : "bg-blue-600")}
                style={{ width: `${displayedUploadProgress.percent}%` }} />
            </div>
            {displayedUploadProgress.stage === "upload" ? <p className="text-sm leading-6 text-slate-600">系統會依序完成安全上傳、文字與表格提取及 AI 報價識別；完成後會自動進入人工審核。</p> : null}
          </div>
        ) : null}
      </Modal>

      <SidePanel open={reviewOpen} onClose={closeReview} className="side-panel-majority supplier-quote-review-panel supplier-quote-review-panel-90" title="確認 PDF 商品對應" closeLabel="關閉商品對應側邊欄" description={`${reviewFile?.name ?? "PDF 報價"} · 候選結果只會在人工確認後保存。AI／parser 不會直接提交正式報價。`} footer={<div className="flex w-full justify-end gap-2"><Button type="button" variant="outline" disabled={remoteLoading} onClick={closeReview}>取消</Button><Button type="button" disabled={remoteLoading || !reviewIdentityConfirmed || !reviewLines.some((line) => line.selected && (line.matchedItem || line.newItemRequested) && line.priceUnit && !line.validationErrors.length)} onClick={confirmReview}>{remoteLoading && uploadProgress?.stage === "saving" ? <RefreshCw className="animate-spin" /> : <Check />}{remoteLoading && uploadProgress?.stage === "saving" ? "正在保存審核結果" : `確認並保存 ${reviewLines.filter((line) => line.selected).length} 筆`}</Button></div>}>
        <div className="supplier-quote-review-workspace grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(420px,2fr)]">
          <div ref={reviewListRef} className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {displayedUploadProgress ? (
            <div className={cn("rounded-xl border p-4", displayedUploadProgress.status === "error" ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50")}>
              <div className="flex items-center justify-between gap-3 text-sm"><strong>{displayedUploadProgress.label}</strong><span className="font-semibold tabular-nums">{displayedUploadProgress.percent}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="PDF 上傳、AI 識別及人工審核總進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayedUploadProgress.percent}>
                <div className={cn("h-full rounded-full transition-[width] duration-300", displayedUploadProgress.status === "error" ? "bg-red-500" : "bg-blue-600")} style={{ width: `${displayedUploadProgress.percent}%` }} />
              </div>
              <p className="mt-2 text-sm text-slate-600">完成供應商與日期核對，並處理每個候選商品後即可保存。</p>
            </div>
          ) : null}
          {hiddenUnmatchedReviewCount > 0 ? (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <span><strong className="block text-slate-900">顯示未對應商品</strong><span className="mt-0.5 block text-slate-500">另有 {hiddenUnmatchedReviewCount} 個已識別商品未對應現有凍貨商品，預設不列出。</span></span>
              <input type="checkbox" checked={showUnmatchedReviewLines} onChange={(event) => setShowUnmatchedReviewLines(event.target.checked)} className="size-4 shrink-0 accent-emerald-600" />
            </label>
          ) : null}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>供應商與日期必須由你確認</strong>
            <div className="mt-2 grid gap-2 sm:grid-cols-2"><div>日期來源：{reviewDateCandidates.length ? reviewDateCandidates.map((item) => `${item.value}（${item.sourceType}${item.sourcePage ? `，第 ${item.sourcePage} 頁` : ""}：${item.sourceText}）`).join("；") : "未可靠識別"}</div><div>供應商來源：{reviewSupplierCandidates.length ? reviewSupplierCandidates.map((item) => `${item.sourceText}（${item.sourceType}）`).join("；") : "未可靠識別"}</div></div>
            {new Set(reviewDateCandidates.map((item) => item.value)).size > 1 || new Set(reviewSupplierCandidates.map((item) => item.value)).size > 1 ? <p className="mt-2 font-semibold text-red-700">偵測到來源衝突，請選擇正式值。</p> : null}
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="text-sm font-semibold text-slate-600">
              供應商
              <SearchSelect
                id="supplier-quote-review-supplier"
                label="供應商"
                options={[...supplierOptions,
                  ...(reviewNewSupplierName ? [{ id: NEW_SUPPLIER_OPTION_ID, name: reviewNewSupplierName }] : []),
                  { id: "", name: "待確認供應商" }]}
                value={reviewNewSupplierName ? NEW_SUPPLIER_OPTION_ID : reviewSupplierId ?? ""}
                searchPlaceholder="搜尋供應商名稱或編號"
                emptyLabel="沒有符合的供應商"
                onChange={(option) => {
                  setReviewSupplier(option.name);
                  setReviewSupplierId(option.id && option.id !== NEW_SUPPLIER_OPTION_ID ? option.id : null);
                  setReviewNewSupplierName(option.id === NEW_SUPPLIER_OPTION_ID ? option.name : null);
                  setSupplierSimilarityPrompt(null);
                  setReviewIdentityConfirmed(false);
                }}
                onCreate={(name) => {
                  if (isSupplierPlaceholder(name)) {
                    showNotice("請輸入真實供應商名稱；NA、N/A 或 Unknown 不會建立為供應商。");
                    return;
                  }
                  stageNewSupplier(name);
                }}
              />
              {reviewNewSupplierName ? <span className="mt-1.5 block font-normal text-emerald-700">保存審核時會新增此供應商。</span> : null}
            </div>
            <label className="text-sm font-semibold text-slate-600">報價日期<input type="date" value={reviewQuoteDate} onChange={(event) => { setReviewQuoteDate(event.target.value); setReviewIdentityConfirmed(false); }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800" /></label>
            <label className="text-sm font-semibold text-slate-600">生效日期<input type="date" value={reviewEffectiveDate} onChange={(event) => { setReviewEffectiveDate(event.target.value); setReviewIdentityConfirmed(false); }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800" /></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={reviewAsBaseline} onChange={(event) => setReviewAsBaseline(event.target.checked)} className="size-4 accent-emerald-600" />將選取商品作為該商品第一個基準版本</label>
            <label className="flex items-center gap-2 sm:col-span-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={reviewIdentityConfirmed} onChange={(event) => setReviewIdentityConfirmed(event.target.checked)} className="size-4 accent-emerald-600" />我已核對供應商、報價日期及生效日期</label>
          </div>
          {visibleReviewLineEntries.map(({ line, index }) => {
            const selectedSystemItem = itemOptions.find((option) => option.id === line.matchedRawMeatItemId);
            const normalizedReviewPrice = normalizeSupplierQuotePrice({
              price: line.price, priceUnit: line.priceUnit,
              rawPriceText: line.rawFields.price ?? line.sourceText,
              sizeText: line.spec, packingText: line.packing,
            });
            return <article key={line.id} data-review-line-id={line.id} onMouseEnter={() => setActiveReviewLineId(line.id)} onFocusCapture={() => setActiveReviewLineId(line.id)} className={cn("overflow-hidden rounded-2xl border shadow-sm",
              line.validationErrors.length ? "border-red-300 bg-red-50" : line.selected ? "border-emerald-300 bg-white" : "border-slate-200 bg-white")}>
              <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3",
                line.selected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
                <label className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-950">
                  <input type="checkbox" checked={line.selected} disabled={line.validationErrors.length > 0} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))} className="size-4 shrink-0 accent-emerald-600" aria-label={`選取 ${line.productNameZh}`} />
                  <span className="truncate">審核商品：{line.productNameZh}</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-1 text-sm font-semibold", line.confidence >= 0.8 ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800")}>AI 信心 {Math.round(line.confidence * 100)}%</span>
                  <span className={cn("rounded-full px-2.5 py-1 text-sm font-semibold", line.availability === "tba" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{line.availability === "tba" ? "TBA，不轉成 0" : formatMoney(line.price)}</span>
                </div>
              </div>
              <div className="space-y-4 p-4">
                <section className="rounded-xl border border-blue-200 bg-blue-50/80 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3"><strong className="flex items-center gap-2 text-sm text-blue-900"><FileText className="size-4" />PDF 原文證據</strong><span className="rounded-full bg-white px-2 py-1 text-sm font-medium text-blue-700">第 {line.sourcePage} 頁</span></div>
                  <p className="text-sm font-medium leading-6 text-blue-950">{line.sourceText}</p>
                </section>

                <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]">
                  <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <span className="text-sm font-semibold uppercase tracking-wide text-amber-700">PDF 識別出的凍肉</span>
                    <strong className="mt-2 block text-base text-amber-950">{line.productNameZh || line.productName}</strong>
                    {line.productNameZh && line.productName !== line.productNameZh ? <span className="mt-1 block text-sm text-amber-800">{line.productName}</span> : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-sm">
                      {line.origin ? <span className="rounded-full bg-white px-2.5 py-1 text-amber-900 ring-1 ring-amber-200">產地：{line.origin}</span> : null}
                      {line.spec ? <span className="rounded-full bg-white px-2.5 py-1 text-amber-900 ring-1 ring-amber-200">規格：{line.spec}</span> : null}
                      {line.packing ? <span className="rounded-full bg-white px-2.5 py-1 text-amber-900 ring-1 ring-amber-200">包裝：{line.packing}</span> : null}
                    </div>
                  </section>
                  <div className="hidden items-center justify-center lg:flex"><span className="rounded-full bg-slate-100 p-2 text-slate-500"><ArrowRight className="size-5" /></span></div>
                  <section className={cn("rounded-xl border p-4", selectedSystemItem ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50")}>
                    <div className="flex items-center justify-between gap-2"><span className={cn("text-sm font-semibold uppercase tracking-wide", selectedSystemItem ? "text-emerald-700" : "text-orange-700")}>系統內的凍肉商品</span>{selectedSystemItem ? <span className="rounded-full bg-emerald-600 px-2 py-1 text-sm font-semibold text-white">已對應</span> : <span className="rounded-full bg-orange-500 px-2 py-1 text-sm font-semibold text-white">待選擇</span>}</div>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">選擇對應商品<select value={line.matchedItem} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, matchedItem: event.target.value, matchedRawMeatItemId: itemOptions.find((option) => option.name === event.target.value)?.id ?? null, newItemRequested: false } : item))} className={cn("mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm font-normal text-slate-900", selectedSystemItem ? "border-emerald-300" : "border-orange-300")}><option value="">請選擇</option>{itemOptions.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}</select></label>
                    {selectedSystemItem ? <p className="mt-2 text-sm font-medium text-emerald-800">目前對應：{selectedSystemItem.name}{selectedSystemItem.sku ? ` · ${selectedSystemItem.sku}` : ""}</p> : <p className="mt-2 text-sm text-orange-800">尚未對應系統商品，請選擇或標記為新商品。</p>}
                  </section>
                </div>

                <section className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
                  <span className="rounded-lg bg-violet-600 p-2 text-white"><Sparkles className="size-4" /></span>
                  <div><strong className="block text-sm">AI 對應建議</strong><p className="mt-1 text-sm leading-6 text-violet-900">{line.matchReason || "沒有可靠建議，請人工選擇系統商品。"}</p></div>
                </section>

                {line.validationErrors.length ? <p className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">錯誤：{line.validationErrors.join("；")}</p> : null}{line.validationWarnings.length ? <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">警告：{line.validationWarnings.join("；")}</p> : null}
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-600">價格單位<select value={line.priceUnit ?? ""} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priceUnit: event.target.value || null } : item))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal"><option value="">請選擇</option>{line.priceUnit && !priceUnitDictionary.items.some((item) => item.value === line.priceUnit) ? <option value={line.priceUnit}>{line.priceUnit}</option> : null}{priceUnitDictionary.items.map((item) => <option key={item.value} value={item.value}>{dictItemLabel(item, i18n.language)}</option>)}</select></label>
                  <label className="text-sm font-semibold text-slate-600">規格 fingerprint<input value={line.normalizedSpecFingerprint} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, normalizedSpecFingerprint: event.target.value } : item))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-sm font-normal" /></label>
                  <div className={cn("rounded-lg border px-3 py-2 text-sm sm:col-span-2", normalizedReviewPrice.comparablePricePerKg === null ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}><strong>統一比較價格：</strong>{normalizedReviewPrice.comparablePricePerKg === null ? "尚未能折算；請確認價格單位及每件重量。" : `${formatMoney(normalizedReviewPrice.comparablePricePerKg)} / kg`}{normalizedReviewPrice.containerPrice !== null && normalizedReviewPrice.containerPrice !== line.price ? <span className="ml-2">· 整箱 {formatMoney(normalizedReviewPrice.containerPrice)}</span> : null}</div>
                  <label className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 sm:col-span-2"><input type="checkbox" checked={line.newItemRequested} onChange={(event) => setReviewLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, newItemRequested: event.target.checked, matchedItem: event.target.checked ? "" : item.matchedItem, matchedRawMeatItemId: event.target.checked ? null : item.matchedRawMeatItemId } : item))} className="mt-0.5 size-4 accent-emerald-600" /><span>保存時新增到凍貨商品主檔<span className="mt-0.5 block font-normal text-emerald-700">同名商品會自動復用，並記住這個供應商的商品名稱與規格。</span></span></label>
                  <details className="text-sm text-slate-600 sm:col-span-2"><summary className="cursor-pointer font-semibold text-slate-700">查看原始欄位</summary><p className="mt-2 break-words leading-6">{Object.entries(line.rawFields).map(([key, value]) => `${key}: ${value ?? "—"}`).join("；") || "—"}</p></details>
                </div>
              </div>
            </article>;
          })}
          </div>
          <div className="min-h-0 min-w-0 overflow-hidden">
            <SupplierQuotePdfPreview source={reviewPdfSource} sourcePending={reviewPdfPending} extraction={reviewExtraction} activeLine={activeReviewLine} />
          </div>
        </div>
      </SidePanel>

      <Modal
        open={supplierSimilarityPrompt !== null}
        onClose={() => setSupplierSimilarityPrompt(null)}
        closeOnBackdrop={false}
        closeOnEscape={false}
        role="alertdialog"
        title="確認是否為同一家供應商"
        closeLabel="保留為新供應商並關閉確認"
        description={supplierSimilarityPrompt ? <>PDF 識別為「<strong>{supplierSimilarityPrompt.proposedName}</strong>」，系統找到名稱相似的現有供應商。</> : undefined}
        footer={supplierSimilarityPrompt ? <div className="flex w-full flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSupplierSimilarityPrompt(null)}>不是同一家，保留為新供應商</Button></div> : undefined}
      >
        {supplierSimilarityPrompt ? <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>請勿只按名稱直接合併</strong><p className="mt-1 leading-6">請核對公司名稱、供應商資料或報價抬頭。選擇現有供應商後，本次報價會歸入該供應商；選擇保留則會在保存審核時新增。</p></div>
          <div className="space-y-2">
            {supplierSimilarityPrompt.matches.map(({ option, score }) => <button key={option.id} type="button" className="flex w-full items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-100" onClick={() => {
              setReviewSupplier(option.name);
              setReviewSupplierId(option.id);
              setReviewNewSupplierName(null);
              setReviewIdentityConfirmed(false);
              setSupplierSimilarityPrompt(null);
            }}>
              <span><span className="block text-sm font-semibold text-emerald-950">{option.name}</span><span className="mt-1 block text-sm text-emerald-700">確認是同一家，使用現有供應商</span></span>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-emerald-800">名稱相似 {Math.round(score * 100)}%</span>
            </button>)}
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span className="font-semibold">PDF 識別名稱：</span>{supplierSimilarityPrompt.proposedName}</div>
        </div> : null}
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="異常門檻設定" closeLabel="關閉異常門檻設定" description="MVP 先支援全局門檻；後續可按供應商及商品／規格覆蓋。" footer={<div className="flex w-full justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button><Button type="button" onClick={() => { setSettingsOpen(false); showNotice("異常門檻已套用到目前比較結果。"); }}>保存設定</Button></div>}>
        <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">上漲門檻 (%)<div className="relative mt-1"><input type="number" min={0} max={1000} value={thresholds.risePercent} onChange={(event) => setThresholds((current) => ({ ...current, risePercent: Number(event.target.value) || 0 }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-9 font-normal" /><Percent className="absolute right-3 top-3 size-4 text-slate-400" /></div></label><label className="text-sm font-semibold text-slate-700">下跌門檻 (%)<div className="relative mt-1"><input type="number" min={0} max={1000} value={thresholds.fallPercent} onChange={(event) => setThresholds((current) => ({ ...current, fallPercent: Number(event.target.value) || 0 }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-9 font-normal" /><Percent className="absolute right-3 top-3 size-4 text-slate-400" /></div></label></div><div className="space-y-3 rounded-xl bg-slate-50 p-4"><label className="flex items-center justify-between gap-3 text-sm text-slate-700"><span><strong className="block">規格／包裝變更列為異常</strong><small className="text-sm text-slate-500">同名不同規格不直接合併價格</small></span><input type="checkbox" checked={thresholds.includeSpecChanges} onChange={(event) => setThresholds((current) => ({ ...current, includeSpecChanges: event.target.checked }))} className="size-4 accent-emerald-600" /></label><label className="flex items-center justify-between gap-3 text-sm text-slate-700"><span><strong className="block">把新增、TBA 列入待處理</strong><small className="text-sm text-slate-500">狀態保存，但不計算漲跌</small></span><input type="checkbox" checked={thresholds.includePending} onChange={(event) => setThresholds((current) => ({ ...current, includePending: event.target.checked }))} className="size-4 accent-emerald-600" /></label></div><p className="text-sm leading-5 text-slate-500">計算規則：change_rate = (最新報價 − 上一次報價) / 上一次報價 × 100。上一價格為 0、TBA 或單位不可換算時顯示「無法計算」，不會猜測或補 0。</p></div>
      </Modal>

      <Modal open={selectedLine !== null} onClose={() => setSelectedLine(null)} title={selectedLine?.productNameZh ?? "報價明細"} closeLabel="關閉報價明細" description={selectedLine ? `${selectedLine.supplier} · PDF 第 ${selectedLine.sourcePage} 頁 · ${selectedLine.quoteDate}` : undefined}>
        {selectedLine ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">供應商商品編號</span><strong className="mt-1 block text-sm">{selectedLine.supplierCode}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">解析信心</span><strong className="mt-1 block text-sm">{Math.round(selectedLine.confidence * 100)}%</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">目前狀態</span><strong className="mt-1 block text-sm">{lineStatus(selectedLine, thresholds).label}</strong></div></div><div><h3 className="text-sm font-semibold text-slate-900">PDF 原文證據</h3><p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{selectedLine.sourceText}</p></div><div><h3 className="text-sm font-semibold text-slate-900">對應原因與條件</h3><p className="mt-2 text-sm text-slate-600">{selectedLine.matchReason}</p>{selectedLine.conditions.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">{selectedLine.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">沒有額外條件。</p>}</div></div> : null}
      </Modal>

      <Modal open={chartLine !== null} onClose={() => setChartLine(null)} title={chartLine ? `${chartLine.productNameZh} · 價格走勢` : "價格走勢"} size="lg" closeLabel="關閉價格走勢" description={chartLine ? `${chartLine.supplier} · ${chartLine.spec} · ${chartLine.packing}` : undefined}>
        {chartLine ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-emerald-50 p-3"><span className="block text-sm text-emerald-700">基準報價 / kg</span><strong className="mt-1 block text-lg text-emerald-950">{formatMoney(baselineComparisonPrice(chartLine))}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="block text-sm text-slate-500">上一次報價 / kg</span><strong className="mt-1 block text-lg text-slate-950">{formatMoney(previousComparisonPrice(chartLine))}</strong></div><div className="rounded-xl bg-blue-50 p-3"><span className="block text-sm text-blue-700">最新報價 / kg</span><strong className="mt-1 block text-lg text-blue-950">{formatMoney(latestComparisonPrice(chartLine))}</strong><small className="mt-1 block text-blue-700">PDF 原價 {formatMoney(chartLine.price)} / {chartLine.sourcePriceUnitLabel ?? chartLine.priceUnit}</small></div><div className="rounded-xl bg-amber-50 p-3"><span className="block text-sm text-amber-700">實際入貨 / kg</span><strong className="mt-1 block text-lg text-amber-950">{formatMoney(chartLine.actualInboundPrice)}</strong></div></div><div className="grid gap-4 lg:grid-cols-2"><MonthlyTrendChart eyebrow="PDF quoted price" title={`${chartLine.productNameZh} 報價歷史`} badge="/kg" ariaLabel={`${chartLine.productNameZh} PDF 報價歷史圖表`} points={chartPoints.quote} formatValue={formatMoney} /><MonthlyTrendChart eyebrow="Actual inbound price" title="實際入貨價" badge="/kg" ariaLabel={`${chartLine.productNameZh} 實際入貨價圖表`} points={chartPoints.inbound} formatValue={formatMoney} /></div><p className="text-sm leading-5 text-slate-500">PDF 原始單價會保留；圖表與實際入貨價只使用已成功折算的每公斤價格。單位或重量不足時不會猜算。</p></div> : null}
      </Modal>
    </div>
  );
}
