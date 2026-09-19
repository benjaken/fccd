import { useCallback, useEffect, useRef, useState } from "react";
import { ListChecks, Sparkles, Square, Zap } from "lucide-react";

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
  fetchCustomerServiceHistoryReplayRuns,
  fetchCustomerServiceHistoryReplaySamples,
  fetchCustomerServiceRepairProposals,
  judgeCustomerServiceHistoryReplay,
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

type ReplaySampleFilter = "all" | "divergent" | "partial" | "match" | "inconclusive" | "none";
const REPLAY_FILTERS: Array<{ value: ReplaySampleFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "divergent", label: "有差異" },
  { value: "partial", label: "部分" },
  { value: "match", label: "一致" },
  { value: "inconclusive", label: "未能判定" },
  { value: "none", label: "未判定" },
];

function hongKongDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * 歷史回放評估面板。只讀歷史對話、產生診斷與提案；不發送 WhatsApp、不執行訂單操作。
 */
export function CustomerServiceHistoryReplayPanel({ canEdit = false }: { canEdit?: boolean }) {
  const [runs, setRuns] = useState<CustomerServiceHistoryReplayRun[]>([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [busy, setBusy] = useState<"" | "loading" | "start" | "all">("loading");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [sampleSize, setSampleSize] = useState(50);
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
    void loadSamples();
  }, [loadSamples]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const filteredSamples = samples.filter((sample) =>
    sampleFilter === "all"
      ? true
      : sampleFilter === "none"
        ? !sample.comparison
        : sample.comparison === sampleFilter,
  );

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
      const result = await startCustomerServiceHistoryReplay({
        sampleSize,
        sourceSince: sourceSince ? `${sourceSince}T00:00:00+08:00` : undefined,
        sourceUntil: sourceUntil ? `${sourceUntil}T23:59:59+08:00` : undefined,
      });
      if (result?.error) throw new Error(result.error);
      setProgress(`已建立回放（${result?.planned ?? 0} 個樣本）。`);
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
                <Button
                  type="button"
                  size="sm"
                  disabled={!canEdit || proposalBusy || !activeRunId}
                  onClick={() => void runAutoRepair()}
                >
                  {proposalBusy ? "判定中…" : "繼續自動診斷"}
                </Button>
              ) : null}
            </div>
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
              ) : filteredSamples.length ? (
                filteredSamples.map((sample) => (
                  <article key={sample.id} className="customer-service-replay-case">
                    <header className="customer-service-replay-case-head">
                      <span className={`cs-compare cs-compare-${sample.comparison ?? "none"}`}>
                        {sample.comparison
                          ? JUDGE_COMPARISON_LABELS[sample.comparison] ?? sample.comparison
                          : "未判定"}
                      </span>
                      <span>{sample.scenarioAt.slice(0, 16).replace("T", " ")}</span>
                      {sample.aiGrounding ? <span>依據：{sample.aiGrounding}</span> : null}
                      {sample.requiresHumanReview ? <span>需人手覆核</span> : null}
                    </header>
                    <p>
                      <strong>客戶：</strong>
                      {sample.question || "（空）"}
                    </p>
                    <p>
                      <strong>AI：</strong>
                      {sample.aiAnswer || "（冇答）"}
                    </p>
                    <p>
                      <strong>真人：</strong>
                      {sample.referenceAnswer || "（冇）"}
                    </p>
                    {sample.context.length ? (
                      <details>
                        <summary>上文（{sample.context.length} 則）</summary>
                        <ul>
                          {sample.context.map((turn, index) => (
                            <li key={`${sample.id}-${index}`}>
                              {turn.role === "customer" ? "客" : turn.role === "human" ? "真人" : "AI"}：{turn.text}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </article>
                ))
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
