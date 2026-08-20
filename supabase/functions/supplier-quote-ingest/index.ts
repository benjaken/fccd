import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "supplier-quotes-private";
const PARSER_VERSION = "pdf-text/0.3";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type UserContext = {
  id: string;
  role: string;
};

type SupplierRow = {
  id: string;
  company_name: string;
};

type RawMeatRow = {
  id: string;
  name: string;
  english_name: string | null;
  sku: string | null;
};

type PageText = {
  page: number;
  text: string;
  lines: string[];
};

type QuoteCandidate = {
  supplier_item_code: string | null;
  product_name: string;
  product_name_zh: string | null;
  origin: string | null;
  size_text: string | null;
  packing_text: string | null;
  processing_method: string | null;
  normalized_spec_fingerprint: string;
  currency: string;
  price_unit: "kg" | "box" | "unit";
  quoted_price: number | null;
  raw_quoted_price: string | null;
  availability: "quoted" | "tba" | "unavailable";
  source_page: number;
  source_text: string;
  match_confidence: number;
  match_reason: string;
  suggested_raw_meat_item_id: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secretKey() {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
}

function createAdminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requirePermission(request: Request, admin: SupabaseClient, pageKey: string): Promise<UserContext> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response("Missing authorization", { status: 401, headers: corsHeaders });
  }
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new Response("Invalid authorization", { status: 401, headers: corsHeaders });
  }

  const role = String(data.user.app_metadata?.role ?? data.user.user_metadata?.role ?? "");
  if (role !== "Super Admin") {
    const { data: permission, error: permissionError } = await admin
      .from("role_page_permissions")
      .select("can_access")
      .eq("role", role)
      .eq("page_key", pageKey)
      .maybeSingle();
    if (permissionError || !permission?.can_access) {
      throw new Response("Insufficient permission", { status: 403, headers: corsHeaders });
    }
  }
  return { id: data.user.id, role };
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fingerprint(values: Array<string | null | undefined>) {
  return values.map((value) => normalize(value)).filter(Boolean).join("|");
}

function dateMatches(value: string) {
  const dates: string[] = [];
  for (const match of value.matchAll(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(`${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  for (const match of value.matchAll(/(20\d{2})(\d{2})(\d{2})(?!\d)/g)) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(`${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  for (const match of value.matchAll(/(20\d{2})(0[1-9]|1[0-2])(?!\d)/g)) {
    dates.push(`${match[1]}-${match[2]}-01`);
  }
  for (const match of value.matchAll(/(20\d{2})年(\d{1,2})月(?:(\d{1,2})日)?/g)) {
    const month = Number(match[2]);
    const day = Number(match[3] ?? 1);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(`${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return [...new Set(dates)].sort();
}

function detectAvailability(value: string): QuoteCandidate["availability"] {
  if (/\b(?:tba|pending|n\/a)\b|待確認|待定|暫缺|缺貨|缺貨中|無貨|無供應|out\s+of\s+stock/i.test(value)) {
    return /\b(?:tba|pending|n\/a)\b|待確認|待定/i.test(value) ? "tba" : "unavailable";
  }
  return "quoted";
}

function parsePrice(value: string) {
  const pricePattern = /(?:HKD|HK\$|\$)?\s*([0-9]{1,5}(?:[,.][0-9]{1,4})?)\s*(?:\/\s*)?(kg|公斤|box|case|ctn|箱|盒|unit|pcs)?/i;
  const match = value.match(pricePattern);
  if (!match) return { price: null, raw: null, unit: "kg" as const };
  const price = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0 || price > 99999) return { price: null, raw: null, unit: "kg" as const };
  const raw = match[0].trim();
  const unit = /box|case|ctn|箱|盒/i.test(match[2] ?? "")
    ? ("box" as const)
    : /pcs|unit/i.test(match[2] ?? "")
      ? ("unit" as const)
      : ("kg" as const);
  return { price, raw, unit };
}

function stripPrice(value: string) {
  return value
    .replace(/(?:HKD|HK\$|\$)?\s*[0-9]{1,5}(?:[,.][0-9]{1,4})?\s*(?:\/\s*)?(?:kg|公斤|box|case|ctn|箱|盒|unit|pcs)?/i, " ")
    .replace(/\s+/g, " ")
    .replace(/^[|,:;\-\s]+|[|,:;\-\s]+$/g, "")
    .trim();
}

function buildPageLines(items: unknown[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const rawItem of items) {
    const item = rawItem as { str?: string; transform?: number[] };
    const text = String(item.str ?? "").trim();
    if (!text) continue;
    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    const rowKey = Math.round(y / 2) * 2;
    const row = rows.get(rowKey) ?? [];
    row.push({ x, text });
    rows.set(rowKey, row);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ").trim())
    .filter(Boolean);
}

async function extractPdf(bytes: Uint8Array): Promise<PageText[]> {
  const task = getDocument({ data: bytes, disableWorker: true, useSystemFonts: true });
  const pdf = await task.promise;
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = buildPageLines(content.items);
    pages.push({ page: pageNumber, lines, text: lines.join("\n") });
  }
  return pages;
}

function findSuggestedItem(productText: string, items: RawMeatRow[]) {
  const normalizedProduct = normalize(productText);
  let best: { item: RawMeatRow; score: number } | null = null;
  for (const item of items) {
    const names = [item.name, item.english_name, item.sku].filter(Boolean).map(normalize);
    const score = names.reduce((highest, name) => {
      if (!name) return highest;
      if (normalizedProduct.includes(name) || name.includes(normalizedProduct)) return Math.max(highest, 0.88);
      const chineseParts = name.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
      if (chineseParts.some((part) => normalizedProduct.includes(part) || part.includes(normalizedProduct))) {
        return Math.max(highest, 0.76);
      }
      const chineseBigrams = chineseParts.flatMap((part) =>
        Array.from({ length: Math.max(0, part.length - 1) }, (_, index) => part.slice(index, index + 2)),
      );
      if (chineseBigrams.some((part) => normalizedProduct.includes(part))) {
        return Math.max(highest, 0.68);
      }
      const tokens = name.split(" ").filter((token) => token.length > 2);
      const overlap = tokens.filter((token) => normalizedProduct.includes(token)).length;
      return Math.max(highest, tokens.length ? (overlap / tokens.length) * 0.72 : 0);
    }, 0);
    if (score > (best?.score ?? 0)) best = { item, score };
  }
  return best && best.score >= 0.35 ? best : null;
}

function parseCandidates(pages: PageText[], items: RawMeatRow[]): QuoteCandidate[] {
  const candidates: QuoteCandidate[] = [];
  for (const page of pages) {
    for (const rawLine of page.lines) {
      const line = rawLine.trim();
      if (line.length < 3 || /^(page|頁|subtotal|total|合計|description|商品|品名)$/i.test(line)) continue;
      if (/(?:送貨|運費|營業員|辦公時間|電話|fax|tel|包裝費|貨品種類|損耗|價格不含|日期\s*[:：]|報價單以外|最低訂購量)/i.test(line)) continue;
      const availability = detectAvailability(line);
      const parsed = parsePrice(line);
      if (availability === "quoted" && parsed.price === null) continue;
      if (availability !== "quoted" && !/\b(?:tba|n\/a|pending)\b|待確認|待定|暫缺|缺貨|無貨|out\s+of\s+stock/i.test(line)) continue;

      const withoutPrice = stripPrice(line);
      const pieces = withoutPrice.split(/\s*[|｜;,]\s*/).map((piece) => piece.trim()).filter(Boolean);
      const product = pieces[0] ?? withoutPrice;
      if (product.length < 2) continue;
      const suggestion = findSuggestedItem(product, items);
      const code = /^[A-Z]{1,8}[-_][A-Z0-9-]{2,}$/i.test(product) ? product : null;
      const origin = pieces.find((piece) => /^(?:australia|new zealand|new zealand|brazil|thailand|spain|usa|canada|china|japan|korea|澳洲|紐西蘭|巴西|泰國|西班牙|美國|加拿大|中國|日本|韓國)$/i.test(piece)) ?? null;
      const fingerprintValue = fingerprint([product, origin, pieces.slice(1).join(" ")]);
      candidates.push({
        supplier_item_code: code,
        product_name: product,
        product_name_zh: /[\u4e00-\u9fff]/.test(product) ? product : null,
        origin,
        size_text: pieces.find((piece) => /\d+(?:\.\d+)?\s*(?:kg|g|lb|oz|公斤|克|磅|斤)|\d+\/\d+/i.test(piece)) ?? null,
        packing_text: pieces.find((piece) => /(?:pack|bag|box|carton|case|vacuum|包|袋|箱|真空)/i.test(piece)) ?? null,
        processing_method: pieces.find((piece) => /(?:slice|sliced|whole|cut|chop|peeled|切片|切粒|原塊|去殼)/i.test(piece)) ?? null,
        normalized_spec_fingerprint: fingerprintValue,
        currency: /HKD|HK\$|港幣|港元|\$/i.test(line) ? "HKD" : "HKD",
        price_unit: parsed.unit,
        quoted_price: availability === "quoted" ? parsed.price : null,
        raw_quoted_price: parsed.raw ?? (availability === "tba" ? "TBA" : line),
        availability,
        source_page: page.page,
        source_text: line,
        match_confidence: suggestion?.score ?? 0.2,
        match_reason: suggestion ? "原始商品名稱與凍肉商品有部分相符，請人工確認" : "未找到足夠相似的凍肉商品，請人工對應",
        suggested_raw_meat_item_id: suggestion?.item.id ?? null,
      });
    }
  }
  return candidates.slice(0, 500);
}

async function loadExistingDocument(admin: SupabaseClient, id: string) {
  const { data: document } = await admin.from("supplier_quote_documents").select("*").eq("id", id).maybeSingle();
  if (!document) return null;
  const { data: lines } = await admin.from("supplier_quote_lines").select("*").eq("document_id", id).order("source_page");
  return { document, lines: lines ?? [] };
}

async function reparseExistingDocument(
  admin: SupabaseClient,
  documentId: string,
  file: File,
  buffer: ArrayBuffer,
  user: UserContext,
  suppliers: SupplierRow[],
  rawItems: RawMeatRow[],
) {
  const pages = await extractPdf(new Uint8Array(buffer));
  const allText = pages.map((page) => page.text).join("\n");
  const detectedDates = dateMatches(`${file.name}\n${allText}`);
  const detectedSupplier = suppliers.find((supplier) => {
    const company = normalize(supplier.company_name);
    return company.length > 1 && normalize(`${file.name} ${allText}`).includes(company);
  }) ?? null;
  const candidates = parseCandidates(pages, rawItems);
  const status = allText.trim().length === 0 ? "ocr_required" : candidates.length === 0 ? "parse_failed" : "review";
  const { data: document, error: documentError } = await admin
    .from("supplier_quote_documents")
    .update({
      supplier_id: detectedSupplier?.id ?? null,
      quote_date: detectedDates[0] ?? null,
      effective_date: detectedDates[1] ?? detectedDates[0] ?? null,
      detected_dates: detectedDates,
      status,
      parser_version: PARSER_VERSION,
      raw_extraction: { pages: pages.map((page) => ({ page: page.page, text: page.text })).slice(0, 100) },
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .select("*")
    .single();
  if (documentError || !document) throw documentError ?? new Error("document_reparse_failed");

  const { error: deleteError } = await admin.from("supplier_quote_lines").delete().eq("document_id", documentId);
  if (deleteError) throw deleteError;
  const lineRows = candidates.map((candidate) => ({
    document_id: documentId,
    supplier_id: detectedSupplier?.id ?? null,
    raw_meat_item_id: candidate.suggested_raw_meat_item_id,
    supplier_item_code: candidate.supplier_item_code,
    product_name: candidate.product_name,
    product_name_zh: candidate.product_name_zh,
    origin: candidate.origin,
    size_text: candidate.size_text,
    packing_text: candidate.packing_text,
    processing_method: candidate.processing_method,
    normalized_spec_fingerprint: candidate.normalized_spec_fingerprint,
    currency: candidate.currency,
    price_unit: candidate.price_unit,
    quoted_price: candidate.quoted_price,
    raw_quoted_price: candidate.raw_quoted_price,
    availability: candidate.availability,
    source_page: candidate.source_page,
    source_text: candidate.source_text,
    match_confidence: candidate.match_confidence,
    match_reason: candidate.match_reason,
    selection_status: "candidate",
  }));
  const { data: lines, error: lineError } = lineRows.length
    ? await admin.from("supplier_quote_lines").insert(lineRows).select("*")
    : { data: [], error: null };
  if (lineError) throw lineError;
  return { document, lines: lines ?? [], detectedSupplier, detectedDates };
}

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const admin = createAdminClient();
  let user: UserContext;
  try {
    user = await requirePermission(request, admin, "frozen.supplier_quotes.upload");
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: "permission_check_failed" }, 500);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonResponse({ error: "pdf_file_required" }, 400);
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return jsonResponse({ error: "pdf_file_size_invalid" }, 400);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return jsonResponse({ error: "pdf_file_required" }, 400);
    }

    const buffer = await file.arrayBuffer();
    const hash = await sha256(buffer);
    const { data: duplicate } = await admin
      .from("supplier_quote_documents")
      .select("id")
      .eq("sha256", hash)
      .maybeSingle();
    if (duplicate?.id) {
      const existing = await loadExistingDocument(admin, duplicate.id);
      if (existing?.document.status !== "confirmed" && existing?.document.parser_version !== PARSER_VERSION) {
        const [{ data: suppliers, error: supplierError }, { data: rawItems, error: itemError }] = await Promise.all([
          admin.from("suppliers").select("id, company_name").eq("is_active", true).order("company_name"),
          admin.from("raw_meat_items").select("id, name, english_name, sku").eq("is_active", true).order("name"),
        ]);
        if (supplierError) throw supplierError;
        if (itemError) throw itemError;
        const reparsed = await reparseExistingDocument(admin, duplicate.id, file, buffer, user, suppliers as SupplierRow[], rawItems as RawMeatRow[]);
        return jsonResponse({ duplicate: true, ...reparsed });
      }
      return jsonResponse({ duplicate: true, ...existing });
    }

    const storagePath = `${hash.slice(0, 2)}/${hash}.pdf`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) return jsonResponse({ error: "storage_upload_failed", detail: uploadError.message }, 500);

    const { data: suppliers, error: supplierError } = await admin
      .from("suppliers")
      .select("id, company_name")
      .eq("is_active", true)
      .order("company_name");
    if (supplierError) throw supplierError;
    const supplierRows = (suppliers ?? []) as SupplierRow[];

    const { data: rawItems, error: itemError } = await admin
      .from("raw_meat_items")
      .select("id, name, english_name, sku")
      .eq("is_active", true)
      .order("name");
    if (itemError) throw itemError;
    const rawItemRows = (rawItems ?? []) as RawMeatRow[];
    const pages = await extractPdf(new Uint8Array(buffer));
    const allText = pages.map((page) => page.text).join("\n");
    const detectedDates = dateMatches(`${file.name}\n${allText}`);
    const detectedSupplier = supplierRows.find((supplier) => {
      const company = normalize(supplier.company_name);
      return company.length > 1 && normalize(`${file.name} ${allText}`).includes(company);
    }) ?? null;
    const candidates = parseCandidates(pages, rawItemRows);
    const status = allText.trim().length === 0 ? "ocr_required" : candidates.length === 0 ? "parse_failed" : "review";

    const { data: document, error: documentError } = await admin
      .from("supplier_quote_documents")
      .insert({
        supplier_id: detectedSupplier?.id ?? null,
        original_filename: file.name,
        storage_path: storagePath,
        sha256: hash,
        mime_type: "application/pdf",
        file_size_bytes: file.size,
        quote_date: detectedDates[0] ?? null,
        effective_date: detectedDates[1] ?? detectedDates[0] ?? null,
        detected_dates: detectedDates,
        status,
        parser_version: PARSER_VERSION,
        raw_extraction: { pages: pages.map((page) => ({ page: page.page, text: page.text })).slice(0, 100) },
        created_by: user.id,
      })
      .select("*")
      .single();
    if (documentError || !document) throw documentError ?? new Error("document_insert_failed");

    const lineRows = candidates.map((candidate) => ({
      document_id: document.id,
      supplier_id: detectedSupplier?.id ?? null,
      raw_meat_item_id: candidate.suggested_raw_meat_item_id,
      supplier_item_code: candidate.supplier_item_code,
      product_name: candidate.product_name,
      product_name_zh: candidate.product_name_zh,
      origin: candidate.origin,
      size_text: candidate.size_text,
      packing_text: candidate.packing_text,
      processing_method: candidate.processing_method,
      normalized_spec_fingerprint: candidate.normalized_spec_fingerprint,
      currency: candidate.currency,
      price_unit: candidate.price_unit,
      quoted_price: candidate.quoted_price,
      raw_quoted_price: candidate.raw_quoted_price,
      availability: candidate.availability,
      source_page: candidate.source_page,
      source_text: candidate.source_text,
      match_confidence: candidate.match_confidence,
      match_reason: candidate.match_reason,
      selection_status: "candidate",
    }));
    const { data: lines, error: lineError } = lineRows.length
      ? await admin.from("supplier_quote_lines").insert(lineRows).select("*")
      : { data: [], error: null };
    if (lineError) throw lineError;

    return jsonResponse({
      duplicate: false,
      document,
      lines: lines ?? [],
      detectedSupplier,
      detectedDates,
    });
  } catch (error) {
    console.error("supplier-quote-ingest failed", error);
    return jsonResponse({ error: "supplier_quote_ingest_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
