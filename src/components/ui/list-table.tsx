import type { ReactNode } from "react";

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
}: {
  header: ReactNode;
  children: ReactNode;
  loading: boolean;
  loadingLabel: string;
  skeletonColumns: number | TableSkeletonColumn[];
  skeletonRows?: number;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div
      className={cn("table-wrap operational-table-wrap", className)}
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
    </div>
  );
}
