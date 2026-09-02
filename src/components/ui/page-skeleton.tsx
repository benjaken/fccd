import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

export type PageSkeletonVariant =
  | "permission"
  | "detail"
  | "dashboard"
  | "sales-dashboard"
  | "queue"
  | "profile"
  | "table"
  | "report"
  | "analysis";

type PageSkeletonProps = {
  label: string;
  variant?: PageSkeletonVariant;
  cards?: 2 | 3;
  detailLayout?: "default" | "document" | "product";
  documentType?: "quote" | "order";
  documentMode?: "detail" | "edit";
  analysis?: boolean;
  showSummary?: boolean;
  compact?: boolean;
  tableRows?: number;
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
  tableRows = 6,
  copyLines,
}: {
  fields?: number;
  tableColumns?: number;
  tableRows?: number;
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
        <div className="table-wrap detail-inline-table">{table(tableColumns, tableRows)}</div>
      ) : null}
      {copyLines
        ? Array.from({ length: copyLines }, (_, index) => (
            <span key={index}>{bone("detail-skeleton-copy")}</span>
          ))
        : null}
    </article>
  );
}

function documentDetailField(documentMode: "detail" | "edit") {
  return (
    <div className="quote-readonly-field document-detail-skeleton-field">
      {bone("document-detail-skeleton-label")}
      {bone(cn(
        "document-detail-skeleton-value",
        documentMode === "edit" && "document-detail-skeleton-input",
      ))}
    </div>
  );
}

function documentDetailColumn(fields: number, documentMode: "detail" | "edit") {
  return (
    <div className="quote-editor-form-column document-detail-skeleton-column">
      <h2>
        {bone("detail-skeleton-icon")}
        {bone("detail-skeleton-card-title")}
      </h2>
      {Array.from({ length: fields }, (_, index) => (
        <span key={index}>{documentDetailField(documentMode)}</span>
      ))}
    </div>
  );
}

function documentDetailTabs(documentType: "quote" | "order") {
  const tabCount = documentType === "order" ? 3 : 2;
  return (
    <nav className={cn(
      "quote-editor-tabs document-detail-skeleton-tabs",
      documentType === "quote" && "is-quote",
    )}>
      {Array.from({ length: tabCount }, (_, index) => (
        <div className="document-detail-skeleton-tab" key={index}>
          {bone("detail-skeleton-icon")}
          <div>
            {bone("document-detail-skeleton-tab-label")}
            {bone("document-detail-skeleton-tab-title")}
          </div>
        </div>
      ))}
    </nav>
  );
}

function documentDetailAddProductSkeleton() {
  return (
    <article className="panel quote-item-form document-detail-skeleton-add">
      <header>
        <div className="content-skeleton-stack">
          {bone("content-skeleton-eyebrow")}
          {bone("detail-skeleton-card-title")}
        </div>
      </header>
      <div className="document-detail-skeleton-add-fields">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="document-detail-skeleton-add-field" key={index}>
            {bone("document-detail-skeleton-label")}
            {bone("document-detail-skeleton-input")}
          </div>
        ))}
      </div>
      <footer>
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index}>{bone("document-detail-skeleton-button")}</span>
        ))}
      </footer>
    </article>
  );
}

function documentDetailPaymentsSkeleton() {
  return (
    <article className="panel quote-payment-step document-detail-skeleton-payments">
      <header>
        {bone("detail-skeleton-icon")}
        {bone("detail-skeleton-card-title")}
      </header>
      <div className="document-detail-skeleton-payment-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="document-detail-skeleton-payment-field" key={index}>
            {bone("document-detail-skeleton-label")}
            {bone("document-detail-skeleton-value")}
          </div>
        ))}
      </div>
    </article>
  );
}

function documentDetailSkeleton(
  documentType: "quote" | "order",
  documentMode: "detail" | "edit",
) {
  const isOrder = documentType === "order";
  const isEdit = documentMode === "edit";

  return (
    <>
      {detailHeading()}
      {documentDetailTabs(documentType)}
      <section className={cn(
        "panel quote-editor-form document-detail-skeleton",
        !isEdit && "quote-editor-readonly-form",
      )}>
        {documentDetailColumn(10, documentMode)}
        {documentDetailColumn(9, documentMode)}
      </section>
      {isEdit ? (
        <div className="quote-items-layout document-detail-skeleton-items-layout">
          {documentDetailAddProductSkeleton()}
          <article className="panel quote-lines-panel document-detail-skeleton-items">
            <header>
              <div className="content-skeleton-stack">
                {bone("content-skeleton-eyebrow")}
                {bone("detail-skeleton-card-title")}
              </div>
              {bone("document-detail-skeleton-total")}
            </header>
            {table(7, 6)}
          </article>
        </div>
      ) : (
        <article className="panel quote-lines-panel quote-lines-readonly-panel document-detail-skeleton-items">
          <header>
            <div className="content-skeleton-stack">
              {bone("content-skeleton-eyebrow")}
              {bone("detail-skeleton-card-title")}
            </div>
            {bone("document-detail-skeleton-total")}
          </header>
          {table(7, 6)}
        </article>
      )}
      {isOrder ? documentDetailPaymentsSkeleton() : null}
    </>
  );
}

function productDetailSkeleton() {
  return (
    <>
      {detailHeading()}
      <article className="panel detail-card detail-skeleton-card product-detail-summary-skeleton">
        <header>{bone("detail-skeleton-card-title")}</header>
        <div className="product-detail-summary-skeleton-body">
          {bone("product-detail-image-skeleton")}
          <div className="product-detail-summary-skeleton-fields">{detailFields(8)}</div>
        </div>
        {bone("detail-skeleton-copy")}
      </article>
      <section className="detail-grid product-material-grid product-material-grid-skeleton">
        {detailCard({ tableColumns: 2, tableRows: 2 })}
        {detailCard({ tableColumns: 2, tableRows: 2 })}
        {detailCard({ tableColumns: 3, tableRows: 2 })}
      </section>
      {detailCard({ fields: 1 })}
      {detailCard({ tableColumns: 2 })}
    </>
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
      <section className="orders-dashboard-grid">
        {Array.from({ length: 6 }, (_, index) => (
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
      <section className="orders-dashboard-queue-grid">
        {Array.from({ length: 5 }, (_, panelIndex) => (
          <article
            className="panel queue-panel content-skeleton-panel"
            key={panelIndex}
          >
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
    </>
  );
}

function salesDashboardSkeleton() {
  return (
    <>
      {heading({ action: false })}
      <article className="panel home-sales-panel home-sales-skeleton-panel">
        <header className="panel-header home-sales-skeleton-header">
          <div className="content-skeleton-stack">
            {bone("content-skeleton-section-title")}
            {bone("detail-skeleton-description")}
          </div>
          <div className="home-sales-skeleton-actions">
            {bone("content-skeleton-filter")}
            {bone("content-skeleton-section-title")}
          </div>
        </header>
        {table(9, 9)}
      </article>
      <article className="panel home-sales-panel home-sales-skeleton-panel">
        <header className="panel-header home-sales-skeleton-header">
          <div className="content-skeleton-stack">
            {bone("content-skeleton-section-title")}
            {bone("detail-skeleton-description")}
          </div>
          {bone("content-skeleton-section-title")}
        </header>
        {table(5, 6)}
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

function reportSkeleton(
  analysis: boolean,
  showSummary: boolean,
  tableRows: number,
) {
  return (
    <>
      {showSummary ? (
        <section className="shop-order-summary">
          {Array.from({ length: 4 }, (_, index) => (
            <article className="panel content-skeleton-summary" key={index}>
              {bone("content-skeleton-label")}
              {bone("content-skeleton-number")}
              {bone("content-skeleton-copy")}
            </article>
          ))}
        </section>
      ) : null}
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
        {table(5, tableRows)}
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
  detailLayout = "default",
  documentType = "order",
  documentMode = "detail",
  analysis = false,
  showSummary = true,
  compact = false,
  tableRows = 10,
}: PageSkeletonProps) {
  const content =
    variant === "detail"
      ? detailLayout === "document"
        ? documentDetailSkeleton(documentType, documentMode)
        : detailLayout === "product"
          ? productDetailSkeleton()
        : detailSkeleton(cards)
      : variant === "dashboard"
        ? dashboardSkeleton()
        : variant === "sales-dashboard"
          ? salesDashboardSkeleton()
        : variant === "queue"
          ? queueSkeleton()
          : variant === "profile"
            ? profileSkeleton()
            : variant === "table"
              ? tableSkeleton()
              : variant === "report"
                ? reportSkeleton(analysis, showSummary, tableRows)
                : variant === "analysis"
                  ? analysisSkeleton()
                  : permissionSkeleton();

  return (
    <section
      className={cn(
        "page-skeleton-root",
        variant === "permission" && !compact && "page-skeleton",
        variant === "detail" && "detail-page detail-page-skeleton",
        variant === "detail" &&
          detailLayout === "document" &&
          "quote-editor-page quote-detail-readonly document-detail-page-skeleton",
        variant === "dashboard" && "dashboard-skeleton",
        variant === "sales-dashboard" && "home-sales-dashboard home-sales-skeleton",
        variant === "queue" && "follow-up-page content-page-skeleton",
        variant === "profile" && "profile-page content-page-skeleton",
        variant === "report" && "report-content-skeleton",
        variant === "report" &&
          !showSummary &&
          "report-content-skeleton-table-only",
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
