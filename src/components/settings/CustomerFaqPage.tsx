import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircleMore,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Smile,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  submitCustomerServiceTurnFeedback,
  updateCustomerFaq,
  updateCustomerServiceIntent,
  updateCustomerServiceReplyTemplate,
  updateCustomerServiceWorkflowPolicy,
  type CustomerFaq,
  type CustomerFaqWriteInput,
  type CustomerServicePreviewConversation,
  type CustomerServicePreviewResult,
  type CustomerServiceControls,
  type CustomerServiceIntentSetting,
  type CustomerServiceLogic,
  type CustomerServiceConfigVersion,
  type CustomerServiceDailyReport,
  type CustomerServiceOutboundMessage,
  type CustomerServiceEvaluationRun,
  type CustomerServiceLearningSuggestion,
  type CustomerServiceReviewTurn,
  type CustomerServiceReplyTemplate,
  type CustomerServiceWorkflowPolicy,
} from "@/lib/customer-faq";

// Chat copy is mostly Chinese prose. Stop before adjacent Han/full-width text so
// punctuation-free prose cannot accidentally become part of the clickable URL.
const CUSTOMER_FAQ_CHAT_URL = /https?:\/\/[^\s<>"'\p{Script=Han}\u3000-\u303f\uff00-\uffef]+/giu;
const CUSTOMER_FAQ_CHAT_URL_TRAILING_PUNCTUATION = /[),.;!?，。；！？：）]+$/u;

function renderCustomerFaqChatText(text: string): ReactNode[] {
  const content: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CUSTOMER_FAQ_CHAT_URL)) {
    const start = match.index;
    const rawUrl = match[0];
    const trailing = rawUrl.match(CUSTOMER_FAQ_CHAT_URL_TRAILING_PUNCTUATION)?.[0] ?? "";
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    if (start > cursor) content.push(text.slice(cursor, start));
    content.push(
      <a key={`${start}-${url}`} href={url} target="_blank" rel="noreferrer noopener">
        {url}
      </a>,
    );
    if (trailing) content.push(trailing);
    cursor = start + rawUrl.length;
  }
  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

const LEARNING_FIELD_LABELS: Record<string, string> = {
  description_append: "補充辨識說明", examples_append: "新增問法",
  display_name: "名稱", content: "回覆內容", enabled: "啟用",
  instructions_append: "補充處理指引", context_window: "參考訊息數量",
  clarification_threshold: "追問門檻", auto_resume: "自動恢復回覆",
};
const LEARNING_TARGET_LABELS: Record<string, string> = {
  intent: "查詢意圖", reply_template: "回覆範本", workflow_policy: "處理規則",
};
function hasCompleteLearningProposal(suggestion: CustomerServiceLearningSuggestion) {
  const proposal = suggestion.proposedContent;
  if (suggestion.suggestionType === "faq") {
    return Boolean(proposal.question?.trim() && proposal.answer?.trim());
  }
  return Boolean(proposal.runtime_changes?.length && proposal.runtime_changes.every(
    (change) => change.key?.trim() && LEARNING_TARGET_LABELS[change.target] &&
      change.patch && Object.keys(change.patch).length > 0,
  ));
}
function learningValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map(learningValue).join("；");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function previousHongKongDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 - 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

const SKELETON_COLUMNS = [
  { width: "7rem" },
  { width: "24%" },
  { width: "38%" },
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

const DEFAULT_PREVIEW_PHONE = "86 138 2874 7224";

function AutoReplyScheduleEditor({
  id,
  dayLabel,
  start,
  end,
  startLabel,
  endLabel,
  disabled,
  onStartChange,
  onEndChange,
  onStartCommit,
  onEndCommit,
}: {
  id: string;
  dayLabel: string;
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  disabled: boolean;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onStartCommit: (value: string) => void;
  onEndCommit: (value: string) => void;
}) {
  const { t } = useTranslation();
  const summary =
    start === end
      ? t("settings.customerFaq.autoReplyAllDayShort")
      : `${start} – ${
          start > end
            ? `${t("settings.customerFaq.autoReplyNextDayShort")} `
            : ""
        }${end}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="customer-faq-auto-reply-schedule-cell"
          disabled={disabled}
          aria-label={t("settings.customerFaq.editAutoReplyWindow", {
            day: dayLabel,
          })}
        >
          <strong>{dayLabel}</strong>
          <span>{summary}</span>
          <Pencil aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        collisionPadding={12}
        className="customer-faq-auto-reply-popover"
      >
        <header>
          <strong>{dayLabel}</strong>
          <small>{t("settings.customerFaq.autoReplyHongKongTime")}</small>
        </header>
        <div>
          <label htmlFor={`${id}-start`}>
            <span>{t("settings.customerFaq.autoReplyStartShort")}</span>
            <input
              id={`${id}-start`}
              type="time"
              value={start}
              aria-label={startLabel}
              onChange={(event) => onStartChange(event.target.value)}
              onBlur={(event) => onStartCommit(event.target.value)}
            />
          </label>
          <span aria-hidden="true">–</span>
          <label htmlFor={`${id}-end`}>
            <span>{t("settings.customerFaq.autoReplyEndShort")}</span>
            <input
              id={`${id}-end`}
              type="time"
              value={end}
              aria-label={endLabel}
              onChange={(event) => onEndChange(event.target.value)}
              onBlur={(event) => onEndCommit(event.target.value)}
            />
          </label>
        </div>
        <small>{
          start === end
            ? t("settings.customerFaq.autoReplyAllDay")
            : start > end
              ? t("settings.customerFaq.autoReplyNextDay")
              : t("settings.customerFaq.autoReplySameDay")
        }</small>
      </PopoverContent>
    </Popover>
  );
}

type PreviewMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  usedModel?: boolean;
  humanHandoff?: boolean;
  simulatedWrite?: boolean;
  simulatedNotify?: boolean;
  relatedFaqs?: Array<{ id: string; question: string }>;
  trace?: PreviewExecutionTrace;
};

type PreviewExecutionTrace = {
  stateBefore: string;
  stateAfter: string;
  intentKey?: string;
  confidence?: number;
  toolKeys: string[];
  usedModel: boolean;
  humanHandoff: boolean;
  simulatedWrite: boolean;
  simulatedNotify: boolean;
  replyGenerated: boolean;
};

function PreviewTracePopover({ trace }: { trace: PreviewExecutionTrace }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTrace = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(true);
  };
  const closeTrace = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const source = trace.humanHandoff
    ? t("settings.customerFaq.previewTraceSourceHandoff")
    : trace.usedModel
      ? t("settings.customerFaq.previewTraceSourceAi")
      : t("settings.customerFaq.previewTraceSourceRule");
  const effects = [
    trace.simulatedWrite
      ? t("settings.customerFaq.previewTraceEffectWrite")
      : null,
    trace.simulatedNotify
      ? t("settings.customerFaq.previewTraceEffectNotify")
      : null,
  ].filter((item): item is string => Boolean(item));
  const steps = [
    {
      label: t("settings.customerFaq.previewTraceRequest"),
      summary: t("settings.customerFaq.previewTraceRequestSummary"),
      detail: t("settings.customerFaq.previewTraceRequestDetail"),
    },
    {
      label: `${t("settings.customerFaq.previewTraceIntent")}：${
        trace.intentKey || t("settings.customerFaq.previewTraceUnknown")
      }`,
      summary: trace.confidence === undefined
        ? source
        : `${source} · ${t("settings.customerFaq.previewTraceConfidence", {
          value: `${Math.round(trace.confidence * 100)}%`,
        })}`,
      detail: t("settings.customerFaq.previewTraceIntentDetail"),
    },
    {
      label: t("settings.customerFaq.previewTraceRoute"),
      summary: trace.toolKeys.length
        ? trace.toolKeys.join(" → ")
        : t("settings.customerFaq.previewTraceRouteNone"),
      detail: t("settings.customerFaq.previewTraceRouteDetail"),
    },
    {
      label: t("settings.customerFaq.previewTraceState"),
      summary: `${trace.stateBefore} → ${trace.stateAfter}`,
      detail: trace.stateBefore === trace.stateAfter
        ? t("settings.customerFaq.previewTraceStateUnchanged")
        : t("settings.customerFaq.previewTraceStateChanged"),
    },
    {
      label: t("settings.customerFaq.previewTraceResult"),
      summary: trace.replyGenerated
        ? t("settings.customerFaq.previewTraceReplyGenerated")
        : t("settings.customerFaq.previewTraceReplySilent"),
      detail: effects.length
        ? t("settings.customerFaq.previewTraceEffects", {
          effects: effects.join("、"),
        })
        : t("settings.customerFaq.previewTraceNoEffects"),
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className="customer-faq-trace-trigger"
          aria-label={t("settings.customerFaq.previewTraceAction")}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseEnter={openTrace}
          onMouseLeave={closeTrace}
          onFocus={openTrace}
          onBlur={closeTrace}
          onClick={openTrace}
        >
          <ListTree aria-hidden="true" />
          <span>{t("settings.customerFaq.previewTraceShort")}</span>
        </button>
      </PopoverAnchor>
      <PopoverContent
        className="customer-faq-trace-popover"
        side="top"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={openTrace}
        onMouseLeave={closeTrace}
        onFocusCapture={openTrace}
        onBlurCapture={closeTrace}
      >
        <header>
          <div>
            <ListTree aria-hidden="true" />
            <strong>{t("settings.customerFaq.previewTraceTitle")}</strong>
          </div>
          <span>{t("settings.customerFaq.previewTraceStepCount", { count: steps.length })}</span>
        </header>
        <ol>
          {steps.map((step, index) => (
            <li key={step.label}>
              <span className="customer-faq-trace-marker" aria-hidden="true">
                <Check />
              </span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.summary}</p>
                <small>{step.detail}</small>
              </div>
              <span className="customer-faq-trace-stage" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}

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
  saveWorkflowPolicy = updateCustomerServiceWorkflowPolicy,
  loadReviewTurns = fetchCustomerServiceReviewTurns,
  submitTurnFeedback = submitCustomerServiceTurnFeedback,
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
  saveWorkflowPolicy?: typeof updateCustomerServiceWorkflowPolicy;
  loadReviewTurns?: typeof fetchCustomerServiceReviewTurns;
  submitTurnFeedback?: typeof submitCustomerServiceTurnFeedback;
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
  const [previewPhone, setPreviewPhone] = useState(DEFAULT_PREVIEW_PHONE);
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
  const [selectedWorkflow, setSelectedWorkflow] = useState<
    CustomerServiceWorkflowPolicy["goalKey"]
  >("order_change");
  const [logicLoading, setLogicLoading] = useState(false);
  const [logicSaving, setLogicSaving] = useState(false);
  const [logicError, setLogicError] = useState("");
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reports, setReports] = useState<CustomerServiceDailyReport[]>([]);
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
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reportDate, setReportDate] = useState(previousHongKongDate);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reviewingSuggestion, setReviewingSuggestion] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {},
  );
  const [reviewingTurn, setReviewingTurn] = useState("");
  const [configBusy, setConfigBusy] = useState("");
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
    weekdayStart = controls?.weekdayAutoReplyStart ?? "19:00",
    weekdayEnd = controls?.weekdayAutoReplyEnd ?? "09:00",
    saturdayStart = controls?.saturdayAutoReplyStart ?? "00:00",
    saturdayEnd = controls?.saturdayAutoReplyEnd ?? "00:00",
    sundayStart = controls?.sundayAutoReplyStart ?? "00:00",
    sundayEnd = controls?.sundayAutoReplyEnd ?? "00:00",
  }: {
    enabled?: boolean;
    weekdayStart?: string;
    weekdayEnd?: string;
    saturdayStart?: string;
    saturdayEnd?: string;
    sundayStart?: string;
    sundayEnd?: string;
  }) => {
    if (!canEdit || savingControls) return;
    setSavingControls(true);
    setControlsError("");
    try {
      setControls(
        await setBotEnabled(
          enabled,
          weekdayStart,
          weekdayEnd,
          saturdayStart,
          saturdayEnd,
          sundayStart,
          sundayEnd,
        ),
      );
    } catch {
      setControlsError(t("settings.customerFaq.botSaveError"));
    } finally {
      setSavingControls(false);
    }
  };

  const sendPreviewText = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || previewing) return;
    const messageId = Date.now();
    const stateBefore = previewConversation?.state ?? "identifying";
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
        phone: previewPhone.replace(/\D/g, "") || undefined,
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
          relatedFaqs: result.relatedFaqs ?? [],
          trace: {
            stateBefore,
            stateAfter: result.conversation.state,
            intentKey: result.intentKey,
            confidence: result.confidence,
            toolKeys: result.toolKeys ?? [],
            usedModel: result.usedModel,
            humanHandoff: result.humanHandoff,
            simulatedWrite: result.simulatedWrite,
            simulatedNotify: result.simulatedNotify,
            replyGenerated: Boolean(result.reply),
          },
        },
      ]);
    } catch {
      setPreviewError(t("settings.customerFaq.previewError"));
    } finally {
      setPreviewing(false);
    }
  };

  const runPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendPreviewText(previewQuery);
  };

  const resetPreview = () => {
    setPreviewMessages([]);
    setPreviewConversation(null);
    setPreviewError("");
    setPreviewQuery("");
  };

  const changePreviewPhone = (value: string) => {
    if (value === previewPhone) return;
    setPreviewPhone(value);
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
      setSelectedWorkflow(
        (current) => current || next.workflowPolicies[0]?.goalKey || "order_change",
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

  const patchWorkflow = (patch: Partial<CustomerServiceWorkflowPolicy>) => {
    setLogic((current) => current
      ? {
          ...current,
          workflowPolicies: current.workflowPolicies.map((workflow) =>
            workflow.goalKey === selectedWorkflow
              ? { ...workflow, ...patch }
              : workflow,
          ),
        }
      : current);
  };

  const saveLogic = async () => {
    if (!logic || logicSaving) return;
    const intent = logic.intents.find(
      (item) => item.intentKey === selectedIntent,
    );
    const reply = logic.replyTemplates.find(
      (item) => item.templateKey === selectedReply,
    );
    const workflow = logic.workflowPolicies.find(
      (item) => item.goalKey === selectedWorkflow,
    );
    if (
      !intent ||
      !reply ||
      !workflow ||
      !intent.description.trim() ||
      !reply.content.trim()
    ) {
      setLogicError(t("settings.customerFaq.logicValidation"));
      return;
    }
    setLogicSaving(true);
    setLogicError("");
    try {
      await Promise.all([
        saveIntent(intent),
        saveReplyTemplate(reply),
        saveWorkflowPolicy(workflow),
      ]);
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
        nextSuggestions,
        nextConfigs,
        nextRuns,
        nextOutbound,
      ] = await Promise.all([
        fetchCustomerServiceDailyReports(),
        fetchCustomerServiceLearningSuggestions(),
        fetchCustomerServiceConfigVersions("develop"),
        fetchCustomerServiceEvaluationRuns(),
        fetchCustomerServiceOutboundMessages(),
      ]);
      setReports(nextReports);
      setSuggestions(nextSuggestions);
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
  const loadReviewQueue = async () => {
    setReviewLoading(true);
    setReviewError("");
    try {
      setReviewTurns(await loadReviewTurns("unreviewed", 50));
    } catch {
      setReviewTurns([]);
      setReviewError("載入人工覆核資料失敗。");
    } finally {
      setReviewLoading(false);
    }
  };
  const openReviewQueue = () => {
    setReviewOpen(true);
    void loadReviewQueue();
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInsightsError(
        message.includes("suggestion_mapping_required") ||
            message.includes("suggestion_mapping_invalid")
          ? "建議內容尚未完整，未有作出任何變更。"
          : message.includes("suggestion_faq_conflict")
            ? "已有同名 FAQ，內容與這項建議不同；請先在 FAQ 編輯頁核對。"
            : "審核學習建議失敗，未有作出任何變更。",
      );
    } finally {
      setReviewingSuggestion("");
    }
  };
  const reviewTurn = async (
    turn: CustomerServiceReviewTurn,
    verdict: "correct" | "incorrect" | "needs_review",
  ) => {
    if (!canEdit || reviewingTurn) return;
    const direction = feedbackDrafts[turn.id]?.trim() || "";
    if (verdict === "incorrect" && !direction) {
      setReviewError("標記錯誤前，請先填寫大概修正方向。");
      return;
    }
    setReviewingTurn(turn.id);
    setReviewError("");
    try {
      await submitTurnFeedback({
        turnId: turn.id,
        verdict,
        note: verdict === "incorrect" ? direction : undefined,
        includeInLearning: false,
        createFaqDraft: false,
      });
      setReviewTurns((current) =>
        current.filter((item) => item.id !== turn.id),
      );
    } catch {
      setReviewError("儲存人工覆核結果失敗。");
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
  const actionableOutboundMessages = outboundMessages.filter((item) =>
    ["queued", "sending", "failed", "dead"].includes(item.status),
  );
  const failedOutboundCount = actionableOutboundMessages.filter((item) =>
    ["failed", "dead"].includes(item.status),
  ).length;
  const reportNeedsAttention =
    failedOutboundCount > 0 ||
    Number(latestReport?.metrics.failed ?? 0) > 0 ||
    Number(latestReport?.metrics.wrong_handoff_count ?? 0) > 0;
  const formatRate = (value: number | null | undefined) =>
    typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
  const intentDraft = logic?.intents.find(
    (item) => item.intentKey === selectedIntent,
  );
  const replyDraft = logic?.replyTemplates.find(
    (item) => item.templateKey === selectedReply,
  );
  const workflowDraft = logic?.workflowPolicies.find(
    (item) => item.goalKey === selectedWorkflow,
  );

  return (
    <section
      className={`orders-page settings-list-page customer-faq-page${
        mobileChatOpen ? " customer-faq-mobile-chat-open" : ""
      }`}
    >
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("navigation.promotion")}</span>
          <h1>{t("settings.customerFaq.title")}</h1>
          <p>{t("settings.customerFaq.description")}</p>
        </div>
      </header>
      <div className="customer-faq-auto-reply-controls">
        <div className="customer-faq-auto-reply-topbar">
          <label className="customer-faq-auto-reply-switch">
            <span>{t("settings.customerFaq.botControlTitle")}</span>
            <Switch
              checked={Boolean(controls?.botEnabled)}
              disabled={!canEdit || savingControls || !controls}
              aria-label={t("settings.customerFaq.botEnabled")}
              onCheckedChange={(checked) =>
                void saveControls({ enabled: checked })
              }
            />
            <small data-enabled={Boolean(controls?.botEnabled)}>
              {controls?.botEnabled
                ? t("settings.customerFaq.botRunning")
                : t("settings.customerFaq.botPaused")}
            </small>
          </label>
          <div className="customer-faq-auto-reply-actions">
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openLogic()}
              >
                <Settings2 />
                <span>{t("settings.customerFaq.logicButton")}</span>
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={openInsights}>
              <BarChart3 />
              <span>AI 成效報告</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openReviewQueue}>
              <CheckCheck />
              <span>人工覆核學習</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="customer-faq-mobile-chat-trigger"
              onClick={() => setMobileChatOpen(true)}
            >
              <MessageCircleMore />
              <span>{t("settings.customerFaq.previewTitle")}</span>
            </Button>
          </div>
        </div>
        <div className="customer-faq-auto-reply-schedule">
          <span>{t("settings.customerFaq.autoReplyWindow")}</span>
          <div className="customer-faq-auto-reply-schedule-grid">
            <AutoReplyScheduleEditor
              id="weekday-auto-reply"
              dayLabel={t("settings.customerFaq.weekdayAutoReplyWindow")}
              start={controls?.weekdayAutoReplyStart ?? "19:00"}
              end={controls?.weekdayAutoReplyEnd ?? "09:00"}
              startLabel={t("settings.customerFaq.weekdayAutoReplyStart")}
              endLabel={t("settings.customerFaq.weekdayAutoReplyEnd")}
              disabled={!canEdit || savingControls || !controls}
              onStartChange={(weekdayAutoReplyStart) =>
                setControls((current) =>
                  current ? { ...current, weekdayAutoReplyStart } : current,
                )
              }
              onEndChange={(weekdayAutoReplyEnd) =>
                setControls((current) =>
                  current ? { ...current, weekdayAutoReplyEnd } : current,
                )
              }
              onStartCommit={(weekdayStart) =>
                void saveControls({ weekdayStart })
              }
              onEndCommit={(weekdayEnd) => void saveControls({ weekdayEnd })}
            />
            <AutoReplyScheduleEditor
              id="saturday-auto-reply"
              dayLabel={t("settings.customerFaq.saturdayAutoReplyWindow")}
              start={controls?.saturdayAutoReplyStart ?? "00:00"}
              end={controls?.saturdayAutoReplyEnd ?? "00:00"}
              startLabel={t("settings.customerFaq.saturdayAutoReplyStart")}
              endLabel={t("settings.customerFaq.saturdayAutoReplyEnd")}
              disabled={!canEdit || savingControls || !controls}
              onStartChange={(saturdayAutoReplyStart) =>
                setControls((current) =>
                  current ? { ...current, saturdayAutoReplyStart } : current,
                )
              }
              onEndChange={(saturdayAutoReplyEnd) =>
                setControls((current) =>
                  current ? { ...current, saturdayAutoReplyEnd } : current,
                )
              }
              onStartCommit={(saturdayStart) =>
                void saveControls({ saturdayStart })
              }
              onEndCommit={(saturdayEnd) =>
                void saveControls({ saturdayEnd })
              }
            />
            <AutoReplyScheduleEditor
              id="sunday-auto-reply"
              dayLabel={t("settings.customerFaq.sundayAutoReplyWindow")}
              start={controls?.sundayAutoReplyStart ?? "00:00"}
              end={controls?.sundayAutoReplyEnd ?? "00:00"}
              startLabel={t("settings.customerFaq.sundayAutoReplyStart")}
              endLabel={t("settings.customerFaq.sundayAutoReplyEnd")}
              disabled={!canEdit || savingControls || !controls}
              onStartChange={(sundayAutoReplyStart) =>
                setControls((current) =>
                  current ? { ...current, sundayAutoReplyStart } : current,
                )
              }
              onEndChange={(sundayAutoReplyEnd) =>
                setControls((current) =>
                  current ? { ...current, sundayAutoReplyEnd } : current,
                )
              }
              onStartCommit={(sundayStart) =>
                void saveControls({ sundayStart })
              }
              onEndCommit={(sundayEnd) => void saveControls({ sundayEnd })}
            />
          </div>
        </div>
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
                  <th>{t("settings.customerFaq.columns.answer")}</th>
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
                  <td className="customer-faq-answer-cell">{faq.answer}</td>
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
          <label className="customer-faq-preview-phone">
            <span>{t("settings.customerFaq.previewPhone")}</span>
            <input
              type="tel"
              inputMode="tel"
              value={previewPhone}
              disabled={previewing}
              aria-label={t("settings.customerFaq.previewPhone")}
              onChange={(event) => changePreviewPhone(event.target.value)}
              placeholder={t("settings.customerFaq.previewPhonePlaceholder")}
              autoComplete="off"
            />
            <small>{t("settings.customerFaq.previewPhoneHint")}</small>
          </label>
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
                        <p>{renderCustomerFaqChatText(message.text)}</p>
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
                          {message.trace ? (
                            <PreviewTracePopover trace={message.trace} />
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
                      {message.role === "assistant" &&
                      message.relatedFaqs?.length ? (
                        <div
                          className="customer-faq-related-suggestions"
                          aria-label={t(
                            "settings.customerFaq.previewRelatedLabel",
                          )}
                        >
                          <span className="customer-faq-related-heading">
                            {t("settings.customerFaq.previewRelatedLabel")}
                          </span>
                          {message.relatedFaqs.map((faq) => (
                            <button
                              key={faq.id}
                              type="button"
                              className="customer-faq-related-chip"
                              disabled={previewing}
                              onClick={() => {
                                void sendPreviewText(faq.question);
                              }}
                            >
                              {faq.question}
                            </button>
                          ))}
                        </div>
                      ) : null}
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
        title="AI 成效報告"
        description="每日報告會分析前一日 WhatsApp 對話，包括客服同事的真人回覆；此處亦可重新分析指定日期。"
        onClose={() => setInsightsOpen(false)}
        closeLabel={t("common.close")}
        className="customer-service-insights-panel"
        headerActions={
          <div className="customer-service-report-header-actions">
            <label>
              <span>
                <CalendarDays aria-hidden="true" />
                報告日期
              </span>
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
              {generatingReport ? "分析中…" : "重新分析"}
            </Button>
          </div>
        }
      >
        <div className="customer-service-insights">
          {insightsError ? (
            <p className="orders-state-error" role="alert">
              {insightsError}
            </p>
          ) : null}

          <section
            className={`customer-service-health-summary${
              reportNeedsAttention ? " needs-attention" : ""
            }`}
          >
            <div className="customer-service-health-status">
              <span className="customer-service-health-icon">
                {reportNeedsAttention ? <X /> : <CheckCheck />}
              </span>
              <div>
                <h3>
                  {insightsLoading
                    ? "正在整理報告"
                    : reportNeedsAttention
                      ? "有項目需要關注"
                      : "系統運作正常"}
                </h3>
                <p>
                  {insightsLoading
                    ? "正在載入最新客服成效與發送狀態。"
                    : reportNeedsAttention
                      ? "請查看下方的發送異常或疑似錯誤轉人工。"
                      : "目前沒有待處理或發送失敗的 WhatsApp 回覆。"}
                </p>
                <small>
                  {latestReport
                    ? `報告 ${latestReport.reportDate} · ${latestReport.environment} · ${latestReport.status}`
                    : "尚未產生每日報告"}
                </small>
              </div>
            </div>

            <div className="customer-service-headline-metrics">
              <div>
                <MessageCircleMore aria-hidden="true" />
                <span>
                  <span>收到問題</span>
                  <strong>{latestReport?.metrics.received ?? 0}</strong>
                </span>
              </div>
              <div>
                <CheckCheck aria-hidden="true" />
                <span>
                  <span>成功率</span>
                  <strong>{formatRate(latestReport?.metrics.success_rate)}</strong>
                </span>
              </div>
              <div>
                <X aria-hidden="true" />
                <span>
                  <span>失敗</span>
                  <strong>{latestReport?.metrics.failed ?? 0}</strong>
                </span>
              </div>
              <div>
                <UserRound aria-hidden="true" />
                <span>
                  <span>真人接手</span>
                  <strong>{latestReport?.metrics.handoff ?? 0}</strong>
                </span>
              </div>
            </div>

            <aside className="customer-service-ai-summary">
              <Sparkles aria-hidden="true" />
              <div>
                <strong>AI 摘要</strong>
                <p>
                  {latestReport?.aiSummary ||
                    "產生報告後，這裡會總結當日表現與需要留意的項目。"}
                </p>
              </div>
            </aside>
          </section>

          <div className="customer-service-insights-primary-grid">
            <section className="customer-service-review-queue customer-service-delivery-queue">
              <header>
                <div>
                  <h3 className="customer-service-section-title">
                    <span><Send /></span>
                    WhatsApp 發送追蹤
                  </h3>
                  <p>查看排隊、發送失敗及已停止重試的客服回覆。</p>
                </div>
                <span className="status-badge neutral">
                  {actionableOutboundMessages.length}
                </span>
              </header>
              <div className="customer-service-delivery-counts" aria-label="發送狀態摘要">
                <span>待發送 {actionableOutboundMessages.filter((item) => ["queued", "sending"].includes(item.status)).length}</span>
                <span>發送失敗 {outboundMessages.filter((item) => item.status === "failed").length}</span>
                <span>已停止重試 {outboundMessages.filter((item) => item.status === "dead").length}</span>
              </div>
              <div className="customer-service-delivery-list">
                {actionableOutboundMessages.map((message) => (
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
                {actionableOutboundMessages.length === 0 ? (
                  <div className="customer-service-empty-state">
                    <span><Send aria-hidden="true" /></span>
                    <strong>目前沒有待處理的訊息</strong>
                    <p>所有 WhatsApp 回覆已順利發送。</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadInsights()}>
                      <RefreshCw />
                      重新整理
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

          <section className="customer-service-suggestions">
            <header>
              <div>
                <h3 className="customer-service-section-title">
                  <span><Sparkles /></span>
                  AI 學習建議
                </h3>
                <p>與現有已發布 FAQ 完全一致的低風險問法會自動加入關鍵字；其他建議需人工確認。請先核對下方的完整內容；批准後會立即更新客服使用的答案或設定。</p>
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
                {suggestion.suggestionType === "faq" ? (
                  <dl>
                    <dt>問題</dt><dd>{suggestion.proposedContent.question || "尚欠問題"}</dd>
                    <dt>答案</dt><dd style={{ whiteSpace: "pre-wrap" }}>{suggestion.proposedContent.answer || "尚欠答案"}</dd>
                    <dt>關鍵字</dt><dd>{suggestion.proposedContent.keywords || "無"}</dd>
                  </dl>
                ) : suggestion.proposedContent.runtime_changes?.map((change, index) => (
                  <section key={index} aria-label="建議設定變更">
                    <p>{LEARNING_TARGET_LABELS[change.target] || change.target}：{change.key}</p>
                    <dl>{Object.entries(change.patch || {}).map(([field, value]) => (
                      <div key={field}>
                        <dt>{LEARNING_FIELD_LABELS[field] || field}</dt>
                        <dd style={{ whiteSpace: "pre-wrap" }}>{learningValue(value)}</dd>
                      </div>
                    ))}</dl>
                  </section>
                ))}
                {!hasCompleteLearningProposal(suggestion) && (
                  <p>建議內容尚未完整，暫時無法批准。</p>
                )}
                <footer>
                  <span>證據 {suggestion.evidenceCount} 條</span>
                  {canEdit ? (
                    <div>
                      <Button
                        size="sm"
                        disabled={reviewingSuggestion === suggestion.id || !hasCompleteLearningProposal(suggestion)}
                        onClick={() =>
                          void reviewSuggestion(suggestion.id, "approved")
                        }
                      >
                        <Check />
                        {suggestion.suggestionType === "faq" ? "批准並發布" : "批准並套用"}
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
            {suggestions.length === 0 ? (
              <div className="customer-service-empty-state">
                <span><Sparkles aria-hidden="true" /></span>
                <strong>目前沒有新的學習建議</strong>
                <p>系統會持續分析對話，有可優化內容時會顯示在這裡。</p>
              </div>
            ) : null}
          </section>
          </div>

          <details className="customer-service-metrics-details" open>
            <summary>
              <div>
                <h3 className="customer-service-section-title">
                  <span><BarChart3 /></span>
                  詳細成效指標
                </h3>
                <p>查看完整的營運與回覆品質數據。</p>
              </div>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="customer-service-secondary-metrics">
              <div>
                <span>未能回答</span>
                <strong>{latestReport?.metrics.unanswered ?? 0}</strong>
              </div>
              <div>
                <span>發送成功率</span>
                <strong>{formatRate(latestReport?.metrics.send_success_rate)}</strong>
              </div>
              <div>
                <span>自動檢查通過率</span>
                <strong>{formatRate(latestReport?.metrics.automatic_success_rate)}</strong>
              </div>
              <div>
                <span>有資料依據</span>
                <strong>{formatRate(latestReport?.metrics.grounded_rate)}</strong>
              </div>
              <div>
                <span>疑似錯誤轉人工</span>
                <strong>{latestReport?.metrics.wrong_handoff_count ?? 0}</strong>
              </div>
            </div>
          </details>

          <details className="customer-service-model-lab">
            <summary>
              <div>
                <h3 className="customer-service-section-title">
                  <span><Settings2 /></span>
                  模型與 Prompt 實驗室
                </h3>
                <p>候選配置完成歷史評測後才能發布到 develop。</p>
              </div>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="customer-service-model-lab-content">
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
                        ? `評測：${latestRun.status} · 樣本 ${latestRun.sampleSize} · 一致率 ${formatRate(latestRun.metrics.agreement_rate)} · 意圖 ${formatRate(latestRun.metrics.intent_accuracy)} · 對話動作 ${formatRate(latestRun.metrics.dialog_action_accuracy)}${
                            typeof latestRun.comparison.agreement_rate_delta === "number"
                              ? ` · 較基準 ${latestRun.comparison.agreement_rate_delta >= 0 ? "+" : ""}${Math.round(latestRun.comparison.agreement_rate_delta * 100)}%`
                              : ""
                          }`
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
            </div>
          </details>
        </div>
      </SidePanel>

      <SidePanel
        open={reviewOpen}
        title="人工覆核學習"
        description="逐項判斷 AI 回覆；如有錯誤，只需簡述修正方向，毋須撰寫完整答案。"
        onClose={() => setReviewOpen(false)}
        closeLabel={t("common.close")}
        className="customer-service-review-panel side-panel-majority"
      >
        <div className="customer-service-review-workspace">
          {reviewError ? (
            <p className="orders-state-error" role="alert">
              {reviewError}
            </p>
          ) : null}
          <ListTable
            header={
              <tr>
                <th>時間／分類</th>
                <th>客戶問題</th>
                <th>AI 回覆</th>
                <th>修正方向</th>
                <th aria-label="操作">判斷</th>
              </tr>
            }
            loading={reviewLoading}
            loadingLabel="載入人工覆核資料"
            skeletonColumns={[
              { width: "9rem" },
              { width: "19%" },
              { width: "28%" },
              { width: "28%" },
              { width: "12rem", variant: "action" },
            ]}
            skeletonRows={8}
            className="customer-service-review-table-wrap"
            tableClassName="customer-service-review-table"
            onRefresh={loadReviewQueue}
          >
            {reviewTurns.map((turn) => (
              <tr key={turn.id}>
                <td className="customer-service-review-meta">
                  <time dateTime={turn.createdAt}>
                    {new Date(turn.createdAt).toLocaleString("zh-HK")}
                  </time>
                  <span>{turn.intent || turn.route || turn.processingStatus}</span>
                </td>
                <td className="customer-service-review-question">{turn.question}</td>
                <td className="customer-service-review-answer">
                  {turn.answer || "（沒有回覆）"}
                </td>
                <td>
                  {canEdit ? (
                    <textarea
                      rows={3}
                      aria-label={`修正方向：${turn.question}`}
                      value={feedbackDrafts[turn.id] || ""}
                      placeholder={t("settings.customerFaq.reviewCorrectionPlaceholder")}
                      onChange={(event) =>
                        setFeedbackDrafts((current) => ({
                          ...current,
                          [turn.id]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <span className="customer-service-review-muted">只讀</span>
                  )}
                </td>
                <td className="customer-service-review-actions">
                  {canEdit ? (
                    <div>
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
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!reviewLoading && reviewTurns.length === 0 ? (
              <tr>
                <td colSpan={5} className="customer-service-review-empty">
                  目前沒有待覆核回覆。
                </td>
              </tr>
            ) : null}
          </ListTable>
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
        {intentDraft && replyDraft && workflowDraft ? (
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
              <h3>流程策略</h3>
              <label className="ingredients-field">
                <span>流程</span>
                <FilterableSelect
                  value={selectedWorkflow}
                  onChange={(event) =>
                    setSelectedWorkflow(event.target.value as CustomerServiceWorkflowPolicy["goalKey"])
                  }
                >
                  {logic?.workflowPolicies.map((workflow) => (
                    <option key={workflow.goalKey} value={workflow.goalKey}>
                      {workflow.displayName}
                    </option>
                  ))}
                </FilterableSelect>
              </label>
              <label className="ingredients-field">
                <span>流程指引</span>
                <textarea
                  rows={5}
                  value={workflowDraft.instructions}
                  onChange={(event) => patchWorkflow({ instructions: event.target.value })}
                />
              </label>
              <label className="ingredients-field">
                <span>帶入最近對話數量</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={workflowDraft.contextWindow}
                  onChange={(event) => patchWorkflow({ contextWindow: Number(event.target.value) })}
                />
              </label>
              <label className="ingredients-field">
                <span>低於此信心時追問</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={workflowDraft.clarificationThreshold}
                  onChange={(event) => patchWorkflow({ clarificationThreshold: Number(event.target.value) })}
                />
              </label>
              <div className="dictionary-active-field">
                <span>完成後恢復上一個任務</span>
                <Switch
                  checked={workflowDraft.autoResume}
                  onCheckedChange={(autoResume) => patchWorkflow({ autoResume })}
                />
              </div>
              <div className="dictionary-active-field">
                <span>啟用流程</span>
                <Switch
                  checked={workflowDraft.enabled}
                  onCheckedChange={(enabled) => patchWorkflow({ enabled })}
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
