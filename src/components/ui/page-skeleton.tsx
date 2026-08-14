import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

export type PageSkeletonVariant =
  | "permission"
  | "detail"
  | "dashboard"
  | "queue"
  | "profile"
  | "table"
  | "report"
  | "analysis";

type PageSkeletonProps = {
  label: string;
  variant?: PageSkeletonVariant;
  cards?: 2 | 3;
  analysis?: boolean;
  compact?: boolean;
};

const tableColumns = [
  { width: "72%" },
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
];

function bone(className = "") {
  return <span className={cn("page-skeleton-bone", className)} />;
}

function table(columns = 4, rows = 15) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {Array.from({ length: columns }, (_, index) => (
              <th key={index}>&nbsp;</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <TableSkeletonRows
            rows={rows}
            columns={columns === 4 ? tableColumns : columns}
          />
        </tbody>
      </table>
    </div>
  );
}

function heading({ action = true, back = false } = {}) {
  return (
    <header className="page-heading">
      <div className="content-skeleton-stack">
        {back ? bone("detail-skeleton-back") : null}
        {bone("content-skeleton-eyebrow")}
        {bone("content-skeleton-title")}
        {back ? bone("detail-skeleton-subtitle") : null}
      </div>
      {action ? bone("content-skeleton-button") : null}
    </header>
  );
}

function detailHeading() {
  return (
    <header className="page-heading">
      <div className="detail-skeleton-heading">
        {bone("detail-skeleton-back")}
        {bone("detail-skeleton-eyebrow")}
        {bone("detail-skeleton-title")}
        {bone("detail-skeleton-subtitle")}
      </div>
      {bone("detail-skeleton-badge")}
    </header>
  );
}

function detailFields(count: number) {
  return (
    <div className="detail-fields">
      {Array.from({ length: count }, (_, fieldIndex) => (
        <div className="detail-field detail-skeleton-field" key={fieldIndex}>
          {bone("detail-skeleton-label")}
          {bone("detail-skeleton-value")}
        </div>
      ))}
    </div>
  );
}

function detailCard({
  fields,
  tableColumns,
  copyLines,
}: {
  fields?: number;
  tableColumns?: number;
  copyLines?: number;
}) {
  return (
    <article className="panel detail-card detail-skeleton-card">
      <header>
        {bone("detail-skeleton-icon")}
        {bone("detail-skeleton-card-title")}
      </header>
      {fields ? detailFields(fields) : null}
      {tableColumns ? (
        <div className="table-wrap detail-inline-table">{table(tableColumns, 6)}</div>
      ) : null}
      {copyLines
        ? Array.from({ length: copyLines }, (_, index) => (
            <span key={index}>{bone("detail-skeleton-copy")}</span>
          ))
        : null}
    </article>
  );
}

function permissionSkeleton() {
  return (
    <>
      {heading()}
      <article className="panel page-skeleton-panel">
        <div className="page-skeleton-toolbar">
          {bone("page-skeleton-search")}
          {bone("page-skeleton-filter")}
        </div>
        <div className="page-skeleton-table">{table()}</div>
      </article>
    </>
  );
}

function detailSkeleton(cards: 2 | 3) {
  const catalog = cards === 2;

  return (
    <>
      {detailHeading()}
      <section className={cn("detail-grid", catalog && "detail-grid-two")}>
        {catalog ? (
          <>
            {detailCard({ fields: 7 })}
            {detailCard({ fields: 7 })}
          </>
        ) : (
          <>
            {detailCard({ fields: 5 })}
            {detailCard({ fields: 4 })}
            {detailCard({ fields: 4 })}
          </>
        )}
      </section>
      {catalog ? (
        <>
          {detailCard({ tableColumns: 6 })}
          {detailCard({ copyLines: 4 })}
        </>
      ) : (
        <>
          <article className="panel detail-table-panel detail-skeleton-table">
            <header className="panel-header">
              <div>
                {bone("detail-skeleton-card-title")}
                {bone("detail-skeleton-description")}
              </div>
            </header>
            {table(5, 8)}
          </article>
          <article className="panel detail-table-panel detail-skeleton-table">
            <header className="panel-header">
              <div>
                {bone("detail-skeleton-card-title")}
                {bone("detail-skeleton-description")}
              </div>
            </header>
            {table(3, 5)}
          </article>
        </>
      )}
    </>
  );
}

function dashboardSkeleton() {
  return (
    <>
      {heading()}
      <section className="metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="metric-card content-skeleton-card" key={index}>
            {bone("content-skeleton-icon")}
            <div className="content-skeleton-stack">
              {bone("content-skeleton-label")}
              {bone("content-skeleton-number")}
              {bone("content-skeleton-copy")}
            </div>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        {Array.from({ length: 2 }, (_, panelIndex) => (
          <article className="panel content-skeleton-panel" key={panelIndex}>
            {bone("content-skeleton-section-title")}
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div className="content-skeleton-row" key={rowIndex}>
                {bone("content-skeleton-dot")}
                {bone("content-skeleton-row-label")}
                {bone("content-skeleton-count")}
              </div>
            ))}
          </article>
        ))}
      </section>
      <article className="panel jobs-panel">
        <div className="panel-header">
          {bone("content-skeleton-section-title")}
        </div>
        {table(6, 6)}
      </article>
    </>
  );
}

function queueSkeleton() {
  return (
    <>
      {heading({ action: false })}
      <article className="panel follow-up-panel">
        <div className="queue-list">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="queue-item content-skeleton-row" key={index}>
              {bone("content-skeleton-dot")}
              {bone("content-skeleton-row-label")}
              {bone("content-skeleton-count")}
            </div>
          ))}
        </div>
      </article>
    </>
  );
}

function profileSkeleton() {
  return (
    <>
      {heading()}
      <article className="profile-summary">
        {bone("content-skeleton-avatar")}
        <div className="content-skeleton-stack">
          {bone("content-skeleton-name")}
          {bone("content-skeleton-copy")}
        </div>
        {bone("content-skeleton-badge")}
      </article>
      <div className="profile-grid">
        {Array.from({ length: 2 }, (_, cardIndex) => (
          <article
            className="profile-card content-skeleton-panel"
            key={cardIndex}
          >
            {bone("content-skeleton-section-title")}
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div className="content-skeleton-field" key={rowIndex}>
                {bone("content-skeleton-icon")}
                <div className="content-skeleton-stack">
                  {bone("content-skeleton-label")}
                  {bone("content-skeleton-value")}
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

function tableSkeleton() {
  return (
    <div className="content-table-skeleton">
      <header className="content-skeleton-toolbar">
        {bone("content-skeleton-filter")}
      </header>
      {table(5)}
    </div>
  );
}

function reportSkeleton(analysis: boolean) {
  return (
    <>
      <section className="shop-order-summary">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="panel content-skeleton-summary" key={index}>
            {bone("content-skeleton-label")}
            {bone("content-skeleton-number")}
            {bone("content-skeleton-copy")}
          </article>
        ))}
      </section>
      {analysis ? (
        <section className="meat-price-analysis-grid">
          <article className="panel content-skeleton-analysis">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="content-skeleton-row" key={index}>
                {bone("content-skeleton-row-label")}
                {bone("content-skeleton-count")}
              </div>
            ))}
          </article>
          <article className="panel content-skeleton-chart">
            {bone("content-skeleton-section-title")}
            {bone("content-skeleton-chart-area")}
          </article>
        </section>
      ) : null}
      <article className="panel content-skeleton-report-table">
        <div className="panel-header">
          {bone("content-skeleton-section-title")}
        </div>
        {table(5, 10)}
      </article>
    </>
  );
}

function analysisSkeleton() {
  return (
    <>
      <div className="relationship-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index}>
            {bone("content-skeleton-label")}
            {bone("content-skeleton-number")}
          </article>
        ))}
      </div>
      <div className="content-skeleton-analysis-grid">
        {bone("content-skeleton-chart-area")}
        <div className="content-skeleton-stack">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index}>{bone("content-skeleton-row-label")}</span>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Single shared page-level skeleton. Variants preserve each page's broad
 * structure without proliferating one-off loading components.
 */
export function PageSkeleton({
  label,
  variant = "permission",
  cards = 3,
  analysis = false,
  compact = false,
}: PageSkeletonProps) {
  const content =
    variant === "detail"
      ? detailSkeleton(cards)
      : variant === "dashboard"
        ? dashboardSkeleton()
        : variant === "queue"
          ? queueSkeleton()
          : variant === "profile"
            ? profileSkeleton()
            : variant === "table"
              ? tableSkeleton()
              : variant === "report"
                ? reportSkeleton(analysis)
                : variant === "analysis"
                  ? analysisSkeleton()
                  : permissionSkeleton();

  return (
    <section
      className={cn(
        "page-skeleton-root",
        variant === "permission" && !compact && "page-skeleton",
        variant === "detail" && "detail-page detail-page-skeleton",
        variant === "dashboard" && "dashboard-skeleton",
        variant === "queue" && "follow-up-page content-page-skeleton",
        variant === "profile" && "profile-page content-page-skeleton",
        variant === "report" && "report-content-skeleton",
        variant === "analysis" &&
          "relationship-report content-analysis-skeleton",
      )}
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="page-skeleton-content" aria-hidden="true">
        {content}
      </div>
    </section>
  );
}
