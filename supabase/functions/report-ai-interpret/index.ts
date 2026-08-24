import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildReportAiProviderRequest,
  canonicalReportAiEvidence,
  sameReportAiScalar,
  textNumbersAreSupported,
} from "../_shared/report-ai-provider.ts";
import {
  reportAiLimitExceeded,
  sanitizeReportAiSnapshot,
  trustedReportAiRole,
  type ReportAiSnapshot,
} from "../_shared/report-ai-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT_VERSION = "report-ai/2";
const MAX_INPUT_CHARS = Number(Deno.env.get("REPORT_AI_MAX_INPUT_CHARS") ?? 180_000);
const configuredDailyLimit = Number(
  Deno.env.get("REPORT_AI_DAILY_LIMIT") ??
    Deno.env.get("REPORT_AI_DAILY_SOFT_LIMIT") ??
    100,
);
const MAX_DAILY_REQUESTS = Number.isFinite(configuredDailyLimit) && configuredDailyLimit >= 0
  ? configuredDailyLimit
  : 100;
const CACHE_HOURS = Number(Deno.env.get("REPORT_AI_CACHE_HOURS") ?? 24);

function reportAiEnv(name: string, supplierQuoteName: string) {
  return Deno.env.get(name) ?? Deno.env.get(supplierQuoteName) ?? "";
}

const REPORT_PERMISSION_KEYS: Record<string, string> = {
  kitchenSalesCost: "kitchen.cost_input",
  kitchenChannelSales: "kitchen.cost_input",
  kitchenProductSales: "kitchen.cost_input",
  kitchenAdvertisingPerformance: "kitchen.cost_input",
  shopSales: "reports.shop_sales",
  shopSalesWorkingHours: "reports.shop_sales_working_hours",
  restaurantSalesSalary: "reports.restaurant_sales_salary",
  restaurantSalesCost: "reports.restaurant_sales_cost",
  restaurantPnl: "reports.restaurant_pnl",
  newProducts: "reports.new_products",
  shopOrderQuantities: "reports.shop_order_quantities",
  averageSupplyPrice: "reports.average_supply_price",
  productionCostPrice: "reports.production_cost_price",
  rawMeatAveragePrice: "reports.raw_meat_average_price",
  preparedMeatStock: "reports.prepared_meat_stock",
  rawMeatStock: "reports.raw_meat_stock",
  supplierPurchase: "reports.supplier_purchase",
};

type Scalar = string | number | boolean | null;
type Row = Record<string, Scalar>;
type Snapshot = ReportAiSnapshot;
type Evidence = { label: string; value: Scalar; unit?: string; source: string };
type Finding = { text: string; evidence: Evidence[] };
type Interpretation = {
  status: "complete" | "partial" | "fallback";
  headline: string;
  trends: Finding[];
  anomalies: Finding[];
  limitations: string[];
  coverage: { summaryRows: number; comparisonRows: number; detailRows: number; truncated: boolean };
  generatedAt: string;
  cacheKey?: string;
};
type RequestBody = {
  action?: "interpret";
  reportKey?: string;
  permissionKey?: string;
  reportTitle?: string;
  locale?: string;
  snapshot?: Snapshot;
};
type FeedbackBody = {
  action: "feedback";
  reportKey?: string;
  permissionKey?: string;
  cacheKey?: string;
  rating?: "helpful" | "unhelpful";
  reason?: "numbers" | "missing" | "unclear" | "other";
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function eventStream(
  run: (emit: (event: string, payload: unknown) => void) => Promise<void>,
) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      const emit = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      void run(emit)
        .catch((error) => emit("error", {
          message: error instanceof Error ? error.message : "report_ai_failed",
        }))
        .finally(() => controller.close());
    },
  }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function createAdminClient(): SupabaseClient {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requirePermission(request: Request, admin: SupabaseClient, permissionKey: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw jsonResponse({ error: "authentication_required" }, 401);
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw jsonResponse({ error: "authentication_required" }, 401);
  const role = trustedReportAiRole(data.user.app_metadata);
  if (role !== "Super Admin") {
    const { data: permission, error: permissionError } = await admin
      .from("role_page_permissions")
      .select("can_access")
      .eq("role", role)
      .eq("page_key", permissionKey)
      .maybeSingle();
    if (permissionError || !permission?.can_access) {
      throw jsonResponse({ error: "insufficient_privilege" }, 403);
    }
  }
  return { id: data.user.id, role };
}

function isScalar(value: unknown): value is Scalar {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function validRows(value: unknown, maximum: number): value is Row[] {
  return Array.isArray(value) && value.length <= maximum && value.every((row) =>
    row && typeof row === "object" && !Array.isArray(row) &&
    Object.keys(row).length <= 32 && Object.values(row).every(isScalar)
  );
}

function validateBody(body: RequestBody) {
  const permissionKey = body.reportKey ? REPORT_PERMISSION_KEYS[body.reportKey] : null;
  if (!permissionKey || body.permissionKey !== permissionKey) {
    throw jsonResponse({ error: "unsupported_report" }, 400);
  }
  if (!body.reportTitle || body.reportTitle.length > 160 || !body.snapshot) {
    throw jsonResponse({ error: "invalid_report_context" }, 400);
  }
  if (!validRows(body.snapshot.currentAggregates, 400) ||
      !validRows(body.snapshot.comparisonAggregates ?? [], 200) ||
      !validRows(body.snapshot.detailRows ?? [], 100)) {
    throw jsonResponse({ error: "report_context_too_large" }, 413);
  }
  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_INPUT_CHARS) {
    throw jsonResponse({ error: "report_context_too_large" }, 413);
  }
  return { permissionKey };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function coverage(snapshot: Snapshot) {
  return {
    summaryRows: snapshot.currentAggregates.length,
    comparisonRows: snapshot.comparisonAggregates?.length ?? 0,
    detailRows: snapshot.detailRows?.length ?? 0,
    truncated: false,
  };
}

function fallback(snapshot: Snapshot, locale: string, cacheKey: string): Interpretation {
  const entries = snapshot.currentAggregates.flatMap((row, rowIndex) =>
    Object.entries(row)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([key, value]) => ({ key, value, rowIndex })),
  ).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 3);
  const english = locale.toLowerCase().startsWith("en");
  return {
    status: "fallback",
    headline: english
      ? "The AI provider is unavailable. These are system-verified data points."
      : "AI 服務暫時不可用，以下為系統可核實的資料摘要。",
    trends: entries.map(({ key, value, rowIndex }) => ({
      text: `${key}: ${value}`,
      evidence: [{ label: key, value, source: `currentAggregates[${rowIndex}].${key}` }],
    })),
    anomalies: [],
    limitations: [
      english ? "This is not a full AI interpretation." : "這是程式計算的基礎摘要，不是完整 AI 解讀。",
      ...(snapshot.completeness.notes ?? []),
    ],
    coverage: coverage(snapshot),
    generatedAt: new Date().toISOString(),
    cacheKey,
  };
}

function resolveEvidence(snapshot: Snapshot, source: string): Scalar | undefined {
  const match = /^(currentAggregates|comparisonAggregates|detailRows)\[(\d+)]\.([A-Za-z0-9_]+)$/.exec(source);
  if (!match) return undefined;
  const collection = snapshot[match[1] as "currentAggregates" | "comparisonAggregates" | "detailRows"] ?? [];
  const row = collection[Number(match[2])];
  return row?.[match[3]];
}

function resolveEvidenceRow(snapshot: Snapshot, source: string) {
  const match = /^(currentAggregates|comparisonAggregates|detailRows)\[(\d+)]\.[A-Za-z0-9_]+$/.exec(source);
  if (!match) return [];
  const collection = snapshot[match[1] as "currentAggregates" | "comparisonAggregates" | "detailRows"] ?? [];
  return Object.values(collection[Number(match[2])] ?? {});
}

function textNumbersMatchEvidence(snapshot: Snapshot, text: string, evidence: Evidence[]) {
  return textNumbersAreSupported(
    text,
    evidence.flatMap((item) => [item.value, ...resolveEvidenceRow(snapshot, item.source)]),
  );
}

function validatedFindings(snapshot: Snapshot, raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).flatMap((candidate): Finding[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as { text?: unknown; evidence?: unknown };
    if (typeof value.text !== "string" || value.text.length > 500 || !Array.isArray(value.evidence)) return [];
    const evidence = value.evidence.slice(0, 8).flatMap((rawEvidence): Evidence[] => {
      if (!rawEvidence || typeof rawEvidence !== "object") return [];
      const item = rawEvidence as Partial<Evidence>;
      if (typeof item.label !== "string" || item.label.length > 120 ||
          typeof item.source !== "string" || !isScalar(item.value)) return [];
      const canonical = canonicalReportAiEvidence(snapshot, item.source, item.value);
      if (!canonical) return [];
      return [{ label: item.label, value: canonical.value, source: canonical.source,
        unit: typeof item.unit === "string" ? item.unit.slice(0, 24) : undefined }];
    });
    if (!evidence.length || !textNumbersMatchEvidence(snapshot, value.text, evidence)) return [];
    return [{ text: value.text, evidence }];
  });
}

function findingValidationStats(snapshot: Snapshot, raw: unknown) {
  if (!Array.isArray(raw)) return "0/0/0/0/0";
  let shaped = 0;
  let pathsResolved = 0;
  let evidenceResolved = 0;
  let numbersMatched = 0;
  for (const candidate of raw.slice(0, 6)) {
    if (!candidate || typeof candidate !== "object") continue;
    const value = candidate as { text?: unknown; evidence?: unknown };
    if (typeof value.text !== "string" || !Array.isArray(value.evidence)) continue;
    shaped += 1;
    let candidateHasResolvedPath = false;
    const evidence = value.evidence.flatMap((rawEvidence): Evidence[] => {
      if (!rawEvidence || typeof rawEvidence !== "object") return [];
      const item = rawEvidence as Partial<Evidence>;
      if (typeof item.label !== "string" || typeof item.source !== "string" || !isScalar(item.value)) return [];
      const resolved = resolveEvidence(snapshot, item.source);
      if (resolved !== undefined) candidateHasResolvedPath = true;
      const canonical = canonicalReportAiEvidence(snapshot, item.source, item.value);
      return canonical ? [{
        label: item.label,
        source: canonical.source,
        value: canonical.value,
      }] : [];
    });
    if (candidateHasResolvedPath) pathsResolved += 1;
    if (evidence.length) evidenceResolved += 1;
    if (evidence.length && textNumbersMatchEvidence(snapshot, value.text, evidence)) numbersMatched += 1;
  }
  return `${raw.length}/${shaped}/${pathsResolved}/${evidenceResolved}/${numbersMatched}`;
}

function validationDiagnostic(snapshot: Snapshot, raw: unknown) {
  if (!raw || typeof raw !== "object") return "not_object";
  const value = raw as Record<string, unknown>;
  const headline = typeof value.headline === "string" && value.headline.length <= 500 && !/\d/.test(value.headline)
    ? "h1"
    : "h0";
  return `${headline}:t${findingValidationStats(snapshot, value.trends)}:a${findingValidationStats(snapshot, value.anomalies)}`;
}

function firstEvidenceMismatch(snapshot: Snapshot, raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const value = raw as Record<string, unknown>;
  for (const group of [value.trends, value.anomalies]) {
    if (!Array.isArray(group)) continue;
    for (const candidate of group) {
      if (!candidate || typeof candidate !== "object") continue;
      const evidence = (candidate as { evidence?: unknown }).evidence;
      if (!Array.isArray(evidence)) continue;
      for (const rawEvidence of evidence) {
        if (!rawEvidence || typeof rawEvidence !== "object") continue;
        const item = rawEvidence as Partial<Evidence>;
        if (typeof item.source !== "string" || !isScalar(item.value)) continue;
        const resolved = resolveEvidence(snapshot, item.source);
        if (!sameReportAiScalar(item.value, resolved)) {
          return `${item.source}:${String(item.value)}!=${String(resolved)}`.slice(0, 70);
        }
      }
    }
  }
  return "";
}

function validateInterpretation(snapshot: Snapshot, raw: unknown, cacheKey: string): Interpretation | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.headline !== "string" || value.headline.length > 500 || /\d/.test(value.headline)) return null;
  const trends = validatedFindings(snapshot, value.trends);
  const anomalies = validatedFindings(snapshot, value.anomalies);
  const limitations = Array.isArray(value.limitations)
    ? value.limitations.filter((item): item is string => typeof item === "string").slice(0, 10)
    : [];
  if (!trends.length && !anomalies.length) return null;
  return {
    status: snapshot.completeness.status === "complete" ? "complete" : "partial",
    headline: value.headline,
    trends,
    anomalies,
    limitations: [...limitations, ...(snapshot.completeness.notes ?? [])].slice(0, 12),
    coverage: coverage(snapshot),
    generatedAt: new Date().toISOString(),
    cacheKey,
  };
}

function systemPrompt(locale: string) {
  const language = locale.toLowerCase().startsWith("en") ? "English" : "Traditional Chinese (Hong Kong)";
  return `You interpret business reports for an owner. Respond in ${language} as one JSON object only.
State facts, trends, and anomalies. Do not give business advice and do not invent causes. The headline must not contain digits.
Every finding must include at least one evidence item. Evidence.source must be an exact source path from the supplied data, such as currentAggregates[0].amount, and evidence.value must exactly match that field.
Every digit used in a finding text must be present in that finding's evidence values. Do not calculate a new percentage unless that percentage already exists in the supplied data.
Never claim that missing data is zero. Respect completeness notes and incomplete periods.
Return: {"headline":string,"trends":[{"text":string,"evidence":[{"label":string,"value":string|number|boolean|null,"unit"?:string,"source":string}]}],"anomalies":same,"limitations":[string]}.
Maximum four trends and four anomalies. Keep the headline concise. Keep each finding text under 120 characters and include only the minimum evidence needed.`;
}

function completedDrafts(content: string) {
  const drafts: string[] = [];
  const pattern = /"(?:headline|text)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of content.matchAll(pattern)) {
    try {
      const text = JSON.parse(`"${match[1]}"`) as unknown;
      if (typeof text === "string" && text.trim()) drafts.push(text.trim());
    } catch {
      // The current string is incomplete; a later stream chunk will complete it.
    }
  }
  return drafts;
}

async function callModel(body: RequestBody, onDraft: (text: string) => void) {
  const endpoint = reportAiEnv("REPORT_AI_ENDPOINT", "SUPPLIER_QUOTE_AI_ENDPOINT");
  const apiKey = reportAiEnv("REPORT_AI_API_KEY", "SUPPLIER_QUOTE_AI_API_KEY");
  const model = reportAiEnv("REPORT_AI_MODEL", "SUPPLIER_QUOTE_AI_MODEL");
  const enabled = reportAiEnv("REPORT_AI_ENABLED", "SUPPLIER_QUOTE_AI_ENABLED") === "true";
  if (!enabled || !endpoint || !apiKey || !model) {
    throw new Error("report_ai_disabled");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(Deno.env.get("REPORT_AI_TIMEOUT_MS") ?? 55_000));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(buildReportAiProviderRequest({
        model,
        systemPrompt: systemPrompt(body.locale ?? "zh-HK"),
        reportContext: {
            reportKey: body.reportKey,
            reportTitle: body.reportTitle,
            filters: body.snapshot?.filters,
            completeness: body.snapshot?.completeness,
            currentAggregates: body.snapshot?.currentAggregates,
            comparisonAggregates: body.snapshot?.comparisonAggregates ?? [],
            detailRows: body.snapshot?.detailRows ?? [],
        },
      })),
    });
    if (!response.ok) throw new Error(`report_ai_provider_${response.status}`);
    if (!response.body) throw new Error("report_ai_empty_response");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const emitted = new Set<string>();
    let buffer = "";
    let content = "";
    let finishReason: string | null = null;

    const consumeLine = (line: string) => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      const payload = JSON.parse(data) as {
        choices?: Array<{
          delta?: { content?: string | null };
          finish_reason?: string | null;
        }>;
      };
      if (payload.choices?.[0]?.finish_reason) {
        finishReason = payload.choices[0].finish_reason;
      }
      const delta = payload.choices?.[0]?.delta?.content;
      if (!delta) return;
      content += delta;
      for (const draft of completedDrafts(content)) {
        if (emitted.has(draft)) continue;
        emitted.add(draft);
        onDraft(draft);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (buffer) consumeLine(buffer);
    if (!content.trim()) throw new Error("report_ai_empty_response");
    if (finishReason === "length") throw new Error("report_ai_output_truncated");
    return JSON.parse(content) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleFeedback(request: Request, admin: SupabaseClient, body: FeedbackBody) {
  const permissionKey = body.reportKey ? REPORT_PERMISSION_KEYS[body.reportKey] : null;
  if (!permissionKey || body.permissionKey !== permissionKey || !body.cacheKey ||
      !["helpful", "unhelpful"].includes(body.rating ?? "") ||
      (body.reason && !["numbers", "missing", "unclear", "other"].includes(body.reason))) {
    return jsonResponse({ error: "invalid_feedback" }, 400);
  }
  const user = await requirePermission(request, admin, permissionKey);
  const { data: run } = await admin.from("report_ai_runs").select("id")
    .eq("user_id", user.id).eq("report_key", body.reportKey)
    .eq("snapshot_fingerprint", body.cacheKey)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run?.id) return jsonResponse({ error: "interpretation_not_found" }, 404);
  await admin.from("report_ai_runs").update({
    feedback_rating: body.rating,
    feedback_reason: body.rating === "unhelpful" ? body.reason ?? null : null,
    feedback_at: new Date().toISOString(),
  }).eq("id", run.id);
  return jsonResponse({ ok: true });
}

async function cachedResult(admin: SupabaseClient, userId: string, reportKey: string, locale: string, fingerprint: string) {
  const since = new Date(Date.now() - CACHE_HOURS * 3_600_000).toISOString();
  const { data } = await admin.from("report_ai_runs")
    .select("result")
    .eq("user_id", userId).eq("report_key", reportKey).eq("locale", locale)
    .eq("snapshot_fingerprint", fingerprint).eq("prompt_version", PROMPT_VERSION)
    .eq("status", "complete").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.result as Interpretation | undefined;
}

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const admin = createAdminClient();
  const startedAt = Date.now();
  let runId: string | null = null;
  try {
    const body = await request.json() as RequestBody | FeedbackBody;
    if (body.action === "feedback") return await handleFeedback(request, admin, body);
    const { permissionKey } = validateBody(body);
    const user = await requirePermission(request, admin, permissionKey);
    const snapshot = sanitizeReportAiSnapshot(
      body.reportKey as string,
      body.snapshot as Snapshot,
    );
    const sanitizedBody: RequestBody = { ...body, snapshot };
    const serialized = JSON.stringify(sanitizedBody);
    const fingerprint = await sha256(`${PROMPT_VERSION}:${body.locale ?? "zh-HK"}:${serialized}`);
    const cached = await cachedResult(admin, user.id, body.reportKey as string, body.locale ?? "zh-HK", fingerprint);
    if (cached) {
      return eventStream(async (emit) => {
        emit("status", { stage: "validating" });
        emit("result", cached);
      });
    }

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countError } = await admin.from("report_ai_runs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", dayAgo);
    if (countError) return jsonResponse({ error: "report_ai_limit_unavailable" }, 503);
    if (reportAiLimitExceeded(count ?? 0, MAX_DAILY_REQUESTS, user.role)) {
      return jsonResponse({ error: "report_ai_daily_limit_exceeded" }, 429);
    }
    const { data: run } = await admin.from("report_ai_runs").insert({
      user_id: user.id, user_role: user.role, report_key: body.reportKey,
      permission_key: permissionKey, locale: body.locale ?? "zh-HK",
      snapshot_fingerprint: fingerprint, prompt_version: PROMPT_VERSION,
      provider: reportAiEnv("REPORT_AI_PROVIDER", "SUPPLIER_QUOTE_AI_PROVIDER") || "unconfigured",
      model: reportAiEnv("REPORT_AI_MODEL", "SUPPLIER_QUOTE_AI_MODEL") || "unconfigured",
      input_summary_rows: snapshot.currentAggregates.length,
      input_comparison_rows: snapshot.comparisonAggregates?.length ?? 0,
      input_detail_rows: snapshot.detailRows?.length ?? 0,
      status: "running", soft_limit_exceeded: (count ?? 0) >= MAX_DAILY_REQUESTS,
    }).select("id").single();
    runId = run?.id ?? null;

    return eventStream(async (emit) => {
      emit("status", { stage: "generating" });
      let result: Interpretation;
      let errorCode: string | null = null;
      try {
        const raw = await callModel(sanitizedBody, (text) => emit("draft", { text }));
        emit("status", { stage: "validating" });
        const validated = validateInterpretation(snapshot, raw, fingerprint);
        result = validated ?? fallback(snapshot, body.locale ?? "zh-HK", fingerprint);
        if (!validated) {
          errorCode = `invalid:${validationDiagnostic(snapshot, raw)}:${firstEvidenceMismatch(snapshot, raw)}`.slice(0, 120);
        }
      } catch (modelError) {
        errorCode = modelError instanceof Error ? modelError.message.slice(0, 120) : "provider_failed";
        console.error("report-ai-interpret", errorCode);
        result = fallback(snapshot, body.locale ?? "zh-HK", fingerprint);
      }
      if (runId) {
        await admin.from("report_ai_runs").update({
          status: result.status === "fallback" ? "fallback" : "complete",
          result,
          error_code: errorCode,
          duration_ms: Date.now() - startedAt,
          completed_at: new Date().toISOString(),
        }).eq("id", runId);
      }
      emit("result", result);
    });
  } catch (error) {
    if (runId) {
      await admin.from("report_ai_runs").update({
        status: "failed", error_code: error instanceof Error ? error.message.slice(0, 120) : "request_failed",
        duration_ms: Date.now() - startedAt, completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    if (error instanceof Response) return error;
    console.error("report-ai-interpret", error instanceof Error ? error.message : "request_failed");
    return jsonResponse({ error: "report_ai_failed", diagnostic: "AI 解讀暫時無法完成" }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
