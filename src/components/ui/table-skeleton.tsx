import { cn } from "@/lib/utils";

export type TableSkeletonColumn = {
  width?: string;
  variant?: "text" | "badge" | "action";
};

function normalizeColumns(
  columns: number | TableSkeletonColumn[],
): TableSkeletonColumn[] {
  if (typeof columns === "number") {
    return Array.from({ length: columns }, () => ({ variant: "text" }));
  }
  return columns;
}

export function TableSkeletonRows({
  columns,
  rows = 15,
  className,
}: {
  columns: number | TableSkeletonColumn[];
  rows?: number;
  className?: string;
}) {
  const specs = normalizeColumns(columns);

  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr
          key={`skeleton-row-${rowIndex}`}
          className={cn("table-skeleton-row", className)}
        >
          {specs.map((column, columnIndex) => (
            <td key={`skeleton-cell-${rowIndex}-${columnIndex}`}>
              <span
                className={cn(
                  "table-skeleton-bone",
                  column.variant === "badge" && "table-skeleton-bone-badge",
                  column.variant === "action" && "table-skeleton-bone-action",
                )}
                style={column.width ? { width: column.width } : undefined}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
