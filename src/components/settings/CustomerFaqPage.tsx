import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bot,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Smile,
  Sparkles,
  X,
} from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  CUSTOMER_FAQ_CATEGORIES,
  CUSTOMER_FAQS_PAGE_SIZE,
  activateCustomerServiceConfig,
  createCustomerServiceConfig,
  createCustomerFaq,
  evaluateCustomerServiceConfig,
  fetchCustomerServiceConfigVersions,
  fetchCustomerServiceDailyReports,
  fetchCustomerServiceHandoffs,
  fetchCustomerServiceOutboundMessages,
  fetchCustomerServiceEvaluationRuns,
  fetchCustomerServiceLearningSuggestions,
  fetchCustomerServiceReviewTurns,
  fetchCustomerFaqs,
  fetchCustomerServiceControls,
  fetchCustomerServiceLogic,
  previewCustomerServiceTurn,
  generateCustomerServiceDailyReport,
  reviewCustomerServiceLearningSuggestion,
  retryCustomerServiceOutboundMessage,
  rollbackCustomerServiceConfig,
  setCustomerServiceBotEnabled,
  setCustomerServiceConversationMode,
  submitCustomerServiceTurnFeedback,
  updateCustomerFaq,
  updateCustomerServiceIntent,
  updateCustomerServiceReplyTemplate,
  type CustomerFaq,
  type CustomerFaqWriteInput,
  type CustomerServicePreviewConversation,
  type CustomerServicePreviewResult,
  type CustomerServiceControls,
  type CustomerServiceIntentSetting,
  type CustomerServiceLogic,
  type CustomerServiceConfigVersion,
  type CustomerServiceDailyReport,
  type CustomerServiceHandoff,
  type CustomerServiceOutboundMessage,
  type CustomerServiceEvaluationRun,
  type CustomerServiceLearningSuggestion,
  type CustomerServiceReviewTurn,
  type CustomerServiceReplyTemplate,
} from "@/lib/customer-faq";

function previousHongKongDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 - 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

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
  loadLogic = fetchCustomerServiceLogic,
  saveIntent = updateCustomerServiceIntent,
  saveReplyTemplate = updateCustomerServiceReplyTemplate,
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
  loadLogic?: typeof fetchCustomerServiceLogic;
  saveIntent?: typeof updateCustomerServiceIntent;
  saveReplyTemplate?: typeof updateCustomerServiceReplyTemplate;
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
  const [editor, setEditor] = useState<CustomerFaq | null | undefined>(
    undefined,
  );
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [controls, setControls] = useState<CustomerServiceControls | null>(
    null,
  );
  const [controlsError, setControlsError] = useState("");
  const [savingControls, setSavingControls] = useState(false);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewPhone, setPreviewPhone] = useState("");
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewConversation, setPreviewConversation] =
    useState<CustomerServicePreviewConversation | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewChatRef = useRef<HTMLDivElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const isMobileFaq = useMediaQuery("(max-width: 760px)");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [logicOpen, setLogicOpen] = useState(false);
  const [logic, setLogic] = useState<CustomerServiceLogic | null>(null);
  const [selectedIntent, setSelectedIntent] = useState("");
  const [selectedReply, setSelectedReply] = useState("");
  const [logicLoading, setLogicLoading] = useState(false);
  const [logicSaving, setLogicSaving] = useState(false);
  const [logicError, setLogicError] = useState("");
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [reports, setReports] = useState<CustomerServiceDailyReport[]>([]);
  const [handoffs, setHandoffs] = useState<CustomerServiceHandoff[]>([]);
  const [outboundMessages, setOutboundMessages] = useState<CustomerServiceOutboundMessage[]>([]);
  const [suggestions, setSuggestions] = useState<
    CustomerServiceLearningSuggestion[]
  >([]);
  const [reviewTurns, setReviewTurns] = useState<CustomerServiceReviewTurn[]>(
    [],
  );
  const [configVersions, setConfigVersions] = useState<
    CustomerServiceConfigVersion[]
  >([]);
  const [evaluationRuns, setEvaluationRuns] = useState<
    CustomerServiceEvaluationRun[]
  >([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [reportDate, setReportDate] = useState(previousHongKongDate);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reviewingSuggestion, setReviewingSuggestion] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {},
  );
  const [feedbackLearningModes, setFeedbackLearningModes] = useState<
    Record<string, "none" | "evaluation" | "faq_draft">
  >({});
  const [reviewingTurn, setReviewingTurn] = useState("");
  const [configBusy, setConfigBusy] = useState("");
  const [handoffBusy, setHandoffBusy] = useState("");
  const [outboundBusy, setOutboundBusy] = useState("");
  const [configDraft, setConfigDraft] = useState({
    label: "Develop candidate",
    model: "grok-4.3",
    fallbackModel: "grok-4.5",
    fallbackEnabled: true,
    escalationConfidence: 0.72,
    systemPrompt: "",
    temperature: 0.1,
    retrievalLimit: 3,
  });

  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_FAQS_PAGE_SIZE));
  const visibleFrom =
    total === 0 ? 0 : (page - 1) * CUSTOMER_FAQS_PAGE_SIZE + 1;
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
          setPreviewPhone(
            (current) => current || next.allowedPhones?.[0] || "",
          );
          setControlsError("");
        }
      })
      .catch(() => {
        if (!cancelled)
          setControlsError(t("settings.customerFaq.botLoadError"));
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

  useEffect(() => {
    if (!mobileChatOpen) return;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileChatOpen(false);
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => previewInputRef.current?.focus());
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileChatOpen]);

  useEffect(() => {
    if (!isMobileFaq) setMobileChatOpen(false);
  }, [isMobileFaq]);

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
    setPreviewMessages((current) => [
      ...current,
      { id: messageId, role: "user", text },
    ]);
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

  const openLogic = async () => {
    setLogicOpen(true);
    setLogicLoading(true);
    setLogicError("");
    try {
      const next = await loadLogic();
      setLogic(next);
      setSelectedIntent(
        (current) => current || next.intents[0]?.intentKey || "",
      );
      setSelectedReply(
        (current) => current || next.replyTemplates[0]?.templateKey || "",
      );
    } catch {
      setLogicError(t("settings.customerFaq.logicLoadError"));
    } finally {
      setLogicLoading(false);
    }
  };

  const patchIntent = (patch: Partial<CustomerServiceIntentSetting>) => {
    setLogic((current) =>
      current
        ? {
            ...current,
            intents: current.intents.map((intent) =>
              intent.intentKey === selectedIntent
                ? { ...intent, ...patch }
                : intent,
            ),
          }
        : current,
    );
  };

  const patchReply = (patch: Partial<CustomerServiceReplyTemplate>) => {
    setLogic((current) =>
      current
        ? {
            ...current,
            replyTemplates: current.replyTemplates.map((reply) =>
              reply.templateKey === selectedReply
                ? { ...reply, ...patch }
                : reply,
            ),
          }
        : current,
    );
  };

  const saveLogic = async () => {
    if (!logic || logicSaving) return;
    const intent = logic.intents.find(
      (item) => item.intentKey === selectedIntent,
    );
    const reply = logic.replyTemplates.find(
      (item) => item.templateKey === selectedReply,
    );
    if (
      !intent ||
      !reply ||
      !intent.description.trim() ||
      !reply.content.trim()
    ) {
      setLogicError(t("settings.customerFaq.logicValidation"));
      return;
    }
    setLogicSaving(true);
    setLogicError("");
    try {
      await Promise.all([saveIntent(intent), saveReplyTemplate(reply)]);
    } catch {
      setLogicError(t("settings.customerFaq.logicSaveError"));
    } finally {
      setLogicSaving(false);
    }
  };

  const loadInsights = async () => {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const [
        nextReports,
        nextHandoffs,
        nextSuggestions,
        nextTurns,
        nextConfigs,
        nextRuns,
        nextOutbound,
      ] = await Promise.all([
        fetchCustomerServiceDailyReports(),
        fetchCustomerServiceHandoffs(),
        fetchCustomerServiceLearningSuggestions(),
        fetchCustomerServiceReviewTurns(),
        fetchCustomerServiceConfigVersions("develop"),
        fetchCustomerServiceEvaluationRuns(),
        fetchCustomerServiceOutboundMessages(),
      ]);
      setReports(nextReports);
      setHandoffs(nextHandoffs);
      setSuggestions(nextSuggestions);
      setReviewTurns(nextTurns);
      setConfigVersions(nextConfigs);
      setEvaluationRuns(nextRuns);
      setOutboundMessages(nextOutbound);
    } catch {
      setInsightsError("載入客服成效及學習資料失敗。");
    } finally {
      setInsightsLoading(false);
    }
  };

  const openInsights = () => {
    setInsightsOpen(true);
    void loadInsights();
  };
  const switchConversationMode = async (
    handoff: CustomerServiceHandoff,
    mode: "human" | "bot",
  ) => {
    if (!canEdit || handoffBusy) return;
    setHandoffBusy(handoff.id);
    setInsightsError("");
    try {
      await setCustomerServiceConversationMode(handoff.phone, mode);
      await loadInsights();
    } catch {
      setInsightsError("切換真人／機器人模式失敗。");
    } finally {
      setHandoffBusy("");
    }
  };
  const generateReport = async () => {
    if (!reportDate || generatingReport) return;
    setGeneratingReport(true);
    setInsightsError("");
    try {
      await generateCustomerServiceDailyReport(reportDate);
      await loadInsights();
    } catch {
      setInsightsError("產生每日 AI 報告失敗。");
    } finally {
      setGeneratingReport(false);
    }
  };
  const retryOutbound = async (id: string) => {
    if (!canEdit || outboundBusy) return;
    setOutboundBusy(id);
    setInsightsError("");
    try {
      await retryCustomerServiceOutboundMessage(id);
      setOutboundMessages(await fetchCustomerServiceOutboundMessages());
    } catch {
      setInsightsError("重試 WhatsApp 訊息失敗，請檢查 WATI 憑證及錯誤內容。");
    } finally {
      setOutboundBusy("");
    }
  };
  const reviewSuggestion = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    if (!canEdit || reviewingSuggestion) return;
    setReviewingSuggestion(id);
    setInsightsError("");
    try {
      const result = await reviewCustomerServiceLearningSuggestion(id, status);
      setSuggestions((current) => current.filter((item) => item.id !== id));
      if (result?.target_faq_id) setReloadKey((value) => value + 1);
    } catch {
      setInsightsError("審核學習建議失敗。");
    } finally {
      setReviewingSuggestion("");
    }
  };
  const reviewTurn = async (
    turn: CustomerServiceReviewTurn,
    verdict: "correct" | "incorrect" | "needs_review",
  ) => {
    if (!canEdit || reviewingTurn) return;
    const correctedAnswer = feedbackDrafts[turn.id]?.trim() || "";
    const learningMode = feedbackLearningModes[turn.id] || "none";
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
        includeInLearning: learningMode !== "none",
        createFaqDraft: learningMode === "faq_draft",
      });
      setReviewTurns((current) =>
        current.filter((item) => item.id !== turn.id),
      );
      if (learningMode === "faq_draft") setReloadKey((value) => value + 1);
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
      await createCustomerServiceConfig({
        environment: "develop",
        ...configDraft,
      });
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
      setEvaluationRuns(
        await fetchCustomerServiceEvaluationRuns().catch(() => []),
      );
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
  const rollbackConfig = async (id: string) => {
    if (!canEdit || configBusy) return;
    setConfigBusy(id);
    setInsightsError("");
    try {
      await rollbackCustomerServiceConfig(id);
      setConfigVersions(await fetchCustomerServiceConfigVersions("develop"));
    } catch {
      setInsightsError("回滾模型配置失敗；只可回滾至曾經發布且已有完成評測的版本。");
    } finally {
      setConfigBusy("");
    }
  };

  const latestReport = reports[0];
  const formatRate = (value: number | null | undefined) =>
    typeof value === "number" ? `${Math.round(value * 100)}%` : "—";

  const intentDraft = logic?.intents.find(
    (item) => item.intentKey === selectedIntent,
  );
  const replyDraft = logic?.replyTemplates.find(
    (item) => item.templateKey === selectedReply,
  );

  return (
    <section
      className={`orders-page settings-list-page customer-faq-page${
        mobileChatOpen ? " customer-faq-mobile-chat-open" : ""
      }`}
    >
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
            onCheckedChange={(checked) =>
              void saveControls({ enabled: checked })
            }
          />
        </label>
        <div className="customer-faq-auto-reply-window">
          <span>{t("settings.customerFaq.autoReplyWindow")}</span>
          <label>
            <span className="sr-only">
              {t("settings.customerFaq.autoReplyStart")}
            </span>
            <input
              type="time"
              value={controls?.autoReplyStart ?? "19:00"}
              disabled={!canEdit || savingControls || !controls}
              aria-label={t("settings.customerFaq.autoReplyStart")}
              onChange={(event) => {
                const start = event.target.value;
                setControls((current) =>
                  current ? { ...current, autoReplyStart: start } : current,
                );
              }}
              onBlur={(event) =>
                void saveControls({ start: event.target.value })
              }
            />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="sr-only">
              {t("settings.customerFaq.autoReplyEnd")}
            </span>
            <input
              type="time"
              value={controls?.autoReplyEnd ?? "09:00"}
              disabled={!canEdit || savingControls || !controls}
              aria-label={t("settings.customerFaq.autoReplyEnd")}
              onChange={(event) => {
                const end = event.target.value;
                setControls((current) =>
                  current ? { ...current, autoReplyEnd: end } : current,
                );
              }}
              onBlur={(event) => void saveControls({ end: event.target.value })}
            />
          </label>
          <small>
            {(controls?.autoReplyStart ?? "19:00") ===
            (controls?.autoReplyEnd ?? "09:00")
              ? t("settings.customerFaq.autoReplyAllDay")
              : t("settings.customerFaq.autoReplyNextDay")}
          </small>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void openLogic()}
          >
            <Settings2 />
            {t("settings.customerFaq.logicButton")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={openInsights}>
          <BarChart3 />
          AI 成效報告
        </Button>
        <Button
          type="button"
          variant="outline"
          className="customer-faq-mobile-chat-trigger"
          onClick={() => setMobileChatOpen(true)}
        >
          <MessageCircleMore />
          {t("settings.customerFaq.previewTitle")}
        </Button>
        {controlsError ? (
          <p className="orders-state-error" role="alert">
            {controlsError}
          </p>
        ) : null}
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
                    <option value="">
                      {t("settings.customerFaq.allCategories")}
                    </option>
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
              <Button
                variant="outline"
                onClick={() => setReloadKey((value) => value + 1)}
              >
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
              skeletonColumns={
                canEdit ? SKELETON_COLUMNS : SKELETON_COLUMNS.slice(0, -1)
              }
              header={
                <tr>
                  <th>{t("settings.customerFaq.columns.category")}</th>
                  <th>{t("settings.customerFaq.columns.question")}</th>
                  <th>{t("settings.customerFaq.columns.published")}</th>
                  {canEdit ? (
                    <th
                      aria-label={t("settings.customerFaq.columns.actions")}
                    />
                  ) : null}
                </tr>
              }
            >
              {items.map((faq) => (
                <tr key={faq.id}>
                  <td>
                    {t(`settings.customerFaq.categories.${faq.category}`, {
                      defaultValue: faq.category,
                    })}
                  </td>
                  <td>
                    <strong>{faq.question}</strong>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${faq.isPublished ? "green" : "neutral"}`}
                    >
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
            <span>
              {t("settings.pagination", {
                from: visibleFrom,
                to: visibleTo,
                total,
              })}
            </span>
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

        <article
          className="panel orders-panel customer-faq-preview"
          role={isMobileFaq ? "dialog" : undefined}
          aria-modal={isMobileFaq ? "true" : undefined}
          aria-label={
            isMobileFaq ? t("settings.customerFaq.previewTitle") : undefined
          }
        >
          <header className="customer-faq-chat-header">
            <div className="customer-faq-chat-contact">
              <img
                src="/assets/fc-catering-logo.svg"
                alt=""
                width="42"
                height="42"
              />
              <div>
                <h2>Food Channels</h2>
                <p>
                  {previewing
                    ? t("settings.customerFaq.previewingShort")
                    : t("settings.customerFaq.previewTitle")}
                </p>
              </div>
            </div>
            <div className="customer-faq-chat-header-actions">
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
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="customer-faq-chat-close"
                onClick={() => setMobileChatOpen(false)}
                aria-label={t("common.close")}
              >
                <X />
              </Button>
            </div>
          </header>
          <div className="customer-faq-preview-body">
            <div className="customer-faq-chat-shell">
              <div
                ref={previewChatRef}
                className="customer-faq-chat"
                aria-label={t("settings.customerFaq.previewTranscript")}
              >
                {previewMessages.length ? (
                  previewMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`customer-faq-chat-message ${message.role}`}
                    >
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
                          {message.role === "user" ? (
                            <CheckCheck aria-hidden="true" />
                          ) : null}
                        </footer>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="customer-faq-chat-empty">
                    {t("settings.customerFaq.previewEmpty")}
                  </p>
                )}
                {previewing ? (
                  <article
                    className="customer-faq-chat-message assistant pending"
                    role="status"
                  >
                    <div>
                      <p>{t("settings.customerFaq.previewing")}</p>
                    </div>
                  </article>
                ) : null}
              </div>
              <form
                className="customer-faq-chat-composer"
                onSubmit={(event) => void runPreview(event)}
              >
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
                  <span className="sr-only">
                    {t("settings.customerFaq.previewQuery")}
                  </span>
                  <input
                    ref={previewInputRef}
                    value={previewQuery}
                    onChange={(event) => setPreviewQuery(event.target.value)}
                    placeholder={t(
                      "settings.customerFaq.previewMessagePlaceholder",
                    )}
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
        title={
          editor
            ? t("settings.customerFaq.editTitle")
            : t("settings.customerFaq.addTitle")
        }
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
        <form
          id="customer-faq-form"
          className="ingredients-form"
          onSubmit={(event) => void submit(event)}
        >
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.category")}</span>
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
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
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  question: event.target.value,
                }))
              }
            />
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.answer")}</span>
            <textarea
              rows={8}
              value={draft.answer}
              required
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  answer: event.target.value,
                }))
              }
            />
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.keywords")}</span>
            <input
              value={draft.keywords}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  keywords: event.target.value,
                }))
              }
            />
          </label>
          <label className="ingredients-field">
            <span>{t("settings.customerFaq.fields.sortOrder")}</span>
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sortOrder: Number(event.target.value) || 0,
                }))
              }
            />
          </label>
          <div className="dictionary-active-field">
            <span>{t("settings.customerFaq.fields.published")}</span>
            <Switch
              checked={draft.isPublished}
              aria-label={t("settings.customerFaq.fields.published")}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, isPublished: checked }))
              }
            />
          </div>
          {saveError ? <p role="alert">{saveError}</p> : null}
        </form>
      </SidePanel>

      <SidePanel
        open={insightsOpen}
        title="AI 成效報告與學習"
        onClose={() => setInsightsOpen(false)}
        closeLabel={t("common.close")}
        className="customer-service-insights-panel"
      >
        <div className="customer-service-insights">
          <section className="customer-service-review-queue customer-service-handoff-queue">
            <header>
              <div>
                <h3 className="customer-service-section-title">
                  <span><MessageCircleMore /></span>
                  待真人跟進對話
                </h3>
                <p>
                  夜間先記錄；上午 9
                  點通知同事。接手後由真人回覆，完成後交回機器人。
                </p>
              </div>
              <span className="status-badge neutral">
                {handoffs.filter((item) => item.status !== "resolved").length}
              </span>
            </header>
            {handoffs
              .filter((item) => item.status !== "resolved")
              .map((handoff) => (
                <article key={handoff.id}>
                  <small>
                    {handoff.phone} · {handoff.orderNumber || "未指定訂單"} ·{" "}
                    {handoff.messageCount} 則訊息
                  </small>
                  <strong>{handoff.summary}</strong>
                  <p>
                    {handoff.status === "pending"
                      ? `預計 ${new Date(handoff.notifyAfter).toLocaleString("zh-HK")} 通知`
                      : `狀態：${handoff.status}`}
                  </p>
                  {canEdit ? (
                    <footer>
                      <Button
                        size="sm"
                        disabled={handoffBusy === handoff.id}
                        onClick={() =>
                          void switchConversationMode(handoff, "human")
                        }
                      >
                        <MessageCircleMore />
                        真人接手
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={handoffBusy === handoff.id}
                        onClick={() =>
                          void switchConversationMode(handoff, "bot")
                        }
                      >
                        <Bot />
                        交回機器人
                      </Button>
                    </footer>
                  ) : null}
                </article>
              ))}
            {!handoffs.some((item) => item.status !== "resolved") ? (
              <p>目前沒有待真人跟進的對話。</p>
            ) : null}
          </section>
          <section className="customer-service-review-queue customer-service-delivery-queue">
            <header>
              <div>
                <h3 className="customer-service-section-title">
                  <span><Send /></span>
                  WhatsApp 發送追蹤
                </h3>
                <p>集中查看排隊、發送失敗及已停止重試的客服回覆。</p>
              </div>
              <span className="status-badge neutral">
                {outboundMessages.filter((item) =>
                  ["queued", "sending", "failed", "dead"].includes(item.status)
                ).length}
              </span>
            </header>
            {outboundMessages
              .filter((item) => ["queued", "sending", "failed", "dead"].includes(item.status))
              .map((message) => (
                <article key={message.id}>
                  <small>
                    {message.phone} · {new Date(message.createdAt).toLocaleString("zh-HK")}
                  </small>
                  <strong>{message.body}</strong>
                  <p>
                    狀態：{message.status} · 嘗試 {message.attemptCount}/{message.maxAttempts}
                  </p>
                  {message.lastError ? <code>{message.lastError}</code> : null}
                  {canEdit && ["failed", "dead"].includes(message.status) ? (
                    <footer>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={outboundBusy === message.id}
                        onClick={() => void retryOutbound(message.id)}
                      >
                        <RefreshCw />
                        立即重試
                      </Button>
                    </footer>
                  ) : null}
                </article>
              ))}
            {!outboundMessages.some((item) =>
              ["queued", "sending", "failed", "dead"].includes(item.status)
            ) ? <p>目前沒有待處理或失敗的 WhatsApp 回覆。</p> : null}
          </section>
          <div className="customer-service-report-generator">
            <label className="ingredients-field">
              <span>報告日期</span>
              <input
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </label>
            <Button
              type="button"
              disabled={generatingReport}
              onClick={() => void generateReport()}
            >
              <Sparkles />
              {generatingReport ? "分析中…" : "產生報告"}
            </Button>
          </div>
          {insightsError ? (
            <p className="orders-state-error" role="alert">
              {insightsError}
            </p>
          ) : null}
          {insightsLoading ? (
            <p>載入中…</p>
          ) : latestReport ? (
            <section className="customer-service-report-card customer-service-report-overview">
              <header>
                <div>
                  <strong>{latestReport.reportDate}</strong>
                  <small>
                    {latestReport.environment} · {latestReport.status}
                  </small>
                </div>
              </header>
              <div className="customer-service-report-metrics">
                <div>
                  <span>收到問題</span>
                  <strong>{latestReport.metrics.received ?? 0}</strong>
                </div>
                <div>
                  <span>成功率</span>
                  <strong>
                    {formatRate(latestReport.metrics.success_rate)}
                  </strong>
                </div>
                <div>
                  <span>失敗</span>
                  <strong>{latestReport.metrics.failed ?? 0}</strong>
                </div>
                <div>
                  <span>真人接手</span>
                  <strong>{latestReport.metrics.handoff ?? 0}</strong>
                </div>
                <div>
                  <span>未能回答</span>
                  <strong>{latestReport.metrics.unanswered ?? 0}</strong>
                </div>
                <div>
                  <span>發送成功率</span>
                  <strong>
                    {formatRate(latestReport.metrics.send_success_rate)}
                  </strong>
                </div>
              </div>
              <p>{latestReport.aiSummary}</p>
            </section>
          ) : (
            <p>尚未有每日報告。</p>
          )}

          <section className="customer-service-suggestions">
            <header>
              <div>
                <h3 className="customer-service-section-title">
                  <span><Sparkles /></span>
                  AI 學習建議
                </h3>
                <p>批准後只會建立未發布 FAQ 草稿。</p>
              </div>
              <span className="status-badge neutral">{suggestions.length}</span>
            </header>
            {suggestions.map((suggestion) => (
              <article key={suggestion.id}>
                <div>
                  <span className="status-badge neutral">
                    {suggestion.suggestionType.toUpperCase()}
                  </span>
                  <strong>{suggestion.title}</strong>
                </div>
                <p>{suggestion.reason}</p>
                <footer>
                  <span>證據 {suggestion.evidenceCount} 條</span>
                  {canEdit ? (
                    <div>
                      <Button
                        size="sm"
                        disabled={reviewingSuggestion === suggestion.id}
                        onClick={() =>
                          void reviewSuggestion(suggestion.id, "approved")
                        }
                      >
                        <Check />
                        批准
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewingSuggestion === suggestion.id}
                        onClick={() =>
                          void reviewSuggestion(suggestion.id, "rejected")
                        }
                      >
                        <X />
                        忽略
                      </Button>
                    </div>
                  ) : null}
                </footer>
              </article>
            ))}
          </section>

          <section className="customer-service-review-queue customer-service-answer-review">
            <header>
              <div>
                <h3 className="customer-service-section-title">
                  <span><CheckCheck /></span>
                  人工覆核學習
                </h3>
                <p>先判斷回覆是否正確，再自行選擇是否加入學習。</p>
              </div>
              <span className="status-badge neutral">{reviewTurns.length}</span>
            </header>
            {reviewTurns.map((turn) => (
              <article key={turn.id}>
                <small>
                  {new Date(turn.createdAt).toLocaleString()} ·{" "}
                  {turn.intent || turn.route || turn.processingStatus}
                </small>
                <strong>{turn.question}</strong>
                <p>{turn.answer || "（沒有回覆）"}</p>
                {canEdit ? (
                  <>
                    <textarea
                      rows={3}
                      value={feedbackDrafts[turn.id] || ""}
                      placeholder={t("settings.customerFaq.reviewCorrectionPlaceholder")}
                      onChange={(event) =>
                        setFeedbackDrafts((current) => ({
                          ...current,
                          [turn.id]: event.target.value,
                        }))
                      }
                    />
                    <label className="customer-service-learning-mode">
                      <span>學習方式</span>
                      <select
                        value={feedbackLearningModes[turn.id] || "none"}
                        onChange={(event) =>
                          setFeedbackLearningModes((current) => ({
                            ...current,
                            [turn.id]: event.target.value as
                              | "none"
                              | "evaluation"
                              | "faq_draft",
                          }))
                        }
                      >
                        <option value="none">不加入學習（只記錄成效）</option>
                        <option value="evaluation">加入模型評測案例</option>
                        <option value="faq_draft">建立未發布 FAQ 草稿</option>
                      </select>
                    </label>
                    <footer>
                      <Button
                        size="sm"
                        disabled={reviewingTurn === turn.id}
                        onClick={() => void reviewTurn(turn, "correct")}
                      >
                        <Check />
                        正確
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewingTurn === turn.id}
                        onClick={() => void reviewTurn(turn, "incorrect")}
                      >
                        <X />
                        錯誤
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reviewingTurn === turn.id}
                        onClick={() => void reviewTurn(turn, "needs_review")}
                      >
                        待覆核
                      </Button>
                    </footer>
                  </>
                ) : null}
              </article>
            ))}
          </section>

          <section className="customer-service-model-lab">
            <header>
              <div>
                <h3 className="customer-service-section-title">
                  <span><Settings2 /></span>
                  模型與 Prompt 實驗室
                </h3>
                <p>候選配置完成歷史評測後才能發布到 develop。</p>
              </div>
            </header>
            {canEdit ? (
              <div className="customer-service-config-form">
                <input
                  aria-label="配置名稱"
                  value={configDraft.label}
                  onChange={(event) =>
                    setConfigDraft((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
                <input
                  aria-label="模型名稱"
                  value={configDraft.model}
                  onChange={(event) =>
                    setConfigDraft((current) => ({
                      ...current,
                      model: event.target.value,
                    }))
                  }
                />
                <label>
                  備援模型
                  <input
                    aria-label="備援模型"
                    value={configDraft.fallbackModel}
                    disabled={!configDraft.fallbackEnabled}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        fallbackModel: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  低信心升級門檻
                  <input
                    aria-label="低信心升級門檻"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={configDraft.escalationConfidence}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        escalationConfidence: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  啟用智能升級
                  <input
                    aria-label="啟用智能升級"
                    type="checkbox"
                    checked={configDraft.fallbackEnabled}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        fallbackEnabled: event.target.checked,
                      }))
                    }
                  />
                </label>
                <textarea
                  aria-label="附加 Prompt"
                  rows={3}
                  placeholder={t("settings.customerFaq.additionalPromptPlaceholder")}
                  value={configDraft.systemPrompt}
                  onChange={(event) =>
                    setConfigDraft((current) => ({
                      ...current,
                      systemPrompt: event.target.value,
                    }))
                  }
                />
                <label>
                  Temperature{" "}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={configDraft.temperature}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        temperature: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  FAQ 數量{" "}
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={configDraft.retrievalLimit}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        retrievalLimit: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <Button
                  type="button"
                  disabled={Boolean(configBusy)}
                  onClick={() => void createConfig()}
                >
                  <Plus />
                  建立候選版本
                </Button>
              </div>
            ) : null}
            <div className="customer-service-config-list">
              {configVersions.map((config) => {
                const latestRun = evaluationRuns.find(
                  (run) => run.candidateConfigId === config.id,
                );
                return (
                  <article key={config.id}>
                    <div>
                      <strong>
                        v{config.version} · {config.label}
                      </strong>
                      <span
                        className={`status-badge ${config.status === "active" ? "green" : "neutral"}`}
                      >
                        {config.status}
                      </span>
                    </div>
                    <p>
                      主模型 {config.model}（none） · {config.fallbackEnabled
                        ? `低信心轉 ${config.fallbackModel}（low，門檻 ${config.escalationConfidence}）`
                        : "不升級"} · temperature {config.temperature} · FAQ{" "}
                      {config.retrievalLimit}
                    </p>
                    <small>
                      {latestRun
                        ? `評測：${latestRun.status} · 樣本 ${latestRun.sampleSize} · 一致率 ${formatRate(latestRun.metrics.agreement_rate)}`
                        : "尚未評測"}
                    </small>
                    {canEdit ? (
                      <footer>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(configBusy)}
                          onClick={() => void evaluateConfig(config.id)}
                        >
                          <Sparkles />
                          歷史評測
                        </Button>
                        {config.status !== "active" ? (
                          <>
                            <Button
                              size="sm"
                              disabled={
                                Boolean(configBusy) ||
                                latestRun?.status !== "complete"
                              }
                              onClick={() => void activateConfig(config.id)}
                            >
                              發布到 develop
                            </Button>
                            {config.status === "archived" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={Boolean(configBusy)}
                                onClick={() => void rollbackConfig(config.id)}
                              >
                                <RotateCcw />
                                回滾至此版本
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </footer>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </SidePanel>

      <SidePanel
        open={logicOpen}
        title={t("settings.customerFaq.logicTitle")}
        description={t("settings.customerFaq.logicDescription")}
        onClose={() => !logicSaving && setLogicOpen(false)}
        closeLabel={t("common.close")}
        half
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogicOpen(false)}
              disabled={logicSaving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void saveLogic()}
              disabled={logicSaving || logicLoading || !logic}
            >
              {logicSaving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        {logicLoading ? <p>{t("common.loading")}</p> : null}
        {logicError ? (
          <p className="orders-state-error" role="alert">
            {logicError}
          </p>
        ) : null}
        {intentDraft && replyDraft ? (
          <div className="customer-service-logic-editor">
            <section>
              <h3>{t("settings.customerFaq.logicIntentTitle")}</h3>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicIntent")}</span>
                <FilterableSelect
                  value={selectedIntent}
                  onChange={(event) => setSelectedIntent(event.target.value)}
                >
                  {logic?.intents.map((intent) => (
                    <option key={intent.intentKey} value={intent.intentKey}>
                      {intent.displayName}
                    </option>
                  ))}
                </FilterableSelect>
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicDescriptionField")}</span>
                <textarea
                  rows={5}
                  value={intentDraft.description}
                  onChange={(event) =>
                    patchIntent({ description: event.target.value })
                  }
                />
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicExamples")}</span>
                <textarea
                  rows={7}
                  value={intentDraft.examples.join("\n")}
                  onChange={(event) =>
                    patchIntent({ examples: event.target.value.split("\n") })
                  }
                />
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicConfidence")}</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={intentDraft.confidenceThreshold}
                  onChange={(event) =>
                    patchIntent({
                      confidenceThreshold: Number(event.target.value),
                    })
                  }
                />
              </label>
              <p className="customer-service-logic-tools">
                {t("settings.customerFaq.logicTools")}:{" "}
                {intentDraft.toolKeys.join(", ") ||
                  t("settings.customerFaq.logicNoTools")}
              </p>
              <div className="dictionary-active-field">
                <span>{t("settings.customerFaq.logicEnabled")}</span>
                <Switch
                  checked={intentDraft.enabled}
                  onCheckedChange={(enabled) => patchIntent({ enabled })}
                />
              </div>
            </section>
            <section>
              <h3>{t("settings.customerFaq.logicReplyTitle")}</h3>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicReply")}</span>
                <FilterableSelect
                  value={selectedReply}
                  onChange={(event) => setSelectedReply(event.target.value)}
                >
                  {logic?.replyTemplates.map((reply) => (
                    <option key={reply.templateKey} value={reply.templateKey}>
                      {reply.displayName}
                    </option>
                  ))}
                </FilterableSelect>
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicReplyContent")}</span>
                <textarea
                  rows={10}
                  value={replyDraft.content}
                  onChange={(event) =>
                    patchReply({ content: event.target.value })
                  }
                />
              </label>
              <div className="dictionary-active-field">
                <span>{t("settings.customerFaq.logicEnabled")}</span>
                <Switch
                  checked={replyDraft.enabled}
                  onCheckedChange={(enabled) => patchReply({ enabled })}
                />
              </div>
            </section>
          </div>
        ) : null}
      </SidePanel>
    </section>
  );
}
