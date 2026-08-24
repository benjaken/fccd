import { useEffect, useRef, type ReactNode } from "react";

import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  TableSkeletonRows,
  type TableSkeletonColumn,
} from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

export function ListTable({
  header,
  children,
  loading,
  loadingLabel,
  skeletonColumns,
  skeletonRows = 15,
  className,
  tableClassName,
  onRefresh,
  mobileContent,
  mobileHasMore = false,
  mobileLoadingMore = false,
  mobileLoadError = false,
  onMobileLoadMore,
  mobileLoadingMoreLabel = "Loading more",
  mobileRetryLabel = "Retry",
  mobileEndLabel = "All records loaded",
}: {
  header: ReactNode;
  children: ReactNode;
  loading: boolean;
  loadingLabel: string;
  skeletonColumns: number | TableSkeletonColumn[];
  skeletonRows?: number;
  className?: string;
  tableClassName?: string;
  onRefresh?: () => void | Promise<void>;
  mobileContent?: ReactNode;
  mobileHasMore?: boolean;
  mobileLoadingMore?: boolean;
  mobileLoadError?: boolean;
  onMobileLoadMore?: () => void;
  mobileLoadingMoreLabel?: string;
  mobileRetryLabel?: string;
  mobileEndLabel?: string;
}) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMoreRequestedRef = useRef(false);
  const wasLoadingMoreRef = useRef(false);
  const requestMobileLoadMore = () => {
    if (loadMoreRequestedRef.current || mobileLoadingMore || !onMobileLoadMore) return;
    loadMoreRequestedRef.current = true;
    onMobileLoadMore();
  };

  useEffect(() => {
    if (wasLoadingMoreRef.current && !mobileLoadingMore) {
      loadMoreRequestedRef.current = false;
    }
    wasLoadingMoreRef.current = mobileLoadingMore;
  }, [mobileLoadingMore]);

  useEffect(() => {
    if (loading || !mobileHasMore) loadMoreRequestedRef.current = false;
  }, [loading, mobileHasMore]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (
      !node ||
      !mobileContent ||
      !mobileHasMore ||
      mobileLoadingMore ||
      mobileLoadError ||
      !onMobileLoadMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestMobileLoadMore();
        }
      },
      { rootMargin: "180px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    mobileContent,
    mobileHasMore,
    mobileLoadError,
    mobileLoadingMore,
    onMobileLoadMore,
  ]);

  return (
    <PullToRefresh
      className={cn(
        "table-wrap operational-table-wrap",
        mobileContent && "has-mobile-list",
        className,
      )}
      onRefresh={onRefresh}
      refreshing={loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="sr-only" role="status">
          {loadingLabel}
        </span>
      ) : null}
      <table className={tableClassName}>
        <thead>{header}</thead>
        <tbody>
          {loading ? (
            <TableSkeletonRows
              rows={skeletonRows}
              columns={skeletonColumns}
            />
          ) : (
            children
          )}
        </tbody>
      </table>
      {mobileContent ? (
        <section className="mobile-list-view" aria-busy={loading || mobileLoadingMore || undefined}>
          {loading ? (
            <div className="mobile-list-skeleton" aria-hidden="true">
              {Array.from({ length: Math.min(skeletonRows, 6) }, (_, index) => (
                <div className="mobile-list-skeleton-card" key={index}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : (
            mobileContent
          )}
          {!loading ? (
            <div
              className={cn(
                "mobile-list-load-more",
                mobileHasMore && !mobileLoadingMore && !mobileLoadError && "is-auto-sentinel",
              )}
              ref={loadMoreRef}
              aria-hidden={mobileHasMore && !mobileLoadingMore && !mobileLoadError}
            >
              {mobileLoadingMore ? (
                <span role="status">{mobileLoadingMoreLabel}</span>
              ) : mobileLoadError ? (
                <button type="button" onClick={requestMobileLoadMore}>
                  {mobileRetryLabel}
                </button>
              ) : mobileHasMore ? (
                null
              ) : (
                <span>{mobileEndLabel}</span>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </PullToRefresh>
  );
}
