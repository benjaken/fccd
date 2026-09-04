import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Bot, Check, CheckCheck, ChevronLeft, ChevronRight, MessageCircleMore, Pencil, Plus, RefreshCw, RotateCcw, Send, Smile, Sparkles, X } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  CUSTOMER_FAQ_CATEGORIES,
  CUSTOMER_FAQS_PAGE_SIZE,
  activateCustomerServiceConfig,
  createCustomerServiceConfig,
  createCustomerFaq,
  evaluateCustomerServiceConfig,
  fetchCustomerServiceConfigVersions,
  fetchCustomerServiceDailyReports,
  fetchCustomerServiceEvaluationRuns,
  fetchCustomerServiceLearningSuggestions,
  fetchCustomerServiceReviewTurns,
  fetchCustomerFaqs,
  fetchCustomerServiceControls,
  generateCustomerServiceDailyReport,
  previewCustomerServiceTurn,
  reviewCustomerServiceLearningSuggestion,
  setCustomerServiceBotEnabled,
  submitCustomerServiceTurnFeedback,
  updateCustomerFaq,
  type CustomerFaq,
  type CustomerFaqWriteInput,
  type CustomerServicePreviewConversation,
  type CustomerServicePreviewResult,
  type CustomerServiceControls,
  type CustomerServiceDailyReport,
  type CustomerServiceLearningSuggestion,
  type CustomerServiceReviewTurn,
  type CustomerServiceConfigVersion,
  type CustomerServiceEvaluationRun,
} from "@/lib/customer-faq";

const SKELETON_COLUMNS = [
  { width: "7rem" },
  { width: "52%" },
  { width: "5rem" },
  { width: "4.5rem", variant: "action" as const },
];

const EMPTY_DRAFT: CustomerFaqWriteInput = {
  category: "ordering",
  question: "",
  answer: "",
  keywords: "",
  isPublished: false,
  sortOrder: 0,
};

function previousHongKongDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 - 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

type PreviewMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  usedModel?: boolean;
  humanHandoff?: boolean;
  simulatedWrite?: boolean;
  simulatedNotify?: boolean;
};

export function CustomerFaqPage({
  loadFaqs = fetchCustomerFaqs,
  createFaq = createCustomerFaq,
  updateFaq = updateCustomerFaq,
  loadControls = fetchCustomerServiceControls,
  setBotEnabled = setCustomerServiceBotEnabled,
  previewTurn = previewCustomerServiceTurn,
}: {
  loadFaqs?: typeof fetchCustomerFaqs;
  createFaq?: typeof createCustomerFaq;
  updateFaq?: typeof updateCustomerFaq;
  loadControls?: typeof fetchCustomerServiceControls;
  setBotEnabled?: typeof setCustomerServiceBotEnabled;
  previewTurn?: (input: {
    text: string;
    phone?: string;
    conversation?: CustomerServicePreviewConversation | null;
  }) => Promise<CustomerServicePreviewResult>;
}) {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.customer_faq.edit");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CustomerFaq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<CustomerFaq | null | undefined>(undefined);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [controls, setControls] = useState<CustomerServiceControls | null>(null);
  const [controlsError, setControlsError] = useState("");
  const [savingControls, setSavingControls] = useState(false);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewPhone, setPreviewPhone] = useState("");
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewConversation, setPreviewConversation] = useState<CustomerServicePreviewConversation | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [reports, setReports] = useState<CustomerServiceDailyReport[]>([]);
  const [suggestions, setSuggestions] = useState<CustomerServiceLearningSuggestion[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [reportDate, setReportDate] = useState(previousHongKongDate);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reviewingSuggestion, setReviewingSuggestion] = useState("");
  const [reviewTurns, setReviewTurns] = useState<CustomerServiceReviewTurn[]>([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [reviewingTurn, setReviewingTurn] = useState("");
  const [configVersions, setConfigVersions] = useState<CustomerServiceConfigVersion[]>([]);
  const [evaluationRuns, setEvaluationRuns] = useState<CustomerServiceEvaluationRun[]>([]);
  const [configBusy, setConfigBusy] = useState("");
  const [configDraft, setConfigDraft] = useState({
    label: "Develop candidate",
    model: "grok-4.3",
    systemPrompt: "",
    temperature: 0.1,
    retrievalLimit: 3,
  });
  const previewChatRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_FAQS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * CUSTOMER_FAQS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * CUSTOMER_FAQS_PAGE_SIZE, total);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadFaqs({ page, search, category });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError(t("settings.customerFaq.loadError"));
    } finally {
      setLoading(false);
    }
  }, [category, loadFaqs, page, reloadKey, search, t]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    let cancelled = false;
    void loadControls()
      .then((next) => {
        if (!cancelled) {
          setControls(next);
          setPreviewPhone((current) => current || next.allowedPhones?.[0] || "");
          setControlsError("");
        }
      })
      .catch(() => {
        if (!cancelled) setControlsError(t("settings.customerFaq.botLoadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [loadControls, t]);

  useEffect(() => {
    const chat = previewChatRef.current;
    if (!chat || (!previewMessages.length && !previewing)) return;
    const frame = window.requestAnimationFrame(() => {
      if (typeof chat.scrollTo === "function") {
        chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
      } else {
        chat.scrollTop = chat.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewMessages, previewing]);

  const openEditor = (faq: CustomerFaq | null) => {
    setEditor(faq);
    setDraft(
      faq
        ? {
            category: faq.category,
            question: faq.question,
            answer: faq.answer,
            keywords: faq.keywords,
            isPublished: faq.isPublished,
            sortOrder: faq.sortOrder,
          }
        : EMPTY_DRAFT,
    );
    setSaveError("");
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(undefined);
    setSaveError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.question.trim() || !draft.answer.trim()) {
      setSaveError(t("settings.customerFaq.validation"));
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      if (editor) await updateFaq(editor.id, draft);
      else await createFaq(draft);
      setEditor(undefined);
      setReloadKey((value) => value + 1);
    } catch {
      setSaveError(t("settings.customerFaq.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const saveControls = async ({
    enabled = controls?.botEnabled ?? false,
    start = controls?.autoReplyStart ?? "19:00",
    end = controls?.autoReplyEnd ?? "09:00",
  }: {
    enabled?: boolean;
    start?: string;
    end?: string;
  }) => {
    if (!canEdit || savingControls) return;
    setSavingControls(true);
    setControlsError("");
    try {
      setControls(await setBotEnabled(enabled, start, end));
    } catch {
      setControlsError(t("settings.customerFaq.botSaveError"));
    } finally {
      setSavingControls(false);
    }
  };

  const runPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = previewQuery.trim();
    if (!text || previewing) return;
    const messageId = Date.now();
    setPreviewMessages((current) => [...current, { id: messageId, role: "user", text }]);
    setPreviewQuery("");
    setPreviewing(true);
    setPreviewError("");
    try {
      const result = await previewTurn({
        text,
        phone: previewPhone,
        conversation: previewConversation,
      });
      setPreviewConversation(result.conversation);
      setPreviewMessages((current) => [
        ...current,
        {
          id: messageId + 1,
          role: result.reply ? "assistant" : "system",
          text: result.reply || t("settings.customerFaq.previewSilent"),
          usedModel: result.usedModel,
          humanHandoff: result.humanHandoff,
          simulatedWrite: result.simulatedWrite,
          simulatedNotify: result.simulatedNotify,
        },
      ]);
    } catch {
      setPreviewError(t("settings.customerFaq.previewError"));
    } finally {
      setPreviewing(false);
    }
  };

  const resetPreview = () => {
    setPreviewMessages([]);
    setPreviewConversation(null);
    setPreviewError("");
    setPreviewQuery("");
  };

  const loadInsights = async () => {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const [nextReports, nextSuggestions, nextReviewTurns, nextConfigs, nextRuns] = await Promise.all([
        fetchCustomerServiceDailyReports(),
        fetchCustomerServiceLearningSuggestions(),
        fetchCustomerServiceReviewTurns(),
        fetchCustomerServiceConfigVersions("develop"),
        fetchCustomerServiceEvaluationRuns(),
      ]);
      setReports(nextReports);
      setSuggestions(nextSuggestions);
      setReviewTurns(nextReviewTurns);
      setConfigVersions(nextConfigs);
      setEvaluationRuns(nextRuns);
    } catch {
      setInsightsError(t("settings.customerFaq.insightsLoadError"));
    } finally {
      setInsightsLoading(false);
    }
  };

  const openInsights = () => {
    setInsightsOpen(true);
    void loadInsights();
  };

  const generateReport = async () => {
    if (!reportDate || generatingReport) return;
    setGeneratingReport(true);
    setInsightsError("");
    try {
      await generateCustomerServiceDailyReport(reportDate);
      await loadInsights();
    } catch {
      setInsightsError(t("settings.customerFaq.reportGenerateError"));
    } finally {
      setGeneratingReport(false);
    }
  };

  const reviewSuggestion = async (id: string, status: "approved" | "rejected") => {
    if (!canEdit || reviewingSuggestion) return;
    setReviewingSuggestion(id);
    setInsightsError("");
    try {
      const result = await reviewCustomerServiceLearningSuggestion(id, status);
      setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));
      if (result?.target_faq_id) setReloadKey((value) => value + 1);
    } catch {
      setInsightsError(t("settings.customerFaq.suggestionReviewError"));
    } finally {
      setReviewingSuggestion("");
    }
  };

  const reviewTurn = async (turn: CustomerServiceReviewTurn, verdict: "correct" | "incorrect" | "needs_review") => {
    if (!canEdit || reviewingTurn) return;
    const correctedAnswer = feedbackDrafts[turn.id]?.trim() || "";
    if (verdict === "incorrect" && !correctedAnswer) {
      setInsightsError("標記錯誤前，請先填寫正確回覆。");
      return;
    }
    setReviewingTurn(turn.id);
    setInsightsError("");
    try {
      await submitCustomerServiceTurnFeedback({
        turnId: turn.id,
        verdict,
        correctedAnswer,
        createFaqDraft: verdict === "incorrect" && Boolean(correctedAnswer),
      });
      setReviewTurns((current) => current.filter((item) => item.id !== turn.id));
      if (verdict === "incorrect") setReloadKey((value) => value + 1);
    } catch {
      setInsightsError("儲存人工覆核結果失敗。");
    } finally {
      setReviewingTurn("");
    }
  };

  const createConfig = async () => {
    if (!canEdit || configBusy || !configDraft.model.trim()) return;
    setConfigBusy("create");
    setInsightsError("");
    try {
      await createCustomerServiceConfig({ environment: "develop", ...configDraft });
      setConfigVersions(await fetchCustomerServiceConfigVersions("develop"));
    } catch {
      setInsightsError("建立模型配置失敗。");
    } finally {
      setConfigBusy("");
    }
  };

  const evaluateConfig = async (id: string) => {
    if (!canEdit || configBusy) return;
    setConfigBusy(id);
    setInsightsError("");
    try {
      await evaluateCustomerServiceConfig(id);
      setEvaluationRuns(await fetchCustomerServiceEvaluationRuns());
    } catch {
      setInsightsError("模型評測失敗；請先完成至少一條人工覆核資料。");
      setEvaluationRuns(await fetchCustomerServiceEvaluationRuns().catch(() => []));
    } finally {
      setConfigBusy("");
    }
  };

  const activateConfig = async (id: string) => {
    if (!canEdit || configBusy) return;
    setConfigBusy(id);
    setInsightsError("");
    try {
      await activateCustomerServiceConfig(id);
      setConfigVersions(await fetchCustomerServiceConfigVersions("develop"));
    } catch {
      setInsightsError("發布模型配置失敗。");
    } finally {
      setConfigBusy("");
    }
  };

  const latestReport = reports[0];
  const formatRate = (value: number | null | undefined) =>
    typeof value === "number" ? `${Math.round(value * 100)}%` : "—";

  return (
    <section className="orders-page settings-list-page customer-faq-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.customerFaq.title")}</h1>
          <p>{t("settings.customerFaq.description")}</p>
        </div>
      </header>
      <div className="customer-faq-auto-reply-controls">
        <label className="customer-faq-auto-reply-switch">
          <span>{t("settings.customerFaq.botEnabled")}</span>
          <Switch
            checked={Boolean(controls?.botEnabled)}
            disabled={!canEdit || savingControls || !controls}
            aria-label={t("settings.customerFaq.botEnabled")}
            onCheckedChange={(checked) => void saveControls({ enabled: checked })}
          />
        </label>
        <div className="customer-faq-auto-reply-window">
          <span>{t("settings.customerFaq.autoReplyWindow")}</span>
          <label>
            <span className="sr-only">{t("settings.customerFaq.autoReplyStart")}</span>
            <input
              type="time"
              value={controls?.autoReplyStart ?? "19:00"}
              disabled={!canEdit || savingControls || !controls}
              aria-label={t("settings.customerFaq.autoReplyStart")}
              onChange={(event) => {
                const start = event.target.value;
                setControls((current) => current ? { ...current, autoReplyStart: start } : current);
              }}
              onBlur={(event) => void saveControls({ start: event.target.value })}
            />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="sr-only">{t("settings.customerFaq.autoReplyEnd")}</span>
            <input
              type="time"
              value={controls?.autoReplyEnd ?? "09:00"}
              disabled={!canEdit || savingControls || !controls}
              aria-label={t("settings.customerFaq.autoReplyEnd")}
              onChange={(event) => {
                const end = event.target.value;
                setControls((current) => current ? { ...current, autoReplyEnd: end } : current);
              }}
              onBlur={(event) => void saveControls({ end: event.target.value })}
            />
          </label>
          <small>
            {(controls?.autoReplyStart ?? "19:00") === (controls?.autoReplyEnd ?? "09:00")
              ? t("settings.customerFaq.autoReplyAllDay")
              : t("settings.customerFaq.autoReplyNextDay")}
          </small>
        </div>
        {controlsError ? (
          <p className="orders-state-error" role="alert">{controlsError}</p>
        ) : null}
        <Button type="button" variant="outline" className="customer-faq-insights-button" onClick={openInsights}>
          <BarChart3 />
          {t("settings.customerFaq.insightsAction")}
        </Button>
      </div>

      <div className="customer-faq-layout">
        <article className="panel orders-panel">
          <header className="orders-toolbar">
            <ListSearchBar
              id="customer-faq-search"
              value={draftSearch}
              onChange={setDraftSearch}
              onSubmit={() => {
                setPage(1);
                setSearch(draftSearch.trim());
              }}
              label={t("settings.customerFaq.search")}
              placeholder={t("settings.customerFaq.searchPlaceholder")}
              submitLabel={t("settings.customerFaq.searchAction")}
              filters={
                <label className="orders-status-filter">
                  <span>{t("settings.customerFaq.category")}</span>
                  <select
                    value={category}
                    onChange={(event) => {
                      setPage(1);
                      setCategory(event.target.value);
                    }}
                  >
                    <option value="">{t("settings.customerFaq.allCategories")}</option>
                    {CUSTOMER_FAQ_CATEGORIES.map((key) => (
                      <option key={key} value={key}>
                        {t(`settings.customerFaq.categories.${key}`)}
                      </option>
                    ))}
                  </select>
                </label>
              }
              filtersActive={Boolean(category)}
              actions={
                canEdit ? (
                  <Button onClick={() => openEditor(null)}>
                    <Plus />
                    {t("settings.customerFaq.add")}
                  </Button>
                ) : null
              }
            />
          </header>

          {error ? (
            <div className="orders-state orders-state-error" role="alert">
              <MessageCircleMore />
              <div>
                <strong>{error}</strong>
                <span>{t("settings.customerFaq.loadErrorDescription")}</span>
              </div>
              <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
                <RefreshCw />
                {t("settings.retry")}
              </Button>
            </div>
          ) : !loading && items.length === 0 ? (
            <div className="orders-state">
              <MessageCircleMore />
              <div>
                <strong>{t("settings.customerFaq.empty")}</strong>
                <span>{t("settings.customerFaq.emptyDescription")}</span>
              </div>
            </div>
          ) : (
            <ListTable
              className="orders-table-wrap"
              onRefresh={() => setReloadKey((value) => value + 1)}
              loading={loading}
              loadingLabel={t("settings.customerFaq.loading")}
              skeletonRows={CUSTOMER_FAQS_PAGE_SIZE}
              skeletonColumns={canEdit ? SKELETON_COLUMNS : SKELETON_COLUMNS.slice(0, -1)}
              header={
                <tr>
                  <th>{t("settings.customerFaq.columns.category")}</th>
                  <th>{t("settings.customerFaq.columns.question")}</th>
                  <th>{t("settings.customerFaq.columns.published")}</th>
                  {canEdit ? <th aria-label={t("settings.customerFaq.columns.actions")} /> : null}
                </tr>
              }
            >
              {items.map((faq) => (
                <tr key={faq.id}>
                  <td>{t(`settings.customerFaq.categories.${faq.category}`, { defaultValue: faq.category })}</td>
                  <td>
                    <strong>{faq.question}</strong>
                  </td>
                  <td>
                    <span className={`status-badge ${faq.isPublished ? "green" : "neutral"}`}>
                      {faq.isPublished
                        ? t("settings.customerFaq.published")
                        : t("settings.customerFaq.unpublished")}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="table-actions-cell">
                      <div className="table-row-actions">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={t("settings.customerFaq.edit")}
                          onClick={() => openEditor(faq)}
                        >
                          <Pencil />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </ListTable>
          )}

          <footer className="orders-pagination">
            <span>{t("settings.pagination", { from: visibleFrom, to: visibleTo, total })}</span>
            <div>
              <Button
                variant="outline"
                size="icon"
                disabled={loading || page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                aria-label={t("settings.previous")}
              >
                <ChevronLeft />
              </Button>
              <strong>
                {page} / {totalPages}
              </strong>
              <Button
                variant="outline"
                size="icon"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                aria-label={t("settings.next")}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </article>

        <article className="panel orders-panel customer-faq-preview">
          <header className="customer-faq-chat-header">
            <div className="customer-faq-chat-contact">
              <img src="/assets/fc-catering-logo.svg" alt="" width="42" height="42" />
              <div>
                <h2>Food Channels</h2>
                <p>{previewing ? t("settings.customerFaq.previewingShort") : t("settings.customerFaq.previewTitle")}</p>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="customer-faq-chat-reset"
              onClick={resetPreview}
              aria-label={t("settings.customerFaq.previewReset")}
              title={t("settings.customerFaq.previewReset")}
            >
              <RotateCcw />
            </Button>
          </header>
          <div className="customer-faq-preview-body">
            <div className="customer-faq-chat-shell">
              <div
                ref={previewChatRef}
                className="customer-faq-chat"
                aria-label={t("settings.customerFaq.previewTranscript")}
              >
                {previewMessages.length ? previewMessages.map((message) => (
                  <article key={message.id} className={`customer-faq-chat-message ${message.role}`}>
                    <div>
                      <p>{message.text}</p>
                      <footer>
                        {message.role !== "user" ? (
                          <small>
                            {message.humanHandoff
                              ? t("settings.customerFaq.previewHuman")
                              : message.usedModel
                                ? t("settings.customerFaq.previewAi")
                                : t("settings.customerFaq.previewRule")}
                            {message.simulatedWrite
                              ? ` · ${t("settings.customerFaq.previewSimulatedWrite")}`
                              : ""}
                            {message.simulatedNotify
                              ? ` · ${t("settings.customerFaq.previewSimulatedNotify")}`
                              : ""}
                          </small>
                        ) : null}
                        <time>
                          {new Date(message.id).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </time>
                        {message.role === "user" ? <CheckCheck aria-hidden="true" /> : null}
                      </footer>
                    </div>
                  </article>
                )) : (
                  <p className="customer-faq-chat-empty">{t("settings.customerFaq.previewEmpty")}</p>
                )}
                {previewing ? (
                  <article className="customer-faq-chat-message assistant pending" role="status">
                    <div>
                      <p>{t("settings.customerFaq.previewing")}</p>
                    </div>
                  </article>
                ) : null}
              </div>
              <form className="customer-faq-chat-composer" onSubmit={(event) => void runPreview(event)}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("settings.customerFaq.previewEmoji")}
                  onClick={() => setPreviewQuery((current) => `${current}😊`)}
                >
                  <Smile />
                </Button>
                <label>
                  <span className="sr-only">{t("settings.customerFaq.previewQuery")}</span>
                  <input
                    value={previewQuery}
                    onChange={(event) => setPreviewQuery(event.target.value)}
                    placeholder={t("settings.customerFaq.previewMessagePlaceholder")}
                  />
                </label>
                <Button
                  type="submit"
                  size="icon"
                  className="customer-faq-chat-send"
                  disabled={previewing || !previewQuery.trim()}
                  aria-label={t("settings.customerFaq.previewAction")}
                >
                  <Send />
                </Button>
              </form>
            </div>
            {previewError ? <p role="alert">{previewError}</p> : null}
          </div>
        </article>
      </div>

      <SidePanel
        open={editor !== undefined}
        title={editor ? t("settings.customerFaq.editTitle") : t("settings.customerFaq.addTitle")}
        onClose={closeEditor}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeEditor}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="customer-faq-form" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <form id="customer-faq-form" className="ingredients-form" onSubmit={(event) => void submit(event)}>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.category")}</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
            >
              {CUSTOMER_FAQ_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {t(`settings.customerFaq.categories.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.question")}</span>
            <input
              value={draft.question}
              required
              onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.answer")}</span>
            <textarea
              rows={8}
              value={draft.answer}
              required
              onChange={(event) => setDraft((current) => ({ ...current, answer: event.target.value }))}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.keywords")}</span>
            <input
              value={draft.keywords}
              onChange={(event) => setDraft((current) => ({ ...current, keywords: event.target.value }))}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.sortOrder")}</span>
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <div className="dictionary-active-field">
            <span>{t("settings.customerFaq.fields.published")}</span>
            <Switch
              checked={draft.isPublished}
              aria-label={t("settings.customerFaq.fields.published")}
              onCheckedChange={(checked) => setDraft((current) => ({ ...current, isPublished: checked }))}
            />
          </div>
          {saveError ? <p role="alert">{saveError}</p> : null}
        </form>
      </SidePanel>

      <SidePanel
        open={insightsOpen}
        title={t("settings.customerFaq.insightsTitle")}
        onClose={() => setInsightsOpen(false)}
        closeLabel={t("common.close")}
      >
        <div className="customer-service-insights">
          <div className="customer-service-report-generator">
            <label className="ingredients-field">
              <span>{t("settings.customerFaq.reportDate")}</span>
              <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
            </label>
            <Button type="button" disabled={generatingReport} onClick={() => void generateReport()}>
              <Sparkles />
              {generatingReport
                ? t("settings.customerFaq.reportGenerating")
                : t("settings.customerFaq.reportGenerate")}
            </Button>
          </div>

          {insightsError ? <p className="orders-state-error" role="alert">{insightsError}</p> : null}
          {insightsLoading ? (
            <p className="orders-toolbar-note">{t("settings.customerFaq.insightsLoading")}</p>
          ) : latestReport ? (
            <>
              <section className="customer-service-report-card">
                <header>
                  <div>
                    <strong>{latestReport.reportDate}</strong>
                    <small>{latestReport.environment} · {latestReport.status}</small>
                  </div>
                  <time>{new Date(latestReport.generatedAt).toLocaleString()}</time>
                </header>
                <div className="customer-service-report-metrics">
                  <div><span>{t("settings.customerFaq.metrics.received")}</span><strong>{latestReport.metrics.received ?? 0}</strong></div>
                  <div><span>{t("settings.customerFaq.metrics.successRate")}</span><strong>{formatRate(latestReport.metrics.success_rate)}</strong></div>
                  <div><span>{t("settings.customerFaq.metrics.failure")}</span><strong>{latestReport.metrics.failed ?? 0}</strong></div>
                  <div><span>{t("settings.customerFaq.metrics.handoff")}</span><strong>{latestReport.metrics.handoff ?? 0}</strong></div>
                  <div><span>{t("settings.customerFaq.metrics.unanswered")}</span><strong>{latestReport.metrics.unanswered ?? 0}</strong></div>
                  <div><span>{t("settings.customerFaq.metrics.sendRate")}</span><strong>{formatRate(latestReport.metrics.send_success_rate)}</strong></div>
                </div>
                <p>{latestReport.aiSummary}</p>
                {latestReport.error ? <small className="orders-state-error">{latestReport.error}</small> : null}
              </section>

              <section className="customer-service-suggestions">
                <header>
                  <div>
                    <h3>{t("settings.customerFaq.suggestionsTitle")}</h3>
                    <p>{t("settings.customerFaq.suggestionsDescription")}</p>
                  </div>
                  <span className="status-badge neutral">{suggestions.length}</span>
                </header>
                {suggestions.length ? suggestions.map((suggestion) => (
                  <article key={suggestion.id}>
                    <div>
                      <span className="status-badge neutral">{suggestion.suggestionType.toUpperCase()}</span>
                      <strong>{suggestion.title}</strong>
                    </div>
                    <p>{suggestion.reason}</p>
                    {suggestion.proposedContent.question ? <small>{suggestion.proposedContent.question}</small> : null}
                    <footer>
                      <span>{t("settings.customerFaq.evidenceCount", { count: suggestion.evidenceCount })}</span>
                      {canEdit ? (
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={reviewingSuggestion === suggestion.id}
                            onClick={() => void reviewSuggestion(suggestion.id, "approved")}
                          >
                            <Check /> {t("settings.customerFaq.suggestionApprove")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reviewingSuggestion === suggestion.id}
                            onClick={() => void reviewSuggestion(suggestion.id, "rejected")}
                          >
                            <X /> {t("settings.customerFaq.suggestionReject")}
                          </Button>
                        </div>
                      ) : null}
                    </footer>
                  </article>
                )) : <p className="orders-toolbar-note">{t("settings.customerFaq.suggestionsEmpty")}</p>}
              </section>

              <section className="customer-service-review-queue">
                <header>
                  <div>
                    <h3>人工覆核學習</h3>
                    <p>人工結果會覆蓋 AI 評分；錯誤答案可直接建立未發布 FAQ 草稿。</p>
                  </div>
                  <span className="status-badge neutral">{reviewTurns.length}</span>
                </header>
                {reviewTurns.length ? reviewTurns.map((turn) => (
                  <article key={turn.id}>
                    <small>{new Date(turn.createdAt).toLocaleString()} · {turn.intent || turn.route || turn.processingStatus}</small>
                    <strong>{turn.question}</strong>
                    <p>{turn.answer || "（沒有回覆）"}</p>
                    {canEdit ? (
                      <>
                        <textarea
                          rows={3}
                          value={feedbackDrafts[turn.id] || ""}
                          placeholder="如果原回覆錯誤，請輸入正確答案"
                          onChange={(event) => setFeedbackDrafts((current) => ({
                            ...current,
                            [turn.id]: event.target.value,
                          }))}
                        />
                        <footer>
                          <Button size="sm" disabled={reviewingTurn === turn.id} onClick={() => void reviewTurn(turn, "correct")}>
                            <Check /> 正確
                          </Button>
                          <Button size="sm" variant="outline" disabled={reviewingTurn === turn.id} onClick={() => void reviewTurn(turn, "incorrect")}>
                            <X /> 錯誤並建立草稿
                          </Button>
                          <Button size="sm" variant="ghost" disabled={reviewingTurn === turn.id} onClick={() => void reviewTurn(turn, "needs_review")}>
                            待覆核
                          </Button>
                        </footer>
                      </>
                    ) : null}
                  </article>
                )) : <p className="orders-toolbar-note">暫時沒有待覆核對話。</p>}
              </section>

              <section className="customer-service-model-lab">
                <header>
                  <div>
                    <h3>模型與 Prompt 實驗室</h3>
                    <p>用人工覆核的歷史問題評測候選配置，確認後才發布到 develop。</p>
                  </div>
                </header>
                {canEdit ? (
                  <div className="customer-service-config-form">
                    <input value={configDraft.label} aria-label="配置名稱" placeholder="配置名稱" onChange={(event) => setConfigDraft((current) => ({ ...current, label: event.target.value }))} />
                    <input value={configDraft.model} aria-label="模型名稱" placeholder="模型名稱" onChange={(event) => setConfigDraft((current) => ({ ...current, model: event.target.value }))} />
                    <textarea rows={3} value={configDraft.systemPrompt} aria-label="附加 Prompt" placeholder="附加 Prompt（不可覆蓋安全規則）" onChange={(event) => setConfigDraft((current) => ({ ...current, systemPrompt: event.target.value }))} />
                    <label>Temperature <input type="number" min="0" max="1" step="0.05" value={configDraft.temperature} onChange={(event) => setConfigDraft((current) => ({ ...current, temperature: Number(event.target.value) }))} /></label>
                    <label>FAQ 數量 <input type="number" min="1" max="20" value={configDraft.retrievalLimit} onChange={(event) => setConfigDraft((current) => ({ ...current, retrievalLimit: Number(event.target.value) }))} /></label>
                    <Button type="button" disabled={Boolean(configBusy)} onClick={() => void createConfig()}><Plus />建立候選版本</Button>
                  </div>
                ) : null}
                <div className="customer-service-config-list">
                  {configVersions.map((config) => {
                    const latestRun = evaluationRuns.find((run) => run.candidateConfigId === config.id);
                    return (
                      <article key={config.id}>
                        <div><strong>v{config.version} · {config.label}</strong><span className={`status-badge ${config.status === "active" ? "green" : "neutral"}`}>{config.status}</span></div>
                        <p>{config.model} · temperature {config.temperature} · FAQ {config.retrievalLimit}</p>
                        {latestRun ? <small>評測：{latestRun.status} · 樣本 {latestRun.sampleSize} · 一致率 {formatRate(latestRun.metrics.agreement_rate)}</small> : <small>尚未評測</small>}
                        {canEdit ? <footer>
                          <Button size="sm" variant="outline" disabled={Boolean(configBusy)} onClick={() => void evaluateConfig(config.id)}><Sparkles />歷史評測</Button>
                          {config.status !== "active" ? <Button size="sm" disabled={Boolean(configBusy) || latestRun?.status !== "complete"} onClick={() => void activateConfig(config.id)}>發布到 develop</Button> : null}
                        </footer> : null}
                      </article>
                    );
                  })}
                  {!configVersions.length ? <p className="orders-toolbar-note">尚未建立候選配置；目前仍使用 Edge Function 環境變數。</p> : null}
                </div>
              </section>
            </>
          ) : (
            <p className="orders-toolbar-note">{t("settings.customerFaq.reportsEmpty")}</p>
          )}
        </div>
      </SidePanel>
    </section>
  );
}
