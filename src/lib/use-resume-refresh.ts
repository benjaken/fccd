import { useEffect, useRef } from "react";

const RESUME_REFRESH_COALESCE_MS = 400;

export function useResumeRefresh(onRefresh: () => void | Promise<void>) {
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
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("pageshow", run);
    };
  }, []);
}
