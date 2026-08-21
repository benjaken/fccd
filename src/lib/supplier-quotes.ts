export type QuoteDocumentStatus = "confirmed" | "draft" | "parse_failed";
export type QuoteStatus = QuoteDocumentStatus;
export type QuoteAvailability = "quoted" | "tba" | "unavailable";

export type QuoteConditionType =
  | "surcharge"
  | "discount"
  | "minimum_quantity"
  | "delivery"
  | "payment"
  | "other";

export type QuoteConditionState =
  | "confirmed"
  | "pending"
  | "rejected"
  | "not_applicable";

export type QuoteConditionSummaryState = "none" | "confirmed" | "pending";

export interface QuoteCondition {
  id?: string;
  rawText: string;
  type?: QuoteConditionType;
  state?: Exclude<QuoteConditionState, "not_applicable">;
  status?: Exclude<QuoteConditionState, "not_applicable">;
  confirmed?: boolean;
  isConfirmed?: boolean;
  amount?: number | null;
  percentage?: number | null;
  quantity?: number | null;
  unit?: string | null;
  appliesTo?: string | null;
}

export interface QuoteLine {
  id: string;
  documentId?: string | null;
  supplierId: string;
  supplierName?: string | null;
  supplierItemCode?: string | null;
  rawMeatItemId?: string | null;
  productName: string;
  productNameZh?: string | null;
  origin?: string | null;
  sizeText?: string | null;
  packingText?: string | null;
  processingMethod?: string | null;
  specFingerprint?: string | null;
  normalizedSpecFingerprint?: string | null;
  currency: string;
  priceUnit: string;
  availability: QuoteAvailability;
  quotedPrice: number | null;
  rawQuotedPrice?: string | null;
  actualInboundPrice?: number | null;
  actualInboundUnitPrice?: number | null;
  actualInboundPriceDate?: string | null;
  quoteDate?: string | null;
  effectiveDate?: string | null;
  confirmedAt?: string | null;
  createdAt?: string | null;
  version?: number | null;
  status?: QuoteDocumentStatus;
  documentStatus?: QuoteDocumentStatus;
  sourcePage?: number | null;
  sourceText?: string | null;
  originalFilename?: string | null;
  conditions?: readonly QuoteCondition[];
}

export interface QuoteDocument {
  id: string;
  supplierId: string;
  supplierName: string;
  quoteDate: string;
  effectiveDate?: string | null;
  status: QuoteDocumentStatus;
  originalFilename?: string | null;
  confirmedAt?: string | null;
  lines?: readonly QuoteLine[];
}

export interface QuoteSpecFingerprintInput {
  supplierItemCode?: string | null;
  productName?: string | null;
  productNameZh?: string | null;
  origin?: string | null;
  sizeText?: string | null;
  packingText?: string | null;
  processingMethod?: string | null;
}

export type QuoteComparisonState =
  | "comparable"
  | "new_item"
  | "tba"
  | "unavailable"
  | "spec_changed"
  | "unit_changed"
  | "currency_changed"
  | "no_previous_price"
  | "zero_previous_price"
  | "no_latest_price";

export interface QuotePriceChange {
  priceDelta: number | null;
  changeRate: number | null;
  changePercent: number | null;
  isComparable: boolean;
}

export interface QuoteComparison {
  key: string;
  comparisonKey: string;
  supplierId: string;
  supplierName: string | null;
  rawMeatItemId: string | null;
  supplierItemCode: string | null;
  productName: string;
  productNameZh: string | null;
  baseline: QuoteLine | null;
  previous: QuoteLine | null;
  latest: QuoteLine;
  history: readonly QuoteLine[];
  baselinePrice: number | null;
  previousPrice: number | null;
  latestPrice: number | null;
  priceDelta: number | null;
  changeRate: number | null;
  delta: number | null;
  changePercent: number | null;
  comparisonState: QuoteComparisonState;
  state: QuoteComparisonState;
  isComparable: boolean;
  specChanged: boolean;
  unitChanged: boolean;
  currencyChanged: boolean;
  requiresReview: boolean;
  conditionState: QuoteConditionSummaryState;
  quoteStatus: QuoteDocumentStatus;
  availability: QuoteAvailability;
}

export interface QuoteComparisonOptions {
  /** PRD 規定 draft/parse_failed 不可進入正式比較；僅在需要審核畫面時才開啟。 */
  includeUnconfirmed?: boolean;
}

export interface QuoteThreshold {
  upPercent?: number | null;
  downPercent?: number | null;
  increasePercent?: number | null;
  decreasePercent?: number | null;
  increasePercentThreshold?: number | null;
  decreasePercentThreshold?: number | null;
  upAmount?: number | null;
  downAmount?: number | null;
  increaseAmount?: number | null;
  decreaseAmount?: number | null;
  includeSpecChanges?: boolean;
  includeNewItems?: boolean;
  includeTba?: boolean;
  includeUnavailable?: boolean;
}

export interface ResolvedQuoteThreshold {
  upPercent: number;
  downPercent: number;
  increasePercent: number;
  decreasePercent: number;
  upAmount: number | null;
  downAmount: number | null;
  increaseAmount: number | null;
  decreaseAmount: number | null;
  includeSpecChanges: boolean;
  includeNewItems: boolean;
  includeTba: boolean;
  includeUnavailable: boolean;
}

export const DEFAULT_QUOTE_THRESHOLD: Readonly<ResolvedQuoteThreshold> = Object.freeze({
  upPercent: 10,
  downPercent: 10,
  increasePercent: 10,
  decreasePercent: 10,
  upAmount: null,
  downAmount: null,
  increaseAmount: null,
  decreaseAmount: null,
  includeSpecChanges: true,
  includeNewItems: true,
  includeTba: true,
  includeUnavailable: true,
});

export type QuoteAlertState =
  | "normal"
  | "increase"
  | "decrease"
  | "new_item"
  | "tba"
  | "unavailable"
  | "spec_changed"
  | "unit_changed"
  | "currency_changed"
  | "not_comparable";

export interface QuoteAlertSnapshot {
  comparisonState?: QuoteComparisonState;
  state?: QuoteComparisonState;
  availability?: QuoteAvailability;
  latest?: QuoteLine | null;
  previous?: QuoteLine | null;
  latestPrice?: number | null;
  previousPrice?: number | null;
  priceDelta?: number | null;
  changeRate?: number | null;
  specChanged?: boolean;
}

export type QuoteAlertInput = QuoteComparison | QuoteAlertSnapshot;

export interface QuoteAlert {
  state: QuoteAlertState;
  reason: QuoteAlertState;
  triggered: boolean;
  isAlert: boolean;
  isAnomaly: boolean;
  shouldReview: boolean;
  priceDelta: number | null;
  changeRate: number | null;
  percentExceeded: boolean;
  amountExceeded: boolean;
  threshold: ResolvedQuoteThreshold;
}

export interface QuoteConditionEvaluation {
  state: QuoteConditionState;
  isResolved: boolean;
  requiresReview: boolean;
  label: string;
}

export interface SupplierQuoteCsvRow {
  supplierId: string;
  supplierName: string;
  quoteDate: string;
  effectiveDate: string;
  productName: string;
  productNameZh: string;
  supplierItemCode: string;
  rawMeatItemId: string;
  specFingerprint: string;
  normalizedSpecFingerprint: string;
  origin: string;
  sizeText: string;
  packingText: string;
  processingMethod: string;
  availability: string;
  quoteStatus: string;
  currency: string;
  priceUnit: string;
  rawQuotedPrice: string;
  baselinePrice: string;
  previousPrice: string;
  latestPrice: string;
  priceDelta: string;
  changeRate: string;
  pdfQuotedPrice: string;
  actualInboundPrice: string;
  actualInboundUnitPrice: string;
  actualInboundPriceDate: string;
  conditionState: string;
  conditions: string;
  comparisonState: string;
  alertState: string;
  alertTriggered: string;
  sourcePage: string;
  sourceText: string;
  originalFilename: string;
}

export const SUPPLIER_QUOTE_CSV_COLUMNS = [
  "supplierId",
  "supplierName",
  "quoteDate",
  "effectiveDate",
  "productName",
  "productNameZh",
  "supplierItemCode",
  "rawMeatItemId",
  "specFingerprint",
  "normalizedSpecFingerprint",
  "origin",
  "sizeText",
  "packingText",
  "processingMethod",
  "availability",
  "quoteStatus",
  "currency",
  "priceUnit",
  "rawQuotedPrice",
  "baselinePrice",
  "previousPrice",
  "latestPrice",
  "priceDelta",
  "changeRate",
  "pdfQuotedPrice",
  "actualInboundPrice",
  "actualInboundUnitPrice",
  "actualInboundPriceDate",
  "conditionState",
  "conditions",
  "comparisonState",
  "alertState",
  "alertTriggered",
  "sourcePage",
  "sourceText",
  "originalFilename",
] as const satisfies readonly (keyof SupplierQuoteCsvRow)[];

export type SupplierQuoteCsvColumn = (typeof SUPPLIER_QUOTE_CSV_COLUMNS)[number];

export interface SupplierQuoteCsvOptions {
  includeBom?: boolean;
  bom?: boolean;
  delimiter?: string;
  lineEnding?: "\n" | "\r\n";
  threshold?: QuoteThreshold;
  headers?: Partial<Record<SupplierQuoteCsvColumn, string>>;
  comparisonOptions?: QuoteComparisonOptions;
}

export type SupplierQuoteExportInput =
  | readonly QuoteLine[]
  | readonly QuoteDocument[]
  | readonly QuoteComparison[]
  | {
      lines?: readonly QuoteLine[];
      documents?: readonly QuoteDocument[];
      comparisons?: readonly QuoteComparison[];
    };

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeFingerprintPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function getLineStatus(line: QuoteLine): QuoteDocumentStatus {
  return line.status ?? line.documentStatus ?? "confirmed";
}

function getLineFingerprint(line: QuoteLine): string {
  return (
    nonEmpty(line.normalizedSpecFingerprint) ??
    nonEmpty(line.specFingerprint) ??
    buildQuoteSpecFingerprint(line)
  );
}

function getLinePrice(line: QuoteLine | null | undefined): number | null {
  return line ? finiteNumber(line.quotedPrice) : null;
}

function getActualInboundPrice(line: QuoteLine): number | null {
  return finiteNumber(line.actualInboundPrice) ?? finiteNumber(line.actualInboundUnitPrice);
}

function getLineQuoteDate(line: QuoteLine): string {
  return (
    nonEmpty(line.quoteDate) ??
    nonEmpty(line.effectiveDate) ??
    nonEmpty(line.confirmedAt) ??
    nonEmpty(line.createdAt) ??
    ""
  );
}

function getLineIdentity(line: QuoteLine): string {
  const itemIdentity =
    nonEmpty(line.rawMeatItemId) ??
    nonEmpty(line.supplierItemCode) ??
    normalizeFingerprintPart(line.productName);
  return `${line.supplierId}::${itemIdentity}`;
}

function getLineVariantKey(line: QuoteLine): string {
  return JSON.stringify([
    getLineFingerprint(line),
    normalizeFingerprintPart(line.priceUnit),
    normalizeFingerprintPart(line.currency),
  ]);
}

function isQuoteDocument(value: QuoteLine | QuoteDocument): value is QuoteDocument {
  return "lines" in value || ("status" in value && !("productName" in value));
}

function isQuoteComparison(value: QuoteLine | QuoteComparison): value is QuoteComparison {
  return "comparisonState" in value && "latest" in value;
}

function flattenQuoteInput(
  input: readonly QuoteLine[] | readonly QuoteDocument[],
): readonly QuoteLine[] {
  if (!input.length) return [];
  if (!isQuoteDocument(input[0])) return input as readonly QuoteLine[];
  return (input as readonly QuoteDocument[]).flatMap((document) => document.lines ?? []);
}

function summarizeConditions(
  conditions: readonly QuoteCondition[] | undefined,
): QuoteConditionSummaryState {
  if (!conditions?.length) return "none";
  return conditions.some(
    (condition) => evaluateQuoteConditionState(condition) !== "confirmed",
  )
    ? "pending"
    : "confirmed";
}

function comparisonVariantDifference(
  previous: QuoteLine,
  latest: QuoteLine,
): Pick<QuoteComparison, "specChanged" | "unitChanged" | "currencyChanged"> {
  return {
    specChanged: getLineFingerprint(previous) !== getLineFingerprint(latest),
    unitChanged:
      normalizeFingerprintPart(previous.priceUnit) !== normalizeFingerprintPart(latest.priceUnit),
    currencyChanged:
      normalizeFingerprintPart(previous.currency) !== normalizeFingerprintPart(latest.currency),
  };
}

function lineSort(left: QuoteLine, right: QuoteLine): number {
  const quoteDateResult = compareText(getLineQuoteDate(left), getLineQuoteDate(right));
  if (quoteDateResult) return quoteDateResult;

  const confirmedAtResult = compareText(
    nonEmpty(left.confirmedAt) ?? nonEmpty(left.createdAt) ?? "",
    nonEmpty(right.confirmedAt) ?? nonEmpty(right.createdAt) ?? "",
  );
  if (confirmedAtResult) return confirmedAtResult;

  const versionLeft = finiteNumber(left.version) ?? 0;
  const versionRight = finiteNumber(right.version) ?? 0;
  if (versionLeft !== versionRight) return versionLeft - versionRight;
  return compareText(left.id, right.id);
}

function buildComparison(key: string, lines: readonly QuoteLine[]): QuoteComparison {
  const history = [...lines].sort(lineSort);
  const baseline = history[0] ?? null;
  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const latestPrice = getLinePrice(latest);
  const previousPrice = getLinePrice(previous);
  const baselinePrice = getLinePrice(baseline);
  const difference = previous ? comparisonVariantDifference(previous, latest) : null;

  let comparisonState: QuoteComparisonState;
  if (latest.availability === "tba") {
    comparisonState = "tba";
  } else if (latest.availability === "unavailable") {
    comparisonState = "unavailable";
  } else if (!previous) {
    comparisonState = "new_item";
  } else if (difference?.specChanged) {
    comparisonState = "spec_changed";
  } else if (difference?.unitChanged) {
    comparisonState = "unit_changed";
  } else if (difference?.currencyChanged) {
    comparisonState = "currency_changed";
  } else if (previousPrice === null) {
    comparisonState = "no_previous_price";
  } else if (previousPrice === 0) {
    comparisonState = "zero_previous_price";
  } else if (latestPrice === null) {
    comparisonState = "no_latest_price";
  } else {
    comparisonState = "comparable";
  }

  const priceChange =
    comparisonState === "comparable"
      ? calculateQuoteChange(previousPrice, latestPrice)
      : { priceDelta: null, changeRate: null, changePercent: null, isComparable: false };
  const conditionState = summarizeConditions(latest.conditions);

  return {
    key,
    comparisonKey: `${key}::${getLineVariantKey(latest)}`,
    supplierId: latest.supplierId,
    supplierName: nonEmpty(latest.supplierName),
    rawMeatItemId: nonEmpty(latest.rawMeatItemId),
    supplierItemCode: nonEmpty(latest.supplierItemCode),
    productName: latest.productName,
    productNameZh: nonEmpty(latest.productNameZh),
    baseline,
    previous,
    latest,
    history,
    baselinePrice,
    previousPrice,
    latestPrice,
    priceDelta: priceChange.priceDelta,
    changeRate: priceChange.changeRate,
    delta: priceChange.priceDelta,
    changePercent: priceChange.changePercent,
    comparisonState,
    state: comparisonState,
    isComparable: priceChange.isComparable,
    specChanged: difference?.specChanged ?? false,
    unitChanged: difference?.unitChanged ?? false,
    currencyChanged: difference?.currencyChanged ?? false,
    requiresReview: comparisonState !== "comparable" || conditionState === "pending",
    conditionState,
    quoteStatus: getLineStatus(latest),
    availability: latest.availability,
  };
}

/** 建立可重用的規格 fingerprint；不包含價格，避免價格變動造成 variant 被拆開。 */
export function buildQuoteSpecFingerprint(input: QuoteSpecFingerprintInput): string {
  return [
    ["supplierItemCode", input.supplierItemCode],
    ["productName", input.productName],
    ["productNameZh", input.productNameZh],
    ["origin", input.origin],
    ["size", input.sizeText],
    ["packing", input.packingText],
    ["processing", input.processingMethod],
  ]
    .map(([key, value]) => `${key}=${normalizeFingerprintPart(value)}`)
    .join("|");
}

/** 只把 confirmed quote line 放入正式比較；同一 supplier/item 的規格變更會保留為不可比狀態。 */
export function compareQuoteLines(
  input: readonly QuoteLine[] | readonly QuoteDocument[],
  options: QuoteComparisonOptions = {},
): QuoteComparison[] {
  const groups = new Map<string, QuoteLine[]>();

  for (const line of flattenQuoteInput(input)) {
    const status = getLineStatus(line);
    if (!options.includeUnconfirmed && status !== "confirmed") continue;
    const key = getLineIdentity(line);
    const group = groups.get(key);
    if (group) group.push(line);
    else groups.set(key, [line]);
  }

  return [...groups.entries()].map(([key, lines]) => buildComparison(key, lines));
}

/** 計算百分比以「百分點數值」回傳，例如 100 到 115 會是 15。 */
export function calculateQuoteChange(
  previousPrice: number | null | undefined,
  latestPrice: number | null | undefined,
): QuotePriceChange {
  const previous = finiteNumber(previousPrice);
  const latest = finiteNumber(latestPrice);
  if (previous === null || latest === null || previous <= 0) {
    return {
      priceDelta: null,
      changeRate: null,
      changePercent: null,
      isComparable: false,
    };
  }

  const priceDelta = latest - previous;
  const changeRate = (priceDelta / previous) * 100;
  return {
    priceDelta,
    changeRate,
    changePercent: changeRate,
    isComparable: true,
  };
}

function pickThresholdNumber(
  values: readonly (number | null | undefined)[],
  fallback: number | null,
): number | null {
  const value = values.find((candidate) => finiteNumber(candidate) !== null);
  return value === undefined ? fallback : Math.max(0, finiteNumber(value) ?? 0);
}

export function resolveQuoteThreshold(
  threshold: QuoteThreshold = {},
): ResolvedQuoteThreshold {
  const upPercent =
    pickThresholdNumber(
      [
        threshold.upPercent,
        threshold.increasePercent,
        threshold.increasePercentThreshold,
      ],
      DEFAULT_QUOTE_THRESHOLD.upPercent,
    ) ?? DEFAULT_QUOTE_THRESHOLD.upPercent;
  const downPercent =
    pickThresholdNumber(
      [
        threshold.downPercent,
        threshold.decreasePercent,
        threshold.decreasePercentThreshold,
      ],
      DEFAULT_QUOTE_THRESHOLD.downPercent,
    ) ?? DEFAULT_QUOTE_THRESHOLD.downPercent;
  const upAmount = pickThresholdNumber(
    [threshold.upAmount, threshold.increaseAmount],
    DEFAULT_QUOTE_THRESHOLD.upAmount,
  );
  const downAmount = pickThresholdNumber(
    [threshold.downAmount, threshold.decreaseAmount],
    DEFAULT_QUOTE_THRESHOLD.downAmount,
  );

  return {
    upPercent,
    downPercent,
    increasePercent: upPercent,
    decreasePercent: downPercent,
    upAmount,
    downAmount,
    increaseAmount: upAmount,
    decreaseAmount: downAmount,
    includeSpecChanges:
      threshold.includeSpecChanges ?? DEFAULT_QUOTE_THRESHOLD.includeSpecChanges,
    includeNewItems: threshold.includeNewItems ?? DEFAULT_QUOTE_THRESHOLD.includeNewItems,
    includeTba: threshold.includeTba ?? DEFAULT_QUOTE_THRESHOLD.includeTba,
    includeUnavailable:
      threshold.includeUnavailable ?? DEFAULT_QUOTE_THRESHOLD.includeUnavailable,
  };
}

function readAlertState(input: QuoteAlertInput): QuoteComparisonState | undefined {
  return input.comparisonState ?? input.state;
}

function readAlertPrice(
  explicit: number | null | undefined,
  line: QuoteLine | null | undefined,
): number | null {
  return finiteNumber(explicit) ?? getLinePrice(line);
}

/** 依比較結果與可設定門檻判斷異常；不把 TBA/unavailable 當作 0。 */
export function evaluateQuoteAlert(
  input: QuoteAlertInput,
  threshold: QuoteThreshold = {},
): QuoteAlert {
  const resolvedThreshold = resolveQuoteThreshold(threshold);
  const comparisonState = readAlertState(input);
  const availability = input.availability ?? input.latest?.availability;
  const latestPrice = readAlertPrice(input.latestPrice, input.latest);
  const previousPrice = readAlertPrice(input.previousPrice, input.previous);
  const explicitDelta = finiteNumber(input.priceDelta);
  const explicitRate = finiteNumber(input.changeRate);
  const priceDelta =
    explicitDelta ??
    (previousPrice !== null && latestPrice !== null ? latestPrice - previousPrice : null);
  const changeRate =
    explicitRate ??
    (previousPrice !== null && latestPrice !== null && previousPrice > 0
      ? ((latestPrice - previousPrice) / previousPrice) * 100
      : null);

  let state: QuoteAlertState = "normal";
  let triggered = false;
  let percentExceeded = false;
  let amountExceeded = false;

  if (availability === "tba" || comparisonState === "tba") {
    state = "tba";
    triggered = resolvedThreshold.includeTba;
  } else if (availability === "unavailable" || comparisonState === "unavailable") {
    state = "unavailable";
    triggered = resolvedThreshold.includeUnavailable;
  } else if (comparisonState === "new_item") {
    state = "new_item";
    triggered = resolvedThreshold.includeNewItems;
  } else if (comparisonState === "spec_changed" || input.specChanged) {
    state = "spec_changed";
    triggered = resolvedThreshold.includeSpecChanges;
  } else if (comparisonState === "unit_changed") {
    state = "unit_changed";
    triggered = resolvedThreshold.includeSpecChanges;
  } else if (comparisonState === "currency_changed") {
    state = "currency_changed";
    triggered = resolvedThreshold.includeSpecChanges;
  } else if (
    comparisonState === "no_previous_price" ||
    comparisonState === "zero_previous_price" ||
    comparisonState === "no_latest_price" ||
    (comparisonState !== undefined && comparisonState !== "comparable")
  ) {
    state = "not_comparable";
  } else if (changeRate !== null && priceDelta !== null) {
    percentExceeded =
      changeRate >= resolvedThreshold.upPercent ||
      changeRate <= -resolvedThreshold.downPercent;
    amountExceeded =
      (resolvedThreshold.upAmount !== null && priceDelta >= resolvedThreshold.upAmount) ||
      (resolvedThreshold.downAmount !== null && priceDelta <= -resolvedThreshold.downAmount);

    if (
      changeRate >= resolvedThreshold.upPercent ||
      (resolvedThreshold.upAmount !== null && priceDelta >= resolvedThreshold.upAmount)
    ) {
      state = "increase";
      triggered = true;
    } else if (
      changeRate <= -resolvedThreshold.downPercent ||
      (resolvedThreshold.downAmount !== null && priceDelta <= -resolvedThreshold.downAmount)
    ) {
      state = "decrease";
      triggered = true;
    }
  } else {
    state = "not_comparable";
  }

  return {
    state,
    reason: state,
    triggered,
    isAlert: triggered,
    isAnomaly: triggered,
    shouldReview: triggered,
    priceDelta,
    changeRate,
    percentExceeded,
    amountExceeded,
    threshold: resolvedThreshold,
  };
}

export const DEFAULT_QUOTE_STATUS_LABELS: Readonly<
  Record<QuoteDocumentStatus, string>
> = Object.freeze({
  confirmed: "已確認",
  draft: "草稿",
  parse_failed: "解析失敗",
});

export function quoteStatusLabel(
  status: QuoteDocumentStatus | null | undefined,
  labels: Partial<Record<QuoteDocumentStatus, string>> = {},
): string {
  if (!status) return " ";
  return labels[status] ?? DEFAULT_QUOTE_STATUS_LABELS[status] ?? status;
}

export const DEFAULT_QUOTE_AVAILABILITY_LABELS: Readonly<
  Record<QuoteAvailability, string>
> = Object.freeze({
  quoted: "已報價",
  tba: "待確認",
  unavailable: "無供應",
});

export function quoteAvailabilityLabel(
  availability: QuoteAvailability | null | undefined,
): string {
  if (!availability) return " ";
  return DEFAULT_QUOTE_AVAILABILITY_LABELS[availability] ?? availability;
}

export function evaluateQuoteConditionState(
  condition: QuoteCondition | null | undefined,
): QuoteConditionState {
  if (!condition || !nonEmpty(condition.rawText)) return "not_applicable";
  if (condition.state) return condition.state;
  if (condition.status) return condition.status;
  if (condition.confirmed === true || condition.isConfirmed === true) return "confirmed";
  return "pending";
}

export function quoteConditionStateLabel(state: QuoteConditionState): string {
  switch (state) {
    case "confirmed":
      return "已確認";
    case "pending":
      return "待確認";
    case "rejected":
      return "已拒絕";
    case "not_applicable":
      return "不適用";
  }
}

export function evaluateQuoteCondition(
  condition: QuoteCondition | null | undefined,
): QuoteConditionEvaluation {
  const state = evaluateQuoteConditionState(condition);
  return {
    state,
    isResolved: state === "confirmed" || state === "rejected" || state === "not_applicable",
    requiresReview: state === "pending",
    label: quoteConditionStateLabel(state),
  };
}

export function summarizeQuoteConditions(
  conditions: readonly QuoteCondition[] | undefined,
): QuoteConditionSummaryState {
  return summarizeConditions(conditions);
}

function formatValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function formatNumber(value: number | null | undefined): string {
  return formatValue(finiteNumber(value));
}

function resolveExportComparisons(
  input: SupplierQuoteExportInput,
  options: SupplierQuoteCsvOptions,
): readonly QuoteComparison[] {
  if (Array.isArray(input)) {
    if (!input.length || isQuoteComparison(input[0] as QuoteLine | QuoteComparison)) {
      return input as readonly QuoteComparison[];
    }
    return compareQuoteLines(input as readonly QuoteLine[] | readonly QuoteDocument[], options.comparisonOptions);
  }
  if ("comparisons" in input && input.comparisons) return input.comparisons;
  if ("lines" in input && input.lines) {
    return compareQuoteLines(input.lines, options.comparisonOptions);
  }
  if ("documents" in input && input.documents) {
    return compareQuoteLines(input.documents, options.comparisonOptions);
  }
  return [];
}

function conditionsText(conditions: readonly QuoteCondition[] | undefined): string {
  return (
    conditions
      ?.map((condition) => nonEmpty(condition.rawText))
      .filter((text): text is string => text !== null)
      .join(" | ") ?? ""
  );
}

export function buildSupplierQuoteCsvRows(
  input: SupplierQuoteExportInput,
  options: SupplierQuoteCsvOptions = {},
): SupplierQuoteCsvRow[] {
  return resolveExportComparisons(input, options).map((comparison) => {
    const latest = comparison.latest;
    const alert = evaluateQuoteAlert(comparison, options.threshold);
    const fingerprint = getLineFingerprint(latest);
    const actualInboundPrice = getActualInboundPrice(latest);
    const conditionSummary = summarizeConditions(latest.conditions);

    return {
      supplierId: comparison.supplierId,
      supplierName: formatValue(comparison.supplierName),
      quoteDate: formatValue(latest.quoteDate),
      effectiveDate: formatValue(latest.effectiveDate),
      productName: latest.productName,
      productNameZh: formatValue(latest.productNameZh),
      supplierItemCode: formatValue(latest.supplierItemCode),
      rawMeatItemId: formatValue(latest.rawMeatItemId),
      specFingerprint: formatValue(latest.specFingerprint ?? fingerprint),
      normalizedSpecFingerprint: fingerprint,
      origin: formatValue(latest.origin),
      sizeText: formatValue(latest.sizeText),
      packingText: formatValue(latest.packingText),
      processingMethod: formatValue(latest.processingMethod),
      availability: latest.availability,
      quoteStatus: comparison.quoteStatus,
      currency: latest.currency,
      priceUnit: latest.priceUnit,
      rawQuotedPrice: formatValue(latest.rawQuotedPrice),
      baselinePrice: formatNumber(comparison.baselinePrice),
      previousPrice: formatNumber(comparison.previousPrice),
      latestPrice: formatNumber(comparison.latestPrice),
      priceDelta: formatNumber(comparison.priceDelta),
      changeRate: formatNumber(comparison.changeRate),
      pdfQuotedPrice: formatNumber(comparison.latestPrice),
      actualInboundPrice: formatNumber(actualInboundPrice),
      actualInboundUnitPrice: formatNumber(actualInboundPrice),
      actualInboundPriceDate: formatValue(latest.actualInboundPriceDate),
      conditionState: conditionSummary,
      conditions: conditionsText(latest.conditions),
      comparisonState: comparison.comparisonState,
      alertState: alert.state,
      alertTriggered: String(alert.triggered),
      sourcePage: formatNumber(latest.sourcePage),
      sourceText: formatValue(latest.sourceText),
      originalFilename: formatValue(latest.originalFilename),
    };
  });
}

function csvEscape(value: string, delimiter: string): string {
  const text = value.replace(/"/g, '""');
  return `"${text}"`;
}

/** 產生 UTF-8 CSV 內容；預設不加 BOM，UI 可用 includeBom/bom 開啟。 */
export function buildSupplierQuoteCsv(
  input: SupplierQuoteExportInput,
  options: SupplierQuoteCsvOptions = {},
): string {
  const delimiter = options.delimiter ?? ",";
  const lineEnding = options.lineEnding ?? "\r\n";
  const rows = buildSupplierQuoteCsvRows(input, options);
  const columns = SUPPLIER_QUOTE_CSV_COLUMNS;
  const headers = columns.map((column) => options.headers?.[column] ?? column);
  const lines = [
    headers.map((header) => csvEscape(header, delimiter)).join(delimiter),
    ...rows.map((row) =>
      columns.map((column) => csvEscape(row[column], delimiter)).join(delimiter),
    ),
  ];
  const csv = lines.join(lineEnding);
  return options.includeBom || options.bom ? `\uFEFF${csv}` : csv;
}

const demoChickenFingerprint = "chicken-thigh|thailand|2kg|vacuum";
const demoBeefFingerprint = "beef-short-rib|australia|2kg|vacuum";
const demoBeefSlicedFingerprint = "beef-short-rib|australia|2kg|sliced";
const demoPorkFingerprint = "pork-belly|spain|5kg|frozen";

export const demoSupplierQuoteLines: readonly QuoteLine[] = Object.freeze([
  {
    id: "demo-am-chicken-2026-05",
    documentId: "demo-am-2026-05",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    rawMeatItemId: "raw-chicken-thigh",
    supplierItemCode: "AM-CT-02",
    productName: "Chicken Thigh",
    productNameZh: "雞扒",
    origin: "Thailand",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: demoChickenFingerprint,
    normalizedSpecFingerprint: demoChickenFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 42,
    rawQuotedPrice: "HK$42/kg",
    actualInboundPrice: 40.5,
    actualInboundPriceDate: "2026-05-18",
    quoteDate: "2026-05-01",
    effectiveDate: "2026-05-05",
    status: "confirmed",
    sourcePage: 1,
    sourceText: "AM-CT-02 Chicken Thigh Thailand 2 kg HK$42/kg",
    originalFilename: "a-mart-2026-05.pdf",
  },
  {
    id: "demo-am-chicken-2026-06",
    documentId: "demo-am-2026-06",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    rawMeatItemId: "raw-chicken-thigh",
    supplierItemCode: "AM-CT-02",
    productName: "Chicken Thigh",
    productNameZh: "雞扒",
    origin: "Thailand",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: demoChickenFingerprint,
    normalizedSpecFingerprint: demoChickenFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 44,
    rawQuotedPrice: "HK$44/kg",
    actualInboundPrice: 43,
    actualInboundPriceDate: "2026-06-16",
    quoteDate: "2026-06-01",
    effectiveDate: "2026-06-04",
    status: "confirmed",
    sourcePage: 1,
    sourceText: "AM-CT-02 Chicken Thigh Thailand 2 kg HK$44/kg",
    originalFilename: "a-mart-2026-06.pdf",
  },
  {
    id: "demo-am-chicken-2026-07",
    documentId: "demo-am-2026-07",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    rawMeatItemId: "raw-chicken-thigh",
    supplierItemCode: "AM-CT-02",
    productName: "Chicken Thigh",
    productNameZh: "雞扒",
    origin: "Thailand",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: demoChickenFingerprint,
    normalizedSpecFingerprint: demoChickenFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 50,
    rawQuotedPrice: "HK$50/kg",
    actualInboundPrice: 48.5,
    actualInboundPriceDate: "2026-07-15",
    quoteDate: "2026-07-01",
    effectiveDate: "2026-07-03",
    status: "confirmed",
    sourcePage: 1,
    sourceText: "AM-CT-02 Chicken Thigh Thailand 2 kg HK$50/kg",
    originalFilename: "a-mart-2026-07.pdf",
  },
  {
    id: "demo-am-beef-2026-05",
    documentId: "demo-am-2026-05",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    rawMeatItemId: "raw-beef-short-rib",
    supplierItemCode: "AM-BR-01",
    productName: "Beef Short Rib",
    productNameZh: "牛小排",
    origin: "Australia",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: demoBeefFingerprint,
    normalizedSpecFingerprint: demoBeefFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 88,
    rawQuotedPrice: "HK$88/kg",
    actualInboundPrice: 87,
    actualInboundPriceDate: "2026-05-20",
    quoteDate: "2026-05-01",
    effectiveDate: "2026-05-05",
    status: "confirmed",
    sourcePage: 2,
    sourceText: "AM-BR-01 Beef Short Rib Australia 2 kg HK$88/kg",
    originalFilename: "a-mart-2026-05.pdf",
  },
  {
    id: "demo-am-beef-2026-07",
    documentId: "demo-am-2026-07",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    rawMeatItemId: "raw-beef-short-rib",
    supplierItemCode: "AM-BR-01",
    productName: "Beef Short Rib",
    productNameZh: "牛小排",
    origin: "Australia",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Sliced",
    specFingerprint: demoBeefSlicedFingerprint,
    normalizedSpecFingerprint: demoBeefSlicedFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 92,
    rawQuotedPrice: "HK$92/kg",
    actualInboundPrice: 91,
    actualInboundPriceDate: "2026-07-16",
    quoteDate: "2026-07-01",
    effectiveDate: "2026-07-03",
    status: "confirmed",
    sourcePage: 2,
    sourceText: "AM-BR-01 Beef Short Rib Australia 2 kg sliced HK$92/kg",
    originalFilename: "a-mart-2026-07.pdf",
  },
  {
    id: "demo-am-draft",
    documentId: "demo-am-draft",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    rawMeatItemId: "raw-pork-belly",
    supplierItemCode: "AM-PB-01",
    productName: "Pork Belly",
    productNameZh: "五花腩",
    origin: "Spain",
    sizeText: "5 kg",
    packingText: "Frozen",
    specFingerprint: demoPorkFingerprint,
    normalizedSpecFingerprint: demoPorkFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 65,
    rawQuotedPrice: "HK$65/kg",
    quoteDate: "2026-08-01",
    status: "draft",
  },
  {
    id: "demo-euro-chicken-2026-06",
    documentId: "demo-euro-2026-06",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    rawMeatItemId: "raw-chicken-thigh",
    supplierItemCode: "EU-CT-11",
    productName: "Chicken Thigh",
    productNameZh: "雞扒",
    origin: "Brazil",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: "chicken-thigh|brazil|2kg|vacuum",
    normalizedSpecFingerprint: "chicken-thigh|brazil|2kg|vacuum",
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 40,
    rawQuotedPrice: "HK$40/kg",
    actualInboundPrice: 39.5,
    actualInboundPriceDate: "2026-06-18",
    quoteDate: "2026-06-01",
    effectiveDate: "2026-06-03",
    status: "confirmed",
    sourcePage: 3,
    sourceText: "EU-CT-11 Chicken Thigh Brazil 2 kg HK$40/kg",
    originalFilename: "euro-foodstuff-2026-06.pdf",
  },
  {
    id: "demo-euro-chicken-2026-08",
    documentId: "demo-euro-2026-08",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    rawMeatItemId: "raw-chicken-thigh",
    supplierItemCode: "EU-CT-11",
    productName: "Chicken Thigh",
    productNameZh: "雞扒",
    origin: "Brazil",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: "chicken-thigh|brazil|2kg|vacuum",
    normalizedSpecFingerprint: "chicken-thigh|brazil|2kg|vacuum",
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 34,
    rawQuotedPrice: "HK$34/kg",
    actualInboundPrice: 35,
    actualInboundPriceDate: "2026-08-12",
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-03",
    status: "confirmed",
    sourcePage: 3,
    sourceText: "EU-CT-11 Chicken Thigh Brazil 2 kg HK$34/kg",
    originalFilename: "euro-foodstuff-2026-08.pdf",
  },
  {
    id: "demo-euro-beef-2026-06",
    documentId: "demo-euro-2026-06",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    rawMeatItemId: "raw-beef-short-rib",
    supplierItemCode: "EU-BR-05",
    productName: "Beef Short Rib",
    productNameZh: "牛小排",
    origin: "Australia",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: demoBeefFingerprint,
    normalizedSpecFingerprint: demoBeefFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 86,
    rawQuotedPrice: "HK$86/kg",
    actualInboundPrice: 85,
    actualInboundPriceDate: "2026-06-19",
    quoteDate: "2026-06-01",
    effectiveDate: "2026-06-03",
    status: "confirmed",
    sourcePage: 4,
    sourceText: "EU-BR-05 Beef Short Rib Australia 2 kg HK$86/kg",
    originalFilename: "euro-foodstuff-2026-06.pdf",
  },
  {
    id: "demo-euro-beef-2026-08",
    documentId: "demo-euro-2026-08",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    rawMeatItemId: "raw-beef-short-rib",
    supplierItemCode: "EU-BR-05",
    productName: "Beef Short Rib",
    productNameZh: "牛小排",
    origin: "Australia",
    sizeText: "2 kg",
    packingText: "Vacuum",
    processingMethod: "Whole",
    specFingerprint: demoBeefFingerprint,
    normalizedSpecFingerprint: demoBeefFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "tba",
    quotedPrice: null,
    rawQuotedPrice: "TBA",
    actualInboundPrice: null,
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-03",
    status: "confirmed",
    sourcePage: 4,
    sourceText: "EU-BR-05 Beef Short Rib Australia 2 kg TBA",
    originalFilename: "euro-foodstuff-2026-08.pdf",
    conditions: [
      {
        rawText: "待供應商確認新一批到貨日",
        type: "delivery",
        confirmed: false,
      },
    ],
  },
  {
    id: "demo-euro-shrimp-new",
    documentId: "demo-euro-2026-08",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    rawMeatItemId: "raw-shrimp",
    supplierItemCode: "EU-SH-20",
    productName: "Black Tiger Shrimp",
    productNameZh: "黑虎蝦",
    origin: "Vietnam",
    sizeText: "16/20",
    packingText: "10 x 1 kg",
    processingMethod: "Peeled",
    specFingerprint: "black-tiger-shrimp|vietnam|16/20|10x1kg|peeled",
    normalizedSpecFingerprint: "black-tiger-shrimp|vietnam|16/20|10x1kg|peeled",
    currency: "HKD",
    priceUnit: "kg",
    availability: "quoted",
    quotedPrice: 120,
    rawQuotedPrice: "HK$120/kg",
    actualInboundPrice: null,
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-03",
    status: "confirmed",
    sourcePage: 8,
    sourceText: "EU-SH-20 Black Tiger Shrimp Vietnam 16/20 HK$120/kg",
    originalFilename: "euro-foodstuff-2026-08.pdf",
    conditions: [
      {
        rawText: "最低訂購量 10 kg",
        type: "minimum_quantity",
        quantity: 10,
        unit: "kg",
        confirmed: true,
      },
    ],
  },
  {
    id: "demo-tai-pork-unavailable",
    documentId: "demo-tai-2026-08",
    supplierId: "supplier-tai-xin",
    supplierName: "泰鑫食品",
    rawMeatItemId: "raw-pork-belly",
    supplierItemCode: "TX-PB-01",
    productName: "Pork Belly",
    productNameZh: "五花腩",
    origin: "Spain",
    sizeText: "5 kg",
    packingText: "Frozen",
    processingMethod: "Whole",
    specFingerprint: demoPorkFingerprint,
    normalizedSpecFingerprint: demoPorkFingerprint,
    currency: "HKD",
    priceUnit: "kg",
    availability: "unavailable",
    quotedPrice: null,
    rawQuotedPrice: "缺貨",
    actualInboundPrice: null,
    quoteDate: "2026-08-03",
    effectiveDate: "2026-08-04",
    status: "confirmed",
    sourcePage: 1,
    sourceText: "TX-PB-01 Pork Belly Spain 5 kg 缺貨",
    originalFilename: "tai-xin-2026-08.pdf",
  },
  {
    id: "demo-tai-parse-failed",
    documentId: "demo-tai-2026-08-failed",
    supplierId: "supplier-tai-xin",
    supplierName: "泰鑫食品",
    rawMeatItemId: "raw-pork-rib",
    supplierItemCode: "TX-PR-08",
    productName: "Pork Rib",
    productNameZh: "排骨",
    origin: "Spain",
    sizeText: "3 kg",
    packingText: "Frozen",
    specFingerprint: "pork-rib|spain|3kg|frozen",
    normalizedSpecFingerprint: "pork-rib|spain|3kg|frozen",
    currency: "HKD",
    priceUnit: "kg",
    availability: "unavailable",
    quotedPrice: null,
    rawQuotedPrice: "",
    quoteDate: "2026-08-04",
    status: "parse_failed",
    sourcePage: null,
    sourceText: null,
    originalFilename: "tai-xin-2026-08-scanned.pdf",
  },
]);

export const demoSupplierQuoteDocuments: readonly QuoteDocument[] = Object.freeze([
  {
    id: "demo-am-2026-05",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    quoteDate: "2026-05-01",
    effectiveDate: "2026-05-05",
    status: "confirmed",
    originalFilename: "a-mart-2026-05.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-am-2026-05"),
  },
  {
    id: "demo-am-2026-06",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    quoteDate: "2026-06-01",
    effectiveDate: "2026-06-04",
    status: "confirmed",
    originalFilename: "a-mart-2026-06.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-am-2026-06"),
  },
  {
    id: "demo-am-2026-07",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    quoteDate: "2026-07-01",
    effectiveDate: "2026-07-03",
    status: "confirmed",
    originalFilename: "a-mart-2026-07.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-am-2026-07"),
  },
  {
    id: "demo-am-draft",
    supplierId: "supplier-a-mart",
    supplierName: "A-Mart",
    quoteDate: "2026-08-01",
    status: "draft",
    originalFilename: "a-mart-2026-08-draft.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-am-draft"),
  },
  {
    id: "demo-euro-2026-06",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    quoteDate: "2026-06-01",
    effectiveDate: "2026-06-03",
    status: "confirmed",
    originalFilename: "euro-foodstuff-2026-06.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-euro-2026-06"),
  },
  {
    id: "demo-euro-2026-08",
    supplierId: "supplier-euro-foodstuff",
    supplierName: "Euro Foodstuff",
    quoteDate: "2026-08-01",
    effectiveDate: "2026-08-03",
    status: "confirmed",
    originalFilename: "euro-foodstuff-2026-08.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-euro-2026-08"),
  },
  {
    id: "demo-tai-2026-08",
    supplierId: "supplier-tai-xin",
    supplierName: "泰鑫食品",
    quoteDate: "2026-08-03",
    effectiveDate: "2026-08-04",
    status: "confirmed",
    originalFilename: "tai-xin-2026-08.pdf",
    lines: demoSupplierQuoteLines.filter((line) => line.documentId === "demo-tai-2026-08"),
  },
  {
    id: "demo-tai-2026-08-failed",
    supplierId: "supplier-tai-xin",
    supplierName: "泰鑫食品",
    quoteDate: "2026-08-04",
    status: "parse_failed",
    originalFilename: "tai-xin-2026-08-scanned.pdf",
    lines: demoSupplierQuoteLines.filter(
      (line) => line.documentId === "demo-tai-2026-08-failed",
    ),
  },
]);

export const demoSupplierQuoteData = Object.freeze({
  documents: demoSupplierQuoteDocuments,
  lines: demoSupplierQuoteLines,
  threshold: DEFAULT_QUOTE_THRESHOLD,
});

export const demoSupplierQuotes = demoSupplierQuoteData;
