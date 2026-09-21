import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, ListChecks, Sparkles, Square, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchCustomerServiceHistoryReplayCapabilities,
  fetchCustomerServiceHistoryReplayRuns,
  fetchCustomerServiceHistoryReplaySamples,
  fetchCustomerServiceRepairProposals,
  judgeCustomerServiceHistoryReplay,
  judgeCustomerServiceHistoryReplayJev,
  processCustomerServiceHistoryReplay,
  runCustomerServiceHistoryAutoRepair,
  rollbackCustomerServiceRepairProposal,
  startCustomerServiceHistoryReplay,
  type CustomerServiceHistoryReplayRun,
  type CustomerServiceHistoryReplaySample,
  type CustomerServiceRepairProposal,
} from "@/lib/customer-faq";

const HISTORY_REPLAY_ERROR_MESSAGES: Record<string, string> = {
  history_eval_disabled:
    "歷史評估尚未啟用。請由管理員設定 Supabase 密鑰 CUSTOMER_SERVICE_HISTORY_EVAL_ENABLED=true 後再試。",
  jev_disabled:
    "Jev 第二評判尚未啟用。請由管理員設定 Supabase 密鑰 CUSTOMER_SERVICE_HISTORY_JEV_ENABLED=true 後再試。",
  jev_not_configured:
    "還未設定 TypeSafe API key。請由管理員在 Supabase 密鑰加入 TYPESAFE_API_KEY（只留在後端）。",
  jev_configuration_error:
    "TypeSafe 配置有問題（API key 無效或請求被拒）。批次已停止，請檢查後端設定後重試。",
  no_replay_samples:
    "找不到可回放的歷史對話。請先在「歷史對話」匯入對話後再試。",
  no_routing_samples: "沒有可用的路由樣本。",
  environment_mismatch: "環境設定不符，請確認目前環境後再試。",
  config_changed_restart_run: "客服模型設定已變更，請開始新的歷史回放。",
  auto_apply_disabled:
    "受控套用未啟用。請設定 CUSTOMER_SERVICE_AUTO_REPAIR_MODE=apply_allowlist 後再試。",
  sample_not_found: "找不到該樣本。",
  proposal_not_found: "找不到該修復提案。",
  proposal_not_reviewable: "提案目前的狀態不可再審核。",
  proposal_not_validatable: "提案目前的狀態不可驗證。",
  proposal_not_ready: "提案未通過驗證，不能套用。",
  proposal_not_applied: "提案未套用，無法撤回。",
  validation_required: "需要先完成隔離驗證並通過。",
  reviewer_required: "需要由有權限的覆核人員核准。",
  auto_repair_disabled: "自動修復尚未啟用。由管理員設定修復模式後可運行。",
  auto_repair_paused: "自動修復已暫停。",
  run_not_ready: "回放和判定尚未完成，請先跑完。",
  active_config_required: "自動修復需要已啟用且固定版本的客服設定。",
  rollback_not_owned: "這份 FAQ 草稿不屬於此提案，無法撤回。",
  rollback_published: "FAQ 已發布，請先在知識庫處理。",
  rollback_not_deleted: "草稿狀態已改變，請重新載入後再試。",
  no_candidate_guidance: "提案沒有可用的候選內容。",
  no_source_samples: "提案沒有來源樣本。",
  page_access_required: "沒有編輯權限，無法執行歷史回放。",
  authentication_required: "登入狀態已失效，請重新登入。",
};

function historyReplayErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  return (
    HISTORY_REPLAY_ERROR_MESSAGES[code] ||
    `歷史回放失敗${code ? `（${code}）` : ""}，請稍後再試。`
  );
}

const REPLAY_CALL_LIMIT = 8;
const REPLAY_CONCURRENCY = 4;
const REPLAY_LOG_MAX = 300;

const REPLAY_STATUS_LABELS: Record<string, string> = {
  scored: "可評估",
  not_evaluable: "不可評估",
  out_of_scope: "超出範圍",
  execution_failed: "執行失敗",
};
const JUDGE_COMPARISON_LABELS: Record<string, string> = {
  match: "一致",
  partial: "部分一致",
  divergent: "有差異",
  inconclusive: "未能判定",
};
const JEV_AGREEMENT_LABELS: Record<string, string> = {
  agree: "兩者一致",
  divergent: "兩者分歧",
  incomparable: "無法比較",
};
const JEV_GROUNDING_LABELS: Record<string, string> = {
  supported: "有依據",
  unsupported: "無依據",
  conflicting: "有衝突",
  unknown: "不明",
};
const JEV_COVERAGE_LABELS: Record<string, string> = {
  complete: "完整",
  partial: "部分",
  missed: "漏答",
  unknown: "不明",
};
const JEV_STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
  complete: "已完成",
  skipped: "已跳過",
  failed: "服務錯誤",
};
const HISTORY_ISSUE_LAYER_LABELS: Record<string, string> = {
  sample: "樣本",
  context: "上下文",
  routing: "路由",
  retrieval: "檢索",
  knowledge: "知識",
  generation: "生成",
  validation: "驗證",
  rendering: "渲染",
  infrastructure: "基礎設施",
};
const HISTORY_ISSUE_CATEGORY_LABELS: Record<string, string> = {
  retrieval_miss: "檢索未命中",
  context_dropped: "上下文遺漏",
  repeated_question: "重複提問",
  missing_coverage: "答案未覆蓋",
  wrong_policy: "政策錯誤",
  wrong_product: "產品錯誤",
  wrong_amount_date: "金額／日期錯誤",
  unsupported_commitment: "未經支持承諾",
  tone: "語氣",
  policy_drift: "政策漂移",
  reference_not_current: "真人參考過時",
  pairing_uncertain: "配對不確定",
  context_gap: "上下文缺口",
  infrastructure: "基礎設施",
  relevance: "答非所問",
  incomplete_response: "答覆不完整",
  response_style: "回覆風格",
  generation: "生成",
};
const HISTORY_ISSUE_SEVERITY_LABELS: Record<string, string> = {
  low: "輕微",
  medium: "中等",
  high: "嚴重",
  critical: "極嚴重",
};

function formatJevPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function replayRoleLabel(role: string) {
  return role === "customer" ? "客" : role === "human" ? "真人" : "AI";
}

/**
 * Renders the judge's per-issue diagnosis so an R3 code-change proposal is not
 * opaque: it lists what layer is wrong and the concrete `suggestedFix`.
 */
function HistoryIssueFixes({ issues }: { issues: Array<Record<string, unknown>> }) {
  const rows = issues.filter((issue) => issue && typeof issue === "object");
  if (!rows.length) return null;
  return (
    <ul className="cs-issue-fixes">
      {rows.map((issue, index) => {
        const layer = String(issue.layer ?? "").trim();
        const category = String(issue.category ?? "").trim();
        const severity = String(issue.severity ?? "").trim();
        const fix = typeof issue.suggestedFix === "string" ? issue.suggestedFix.trim() : "";
        const evidence = Array.isArray(issue.evidence)
          ? (issue.evidence as Array<Record<string, unknown>>)
          : [];
        const tags = [
          HISTORY_ISSUE_LAYER_LABELS[layer] ?? layer,
          category ? HISTORY_ISSUE_CATEGORY_LABELS[category] ?? category : "",
          severity ? HISTORY_ISSUE_SEVERITY_LABELS[severity] ?? severity : "",
        ].filter(Boolean);
        return (
          <li key={`${layer}-${category}-${index}`}>
            {tags.length ? <span className="cs-issue-tag">{tags.join(" · ")}</span> : null}
            <span className="cs-issue-fix">{fix || "判官未提供具體建議，需人工檢視。"}</span>
            {evidence.length ? (
              <ul className="cs-issue-evidence">
                {evidence.map((item, itemIndex) => {
                  const quote = typeof item.quote === "string" ? item.quote.trim() : "";
                  if (!quote) return null;
                  const sourceType = String(item.sourceType ?? "").trim();
                  return (
                    <li key={itemIndex}>
                      依據{sourceType ? `（${sourceType}）` : ""}：{quote}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function replayTimeLabel(value: string) {
  return value ? value.slice(0, 16).replace("T", " ") : "";
}

function replayTimeRange(samples: CustomerServiceHistoryReplaySample[]) {
  const first = replayTimeLabel(samples[0]?.scenarioAt ?? "");
  const last = replayTimeLabel(samples[samples.length - 1]?.scenarioAt ?? "");
  if (!first) return "";
  return first === last ? first : `${first} ~ ${last}`;
}

type ReplayConversationGroup = {
  key: string;
  conversationId: string | null;
  samples: CustomerServiceHistoryReplaySample[];
};

/** Groups decision points that belong to the same conversation, newest first. */
function groupReplaySamples(samples: CustomerServiceHistoryReplaySample[]): ReplayConversationGroup[] {
  const map = new Map<string, CustomerServiceHistoryReplaySample[]>();
  for (const sample of samples) {
    const key = sample.conversationId || `sample:${sample.id}`;
    const list = map.get(key);
    if (list) list.push(sample);
    else map.set(key, [sample]);
  }
  const groups = [...map.entries()].map(([key, list]) => ({
    key,
    conversationId: list[0]?.conversationId ?? null,
    samples: [...list].sort((left, right) => left.scenarioAt.localeCompare(right.scenarioAt)),
  }));
  groups.sort((left, right) => {
    const leftLast = left.samples[left.samples.length - 1]?.scenarioAt ?? "";
    const rightLast = right.samples[right.samples.length - 1]?.scenarioAt ?? "";
    return rightLast.localeCompare(leftLast);
  });
  return groups;
}

type ReplayThreadEntry =
  | { kind: "context"; key: string; role: string; text: string }
  | { kind: "decision"; key: string; sample: CustomerServiceHistoryReplaySample };

/**
 * Flattens a conversation's decision points into one readable thread. Context
 * messages already shown by an earlier decision point are not repeated: only
 * the overlapping prefix is dropped, so the reader sees each turn once.
 */
function buildReplayThread(samples: CustomerServiceHistoryReplaySample[]): ReplayThreadEntry[] {
  const entries: ReplayThreadEntry[] = [];
  const rendered: Array<{ role: string; text: string }> = [];
  const keyOf = (role: string, text: string) => `${role}\u0000${text}`;
  for (const sample of samples) {
    const upcoming = sample.context.map((message) => ({ role: message.role, text: message.text }));
    const existingKeys = rendered.map((message) => keyOf(message.role, message.text));
    const upcomingKeys = upcoming.map((message) => keyOf(message.role, message.text));
    const max = Math.min(existingKeys.length, upcomingKeys.length);
    let overlap = 0;
    for (let length = max; length > 0; length -= 1) {
      if (existingKeys.slice(existingKeys.length - length).join("\u0001") ===
          upcomingKeys.slice(0, length).join("\u0001")) {
        overlap = length;
        break;
      }
    }
    upcoming.slice(overlap).forEach((message, index) => {
      entries.push({ kind: "context", key: `${sample.id}-ctx-${overlap + index}`,
        role: message.role, text: message.text });
    });
    rendered.push(...upcoming);
    entries.push({ kind: "decision", key: `${sample.id}-decision`, sample });
    rendered.push({ role: "customer", text: sample.question });
    if (sample.aiAnswer) rendered.push({ role: "assistant", text: sample.aiAnswer });
    if (sample.referenceAnswer) rendered.push({ role: "human", text: sample.referenceAnswer });
  }
  return entries;
}

function HistoryJevBlock({ sample }: { sample: CustomerServiceHistoryReplaySample }) {
  if (!sample.jev) {
    return (
      <p>
        <strong>Jev 判斷：</strong>未運行
      </p>
    );
  }
  return (
    <>
      <div className="customer-service-replay-jev">
        <p>
          <strong>Jev 判斷：</strong>
          {JEV_STATUS_LABELS[sample.jev.status] ?? sample.jev.status} ·{" "}
          {sample.jev.modelResolved ?? sample.jev.modelRequested} · {sample.jev.rubricVersion}
        </p>
        {sample.jev.status === "complete" ? (
          <>
            <p>
              <strong>依據：</strong>
              {JEV_GROUNDING_LABELS[sample.jev.grounding?.choice ?? ""] ?? sample.jev.grounding?.choice ?? "—"}
              {" · "}
              <strong>覆蓋：</strong>
              {JEV_COVERAGE_LABELS[sample.jev.coverage?.choice ?? ""] ?? sample.jev.coverage?.choice ?? "—"}
            </p>
            <p>
              <strong>未證實操作概率：</strong>
              {formatJevPercent(sample.jev.unverifiedAction)}
              {" · "}
              <strong>人工覆核概率：</strong>
              {formatJevPercent(sample.jev.humanReview)}
            </p>
            <p className="customer-service-import-progress">
              概率為模型估計，需以本地標註集校準後才作業務門檻。
            </p>
          </>
        ) : sample.jev.status === "skipped" ? (
          <p>樣本未送 Jev（{sample.jev.errorCode ?? "不可評估"}）。</p>
        ) : sample.jev.status === "failed" ? (
          <p>
            服務錯誤（{sample.jev.errorCode ?? "failed"}）
            {sample.jev.outcomeUncertain ? "，逾時結果不確定，重試可能增加用量" : ""}。
          </p>
        ) : (
          <p>正待執行。</p>
        )}
      </div>
      <p>
        <strong>兩者比較：</strong>
        {JEV_AGREEMENT_LABELS[sample.agreement ?? "incomparable"] ?? "無法比較"}
        {sample.agreement === "divergent" ? "（需覆核）" : ""}
      </p>
    </>
  );
}

type ReplaySampleFilter =
  | "all" | "needs_review" | "divergent" | "partial" | "match" | "inconclusive" | "none"
  | "jev_divergent" | "jev_unfinished";
const REPLAY_FILTERS: Array<{ value: ReplaySampleFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "needs_review", label: "需覆核（分歧／高風險／阻擋）" },
  { value: "divergent", label: "有差異" },
  { value: "partial", label: "部分" },
  { value: "match", label: "一致" },
  { value: "inconclusive", label: "未能判定" },
  { value: "none", label: "未判定" },
  { value: "jev_divergent", label: "評判分歧" },
  { value: "jev_unfinished", label: "Jev 未完成／失敗" },
];

function hongKongDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function newReplaySeed() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 歷史回放評估面板。只讀歷史對話、產生診斷與提案；不發送 WhatsApp、不執行訂單操作。
 */
export function CustomerServiceHistoryReplayPanel({ canEdit = false }: { canEdit?: boolean }) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<CustomerServiceHistoryReplayRun[]>([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [busy, setBusy] = useState<"" | "loading" | "start" | "all">("loading");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [sampleSize, setSampleSize] = useState(50);
  const [sampleMode, setSampleMode] = useState<"recent" | "random">("recent");
  const [sampleSeed, setSampleSeed] = useState("");
  const [sourceSince, setSourceSince] = useState("");
  const [sourceUntil, setSourceUntil] = useState("");
  const [progressOpen, setProgressOpen] = useState(false);
  const [phase, setPhase] = useState("準備");
  const [log, setLog] = useState<string[]>([]);
  const [counts, setCounts] = useState({ planned: 0, processed: 0, remaining: 0, judged: 0 });
  const [samples, setSamples] = useState<CustomerServiceHistoryReplaySample[]>([]);
  const [samplesBusy, setSamplesBusy] = useState(false);
  const [samplesError, setSamplesError] = useState("");
  const [proposals, setProposals] = useState<CustomerServiceRepairProposal[]>([]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalMessage, setProposalMessage] = useState("");
  const [sampleFilter, setSampleFilter] = useState<ReplaySampleFilter>("all");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"diagnosis" | "proposals">("diagnosis");
  const [reviewBusy, setReviewBusy] = useState("");
  const [jevEnabled, setJevEnabled] = useState(false);
  const [jevBusy, setJevBusy] = useState(false);
  const [jevMessage, setJevMessage] = useState("");
  const [expandedConversations, setExpandedConversations] = useState<Record<string, boolean>>({});
  const cancelRef = useRef(false);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? null;

  const load = useCallback(async () => {
    setBusy("loading");
    setError("");
    try {
      const next = await fetchCustomerServiceHistoryReplayRuns();
      setRuns(next);
      setActiveRunId((current) => current || next[0]?.id || "");
    } catch {
      setError("載入歷史回放記錄失敗。");
    } finally {
      setBusy("");
    }
  }, []);

  const loadSamples = useCallback(async () => {
    if (!activeRunId) {
      setSamples([]);
      return;
    }
    setSamplesBusy(true);
    setSamplesError("");
    try {
      setSamples(await fetchCustomerServiceHistoryReplaySamples(activeRunId));
    } catch (error) {
      setSamplesError(historyReplayErrorMessage(error));
    } finally {
      setSamplesBusy(false);
    }
  }, [activeRunId]);

  const loadProposals = useCallback(async () => {
    if (!activeRunId) {
      setProposals([]);
      return;
    }
    try {
      setProposals(await fetchCustomerServiceRepairProposals(activeRunId));
    } catch {
      // Proposals are secondary; a load failure must not hide the diagnosis.
    }
  }, [activeRunId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void fetchCustomerServiceHistoryReplayCapabilities()
      .then((capabilities) => { if (!cancelled) setJevEnabled(capabilities.jevEnabled); })
      .catch(() => { if (!cancelled) setJevEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void loadSamples();
  }, [loadSamples]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const filteredSamples = samples.filter((sample) => {
    if (sampleFilter === "all") return true;
    if (sampleFilter === "needs_review") {
      return sample.requiresHumanReview
        || sample.status === "not_evaluable"
        || sample.agreement === "divergent"
        || sample.comparison === "divergent";
    }
    if (sampleFilter === "none") return !sample.comparison;
    if (sampleFilter === "jev_divergent") return sample.agreement === "divergent";
    if (sampleFilter === "jev_unfinished") {
      return !sample.jev || sample.jev.status === "failed" || sample.jev.status === "skipped";
    }
    return sample.comparison === sampleFilter;
  });

  const conversationGroups = groupReplaySamples(filteredSamples);

  const runJev = async () => {
    if (!canEdit || jevBusy || !activeRunId) return;
    setJevBusy(true);
    setJevMessage("");
    try {
      for (let step = 0; step < 200; step += 1) {
        const result = await judgeCustomerServiceHistoryReplayJev(
          activeRunId, REPLAY_CALL_LIMIT, REPLAY_CONCURRENCY,
        );
        if (result?.error) throw new Error(result.error);
        if (result?.config_error) throw new Error("jev_configuration_error");
        if (result?.note === "routing_safety_not_applicable") {
          setJevMessage("路由安全集合只作確定性判定，不適用 Jev 第二評判。");
          break;
        }
        const evaluated = result?.evaluated ?? 0;
        setJevMessage(
          `Jev 第二評判：完成 ${evaluated} · 分歧 ${result?.divergent ?? 0} · 失敗 ${result?.failed ?? 0} · 跳過 ${result?.skipped ?? 0}。`,
        );
        if ((result?.remaining ?? 0) <= 0) break;
        if (evaluated === 0 && (result?.failed ?? 0) === 0 && (result?.skipped ?? 0) === 0) break;
      }
      await loadSamples();
    } catch (error) {
      setJevMessage(historyReplayErrorMessage(error));
    } finally {
      setJevBusy(false);
    }
  };

  const runAutoRepair = async () => {
    if (!canEdit || proposalBusy || !activeRunId) return;
    setProposalBusy(true);
    setProposalMessage("");
    try {
      const result = await runCustomerServiceHistoryAutoRepair(activeRunId, 1);
      if (result?.error) throw new Error(result.error);
      const item = result?.results?.[0];
      setProposalMessage(item ? `自動判定：${item.status}（${item.reason}）。`
        : "沒有新的可處理問題。證據不足時不會自動生效。");
      await loadProposals();
    } catch (error) {
      setProposalMessage(historyReplayErrorMessage(error));
    } finally {
      setProposalBusy(false);
    }
  };

  const rollbackProposal = async (proposalId: string) => {
    if (!canEdit || reviewBusy || !activeRunId) return;
    setReviewBusy(proposalId);
    setProposalMessage("");
    try {
      const result = await rollbackCustomerServiceRepairProposal(proposalId);
      if (result?.error) throw new Error(result.error);
      setProposalMessage("已撤回此修復。");
      await loadProposals();
    } catch (error) {
      setProposalMessage(historyReplayErrorMessage(error));
    } finally {
      setReviewBusy("");
    }
  };

  const start = async () => {
    if (!canEdit || busy) return;
    setBusy("start");
    setError("");
    setProgress("");
    try {
      const seed = sampleMode === "random" ? sampleSeed.trim() || newReplaySeed() : "";
      if (seed && seed !== sampleSeed) setSampleSeed(seed);
      const result = await startCustomerServiceHistoryReplay({
        sampleSize,
        sourceSince: sourceSince ? `${sourceSince}T00:00:00+08:00` : undefined,
        sourceUntil: sourceUntil ? `${sourceUntil}T23:59:59+08:00` : undefined,
        seed: seed || undefined,
      });
      if (result?.error) throw new Error(result.error);
      setProgress(`已建立回放（${result?.planned ?? 0} 個樣本${seed ? `，種子 ${seed}` : ""}）。`);
      if (result?.run_id) setActiveRunId(result.run_id);
      await load();
    } catch (error) {
      setError(historyReplayErrorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const appendLog = (lines: string[]) => {
    if (!lines.length) return;
    setLog((current) => [...current, ...lines].slice(-REPLAY_LOG_MAX));
  };

  const runAll = async () => {
    if (!canEdit || busy || !activeRunId) return;
    cancelRef.current = false;
    setBusy("all");
    setError("");
    setProgress("");
    setPhase("回放");
    setLog([]);
    setCounts({
      planned: activeRun?.planned ?? sampleSize,
      processed: activeRun?.processed ?? 0,
      remaining: Math.max(0, (activeRun?.planned ?? sampleSize) - (activeRun?.processed ?? 0)),
      judged: activeRun?.scored ?? 0,
    });
    setProgressOpen(true);
    try {
      for (let step = 0; step < 1_000 && !cancelRef.current; step += 1) {
        const result = await processCustomerServiceHistoryReplay(
          activeRunId,
          REPLAY_CALL_LIMIT,
          REPLAY_CONCURRENCY,
        );
        if (result?.error) throw new Error(result.error);
        setCounts((current) => ({
          ...current,
          processed: result?.processed ?? current.processed,
          remaining: result?.remaining ?? current.remaining,
        }));
        appendLog(
          (result?.items ?? []).map(
            (item) => `回放 · ${REPLAY_STATUS_LABELS[item.status] ?? item.status}：${item.question}`,
          ),
        );
        if ((result?.remaining ?? 0) <= 0 || !(result?.items ?? []).length) break;
      }
      if (!cancelRef.current) {
        setPhase("判定");
        for (let step = 0; step < 1_000 && !cancelRef.current; step += 1) {
          const result = await judgeCustomerServiceHistoryReplay(
            activeRunId,
            REPLAY_CALL_LIMIT,
            REPLAY_CONCURRENCY,
          );
          if (result?.error) throw new Error(result.error);
          setCounts((current) => ({ ...current, judged: current.judged + (result?.judged ?? 0) }));
          appendLog(
            (result?.items ?? []).map(
              (item) =>
                `判定 · ${item.comparison ? JUDGE_COMPARISON_LABELS[item.comparison] ?? item.comparison : "—"}（${
                  REPLAY_STATUS_LABELS[item.status] ?? item.status
                }）：${item.question}`,
            ),
          );
          if ((result?.judged ?? 0) <= 0) break;
        }
      }
      if (!cancelRef.current) {
        setPhase("自動診斷與驗證");
        for (let step = 0; step < Math.min(sampleSize, 200) && !cancelRef.current; step += 1) {
          const result = await runCustomerServiceHistoryAutoRepair(activeRunId, 1);
          if (result?.error === "auto_repair_disabled") {
            appendLog(["自動修復尚未啟用。"]);
            break;
          }
          if (result?.error) throw new Error(result.error);
          const item = result?.results?.[0];
          if (!item) break;
          appendLog([`自動修復 · ${item.status}：${item.reason}`]);
        }
      }
      setPhase(cancelRef.current ? "已停止" : "完成");
      await load();
      await loadSamples();
      await loadProposals();
    } catch (error) {
      setError(historyReplayErrorMessage(error));
      setPhase("出錯");
    } finally {
      setBusy("");
    }
  };
  const stopRunAll = () => {
    cancelRef.current = true;
  };

  const totalForBar = counts.processed + counts.remaining;
  const percent = totalForBar > 0 ? Math.round((counts.processed / totalForBar) * 100) : 0;

  return (
    <div className="customer-service-history-replay">
      <p className="customer-service-import-progress">
        以現行政策回測歷史問題，對有核實來源的檢索問題自動診斷、驗證及修復。場景回覆不會寫入 FAQ。
      </p>
      <div className="customer-service-import-controls">
        <label>
          <span>樣本量</span>
          <input
            type="number"
            min={1}
            max={200}
            value={sampleSize}
            disabled={busy !== "" || !canEdit}
            onChange={(event) => setSampleSize(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
          />
        </label>
        <label>
          <span>抽樣方式</span>
          <select
            value={sampleMode}
            disabled={busy !== "" || !canEdit}
            onChange={(event) => setSampleMode(event.target.value === "random" ? "random" : "recent")}
          >
            <option value="recent">最近 N 個</option>
            <option value="random">隨機（整段時間）</option>
          </select>
        </label>
        {sampleMode === "random" ? (
          <>
            <label>
              <span>隨機種子</span>
              <input
                type="text"
                value={sampleSeed}
                placeholder={t("settings.customerFaq.historyReplaySeedPlaceholder")}
                maxLength={64}
                disabled={busy !== "" || !canEdit}
                onChange={(event) => setSampleSeed(event.target.value.slice(0, 64))}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== "" || !canEdit}
              onClick={() => setSampleSeed(newReplaySeed())}
            >
              重新產生種子
            </Button>
          </>
        ) : null}
        <label>
          <span>起始日期</span>
          <input
            type="date"
            value={sourceSince}
            max={sourceUntil || hongKongDate()}
            disabled={busy !== "" || !canEdit}
            onChange={(event) => setSourceSince(event.target.value)}
          />
        </label>
        <label>
          <span>結束日期</span>
          <input
            type="date"
            value={sourceUntil}
            min={sourceSince || undefined}
            disabled={busy !== "" || !canEdit}
            onChange={(event) => setSourceUntil(event.target.value)}
          />
        </label>
        <Button type="button" disabled={!canEdit || busy !== ""} onClick={() => void start()}>
          <Sparkles />
          {busy === "start" ? "建立中…" : "開始歷史回放"}
        </Button>
        <Button
          type="button"
          disabled={!canEdit || busy !== "" || !activeRunId}
          onClick={() => void runAll()}
        >
          <Zap />
          {busy === "all" ? "跑緊…" : "一鍵跑完"}
        </Button>
        {busy === "all" ? (
          <Button type="button" variant="outline" onClick={stopRunAll}>
            <Square />
            停止
          </Button>
        ) : null}
      </div>
      {progress ? (
        <p className="customer-service-import-progress" role="status">
          {progress}
        </p>
      ) : null}
      {error ? (
        <p className="customer-service-import-progress" role="alert">
          {error}
        </p>
      ) : null}
      <div className="customer-service-import-days">
        <header>
          <strong>回放記錄</strong>
        </header>
        {runs.length ? (
          runs.map((run) => (
            <article key={run.id}>
              <span>{run.createdAt.slice(0, 10)}</span>
              <span>
                {run.status} · 計劃 {run.planned} · 已處理 {run.processed} · 可評估 {run.scored}
                {run.failed ? ` · 失敗 ${run.failed}` : ""}
                {run.seed ? ` · 種子 ${run.seed}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant={run.id === activeRunId ? "default" : "outline"}
                onClick={() => setActiveRunId(run.id)}
              >
                選取
              </Button>
            </article>
          ))
        ) : (
          <p className="customer-service-import-progress">
            尚無歷史回放記錄。按「開始歷史回放」建立固定樣本集。
          </p>
        )}
      </div>

      <div className="customer-service-import-days">
        <header>
          <strong>診斷與修復</strong>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!activeRunId}
            onClick={() => setResultsOpen(true)}
          >
            <ListChecks />
            開啟側邊欄（{samples.length} 個案 · {proposals.length} 提案）
          </Button>
        </header>
        {proposalMessage ? (
          <p className="customer-service-import-progress" role="status">
            {proposalMessage}
          </p>
        ) : null}
      </div>

      <Modal
        open={progressOpen}
        title="歷史回放進度"
        description={`階段：${phase}`}
        onClose={() => setProgressOpen(false)}
        closeLabel="關閉進度視窗"
        size="lg"
      >
        <div className="customer-service-replay-progress" role="status" aria-live="polite">
          <p className="customer-service-import-progress">
            計劃 {counts.planned} · 已回放 {counts.processed} · 餘下 {counts.remaining} · 已評分 {counts.judged}
          </p>
          <div className="customer-service-replay-progress-track" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
        {log.length ? (
          <ul className="customer-service-replay-log" aria-label="回放活動記錄">
            {[...log].reverse().map((line, index) => (
              <li key={`${log.length}-${index}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="customer-service-import-progress">等待處理…</p>
        )}
      </Modal>

      <Sheet open={resultsOpen} onOpenChange={setResultsOpen}>
        <SheetContent className="side-panel-xl customer-service-replay-sheet">
          <SheetHeader>
            <SheetTitle>歷史回放診斷</SheetTitle>
            <SheetDescription>
              逐題顯示歷史問題與現行回答；自動修復記錄說明證據、驗證結果和生效狀態。
            </SheetDescription>
          </SheetHeader>
          <div className="customer-service-replay-sheet-body">
            <div className="customer-service-replay-sheet-tabs">
              <SegmentedTabs<"diagnosis" | "proposals">
                label="回放檢視"
                value={sheetTab}
                onChange={setSheetTab}
                tabs={[
                  { value: "diagnosis", label: `診斷結果（${samples.length}）` },
                  { value: "proposals", label: `修復提案（${proposals.length}）` },
                ]}
              />
              {sheetTab === "diagnosis" ? (
                <div className="customer-service-replay-case-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit || jevBusy || !activeRunId || !jevEnabled}
                    onClick={() => void runJev()}
                    title={jevEnabled ? undefined : "管理員未設定 CUSTOMER_SERVICE_HISTORY_JEV_ENABLED 或 TYPESAFE_API_KEY"}
                  >
                    {jevBusy ? "Jev 執行中…" : "執行 Jev 第二評判"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canEdit || proposalBusy || !activeRunId}
                    onClick={() => void runAutoRepair()}
                  >
                    {proposalBusy ? "判定中…" : "繼續自動診斷"}
                  </Button>
                </div>
              ) : null}
            </div>
            {jevMessage ? (
              <p className="customer-service-import-progress" role="status">
                {jevMessage}
              </p>
            ) : null}
            {!jevEnabled ? (
              <p className="customer-service-import-progress">
                Jev 第二評判未啟用；現有診斷與修復記錄不受影響。
              </p>
            ) : null}
            {proposalMessage ? (
              <p className="customer-service-import-progress" role="status">
                {proposalMessage}
              </p>
            ) : null}
            {sheetTab === "diagnosis" ? (
            <div className="customer-service-replay-results">
              <header>
                <strong>診斷結果</strong>
                <div className="customer-service-replay-filters">
                  {REPLAY_FILTERS.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant={sampleFilter === filter.value ? "default" : "outline"}
                      onClick={() => setSampleFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </header>
              {samplesBusy ? (
                <p className="customer-service-import-progress">載入診斷結果…</p>
              ) : samplesError ? (
                <p className="customer-service-import-progress" role="alert">
                  {samplesError}
                </p>
              ) : conversationGroups.length ? (
                conversationGroups.map((group, groupIndex) => {
                  const expanded = expandedConversations[group.key] === true;
                  return (
                  <section key={group.key} className="customer-service-replay-conversation">
                    <button
                      type="button"
                      className="customer-service-replay-conversation-head"
                      aria-expanded={expanded}
                      onClick={() => setExpandedConversations((current) => ({ ...current, [group.key]: !expanded }))}
                    >
                      {expanded ? <ChevronDown /> : <ChevronRight />}
                      <strong>{group.conversationId ? `對話 ${groupIndex + 1}` : "獨立決策點"}</strong>
                      <span>{group.samples.length} 個決策點</span>
                      <span>{replayTimeRange(group.samples)}</span>
                    </button>
                    {expanded ? (
                    <ol className="customer-service-replay-thread-group">
                      {buildReplayThread(group.samples).map((entry) =>
                        entry.kind === "context" ? (
                          <li key={entry.key} className="cs-thread-turn">
                            <span className={`cs-thread-role cs-thread-role-${entry.role}`}>
                              {replayRoleLabel(entry.role)}
                            </span>
                            <span className="cs-thread-text">{entry.text}</span>
                          </li>
                        ) : (
                          <li key={entry.key} className="cs-thread-decision">
                            <article className="customer-service-replay-case">
                              <header className="customer-service-replay-case-head">
                                <span className={`cs-compare cs-compare-${entry.sample.comparison ?? "none"}`}>
                                  {entry.sample.comparison
                                    ? JUDGE_COMPARISON_LABELS[entry.sample.comparison] ?? entry.sample.comparison
                                    : "未判定"}
                                </span>
                                <span>{replayTimeLabel(entry.sample.scenarioAt)}</span>
                                {entry.sample.aiGrounding ? <span>依據：{entry.sample.aiGrounding}</span> : null}
                                {entry.sample.requiresHumanReview ? <span>需人手覆核</span> : null}
                              </header>
                              <ol className="customer-service-replay-thread">
                                <li className="cs-thread-turn cs-thread-current">
                                  <span className="cs-thread-role cs-thread-role-customer">客·本次</span>
                                  <span className="cs-thread-text">{entry.sample.question || "（空）"}</span>
                                </li>
                                <li className="cs-thread-turn cs-thread-current">
                                  <span className="cs-thread-role cs-thread-role-assistant">AI</span>
                                  <span className="cs-thread-text">{entry.sample.aiAnswer || "（冇答）"}</span>
                                </li>
                                <li className="cs-thread-turn cs-thread-current">
                                  <span className="cs-thread-role cs-thread-role-human">真人參考</span>
                                  <span className="cs-thread-text">{entry.sample.referenceAnswer || "（冇）"}</span>
                                </li>
                              </ol>
                              <HistoryJevBlock sample={entry.sample} />
                              {entry.sample.issues.length ? (
                                <div className="customer-service-replay-diagnosis">
                                  <strong>要改什麼（判官建議）：</strong>
                                  <HistoryIssueFixes issues={entry.sample.issues} />
                                </div>
                              ) : null}
                            </article>
                          </li>
                        ),
                      )}
                    </ol>
                    ) : null}
                  </section>
                  );
                })
              ) : (
                <p className="customer-service-import-progress">
                  {samples.length ? "此篩選沒有個案。" : "尚無判定結果。按「一鍵跑完」後再回來看。"}
                </p>
              )}
            </div>
            ) : proposals.length ? (
              <div className="customer-service-replay-results">
                <header>
                  <strong>自動修復記錄</strong>
                </header>
                {proposals.map((proposal) => (
                  <article key={proposal.id} className="customer-service-replay-case">
                    <header className="customer-service-replay-case-head">
                      <span className="cs-compare cs-compare-none">
                        {proposal.riskLevel} · {proposal.status}
                      </span>
                      <span>{proposal.repairKind}</span>
                      <span>{proposal.createdAt.slice(0, 16).replace("T", " ")}</span>
                    </header>
                    <p>
                      <strong>來源樣本：</strong>
                      {proposal.sourceSampleIds.length} 個 · <strong>原因：</strong>
                      {proposal.reason}
                    </p>
                    {typeof proposal.candidatePatch.question === "string" ? (
                      <p>
                        <strong>問題：</strong>
                        {proposal.candidatePatch.question}
                      </p>
                    ) : null}
                    {typeof proposal.candidatePatch.guidance === "string" ? (
                      <p>
                        <strong>候選指引：</strong>
                        {proposal.candidatePatch.guidance}
                      </p>
                    ) : null}
                    {proposal.candidatePatch.case && typeof proposal.candidatePatch.case === "object" ? (
                      <p>
                        <strong>場景指引草稿：</strong>
                        {String((proposal.candidatePatch.case as Record<string, unknown>).title ?? "可重用場景")}
                      </p>
                    ) : null}
                    {proposal.validation ? (
                      <p>
                        <strong>隔離驗證：</strong>
                        {proposal.validation.passed === true ? "通過" : "未通過"} · 獨立樣本{" "}
                        {String(proposal.validation.holdout_count ?? 0)} · 對照{" "}
                        {String(proposal.validation.control_count ?? 0)}
                      </p>
                    ) : null}
                    {proposal.sourceSampleIds.length ? (
                      <div className="customer-service-replay-diagnosis">
                        <strong>要改什麼（來源樣本判官建議）：</strong>
                        <ul className="cs-issue-samples">
                          {proposal.sourceSampleIds.map((sampleId) => {
                            const sample = samples.find((item) => item.id === sampleId);
                            if (!sample) {
                              return (
                                <li key={sampleId}>
                                  樣本 {sampleId.slice(0, 8)}…（判定未載入，請先跑完回放）
                                </li>
                              );
                            }
                            return (
                              <li key={sampleId}>
                                <span className="cs-issue-sample-question">
                                  {sample.question || "（空）"}
                                </span>
                                {sample.issues.length ? (
                                  <HistoryIssueFixes issues={sample.issues} />
                                ) : (
                                  <span className="cs-issue-fix">
                                    此樣本沒有判官建議（判定可能未完成）。
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    {canEdit ? (
                      <div className="customer-service-replay-case-actions">
                        {["active", "canary", "applied"].includes(proposal.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={Boolean(reviewBusy)}
                            onClick={() => void rollbackProposal(proposal.id)}
                          >
                            緊急撤回
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="customer-service-import-progress">
                尚無自動修復記錄。完成回放後系統會診斷可處理的問題。
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
