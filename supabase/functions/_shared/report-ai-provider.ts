export const REPORT_AI_MAX_OUTPUT_TOKENS = 6_000;

export type ReportAiProviderScalar = string | number | boolean | null;

function numericValue(value: ReportAiProviderScalar) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" ||
      !/^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function sameReportAiScalar(
  left: ReportAiProviderScalar,
  right: ReportAiProviderScalar | undefined,
) {
  if (left === right) return true;
  if (right === undefined) return false;
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  return leftNumber !== null && rightNumber !== null &&
    Math.abs(leftNumber - rightNumber) < 0.000001;
}

function numericTokens(value: ReportAiProviderScalar) {
  const matches = String(value ?? "").match(/[-+]?\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((token) => Number(token.replaceAll(",", ""))).filter(Number.isFinite);
}

export function textNumbersAreSupported(
  text: string,
  supportedValues: ReportAiProviderScalar[],
) {
  const stated = numericTokens(text);
  if (!stated.length) return true;
  const supported = supportedValues.flatMap(numericTokens);
  return stated.every((number) =>
    supported.some((candidate) => Math.abs(candidate - number) < 0.000001)
  );
}

type ReportAiProviderRow = Record<string, ReportAiProviderScalar>;
type ReportAiProviderCollections = Partial<Record<
  "currentAggregates" | "comparisonAggregates" | "detailRows",
  ReportAiProviderRow[]
>>;

export function canonicalReportAiEvidence(
  collections: ReportAiProviderCollections,
  source: string,
  expectedValue: ReportAiProviderScalar,
) {
  const match = /^(currentAggregates|comparisonAggregates|detailRows)\[(\d+)]\.([A-Za-z0-9_]+)$/.exec(source);
  if (!match) return null;
  const collectionName = match[1] as keyof ReportAiProviderCollections;
  const rows = collections[collectionName] ?? [];
  const requestedIndex = Number(match[2]);
  const field = match[3];
  const requestedValue = rows[requestedIndex]?.[field];
  if (sameReportAiScalar(expectedValue, requestedValue)) {
    return { source, value: requestedValue as ReportAiProviderScalar };
  }
  const matches = rows.flatMap((row, index) =>
    sameReportAiScalar(expectedValue, row[field]) ? [{ index, value: row[field] }] : [],
  );
  if (matches.length !== 1) return null;
  return {
    source: `${collectionName}[${matches[0].index}].${field}`,
    value: matches[0].value,
  };
}

export function buildReportAiProviderRequest(input: {
  model: string;
  systemPrompt: string;
  reportContext: unknown;
}) {
  return {
    model: input.model,
    response_format: { type: "json_object" as const },
    temperature: 0.1,
    thinking: { type: "disabled" as const },
    max_tokens: REPORT_AI_MAX_OUTPUT_TOKENS,
    stream: true,
    messages: [
      { role: "system" as const, content: input.systemPrompt },
      { role: "user" as const, content: JSON.stringify(input.reportContext) },
    ],
  };
}
