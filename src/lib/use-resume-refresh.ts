import { useEffect, useRef } from "react";

export const RESUME_REFRESH_INTERVAL_MS = 30_000;
const RESUME_REFRESH_COALESCE_MS = 400;

export function useResumeRefresh(
  onRefresh: () => void | Promise<void>,
  intervalMs = RESUME_REFRESH_INTERVAL_MS,
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let lastRanAt = Number.NEGATIVE_INFINITY;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRanAt < RESUME_REFRESH_COALESCE_MS) return;
      lastRanAt = now;
      void onRefreshRef.current();
    };

    document.addEventListener("visibilitychange", run);
    window.addEventListener("pageshow", run);
    const timer = window.setInterval(run, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("pageshow", run);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}
