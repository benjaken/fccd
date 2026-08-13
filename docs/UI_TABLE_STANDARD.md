# Operational Table Presentation Standard

Use this standard for paginated operational lists. For page width, theme tokens,
progress status colors, and preview sign-in, see
[`UI_DEVELOPMENT_STANDARD.md`](UI_DEVELOPMENT_STANDARD.md).

## Required behavior

- Fetch and display **15 records per page**.
- Keep the table header visible while rows scroll.
- Scroll the table body inside its panel rather than the whole page.
- Keep previous/next pagination controls visible at the bottom of the panel.
- Show current range, total records, current page, and total pages.
- Preserve loading, empty, error, retry, and permission states inside the same
  fixed panel.
- Use server-side pagination, filtering, and sorting.
- Maintain keyboard access and responsive behavior.

## Scope

Applies to current and future paginated operational tables, including orders,
quotes, customers, products, payments, deliveries, inventory, and reports.

Small non-paginated summary tables, dashboard previews, diagrams, and migration
diagnostic matrices do not require pagination unless they become operational
lists.

## Current implementations

- Orders list: 15 rows, sticky header, independently scrolling rows, fixed
  pagination.
- Quotes list: 15 rows, sticky header, independently scrolling rows, fixed
  pagination.
