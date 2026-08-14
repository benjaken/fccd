import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsMobile } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 56;
const PULL_MAX = 88;
const RESISTANCE = 0.42;

export function PullToRefresh({
  onRefresh,
  refreshing = false,
  disabled = false,
  className,
  children,
  "aria-busy": ariaBusy,
}: {
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  "aria-busy"?: boolean;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const enabled = Boolean(onRefresh) && isMobile && !disabled;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [awaiting, setAwaiting] = useState(false);
  const busy = refreshing || awaiting;
  const indicatorHeight = enabled && busy ? 48 : pull;
  const armed = pull >= PULL_THRESHOLD;

  const setPullDistance = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  const reset = useCallback(() => {
    pullingRef.current = false;
    setPullDistance(0);
  }, [setPullDistance]);

  useEffect(() => {
    if (refreshing) setAwaiting(false);
  }, [refreshing]);

  useEffect(() => {
    if (!busy) reset();
  }, [busy, reset]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !enabled) return;

    const onStart = (event: TouchEvent) => {
      if (busy || node.scrollTop > 0) return;
      startYRef.current = event.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onMove = (event: TouchEvent) => {
      if (!pullingRef.current || busy) return;
      if (node.scrollTop > 0) {
        reset();
        return;
      }
      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      event.preventDefault();
      setPullDistance(Math.min(PULL_MAX, delta * RESISTANCE));
    };

    const onEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullRef.current >= PULL_THRESHOLD && !busy) {
        setAwaiting(true);
        setPullDistance(0);
        void onRefresh?.();
        return;
      }
      setPullDistance(0);
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, [busy, enabled, onRefresh, reset, setPullDistance]);

  const label = !enabled
    ? ""
    : busy
      ? t("common.refreshing")
      : armed
        ? t("common.releaseToRefresh")
        : t("common.pullToRefresh");

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "pull-to-refresh",
        pull > 0 && "is-pulling",
        busy && "is-refreshing",
        className,
      )}
      data-pull-to-refresh={enabled || undefined}
      aria-busy={ariaBusy}
    >
      {enabled ? (
        <div
          className={cn(
            "pull-to-refresh-indicator",
            armed && "is-armed",
            busy && "is-busy",
          )}
          style={{ height: indicatorHeight }}
          aria-hidden={indicatorHeight === 0}
        >
          <RefreshCw className={busy ? "spin" : undefined} aria-hidden="true" />
          <span>{label}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
