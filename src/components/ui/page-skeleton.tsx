import { TableSkeletonRows } from "@/components/ui/table-skeleton";

const PAGE_SKELETON_COLUMNS = [
  { width: "72%" },
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
];

/**
 * Generic permission/bootstrap placeholder that preserves the page shell.
 * The actual route is rendered only after access checks complete.
 */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <section className="page-skeleton" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>

      <header className="page-skeleton-heading" aria-hidden="true">
        <div>
          <span className="page-skeleton-bone page-skeleton-eyebrow" />
          <span className="page-skeleton-bone page-skeleton-title" />
        </div>
        <span className="page-skeleton-bone page-skeleton-action" />
      </header>

      <article className="panel page-skeleton-panel" aria-hidden="true">
        <div className="page-skeleton-toolbar">
          <span className="page-skeleton-bone page-skeleton-search" />
          <span className="page-skeleton-bone page-skeleton-filter" />
        </div>
        <div className="table-wrap page-skeleton-table">
          <table>
            <thead>
              <tr>
                <th>&nbsp;</th>
                <th>&nbsp;</th>
                <th>&nbsp;</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              <TableSkeletonRows
                rows={15}
                columns={PAGE_SKELETON_COLUMNS}
              />
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
