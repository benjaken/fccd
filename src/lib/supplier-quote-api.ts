import { supabase } from "@/lib/supabase";
import type { QuoteDocument, QuoteLine } from "@/components/SupplierQuotePage";
import { hongKongDateKey } from "@/lib/date-time";
import { normalizeSupplierQuotePrice } from "@/lib/supplier-quote-price";

export type SupplierQuoteSupplierOption = {
  id: string;
  name: string;
};

export type SupplierQuoteRawMeatOption = {
  id: string;
  name: string;
  englishName: string | null;
  sku: string | null;
};

export type SupplierQuoteCandidate = {
  id: string;
  supplierCode: string;
  productName: string;
  productNameZh: string;
  origin: string;
  spec: string;
  packing: string;
  price: number | null;
  availability: "quoted" | "tba" | "unavailable";
  sourcePage: number;
  sourceText: string;
  confidence: number;
  matchReason: string;
  matchedItem: string;
  matchedRawMeatItemId: string | null;
  conditions: string[];
  selected: boolean;
};

export type SupplierQuoteSourceCandidate = {
  value: string;
  sourceType: "filename" | "content" | "metadata" | "profile";
  sourcePage: number | null;
  sourceText: string;
  confidence: number;
  isNew?: boolean;
};

export type SupplierQuoteEvidence = {
  page: number;
  blockId: string;
  cellIds: string[];
  field: string;
  text: string;
};

export type SupplierQuoteExtractionItem = {
  id: string;
  page: number;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  direction: string;
  readingOrder: number;
};

export type SupplierQuoteExtraction = {
  version: "extraction/1";
  pages: Array<{
    page: number;
    width: number;
    height: number;
    items: SupplierQuoteExtractionItem[];
  }>;
};

export type SupplierQuotePdfPreview = {
  pdfUrl: string;
  extraction: SupplierQuoteExtraction | null;
};

export type SupplierQuoteIngestResult = {
  duplicate: boolean;
  document: {
    id: string;
    supplier_id: string | null;
    quote_date: string | null;
    effective_date: string | null;
    status: string;
    original_filename: string;
    detected_dates?: SupplierQuoteSourceCandidate[] | string[];
    detected_suppliers?: SupplierQuoteSourceCandidate[];
    last_error_code?: string | null;
    last_error_summary?: string | null;
  };
  lines: Array<{
    id: string;
    supplier_item_code: string | null;
    product_name: string;
    product_name_zh: string | null;
    origin: string | null;
    size_text: string | null;
    packing_text: string | null;
    quoted_price: number | null;
    availability: "quoted" | "tba" | "unavailable";
    source_page: number | null;
    source_text: string | null;
    match_confidence: number | null;
    match_reason: string | null;
    raw_meat_item_id: string | null;
    price_unit?: string | null;
    normalized_spec_fingerprint?: string;
    raw_fields?: Record<string, string | null>;
    evidence?: SupplierQuoteEvidence[];
    validation_errors?: string[];
    validation_warnings?: string[];
    match_breakdown?: Record<string, number | string | boolean>;
    new_item_requested?: boolean;
  }>;
  detectedSupplier: { id: string; company_name: string } | null;
  detectedDates?: string[] | SupplierQuoteSourceCandidate[];
  parseRuns?: Array<{
    id: string;
    attempt: number;
    status: string;
    current_stage: string;
    error_code: string | null;
    error_summary: string | null;
  }>;
};

type DatabaseDocument = {
  id: string;
  supplier_id: string | null;
  original_filename: string;
  quote_date: string | null;
  effective_date: string | null;
  status: string;
  parser_version: string;
  confirmed_at: string | null;
  last_error_code?: string | null;
  last_error_summary?: string | null;
};

type DatabaseLine = {
  id: string;
  document_id: string;
  supplier_id: string | null;
  raw_meat_item_id: string | null;
  supplier_item_code: string | null;
  product_name: string;
  product_name_zh: string | null;
  origin: string | null;
  size_text: string | null;
  packing_text: string | null;
  quoted_price: number | string | null;
  raw_quoted_price: string | null;
  currency: string;
  price_unit: string;
  availability: "quoted" | "tba" | "unavailable";
  source_page: number | null;
  source_text: string | null;
  match_confidence: number | string | null;
  match_reason: string | null;
  selection_status: "candidate" | "confirmed" | "unmatched" | "skipped";
  normalized_spec_fingerprint: string;
};

type DatabaseSupplier = { id: string; company_name: string };
type DatabaseMovement = {
  supplier_id: string | null;
  raw_meat_item_id: string | null;
  movement_at: string | null;
  inbound_unit_price: number | string | null;
};

function numberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localState(line: DatabaseLine): QuoteLine["state"] {
  if (line.selection_status === "confirmed" && line.raw_meat_item_id) return "confirmed";
  if (line.selection_status === "skipped") return "skipped";
  return "pending";
}

function localDocument(document: DatabaseDocument, supplierName: string, lineCount: number): QuoteDocument {
  return {
    id: document.id,
    supplier: supplierName,
    supplierId: document.supplier_id,
    filename: document.original_filename,
    quoteDate: document.quote_date ?? "",
    effectiveDate: document.effective_date ?? "",
    status: document.status as QuoteDocument["status"],
    lineCount,
    confirmedAt: document.confirmed_at ?? "",
    parserVersion: document.parser_version,
    errorCode: document.last_error_code ?? null,
    errorSummary: document.last_error_summary ?? null,
  };
}

export async function fetchSupplierQuoteSuppliers(): Promise<SupplierQuoteSupplierOption[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,company_name")
    .eq("is_active", true)
    .order("company_name");
  if (error) throw error;
  return ((data ?? []) as DatabaseSupplier[]).map((supplier) => ({
    id: supplier.id,
    name: supplier.company_name,
  }));
}

export async function fetchSupplierQuoteRawMeatOptions(): Promise<SupplierQuoteRawMeatOption[]> {
  const { data, error } = await supabase
    .from("raw_meat_items")
    .select("id,name,english_name,sku")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string; english_name: string | null; sku: string | null }>).map((item) => ({
    id: item.id,
    name: item.name,
    englishName: item.english_name,
    sku: item.sku,
  }));
}

export async function fetchSupplierQuoteDashboard(): Promise<{
  documents: QuoteDocument[];
  lines: QuoteLine[];
}> {
  const [{ data: rawDocuments, error: documentError }, { data: rawLines, error: lineError }, suppliers, { data: movements, error: movementError }] = await Promise.all([
    supabase.from("supplier_quote_documents").select("id,supplier_id,original_filename,quote_date,effective_date,status,parser_version,confirmed_at,last_error_code,last_error_summary").order("created_at", { ascending: false }),
    supabase.from("supplier_quote_lines").select("id,document_id,supplier_id,raw_meat_item_id,supplier_item_code,product_name,product_name_zh,origin,size_text,packing_text,quoted_price,raw_quoted_price,currency,price_unit,availability,source_page,source_text,match_confidence,match_reason,selection_status,normalized_spec_fingerprint").eq("selection_status", "confirmed"),
    fetchSupplierQuoteSuppliers(),
    supabase.rpc("get_supplier_raw_meat_price_history", { p_supplier_id: null, p_raw_meat_item_id: null, p_from_date: null, p_to_date: null }),
  ]);
  if (documentError) throw documentError;
  if (lineError) throw lineError;
  if (movementError) throw movementError;

  const documents = (rawDocuments ?? []) as DatabaseDocument[];
  const lines = (rawLines ?? []) as DatabaseLine[];
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const movementRows = (movements ?? []) as DatabaseMovement[];
  const history = new Map<string, DatabaseLine[]>();
  for (const line of lines) {
    const document = documentMap.get(line.document_id);
    if (!document || document.status !== "confirmed") continue;
    const key = [line.supplier_id ?? document.supplier_id ?? "", line.raw_meat_item_id ?? line.product_name, line.normalized_spec_fingerprint, line.price_unit].join("|");
    const entries = history.get(key) ?? [];
    entries.push(line);
    history.set(key, entries);
  }

  const pageLines: QuoteLine[] = [];
  for (const entries of history.values()) {
    entries.sort((left, right) => {
      const leftDate = documentMap.get(left.document_id)?.quote_date ?? "";
      const rightDate = documentMap.get(right.document_id)?.quote_date ?? "";
      return leftDate.localeCompare(rightDate);
    });
    const latest = entries[entries.length - 1];
    const latestDocument = documentMap.get(latest.document_id);
    if (!latestDocument) continue;
    const previous = entries.length > 1 ? entries[entries.length - 2] : null;
    const baseline = entries[0];
    const normalizedLatest = normalizeSupplierQuotePrice({
      price: numberValue(latest.quoted_price), priceUnit: latest.price_unit,
      rawPriceText: latest.raw_quoted_price, sizeText: latest.size_text, packingText: latest.packing_text,
    });
    const normalizedPrevious = previous ? normalizeSupplierQuotePrice({
      price: numberValue(previous.quoted_price), priceUnit: previous.price_unit,
      rawPriceText: previous.raw_quoted_price, sizeText: previous.size_text, packingText: previous.packing_text,
    }) : null;
    const normalizedBaseline = entries.length > 1 ? normalizeSupplierQuotePrice({
      price: numberValue(baseline.quoted_price), priceUnit: baseline.price_unit,
      rawPriceText: baseline.raw_quoted_price, sizeText: baseline.size_text, packingText: baseline.packing_text,
    }) : null;
    const supplierId = latest.supplier_id ?? latestDocument.supplier_id;
    const actual = movementRows.find((movement) => movement.supplier_id === supplierId && movement.raw_meat_item_id === latest.raw_meat_item_id);
    const supplierName = supplierId ? supplierMap.get(supplierId) ?? "未命名供應商" : "未指定供應商";
    pageLines.push({
      id: latest.id,
      documentId: latest.document_id,
      supplier: supplierName,
      supplierId,
      supplierCode: latest.supplier_item_code ?? "",
      productName: latest.product_name,
      productNameZh: latest.product_name_zh ?? latest.product_name,
      origin: latest.origin ?? "",
      spec: latest.size_text ?? "",
      packing: latest.packing_text ?? "",
      price: numberValue(latest.quoted_price),
      currency: latest.currency === "HKD" ? "HKD" : "HKD",
      priceUnit: latest.price_unit,
      sourcePriceUnitLabel: normalizedLatest.sourceUnitLabel,
      comparablePricePerKg: normalizedLatest.comparablePricePerKg,
      containerPrice: normalizedLatest.containerPrice,
      conversionIssue: normalizedLatest.conversionIssue,
      availability: latest.availability,
      quoteDate: latestDocument.quote_date ?? "",
      effectiveDate: latestDocument.effective_date ?? "",
      sourcePage: latest.source_page ?? 0,
      sourceText: latest.source_text ?? "",
      confidence: numberValue(latest.match_confidence) ?? 0,
      matchReason: latest.match_reason ?? "",
      state: localState(latest),
      matchedItem: latest.product_name_zh ?? latest.product_name,
      conditions: [],
      previousPrice: previous ? numberValue(previous.quoted_price) : null,
      previousComparablePricePerKg: normalizedPrevious?.comparablePricePerKg ?? null,
      previousDate: previous ? documentMap.get(previous.document_id)?.quote_date ?? null : null,
      baselinePrice: entries.length > 1 ? numberValue(baseline.quoted_price) : null,
      baselineComparablePricePerKg: normalizedBaseline?.comparablePricePerKg ?? null,
      actualInboundPrice: actual ? numberValue(actual.inbound_unit_price) : null,
      actualInboundDate: actual?.movement_at ? hongKongDateKey(actual.movement_at) : null,
    });
  }

  const documentLines = new Map<string, number>();
  for (const line of lines) documentLines.set(line.document_id, (documentLines.get(line.document_id) ?? 0) + 1);
  return {
    documents: documents.map((document) => localDocument(document, document.supplier_id ? supplierMap.get(document.supplier_id) ?? "未命名供應商" : "未指定供應商", documentLines.get(document.id) ?? 0)),
    lines: pageLines,
  };
}

export async function ingestSupplierQuotePdf(file: File): Promise<SupplierQuoteIngestResult> {
  const body = new FormData();
  body.append("file", file, file.name);
  const { data, error } = await supabase.functions.invoke("supplier-quote-ingest", { body });
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.detail ?? data?.error ?? "supplier_quote_ingest_failed");
  return mapSupplierQuoteIngestResult(data);
}

export async function fetchSupplierQuoteReviewDocument(documentId: string): Promise<SupplierQuoteIngestResult> {
  const [{ data: document, error: documentError }, { data: lines, error: lineError }] = await Promise.all([
    supabase.from("supplier_quote_documents")
      .select("id,supplier_id,quote_date,effective_date,status,original_filename,detected_dates,detected_suppliers,last_error_code,last_error_summary")
      .eq("id", documentId)
      .maybeSingle(),
    supabase.from("supplier_quote_lines")
      .select("id,supplier_item_code,product_name,product_name_zh,origin,size_text,packing_text,quoted_price,availability,source_page,source_text,match_confidence,match_reason,raw_meat_item_id,price_unit,normalized_spec_fingerprint,raw_fields,evidence,validation_errors,validation_warnings,match_breakdown,new_item_requested,selection_status")
      .eq("document_id", documentId)
      .neq("selection_status", "confirmed")
      .order("source_page", { ascending: true }),
  ]);
  if (documentError) throw documentError;
  if (lineError) throw lineError;
  if (!document) throw new Error("supplier_quote_document_not_found");
  return mapSupplierQuoteIngestResult({
    duplicate: true,
    document,
    lines: lines ?? [],
    detectedSupplier: null,
  });
}

function isSupplierQuoteExtraction(value: unknown): value is SupplierQuoteExtraction {
  if (!value || typeof value !== "object") return false;
  const extraction = value as Partial<SupplierQuoteExtraction>;
  return extraction.version === "extraction/1" && Array.isArray(extraction.pages);
}

export async function fetchSupplierQuotePdfPreview(documentId: string): Promise<SupplierQuotePdfPreview> {
  const { data: document, error } = await supabase.from("supplier_quote_documents")
    .select("storage_bucket,storage_path,raw_extraction,extraction_storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!document) throw new Error("supplier_quote_document_not_found");
  const bucket = String(document.storage_bucket || "supplier-quotes-private");
  const { data: pdf, error: pdfError } = await supabase.storage.from(bucket)
    .createSignedUrl(String(document.storage_path), 60 * 60);
  if (pdfError || !pdf?.signedUrl) throw pdfError ?? new Error("supplier_quote_pdf_preview_unavailable");

  let extraction = isSupplierQuoteExtraction(document.raw_extraction) ? document.raw_extraction : null;
  if (!extraction && document.extraction_storage_path) {
    const { data: extractionLink, error: extractionLinkError } = await supabase.storage.from(bucket)
      .createSignedUrl(String(document.extraction_storage_path), 60 * 60);
    if (!extractionLinkError && extractionLink?.signedUrl) {
      const response = await fetch(extractionLink.signedUrl);
      if (response.ok) {
        const payload: unknown = await response.json();
        if (isSupplierQuoteExtraction(payload)) extraction = payload;
      }
    }
  }
  return { pdfUrl: pdf.signedUrl, extraction };
}

export async function createSupplierFromQuoteReview(companyName: string): Promise<SupplierQuoteSupplierOption> {
  const name = companyName.trim().replace(/\s+/g, " ");
  const { data, error } = await supabase.rpc("create_supplier_from_quote_review", {
    p_company_name: name,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("supplier_creation_failed");
  return { id: data, name };
}

function sourceCandidates(value: unknown, fallbackSource: SupplierQuoteSourceCandidate["sourceType"]): SupplierQuoteSourceCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SupplierQuoteSourceCandidate[] => {
    if (typeof entry === "string") return [{ value: entry, sourceType: fallbackSource, sourcePage: null, sourceText: entry, confidence: 0.5 }];
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<SupplierQuoteSourceCandidate>;
    return typeof candidate.value === "string" ? [{ value: candidate.value,
      sourceType: candidate.sourceType ?? fallbackSource, sourcePage: candidate.sourcePage ?? null,
      sourceText: candidate.sourceText ?? candidate.value, confidence: Number(candidate.confidence ?? 0.5),
      ...(candidate.isNew === true ? { isNew: true } : {}) }] : [];
  });
}

export function mapSupplierQuoteIngestResult(payload: unknown): SupplierQuoteIngestResult {
  if (!payload || typeof payload !== "object") throw new Error("supplier_quote_ingest_payload_invalid");
  const result = payload as SupplierQuoteIngestResult;
  if (!result.document?.id || !Array.isArray(result.lines)) throw new Error("supplier_quote_ingest_payload_invalid");
  const dates = sourceCandidates(result.document.detected_dates ?? result.detectedDates, "content");
  const suppliers = sourceCandidates(result.document.detected_suppliers, "content");
  return {
    ...result,
    detectedSupplier: result.detectedSupplier ?? null,
    document: { ...result.document, detected_dates: dates, detected_suppliers: suppliers },
    detectedDates: dates,
    lines: result.lines.map((line) => ({
      ...line,
      raw_fields: line.raw_fields ?? {}, evidence: line.evidence ?? [],
      validation_errors: line.validation_errors ?? [], validation_warnings: line.validation_warnings ?? [],
      match_breakdown: line.match_breakdown ?? {}, normalized_spec_fingerprint: line.normalized_spec_fingerprint ?? "",
      price_unit: line.price_unit ?? null, new_item_requested: line.new_item_requested ?? false,
    })),
  };
}

type SupplierQuoteParseRunState = {
  id: string;
  attempt: number;
  status: string;
  current_stage: string;
  error_code: string | null;
  error_summary: string | null;
  stage_stats?: Record<string, unknown>;
};

async function latestSupplierQuoteParseRun(documentId: string): Promise<SupplierQuoteParseRunState | null> {
  const { data, error } = await supabase.from("supplier_quote_parse_runs")
    .select("id,attempt,status,current_stage,error_code,error_summary,stage_stats")
    .eq("document_id", documentId)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as SupplierQuoteParseRunState | null;
}

async function waitForSupplierQuoteRetry(documentId: string, previousAttempt: number, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await latestSupplierQuoteParseRun(documentId);
    if (run && run.attempt > previousAttempt && run.status !== "running") {
      const result = await fetchSupplierQuoteReviewDocument(documentId);
      return { ...result, parseRuns: [run] };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error("supplier_quote_retry_timeout");
}

export async function retrySupplierQuoteDocument(
  documentId: string,
  idempotencyKey = crypto.randomUUID(),
  onProgress?: (run: SupplierQuoteParseRunState) => void,
) {
  const previousAttempt = (await latestSupplierQuoteParseRun(documentId))?.attempt ?? 0;
  let polling = true;
  const progressPolling = (async () => {
    while (polling) {
      const run = await latestSupplierQuoteParseRun(documentId).catch(() => null);
      if (run && run.attempt > previousAttempt) onProgress?.(run);
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
  })();
  try {
    const { data, error } = await supabase.functions.invoke("supplier-quote-ingest", {
      body: { retry_document_id: documentId, idempotency_key: idempotencyKey },
    });
    if (error) throw error;
    if (!data || data.error) throw new Error(data?.diagnostic ?? data?.error ?? "supplier_quote_retry_failed");
    return mapSupplierQuoteIngestResult(data);
  } catch (invokeError) {
    try {
      return await waitForSupplierQuoteRetry(documentId, previousAttempt);
    } catch {
      throw invokeError;
    }
  } finally {
    polling = false;
    await progressPolling;
  }
}

export async function confirmSupplierQuoteDocument(input: {
  documentId: string;
  supplierId: string;
  quoteDate: string;
  effectiveDate: string;
  isBaseline: boolean;
  selections: Array<{
    lineId: string;
    rawMeatItemId: string | null;
    normalizedSpecFingerprint: string;
    priceUnit: string;
    newItemRequested?: boolean;
  }>;
}) {
  const { data, error } = await supabase.rpc("confirm_supplier_quote_document", {
    p_document_id: input.documentId,
    p_supplier_id: input.supplierId,
    p_quote_date: input.quoteDate,
    p_effective_date: input.effectiveDate,
    p_is_baseline: input.isBaseline,
    p_selections: input.selections.map((selection) => ({
      line_id: selection.lineId,
      raw_meat_item_id: selection.rawMeatItemId,
      normalized_spec_fingerprint: selection.normalizedSpecFingerprint,
      price_unit: selection.priceUnit,
      new_item_requested: selection.newItemRequested ?? false,
    })),
  });
  if (error) throw error;
  return data as string;
}
