import { supabase } from "@/lib/supabase";
import type { QuoteDocument, QuoteLine } from "@/components/SupplierQuotePage";

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

export type SupplierQuoteIngestResult = {
  duplicate: boolean;
  document: {
    id: string;
    supplier_id: string | null;
    quote_date: string | null;
    effective_date: string | null;
    status: string;
    original_filename: string;
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
  }>;
  detectedSupplier: { id: string; company_name: string } | null;
  detectedDates?: string[];
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
  currency: string;
  price_unit: "kg" | "box" | "unit";
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
  const displayStatus = document.status === "review"
    ? "draft"
    : document.status === "ocr_required"
      ? "parse_failed"
      : document.status;
  return {
    id: document.id,
    supplier: supplierName,
    supplierId: document.supplier_id,
    filename: document.original_filename,
    quoteDate: document.quote_date ?? "",
    effectiveDate: document.effective_date ?? "",
    status: displayStatus as QuoteDocument["status"],
    lineCount,
    confirmedAt: document.confirmed_at ?? "",
    parserVersion: document.parser_version,
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
    supabase.from("supplier_quote_documents").select("id,supplier_id,original_filename,quote_date,effective_date,status,parser_version,confirmed_at").order("quote_date", { ascending: false }),
    supabase.from("supplier_quote_lines").select("id,document_id,supplier_id,raw_meat_item_id,supplier_item_code,product_name,product_name_zh,origin,size_text,packing_text,quoted_price,currency,price_unit,availability,source_page,source_text,match_confidence,match_reason,selection_status,normalized_spec_fingerprint").eq("selection_status", "confirmed"),
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
      priceUnit: latest.price_unit === "box" ? "box" : "kg",
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
      previousDate: previous ? documentMap.get(previous.document_id)?.quote_date ?? null : null,
      baselinePrice: entries.length > 1 ? numberValue(baseline.quoted_price) : null,
      actualInboundPrice: actual ? numberValue(actual.inbound_unit_price) : null,
      actualInboundDate: actual?.movement_at?.slice(0, 10) ?? null,
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
  return data as SupplierQuoteIngestResult;
}

export async function confirmSupplierQuoteDocument(input: {
  documentId: string;
  supplierId: string;
  quoteDate: string;
  effectiveDate: string;
  isBaseline: boolean;
  selections: Array<{ lineId: string; rawMeatItemId: string | null; normalizedSpecFingerprint?: string }>;
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
      normalized_spec_fingerprint: selection.normalizedSpecFingerprint ?? "",
    })),
  });
  if (error) throw error;
  return data as string;
}
