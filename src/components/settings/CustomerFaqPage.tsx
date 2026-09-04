import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Bot, ChevronLeft, ChevronRight, MessageCircleMore, Pencil, Plus, RefreshCw, RotateCcw, Send, UserRound } from "lucide-react";

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
  previewCustomerServiceTurn,
  setCustomerServiceBotEnabled,
  updateCustomerFaq,
  type CustomerFaq,
  type CustomerFaqWriteInput,
  type CustomerServicePreviewConversation,
  type CustomerServicePreviewResult,
  type CustomerServiceControls,
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
  const [togglingBot, setTogglingBot] = useState(false);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewPhone, setPreviewPhone] = useState("");
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewConversation, setPreviewConversation] = useState<CustomerServicePreviewConversation | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

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

  const toggleBot = async (enabled: boolean) => {
    if (!canEdit || togglingBot) return;
    setTogglingBot(true);
    setControlsError("");
    try {
      setControls(await setBotEnabled(enabled));
    } catch {
      setControlsError(t("settings.customerFaq.botSaveError"));
    } finally {
      setTogglingBot(false);
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

  return (
    <section className="orders-page settings-list-page customer-faq-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.customerFaq.title")}</h1>
          <p>{t("settings.customerFaq.description")}</p>
        </div>
        <label className="dictionary-active-field">
          <span>{t("settings.customerFaq.botEnabled")}</span>
          <Switch
            checked={Boolean(controls?.botEnabled)}
            disabled={!canEdit || togglingBot || !controls}
            aria-label={t("settings.customerFaq.botEnabled")}
            onCheckedChange={(checked) => void toggleBot(checked)}
          />
        </label>
      </header>
      <div className="customer-faq-notes">
        {controlsError ? (
          <p className="orders-state-error" role="alert">
            {controlsError}
          </p>
        ) : (
          <p className="orders-toolbar-note">{t("settings.customerFaq.botHint")}</p>
        )}
        {controls?.allowedPhones?.length ? (
          <p className="orders-toolbar-note">
            {t("settings.customerFaq.botAllowlist", {
              phones: controls.allowedPhones.join("、"),
            })}
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
          <header className="page-heading">
            <div>
              <h2>{t("settings.customerFaq.previewTitle")}</h2>
              <p>{t("settings.customerFaq.previewDescription")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={resetPreview}>
              <RotateCcw />
              {t("settings.customerFaq.previewReset")}
            </Button>
          </header>
          <div className="customer-faq-preview-body">
            <label className="ingredients-field">
              <span>{t("settings.customerFaq.previewPhone")}</span>
              <input
                value={previewPhone}
                onChange={(event) => setPreviewPhone(event.target.value)}
                placeholder={t("settings.customerFaq.previewPhonePlaceholder")}
              />
            </label>
            <div className="customer-faq-chat" aria-label={t("settings.customerFaq.previewTranscript")}>
              {previewMessages.length ? previewMessages.map((message) => (
                <article key={message.id} className={`customer-faq-chat-message ${message.role}`}>
                  <span className="customer-faq-chat-avatar" aria-hidden="true">
                    {message.role === "user" ? <UserRound /> : <Bot />}
                  </span>
                  <div>
                    <p>{message.text}</p>
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
                      </small>
                    ) : null}
                  </div>
                </article>
              )) : (
                <p className="orders-toolbar-note">{t("settings.customerFaq.previewEmpty")}</p>
              )}
              {previewing ? (
                <article className="customer-faq-chat-message assistant">
                  <span className="customer-faq-chat-avatar" aria-hidden="true"><Bot /></span>
                  <div><p>{t("settings.customerFaq.previewing")}</p></div>
                </article>
              ) : null}
            </div>
            <form className="ingredients-form" onSubmit={(event) => void runPreview(event)}>
              <label className="ingredients-field">
                <span>{t("settings.customerFaq.previewQuery")}</span>
                <input
                  value={previewQuery}
                  onChange={(event) => setPreviewQuery(event.target.value)}
                  placeholder={t("settings.customerFaq.previewPlaceholder")}
                />
              </label>
              <Button type="submit" disabled={previewing || !previewQuery.trim()}>
                <Send />
                {t("settings.customerFaq.previewAction")}
              </Button>
            </form>
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
    </section>
  );
}
