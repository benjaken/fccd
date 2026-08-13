import { TableSkeletonRows } from "@/components/ui/table-skeleton";

function LoadingStatus({ label }: { label: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  );
}

function Bone({ className = "" }: { className?: string }) {
  return <span className={`page-skeleton-bone ${className}`} />;
}

export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="dashboard-skeleton" aria-busy="true">
      <LoadingStatus label={label} />
      <header className="page-heading" aria-hidden="true">
        <div className="content-skeleton-stack">
          <Bone className="content-skeleton-eyebrow" />
          <Bone className="content-skeleton-title" />
        </div>
        <Bone className="content-skeleton-actions" />
      </header>
      <section className="metrics-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="metric-card content-skeleton-card" key={index}>
            <Bone className="content-skeleton-icon" />
            <div className="content-skeleton-stack">
              <Bone className="content-skeleton-label" />
              <Bone className="content-skeleton-number" />
              <Bone className="content-skeleton-copy" />
            </div>
          </article>
        ))}
      </section>
      <section className="dashboard-grid" aria-hidden="true">
        {Array.from({ length: 2 }, (_, panelIndex) => (
          <article className="panel content-skeleton-panel" key={panelIndex}>
            <Bone className="content-skeleton-section-title" />
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div className="content-skeleton-row" key={rowIndex}>
                <Bone className="content-skeleton-dot" />
                <Bone className="content-skeleton-row-label" />
                <Bone className="content-skeleton-count" />
              </div>
            ))}
          </article>
        ))}
      </section>
      <article className="panel jobs-panel" aria-hidden="true">
        <div className="panel-header">
          <Bone className="content-skeleton-section-title" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{Array.from({ length: 6 }, (_, i) => <th key={i}>&nbsp;</th>)}</tr>
            </thead>
            <tbody>
              <TableSkeletonRows rows={6} columns={6} />
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

export function QueuePageSkeleton({ label }: { label: string }) {
  return (
    <section className="follow-up-page content-page-skeleton" aria-busy="true">
      <LoadingStatus label={label} />
      <header className="page-heading" aria-hidden="true">
        <div className="content-skeleton-stack">
          <Bone className="content-skeleton-eyebrow" />
          <Bone className="content-skeleton-title" />
        </div>
      </header>
      <article className="panel follow-up-panel" aria-hidden="true">
        <div className="queue-list">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="queue-item content-skeleton-row" key={index}>
              <Bone className="content-skeleton-dot" />
              <Bone className="content-skeleton-row-label" />
              <Bone className="content-skeleton-count" />
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function ProfileSkeleton({ label }: { label: string }) {
  return (
    <section className="profile-page content-page-skeleton" aria-busy="true">
      <LoadingStatus label={label} />
      <header className="page-heading" aria-hidden="true">
        <div className="content-skeleton-stack">
          <Bone className="content-skeleton-eyebrow" />
          <Bone className="content-skeleton-title" />
        </div>
        <Bone className="content-skeleton-button" />
      </header>
      <article className="profile-summary" aria-hidden="true">
        <Bone className="content-skeleton-avatar" />
        <div className="content-skeleton-stack">
          <Bone className="content-skeleton-name" />
          <Bone className="content-skeleton-copy" />
        </div>
        <Bone className="content-skeleton-badge" />
      </article>
      <div className="profile-grid" aria-hidden="true">
        {Array.from({ length: 2 }, (_, cardIndex) => (
          <article className="profile-card content-skeleton-panel" key={cardIndex}>
            <Bone className="content-skeleton-section-title" />
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div className="content-skeleton-field" key={rowIndex}>
                <Bone className="content-skeleton-icon" />
                <div className="content-skeleton-stack">
                  <Bone className="content-skeleton-label" />
                  <Bone className="content-skeleton-value" />
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

export function TablePanelSkeleton({
  label,
  columns = 5,
}: {
  label: string;
  columns?: number;
}) {
  return (
    <div className="content-table-skeleton" aria-busy="true">
      <LoadingStatus label={label} />
      <header className="content-skeleton-toolbar" aria-hidden="true">
        <Bone className="content-skeleton-filter" />
      </header>
      <div className="table-wrap" aria-hidden="true">
        <table>
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, i) => <th key={i}>&nbsp;</th>)}
            </tr>
          </thead>
          <tbody>
            <TableSkeletonRows rows={15} columns={columns} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportSkeleton({
  label,
  analysis = false,
}: {
  label: string;
  analysis?: boolean;
}) {
  return (
    <div className="report-content-skeleton" aria-busy="true">
      <LoadingStatus label={label} />
      <section className="shop-order-summary" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="panel content-skeleton-summary" key={index}>
            <Bone className="content-skeleton-label" />
            <Bone className="content-skeleton-number" />
            <Bone className="content-skeleton-copy" />
          </article>
        ))}
      </section>
      {analysis ? (
        <section className="meat-price-analysis-grid" aria-hidden="true">
          <article className="panel content-skeleton-analysis">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="content-skeleton-row" key={index}>
                <Bone className="content-skeleton-row-label" />
                <Bone className="content-skeleton-count" />
              </div>
            ))}
          </article>
          <article className="panel content-skeleton-chart">
            <Bone className="content-skeleton-section-title" />
            <Bone className="content-skeleton-chart-area" />
          </article>
        </section>
      ) : null}
      <article className="panel content-skeleton-report-table" aria-hidden="true">
        <div className="panel-header">
          <Bone className="content-skeleton-section-title" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{Array.from({ length: 5 }, (_, i) => <th key={i}>&nbsp;</th>)}</tr>
            </thead>
            <tbody>
              <TableSkeletonRows rows={10} columns={5} />
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

export function AnalysisPanelSkeleton({ label }: { label: string }) {
  return (
    <div className="relationship-report content-analysis-skeleton" aria-busy="true">
      <LoadingStatus label={label} />
      <div className="relationship-metrics" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index}>
            <Bone className="content-skeleton-label" />
            <Bone className="content-skeleton-number" />
          </article>
        ))}
      </div>
      <div className="content-skeleton-analysis-grid" aria-hidden="true">
        <Bone className="content-skeleton-chart-area" />
        <div className="content-skeleton-stack">
          {Array.from({ length: 6 }, (_, index) => (
            <Bone className="content-skeleton-row-label" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
