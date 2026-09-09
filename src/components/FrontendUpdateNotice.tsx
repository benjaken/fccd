import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

type VersionPayload = {
  version?: unknown;
};

export type FrontendUpdateNoticeProps = {
  /** The version compiled into the current bundle. */
  currentVersion?: string;
  /** Polling interval; kept injectable so the component can be tested quickly. */
  pollIntervalMs?: number;
  /** Disable the check for print-only or other isolated surfaces. */
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  reloadPage?: () => void;
};

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_VERSION = String(import.meta.env.VITE_APP_VERSION || "dev");

function readVersion(payload: VersionPayload) {
  return typeof payload.version === "string" ? payload.version.trim() : "";
}

export function FrontendUpdateNotice({
  currentVersion = DEFAULT_VERSION,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  enabled = true,
  fetchImpl = fetch,
  reloadPage = () => window.location.reload(),
}: FrontendUpdateNoticeProps) {
  const { t } = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!enabled || updateAvailable) return;

    try {
      const response = await fetchImpl(
        `/app-version.json?current=${encodeURIComponent(currentVersion)}&t=${Date.now()}`,
        { cache: "no-store", headers: { Accept: "application/json" } },
      );
      if (!response.ok) return;
      const payload = await response.json() as VersionPayload;
      const remoteVersion = readVersion(payload);
      if (remoteVersion && remoteVersion !== currentVersion) {
        setUpdateAvailable(true);
      }
    } catch {
      // A failed background check should never interrupt normal operations.
    }
  }, [currentVersion, enabled, fetchImpl, updateAvailable]);

  useEffect(() => {
    if (!enabled) return;
    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), pollIntervalMs);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkForUpdate, enabled, pollIntervalMs]);

  if (!updateAvailable) return null;

  return (
    <aside className="frontend-update-notice" role="status" aria-live="polite">
      <span className="frontend-update-notice-icon" aria-hidden="true">
        <Sparkles />
      </span>
      <div className="frontend-update-notice-copy">
        <strong>{t("frontendUpdate.title")}</strong>
        <span>{t("frontendUpdate.description")}</span>
      </div>
      <button type="button" className="frontend-update-notice-action" onClick={reloadPage}>
        <RefreshCw aria-hidden="true" />
        {t("frontendUpdate.refresh")}
      </button>
    </aside>
  );
}
