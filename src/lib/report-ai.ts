import {
  supabase,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase";

export type ReportAiScalar = string | number | boolean | null;
export type ReportAiRow = Record<string, ReportAiScalar>;

export type ReportAiCompleteness = {
  status: "complete" | "partial" | "unknown";
  latestDataAt?: string;
  notes?: string[];
};

export type ReportAiSnapshot = {
  filters: Record<string, ReportAiScalar | ReportAiScalar[]>;
  currentAggregates: ReportAiRow[];
  comparisonAggregates?: ReportAiRow[];
  detailRows?: ReportAiRow[];
  completeness: ReportAiCompleteness;
};

export type ReportAiEvidence = {
  label: string;
  value: ReportAiScalar;
  unit?: string;
  source: string;
};

export type ReportAiFinding = {
  text: string;
  evidence: ReportAiEvidence[];
};

export type ReportAiInterpretation = {
  status: "complete" | "partial" | "fallback";
  headline: string;
  trends: ReportAiFinding[];
  anomalies: ReportAiFinding[];
  limitations: string[];
  coverage: {
    summaryRows: number;
    comparisonRows: number;
    detailRows: number;
    truncated: boolean;
  };
  generatedAt: string;
  cacheKey?: string;
};

export type ReportAiRequest = {
  reportKey: string;
  permissionKey: string;
  reportTitle: string;
  locale: string;
  snapshot: ReportAiSnapshot;
};

export type ReportAiStreamEvent =
  | { type: "status"; stage: "preparing" | "generating" | "validating" }
  | { type: "draft"; text: string };

const SENSITIVE_FIELD_PATTERN =
  /^(?:customerName|customer_name|employeeName|employee_name|staffName|staff_name|contactName|contact_name|phone|mobile|email|address|remark|remarks|note|notes|image|imageUrl|image_url|url|password|token)$/i;
const MAX_AGGREGATE_ROWS = 400;
const MAX_COMPARISON_ROWS = 200;
const MAX_DETAIL_ROWS = 100;

function sanitizeRow(row: ReportAiRow) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key)),
  ) as ReportAiRow;
}

export function compactReportAiSnapshot(snapshot: ReportAiSnapshot): ReportAiSnapshot {
  return {
    filters: snapshot.filters,
    currentAggregates: snapshot.currentAggregates
      .slice(0, MAX_AGGREGATE_ROWS)
      .map(sanitizeRow),
    comparisonAggregates: snapshot.comparisonAggregates
      ?.slice(0, MAX_COMPARISON_ROWS)
      .map(sanitizeRow),
    detailRows: snapshot.detailRows?.slice(0, MAX_DETAIL_ROWS).map(sanitizeRow),
    completeness: {
      ...snapshot.completeness,
      notes: snapshot.completeness.notes?.slice(0, 12),
    },
  };
}

export function reportAiSnapshotFingerprint(snapshot: ReportAiSnapshot) {
  const serialized = JSON.stringify(compactReportAiSnapshot(snapshot));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createReportAiFallback(
  snapshot: ReportAiSnapshot,
  generatedAt = new Date().toISOString(),
  locale = "zh-HK",
): ReportAiInterpretation {
  const compact = compactReportAiSnapshot(snapshot);
  const numericEntries = compact.currentAggregates.flatMap((row, rowIndex) =>
    Object.entries(row)
      .filter((entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
      )
      .map(([key, value]) => ({ key, value, rowIndex })),
  );
  const strongest = [...numericEntries]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 3);

  const english = locale.toLowerCase().startsWith("en");
  return {
    status: "fallback",
    headline: strongest.length
      ? english
        ? "The AI provider is unavailable. These are system-verified data points."
        : "AI 服務暫時不可用，以下為系統可核實的資料摘要。"
      : english
        ? "There is not enough numeric data to interpret."
        : "目前沒有足夠的數值資料可供解讀。",
    trends: strongest.map(({ key, value, rowIndex }) => ({
      text: `${key}: ${value}`,
      evidence: [{ label: key, value, source: `currentAggregates[${rowIndex}].${key}` }],
    })),
    anomalies: [],
    limitations: [
      english
        ? "This is a system-generated summary, not a full AI interpretation."
        : "這是程式計算的基礎摘要，不是完整 AI 解讀。",
      ...(compact.completeness.notes ?? []),
    ],
    coverage: {
      summaryRows: compact.currentAggregates.length,
      comparisonRows: compact.comparisonAggregates?.length ?? 0,
      detailRows: compact.detailRows?.length ?? 0,
      truncated:
        snapshot.currentAggregates.length > MAX_AGGREGATE_ROWS ||
        (snapshot.comparisonAggregates?.length ?? 0) > MAX_COMPARISON_ROWS ||
        (snapshot.detailRows?.length ?? 0) > MAX_DETAIL_ROWS,
    },
    generatedAt,
  };
}

function parseSseBlock(block: string) {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join("\n") };
}

export async function consumeReportAiEventStream(
  response: Response,
  onEvent?: (event: ReportAiStreamEvent) => void,
): Promise<ReportAiInterpretation> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; diagnostic?: string } | null;
    throw new Error(payload?.diagnostic ?? payload?.error ?? `report_ai_http_${response.status}`);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const payload = await response.json() as ReportAiInterpretation & { error?: string; diagnostic?: string };
    if (payload.error) throw new Error(payload.diagnostic ?? payload.error);
    return payload;
  }
  if (!response.body) throw new Error("report_ai_stream_missing");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ReportAiInterpretation | null = null;

  const consumeBlock = (block: string) => {
    if (!block.trim()) return;
    const parsed = parseSseBlock(block);
    if (!parsed.data) return;
    const payload = JSON.parse(parsed.data) as Record<string, unknown>;
    if (parsed.event === "status" &&
        ["preparing", "generating", "validating"].includes(String(payload.stage))) {
      onEvent?.({
        type: "status",
        stage: payload.stage as Extract<ReportAiStreamEvent, { type: "status" }>["stage"],
      });
    } else if (parsed.event === "draft" && typeof payload.text === "string") {
      onEvent?.({ type: "draft", text: payload.text });
    } else if (parsed.event === "result") {
      result = payload as unknown as ReportAiInterpretation;
    } else if (parsed.event === "error") {
      throw new Error(typeof payload.message === "string" ? payload.message : "report_ai_failed");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) consumeBlock(block);
    if (done) break;
  }
  consumeBlock(buffer);
  if (!result) throw new Error("report_ai_stream_incomplete");
  return result;
}

export async function requestReportAiInterpretation(
  request: ReportAiRequest,
  onEvent?: (event: ReportAiStreamEvent) => void,
): Promise<ReportAiInterpretation> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("authentication_required");
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 65_000);
  onEvent?.({ type: "status", stage: "preparing" });
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/report-ai-interpret`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...request,
        snapshot: compactReportAiSnapshot(request.snapshot),
      }),
      signal: controller.signal,
    });
    return await consumeReportAiEventStream(response, onEvent);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("report_ai_client_timeout");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function submitReportAiFeedback(input: {
  reportKey: string;
  permissionKey: string;
  cacheKey: string;
  rating: "helpful" | "unhelpful";
  reason?: "numbers" | "missing" | "unclear" | "other";
}) {
  const { data, error } = await supabase.functions.invoke("report-ai-interpret", {
    body: { action: "feedback", ...input },
  });
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.error ?? "report_ai_feedback_failed");
}
