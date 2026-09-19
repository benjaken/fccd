import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  ChartLine,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleQuestionMark,
  Database,
  Download,
  Ellipsis,
  ImagePlus,
  MessageCircleMore,
  ListTree,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Smile,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { CustomerServiceHistoryReplayPanel } from "@/components/settings/CustomerServiceHistoryReplayPanel";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { Modal } from "@/components/ui/modal";
import { TablePagination } from "@/components/ui/table-pagination";
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
  fetchCustomerServiceLearningSuggestionHistory,
  fetchCustomerServiceReviewTurns,
  fetchCustomerFaqs,
  fetchCustomerServiceControls,
  fetchCustomerServiceLearningImportSummary,
  fetchCustomerServiceLogic,
  importCustomerServiceHistory,
  previewCustomerServiceTurn,
  generateCustomerServiceDailyReport,
  reviewCustomerServiceLearningSuggestion,
  retryCustomerServiceOutboundMessage,
  rollbackCustomerServiceConfig,
  setCustomerServiceBotEnabled,
  setCustomerServiceConfigRag,
  submitCustomerServiceTurnFeedback,
  updateCustomerFaq,
  updateCustomerServiceIntent,
  updateCustomerServiceReplyTemplate,
  updateCustomerServiceWorkflowPolicy,
  type CustomerFaq,
  type CustomerFaqWriteInput,
  type CustomerServicePreviewConversation,
  type CustomerServicePreviewResult,
  type CustomerServiceTraceStatus,
  type CustomerServiceTraceStep,
  type CustomerServiceControls,
  type CustomerServiceIntentSetting,
  type CustomerServiceLogic,
  type CustomerServiceConfigVersion,
  type CustomerServiceRagFlags,
  type CustomerServiceDailyReport,
  type CustomerServiceOutboundMessage,
  type CustomerServiceEvaluationRun,
  type CustomerServiceLearningSuggestion,
  type CustomerServiceReviewTurn,
  type CustomerServiceReplyTemplate,
  type CustomerServiceWorkflowPolicy,
  type CustomerServiceImportDay,
  type CustomerServiceImportResult,
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
type LearningSuggestionState =
  | "pending"
  | "incomplete"
  | "approved"
  | "rejected";

function learningSuggestionState(
  suggestion: CustomerServiceLearningSuggestion,
): LearningSuggestionState {
  if (suggestion.status === "approved") return "approved";
  if (suggestion.status === "rejected") return "rejected";
  return hasCompleteLearningProposal(suggestion) ? "pending" : "incomplete";
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

function hongKongDateOffset(offsetDays = 0) {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const CUSTOMER_SERVICE_IMPORT_MAX_DAYS = 14;
const CUSTOMER_SERVICE_LEARN_CONCURRENCY = 3;

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

const PREVIEW_IMAGE_MAX_EDGE = 1280;
const PREVIEW_IMAGE_MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/** Downscale a picked image to a small JPEG data URL for the preview request. */
async function fileToPreviewImageDataUrl(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("image_read_failed"));
    reader.onerror = () => reject(new Error("image_read_failed"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("image_decode_failed"));
    element.src = source;
  });
  const scale = Math.min(
    1,
    PREVIEW_IMAGE_MAX_EDGE / Math.max(image.width, image.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

const DEFAULT_PREVIEW_PHONE = "86 138 2874 7224";

const CUSTOMER_SERVICE_MODEL_OPTIONS = ["grok-4.3", "grok-4.5", "grok-4.6"];

const CUSTOMER_SERVICE_CONFIG_DEFAULTS = {
  label: "Develop candidate",
  model: "grok-4.3",
  fallbackModel: "grok-4.5",
  fallbackEnabled: true,
  escalationConfidence: 0.72,
  systemPrompt: "",
  temperature: 0.1,
  retrievalLimit: 3,
  ragConfig: {
    enableRagV2: false,
    enableQueryRewrite: false,
    enableGroundedClarification: false,
  } as CustomerServiceRagFlags,
};

function createCustomerServiceConfigDraft() {
  return {
    ...CUSTOMER_SERVICE_CONFIG_DEFAULTS,
    ragConfig: { ...CUSTOMER_SERVICE_CONFIG_DEFAULTS.ragConfig },
  };
}

function formatModelLabTimestamp(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ReportDelta = {
  text: string;
  dir: "up" | "down" | "flat";
};

function reportDelta(
  current?: number | null,
  previous?: number | null,
): ReportDelta {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return { text: "0%", dir: "flat" };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return { text: "0%", dir: "flat" };
  return {
    text: `${change > 0 ? "+" : "-"}${Math.abs(Math.round(change))}%`,
    dir: change > 0 ? "up" : "down",
  };
}

function ReportDeltaLine({
  current,
  previous,
}: {
  current?: number | null;
  previous?: number | null;
}) {
  const delta = reportDelta(current, previous);
  return (
    <span className={`cs-report-delta is-${delta.dir}`}>
      較前一日 {delta.text}
      {delta.dir === "up" ? " ↑" : delta.dir === "down" ? " ↓" : " —"}
    </span>
  );
}

function reportSummaryBullets(summary: string) {
  if (!summary) return [];
  return summary
    .split(/[\n。]+/)
    .map((line) => line.replace(/^[-•*・\d.、\s]+/, "").trim())
    .filter(Boolean)
    .map((line) => (line.endsWith("。") ? line : `${line}。`))
    .slice(0, 8);
}

function attentionTag(title: string) {
  if (/價格|價錢|收費|費用|報價/.test(title)) return "知識庫待補";
  if (/追問|重複|多次|未解決|釐清|來回/.test(title)) return "需優化回覆";
  return "建議檢視";
}

function ModelLabHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cs-model-help-btn"
          aria-label={text}
          onClick={(event) => event.preventDefault()}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <CircleQuestionMark className="cs-model-help" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="cs-model-help-popover"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

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
  imageUrl?: string;
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
  failureReason: string | null;
  steps: CustomerServiceTraceStep[];
};

type TraceStepView = {
  key: string;
  label: string;
  summary: string;
  detail: string;
  code: string | null;
  status: CustomerServiceTraceStatus;
};

const TRACE_STAGE_NAMES = [
  "input",
  "load",
  "guard",
  "classify_rule",
  "classify_ai",
  "classify_decision",
  "classify",
  "pilot",
  "route",
  "vision",
  "media_route",
  "reply",
  "effects",
  "result",
] as const;

type Translator = ReturnType<typeof useTranslation>["t"];

function formatTraceParams(params: CustomerServiceTraceStep["params"]) {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" · ");
}

function traceStageLabel(stage: string, t: Translator) {
  return (TRACE_STAGE_NAMES as readonly string[]).includes(stage)
    ? t(`settings.customerFaq.previewTraceStage_${stage}`)
    : stage;
}

function TraceStatusIcon({ status }: { status: CustomerServiceTraceStatus }) {
  if (status === "failed") return <X aria-hidden="true" />;
  if (status === "warn") return <AlertTriangle aria-hidden="true" />;
  if (status === "skipped") return <Minus aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

function buildTraceSteps(
  trace: PreviewExecutionTrace,
  t: Translator,
): TraceStepView[] {
  if (trace.steps.length) {
    return trace.steps.map((step, index) => {
      const params = formatTraceParams(step.params);
      return {
        key: `${index}-${step.stage}-${step.code ?? ""}`,
        label: traceStageLabel(step.stage, t),
        summary: step.code
          ? params
            ? `${step.code} · ${params}`
            : step.code
          : params,
        detail: t(`settings.customerFaq.previewTraceStatus_${step.status}`),
        code: step.code,
        status: step.status,
      };
    });
  }
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
  return [
    {
      key: "request",
      label: t("settings.customerFaq.previewTraceRequest"),
      summary: t("settings.customerFaq.previewTraceRequestSummary"),
      detail: t("settings.customerFaq.previewTraceRequestDetail"),
      code: null,
      status: "ok" as const,
    },
    {
      key: "intent",
      label: `${t("settings.customerFaq.previewTraceIntent")}：${
        trace.intentKey || t("settings.customerFaq.previewTraceUnknown")
      }`,
      summary: trace.confidence === undefined
        ? source
        : `${source} · ${t("settings.customerFaq.previewTraceConfidence", {
          value: `${Math.round(trace.confidence * 100)}%`,
        })}`,
      detail: t("settings.customerFaq.previewTraceIntentDetail"),
      code: null,
      status: "ok" as const,
    },
    {
      key: "route",
      label: t("settings.customerFaq.previewTraceRoute"),
      summary: trace.toolKeys.length
        ? trace.toolKeys.join(" → ")
        : t("settings.customerFaq.previewTraceRouteNone"),
      detail: t("settings.customerFaq.previewTraceRouteDetail"),
      code: null,
      status: "ok" as const,
    },
    {
      key: "state",
      label: t("settings.customerFaq.previewTraceState"),
      summary: `${trace.stateBefore} → ${trace.stateAfter}`,
      detail: trace.stateBefore === trace.stateAfter
        ? t("settings.customerFaq.previewTraceStateUnchanged")
        : t("settings.customerFaq.previewTraceStateChanged"),
      code: null,
      status: "ok" as const,
    },
    {
      key: "result",
      label: t("settings.customerFaq.previewTraceResult"),
      summary: trace.replyGenerated
        ? t("settings.customerFaq.previewTraceReplyGenerated")
        : t("settings.customerFaq.previewTraceReplySilent"),
      detail: effects.length
        ? t("settings.customerFaq.previewTraceEffects", {
          effects: effects.join("、"),
        })
        : t("settings.customerFaq.previewTraceNoEffects"),
      code: null,
      status: "ok" as const,
    },
  ];
}

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

  const steps = buildTraceSteps(trace, t);
  const firstFailure = steps.find((step) => step.status === "failed");

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
        {firstFailure ? (
          <div className="customer-faq-trace-failure" role="alert">
            <AlertTriangle aria-hidden="true" />
            <span>
              {t("settings.customerFaq.previewTraceFailureAt", {
                stage: firstFailure.label,
                code: firstFailure.code || firstFailure.summary ||
                  t("settings.customerFaq.previewTraceFailureUnknown"),
              })}
            </span>
          </div>
        ) : null}
        <ol>
          {steps.map((step, index) => (
            <li key={step.key} className={`is-${step.status}`}>
              <span className="customer-faq-trace-marker" aria-hidden="true">
                <TraceStatusIcon status={step.status} />
              </span>
              <div>
                <strong>{step.label}</strong>
                {step.summary ? <p>{step.summary}</p> : null}
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

type CustomerFaqSection =
  | "faq"
  | "logic"
  | "insights"
  | "learning"
  | "history"
  | "replay"
  | "review"
  | "model";

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
    image?: string;
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
  const [previewImage, setPreviewImage] = useState("");
  const [previewImageError, setPreviewImageError] = useState("");
  const previewChatRef = useRef<HTMLDivElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const previewFileInputRef = useRef<HTMLInputElement>(null);
  const isMobileFaq = useMediaQuery("(max-width: 760px)");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<CustomerFaqSection>("faq");
  const [logic, setLogic] = useState<CustomerServiceLogic | null>(null);
  const [logicLoading, setLogicLoading] = useState(false);
  const [logicSaving, setLogicSaving] = useState(false);
  const [logicError, setLogicError] = useState("");
  const [reports, setReports] = useState<CustomerServiceDailyReport[]>([]);
  const [outboundMessages, setOutboundMessages] = useState<CustomerServiceOutboundMessage[]>([]);
  const [outboundFilter, setOutboundFilter] = useState<"queued" | "failed" | "dead">("queued");
  const [suggestions, setSuggestions] = useState<
    CustomerServiceLearningSuggestion[]
  >([]);
  const [reviewedSuggestions, setReviewedSuggestions] = useState<
    CustomerServiceLearningSuggestion[]
  >([]);
  const [suggestionSearch, setSuggestionSearch] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState<
    "all" | "pending" | "incomplete" | "approved" | "rejected"
  >("all");
  const [suggestionPage, setSuggestionPage] = useState(1);
  const [reviewTurns, setReviewTurns] = useState<CustomerServiceReviewTurn[]>(
    [],
  );
  const [reviewPage, setReviewPage] = useState(1);
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
  const [importSince, setImportSince] = useState(() => hongKongDateOffset(-90));
  const [importUntil, setImportUntil] = useState(hongKongDateOffset);
  const [importBusy, setImportBusy] = useState(false);
  const [learningDates, setLearningDates] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState<CustomerServiceImportResult | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importError, setImportError] = useState("");
  const [importStats, setImportStats] = useState({
    batches: 0,
    phonesProcessed: 0,
    messagesImported: 0,
    phonesTotal: 0,
  });
  const [importDays, setImportDays] = useState<CustomerServiceImportDay[]>([]);
  const [importDaysPage, setImportDaysPage] = useState(1);
  const [reviewingSuggestion, setReviewingSuggestion] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {},
  );
  const [reviewingTurn, setReviewingTurn] = useState("");
  const [configBusy, setConfigBusy] = useState("");
  const [outboundBusy, setOutboundBusy] = useState("");
  const [configDraft, setConfigDraft] = useState(createCustomerServiceConfigDraft);

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

  const selectPreviewImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreviewImageError("");
    if (!file.type.startsWith("image/")) {
      setPreviewImageError(t("settings.customerFaq.previewImageError"));
      return;
    }
    if (file.size > PREVIEW_IMAGE_MAX_SOURCE_BYTES) {
      setPreviewImageError(t("settings.customerFaq.previewImageError"));
      return;
    }
    try {
      setPreviewImage(await fileToPreviewImageDataUrl(file));
    } catch {
      setPreviewImageError(t("settings.customerFaq.previewImageError"));
    }
  };

  const sendPreviewText = async (rawText: string, image?: string) => {
    const text = rawText.trim();
    const pendingImage = image ?? "";
    if ((!text && !pendingImage) || previewing) return;
    const messageId = Date.now();
    const stateBefore = previewConversation?.state ?? "identifying";
    setPreviewMessages((current) => [
      ...current,
      {
        id: messageId,
        role: "user",
        text: text || t("settings.customerFaq.previewImageReady"),
        imageUrl: pendingImage || undefined,
      },
    ]);
    setPreviewQuery("");
    setPreviewImage("");
    setPreviewImageError("");
    setPreviewing(true);
    setPreviewError("");
    try {
      const result = await previewTurn({
        text,
        image: pendingImage || undefined,
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
            failureReason: result.failureReason ?? null,
            steps: result.trace ?? [],
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
    await sendPreviewText(previewQuery, previewImage);
  };

  const resetPreview = () => {
    setPreviewMessages([]);
    setPreviewConversation(null);
    setPreviewError("");
    setPreviewQuery("");
    setPreviewImage("");
    setPreviewImageError("");
  };

  const changePreviewPhone = (value: string) => {
    if (value === previewPhone) return;
    setPreviewPhone(value);
    setPreviewMessages([]);
    setPreviewConversation(null);
    setPreviewError("");
    setPreviewQuery("");
    setPreviewImage("");
    setPreviewImageError("");
  };

  const openLogic = async () => {
    setLogicLoading(true);
    setLogicError("");
    try {
      const next = await loadLogic();
      setLogic(next);
    } catch {
      setLogicError(t("settings.customerFaq.logicLoadError"));
    } finally {
      setLogicLoading(false);
    }
  };

  const patchIntent = (
    intentKey: string,
    patch: Partial<CustomerServiceIntentSetting>,
  ) => {
    setLogic((current) =>
      current
        ? {
            ...current,
            intents: current.intents.map((intent) =>
              intent.intentKey === intentKey ? { ...intent, ...patch } : intent,
            ),
          }
        : current,
    );
  };

  const patchReply = (
    templateKey: string,
    patch: Partial<CustomerServiceReplyTemplate>,
  ) => {
    setLogic((current) =>
      current
        ? {
            ...current,
            replyTemplates: current.replyTemplates.map((reply) =>
              reply.templateKey === templateKey ? { ...reply, ...patch } : reply,
            ),
          }
        : current,
    );
  };

  const patchWorkflow = (
    goalKey: string,
    patch: Partial<CustomerServiceWorkflowPolicy>,
  ) => {
    setLogic((current) => current
      ? {
          ...current,
          workflowPolicies: current.workflowPolicies.map((workflow) =>
            workflow.goalKey === goalKey ? { ...workflow, ...patch } : workflow,
          ),
        }
      : current);
  };

  const saveLogic = async () => {
    if (!logic || logicSaving) return;
    if (
      logic.intents.some((item) => !item.description.trim()) ||
      logic.replyTemplates.some((item) => !item.content.trim())
    ) {
      setLogicError(t("settings.customerFaq.logicValidation"));
      return;
    }
    setLogicSaving(true);
    setLogicError("");
    try {
      await Promise.all([
        ...logic.intents.map((intent) => saveIntent(intent)),
        ...logic.replyTemplates.map((reply) => saveReplyTemplate(reply)),
        ...logic.workflowPolicies.map((workflow) => saveWorkflowPolicy(workflow)),
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
        nextReviewedSuggestions,
        nextConfigs,
        nextRuns,
        nextOutbound,
        nextImportDays,
      ] = await Promise.all([
        fetchCustomerServiceDailyReports(),
        fetchCustomerServiceLearningSuggestions(),
        fetchCustomerServiceLearningSuggestionHistory(),
        fetchCustomerServiceConfigVersions("develop"),
        fetchCustomerServiceEvaluationRuns(),
        fetchCustomerServiceOutboundMessages(),
        fetchCustomerServiceLearningImportSummary(),
      ]);
      setReports(nextReports);
      setSuggestions(nextSuggestions);
      setReviewedSuggestions(nextReviewedSuggestions);
      setConfigVersions(nextConfigs);
      setEvaluationRuns(nextRuns);
      setOutboundMessages(nextOutbound);
      setImportDays(nextImportDays);
    } catch {
      setInsightsError("載入客服成效及學習資料失敗。");
    } finally {
      setInsightsLoading(false);
    }
  };

  const selectSection = (section: CustomerFaqSection) => {
    setActiveSection(section);
    if (section === "logic") void openLogic();
    else if (section === "insights" || section === "model") void loadInsights();
    else if (section === "learning" || section === "history") void loadInsights();
    else if (section === "review") void openReviewQueue();
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
  const runHistoryImport = async () => {
    if (!canEdit || importBusy || learningDates) return;
    setImportBusy(true);
    setInsightsError("");
    setImportResult(null);
    setImportError("");
    setImportStats({
      batches: 0,
      phonesProcessed: 0,
      messagesImported: 0,
      phonesTotal: 0,
    });
    setImportDialogOpen(true);
    setImportProgress("正在向 WATI 取得歷史對話…");
    try {
      const result = await importCustomerServiceHistory({
        since: importSince ? `${importSince}T00:00:00+08:00` : undefined,
        until: importUntil
          ? new Date(
              new Date(`${importUntil}T00:00:00+08:00`).getTime() + 86_400_000,
            ).toISOString()
          : undefined,
        onProgress: (progress) => {
          setImportStats(progress);
          setImportProgress(
            `已處理 ${progress.phonesProcessed}${
              progress.phonesTotal ? ` / ${progress.phonesTotal}` : ""
            } 個對話，匯入 ${progress.messagesImported} 則訊息…`,
          );
        },
      });
      setImportResult(result);
      setImportDays(await fetchCustomerServiceLearningImportSummary());
    } catch {
      setImportError("匯入歷史對話失敗，請檢查 WATI 憑證及函式設定。");
    } finally {
      setImportProgress("");
      setImportBusy(false);
    }
  };
  const learnImportDates = async (dates: string[]) => {
    const targets = dates.filter(Boolean).slice(0, CUSTOMER_SERVICE_IMPORT_MAX_DAYS);
    if (!canEdit || learningDates || !targets.length) return;
    setLearningDates(true);
    setInsightsError("");
    let completed = 0;
    let failed = 0;
    let next = 0;
    const worker = async () => {
      while (next < targets.length) {
        const date = targets[next];
        next += 1;
        try {
          await generateCustomerServiceDailyReport(date);
        } catch {
          failed += 1;
        } finally {
          completed += 1;
          setImportProgress(
            `正在學習 ${date}（${completed}/${targets.length}）…`,
          );
        }
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(CUSTOMER_SERVICE_LEARN_CONCURRENCY, targets.length) },
          worker,
        ),
      );
      await loadInsights();
      if (failed) setInsightsError("產生學習建議時出錯，部分日期可能未完成。");
    } catch {
      setInsightsError("產生學習建議時出錯，部分日期可能未完成。");
    } finally {
      setImportProgress("");
      setLearningDates(false);
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
  const resetConfigDraft = () => setConfigDraft(createCustomerServiceConfigDraft());
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
  const saveRagFlags = async (id: string, ragConfig: CustomerServiceRagFlags) => {
    if (!canEdit || configBusy) return;
    setConfigBusy(id);
    setInsightsError("");
    try {
      await setCustomerServiceConfigRag(id, ragConfig);
      setConfigVersions(await fetchCustomerServiceConfigVersions("develop"));
    } catch {
      setInsightsError(t("settings.customerFaq.ragSaveError"));
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
  const previousReport = latestReport
    ? reports.find((report) => report.reportDate < latestReport.reportDate)
    : undefined;
  const queuedOutboundMessages = outboundMessages.filter((item) =>
    ["queued", "sending"].includes(item.status),
  );
  const failedOnlyOutboundMessages = outboundMessages.filter(
    (item) => item.status === "failed",
  );
  const deadOutboundMessages = outboundMessages.filter(
    (item) => item.status === "dead",
  );
  const visibleOutboundMessages =
    outboundFilter === "failed"
      ? failedOnlyOutboundMessages
      : outboundFilter === "dead"
        ? deadOutboundMessages
        : queuedOutboundMessages;
  const attentionItems = (latestReport?.failureThemes ?? []).map(
    (theme, index) => {
      const title = theme.theme || theme.name || "需關注項目";
      return {
        id: `${latestReport?.reportDate ?? "report"}-${index}`,
        title,
        description: theme.explanation || "建議檢視此對話並採取相應行動。",
        count: Number(theme.count ?? 0),
        tag: attentionTag(title),
        code: `WA-${(latestReport?.reportDate ?? "").replace(/-/g, "")}-${String(
          index + 1,
        ).padStart(3, "0")}`,
      };
    },
  );
  const attentionCount = Number(
    latestReport?.metrics.wrong_handoff_count ?? attentionItems.length,
  );
  const previousAttentionCount = previousReport
    ? Number(previousReport.metrics.wrong_handoff_count ?? previousReport.failureThemes.length)
    : undefined;
  const summaryBullets = reportSummaryBullets(latestReport?.aiSummary ?? "");
  const successfulCount = Number(latestReport?.metrics.successful ?? 0);
  const evaluatedCount =
    successfulCount + Number(latestReport?.metrics.failed ?? 0);
  const handoffShare = latestReport?.metrics.received
    ? `${Math.round(
        (Number(latestReport.metrics.handoff) /
          Number(latestReport.metrics.received)) *
          100,
      )}%`
    : "—";
  const learnableImportDates = importDays
    .filter((day) => day.humanCount > 0)
    .slice(0, CUSTOMER_SERVICE_IMPORT_MAX_DAYS)
    .map((day) => day.date);
  const allLearningSuggestions = [...suggestions, ...reviewedSuggestions];
  const learningQuery = suggestionSearch.trim().toLowerCase();
  const filteredLearningSuggestions = allLearningSuggestions.filter((item) => {
    const state = learningSuggestionState(item);
    if (suggestionStatus !== "all" && state !== suggestionStatus) return false;
    if (!learningQuery) return true;
    const proposal = item.proposedContent;
    return [
      item.title,
      item.reason,
      proposal.question,
      proposal.answer,
      proposal.keywords,
    ].some((value) => (value ?? "").toLowerCase().includes(learningQuery));
  });
  const LEARNING_PAGE_SIZE = 10;
  const learningPageCount = Math.max(
    1,
    Math.ceil(filteredLearningSuggestions.length / LEARNING_PAGE_SIZE),
  );
  const currentLearningPage = Math.min(suggestionPage, learningPageCount);
  const visibleLearningSuggestions = filteredLearningSuggestions.slice(
    (currentLearningPage - 1) * LEARNING_PAGE_SIZE,
    currentLearningPage * LEARNING_PAGE_SIZE,
  );
  const IMPORT_DAYS_PAGE_SIZE = 15;
  const importDaysPageCount = Math.max(
    1,
    Math.ceil(importDays.length / IMPORT_DAYS_PAGE_SIZE),
  );
  const currentImportDaysPage = Math.min(importDaysPage, importDaysPageCount);
  const visibleImportDays = importDays.slice(
    (currentImportDaysPage - 1) * IMPORT_DAYS_PAGE_SIZE,
    currentImportDaysPage * IMPORT_DAYS_PAGE_SIZE,
  );
  const REVIEW_PAGE_SIZE = 10;
  const reviewPageCount = Math.max(
    1,
    Math.ceil(reviewTurns.length / REVIEW_PAGE_SIZE),
  );
  const currentReviewPage = Math.min(reviewPage, reviewPageCount);
  const visibleReviewTurns = reviewTurns.slice(
    (currentReviewPage - 1) * REVIEW_PAGE_SIZE,
    currentReviewPage * REVIEW_PAGE_SIZE,
  );
  const importPercent = importStats.phonesTotal
    ? Math.min(
        100,
        Math.round(
          (importStats.phonesProcessed / importStats.phonesTotal) * 100,
        ),
      )
    : 0;
  const formatRate = (value: number | null | undefined) =>
    typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
  return (
    <section
      className={`orders-page settings-list-page customer-faq-page${
        activeSection !== "faq" ? " customer-faq-page--section" : ""
      }${activeSection === "model" ? " customer-faq-page--model-lab" : ""}${
        activeSection === "insights" ? " customer-faq-page--insights" : ""
      }${activeSection === "learning" ? " customer-faq-page--learning" : ""}${
        activeSection === "history" ? " customer-faq-page--history" : ""
      }${activeSection === "review" ? " customer-faq-page--review" : ""}${
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
        <div className="customer-faq-controls-head">
        <div className="customer-faq-tabs">
          <SegmentedTabs<CustomerFaqSection>
            label="客服功能"
            value={activeSection}
            onChange={selectSection}
            tabs={[
              { value: "faq", label: "FAQ 知識庫" },
              { value: "logic", label: "客服邏輯" },
              { value: "insights", label: "AI 成效報告" },
              { value: "learning", label: "學習與覆核" },
              { value: "history", label: "歷史對話" },
              { value: "replay", label: "歷史回放" },
              { value: "review", label: "人工覆核" },
              { value: "model", label: "模型實驗室" },
            ]}
          />
        </div>
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

      {activeSection === "faq" ? (
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
                        {message.imageUrl ? (
                          <img
                            className="customer-faq-chat-message-image"
                            src={message.imageUrl}
                            alt={t("settings.customerFaq.previewImageReady")}
                          />
                        ) : null}
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
              {previewImage ? (
                <div className="customer-faq-chat-attachment">
                  <img
                    src={previewImage}
                    alt={t("settings.customerFaq.previewImageReady")}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("settings.customerFaq.previewRemoveImage")}
                    onClick={() => setPreviewImage("")}
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
              {previewImageError ? <p role="alert">{previewImageError}</p> : null}
              <form
                className="customer-faq-chat-composer"
                onSubmit={(event) => void runPreview(event)}
              >
                <input
                  ref={previewFileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => void selectPreviewImage(event)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("settings.customerFaq.previewAttachImage")}
                  disabled={previewing}
                  onClick={() => previewFileInputRef.current?.click()}
                >
                  <ImagePlus />
                </Button>
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
                  disabled={previewing || (!previewQuery.trim() && !previewImage)}
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
      ) : null}

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

      {activeSection !== "faq" ? (
      <div className="customer-faq-section-scroll">
      {activeSection === "insights" || activeSection === "learning" || activeSection === "history" || activeSection === "model" ? (
      <section className="customer-service-insights-panel">
        {activeSection === "insights" ? (
          <header className="customer-service-inline-header cs-report-toolbar">
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
          </header>
        ) : null}
        <div className="customer-service-insights">
          {insightsError ? (
            <p className="orders-state-error" role="alert">
              {insightsError}
            </p>
          ) : null}

          {activeSection === "insights" ? (
          <div className="cs-report-kpis">
            <article className="cs-report-kpi is-good">
              <span className="cs-report-kpi-icon">
                <MessageCircleMore aria-hidden="true" />
              </span>
              <span className="cs-report-kpi-label">收到問題</span>
              <strong className="cs-report-kpi-value">
                {latestReport?.metrics.received ?? 0}
              </strong>
              <ReportDeltaLine
                current={latestReport?.metrics.received}
                previous={previousReport?.metrics.received}
              />
              <span className="cs-report-kpi-foot">
                昨日 {previousReport?.metrics.received ?? 0}
              </span>
            </article>
            <article className="cs-report-kpi is-good">
              <span className="cs-report-kpi-icon">
                <CheckCheck aria-hidden="true" />
              </span>
              <span className="cs-report-kpi-label">成功率</span>
              <strong className="cs-report-kpi-value">
                {formatRate(latestReport?.metrics.success_rate)}
              </strong>
              <ReportDeltaLine
                current={latestReport?.metrics.success_rate}
                previous={previousReport?.metrics.success_rate}
              />
              <span className="cs-report-kpi-foot">
                成功回覆 {successfulCount} / {evaluatedCount}
              </span>
            </article>
            <article className="cs-report-kpi is-bad">
              <span className="cs-report-kpi-icon">
                <X aria-hidden="true" />
              </span>
              <span className="cs-report-kpi-label">失敗</span>
              <strong className="cs-report-kpi-value">
                {latestReport?.metrics.failed ?? 0}
              </strong>
              <ReportDeltaLine
                current={latestReport?.metrics.failed}
                previous={previousReport?.metrics.failed}
              />
              <span className="cs-report-kpi-foot">
                需要處理 {latestReport?.metrics.failed ?? 0}
              </span>
            </article>
            <article className="cs-report-kpi is-neutral">
              <span className="cs-report-kpi-icon">
                <UserRound aria-hidden="true" />
              </span>
              <span className="cs-report-kpi-label">真人接手</span>
              <strong className="cs-report-kpi-value">
                {latestReport?.metrics.handoff ?? 0}
              </strong>
              <ReportDeltaLine
                current={latestReport?.metrics.handoff}
                previous={previousReport?.metrics.handoff}
              />
              <span className="cs-report-kpi-foot">佔全部對話 {handoffShare}</span>
            </article>
            <article className="cs-report-kpi is-warn">
              <span className="cs-report-kpi-icon">
                <AlertTriangle aria-hidden="true" />
              </span>
              <span className="cs-report-kpi-label">有項目需要關注</span>
              <strong className="cs-report-kpi-value">{attentionCount}</strong>
              <ReportDeltaLine
                current={attentionCount}
                previous={previousAttentionCount}
              />
              <span className="cs-report-kpi-foot">
                需跟進的對話 {attentionCount}
              </span>
            </article>
            <aside className="cs-report-summary">
              <header>
                <Sparkles aria-hidden="true" />
                <strong>AI 摘要</strong>
              </header>
              {summaryBullets.length ? (
                <ul>
                  {summaryBullets.map((bullet, index) => (
                    <li key={index}>{bullet}</li>
                  ))}
                </ul>
              ) : (
                <p>產生報告後，這裡會總結當日表現與需要留意的項目。</p>
              )}
            </aside>
          </div>
          ) : null}

          {activeSection === "insights" ? (
          <div className="cs-report-grid">
            <section className="cs-report-card cs-report-delivery">
              <header className="cs-report-card-head">
                <div>
                  <h3 className="customer-service-section-title">
                    <span><Send /></span>
                    WhatsApp 發送追蹤
                  </h3>
                  <p>查看排隊、發送失敗及已停止重試的客服回覆。</p>
                </div>
              </header>
              <div className="cs-delivery-tabs" role="tablist" aria-label="發送狀態">
                <button
                  type="button"
                  className={outboundFilter === "queued" ? "is-active" : undefined}
                  onClick={() => setOutboundFilter("queued")}
                >
                  待發送 <b>{queuedOutboundMessages.length}</b>
                </button>
                <button
                  type="button"
                  className={outboundFilter === "failed" ? "is-active" : undefined}
                  onClick={() => setOutboundFilter("failed")}
                >
                  發送失敗 <b>{failedOnlyOutboundMessages.length}</b>
                </button>
                <button
                  type="button"
                  className={outboundFilter === "dead" ? "is-active" : undefined}
                  onClick={() => setOutboundFilter("dead")}
                >
                  已停止重試 <b>{deadOutboundMessages.length}</b>
                </button>
              </div>
              <div className="cs-delivery-list">
                {visibleOutboundMessages.map((message) => (
                  <article key={message.id} className="cs-delivery-item">
                    <small>
                      {message.phone} ·{" "}
                      {new Date(message.createdAt).toLocaleString("zh-HK")}
                    </small>
                    <strong>{message.body}</strong>
                    <p>
                      狀態：{message.status} · 嘗試 {message.attemptCount}/
                      {message.maxAttempts}
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
                {visibleOutboundMessages.length === 0 ? (
                  <div className="cs-delivery-empty">
                    <span className="cs-delivery-empty-icon">
                      <Send aria-hidden="true" />
                    </span>
                    <strong>目前沒有待處理的訊息</strong>
                    <p>
                      所有 WhatsApp 回覆已順利發送，
                      <br />
                      如有新的待發送訊息，會顯示在這裡。
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadInsights()}
                    >
                      <RefreshCw />
                      重新整理
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="cs-report-card cs-report-attention">
              <header className="cs-report-card-head">
                <div>
                  <h3 className="customer-service-section-title">
                    <span><AlertTriangle /></span>
                    需關注對話
                  </h3>
                  <p>以下為需要關注的對話，建議檢視並採取相應行動。</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => selectSection("learning")}
                >
                  查看全部
                </Button>
              </header>
              <div className="cs-attention-list">
                {attentionItems.map((item) => (
                  <article key={item.id} className="cs-attention-item">
                    <span className="cs-attention-icon">
                      <AlertTriangle aria-hidden="true" />
                    </span>
                    <div className="cs-attention-body">
                      <div className="cs-attention-title">
                        <strong>{item.title}</strong>
                        <span className="cs-attention-tag">{item.tag}</span>
                        <ChevronRight aria-hidden="true" />
                      </div>
                      <p>{item.description}</p>
                      <small>
                        對話時間{" "}
                        {formatModelLabTimestamp(
                          latestReport?.generatedAt ?? latestReport?.reportDate ?? "",
                        )}{" "}
                        | 對話編號 {item.code}
                      </small>
                    </div>
                  </article>
                ))}
                {attentionItems.length === 0 ? (
                  <div className="cs-delivery-empty">
                    <span className="cs-delivery-empty-icon">
                      <CheckCheck aria-hidden="true" />
                    </span>
                    <strong>目前沒有需要關注的對話</strong>
                    <p>系統運作正常，建議繼續維持現行設定。</p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
          ) : null}

          {activeSection === "learning" ? (
          <section className="panel cs-review-page">
            <header className="cs-review-toolbar">
              <ListSearchBar
                id="cs-review-search"
                value={suggestionSearch}
                onChange={setSuggestionSearch}
                onSubmit={() => setSuggestionPage(1)}
                label="搜尋學習建議"
                placeholder={t("settings.customerFaq.searchPlaceholder")}
                filters={
                  <label className="cs-review-filter-field">
                    <FilterableSelect
                      value={suggestionStatus}
                      onChange={(event) => {
                        setSuggestionStatus(
                          event.target.value as typeof suggestionStatus,
                        );
                        setSuggestionPage(1);
                      }}
                    >
                      <option value="all">全部狀態</option>
                      <option value="pending">待審核</option>
                      <option value="incomplete">需補充建議</option>
                      <option value="approved">已批准</option>
                      <option value="rejected">已忽略</option>
                    </FilterableSelect>
                  </label>
                }
              />
            </header>

            <div className="cs-review-table-card">
              <ListTable
                className="cs-review-table-scroll"
                tableClassName="cs-review-table"
                loading={insightsLoading}
                loadingLabel="載入學習建議"
                skeletonRows={6}
                skeletonColumns={[
                  { width: "90px" },
                  { width: "220px" },
                  { width: "40%" },
                  { width: "72px" },
                  { width: "236px", variant: "action" },
                ]}
                header={
                  <tr>
                    <th>類型</th>
                    <th>標題／原因</th>
                    <th>建議內容</th>
                    <th>證據</th>
                    <th>判斷</th>
                  </tr>
                }
              >
                  {visibleLearningSuggestions.map((suggestion) => {
                    const state = learningSuggestionState(suggestion);
                    const complete = hasCompleteLearningProposal(suggestion);
                    const reviewable = state === "pending" || state === "incomplete";
                    return (
                      <tr key={suggestion.id}>
                        <td>
                          <span className="status-badge neutral">
                            {suggestion.suggestionType.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <strong>{suggestion.title}</strong>
                          <p className="customer-service-suggestion-reason">{suggestion.reason}</p>
                        </td>
                        <td>
                          {suggestion.suggestionType === "faq" ? (
                            <dl className="customer-service-suggestion-detail">
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
                          {!complete ? (
                            <p>建議內容尚未完整，暫時無法批准。</p>
                          ) : null}
                        </td>
                        <td>{suggestion.evidenceCount} 條</td>
                        <td>
                          <div className="cs-review-row-actions">
                            {reviewable && canEdit ? (
                              <div className="customer-service-review-actions">
                                <Button
                                  size="sm"
                                  disabled={reviewingSuggestion === suggestion.id || !complete}
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
                            ) : (
                              <span className={`cs-review-state is-${state}`}>
                                {state === "approved"
                                  ? "已批准"
                                  : state === "rejected"
                                    ? "已忽略"
                                    : "需補充建議"}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!insightsLoading && visibleLearningSuggestions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="customer-service-review-empty">
                        目前沒有符合條件的學習建議。
                      </td>
                    </tr>
                  ) : null}
              </ListTable>
            </div>

            <TablePagination
              summary={t("settings.pagination", {
                from: filteredLearningSuggestions.length
                  ? (currentLearningPage - 1) * LEARNING_PAGE_SIZE + 1
                  : 0,
                to: Math.min(
                  currentLearningPage * LEARNING_PAGE_SIZE,
                  filteredLearningSuggestions.length,
                ),
                total: filteredLearningSuggestions.length,
              })}
              page={currentLearningPage}
              totalPages={learningPageCount}
              loading={insightsLoading}
              onPrevious={() =>
                setSuggestionPage(Math.max(1, currentLearningPage - 1))
              }
              onNext={() =>
                setSuggestionPage(
                  Math.min(learningPageCount, currentLearningPage + 1),
                )
              }
              onPageChange={setSuggestionPage}
              previousLabel={t("settings.previous")}
              nextLabel={t("settings.next")}
              pageLabel={t("settings.pageOf")}
              jumpLabel={t("settings.jumpToPage")}
            />
          </section>
          ) : null}

          {activeSection === "history" ? (
          <div className="cs-history-page">
            <section className="customer-service-import-lab">
              <h2 className="sr-only">歷史對話學習</h2>
              <div className="customer-service-import-controls">
                <label>
                  <span>起始日期</span>
                  <input
                    type="date"
                    value={importSince}
                    max={importUntil || undefined}
                    disabled={importBusy || learningDates}
                    onChange={(event) => setImportSince(event.target.value)}
                  />
                </label>
                <label>
                  <span>結束日期</span>
                  <input
                    type="date"
                    value={importUntil}
                    min={importSince || undefined}
                    disabled={importBusy || learningDates}
                    onChange={(event) => setImportUntil(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  disabled={!canEdit || importBusy || learningDates}
                  onClick={() => void runHistoryImport()}
                >
                  <Download />
                  {importBusy ? "匯入中…" : "匯入歷史對話"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || learningDates || !learnableImportDates.length}
                  onClick={() => void learnImportDates(learnableImportDates)}
                >
                  <Sparkles />
                  {learningDates ? "學習中…" : "一鍵學習最近日期"}
                </Button>
              </div>
            </section>
            <section className="customer-service-import-lab cs-history-days-card">
              <h2 className="sr-only">已匯入日期</h2>
              <div className="cs-history-days">
                <div className="cs-history-table-card">
                  <ListTable
                    className="cs-history-table-scroll"
                    tableClassName="cs-history-table"
                    loading={insightsLoading}
                    loadingLabel="載入歷史對話"
                    skeletonRows={6}
                    skeletonColumns={[
                      { width: "40%" },
                      { width: "40%" },
                      { width: "20%", variant: "action" },
                    ]}
                    header={
                      <tr>
                        <th>日期</th>
                        <th>訊息 / 真人</th>
                        <th>操作</th>
                      </tr>
                    }
                  >
                    {visibleImportDays.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>
                          訊息 {day.messageCount} · 真人 {day.humanCount}
                        </td>
                        <td className="cs-history-actions">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              !canEdit || learningDates || day.humanCount === 0
                            }
                            onClick={() => void learnImportDates([day.date])}
                          >
                            產生學習建議
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!insightsLoading && importDays.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="customer-service-review-empty">
                          尚未匯入任何歷史對話。選擇日期區間後按「匯入歷史對話」。
                        </td>
                      </tr>
                    ) : null}
                  </ListTable>
                </div>
                <TablePagination
                  summary={t("settings.pagination", {
                    from: importDays.length
                      ? (currentImportDaysPage - 1) * IMPORT_DAYS_PAGE_SIZE + 1
                      : 0,
                    to: Math.min(
                      currentImportDaysPage * IMPORT_DAYS_PAGE_SIZE,
                      importDays.length,
                    ),
                    total: importDays.length,
                  })}
                  page={currentImportDaysPage}
                  totalPages={importDaysPageCount}
                  loading={insightsLoading}
                  onPrevious={() =>
                    setImportDaysPage(Math.max(1, currentImportDaysPage - 1))
                  }
                  onNext={() =>
                    setImportDaysPage(
                      Math.min(importDaysPageCount, currentImportDaysPage + 1),
                    )
                  }
                  onPageChange={setImportDaysPage}
                  previousLabel={t("settings.previous")}
                  nextLabel={t("settings.next")}
                  pageLabel={t("settings.pageOf")}
                  jumpLabel={t("settings.jumpToPage")}
                />
              </div>
            </section>
          </div>
          ) : null}

          {activeSection === "insights" ? (
          <details className="cs-report-card cs-report-metrics" open>
            <summary className="cs-report-card-head">
              <div>
                <h3 className="customer-service-section-title">
                  <span><BarChart3 /></span>
                  詳細成效指標
                </h3>
                <p>查看完整的營運與回覆品質數據。</p>
              </div>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className="cs-metrics-grid">
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
          ) : null}

          {activeSection === "model" ? (
          <section className="customer-service-model-lab-page">
            {canEdit ? (
              <>
                <article className="cs-model-card">
                  <header className="cs-model-card-head">
                    <h3 className="customer-service-section-title">
                      <span><SlidersHorizontal /></span>
                      基本配置
                    </h3>
                  </header>
                  <div className="cs-model-grid">
                    <label className="cs-model-field">
                      <span className="cs-model-label">
                        配置名稱<em aria-hidden="true">*</em>
                      </span>
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
                    </label>
                    <label className="cs-model-field">
                      <span className="cs-model-label">
                        主模型<em aria-hidden="true">*</em>
                      </span>
                      <FilterableSelect
                        aria-label="模型名稱"
                        value={configDraft.model}
                        onChange={(event) =>
                          setConfigDraft((current) => ({
                            ...current,
                            model: event.target.value,
                          }))
                        }
                      >
                        {CUSTOMER_SERVICE_MODEL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </FilterableSelect>
                    </label>
                    <label className="cs-model-field">
                      <span className="cs-model-label">偏選模型</span>
                      <FilterableSelect
                        aria-label="備援模型"
                        value={configDraft.fallbackModel}
                        disabled={!configDraft.fallbackEnabled}
                        onChange={(event) =>
                          setConfigDraft((current) => ({
                            ...current,
                            fallbackModel: event.target.value,
                          }))
                        }
                      >
                        {CUSTOMER_SERVICE_MODEL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </FilterableSelect>
                    </label>
                    <label className="cs-model-field">
                      <span className="cs-model-label">
                        低信心升級門檻
                        <ModelLabHelp text="主模型信心低於此門檻時，改用備援模型重試。" />
                      </span>
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
                    <label className="cs-model-field">
                      <span className="cs-model-label">
                        智能升級
                        <ModelLabHelp text="啟用後，主模型信心不足時會自動升級到備援模型。" />
                      </span>
                      <FilterableSelect
                        aria-label="啟用智能升級"
                        value={configDraft.fallbackEnabled ? "enabled" : "disabled"}
                        onChange={(event) =>
                          setConfigDraft((current) => ({
                            ...current,
                            fallbackEnabled: event.target.value === "enabled",
                          }))
                        }
                      >
                        <option value="enabled">啟用</option>
                        <option value="disabled">停用</option>
                      </FilterableSelect>
                    </label>
                    <label className="cs-model-field">
                      <span className="cs-model-label">
                        Temperature
                        <ModelLabHelp text="數值越低回覆越穩定；越高越有變化。" />
                      </span>
                      <input
                        aria-label="Temperature"
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
                    <label className="cs-model-field">
                      <span className="cs-model-label">
                        FAQ 數量
                        <ModelLabHelp text="每次回覆檢索並帶入的 FAQ 數量。" />
                      </span>
                      <input
                        aria-label="FAQ 數量"
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
                    <label className="cs-model-field cs-model-field--wide">
                      <span className="cs-model-label">附加 Prompt</span>
                      <textarea
                        aria-label="附加 Prompt"
                        rows={2}
                        placeholder={t("settings.customerFaq.additionalPromptPlaceholder")}
                        value={configDraft.systemPrompt}
                        onChange={(event) =>
                          setConfigDraft((current) => ({
                            ...current,
                            systemPrompt: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="cs-rag-section">
                    <div className="cs-rag-section-head">
                      <span className="cs-rag-section-title">
                        <Database />
                        {t("settings.customerFaq.ragTitle")}
                      </span>
                      <p className="cs-rag-hint">{t("settings.customerFaq.ragHint")}</p>
                    </div>
                    <div className="cs-rag-options">
                      <label>
                        <input
                          type="checkbox"
                          aria-label={t("settings.customerFaq.ragV2")}
                          checked={configDraft.ragConfig.enableRagV2}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            setConfigDraft((current) => ({
                              ...current,
                              ragConfig: {
                                enableRagV2: enabled,
                                enableQueryRewrite: enabled,
                                enableGroundedClarification: enabled,
                              },
                            }));
                          }}
                        />
                        <span>{t("settings.customerFaq.ragV2")}</span>
                        <ModelLabHelp text="以語義向量加關鍵字混合檢索 FAQ。" />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={t("settings.customerFaq.ragRewrite")}
                          checked={configDraft.ragConfig.enableQueryRewrite}
                          disabled={!configDraft.ragConfig.enableRagV2}
                          onChange={(event) =>
                            setConfigDraft((current) => ({
                              ...current,
                              ragConfig: {
                                ...current.ragConfig,
                                enableQueryRewrite: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{t("settings.customerFaq.ragRewrite")}</span>
                        <ModelLabHelp text="依對話代詞與上文改寫查詢，提升檢索命中率。" />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={t("settings.customerFaq.ragClarification")}
                          checked={configDraft.ragConfig.enableGroundedClarification}
                          disabled={!configDraft.ragConfig.enableRagV2}
                          onChange={(event) =>
                            setConfigDraft((current) => ({
                              ...current,
                              ragConfig: {
                                ...current.ragConfig,
                                enableGroundedClarification: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{t("settings.customerFaq.ragClarification")}</span>
                        <ModelLabHelp text="資料不足時先回答已知部分，再向客人釐清。" />
                      </label>
                    </div>
                  </div>
                  <div className="cs-model-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(configBusy)}
                      onClick={resetConfigDraft}
                    >
                      <RotateCcw />
                      重設為預設值
                    </Button>
                    <Button
                      type="button"
                      disabled={Boolean(configBusy)}
                      onClick={() => void createConfig()}
                    >
                      <Plus />
                      建立候選版本
                    </Button>
                  </div>
                </article>
              </>
            ) : null}
            <article className="cs-model-card">
              <header className="cs-model-card-head">
                <h3 className="customer-service-section-title">
                  <span><Archive /></span>
                  已建立的候選版本
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={insightsLoading}
                  onClick={() => void loadInsights()}
                >
                  <ChartLine />
                  歷史評估
                </Button>
              </header>
              <div className="cs-version-list">
              {configVersions.map((config) => {
                const latestRun = evaluationRuns.find(
                  (run) => run.candidateConfigId === config.id,
                );
                return (
                  <article
                    key={config.id}
                    className={`cs-version-card${
                      config.status === "active" ? " is-active" : ""
                    }`}
                  >
                    <div className="cs-version-body">
                      <div className="cs-version-title">
                        <strong>
                          v{config.version} · {config.label}
                        </strong>
                        <span
                          className={`status-badge ${config.status === "active" ? "green" : "neutral"}`}
                        >
                          {config.status}
                        </span>
                      </div>
                      <p className="cs-version-meta">
                        主模型 {config.model}（none） · {config.fallbackEnabled
                          ? `低信心輪 ${config.fallbackModel}（low，門檻 ${config.escalationConfidence}）`
                          : "不升級"} · temperature {config.temperature} · FAQ{" "}
                        {config.retrievalLimit}
                        {config.ragConfig.enableRagV2 ? " · RAG v2" : ""}
                      </p>
                      <p className="cs-version-time">
                        建立時間：{formatModelLabTimestamp(config.createdAt)} | 更新時間：
                        {formatModelLabTimestamp(config.updatedAt)}
                      </p>
                    </div>
                    {canEdit ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${config.label} 更多操作`}
                          >
                            <Ellipsis />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="cs-version-menu">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(configBusy)}
                            onClick={() => void evaluateConfig(config.id)}
                          >
                            <ChartLine />
                            歷史評估
                          </Button>
                          <p className="cs-version-menu-note">
                            {latestRun
                              ? `評測：${latestRun.status} · 樣本 ${latestRun.sampleSize} · 一致率 ${formatRate(latestRun.metrics.agreement_rate)}`
                              : "尚未評測"}
                          </p>
                          {config.status !== "archived" ? (
                            <fieldset className="cs-version-menu-flags">
                              <legend>{t("settings.customerFaq.ragTitle")}</legend>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={t("settings.customerFaq.ragV2")}
                                  checked={config.ragConfig.enableRagV2}
                                  disabled={Boolean(configBusy)}
                                  onChange={(event) => {
                                    const enabled = event.target.checked;
                                    void saveRagFlags(config.id, {
                                      enableRagV2: enabled,
                                      enableQueryRewrite: enabled,
                                      enableGroundedClarification: enabled,
                                    });
                                  }}
                                />
                                <span>{t("settings.customerFaq.ragV2")}</span>
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={t("settings.customerFaq.ragRewrite")}
                                  checked={config.ragConfig.enableQueryRewrite}
                                  disabled={
                                    Boolean(configBusy) ||
                                    !config.ragConfig.enableRagV2
                                  }
                                  onChange={(event) =>
                                    void saveRagFlags(config.id, {
                                      ...config.ragConfig,
                                      enableQueryRewrite: event.target.checked,
                                    })
                                  }
                                />
                                <span>{t("settings.customerFaq.ragRewrite")}</span>
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={t("settings.customerFaq.ragClarification")}
                                  checked={config.ragConfig.enableGroundedClarification}
                                  disabled={
                                    Boolean(configBusy) ||
                                    !config.ragConfig.enableRagV2
                                  }
                                  onChange={(event) =>
                                    void saveRagFlags(config.id, {
                                      ...config.ragConfig,
                                      enableGroundedClarification: event.target.checked,
                                    })
                                  }
                                />
                                <span>{t("settings.customerFaq.ragClarification")}</span>
                              </label>
                            </fieldset>
                          ) : null}
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
                        </PopoverContent>
                      </Popover>
                    ) : null}
                  </article>
                );
              })}
              {configVersions.length === 0 ? (
                <p className="cs-version-empty">尚未建立任何候選版本。</p>
              ) : null}
              </div>
            </article>
          </section>
          ) : null}
        </div>
      </section>
      ) : null}

          {activeSection === "replay" ? (
          <section className="customer-service-import-lab">
            <h2 className="sr-only">歷史回放</h2>
            <CustomerServiceHistoryReplayPanel canEdit={canEdit} />
          </section>
          ) : null}

          {activeSection === "review" ? (
          <section className="customer-service-review-panel">
        <h2 className="sr-only">人工覆核學習</h2>
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
            {visibleReviewTurns.map((turn) => (
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
          <TablePagination
            summary={t("settings.pagination", {
              from: reviewTurns.length
                ? (currentReviewPage - 1) * REVIEW_PAGE_SIZE + 1
                : 0,
              to: Math.min(currentReviewPage * REVIEW_PAGE_SIZE, reviewTurns.length),
              total: reviewTurns.length,
            })}
            page={currentReviewPage}
            totalPages={reviewPageCount}
            loading={reviewLoading}
            onPrevious={() => setReviewPage(Math.max(1, currentReviewPage - 1))}
            onNext={() =>
              setReviewPage(Math.min(reviewPageCount, currentReviewPage + 1))
            }
            onPageChange={setReviewPage}
            previousLabel={t("settings.previous")}
            nextLabel={t("settings.next")}
            pageLabel={t("settings.pageOf")}
            jumpLabel={t("settings.jumpToPage")}
          />
        </div>
      </section>
      ) : null}

      {activeSection === "logic" ? (
      <section className="customer-service-logic-panel">
        <header className="customer-service-inline-header">
          <div>
            <h2>{t("settings.customerFaq.logicTitle")}</h2>
            <p>{t("settings.customerFaq.logicDescription")}</p>
          </div>
          <div className="customer-faq-inline-actions">
            <Button
              type="button"
              onClick={() => void saveLogic()}
              disabled={logicSaving || logicLoading || !logic}
            >
              {logicSaving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </header>
        {logicLoading ? <p>{t("common.loading")}</p> : null}
        {logicError ? (
          <p className="orders-state-error" role="alert">
            {logicError}
          </p>
        ) : null}
        {logic ? (
          <div className="customer-service-logic-editor">
            <section className="customer-service-logic-group">
              <header>
                <h3>{t("settings.customerFaq.logicIntentTitle")}</h3>
                <p>為每個意圖設定判斷說明、客人例句及信心門檻，展開卡片即可編輯。</p>
              </header>
              {logic.intents.map((intent) => (
                <details key={intent.intentKey} className="customer-service-logic-card">
                  <summary>
                    <span className="customer-service-logic-card-title">{intent.displayName}</span>
                    <span className={`status-badge ${intent.enabled ? "green" : "neutral"}`}>
                      {intent.enabled ? "啟用" : "停用"}
                    </span>
                  </summary>
                  <div className="customer-service-logic-card-body">
                    <label className="ingredients-field">
                      <span>{t("settings.customerFaq.logicDescriptionField")}</span>
                      <textarea
                        rows={4}
                        value={intent.description}
                        onChange={(event) =>
                          patchIntent(intent.intentKey, { description: event.target.value })
                        }
                      />
                    </label>
                    <label className="ingredients-field">
                      <span>{t("settings.customerFaq.logicExamples")}</span>
                      <textarea
                        rows={5}
                        value={intent.examples.join("\n")}
                        onChange={(event) =>
                          patchIntent(intent.intentKey, { examples: event.target.value.split("\n") })
                        }
                      />
                    </label>
                    <div className="customer-service-logic-card-row">
                      <label className="ingredients-field">
                        <span>{t("settings.customerFaq.logicConfidence")}</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={intent.confidenceThreshold}
                          onChange={(event) =>
                            patchIntent(intent.intentKey, { confidenceThreshold: Number(event.target.value) })
                          }
                        />
                      </label>
                      <div className="dictionary-active-field">
                        <span>{t("settings.customerFaq.logicEnabled")}</span>
                        <Switch
                          checked={intent.enabled}
                          onCheckedChange={(enabled) => patchIntent(intent.intentKey, { enabled })}
                        />
                      </div>
                    </div>
                    <p className="customer-service-logic-tools">
                      {t("settings.customerFaq.logicTools")}:{" "}
                      {intent.toolKeys.join(", ") || t("settings.customerFaq.logicNoTools")}
                    </p>
                  </div>
                </details>
              ))}
            </section>
            <section className="customer-service-logic-group">
              <header>
                <h3>流程策略</h3>
                <p>設定各流程的指引、帶入對話數量及追問門檻。</p>
              </header>
              {logic.workflowPolicies.map((workflow) => (
                <details key={workflow.goalKey} className="customer-service-logic-card">
                  <summary>
                    <span className="customer-service-logic-card-title">{workflow.displayName}</span>
                    <span className={`status-badge ${workflow.enabled ? "green" : "neutral"}`}>
                      {workflow.enabled ? "啟用" : "停用"}
                    </span>
                  </summary>
                  <div className="customer-service-logic-card-body">
                    <label className="ingredients-field">
                      <span>流程指引</span>
                      <textarea
                        rows={4}
                        value={workflow.instructions}
                        onChange={(event) => patchWorkflow(workflow.goalKey, { instructions: event.target.value })}
                      />
                    </label>
                    <div className="customer-service-logic-card-row">
                      <label className="ingredients-field">
                        <span>帶入最近對話數量</span>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={workflow.contextWindow}
                          onChange={(event) => patchWorkflow(workflow.goalKey, { contextWindow: Number(event.target.value) })}
                        />
                      </label>
                      <label className="ingredients-field">
                        <span>低於此信心時追問</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={workflow.clarificationThreshold}
                          onChange={(event) => patchWorkflow(workflow.goalKey, { clarificationThreshold: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="customer-service-logic-card-row">
                      <div className="dictionary-active-field">
                        <span>完成後恢復上一個任務</span>
                        <Switch
                          checked={workflow.autoResume}
                          onCheckedChange={(autoResume) => patchWorkflow(workflow.goalKey, { autoResume })}
                        />
                      </div>
                      <div className="dictionary-active-field">
                        <span>啟用流程</span>
                        <Switch
                          checked={workflow.enabled}
                          onCheckedChange={(enabled) => patchWorkflow(workflow.goalKey, { enabled })}
                        />
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </section>
            <section className="customer-service-logic-group">
              <header>
                <h3>{t("settings.customerFaq.logicReplyTitle")}</h3>
                <p>編輯各情境的常用回覆內容。</p>
              </header>
              {logic.replyTemplates.map((reply) => (
                <details key={reply.templateKey} className="customer-service-logic-card">
                  <summary>
                    <span className="customer-service-logic-card-title">{reply.displayName}</span>
                    <span className={`status-badge ${reply.enabled ? "green" : "neutral"}`}>
                      {reply.enabled ? "啟用" : "停用"}
                    </span>
                  </summary>
                  <div className="customer-service-logic-card-body">
                    <label className="ingredients-field">
                      <span>{t("settings.customerFaq.logicReplyContent")}</span>
                      <textarea
                        rows={8}
                        value={reply.content}
                        onChange={(event) => patchReply(reply.templateKey, { content: event.target.value })}
                      />
                    </label>
                    <div className="dictionary-active-field">
                      <span>{t("settings.customerFaq.logicEnabled")}</span>
                      <Switch
                        checked={reply.enabled}
                        onCheckedChange={(enabled) => patchReply(reply.templateKey, { enabled })}
                      />
                    </div>
                  </div>
                </details>
              ))}
            </section>
          </div>
        ) : null}
      </section>
      ) : null}
      </div>
      ) : null}

      <Modal
        open={importDialogOpen}
        title="匯入歷史對話"
        description="正在向 WATI 取得指定日期區間的歷史對話，寫入後可用於學習與回放。"
        closeLabel="關閉"
        size="sm"
        closeOnBackdrop={!importBusy}
        closeOnEscape={!importBusy}
        onClose={() => {
          if (!importBusy) setImportDialogOpen(false);
        }}
        footer={
          importBusy ? null : (
            <Button type="button" onClick={() => setImportDialogOpen(false)}>
              完成
            </Button>
          )
        }
      >
        <div className="cs-import-dialog">
          {importBusy ? (
            <div className="cs-import-progress">
              <div
                className="cs-import-bar"
                role="progressbar"
                aria-label="匯入進度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={importPercent}
              >
                <span style={{ width: `${importPercent}%` }} />
              </div>
              <span className="cs-import-percent">{importPercent}%</span>
            </div>
          ) : null}
          <ul className="cs-import-stats">
            <li>
              <span>批次</span>
              <strong>{importStats.batches}</strong>
            </li>
            <li>
              <span>對話</span>
              <strong>{importStats.phonesProcessed}</strong>
            </li>
            <li>
              <span>訊息</span>
              <strong>{importStats.messagesImported}</strong>
            </li>
          </ul>
          {importError ? (
            <p className="cs-import-error" role="alert">
              {importError}
            </p>
          ) : importResult ? (
            <p className="cs-import-done" role="status">
              已匯入 {importResult.messagesImported} 則訊息（
              {importResult.batches} 批）
              {importResult.errors.length
                ? `，有 ${importResult.errors.length} 個對話出錯。`
                : "，全部成功。"}
            </p>
          ) : (
            <p className="cs-import-message" role="status">
              {importProgress}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
