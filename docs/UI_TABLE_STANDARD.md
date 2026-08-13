# Operational Table Presentation Standard

Use this standard for paginated operational lists. For the full design system,
see [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). For page width, theme tokens,
progress status colors, and preview sign-in hard rules, see
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

## Row actions column

The last **操作 / Actions** column must stay compact and single-line:

- Lay actions out **horizontally** in one row. Do **not** stack icon+label
  buttons vertically (no column flex, no wrapping that grows row height).
- Prefer **icon-only** controls for common actions (edit, change password,
  view, delete). Use `size="icon"` with a clear `aria-label` and `title`.
- Keep the actions cell `white-space: nowrap` and right-aligned
  (`.table-actions-cell` + `.table-row-actions`).
- If a row needs many uncommon actions, put extras behind a single overflow
  menu (⋯) instead of stacking labeled buttons in the cell.
- Never put a full Primary filled button with long text inside a data row.

## Toolbar search

List toolbars that include search must **not** place a loose magnifying-glass
icon to the left of the field. Put the icon **inside** the input shell
(`.orders-search-field` / `.quotes-search-field`), then the optional「搜尋」
submit button beside it — same pattern as the topbar `.search-box`.

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
- Users list: icon-only horizontal actions in the last column (edit / change
  password).
