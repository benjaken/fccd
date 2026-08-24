import { describe, expect, it, vi } from "vitest";
import amart from "./fixtures/supplier-quotes/amart-multicolumn.json";
import euro from "./fixtures/supplier-quotes/euro-mixed-table.json";
import taifung from "./fixtures/supplier-quotes/taifung-double-column.json";
import {
  aggregateDocumentStatus, assertCandidateArray, buildExtractionIR, buildLayoutIR, buildSpecFingerprint, CANDIDATE_SCHEMA_VERSION,
  detectConditions, detectDateCandidates, detectProposedSupplierCandidates, detectSupplierCandidates, layoutSignature,
  isPricedMeasurableProduct, limitExtractionIR, mapLayoutCandidates, matchCandidate, PARSER_VERSION,
  preserveConfirmedDocumentStatus, recognizeDocument, recognizeWithAi, selectProfile, selectSupplierMatchItems, validateCandidate, validatePdfUpload,
  type QuoteCandidate, type SupplierProfile,
} from "../supabase/functions/_shared/supplier-quote-recognition";

type Fixture = typeof amart;

function extraction(fixture: Fixture) {
  return buildExtractionIR(fixture.pages);
}

function candidate(overrides: Partial<QuoteCandidate> = {}): QuoteCandidate {
  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION, supplierItemCode: "AA-1", productName: "Chicken",
    productNameZh: null, origin: null, sizeText: "2kg", packingText: null, processingMethod: null,
    rawPriceText: "$42/kg", quotedPrice: 42, currency: "HKD", rawPriceUnit: "kg", priceUnit: "kg",
    availability: "quoted", conditions: [], sourcePage: 1, sourceText: "Chicken $42/kg", sourceBlockId: "p1-b1",
    rawFields: { price: "$42/kg" }, evidence: [{ page: 1, blockId: "p1-b1", cellIds: ["c1"], field: "record", text: "Chicken $42/kg" }],
    parserVersion: PARSER_VERSION, profileVersion: null, modelVersion: null,
    normalizedSpecFingerprint: "chicken|2kg|kg", matchConfidence: 0, matchReason: "", matchBreakdown: {},
    suggestedRawMeatItemId: null, validationErrors: [], validationWarnings: [], ...overrides,
  };
}

describe("supplier quote extraction and layout", () => {
  it("keeps stable page, coordinates, direction and reading order", () => {
    const ir = extraction(euro);
    expect(ir.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(ir.pages[0].items[0]).toMatchObject({ page: 1, direction: "ltr", readingOrder: 0 });
    expect(ir.pages[0].items.every((item, index) => item.readingOrder === index)).toBe(true);
    expect(ir.pages[0].items[0].bbox).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it.each([
    [amart, amart.expected.candidateCount, amart.expected.conditionCount],
    [euro, euro.expected.candidateCount, euro.expected.conditionCount],
    [taifung, taifung.expected.candidateCount, taifung.expected.conditionCount],
  ])("reconstructs the redacted fixture %#", (fixture, expectedCandidates, expectedConditions) => {
    const layout = buildLayoutIR(extraction(fixture as Fixture));
    expect(mapLayoutCandidates(layout, null)).toHaveLength(expectedCandidates);
    expect(detectConditions(layout)).toHaveLength(expectedConditions);
  });

  it("keeps double-column products in separate records", () => {
    const layout = buildLayoutIR(extraction(taifung));
    const priced = layout.pages[0].blocks.flatMap((block) => block.rows).filter((row) => /39\.80|320/.test(row.text));
    expect(new Set(priced.map((row) => row.column))).toEqual(new Set([0, 1]));
    expect(priced.every((row) => !(row.text.includes("39.80") && row.text.includes("320")))).toBe(true);
  });

  it("keeps three vertical catalogue cards in separate layout blocks", () => {
    const ir = buildExtractionIR([{ page: 21, width: 600, height: 800, items: [
      { text: "Item:", x: 25, y: 700, width: 25, height: 10 }, { text: "SS0033", x: 70, y: 700, width: 40, height: 10 },
      { text: "Item:", x: 225, y: 700, width: 25, height: 10 }, { text: "SS0033B", x: 270, y: 700, width: 47, height: 10 },
      { text: "Item:", x: 425, y: 700, width: 25, height: 10 }, { text: "SS0034", x: 470, y: 700, width: 40, height: 10 },
      { text: "Salsa Cheddar Sauce 520g", x: 25, y: 680, width: 190, height: 10 },
      { text: "Salsa Cheddar Sauce 2.3L", x: 225, y: 680, width: 190, height: 10 },
      { text: "Barbecue Sauce 2.65L", x: 425, y: 680, width: 150, height: 10 },
      { text: "Packing:", x: 25, y: 660, width: 43, height: 10 }, { text: "8 x 520g", x: 70, y: 660, width: 40, height: 10 },
      { text: "Packing:", x: 225, y: 660, width: 43, height: 10 }, { text: "4 x 2.3L", x: 270, y: 660, width: 40, height: 10 },
      { text: "Packing:", x: 425, y: 660, width: 43, height: 10 }, { text: "4 x 2.65L", x: 470, y: 660, width: 45, height: 10 },
      { text: "Price:", x: 25, y: 640, width: 30, height: 10 }, { text: "$48/squeezer", x: 70, y: 640, width: 67, height: 10 },
      { text: "Price:", x: 225, y: 640, width: 30, height: 10 }, { text: "$196/pet", x: 270, y: 640, width: 43, height: 10 },
      { text: "Price:", x: 425, y: 640, width: 30, height: 10 }, { text: "$183/pet", x: 470, y: 640, width: 43, height: 10 },
    ] }]);
    const blocks = buildLayoutIR(ir).pages[0].blocks;

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.column)).toEqual([0, 1, 2]);
    expect(blocks.map((block) => block.text)).toEqual([
      expect.stringContaining("Salsa Cheddar Sauce 520g"),
      expect.stringContaining("Salsa Cheddar Sauce 2.3L"),
      expect.stringContaining("Barbecue Sauce 2.65L"),
    ]);
    expect(blocks.every((block) => !((block.text.match(/SS0033|SS0033B|SS0034/g) ?? []).length > 1))).toBe(true);
  });

  it("does not treat SKU or package-weight digits as quoted prices", () => {
    const ir = buildExtractionIR([{ page: 1, width: 600, height: 800, items: [
      { text: "Item: SS0033", x: 40, y: 700, width: 70, height: 10 },
      { text: "Salsa Cheddar Sauce 520g", x: 120, y: 700, width: 145, height: 10 },
    ] }]);

    expect(mapLayoutCandidates(buildLayoutIR(ir), null)).toEqual([]);
  });

  it("moves large IRs to private storage instead of unlimited inline JSON", () => {
    const limited = limitExtractionIR(extraction(euro), 100, 1);
    expect(limited.requiresPrivateStorage).toBe(true);
    expect(limited.inline).toBeNull();
    expect(limited.summary).toMatchObject({ pageCount: 2, overflow: true });
  });

  it("validates size, type and PDF magic before persistence", () => {
    expect(validatePdfUpload({ name: "x.pdf", mimeType: "application/pdf", size: 5, header: "%PDF-" }, 100)).toBeNull();
    expect(validatePdfUpload({ name: "x.pdf", mimeType: "application/pdf", size: 0, header: "%PDF-" }, 100)).toBe("pdf_file_size_invalid");
    expect(validatePdfUpload({ name: "x.txt", mimeType: "text/plain", size: 5, header: "%PDF-" }, 100)).toBe("pdf_file_required");
    expect(validatePdfUpload({ name: "x.pdf", mimeType: "application/pdf", size: 5, header: "hello" }, 100)).toBe("pdf_content_invalid");
  });

  it("aggregates OCR, recoverable failure and review states deterministically", () => {
    expect(aggregateDocumentStatus({ extractedText: "", candidateCount: 0 })).toBe("ocr_required");
    expect(aggregateDocumentStatus({ extractedText: "content", candidateCount: 0 })).toBe("parse_failed");
    expect(aggregateDocumentStatus({ extractedText: "content", candidateCount: 1 })).toBe("review");
    expect(aggregateDocumentStatus({ extractedText: "content", candidateCount: 1, recoverableError: true })).toBe("parse_failed");
    expect(preserveConfirmedDocumentStatus("confirmed", "processing")).toBe("confirmed");
    expect(preserveConfirmedDocumentStatus("confirmed", "parse_failed")).toBe("confirmed");
    expect(preserveConfirmedDocumentStatus("review", "processing")).toBe("processing");
  });
});

describe("profiles, validation and matching", () => {
  it("selects the newest active matching profile and stops on signature drift", () => {
    const signature = layoutSignature(extraction(amart));
    const profiles: SupplierProfile[] = [
      { id: "old", supplierId: "s1", profileVersion: 1, layoutSignature: signature, isActive: true, tableMapping: {} },
      { id: "new", supplierId: "s1", profileVersion: 2, layoutSignature: signature, isActive: true, tableMapping: {} },
    ];
    expect(selectProfile(profiles, signature, "s1")?.id).toBe("new");
    expect(selectProfile(profiles, `${signature}-changed`, "s1")).toBeNull();
  });

  it("uses profile column rules as data-driven field mappings", () => {
    const ir = buildExtractionIR([{ page: 1, width: 600, height: 800, items: [
      { text: "$55/kg", x: 30, y: 700, width: 45, height: 10 },
      { text: "PF-9", x: 100, y: 700, width: 30, height: 10 },
      { text: "Pork Collar", x: 160, y: 700, width: 70, height: 10 },
    ] }]);
    const profile: SupplierProfile = { id: "p1", supplierId: "s1", profileVersion: 3,
      layoutSignature: layoutSignature(ir), isActive: true,
      tableMapping: { columns: ["price", "supplier_item_code", "product_name"] } };
    const mapped = mapLayoutCandidates(buildLayoutIR(ir), profile)[0];
    expect(mapped).toMatchObject({ supplierItemCode: "PF-9", productName: "Pork Collar", quotedPrice: 55, priceUnit: "kg", profileVersion: 3 });
    expect(mapped.rawFields).toEqual({ price: "$55/kg", supplier_item_code: "PF-9", product_name: "Pork Collar" });
  });

  it("rejects unsupported prices and never guesses TBA or unknown units", () => {
    const unsupported = validateCandidate(candidate({ quotedPrice: 99 }));
    expect(unsupported.quotedPrice).toBeNull();
    expect(unsupported.validationErrors).toContain("price_not_supported_by_evidence");
    const tba = validateCandidate(candidate({ availability: "tba", quotedPrice: 0, rawPriceText: "TBA", priceUnit: null }));
    expect(tba.quotedPrice).toBeNull();
    expect(tba.priceUnit).toBeNull();
    expect(tba.validationWarnings).toContain("price_unit_requires_review");
  });

  it("recognizes per-pack prices as the configured pack unit", () => {
    const ir = buildExtractionIR([{ page: 1, width: 600, height: 800, items: [
      { text: "$66.00/pack", x: 30, y: 700, width: 75, height: 10 },
      { text: "BS-ABC", x: 115, y: 700, width: 45, height: 10 },
      { text: "Raw Beef Skewers", x: 170, y: 700, width: 110, height: 10 },
    ] }]);
    expect(mapLayoutCandidates(buildLayoutIR(ir), null)[0]).toMatchObject({
      quotedPrice: 66,
      rawPriceUnit: "pack",
      priceUnit: "pack",
    });
  });

  it("keeps date and supplier source evidence and conflicts", () => {
    const dates = detectDateCandidates("quote-2026-08-01.pdf", [{ page: 1, text: "有效日期 2026-08-05" }], "2026-08-03");
    expect(new Set(dates.map((item) => item.value))).toEqual(new Set(["2026-08-01", "2026-08-05", "2026-08-03"]));
    expect(new Set(dates.map((item) => item.sourceType))).toEqual(new Set(["filename", "content", "metadata"]));
    expect(detectSupplierCandidates("Price list from A-Mart", [{ id: "s1", name: "A-Mart" }])[0]).toMatchObject({ value: "s1", sourceText: "A-Mart" });
    expect(detectSupplierCandidates("Unknown vendor", [{ id: "s1", name: "A-Mart" }])).toEqual([]);
    expect(detectProposedSupplierCandidates("Supplier: New Frozen Foods Ltd", [{ name: "A-Mart" }])[0])
      .toMatchObject({ value: "New Frozen Foods Ltd", sourceText: "New Frozen Foods Ltd", isNew: true });
    expect(detectProposedSupplierCandidates("A-Mart Gourmet Ltd. 浩運食品有限公司", [{ name: "A-Mart 浩運食品 (AM)" }])[0])
      .toMatchObject({ value: "A-Mart Gourmet Ltd. 浩運食品有限公司", isNew: true });
    expect(detectProposedSupplierCandidates("Supplier: N/A", [{ name: "A-Mart" }])).toEqual([]);
  });

  it("uses a deterministic fingerprint so same-name variants stay distinct", () => {
    const box = buildSpecFingerprint({ name: "Pork Belly", size: "2kg", packing: "6 bags", priceUnit: "box" });
    const kg = buildSpecFingerprint({ name: "Pork Belly", size: "2kg", packing: "6 bags", priceUnit: "kg" });
    expect(box).not.toBe(kg);
    expect(box).toBe(buildSpecFingerprint({ name: "Pork Belly", size: "2kg", packing: "6 bags", priceUnit: "box" }));
  });

  it("matches exact aliases first and never escapes supplier-linked items", () => {
    const input = candidate();
    const matched = matchCandidate(input, "s1", [{ supplierId: "s1", rawMeatItemId: "i1", supplierItemCode: "AA-1",
      supplierProductName: "Chicken", normalizedSpecFingerprint: input.normalizedSpecFingerprint, confidence: 0.98 }],
    [{ id: "i1", name: "Chicken" }]);
    expect(matched).toMatchObject({ suggestedRawMeatItemId: "i1", matchConfidence: 0.98 });
    expect(matched.matchReason).toContain("alias");
    const scoped = matchCandidate(input, "s1", [], [{ id: "i2", name: "Beef" }]);
    expect(scoped.suggestedRawMeatItemId).toBeNull();
    expect(scoped.matchBreakdown.supplierScopeApplied).toBe(true);
  });
});

describe("provider-neutral AI fallback", () => {
  const blocks = buildLayoutIR(extraction(amart)).pages[0].blocks;
  const evidenceCandidate = () => {
    const block = blocks[0];
    const row = block.rows[0];
    const cell = row.cells[0];
    return candidate({ sourcePage: block.page, sourceText: row.text, sourceBlockId: block.id,
      evidence: [{ page: block.page, blockId: block.id, cellIds: [cell.id], field: "record", text: cell.text }] });
  };
  const config = { enabled: true, endpoint: "https://provider.invalid/v1", apiKey: "top-secret", provider: "mock",
    model: "mock-1", timeoutMs: 20, maxRetries: 0, maxInputChars: 100_000, maxEstimatedCostUsd: 1 };

  it("accepts strict candidate JSON and sends only sanitized layout blocks", async () => {
    let sent = "";
    const valid = evidenceCandidate();
    const invalidEvidence = { ...valid, productName: "Invalid evidence", sourceBlockId: "missing-block" };
    const result = await recognizeWithAi(blocks, { ...config, fetchImpl: vi.fn(async (_url, init) => {
      sent = String(init?.body);
      return new Response(JSON.stringify({ candidates: [valid, invalidEvidence] }), { status: 200 });
    }) });
    expect(result.status).toBe("ok");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].productName).toBe(valid.productName);
    expect(sent).not.toContain("top-secret");
    expect(sent).not.toMatch(/storage_path|storage url|client_secret|%PDF/i);
  });

  it("uses the OpenAI Responses structured-output contract and reads output_text", async () => {
    let sent: Record<string, unknown> = {};
    const source = evidenceCandidate();
    const result = await recognizeWithAi(blocks, { ...config, provider: "openai",
      endpoint: "https://api.openai.com/v1/responses", model: "gpt-5.6-luna",
      fetchImpl: vi.fn(async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ output_text: JSON.stringify({ candidates: [source] }) }), { status: 200 });
      }) });
    expect(sent).toMatchObject({ model: "gpt-5.6-luna", store: false,
      text: { format: { type: "json_schema", strict: true } } });
    expect(sent).not.toHaveProperty("response_format");
    expect(result).toMatchObject({ status: "ok", candidates: [{ modelVersion: "gpt-5.6-luna" }] });
  });

  it("uses DeepSeek Chat Completions JSON Output and reads message content", async () => {
    let sent: Record<string, unknown> = {};
    const source = evidenceCandidate();
    const result = await recognizeWithAi(blocks, { ...config, provider: "deepseek",
      endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
      fetchImpl: vi.fn(async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [source] }) } }] }), { status: 200 });
      }) });
    expect(sent).toMatchObject({ model: "deepseek-v4-flash", response_format: { type: "json_object" },
      thinking: { type: "disabled" }, stream: false });
    expect(sent).toHaveProperty("messages");
    expect(sent).not.toHaveProperty("input");
    expect(sent).not.toHaveProperty("text");
    expect(result).toMatchObject({ status: "ok", candidates: [{ modelVersion: "deepseek-v4-flash" }] });
  });

  it("fails closed when DeepSeek returns empty content", async () => {
    const result = await recognizeWithAi(blocks, { ...config, provider: "deepseek",
      endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })) });
    expect(result).toMatchObject({ status: "failed", candidates: [], error: "deepseek_output_content_missing" });
  });

  it("uses xAI Chat Completions structured JSON and reads Grok message content", async () => {
    let sent: Record<string, unknown> = {};
    const source = evidenceCandidate();
    const result = await recognizeWithAi(blocks, { ...config, provider: "xai",
      endpoint: "https://api.x.ai/v1/chat/completions", model: "grok-4.6",
      fetchImpl: vi.fn(async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [source] }) } }] }), { status: 200 });
      }) });
    expect(sent).toMatchObject({ model: "grok-4.6", response_format: { type: "json_object" },
      reasoning_effort: "low", stream: false });
    expect(sent).toHaveProperty("messages");
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("input");
    expect(result).toMatchObject({ status: "ok", candidates: [{ modelVersion: "grok-4.6" }] });
  });

  it("fails closed for malformed JSON, timeout and unconfigured provider", async () => {
    const malformed = await recognizeWithAi(blocks, { ...config, fetchImpl: vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ productName: "missing evidence" }] }), { status: 200 })) });
    expect(malformed).toMatchObject({ status: "failed", candidates: [] });
    const timedOut = await recognizeWithAi(blocks, { ...config, timeoutMs: 1, fetchImpl: vi.fn((_url, init) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) });
    expect(timedOut.status).toBe("failed");
    const unconfigured = await recognizeWithAi(blocks, { ...config, apiKey: undefined });
    expect(unconfigured).toMatchObject({ status: "unconfigured", candidates: [] });
  });

  it("keeps deterministic recognition usable with AI disabled or enabled", async () => {
    const base = { extraction: extraction(amart), profiles: [], supplierId: null, aliases: [], allowedItems: [] };
    const disabled = await recognizeDocument({ ...base, ai: { ...config, enabled: false } });
    const enabled = await recognizeDocument({ ...base, ai: { ...config, fetchImpl: vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })) } });
    expect(disabled.candidates).toHaveLength(1);
    expect(enabled.candidates).toHaveLength(1);
    expect(disabled.aiResult.status).toBe("disabled");
    expect(enabled.aiResult.status).toBe("ok");
  });

  it("keeps only vertical-card products that have both a measurable size and an explicit price", async () => {
    const ir = buildExtractionIR([{ page: 21, width: 600, height: 800, items: [
      { text: "Item: SS0033", x: 40, y: 700, width: 70, height: 10 },
      { text: "Salsa Cheddar Sauce 520g Squeezer", x: 40, y: 680, width: 180, height: 10 },
      { text: "Packing: 8 x 520g", x: 40, y: 660, width: 105, height: 10 },
      { text: "Price: $48/squeezer", x: 40, y: 640, width: 110, height: 10 },
    ] }]);
    const block = buildLayoutIR(ir).pages[0].blocks[0];
    const cells = block.rows.flatMap((row) => row.cells);
    const evidence = cells.map((cell) => ({ page: 21, blockId: block.id, cellIds: [cell.id], field: "record", text: cell.text }));
    const valid = candidate({ productName: "Salsa Cheddar Sauce", sizeText: "520g", packingText: "8 x 520g",
      rawPriceText: "$48/squeezer", quotedPrice: 48, rawPriceUnit: "squeezer", priceUnit: null,
      sourcePage: 21, sourceBlockId: block.id, sourceText: block.text, evidence });
    const strayLabel = candidate({ productName: "Price:", sizeText: "520g", packingText: "8 x 520g",
      rawPriceText: "$48/squeezer", quotedPrice: 48, rawPriceUnit: "squeezer", priceUnit: null,
      sourcePage: 21, sourceBlockId: block.id, sourceText: block.text, evidence });
    const packingAsName = candidate({ productName: "Packing: 8 x 520g", sizeText: "520g", packingText: "8 x 520g",
      rawPriceText: "$48/squeezer", quotedPrice: 48, rawPriceUnit: "squeezer", priceUnit: null,
      sourcePage: 21, sourceBlockId: block.id, sourceText: block.text, evidence });
    const skuAsName = candidate({ productName: "HP0004", sizeText: "520g", packingText: "8 x 520g",
      rawPriceText: "$48/squeezer", quotedPrice: 48, rawPriceUnit: "squeezer", priceUnit: null,
      sourcePage: 21, sourceBlockId: block.id, sourceText: block.text, evidence });

    const result = await recognizeDocument({ extraction: ir, profiles: [], supplierId: null, aliases: [], allowedItems: [],
      ai: { ...config, fetchImpl: vi.fn(async () => new Response(JSON.stringify({ candidates: [valid, strayLabel, packingAsName, skuAsName] }), { status: 200 })) } });

    expect(result.candidates.map((entry) => entry.productName)).toEqual(["Salsa Cheddar Sauce"]);
  });

  it("maps container labels to unit pricing and rejects volume-only products from meat comparison", () => {
    const pricedBottle = candidate({
      productName: "Salsa Cheddar Sauce",
      sizeText: "520g",
      packingText: "8 x 520g",
      rawPriceText: "$48/squeezer",
      rawPriceUnit: "squeezer",
      priceUnit: null,
    });
    const [normalized] = assertCandidateArray([pricedBottle]);
    expect(normalized.priceUnit).toBe("unit");
    expect(isPricedMeasurableProduct(normalized)).toBe(true);

    expect(isPricedMeasurableProduct(candidate({
      productName: "Salsa Barbecue Sauce",
      sizeText: "2.65L",
      packingText: "4 x 2.65L",
      rawPriceText: "$183/pet",
      rawPriceUnit: "pet",
      priceUnit: null,
    }))).toBe(false);
  });

  it("keeps system meat items available before supplier links are confirmed", () => {
    const allItems = [
      { id: "chicken", name: "急凍雞胸", englishName: "Frozen Chicken Breast", sku: "CHK-1" },
      { id: "beef", name: "急凍牛肉", englishName: "Frozen Beef", sku: "BEF-1" },
    ];

    const unknownSupplierScope = selectSupplierMatchItems(allItems, null, []);
    const knownSupplierWithoutLinks = selectSupplierMatchItems(allItems, "supplier-1", []);
    expect(unknownSupplierScope.items).toEqual(allItems);
    expect(knownSupplierWithoutLinks.items).toEqual(allItems);
    expect(matchCandidate(candidate({ productName: "Frozen Chicken Breast" }), null, [], unknownSupplierScope.items)
      .suggestedRawMeatItemId).toBe("chicken");
  });

  it("segments a large multi-page PDF into bounded AI recognition requests", async () => {
    const sourcePage = euro.pages[0];
    const largeExtraction = buildExtractionIR(Array.from({ length: 12 }, (_, index) => ({
      ...sourcePage,
      page: index + 1,
      items: sourcePage.items.map((item) => ({ ...item })),
    })));
    const requestSizes: number[] = [];
    let concurrentRequests = 0;
    let maxConcurrentRequests = 0;
    const result = await recognizeDocument({
      extraction: largeExtraction,
      profiles: [],
      supplierId: null,
      aliases: [],
      allowedItems: [],
      ai: {
        ...config,
        maxInputChars: 6_000,
        maxEstimatedCostUsd: 1,
        fetchImpl: vi.fn(async (_url, init) => {
          concurrentRequests += 1;
          maxConcurrentRequests = Math.max(maxConcurrentRequests, concurrentRequests);
          requestSizes.push(String(init?.body).length);
          await new Promise((resolve) => setTimeout(resolve, 5));
          concurrentRequests -= 1;
          return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
        }),
      },
    });

    expect(requestSizes.length).toBeGreaterThan(1);
    expect(result.aiResult.status).toBe("ok");
    expect(result.aiResult.chunkCount).toBe(requestSizes.length);
    expect(maxConcurrentRequests).toBeGreaterThan(1);
    expect(maxConcurrentRequests).toBeLessThanOrEqual(5);
  });
});
