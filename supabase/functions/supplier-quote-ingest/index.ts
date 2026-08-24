import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import {
  aggregateDocumentStatus, buildExtractionIR, CANDIDATE_SCHEMA_VERSION, detectDateCandidates, detectProposedSupplierCandidates, detectSupplierCandidates,
  limitExtractionIR, PARSER_VERSION, preserveConfirmedDocumentStatus, recognizeDocument, selectSupplierMatchItems, validatePdfUpload, type ExtractionIR, type MatchAlias,
  type MatchItem, type SupplierProfile,
} from "../_shared/supplier-quote-recognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "supplier-quotes-private";
const MAX_FILE_SIZE = Number(Deno.env.get("SUPPLIER_QUOTE_MAX_FILE_BYTES") ?? 50 * 1024 * 1024);
const MAX_EXTRACTION_BYTES = Number(Deno.env.get("SUPPLIER_QUOTE_MAX_EXTRACTION_BYTES") ?? 300_000);

type UserContext = { id: string; role: string };
type SupplierRow = { id: string; company_name: string };
type DocumentRow = {
  id: string; supplier_id: string | null; original_filename: string; storage_path: string;
  sha256: string; status: string; latest_parse_run_id: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function createAdminClient(): SupabaseClient {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requirePermission(request: Request, admin: SupabaseClient): Promise<UserContext> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw jsonResponse({ error: "authentication_required" }, 401);
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw jsonResponse({ error: "authentication_required" }, 401);
  const role = String(data.user.app_metadata?.role ?? data.user.user_metadata?.role ?? "");
  if (role !== "Super Admin") {
    const { data: permission, error: permissionError } = await admin.from("role_page_permissions")
      .select("can_access").eq("role", role).eq("page_key", "frozen.supplier_quotes.upload").maybeSingle();
    if (permissionError || !permission?.can_access) throw jsonResponse({ error: "insufficient_privilege" }, 403);
  }
  return { id: data.user.id, role };
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout/i.test(message)) return "recognition_timeout";
  if (/storage/i.test(message)) return "private_storage_failed";
  if (/pdf/i.test(message)) return "pdf_extraction_failed";
  return "parse_pipeline_failed";
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractionIR> {
  const task = getDocument({ data: bytes, disableWorker: true, useSystemFonts: true });
  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      page: pageNumber, width: viewport.width, height: viewport.height,
      items: content.items.map((raw: unknown) => {
        const item = raw as { str?: string; transform?: number[]; width?: number; height?: number; dir?: string };
        return { text: String(item.str ?? ""), x: Number(item.transform?.[4] ?? 0), y: Number(item.transform?.[5] ?? 0),
          width: Number(item.width ?? 0), height: Number(item.height ?? Math.abs(item.transform?.[3] ?? 0)), direction: item.dir ?? "ltr" };
      }),
    });
  }
  return buildExtractionIR(pages);
}

async function loadDocument(admin: SupabaseClient, id: string) {
  const { data: document, error } = await admin.from("supplier_quote_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!document) return null;
  const [{ data: lines }, { data: parseRuns }] = await Promise.all([
    admin.from("supplier_quote_lines").select("*").eq("document_id", id).order("source_page"),
    admin.from("supplier_quote_parse_runs").select("id,attempt,status,current_stage,parser_version,error_code,error_summary,stage_stats,started_at,finished_at").eq("document_id", id).order("attempt", { ascending: false }),
  ]);
  return { document, lines: lines ?? [], parseRuns: parseRuns ?? [] };
}

async function requestInput(request: Request, admin: SupabaseClient, user: UserContext) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { retry_document_id?: string; idempotency_key?: string };
    if (!body.retry_document_id) throw jsonResponse({ error: "retry_document_id_required" }, 400);
    const { data: document, error } = await admin.from("supplier_quote_documents").select("*").eq("id", body.retry_document_id).maybeSingle();
    if (error || !document) throw jsonResponse({ error: "supplier_quote_document_not_found" }, 404);
    const { data: existingRun } = body.idempotency_key ? await admin.from("supplier_quote_parse_runs").select("id,status")
      .eq("document_id", document.id).eq("idempotency_key", body.idempotency_key).maybeSingle() : { data: null };
    if (existingRun) return { document: document as DocumentRow, duplicate: true, existingRun: true, bytes: null as ArrayBuffer | null };
    const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(document.storage_path);
    if (downloadError || !blob) throw new Error("storage_download_failed");
    return { document: document as DocumentRow, duplicate: true, existingRun: false,
      bytes: await blob.arrayBuffer(), idempotencyKey: body.idempotency_key ?? null, startedBy: user.id };
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw jsonResponse({ error: "pdf_file_required" }, 400);
  const bytes = await file.arrayBuffer();
  const validationError = validatePdfUpload({ name: file.name, mimeType: file.type, size: file.size,
    header: new TextDecoder().decode(bytes.slice(0, 5)) }, MAX_FILE_SIZE);
  if (validationError) throw jsonResponse({ error: validationError }, 400);
  const hash = await sha256(bytes);
  const { data: duplicate, error: duplicateError } = await admin.from("supplier_quote_documents").select("id").eq("sha256", hash).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate?.id) return { document: null, duplicate: true, existingRun: true, bytes: null, existingDocumentId: duplicate.id as string };
  const storagePath = `${hash.slice(0, 2)}/${hash}.pdf`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error("storage_upload_failed");
  const { data: document, error: documentError } = await admin.from("supplier_quote_documents").insert({
    original_filename: file.name, storage_path: storagePath, sha256: hash, mime_type: "application/pdf",
    file_size_bytes: file.size, status: "processing", processing_stage: "extraction", parser_version: PARSER_VERSION, created_by: user.id,
  }).select("*").single();
  if (documentError || !document) throw documentError ?? new Error("document_insert_failed");
  return { document: document as DocumentRow, duplicate: false, existingRun: false, bytes,
    idempotencyKey: `upload:${hash}:${PARSER_VERSION}`, startedBy: user.id };
}

async function createParseRun(admin: SupabaseClient, document: DocumentRow, startedBy: string, idempotencyKey: string | null) {
  const { data: latest } = await admin.from("supplier_quote_parse_runs").select("id,attempt").eq("document_id", document.id)
    .order("attempt", { ascending: false }).limit(1).maybeSingle();
  const { data: run, error } = await admin.from("supplier_quote_parse_runs").insert({
    document_id: document.id, attempt: Number(latest?.attempt ?? 0) + 1, status: "running", current_stage: "extraction",
    parser_version: PARSER_VERSION, candidate_schema_version: CANDIDATE_SCHEMA_VERSION, started_by: startedBy,
    retry_of: latest?.id ?? null, idempotency_key: idempotencyKey,
  }).select("*").single();
  if (error || !run) throw error ?? new Error("parse_run_create_failed");
  const { error: documentError } = await admin.from("supplier_quote_documents").update({ latest_parse_run_id: run.id,
    status: preserveConfirmedDocumentStatus(document.status, "processing"), processing_stage: "extraction",
    last_error_code: null, last_error_summary: null, updated_at: new Date().toISOString() }).eq("id", document.id);
  if (documentError) throw documentError;
  return run as { id: string };
}

async function updateStage(admin: SupabaseClient, runId: string, documentId: string, stage: string, stats: Record<string, unknown> = {}) {
  await Promise.all([
    admin.from("supplier_quote_parse_runs").update({ current_stage: stage, stage_stats: stats, updated_at: new Date().toISOString() }).eq("id", runId),
    admin.from("supplier_quote_documents").update({ processing_stage: stage, updated_at: new Date().toISOString() }).eq("id", documentId),
  ]);
}

async function executePipeline(admin: SupabaseClient, document: DocumentRow, run: { id: string }, bytes: ArrayBuffer) {
  const extraction = await extractPdf(new Uint8Array(bytes));
  const limited = limitExtractionIR(extraction, MAX_EXTRACTION_BYTES, 100);
  let extractionStoragePath: string | null = null;
  if (limited.requiresPrivateStorage) {
    extractionStoragePath = `${document.sha256.slice(0, 2)}/${document.sha256}/runs/${run.id}/extraction.json`;
    const { error } = await admin.storage.from(BUCKET).upload(extractionStoragePath,
      new Blob([JSON.stringify(extraction)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    if (error) throw new Error("storage_extraction_upload_failed");
  }
  await admin.from("supplier_quote_parse_runs").update({ extraction_storage_path: extractionStoragePath,
    extraction_summary: limited.summary }).eq("id", run.id);
  await admin.from("supplier_quote_documents").update({ extraction_storage_path: extractionStoragePath,
    extraction_summary: limited.summary, raw_extraction: limited.inline ?? limited.summary }).eq("id", document.id);
  const allText = extraction.pages.flatMap((page) => page.items.map((item) => item.text)).join("\n");
  if (!allText.trim()) {
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("supplier_quote_parse_runs").update({ status: "ocr_required", current_stage: "complete", finished_at: now,
        stage_stats: { ...limited.summary, candidateCount: 0 } }).eq("id", run.id),
      admin.from("supplier_quote_documents").update({ status: preserveConfirmedDocumentStatus(document.status, "ocr_required"), processing_stage: "complete", updated_at: now }).eq("id", document.id),
    ]);
    return await loadDocument(admin, document.id);
  }

  await updateStage(admin, run.id, document.id, "layout", limited.summary);
  const [{ data: suppliers, error: supplierError }, { data: profiles, error: profileError },
    { data: aliases, error: aliasError }, { data: items, error: itemError }] = await Promise.all([
    admin.from("suppliers").select("id,company_name").eq("is_active", true).order("company_name"),
    admin.from("supplier_quote_profiles").select("id,supplier_id,profile_version,layout_signature,is_active,table_mapping").eq("is_active", true),
    admin.from("supplier_quote_aliases").select("supplier_id,raw_meat_item_id,supplier_item_code,supplier_product_name,normalized_spec_fingerprint,confidence"),
    admin.from("raw_meat_items").select("id,name,english_name,sku").eq("is_active", true),
  ]);
  if (supplierError || profileError || aliasError || itemError) throw supplierError ?? profileError ?? aliasError ?? itemError;
  const supplierRows = (suppliers ?? []) as SupplierRow[];
  const supplierDetectionText = `${document.original_filename}\n${allText}`;
  const knownSupplierInputs = supplierRows.map((supplier) => ({ id: supplier.id, name: supplier.company_name }));
  const existingSupplierCandidates = detectSupplierCandidates(supplierDetectionText, knownSupplierInputs);
  const proposedSupplierCandidates = detectProposedSupplierCandidates(supplierDetectionText, knownSupplierInputs);
  const detectedSuppliers = [...existingSupplierCandidates, ...proposedSupplierCandidates];
  const uniqueSupplierIds = [...new Set(detectedSuppliers.filter((candidate) => !candidate.isNew).map((candidate) => candidate.value))];
  const supplierId = document.supplier_id
    ?? (!proposedSupplierCandidates.length && uniqueSupplierIds.length === 1 ? uniqueSupplierIds[0] ?? null : null);
  const allItems = (items ?? []).map((item: Record<string, unknown>) => ({ id: String(item.id), name: String(item.name),
    englishName: item.english_name ? String(item.english_name) : null, sku: item.sku ? String(item.sku) : null })) as MatchItem[];
  let linkedItemIds: string[] = [];
  if (supplierId) {
    const { data: links, error: linkError } = await admin.from("raw_meat_item_suppliers").select("raw_meat_item_id").eq("supplier_id", supplierId);
    if (linkError) throw linkError;
    linkedItemIds = (links ?? []).map((link: { raw_meat_item_id: string }) => link.raw_meat_item_id);
  }
  const matchScope = selectSupplierMatchItems(allItems, supplierId, linkedItemIds);
  const dateCandidates = detectDateCandidates(document.original_filename,
    extraction.pages.map((page) => ({ page: page.page, text: page.items.map((item) => item.text).join(" ") })));

  await updateStage(admin, run.id, document.id, "recognition", { ...limited.summary, profileCount: profiles?.length ?? 0 });
  const result = await recognizeDocument({ extraction, supplierId,
    profiles: (profiles ?? []).map((profile: Record<string, unknown>) => ({ id: String(profile.id), supplierId: String(profile.supplier_id),
      profileVersion: Number(profile.profile_version), layoutSignature: profile.layout_signature ? String(profile.layout_signature) : null,
      isActive: Boolean(profile.is_active), tableMapping: (profile.table_mapping ?? {}) as SupplierProfile["tableMapping"] })),
    aliases: (aliases ?? []).map((alias: Record<string, unknown>) => ({ supplierId: String(alias.supplier_id), rawMeatItemId: String(alias.raw_meat_item_id),
      supplierItemCode: alias.supplier_item_code ? String(alias.supplier_item_code) : null, supplierProductName: String(alias.supplier_product_name),
      normalizedSpecFingerprint: String(alias.normalized_spec_fingerprint), confidence: Number(alias.confidence) })) as MatchAlias[],
    allowedItems: matchScope.items, supplierScopeApplied: matchScope.supplierScopeApplied,
    ai: { enabled: Deno.env.get("SUPPLIER_QUOTE_AI_ENABLED") === "true", endpoint: Deno.env.get("SUPPLIER_QUOTE_AI_ENDPOINT"),
      apiKey: Deno.env.get("SUPPLIER_QUOTE_AI_API_KEY"), provider: Deno.env.get("SUPPLIER_QUOTE_AI_PROVIDER"),
      model: Deno.env.get("SUPPLIER_QUOTE_AI_MODEL"), timeoutMs: Number(Deno.env.get("SUPPLIER_QUOTE_AI_TIMEOUT_MS") ?? 20_000),
      maxRetries: Number(Deno.env.get("SUPPLIER_QUOTE_AI_MAX_RETRIES") ?? 0),
      maxInputChars: Number(Deno.env.get("SUPPLIER_QUOTE_AI_MAX_INPUT_CHARS") ?? 80_000),
      maxEstimatedCostUsd: Number(Deno.env.get("SUPPLIER_QUOTE_AI_MAX_COST_USD") ?? 1) },
    onAiChunkProgress: async ({ completedChunks, chunkCount, pageFrom, pageTo }) => {
      await updateStage(admin, run.id, document.id, "recognition", { ...limited.summary,
        profileCount: profiles?.length ?? 0, completedChunks, chunkCount, pageFrom, pageTo });
    },
  });
  await updateStage(admin, run.id, document.id, "validation", { ...limited.summary, candidateCount: result.candidates.length,
    aiStatus: result.aiResult.status, aiError: result.aiResult.error, aiChunkCount: result.aiResult.chunkCount,
    aiCompletedChunks: result.aiResult.completedChunks, aiFailedChunks: result.aiResult.failedChunks });
  const published = result.candidates.map((candidate) => ({
    supplier_id: supplierId, raw_meat_item_id: candidate.suggestedRawMeatItemId, supplier_item_code: candidate.supplierItemCode,
    product_name: candidate.productName, product_name_zh: candidate.productNameZh, origin: candidate.origin,
    size_text: candidate.sizeText, packing_text: candidate.packingText, processing_method: candidate.processingMethod,
    normalized_spec_fingerprint: candidate.normalizedSpecFingerprint, currency: candidate.currency, price_unit: candidate.priceUnit,
    quoted_price: candidate.quotedPrice, raw_quoted_price: candidate.rawPriceText, availability: candidate.availability,
    source_page: candidate.sourcePage, source_text: candidate.sourceText, source_block_id: candidate.sourceBlockId,
    raw_fields: candidate.rawFields, evidence: candidate.evidence, parser_version: candidate.parserVersion,
    profile_version: candidate.profileVersion, model_version: candidate.modelVersion,
    candidate_schema_version: candidate.schemaVersion, match_confidence: candidate.matchConfidence,
    match_reason: candidate.matchReason, match_breakdown: candidate.matchBreakdown,
    validation_errors: candidate.validationErrors, validation_warnings: candidate.validationWarnings,
  }));
  await updateStage(admin, run.id, document.id, "publishing", { ...limited.summary, candidateCount: published.length });
  const { error: publishError } = await admin.rpc("publish_supplier_quote_parse_run", { p_run_id: run.id, p_candidates: published,
    p_conditions: result.conditions.map((condition) => ({ condition_type: "other", raw_text: condition.rawText,
      source_page: condition.sourcePage, source_scope: condition.sourceScope, evidence: condition.evidence })) });
  if (publishError) throw publishError;
  const status = aggregateDocumentStatus({ extractedText: allText, candidateCount: published.length });
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("supplier_quote_parse_runs").update({ status, current_stage: "complete", profile_id: result.profile?.id ?? null,
      profile_version: result.profile?.profileVersion ?? null, model_provider: ["ok", "partial"].includes(result.aiResult.status) ? Deno.env.get("SUPPLIER_QUOTE_AI_PROVIDER") : null,
      model_name: ["ok", "partial"].includes(result.aiResult.status) ? Deno.env.get("SUPPLIER_QUOTE_AI_MODEL") : null,
      cost_stats: result.aiResult.costStats, finished_at: now, stage_stats: { ...limited.summary, candidateCount: published.length, conditionCount: result.conditions.length,
        aiStatus: result.aiResult.status, aiError: result.aiResult.error, aiChunkCount: result.aiResult.chunkCount,
        aiCompletedChunks: result.aiResult.completedChunks, aiFailedChunks: result.aiResult.failedChunks } }).eq("id", run.id),
    admin.from("supplier_quote_documents").update({ supplier_id: supplierId, detected_suppliers: detectedSuppliers,
      detected_dates: dateCandidates,
      quote_date: document.status === "confirmed" ? undefined : null,
      effective_date: document.status === "confirmed" ? undefined : null,
      status: preserveConfirmedDocumentStatus(document.status, status), processing_stage: "complete",
      last_error_code: published.length ? null : "no_candidates_recognized", last_error_summary: published.length ? null : "沒有可供審核的候選行",
      updated_at: now }).eq("id", document.id),
  ]);
  return await loadDocument(admin, document.id);
}

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const admin = createAdminClient();
  try {
    const user = await requirePermission(request, admin);
    const input = await requestInput(request, admin, user);
    if (input.existingRun && "existingDocumentId" in input && typeof input.existingDocumentId === "string") {
      const existing = await loadDocument(admin, input.existingDocumentId);
      return jsonResponse({ duplicate: true, ...existing });
    }
    if (input.existingRun && input.document) {
      const existing = await loadDocument(admin, input.document.id);
      return jsonResponse({ duplicate: true, ...existing });
    }
    if (!input.document || !input.bytes) throw new Error("pipeline_input_missing");
    const run = await createParseRun(admin, input.document, user.id, input.idempotencyKey ?? null);
    try {
      const result = await executePipeline(admin, input.document, run, input.bytes);
      return jsonResponse({ duplicate: input.duplicate, ...result });
    } catch (error) {
      const code = errorCode(error); const now = new Date().toISOString();
      await Promise.all([
        admin.from("supplier_quote_parse_runs").update({ status: "parse_failed", error_code: code,
          error_summary: "解析服务暂时未能完成，请稍后重试", is_recoverable: true, finished_at: now, updated_at: now }).eq("id", run.id),
        admin.from("supplier_quote_documents").update({ status: preserveConfirmedDocumentStatus(input.document.status, "parse_failed"), last_error_code: code,
          last_error_summary: "解析服务暂时未能完成，请稍后重试", updated_at: now }).eq("id", input.document.id),
      ]);
      console.error("supplier-quote-ingest", code);
      return jsonResponse({ error: code, diagnostic: "解析服务暂时未能完成，请稍后重试", retryable: true }, 500);
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const code = errorCode(error);
    console.error("supplier-quote-ingest", code);
    return jsonResponse({ error: code, diagnostic: "请求未能完成" }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
