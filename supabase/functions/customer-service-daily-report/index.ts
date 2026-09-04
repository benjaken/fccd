import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PROMPT_VERSION = "customer-service-daily/1";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

function serviceRoleKey() {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const configured = env("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}

function deploymentEnvironment() {
  return env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop");
}

type AdminClient = ReturnType<typeof createClient>;

async function authorize(request: Request, admin: AdminClient) {
  const configuredSecret = firstEnv("CUSTOMER_SERVICE_REPORT_CRON_SECRET", "WATI_ORDER_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret")?.trim() || "";
  if (configuredSecret && suppliedSecret === configuredSecret) return;

  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("authentication_required");
  const { data, error } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) throw new Error("authentication_required");
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await userClient.rpc("customer_service_controls_get");
  if (accessError) throw new Error("page_access_required");
}

function previousHongKongDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 - 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

function reportPeriod(reportDate: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("invalid_report_date");
  const start = new Date(`${reportDate}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) throw new Error("invalid_report_date");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

type TurnRow = {
  id: string;
  question: string;
  answer: string | null;
  intent: string | null;
  route: string | null;
  processing_status: string;
  failure_reason: string | null;
  reply_attempted: boolean;
  reply_sent: boolean;
  human_handoff: boolean;
  used_model: boolean;
  latency_ms: number;
  created_at: string;
};

type Evaluation = {
  turnId: string;
  outcome: "success" | "failure" | "needs_review";
  score: number;
  reason: string;
};

type Suggestion = {
  type: "faq" | "intent" | "policy";
  title: string;
  reason: string;
  question?: string;
  answer?: string;
  category?: string;
  keywords?: string;
  evidenceTurnIds: string[];
};

type AiAnalysis = {
  summary: string;
  failureThemes: Array<{ theme: string; count: number; explanation: string }>;
  evaluations: Evaluation[];
  suggestions: Suggestion[];
  model: string;
};

function aiConfig() {
  return {
    enabled: firstEnv("CUSTOMER_SERVICE_AI_ENABLED", "REPORT_AI_ENABLED").toLowerCase() === "true",
    endpoint: firstEnv("CUSTOMER_SERVICE_AI_ENDPOINT", "REPORT_AI_ENDPOINT", "SUPPLIER_QUOTE_AI_ENDPOINT"),
    apiKey: firstEnv("CUSTOMER_SERVICE_AI_API_KEY", "XAI_API_KEY", "REPORT_AI_API_KEY"),
    model: firstEnv("CUSTOMER_SERVICE_AI_MODEL", "REPORT_AI_MODEL", "SUPPLIER_QUOTE_AI_MODEL") || "grok-4.3",
  };
}

function parseAiAnalysis(payload: unknown, turns: TurnRow[], model: string): AiAnalysis | null {
  const response = payload as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  const parsed = JSON.parse(json) as Partial<AiAnalysis>;
  const knownIds = new Set(turns.map((turn) => turn.id));
  const outcomes = new Set(["success", "failure", "needs_review"]);
  const evaluations = Array.isArray(parsed.evaluations)
    ? parsed.evaluations.filter((item): item is Evaluation =>
      Boolean(item) && knownIds.has(String(item.turnId)) && outcomes.has(String(item.outcome))
    ).map((item) => ({
      turnId: String(item.turnId),
      outcome: item.outcome,
      score: Math.max(0, Math.min(1, Number(item.score) || 0)),
      reason: String(item.reason || "").slice(0, 600),
    }))
    : [];
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((item): item is Suggestion =>
      Boolean(item) && ["faq", "intent", "policy"].includes(String(item.type)) && Boolean(item.title)
    ).slice(0, 12).map((item) => ({
      type: item.type,
      title: String(item.title).slice(0, 200),
      reason: String(item.reason || "").slice(0, 1_000),
      question: String(item.question || "").slice(0, 500),
      answer: String(item.answer || "").slice(0, 2_000),
      category: String(item.category || "ordering").slice(0, 50),
      keywords: String(item.keywords || "").slice(0, 500),
      evidenceTurnIds: Array.isArray(item.evidenceTurnIds)
        ? [...new Set(item.evidenceTurnIds.map(String).filter((id) => knownIds.has(id)))].slice(0, 30)
        : [],
    }))
    : [];
  return {
    summary: String(parsed.summary || "").slice(0, 5_000),
    failureThemes: Array.isArray(parsed.failureThemes) ? parsed.failureThemes.slice(0, 12) : [],
    evaluations,
    suggestions,
    model,
  };
}

async function analyzeWithAi(turns: TurnRow[]): Promise<AiAnalysis | null> {
  const config = aiConfig();
  if (!turns.length || !config.enabled || !config.endpoint || !config.apiKey) return null;
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.1,
      max_tokens: 4_000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You audit Food Channels WhatsApp customer-service conversations.",
            "Judge whether each answer correctly resolves the question or safely advances the required workflow.",
            "A correct order-change handoff is a success, not a failure. A message-send error, irrelevant answer, or no grounded answer is a failure.",
            "Use needs_review when the transcript is insufficient. Never infer success merely because a message was sent.",
            "Create improvement suggestions by clustering repeated failures.",
            "Never invent company prices, policies, dates, or promises. For a missing FAQ whose answer is not supported by an existing successful answer, leave answer empty.",
            "Return JSON only with summary, failureThemes, evaluations, and suggestions.",
            "Each evaluation must contain turnId, outcome, score from 0 to 1, and a concise Traditional Chinese reason.",
            "Each suggestion contains type faq|intent|policy, title, reason, optional question/answer/category/keywords, and evidenceTurnIds.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            conversations: turns.slice(0, 250).map((turn) => ({
              turnId: turn.id,
              question: turn.question,
              answer: turn.answer,
              intent: turn.intent,
              route: turn.route,
              processingStatus: turn.processing_status,
              failureReason: turn.failure_reason,
              replySent: turn.reply_sent,
              humanHandoff: turn.human_handoff,
            })),
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`customer_service_report_ai_${response.status}`);
  return parseAiAnalysis(await response.json(), turns, config.model);
}

function countBy(rows: TurnRow[], key: keyof TurnRow) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? "unknown");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

async function updateEvaluations(admin: AdminClient, evaluations: Evaluation[]) {
  for (let index = 0; index < evaluations.length; index += 20) {
    await Promise.all(evaluations.slice(index, index + 20).map(async (evaluation) => {
      const { error } = await admin.from("customer_service_turns").update({
        ai_outcome: evaluation.outcome,
        ai_score: evaluation.score,
        ai_reason: evaluation.reason,
        evaluated_at: new Date().toISOString(),
      }).eq("id", evaluation.turnId);
      if (error) throw error;
    }));
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const admin = createClient(env("SUPABASE_URL"), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    await authorize(request, admin);
    const body = await request.json().catch(() => ({})) as { report_date?: unknown };
    const reportDate = typeof body.report_date === "string" ? body.report_date : previousHongKongDate();
    const period = reportPeriod(reportDate);
    const environment = deploymentEnvironment();
    const { data, error } = await admin
      .from("customer_service_turns")
      .select("id,question,answer,intent,route,processing_status,failure_reason,reply_attempted,reply_sent,human_handoff,used_model,latency_ms,created_at")
      .eq("environment", environment)
      .gte("created_at", period.start)
      .lt("created_at", period.end)
      .order("created_at");
    if (error) throw error;
    const turns = (data ?? []) as TurnRow[];

    let analysis: AiAnalysis | null = null;
    let analysisError = "";
    try {
      analysis = await analyzeWithAi(turns.filter((turn) => turn.processing_status !== "skipped"));
      if (analysis) await updateEvaluations(admin, analysis.evaluations);
    } catch (error) {
      analysisError = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      console.error("customer service daily AI analysis failed", analysisError);
    }

    const evaluations = analysis?.evaluations ?? [];
    const successful = evaluations.filter((item) => item.outcome === "success").length;
    const failed = evaluations.filter((item) => item.outcome === "failure").length;
    const needsReview = evaluations.filter((item) => item.outcome === "needs_review").length;
    const attempted = turns.filter((turn) => turn.reply_attempted).length;
    const sent = turns.filter((turn) => turn.reply_sent).length;
    const eligible = turns.filter((turn) => turn.processing_status !== "skipped").length;
    const metrics = {
      received: turns.length,
      eligible,
      replied: turns.filter((turn) => turn.processing_status === "replied").length,
      handoff: turns.filter((turn) => turn.processing_status === "handoff").length,
      unanswered: turns.filter((turn) => turn.processing_status === "unanswered").length,
      technical_failures: turns.filter((turn) => turn.processing_status === "failed").length,
      skipped: turns.filter((turn) => turn.processing_status === "skipped").length,
      ai_evaluated: evaluations.length,
      successful,
      failed,
      needs_review: needsReview,
      success_rate: successful + failed > 0 ? successful / (successful + failed) : null,
      send_success_rate: attempted > 0 ? sent / attempted : null,
      average_latency_ms: turns.length
        ? Math.round(turns.reduce((sum, turn) => sum + Number(turn.latency_ms || 0), 0) / turns.length)
        : 0,
    };
    const status = analysisError ? "partial" : analysis ? "complete" : "partial";
    const { data: report, error: reportError } = await admin
      .from("customer_service_daily_reports")
      .upsert({
        report_date: reportDate,
        environment,
        period_start: period.start,
        period_end: period.end,
        metrics,
        top_intents: countBy(turns, "intent").slice(0, 12),
        failure_themes: analysis?.failureThemes ?? countBy(
          turns.filter((turn) => Boolean(turn.failure_reason)),
          "failure_reason",
        ).slice(0, 12),
        ai_summary: analysis?.summary || (turns.length
          ? "已完成客觀統計；AI 分析尚未啟用或未能完成。"
          : "此日期沒有 WhatsApp 自動客服對話。"),
        model: analysis?.model || null,
        prompt_version: PROMPT_VERSION,
        status,
        error: analysisError || null,
        generated_at: new Date().toISOString(),
      }, { onConflict: "report_date,environment" })
      .select("id")
      .single();
    if (reportError || !report) throw reportError || new Error("daily_report_write_failed");

    await admin.from("customer_service_learning_suggestions")
      .delete()
      .eq("report_id", report.id)
      .eq("status", "draft");
    if (analysis?.suggestions.length) {
      const { error: suggestionError } = await admin.from("customer_service_learning_suggestions").insert(
        analysis.suggestions.map((suggestion) => ({
          report_id: report.id,
          suggestion_type: suggestion.type,
          title: suggestion.title,
          reason: suggestion.reason,
          proposed_content: {
            question: suggestion.question || "",
            answer: suggestion.answer || "",
            category: suggestion.category || "ordering",
            keywords: suggestion.keywords || "",
          },
          evidence_turn_ids: suggestion.evidenceTurnIds,
        })),
      );
      if (suggestionError) throw suggestionError;
    }

    return jsonResponse({ ok: true, report_id: report.id, report_date: reportDate, status, metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "authentication_required" ? 401 : message === "page_access_required" ? 403 : 500;
    console.error("customer service daily report failed", message.slice(0, 500));
    return jsonResponse({ error: "customer_service_daily_report_failed", detail: message.slice(0, 500) }, status);
  }
});
