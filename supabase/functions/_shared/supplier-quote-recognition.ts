export const CANDIDATE_SCHEMA_VERSION = "candidate/1";
export const PARSER_VERSION = "pdf-layout/1.6";

export type BoundingBox = { x: number; y: number; width: number; height: number };
export type ExtractionItem = {
  id: string;
  page: number;
  text: string;
  bbox: BoundingBox;
  direction: string;
  readingOrder: number;
};
export type ExtractionPage = { page: number; width: number; height: number; items: ExtractionItem[] };
export type ExtractionIR = { version: "extraction/1"; pages: ExtractionPage[] };
export type LayoutCell = { id: string; text: string; itemIds: string[]; bbox: BoundingBox };
export type LayoutRow = { id: string; page: number; column: number; cells: LayoutCell[]; text: string };
export type LayoutBlock = {
  id: string;
  page: number;
  column: number;
  kind: "table" | "text";
  rows: LayoutRow[];
  text: string;
  coverage: number;
};
export type LayoutIR = { version: "layout/1"; pages: Array<{ page: number; blocks: LayoutBlock[] }> };
export type Evidence = {
  page: number;
  blockId: string;
  cellIds: string[];
  field: string;
  text: string;
};
export type CandidateAvailability = "quoted" | "tba" | "unavailable";
export type QuoteCandidate = {
  schemaVersion: typeof CANDIDATE_SCHEMA_VERSION;
  supplierItemCode: string | null;
  productName: string;
  productNameZh: string | null;
  origin: string | null;
  sizeText: string | null;
  packingText: string | null;
  processingMethod: string | null;
  rawPriceText: string | null;
  quotedPrice: number | null;
  currency: string | null;
  rawPriceUnit: string | null;
  priceUnit: "kg" | "box" | "unit" | "pack" | null;
  availability: CandidateAvailability;
  conditions: string[];
  sourcePage: number;
  sourceText: string;
  sourceBlockId: string;
  rawFields: Record<string, string | null>;
  evidence: Evidence[];
  parserVersion: string;
  profileVersion: number | null;
  modelVersion: string | null;
  normalizedSpecFingerprint: string;
  matchConfidence: number;
  matchReason: string;
  matchBreakdown: Record<string, number | string | boolean>;
  suggestedRawMeatItemId: string | null;
  validationErrors: string[];
  validationWarnings: string[];
};
export type SourceCandidate<T = string> = {
  value: T;
  sourceType: "filename" | "content" | "metadata" | "profile";
  sourcePage: number | null;
  sourceText: string;
  confidence: number;
  isNew?: boolean;
};
export type SupplierProfile = {
  id: string;
  supplierId: string;
  profileVersion: number;
  layoutSignature: string | null;
  isActive: boolean;
  tableMapping: {
    columns?: string[];
    headerAliases?: Record<string, string[]>;
    continuationFields?: string[];
  };
};
export type MatchAlias = {
  supplierId: string;
  rawMeatItemId: string;
  supplierItemCode: string | null;
  supplierProductName: string;
  normalizedSpecFingerprint: string;
  confidence: number;
};
export type MatchItem = { id: string; name: string; englishName?: string | null; sku?: string | null };
export type AiAdapterConfig = {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  provider?: string;
  model?: string;
  timeoutMs: number;
  maxRetries: number;
  maxInputChars: number;
  maxEstimatedCostUsd: number;
  fetchImpl?: typeof fetch;
};

const OPENAI_CANDIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "supplierItemCode", "productName", "productNameZh", "origin", "sizeText",
          "packingText", "processingMethod", "rawPriceText", "quotedPrice", "currency", "rawPriceUnit", "priceUnit",
          "availability", "conditions", "sourcePage", "sourceText", "sourceBlockId", "evidence"],
        properties: {
          schemaVersion: { type: "string", enum: [CANDIDATE_SCHEMA_VERSION] },
          supplierItemCode: { type: ["string", "null"] },
          productName: { type: "string" },
          productNameZh: { type: ["string", "null"] },
          origin: { type: ["string", "null"] },
          sizeText: { type: ["string", "null"] },
          packingText: { type: ["string", "null"] },
          processingMethod: { type: ["string", "null"] },
          rawPriceText: { type: ["string", "null"] },
          quotedPrice: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          rawPriceUnit: { type: ["string", "null"] },
          priceUnit: { type: ["string", "null"], enum: ["kg", "box", "unit", "pack", null] },
          availability: { type: "string", enum: ["quoted", "tba", "unavailable"] },
          conditions: { type: "array", items: { type: "string" } },
          sourcePage: { type: "integer", minimum: 1 },
          sourceText: { type: "string" },
          sourceBlockId: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["page", "blockId", "cellIds", "field", "text"],
              properties: {
                page: { type: "integer", minimum: 1 },
                blockId: { type: "string" },
                cellIds: { type: "array", minItems: 1, items: { type: "string" } },
                field: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function validatePdfUpload(input: { name: string; mimeType: string; size: number; header: string }, maxBytes: number) {
  if (input.size <= 0 || input.size > maxBytes) return "pdf_file_size_invalid";
  if (input.mimeType !== "application/pdf" && !input.name.toLowerCase().endsWith(".pdf")) return "pdf_file_required";
  if (input.header !== "%PDF-") return "pdf_content_invalid";
  return null;
}

export function aggregateDocumentStatus(input: { extractedText: string; candidateCount: number; recoverableError?: boolean }) {
  if (!input.extractedText.trim()) return "ocr_required" as const;
  if (input.recoverableError || input.candidateCount === 0) return "parse_failed" as const;
  return "review" as const;
}

export function preserveConfirmedDocumentStatus(current: string, next: "processing" | "review" | "ocr_required" | "parse_failed") {
  return current === "confirmed" ? "confirmed" as const : next;
}

const PRICE_UNIT_TOKEN = "kg|公斤|box|boxes|case|cases|ctn|carton|cartons|箱|盒|unit|units|pc|pcs|piece|pieces|件|pack|packs|pkg|package|packages|包|bag|bags|bottle|bottles|jar|jars|can|cans|tin|tins|tray|trays|pouch|pouches|squeezer|squeezers|cup|cups|pet|pets";
const PRICE = new RegExp(`(?:(?:HKD|HK\\$|\\$)\\s*([0-9]{1,5}(?:[,.][0-9]{1,4})?)\\s*(?:\\/\\s*)?(${PRICE_UNIT_TOKEN})?|([0-9]{1,5}(?:[,.][0-9]{1,4})?)\\s*\\/\\s*(${PRICE_UNIT_TOKEN}))`, "i");
const MEASURABLE_SIZE = /(?:^|[^\d/])\d+(?:[,.]\d+)?\s*(?:kg|kgs?|kilograms?|g|grams?|lb|lbs?|pounds?|oz|ounces?|公斤|千克|克|磅|安士|斤)\b/i;
const FIELD_LABEL_ONLY = /^(?:item|item\s*no|sku|origin|packing|packaging|price|size|weight|product|貨號|货号|產地|产地|包裝|包装|價格|价格|重量|商品)\s*[:：]?\s*$/i;
const FIELD_LABEL_PREFIX = /^(?:item|item\s*no|sku|origin|packing|packaging|price|size|weight|product|貨號|货号|產地|产地|包裝|包装|價格|价格|重量|商品)\s*[:：]/i;
const SKU_ONLY = /^(?=.*\d)[a-z]{1,6}[-_]?\d[a-z0-9_-]*$/i;
const UNAVAILABLE = /暫缺|缺貨|無貨|無供應|out\s+of\s+stock/i;
const TBA = /\b(?:tba|pending|n\/a)\b|待確認|待定/i;
const CONDITION = /包裝費|附加費|損耗|最低訂購|minimum\s+order|運費|配送|delivery|價格不含/i;

export function normalizeText(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
}

export function buildSpecFingerprint(fields: {
  code?: string | null; name?: string | null; origin?: string | null; size?: string | null;
  packing?: string | null; processing?: string | null; priceUnit?: string | null; conditions?: string[];
}) {
  return [fields.code, fields.name, fields.origin, fields.size, fields.packing, fields.processing,
    fields.priceUnit, ...(fields.conditions ?? [])].map(normalizeText).filter(Boolean).join("|");
}

export function buildExtractionIR(pages: Array<{
  page: number; width: number; height: number;
  items: Array<{ text: string; x: number; y: number; width?: number; height?: number; direction?: string }>;
}>): ExtractionIR {
  return {
    version: "extraction/1",
    pages: [...pages].sort((a, b) => a.page - b.page).map((page) => {
      const sorted = page.items.filter((item) => item.text.trim()).sort((a, b) => {
        const sameLine = Math.abs(a.y - b.y) <= Math.max(a.height ?? 8, b.height ?? 8) * 0.45;
        return sameLine ? a.x - b.x : b.y - a.y;
      });
      return {
        page: page.page, width: page.width, height: page.height,
        items: sorted.map((item, index) => ({
          id: `p${page.page}-i${index + 1}`, page: page.page, text: item.text.trim(),
          bbox: { x: item.x, y: item.y, width: item.width ?? 0, height: item.height ?? 0 },
          direction: item.direction ?? "ltr", readingOrder: index,
        })),
      };
    }),
  };
}

function mergeBox(items: Array<{ bbox: BoundingBox }>): BoundingBox {
  const left = Math.min(...items.map((item) => item.bbox.x));
  const bottom = Math.min(...items.map((item) => item.bbox.y));
  const right = Math.max(...items.map((item) => item.bbox.x + item.bbox.width));
  const top = Math.max(...items.map((item) => item.bbox.y + item.bbox.height));
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

export function layoutSignature(extraction: ExtractionIR) {
  const page = extraction.pages[0];
  if (!page) return "empty";
  const xBuckets = new Set(page.items.map((item) => Math.round((item.bbox.x / Math.max(page.width, 1)) * 20)));
  const header = page.items.slice(0, 30).map((item) => normalizeText(item.text)).filter(Boolean).sort().join("|");
  let hash = 2166136261;
  for (const char of `${xBuckets.size}:${header}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `layout/1:${page.width.toFixed(0)}x${page.height.toFixed(0)}:${xBuckets.size}:${(hash >>> 0).toString(16)}`;
}

export function buildLayoutIR(extraction: ExtractionIR): LayoutIR {
  return {
    version: "layout/1",
    pages: extraction.pages.map((page) => {
      const rowGroups: ExtractionItem[][] = [];
      for (const item of page.items) {
        const tolerance = Math.max(2, item.bbox.height * 0.55);
        const group = rowGroups.find((row) => Math.abs(row[0].bbox.y - item.bbox.y) <= tolerance);
        (group ?? rowGroups[rowGroups.push([]) - 1]).push(item);
      }
      rowGroups.sort((a, b) => b[0].bbox.y - a[0].bbox.y);
      const cardLabelRows = rowGroups.map((group) => ({ y: group[0].bbox.y,
        anchors: group.filter((item) => /^(?:item|origin|packing|price)\s*[:：]\s*$/i.test(item.text))
          .map((item) => item.bbox.x).sort((a, b) => a - b) }))
        .filter((row) => row.anchors.length >= 2);
      const segmentedRows: Array<{ rowIndex: number; segment: ExtractionItem[]; columnX: number }> = [];
      for (const [rowIndex, group] of rowGroups.entries()) {
        group.sort((a, b) => a.bbox.x - b.bbox.x);
        if (cardLabelRows.length) {
          const nearest = cardLabelRows.reduce((best, row) =>
            Math.abs(row.y - group[0].bbox.y) < Math.abs(best.y - group[0].bbox.y) ? row : best);
          const buckets = nearest.anchors.map((columnX) => ({ columnX, segment: [] as ExtractionItem[] }));
          for (const item of group) {
            let bucketIndex = 0;
            for (let index = 1; index < nearest.anchors.length; index += 1) {
              if (item.bbox.x >= nearest.anchors[index] - 2) bucketIndex = index;
            }
            buckets[bucketIndex].segment.push(item);
          }
          for (const bucket of buckets) if (bucket.segment.length) segmentedRows.push({ rowIndex, ...bucket });
        } else {
          const threshold = Math.max(55, page.width * 0.09);
          const segments: ExtractionItem[][] = [];
          let segment: ExtractionItem[] = [];
          for (const item of group) {
            const previous = segment[segment.length - 1];
            const gap = previous ? item.bbox.x - (previous.bbox.x + previous.bbox.width) : 0;
            if (segment.length && gap > threshold) {
              segments.push(segment);
              segment = [];
            }
            segment.push(item);
          }
          if (segment.length) segments.push(segment);
          for (const currentSegment of segments) segmentedRows.push({ rowIndex, segment: currentSegment,
            columnX: currentSegment[0].bbox.x });
        }
      }
      const columnStarts: number[] = [];
      const columnTolerance = cardLabelRows.length ? Math.max(8, page.width * 0.02) : Math.max(36, page.width * 0.12);
      for (const x of segmentedRows.map(({ columnX }) => columnX).sort((a, b) => a - b)) {
        if (!columnStarts.some((start) => Math.abs(start - x) <= columnTolerance)) columnStarts.push(x);
      }
      const rows: LayoutRow[] = [];
      for (const { rowIndex, segment, columnX } of segmentedRows) {
        const column = columnStarts.reduce((best, start, index) =>
          Math.abs(start - columnX) < Math.abs(columnStarts[best] - columnX) ? index : best, 0);
          if (!segment.length) continue;
          const cells: LayoutCell[] = [];
          for (const item of segment) {
            const previous = cells[cells.length - 1];
            const gap = previous ? item.bbox.x - (previous.bbox.x + previous.bbox.width) : Infinity;
            if (previous && gap < Math.max(8, item.bbox.height * 0.8)) {
              previous.text = `${previous.text} ${item.text}`.trim();
              previous.itemIds.push(item.id);
              previous.bbox = mergeBox([previous, item]);
            } else {
              cells.push({ id: `p${page.page}-r${rowIndex + 1}-c${cells.length + 1}-${column}`,
                text: item.text, itemIds: [item.id], bbox: { ...item.bbox } });
            }
          }
          rows.push({ id: `p${page.page}-r${rowIndex + 1}-${column}`, page: page.page, column,
            cells, text: cells.map((cell) => cell.text).join(" | ") });
      }
      const blocks: LayoutBlock[] = [];
      for (const column of [...new Set(rows.map((row) => row.column))]) {
        const columnRows = rows.filter((row) => row.column === column);
        let current: LayoutRow[] = [];
        const flush = () => {
          if (!current.length) return;
          const id = `p${page.page}-b${blocks.length + 1}`;
          const priced = current.filter((row) => PRICE.test(row.text) || TBA.test(row.text) || UNAVAILABLE.test(row.text)).length;
          blocks.push({ id, page: page.page, column, kind: priced ? "table" : "text", rows: current,
            text: current.map((row) => row.text).join("\n"), coverage: current.length ? priced / current.length : 0 });
          current = [];
        };
        for (const row of columnRows) {
          if (current.length) {
            const previousY = current[current.length - 1].cells[0]?.bbox.y ?? 0;
            const nextY = row.cells[0]?.bbox.y ?? 0;
            if (previousY - nextY > 40) flush();
          }
          current.push(row);
        }
        flush();
      }
      return { page: page.page, blocks };
    }),
  };
}

export function limitExtractionIR(ir: ExtractionIR, maxBytes = 300_000, maxPages = 100) {
  const encoded = new TextEncoder().encode(JSON.stringify(ir)).byteLength;
  const overflow = encoded > maxBytes || ir.pages.length > maxPages;
  const summary = {
    version: ir.version, pageCount: ir.pages.length,
    itemCount: ir.pages.reduce((sum, page) => sum + page.items.length, 0), bytes: encoded, overflow,
  };
  return { summary, inline: overflow ? null : ir, requiresPrivateStorage: overflow };
}

export function selectProfile(profiles: SupplierProfile[], signature: string, supplierId?: string | null) {
  return profiles.filter((profile) => profile.isActive && (!supplierId || profile.supplierId === supplierId))
    .filter((profile) => profile.layoutSignature === signature)
    .sort((a, b) => b.profileVersion - a.profileVersion)[0] ?? null;
}

function availability(text: string): CandidateAvailability {
  if (TBA.test(text)) return "tba";
  if (UNAVAILABLE.test(text)) return "unavailable";
  return "quoted";
}

function parseUnit(raw: string | undefined): "kg" | "box" | "unit" | "pack" | null {
  if (!raw) return null;
  if (/kg|公斤/i.test(raw)) return "kg";
  if (/box|case|ctn|carton|箱|盒/i.test(raw)) return "box";
  if (/unit|pcs?|pieces?|件|bottles?|jars?|cans?|tins?|trays?|pouches?|squeezers?|cups?|pets?/i.test(raw)) return "unit";
  if (/pack|pkg|package|bags?|包/i.test(raw)) return "pack";
  return null;
}

function parseQuotedPrice(text: string) {
  const match = text.match(PRICE);
  if (!match) return null;
  return { amount: match[1] ?? match[3], unit: match[2] ?? match[4], raw: match[0] };
}

function rowToCandidate(block: LayoutBlock, row: LayoutRow, profile: SupplierProfile | null): QuoteCandidate | null {
  const text = row.text.trim();
  if (!text || CONDITION.test(text)) return null;
  const state = availability(text);
  const priceMatch = parseQuotedPrice(text);
  if (state === "quoted" && !priceMatch) return null;
  const pieces = row.cells.map((cell) => cell.text.trim()).filter(Boolean);
  const priceCell = row.cells.find((cell) => PRICE.test(cell.text) || TBA.test(cell.text) || UNAVAILABLE.test(cell.text));
  const productParts = pieces.filter((piece) => piece !== priceCell?.text);
  const code = productParts.find((part) => /^[A-Z0-9]{2,}(?:[-_/][A-Z0-9]+)+$/i.test(part)) ?? null;
  const product = productParts.find((part) => part !== code && !/^(?:australia|new zealand|brazil|thailand|spain|usa|canada|china|japan|korea|澳洲|紐西蘭|巴西|泰國|西班牙|美國|加拿大|中國|日本|韓國)$/i.test(part)) ?? productParts.join(" ");
  if (product.length < 2) return null;
  const origin = productParts.find((part) => /^(?:australia|new zealand|brazil|thailand|spain|usa|canada|china|japan|korea|澳洲|紐西蘭|巴西|泰國|西班牙|美國|加拿大|中國|日本|韓國)$/i.test(part)) ?? null;
  const size = productParts.find((part) => /\d+(?:\.\d+)?\s*(?:kg|g|lb|oz|公斤|克|磅|斤)|\d+\s*\/\s*\d+/i.test(part)) ?? null;
  const packing = productParts.find((part) => /pack|bag|box|carton|case|vacuum|包|袋|箱|真空/i.test(part)) ?? null;
  const processing = productParts.find((part) => /slice|sliced|whole|cut|chop|peeled|切片|切粒|原塊|去殼/i.test(part)) ?? null;
  const rawUnit = priceMatch?.unit ?? null;
  const quotedPrice = state === "quoted" && priceMatch ? Number(priceMatch.amount.replace(/,/g, "")) : null;
  const evidence: Evidence[] = [{ page: block.page, blockId: block.id,
    cellIds: row.cells.map((cell) => cell.id), field: "record", text }];
  const candidate: QuoteCandidate = {
    schemaVersion: CANDIDATE_SCHEMA_VERSION, supplierItemCode: code, productName: product,
    productNameZh: /[\u4e00-\u9fff]/.test(product) ? product : null, origin, sizeText: size,
    packingText: packing, processingMethod: processing, rawPriceText: priceCell?.text ?? null,
    quotedPrice: Number.isFinite(quotedPrice) ? quotedPrice : null,
    currency: /HKD|HK\$|港幣|港元|\$/i.test(text) ? "HKD" : null,
    rawPriceUnit: rawUnit, priceUnit: parseUnit(rawUnit ?? undefined), availability: state,
    conditions: [], sourcePage: block.page, sourceText: text, sourceBlockId: block.id,
    rawFields: Object.fromEntries(row.cells.map((cell, index) => [`column_${index + 1}`, cell.text])),
    evidence, parserVersion: PARSER_VERSION, profileVersion: profile?.profileVersion ?? null, modelVersion: null,
    normalizedSpecFingerprint: buildSpecFingerprint({ code, name: product, origin, size, packing, processing, priceUnit: rawUnit }),
    matchConfidence: 0, matchReason: "尚未執行商品匹配", matchBreakdown: {}, suggestedRawMeatItemId: null,
    validationErrors: [], validationWarnings: [],
  };
  const columns = profile?.tableMapping.columns ?? [];
  if (columns.length) {
    const mapped = Object.fromEntries(columns.map((field, index) => [field, row.cells[index]?.text ?? null]));
    const value = (...keys: string[]) => keys.map((key) => mapped[key]).find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) ?? null;
    const mappedPrice = value("price", "quoted_price", "unit_price");
    const mappedPriceMatch = mappedPrice ? parseQuotedPrice(mappedPrice) : null;
    candidate.supplierItemCode = value("code", "supplier_item_code") ?? candidate.supplierItemCode;
    candidate.productName = value("product", "product_name", "name", "description") ?? candidate.productName;
    candidate.productNameZh = value("product_name_zh", "name_zh") ?? candidate.productNameZh;
    candidate.origin = value("origin", "country") ?? candidate.origin;
    candidate.sizeText = value("size", "spec", "size_text") ?? candidate.sizeText;
    candidate.packingText = value("packing", "package", "packing_text") ?? candidate.packingText;
    candidate.processingMethod = value("processing", "processing_method") ?? candidate.processingMethod;
    candidate.rawPriceText = mappedPrice ?? candidate.rawPriceText;
    candidate.rawPriceUnit = value("price_unit", "unit") ?? mappedPriceMatch?.unit ?? candidate.rawPriceUnit;
    candidate.priceUnit = parseUnit(candidate.rawPriceUnit ?? undefined);
    candidate.currency = value("currency") ?? candidate.currency;
    const mappedState = value("availability", "status");
    if (mappedState) candidate.availability = availability(mappedState);
    if (candidate.availability !== "quoted") candidate.quotedPrice = null;
    else if (mappedPriceMatch) candidate.quotedPrice = Number(mappedPriceMatch.amount.replace(/,/g, ""));
    candidate.rawFields = mapped;
    candidate.evidence = columns.flatMap((field, index): Evidence[] => row.cells[index] ? [{ page: block.page,
      blockId: block.id, cellIds: [row.cells[index].id], field, text: row.cells[index].text }] : []);
    candidate.normalizedSpecFingerprint = buildSpecFingerprint({ code: candidate.supplierItemCode, name: candidate.productName,
      origin: candidate.origin, size: candidate.sizeText, packing: candidate.packingText,
      processing: candidate.processingMethod, priceUnit: candidate.rawPriceUnit, conditions: candidate.conditions });
    const headerValues = Object.values(profile?.tableMapping.headerAliases ?? {}).flat().map(normalizeText);
    if (headerValues.includes(normalizeText(candidate.productName))) return null;
  }
  return candidate;
}

export function mapLayoutCandidates(layout: LayoutIR, profile: SupplierProfile | null) {
  const candidates: QuoteCandidate[] = [];
  for (const page of layout.pages) for (const block of page.blocks) for (const row of block.rows) {
    const candidate = rowToCandidate(block, row, profile);
    if (candidate) candidates.push(candidate);
  }
  return candidates.slice(0, 1000);
}

export function validateCandidate(input: QuoteCandidate): QuoteCandidate {
  const candidate = { ...input, validationErrors: [] as string[], validationWarnings: [] as string[] };
  if (!Number.isInteger(candidate.sourcePage) || candidate.sourcePage < 1 || !candidate.sourceText || !candidate.sourceBlockId || !candidate.evidence.length) {
    candidate.validationErrors.push("source_evidence_required");
  }
  const priceEvidence = candidate.evidence.map((item) => item.text).join(" ");
  if (candidate.availability !== "quoted") {
    candidate.quotedPrice = null;
  } else if (candidate.quotedPrice === null || !Number.isFinite(candidate.quotedPrice) || candidate.quotedPrice <= 0) {
    candidate.validationErrors.push("valid_positive_price_required");
  } else {
    const normalizedPrice = String(candidate.quotedPrice);
    const evidenceNumbers = [...priceEvidence.matchAll(/[0-9]{1,5}(?:[,.][0-9]{1,4})?/g)]
      .map((match) => String(Number(match[0].replace(/,/g, ""))));
    if (!evidenceNumbers.includes(normalizedPrice)) {
      candidate.quotedPrice = null;
      candidate.validationErrors.push("price_not_supported_by_evidence");
    }
  }
  if (!candidate.priceUnit) candidate.validationWarnings.push("price_unit_requires_review");
  if (!candidate.currency) candidate.validationWarnings.push("currency_requires_review");
  if (!candidate.productName.trim()) candidate.validationErrors.push("product_name_required");
  return candidate;
}

export function isPricedMeasurableProduct(candidate: QuoteCandidate) {
  if (candidate.availability !== "quoted" || candidate.quotedPrice === null
    || !Number.isFinite(candidate.quotedPrice) || candidate.quotedPrice <= 0) return false;
  const productName = candidate.productName.trim();
  if (FIELD_LABEL_ONLY.test(productName) || FIELD_LABEL_PREFIX.test(productName) || SKU_ONLY.test(productName)) return false;
  return [candidate.sizeText, candidate.packingText].some((value) => MEASURABLE_SIZE.test(value ?? ""));
}

export function detectDateCandidates(filename: string, pages: Array<{ page: number; text: string }>, metadataDate?: string | null) {
  const result: SourceCandidate[] = [];
  const scan = (value: string, sourceType: SourceCandidate["sourceType"], sourcePage: number | null) => {
    const expressions = [/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/g, /(20\d{2})(\d{2})(\d{2})(?!\d)/g,
      /(20\d{2})年(\d{1,2})月(?:(\d{1,2})日)?/g];
    for (const expression of expressions) for (const match of value.matchAll(expression)) {
      const month = Number(match[2]); const day = Number(match[3] ?? 1);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      const date = `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      result.push({ value: date, sourceType, sourcePage, sourceText: match[0], confidence: sourceType === "content" ? 0.85 : 0.65 });
    }
  };
  scan(filename, "filename", null);
  for (const page of pages) scan(page.text, "content", page.page);
  if (metadataDate) scan(metadataDate, "metadata", null);
  return result.filter((candidate, index) => result.findIndex((other) => other.value === candidate.value && other.sourceType === candidate.sourceType && other.sourcePage === candidate.sourcePage) === index);
}

export function detectSupplierCandidates(text: string, suppliers: Array<{ id: string; name: string; aliases?: string[] }>) {
  const normalized = normalizeText(text);
  return suppliers.flatMap((supplier): SourceCandidate<string>[] => {
    const hit = [supplier.name, ...(supplier.aliases ?? [])].find((alias) => normalizeText(alias).length > 1 && normalized.includes(normalizeText(alias)));
    return hit ? [{ value: supplier.id, sourceType: "content", sourcePage: null, sourceText: hit, confidence: normalizeText(hit) === normalizeText(supplier.name) ? 0.9 : 0.8 }] : [];
  });
}

export function detectProposedSupplierCandidates(text: string, suppliers: Array<{ name: string }>) {
  const knownNames = new Set(suppliers.map((supplier) => normalizeText(supplier.name)));
  const placeholder = /^(?:n\/?a|n\.a\.?|unknown(?:\s+supplier)?|未知|不詳|待確認供應商)$/i;
  const candidates: SourceCandidate<string>[] = [];
  for (const rawLine of text.split(/\r?\n/).slice(0, 120)) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    if (!line || line.length > 120) continue;
    const labelled = line.match(/^(?:supplier|vendor|供應商|供应商|公司名稱|公司名称)\s*[:：-]\s*(.{2,80})$/i)?.[1]?.trim();
    const companyLine = /(?:limited|ltd\.?|co\.?\s*,?\s*ltd\.?|company|有限公司)$/i.test(line) ? line : null;
    const name = (labelled ?? companyLine)?.replace(/[|;,，；]+$/, "").trim();
    if (!name || placeholder.test(name) || knownNames.has(normalizeText(name))) continue;
    if (candidates.some((candidate) => normalizeText(candidate.value) === normalizeText(name))) continue;
    candidates.push({ value: name, sourceType: "content", sourcePage: null, sourceText: name,
      confidence: labelled ? 0.82 : 0.68, isNew: true });
  }
  return candidates.slice(0, 3);
}

export function detectConditions(layout: LayoutIR) {
  return layout.pages.flatMap((page) => page.blocks.flatMap((block) => block.rows
    .filter((row) => CONDITION.test(row.text)).map((row) => ({ rawText: row.text, sourcePage: page.page,
      sourceScope: "document", evidence: [{ page: page.page, blockId: block.id, cellIds: row.cells.map((cell) => cell.id), field: "condition", text: row.text }] }))));
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizeText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / new Set([...a, ...b]).size;
}

export function matchCandidate(candidate: QuoteCandidate, supplierId: string | null,
  aliases: MatchAlias[], allowedItems: MatchItem[], supplierScopeApplied = Boolean(supplierId)): QuoteCandidate {
  const allowed = new Set(allowedItems.map((item) => item.id));
  const exact = aliases.find((alias) => alias.supplierId === supplierId && allowed.has(alias.rawMeatItemId)
    && Boolean(candidate.supplierItemCode) && normalizeText(alias.supplierItemCode) === normalizeText(candidate.supplierItemCode)
    && alias.normalizedSpecFingerprint === candidate.normalizedSpecFingerprint);
  if (exact) return { ...candidate, suggestedRawMeatItemId: exact.rawMeatItemId,
    matchConfidence: Math.min(1, exact.confidence), matchReason: "供應商商品編號及規格 fingerprint 命中已確認 alias",
    matchBreakdown: { aliasExact: true, aliasConfidence: exact.confidence } };
  let best: { item: MatchItem; score: number } | null = null;
  for (const item of allowedItems) {
    const score = Math.max(tokenSimilarity(candidate.productName, item.name), tokenSimilarity(candidate.productName, item.englishName ?? ""),
      candidate.supplierItemCode && item.sku && normalizeText(candidate.supplierItemCode) === normalizeText(item.sku) ? 0.86 : 0);
    if (score > (best?.score ?? 0)) best = { item, score };
  }
  const accepted = best && best.score >= 0.35 ? best : null;
  return { ...candidate, suggestedRawMeatItemId: accepted?.item.id ?? null,
    matchConfidence: accepted?.score ?? 0.15,
    matchReason: accepted
      ? supplierScopeApplied ? "名稱／規格 token 與供應商可用商品相符，仍需人工確認" : "名稱／規格 token 與系統凍貨商品相符，供應商關聯待人工確認"
      : supplierScopeApplied ? "供應商可用商品中沒有足夠相似的對應" : "系統凍貨商品中沒有足夠相似的對應",
    matchBreakdown: { aliasExact: false, tokenSimilarity: accepted?.score ?? 0, supplierScopeApplied } };
}

export function selectSupplierMatchItems(allItems: MatchItem[], supplierId: string | null, linkedItemIds: string[]) {
  const linked = new Set(linkedItemIds);
  if (!supplierId || linked.size === 0) return { items: allItems, supplierScopeApplied: false };
  return { items: allItems.filter((item) => linked.has(item.id)), supplierScopeApplied: true };
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(?:bearer|api[-_ ]?key|secret)\s*[:=]?\s*[A-Za-z0-9._-]+/gi, "[redacted]")
    .replace(/https?:\/\/[^\s]+/g, "[endpoint]").slice(0, 300);
}

export function assertCandidateArray(value: unknown, modelVersion: string | null = null): QuoteCandidate[] {
  if (!Array.isArray(value)) throw new Error("ai_response_not_array");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("ai_candidate_not_object");
    const candidate = entry as Partial<QuoteCandidate>;
    if (candidate.schemaVersion !== CANDIDATE_SCHEMA_VERSION || typeof candidate.productName !== "string"
      || typeof candidate.sourcePage !== "number" || typeof candidate.sourceText !== "string"
      || typeof candidate.sourceBlockId !== "string" || !Array.isArray(candidate.evidence)
      || candidate.evidence.some((item) => !item || typeof item.text !== "string" || typeof item.blockId !== "string"
        || typeof item.page !== "number" || !Array.isArray(item.cellIds))) throw new Error("ai_candidate_schema_invalid");
    const priceUnit = candidate.priceUnit === "kg" || candidate.priceUnit === "box" || candidate.priceUnit === "unit" || candidate.priceUnit === "pack"
      ? candidate.priceUnit : parseUnit(candidate.rawPriceUnit ?? undefined);
    const availability = candidate.availability === "tba" || candidate.availability === "unavailable" ? candidate.availability : "quoted";
    const normalized: QuoteCandidate = {
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      supplierItemCode: candidate.supplierItemCode ?? null,
      productName: candidate.productName,
      productNameZh: candidate.productNameZh ?? null,
      origin: candidate.origin ?? null,
      sizeText: candidate.sizeText ?? null,
      packingText: candidate.packingText ?? null,
      processingMethod: candidate.processingMethod ?? null,
      rawPriceText: candidate.rawPriceText ?? null,
      quotedPrice: typeof candidate.quotedPrice === "number" ? candidate.quotedPrice : null,
      currency: candidate.currency ?? null,
      rawPriceUnit: candidate.rawPriceUnit ?? null,
      priceUnit,
      availability,
      conditions: Array.isArray(candidate.conditions) ? candidate.conditions.filter((item): item is string => typeof item === "string") : [],
      sourcePage: candidate.sourcePage,
      sourceText: candidate.sourceText,
      sourceBlockId: candidate.sourceBlockId,
      rawFields: candidate.rawFields ?? Object.fromEntries(candidate.evidence.map((item) => [item.field, item.text])),
      evidence: candidate.evidence,
      parserVersion: PARSER_VERSION,
      profileVersion: null,
      modelVersion,
      normalizedSpecFingerprint: buildSpecFingerprint({ code: candidate.supplierItemCode, name: candidate.productName,
        origin: candidate.origin, size: candidate.sizeText, packing: candidate.packingText,
        processing: candidate.processingMethod, priceUnit: candidate.rawPriceUnit, conditions: candidate.conditions }),
      matchConfidence: 0,
      matchReason: "尚未執行商品匹配",
      matchBreakdown: {},
      suggestedRawMeatItemId: null,
      validationErrors: [],
      validationWarnings: [],
    };
    return normalized;
  });
}

function openAiOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === "object" && (content as { type?: unknown }).type === "output_text"
        && typeof (content as { text?: unknown }).text === "string") return (content as { text: string }).text;
    }
  }
  throw new Error("openai_output_text_missing");
}

function deepSeekOutputText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (first && typeof first === "object") {
    const message = (first as { message?: unknown }).message;
    if (message && typeof message === "object" && typeof (message as { content?: unknown }).content === "string"
      && (message as { content: string }).content.trim()) return (message as { content: string }).content;
  }
  throw new Error("deepseek_output_content_missing");
}

function hasValidAiEvidence(candidate: QuoteCandidate, blocks: LayoutBlock[]) {
  const block = blocks.find((item) => item.id === candidate.sourceBlockId && item.page === candidate.sourcePage);
  if (!block || !block.text.includes(candidate.sourceText)) return false;
  const cells = new Map(block.rows.flatMap((row) => row.cells).map((cell) => [cell.id, cell.text]));
  return candidate.evidence.every((item) => item.page === block.page && item.blockId === block.id
    && item.cellIds.length > 0 && item.cellIds.every((id) => cells.has(id))
    && item.cellIds.some((id) => cells.get(id)?.includes(item.text) || item.text.includes(cells.get(id) ?? "")));
}

export async function recognizeWithAi(blocks: LayoutBlock[], config: AiAdapterConfig) {
  const emptyCostStats = { inputChars: 0, estimatedCostUsd: 0 };
  if (!config.enabled) return { candidates: [] as QuoteCandidate[], status: "disabled" as const, error: null, costStats: emptyCostStats };
  if (!config.endpoint || !config.apiKey || !config.model) return { candidates: [] as QuoteCandidate[], status: "unconfigured" as const, error: null, costStats: emptyCostStats };
  const safeBlocks = blocks.map((block) => ({ id: block.id, page: block.page,
    rows: block.rows.map((row) => ({ id: row.id, cells: row.cells.map((cell) => ({ id: cell.id, text: cell.text, bbox: cell.bbox })) })) }));
  const serialized = JSON.stringify({ schemaVersion: CANDIDATE_SCHEMA_VERSION, blocks: safeBlocks });
  const costStats = { inputChars: serialized.length, estimatedCostUsd: Number((Math.ceil(serialized.length / 1000) * 0.001).toFixed(4)) };
  if (serialized.length > config.maxInputChars) return { candidates: [] as QuoteCandidate[], status: "limited" as const, error: "ai_input_limit_exceeded", costStats };
  if (config.maxEstimatedCostUsd <= 0 || costStats.estimatedCostUsd > config.maxEstimatedCostUsd) {
    return { candidates: [] as QuoteCandidate[], status: "limited" as const, error: "ai_cost_limit_exceeded", costStats };
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const isOpenAi = config.provider?.toLowerCase() === "openai" || /api\.openai\.com\/v1\/responses/i.test(config.endpoint);
  const isDeepSeek = config.provider?.toLowerCase() === "deepseek" || /api\.deepseek\.com\/chat\/completions/i.test(config.endpoint);
  let lastError = "ai_provider_failed";
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const requestBody = isOpenAi ? {
        model: config.model,
        instructions: "Extract supplier quote candidates only from the supplied layout cells. For vertical catalogue cards, group Item, product name, Origin, Packing and Price rows only when their bounding boxes occupy the same horizontal product-card range. Return only real products that have both an explicit measurable weight (for example 520g, 2kg, 4 x 2kg) and an explicit positive quoted price; exclude volume-only products such as 2.3L. Map bottle, jar, can, tin, tray, pouch, squeezer, cup and pet price labels to priceUnit unit while preserving rawPriceUnit exactly. Never return field labels such as Item:, Origin:, Packing: or Price: as products. Preserve exact source text and cell IDs. Use null for unknown values, never infer a price or unit, and never convert TBA or unavailable items to zero.",
        input: serialized,
        text: { format: { type: "json_schema", name: "supplier_quote_candidates", strict: true, schema: OPENAI_CANDIDATE_SCHEMA } },
        max_output_tokens: 8_000,
        store: false,
      } : isDeepSeek ? {
        model: config.model,
        messages: [
          { role: "system", content: `Extract supplier quote candidates only from the supplied layout cells. Return JSON only with shape {"candidates": [...]}. For vertical catalogue cards, group Item, product name, Origin, Packing and Price rows only when their bounding boxes occupy the same horizontal product-card range. Return only real products that have both an explicit measurable weight (for example 520g, 2kg, 4 x 2kg) and an explicit positive quoted price; exclude volume-only products such as 2.3L. Map bottle, jar, can, tin, tray, pouch, squeezer, cup and pet price labels to priceUnit unit while preserving rawPriceUnit exactly. Never return field labels such as Item:, Origin:, Packing: or Price: as products. Every sourceBlockId, sourcePage, evidence blockId and evidence cellId must exactly match the supplied IDs. Every evidence text must exactly equal text from one of its referenced cells. sourceText must be exact contiguous text from the referenced block. Use null for unknown values, never infer a price or unit, and never convert TBA or unavailable items to zero. If every schema and evidence constraint cannot be satisfied, return {"candidates":[]}. The required JSON schema is: ${JSON.stringify(OPENAI_CANDIDATE_SCHEMA)}` },
          { role: "user", content: serialized },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_tokens: 8_000,
        stream: false,
      } : { model: config.model, response_format: { type: "json_schema", name: "supplier_quote_candidates", strict: true }, input: serialized };
      const response = await fetchImpl(config.endpoint, { method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(requestBody) });
      if (!response.ok) throw new Error(`provider_status_${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      const candidatePayload = isOpenAi
        ? JSON.parse(openAiOutputText(payload)) as { candidates?: unknown; output?: unknown }
        : isDeepSeek ? JSON.parse(deepSeekOutputText(payload)) as { candidates?: unknown; output?: unknown } : payload;
      const candidates = assertCandidateArray(candidatePayload.candidates ?? candidatePayload.output, config.model);
      const validCandidates = candidates.filter((candidate) => hasValidAiEvidence(candidate, blocks));
      return { candidates: validCandidates, status: "ok" as const,
        error: validCandidates.length < candidates.length ? "ai_candidates_dropped_invalid_evidence" : null, costStats };
    } catch (error) {
      lastError = sanitizeError(error);
      if (attempt >= config.maxRetries) break;
    } finally { clearTimeout(timer); }
  }
  return { candidates: [] as QuoteCandidate[], status: "failed" as const, error: lastError, costStats };
}

function aiInputLength(blocks: LayoutBlock[]) {
  const safeBlocks = blocks.map((block) => ({ id: block.id, page: block.page,
    rows: block.rows.map((row) => ({ id: row.id, cells: row.cells.map((cell) => ({ id: cell.id, text: cell.text, bbox: cell.bbox })) })) }));
  return JSON.stringify({ schemaVersion: CANDIDATE_SCHEMA_VERSION, blocks: safeBlocks }).length;
}

function splitOversizeBlock(block: LayoutBlock, maxInputChars: number) {
  if (aiInputLength([block]) <= maxInputChars || block.rows.length <= 1) return [block];
  const result: LayoutBlock[] = [];
  let rows: LayoutRow[] = [];
  const flush = () => {
    if (!rows.length) return;
    result.push({ ...block, rows, text: rows.map((row) => row.text).join("\n") });
    rows = [];
  };
  for (const row of block.rows) {
    const proposed = { ...block, rows: [...rows, row], text: [...rows, row].map((item) => item.text).join("\n") };
    if (rows.length && aiInputLength([proposed]) > maxInputChars) flush();
    rows.push(row);
  }
  flush();
  return result;
}

export function segmentLayoutBlocksForAi(blocks: LayoutBlock[], maxInputChars: number) {
  const safeLimit = Math.max(1_000, maxInputChars);
  const units = blocks.flatMap((block) => splitOversizeBlock(block, safeLimit));
  const chunks: LayoutBlock[][] = [];
  let current: LayoutBlock[] = [];
  for (const unit of units) {
    if (current.length && aiInputLength([...current, unit]) > safeLimit) {
      chunks.push(current);
      current = [];
    }
    current.push(unit);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function recognizeWithAiInSegments(
  blocks: LayoutBlock[],
  config: AiAdapterConfig,
  onProgress?: (progress: { completedChunks: number; chunkCount: number; pageFrom: number; pageTo: number }) => void | Promise<void>,
) {
  if (!config.enabled || !config.endpoint || !config.apiKey || !config.model) {
    const result = await recognizeWithAi(blocks, config);
    return { ...result, chunkCount: 0, completedChunks: 0, failedChunks: 0 };
  }
  const chunks = segmentLayoutBlocksForAi(blocks, config.maxInputChars);
  if (!chunks.length) {
    return { candidates: [] as QuoteCandidate[], status: "ok" as const, error: null,
      costStats: { inputChars: 0, estimatedCostUsd: 0 }, chunkCount: 0, completedChunks: 0, failedChunks: 0 };
  }
  const totalInputChars = chunks.reduce((sum, chunk) => sum + aiInputLength(chunk), 0);
  const estimatedCostUsd = Number((Math.ceil(totalInputChars / 1000) * 0.001).toFixed(4));
  if (config.maxEstimatedCostUsd <= 0 || estimatedCostUsd > config.maxEstimatedCostUsd) {
    return { candidates: [] as QuoteCandidate[], status: "limited" as const, error: "ai_cost_limit_exceeded",
      costStats: { inputChars: totalInputChars, estimatedCostUsd }, chunkCount: chunks.length, completedChunks: 0, failedChunks: chunks.length };
  }

  const results: Awaited<ReturnType<typeof recognizeWithAi>>[] = new Array(chunks.length);
  let completedChunks = 0;
  let nextChunk = 0;
  const worker = async () => {
    while (nextChunk < chunks.length) {
      const index = nextChunk;
      nextChunk += 1;
      const chunk = chunks[index];
      results[index] = await recognizeWithAi(chunk, { ...config, maxEstimatedCostUsd: config.maxEstimatedCostUsd });
      completedChunks += 1;
      const pages = chunk.map((block) => block.page);
      await onProgress?.({ completedChunks, chunkCount: chunks.length,
        pageFrom: Math.min(...pages), pageTo: Math.max(...pages) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, chunks.length) }, () => worker()));
  const candidates = results.flatMap((result) => result.status === "ok" ? result.candidates : []);
  const errors = results.flatMap((result) => result.status === "ok" ? [] : [result.error ?? result.status]);
  const failedChunks = errors.length;
  return {
    candidates,
    status: failedChunks === 0 ? "ok" as const : candidates.length ? "partial" as const : "failed" as const,
    error: errors.length ? [...new Set(errors)].join("; ") : null,
    costStats: { inputChars: totalInputChars, estimatedCostUsd },
    chunkCount: chunks.length,
    completedChunks,
    failedChunks,
  };
}

export async function recognizeDocument(input: {
  extraction: ExtractionIR; profiles: SupplierProfile[]; supplierId: string | null;
  aliases: MatchAlias[]; allowedItems: MatchItem[]; ai: AiAdapterConfig;
  supplierScopeApplied?: boolean;
  onAiChunkProgress?: (progress: { completedChunks: number; chunkCount: number; pageFrom: number; pageTo: number }) => void | Promise<void>;
}) {
  const signature = layoutSignature(input.extraction);
  const profile = selectProfile(input.profiles, signature, input.supplierId);
  const layout = buildLayoutIR(input.extraction);
  const deterministic = mapLayoutCandidates(layout, profile);
  const lowCoverageBlocks = layout.pages.flatMap((page) => page.blocks)
    .filter((block) => !profile || block.kind === "table" && block.coverage < 0.45);
  const aiResult = await recognizeWithAiInSegments(lowCoverageBlocks, input.ai, input.onAiChunkProgress);
  const byEvidence = new Map<string, QuoteCandidate>();
  for (const candidate of [...deterministic, ...aiResult.candidates]) {
    const validated = validateCandidate(candidate);
    if (!isPricedMeasurableProduct(validated)) continue;
    const matched = matchCandidate(validated, input.supplierId, input.aliases, input.allowedItems,
      input.supplierScopeApplied ?? Boolean(input.supplierId));
    byEvidence.set(`${matched.sourcePage}:${matched.sourceBlockId}:${matched.normalizedSpecFingerprint}`, matched);
  }
  return { signature, profile, layout, candidates: [...byEvidence.values()], conditions: detectConditions(layout), aiResult };
}
