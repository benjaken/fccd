import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import "./corner-notice.css";

type CornerNoticeTone = "success" | "error";

function noticeHost() {
  const existing = document.querySelector<HTMLElement>("[data-corner-notice-host]");
  if (existing) return existing;
  const host = document.createElement("div");
  host.dataset.cornerNoticeHost = "true";
  host.className = "corner-notice-host";
  document.body.appendChild(host);
  return host;
}

export function CornerNotice({
  message,
  tone = "success",
  onDismiss,
  durationMs = 4500,
}: {
  message: string;
  tone?: CornerNoticeTone;
  onDismiss: () => void;
  durationMs?: number;
}) {
  const { t } = useTranslation();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (durationMs <= 0) return undefined;
    const timer = window.setTimeout(() => dismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, message, tone]);

  useEffect(() => () => {
    const host = document.querySelector<HTMLElement>("[data-corner-notice-host]");
    queueMicrotask(() => {
      if (host?.isConnected && host.childElementCount === 0) host.remove();
    });
  }, []);

  if (!message || typeof document === "undefined") return null;

  const Icon = tone === "error" ? AlertCircle : CheckCircle2;

  return createPortal(
    <div
      className={`corner-notice is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <Icon aria-hidden="true" />
      <p>{message}</p>
      <button type="button" onClick={() => dismissRef.current()} aria-label={t("common.dismissNotice")}>
        <X aria-hidden="true" />
      </button>
    </div>,
    noticeHost(),
  );
}
