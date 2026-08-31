import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createReportAiFallback,
  reportAiSnapshotFingerprint,
  requestReportAiInterpretation,
  submitReportAiFeedback,
  type ReportAiFinding,
  type ReportAiInterpretation,
  type ReportAiSnapshot,
  type ReportAiStreamEvent,
} from "@/lib/report-ai";
import { cn } from "@/lib/utils";

type ReportAiContextValue = {
  publishSnapshot: (sourceKey: string, snapshot: ReportAiSnapshot | null) => void;
  openPanel: () => void;
  status: "idle" | "loading" | "error" | "stale" | "ready";
  hasSnapshot: boolean;
};

const ReportAiContext = createContext<ReportAiContextValue | null>(null);

type ReportAiWorkspaceProps = {
  reportKey: string;
  permissionKey: string;
  reportTitle: string;
  children: ReactNode;
};

function cacheStorageKey(reportKey: string, locale: string, fingerprint: string) {
  return `report-ai:v2:${reportKey}:${locale}:${fingerprint}`;
}

function readCachedInterpretation(key: string) {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as ReportAiInterpretation;
    return cached.status === "fallback" ? null : cached;
  } catch {
    return null;
  }
}

function Finding({ finding }: { finding: ReportAiFinding }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="report-ai-finding">
      <p>{finding.text}</p>
      {finding.evidence.length ? (
        <button
          type="button"
          className="report-ai-evidence-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
          {t("reports.ai.viewEvidence")}
        </button>
      ) : null}
      {expanded ? (
        <dl className="report-ai-evidence">
          {finding.evidence.map((evidence, index) => (
            <div key={`${evidence.source}-${index}`}>
              <dt>{evidence.label}</dt>
              <dd>
                {String(evidence.value ?? "—")}
                {evidence.unit ? ` ${evidence.unit}` : ""}
              </dd>
              <small>{evidence.source}</small>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

export function useReportAiSnapshot(
  snapshot: ReportAiSnapshot | null,
  sourceKey = "default",
) {
  const context = useContext(ReportAiContext);
  const publishSnapshot = context?.publishSnapshot;
  useEffect(() => {
    if (!publishSnapshot) return;
    publishSnapshot(sourceKey, snapshot);
    return () => publishSnapshot(sourceKey, null);
  }, [publishSnapshot, snapshot, sourceKey]);
}

export function ReportAiSnapshotPublisher({
  snapshot,
  sourceKey,
}: {
  snapshot: ReportAiSnapshot | null;
  sourceKey?: string;
}) {
  useReportAiSnapshot(snapshot, sourceKey);
  return null;
}

export function ReportAiTrigger() {
  const context = useContext(ReportAiContext);
  const { t } = useTranslation();

  if (!context) return null;

  return (
    <div className="report-ai-action-row">
      <Button
        type="button"
        className={cn("report-ai-trigger", `is-${context.status}`)}
        aria-label={t("reports.ai.open")}
        aria-haspopup="dialog"
        aria-busy={context.status === "loading"}
        disabled={!context.hasSnapshot}
        onClick={context.openPanel}
      >
        {context.status === "loading" ? (
          <LoaderCircle className="report-ai-spin" />
        ) : (
          <Sparkles />
        )}
        <span>{t("reports.ai.title")}</span>
      </Button>
    </div>
  );
}

export function ReportAiWorkspace({
  reportKey,
  permissionKey,
  reportTitle,
  children,
}: ReportAiWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const [snapshotSources, setSnapshotSources] = useState<
    Record<string, ReportAiSnapshot>
  >({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<
    Extract<ReportAiStreamEvent, { type: "status" }>["stage"]
  >("preparing");
  const [streamDrafts, setStreamDrafts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [interpretation, setInterpretation] =
    useState<ReportAiInterpretation | null>(null);
  const [resultFingerprint, setResultFingerprint] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"helpful" | "unhelpful" | null>(null);
  const [feedbackReason, setFeedbackReason] = useState<
    "numbers" | "missing" | "unclear" | "other" | ""
  >("");
  const snapshot = useMemo(() => {
    const entries = Object.entries(snapshotSources);
    if (!entries.length) return null;
    const partial = entries.some(([, item]) => item.completeness.status !== "complete");
    return {
      filters: Object.fromEntries(
        entries.flatMap(([source, item]) =>
          Object.entries(item.filters).map(([key, value]) => [
            source === "default" ? key : `${source}.${key}`,
            value,
          ]),
        ),
      ),
      currentAggregates: entries.flatMap(([source, item]) =>
        item.currentAggregates.map((row) => ({ source, ...row })),
      ),
      comparisonAggregates: entries.flatMap(([source, item]) =>
        (item.comparisonAggregates ?? []).map((row) => ({ source, ...row })),
      ),
      detailRows: entries.flatMap(([source, item]) =>
        (item.detailRows ?? []).map((row) => ({ source, ...row })),
      ),
      completeness: {
        status: partial ? "partial" as const : "complete" as const,
        notes: entries.flatMap(([, item]) => item.completeness.notes ?? []),
      },
    } satisfies ReportAiSnapshot;
  }, [snapshotSources]);
  const fingerprint = useMemo(
    () => (snapshot ? reportAiSnapshotFingerprint(snapshot) : null),
    [snapshot],
  );
  const stale = Boolean(
    interpretation && resultFingerprint && fingerprint !== resultFingerprint,
  );
  const publishSnapshot = useCallback(
    (sourceKey: string, nextSnapshot: ReportAiSnapshot | null) => {
      setSnapshotSources((current) => {
        if (!nextSnapshot) {
          if (!(sourceKey in current)) return current;
          const next = { ...current };
          delete next[sourceKey];
          return next;
        }
        if (current[sourceKey] === nextSnapshot) return current;
        return { ...current, [sourceKey]: nextSnapshot };
      });
    },
    [],
  );
  useEffect(() => {
    setInterpretation(null);
    setResultFingerprint(null);
    setFeedback(null);
    setFeedbackReason("");
    setError(null);
    setStreamDrafts([]);
  }, [reportKey]);

  useEffect(() => {
    if (!fingerprint) return;
    const key = cacheStorageKey(reportKey, i18n.language, fingerprint);
    const cached = readCachedInterpretation(key);
    if (!cached) return;
    setInterpretation(cached);
    setResultFingerprint(fingerprint);
  }, [fingerprint, i18n.language, reportKey]);

  const generate = useCallback(async () => {
    if (!snapshot || !fingerprint || loading) return;
    setLoading(true);
    setError(null);
    setFeedback(null);
    setFeedbackReason("");
    setProgressStage("preparing");
    setStreamDrafts([]);
    try {
      const result = await requestReportAiInterpretation({
        reportKey,
        permissionKey,
        reportTitle,
        locale: i18n.language,
        snapshot,
      }, (event) => {
        if (event.type === "status") {
          setProgressStage(event.stage);
          return;
        }
        setStreamDrafts((current) =>
          current.includes(event.text) ? current : [...current, event.text].slice(-6),
        );
      });
      setInterpretation(result);
      setResultFingerprint(fingerprint);
      if (result.status !== "fallback") {
        window.sessionStorage.setItem(
          cacheStorageKey(reportKey, i18n.language, fingerprint),
          JSON.stringify(result),
        );
      }
    } catch (requestError) {
      setInterpretation(
        createReportAiFallback(snapshot, new Date().toISOString(), i18n.language),
      );
      setResultFingerprint(fingerprint);
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("reports.ai.failed"),
      );
    } finally {
      setLoading(false);
    }
  }, [
    fingerprint,
    i18n.language,
    loading,
    permissionKey,
    reportKey,
    reportTitle,
    snapshot,
    t,
  ]);

  const status: ReportAiContextValue["status"] = loading
    ? "loading"
    : error
      ? "error"
      : stale
        ? "stale"
        : interpretation
          ? "ready"
          : "idle";
  const openPanel = useCallback(() => {
    setOpen(true);
    if (!interpretation || interpretation.status === "fallback" || stale || error) void generate();
  }, [error, generate, interpretation, stale]);
  const contextValue = useMemo(
    () => ({
      publishSnapshot,
      openPanel,
      status,
      hasSnapshot: Boolean(snapshot),
    }),
    [openPanel, publishSnapshot, snapshot, status],
  );

  return (
    <ReportAiContext.Provider value={contextValue}>
      {children}

      <SidePanel
        open={open}
        wide
        className="report-ai-panel"
        title={t("reports.ai.title")}
        description={reportTitle}
        closeLabel={t("reports.ai.close")}
        onClose={() => setOpen(false)}
        footer={
          interpretation ? (
            <div className="report-ai-feedback">
              <span>{t("reports.ai.helpfulQuestion")}</span>
              <Button
                type="button"
                size="sm"
                variant={feedback === "helpful" ? "default" : "outline"}
                onClick={() => {
                  setFeedback("helpful");
                  setFeedbackReason("");
                  if (interpretation.cacheKey) {
                    void submitReportAiFeedback({
                      reportKey,
                      permissionKey,
                      cacheKey: interpretation.cacheKey,
                      rating: "helpful",
                    });
                  }
                }}
              >
                <ThumbsUp /> {t("reports.ai.helpful")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={feedback === "unhelpful" ? "default" : "outline"}
                onClick={() => setFeedback("unhelpful")}
              >
                <ThumbsDown /> {t("reports.ai.unhelpful")}
              </Button>
              {feedback === "unhelpful" ? (
                <select
                  aria-label={t("reports.ai.feedbackReason")}
                  value={feedbackReason}
                  onChange={(event) => {
                    const reason = event.target.value as typeof feedbackReason;
                    setFeedbackReason(reason);
                    if (reason && interpretation.cacheKey) {
                      void submitReportAiFeedback({
                        reportKey,
                        permissionKey,
                        cacheKey: interpretation.cacheKey,
                        rating: "unhelpful",
                        reason,
                      });
                    }
                  }}
                >
                  <option value="">{t("reports.ai.feedbackReason")}</option>
                  <option value="numbers">{t("reports.ai.feedbackReasons.numbers")}</option>
                  <option value="missing">{t("reports.ai.feedbackReasons.missing")}</option>
                  <option value="unclear">{t("reports.ai.feedbackReasons.unclear")}</option>
                  <option value="other">{t("reports.ai.feedbackReasons.other")}</option>
                </select>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {!snapshot ? (
          <div className="report-ai-empty">
            <Bot />
            <p>{t("reports.ai.waitingForData")}</p>
          </div>
        ) : (
          <div className="report-ai-content">
            {loading ? (
              <div className="report-ai-streaming" aria-live="polite">
                <div className="report-ai-streaming-status">
                  <LoaderCircle className="report-ai-spin" />
                  <strong>{t(`reports.ai.progress.${progressStage}`)}</strong>
                </div>
                {streamDrafts.length ? (
                  <div className="report-ai-stream-drafts">
                    <span>{t("reports.ai.liveDraft")}</span>
                    {streamDrafts.map((draft) => <p key={draft}>{draft}</p>)}
                  </div>
                ) : (
                  <p>{t("reports.ai.firstResponseHint")}</p>
                )}
              </div>
            ) : null}
            {stale ? (
              <div className="report-ai-notice is-stale">
                <AlertTriangle />
                <span>{t("reports.ai.stale")}</span>
              </div>
            ) : null}
            {error ? (
              <div className="report-ai-notice is-error">
                <AlertTriangle />
                <span>{t("reports.ai.fallbackNotice")}</span>
              </div>
            ) : null}
            {!interpretation && !loading ? (
              <div className="report-ai-empty">
                <Sparkles />
                <h3>{t("reports.ai.readyTitle")}</h3>
                <p>{t("reports.ai.readyDescription")}</p>
                <Button type="button" disabled={loading} onClick={generate}>
                  {loading ? <LoaderCircle className="report-ai-spin" /> : <Sparkles />}
                  {loading ? t("reports.ai.generating") : t("reports.ai.generate")}
                </Button>
              </div>
            ) : interpretation ? (
              <>
                <header className="report-ai-headline">
                  <span>{t("reports.ai.conclusion")}</span>
                  <h3>{interpretation.headline}</h3>
                  <small>
                    {interpretation.status === "partial"
                      ? t("reports.ai.partial")
                      : interpretation.status === "fallback"
                        ? t("reports.ai.fallback")
                        : t("reports.ai.generatedAt", {
                            value: new Intl.DateTimeFormat(i18n.language, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Asia/Hong_Kong",
                            }).format(new Date(interpretation.generatedAt)),
                          })}
                  </small>
                </header>
                <section className="report-ai-section">
                  <h4>{t("reports.ai.trends")}</h4>
                  {interpretation.trends.length ? (
                    interpretation.trends.map((finding, index) => (
                      <Finding key={`trend-${index}`} finding={finding} />
                    ))
                  ) : (
                    <p>{t("reports.ai.noFindings")}</p>
                  )}
                </section>
                <section className="report-ai-section">
                  <h4>{t("reports.ai.anomalies")}</h4>
                  {interpretation.anomalies.length ? (
                    interpretation.anomalies.map((finding, index) => (
                      <Finding key={`anomaly-${index}`} finding={finding} />
                    ))
                  ) : (
                    <p>{t("reports.ai.noAnomalies")}</p>
                  )}
                </section>
                <section className="report-ai-section">
                  <h4>{t("reports.ai.limitations")}</h4>
                  <ul>
                    {interpretation.limitations.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
                <div className="report-ai-coverage">
                  {t("reports.ai.coverage", interpretation.coverage)}
                </div>
                <Button type="button" variant="outline" disabled={loading} onClick={generate}>
                  <RefreshCw className={cn(loading && "report-ai-spin")} />
                  {stale ? t("reports.ai.regenerateCurrent") : t("reports.ai.regenerate")}
                </Button>
              </>
            ) : null}
          </div>
        )}
      </SidePanel>
    </ReportAiContext.Provider>
  );
}
