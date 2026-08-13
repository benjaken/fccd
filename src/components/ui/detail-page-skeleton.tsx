import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

const DETAIL_TABLE_COLUMNS = [
  { width: "72%" },
  { width: "5rem" },
  { width: "4rem" },
  { width: "5rem" },
];

/** Shared loading shell for order, quote, product, and package details. */
export function DetailPageSkeleton({
  label,
  cards = 3,
}: {
  label: string;
  cards?: 2 | 3;
}) {
  return (
    <section className="detail-page detail-page-skeleton" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>

      <header className="page-heading" aria-hidden="true">
        <div className="detail-skeleton-heading">
          <span className="page-skeleton-bone detail-skeleton-back" />
          <span className="page-skeleton-bone detail-skeleton-eyebrow" />
          <span className="page-skeleton-bone detail-skeleton-title" />
          <span className="page-skeleton-bone detail-skeleton-subtitle" />
        </div>
        <span className="page-skeleton-bone detail-skeleton-badge" />
      </header>

      <section
        className={cn("detail-grid", cards === 2 && "detail-grid-two")}
        aria-hidden="true"
      >
        {Array.from({ length: cards }, (_, cardIndex) => (
          <article className="panel detail-card detail-skeleton-card" key={cardIndex}>
            <header>
              <span className="page-skeleton-bone detail-skeleton-icon" />
              <span className="page-skeleton-bone detail-skeleton-card-title" />
            </header>
            <div className="detail-fields">
              {Array.from({ length: 5 }, (_, fieldIndex) => (
                <div className="detail-skeleton-field" key={fieldIndex}>
                  <span className="page-skeleton-bone detail-skeleton-label" />
                  <span className="page-skeleton-bone detail-skeleton-value" />
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <article
        className="panel detail-table-panel detail-skeleton-table"
        aria-hidden="true"
      >
        <header className="panel-header">
          <div>
            <span className="page-skeleton-bone detail-skeleton-card-title" />
            <span className="page-skeleton-bone detail-skeleton-description" />
          </div>
        </header>
        <div className="table-wrap">
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
              <TableSkeletonRows rows={6} columns={DETAIL_TABLE_COLUMNS} />
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
