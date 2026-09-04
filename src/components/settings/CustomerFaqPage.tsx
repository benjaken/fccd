import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Bot, CheckCheck, ChevronLeft, ChevronRight, MessageCircleMore, Pencil, Plus, RefreshCw, RotateCcw, Send, Settings2, Smile } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  CUSTOMER_FAQ_CATEGORIES,
  CUSTOMER_FAQS_PAGE_SIZE,
  createCustomerFaq,
  fetchCustomerFaqs,
  fetchCustomerServiceControls,
  fetchCustomerServiceLogic,
  previewCustomerServiceTurn,
  setCustomerServiceBotEnabled,
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
  type CustomerServiceReplyTemplate,
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
  const previewChatRef = useRef<HTMLDivElement>(null);
  const [logicOpen, setLogicOpen] = useState(false);
  const [logic, setLogic] = useState<CustomerServiceLogic | null>(null);
  const [selectedIntent, setSelectedIntent] = useState("");
  const [selectedReply, setSelectedReply] = useState("");
  const [logicLoading, setLogicLoading] = useState(false);
  const [logicSaving, setLogicSaving] = useState(false);
  const [logicError, setLogicError] = useState("");

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

  const openLogic = async () => {
    setLogicOpen(true);
    setLogicLoading(true);
    setLogicError("");
    try {
      const next = await loadLogic();
      setLogic(next);
      setSelectedIntent((current) => current || next.intents[0]?.intentKey || "");
      setSelectedReply((current) => current || next.replyTemplates[0]?.templateKey || "");
    } catch {
      setLogicError(t("settings.customerFaq.logicLoadError"));
    } finally {
      setLogicLoading(false);
    }
  };

  const patchIntent = (patch: Partial<CustomerServiceIntentSetting>) => {
    setLogic((current) => current ? {
      ...current,
      intents: current.intents.map((intent) =>
        intent.intentKey === selectedIntent ? { ...intent, ...patch } : intent
      ),
    } : current);
  };

  const patchReply = (patch: Partial<CustomerServiceReplyTemplate>) => {
    setLogic((current) => current ? {
      ...current,
      replyTemplates: current.replyTemplates.map((reply) =>
        reply.templateKey === selectedReply ? { ...reply, ...patch } : reply
      ),
    } : current);
  };

  const saveLogic = async () => {
    if (!logic || logicSaving) return;
    const intent = logic.intents.find((item) => item.intentKey === selectedIntent);
    const reply = logic.replyTemplates.find((item) => item.templateKey === selectedReply);
    if (!intent || !reply || !intent.description.trim() || !reply.content.trim()) {
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

  const intentDraft = logic?.intents.find((item) => item.intentKey === selectedIntent);
  const replyDraft = logic?.replyTemplates.find((item) => item.templateKey === selectedReply);

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
        {canEdit ? (
          <Button type="button" variant="outline" onClick={() => void openLogic()}>
            <Settings2 />
            {t("settings.customerFaq.logicButton")}
          </Button>
        ) : null}
        {controlsError ? (
          <p className="orders-state-error" role="alert">{controlsError}</p>
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
        open={logicOpen}
        title={t("settings.customerFaq.logicTitle")}
        description={t("settings.customerFaq.logicDescription")}
        onClose={() => !logicSaving && setLogicOpen(false)}
        closeLabel={t("common.close")}
        half
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setLogicOpen(false)} disabled={logicSaving}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void saveLogic()} disabled={logicSaving || logicLoading || !logic}>
              {logicSaving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        {logicLoading ? <p>{t("common.loading")}</p> : null}
        {logicError ? <p className="orders-state-error" role="alert">{logicError}</p> : null}
        {intentDraft && replyDraft ? (
          <div className="customer-service-logic-editor">
            <section>
              <h3>{t("settings.customerFaq.logicIntentTitle")}</h3>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicIntent")}</span>
                <select value={selectedIntent} onChange={(event) => setSelectedIntent(event.target.value)}>
                  {logic?.intents.map((intent) => (
                    <option key={intent.intentKey} value={intent.intentKey}>{intent.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicDescriptionField")}</span>
                <textarea rows={5} value={intentDraft.description} onChange={(event) => patchIntent({ description: event.target.value })} />
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicExamples")}</span>
                <textarea rows={7} value={intentDraft.examples.join("\n")} onChange={(event) => patchIntent({ examples: event.target.value.split("\n") })} />
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicConfidence")}</span>
                <input type="number" min="0" max="1" step="0.05" value={intentDraft.confidenceThreshold} onChange={(event) => patchIntent({ confidenceThreshold: Number(event.target.value) })} />
              </label>
              <p className="customer-service-logic-tools">
                {t("settings.customerFaq.logicTools")}: {intentDraft.toolKeys.join(", ") || t("settings.customerFaq.logicNoTools")}
              </p>
              <div className="dictionary-active-field">
                <span>{t("settings.customerFaq.logicEnabled")}</span>
                <Switch checked={intentDraft.enabled} onCheckedChange={(enabled) => patchIntent({ enabled })} />
              </div>
            </section>
            <section>
              <h3>{t("settings.customerFaq.logicReplyTitle")}</h3>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicReply")}</span>
                <select value={selectedReply} onChange={(event) => setSelectedReply(event.target.value)}>
                  {logic?.replyTemplates.map((reply) => (
                    <option key={reply.templateKey} value={reply.templateKey}>{reply.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.logicReplyContent")}</span>
                <textarea rows={10} value={replyDraft.content} onChange={(event) => patchReply({ content: event.target.value })} />
              </label>
              <div className="dictionary-active-field">
                <span>{t("settings.customerFaq.logicEnabled")}</span>
                <Switch checked={replyDraft.enabled} onCheckedChange={(enabled) => patchReply({ enabled })} />
              </div>
            </section>
          </div>
        ) : null}
      </SidePanel>
    </section>
  );
}
