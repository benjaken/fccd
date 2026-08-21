import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createQuoteCustomerNote,
  documentPath,
  emptyQuoteCustomerMessages,
  fetchQuoteCustomerMessages,
  QUOTE_CUSTOMER_MESSAGE_TABS,
  type CreateQuoteCustomerNoteInput,
  type QuoteCustomerMessage,
  type QuoteCustomerMessages,
  type QuoteCustomerMessageTab,
} from "@/lib/quote-customers";
import { cn } from "@/lib/utils";

type MessagesLoader = (email: string) => Promise<QuoteCustomerMessages>;
type NoteCreator = (input: CreateQuoteCustomerNoteInput) => Promise<QuoteCustomerMessage>;

function MessageBubble({
  message,
  timestamp,
  replyLabel,
  emailReplyLabel,
  onReply,
}: {
  message: QuoteCustomerMessage;
  timestamp: string;
  replyLabel?: string;
  emailReplyLabel?: string;
  onReply?: (message: QuoteCustomerMessage) => void;
}) {
  return (
    <article className="quote-customers-message">
      {message.authorName ? <span>{message.authorName}</span> : null}
      <div className="quote-customers-message-bubble">
        {message.replyEmail ? (
          <small className="quote-customers-email-reply">
            {emailReplyLabel}
            <a href={`mailto:${message.replyEmail}`}>{message.replyEmail}</a>
          </small>
        ) : null}
        <strong>{message.body}</strong>
        {message.orderId ? (
          <Link className="order-link" to={documentPath(message.documentType, message.orderId)}>
            {message.orderNumber}
          </Link>
        ) : message.orderNumber ? <small>{message.orderNumber}</small> : null}
      </div>
      <div className="quote-customers-message-meta">
        <time dateTime={message.createdAt}>{timestamp}</time>
        {onReply && replyLabel ? (
          <button type="button" className="quote-customers-message-reply" onClick={() => onReply(message)}>
            {replyLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CustomerMessagesSidePanel({
  open,
  email,
  phone = null,
  orderNumber = null,
  defaultOrderId = null,
  onClose,
  loadMessages = fetchQuoteCustomerMessages,
  createNote = createQuoteCustomerNote,
}: {
  open: boolean;
  email: string | null;
  phone?: string | null;
  orderNumber?: string | null;
  defaultOrderId?: string | null;
  onClose: () => void;
  loadMessages?: MessagesLoader;
  createNote?: NoteCreator;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<QuoteCustomerMessages | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageTab, setMessageTab] = useState<QuoteCustomerMessageTab>("note");
  const [draftNote, setDraftNote] = useState("");
  const [replyTarget, setReplyTarget] = useState<QuoteCustomerMessage | null>(null);
  const [sendingNote, setSendingNote] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Hong_Kong",
  }), []);

  useEffect(() => {
    if (!open || !defaultOrderId) {
      setMessages(null);
      setLoadError(null);
      setLoading(false);
      setDraftNote("");
      setSendError(null);
      setReplyTarget(null);
      return;
    }
    let active = true;
    setMessages(null);
    setLoadError(null);
    setLoading(true);
    setMessageTab("note");
    setDraftNote("");
    setSendError(null);
    setReplyTarget(null);
    void loadMessages(defaultOrderId)
      .then((result) => { if (active) setMessages(result); })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "quote_customers_messages_failed");
        setMessages(emptyQuoteCustomerMessages());
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [defaultOrderId, loadMessages, open]);

  useEffect(() => {
    if (messageTab !== "note") return;
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messageTab, messages?.note.length]);

  const sendNote = async () => {
    if (!defaultOrderId || sendingNote) return;
    const body = draftNote.trim();
    if (!body) return;
    setSendingNote(true);
    setSendError(null);
    try {
      const message = await createNote({
        email,
        body,
        authorName: profile?.user_name || profile?.email || null,
        orderId: replyTarget?.orderId ?? defaultOrderId,
        replyToEmail: replyTarget ? email : null,
      });
      setMessages((current) => ({
        ...(current ?? emptyQuoteCustomerMessages()),
        note: [...(current?.note ?? []), message],
      }));
      setDraftNote("");
      setReplyTarget(null);
    } catch (error: unknown) {
      setSendError(typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "quote_customers_note_failed");
    } finally {
      setSendingNote(false);
    }
  };

  const visibleMessages = messages?.[messageTab] ?? [];
  return (
    <SidePanel
      open={open}
      className="side-panel-messages"
      title={t("quoteCustomers.messagesTitle")}
      description={[orderNumber, phone || email].filter(Boolean).join(" · ") || undefined}
      onClose={onClose}
      closeLabel={t("quoteCustomers.closePanel")}
      footer={messageTab === "note" ? (
        <div className="quote-customers-message-composer-wrap">
          {replyTarget ? (
            <div className="quote-customers-reply-target">
              <span>{t("quoteCustomers.emailReply")} {email}{replyTarget.orderNumber ? ` · ${replyTarget.orderNumber}` : ""}</span>
              <button type="button" onClick={() => setReplyTarget(null)}>{t("quoteCustomers.cancelReply")}</button>
            </div>
          ) : null}
          <form className="quote-customers-message-composer" onSubmit={(event) => { event.preventDefault(); void sendNote(); }}>
            <label className="sr-only" htmlFor="customer-message-note">{t("quoteCustomers.notePlaceholder")}</label>
            <input id="customer-message-note" value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder={t("quoteCustomers.notePlaceholder")} disabled={loading || sendingNote} autoComplete="off" />
            <Button type="submit" size="icon" disabled={loading || sendingNote || !draftNote.trim()} aria-label={t("quoteCustomers.sendNote")}><Send /></Button>
          </form>
        </div>
      ) : undefined}
    >
      <div className="quote-customers-messages">
        <div className="quote-customers-message-tabs" role="tablist" aria-label={t("quoteCustomers.messagesTitle")}>
          {QUOTE_CUSTOMER_MESSAGE_TABS.map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={messageTab === tab} className={cn(messageTab === tab && "is-active")} onClick={() => { setMessageTab(tab); setReplyTarget(null); }}>
              {t(`quoteCustomers.tabs.${tab}`, { total: messages?.[tab].length ?? 0 })}
            </button>
          ))}
        </div>
        <div className="quote-customers-message-feed-host">
          <div ref={feedRef} className="quote-customers-message-feed" tabIndex={0}>
            {loading ? <p className="quote-customers-history-status">{t("quoteCustomers.messagesLoading")}</p>
              : loadError ? <p className="quote-customers-history-error" role="alert">{t("quoteCustomers.messagesError")}</p>
              : !visibleMessages.length ? <p className="quote-customers-history-status">{t(`quoteCustomers.emptyTabs.${messageTab}`)}</p>
              : visibleMessages.map((message) => (
                <MessageBubble key={message.id} message={message} timestamp={timeFormatter.format(new Date(message.createdAt))} replyLabel={messageTab === "note" ? t("quoteCustomers.reply") : undefined} emailReplyLabel={t("quoteCustomers.emailReply")} onReply={messageTab === "note" ? setReplyTarget : undefined} />
              ))}
            {sendError ? <p className="quote-customers-history-error" role="alert">{t("quoteCustomers.sendError")}</p> : null}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
