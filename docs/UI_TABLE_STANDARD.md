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

List toolbars that include search must use the shared **`ListSearchBar`**
component (`src/components/ui/list-search-bar.tsx`), which wraps **`SearchField`**
(icon **inside** the field) plus the outline「搜尋」submit button.

- Do **not** place a loose magnifying-glass icon outside the field.
- Do **not** re-implement `.orders-search` / `.orders-search-field` markup in
  each page — import `ListSearchBar` instead.
- Prefer the canonical classes `.list-search` / `.search-field` (legacy aliases
  remain for compatibility).
- On viewports `max-width: 900px`, hide the inline search and show an icon
  trigger. Tapping it opens the shared **`SidePanel`** from the right with the
  same search form. Do not invent a second mobile search pattern per page.

## Mobile pull-to-refresh

On mobile, every data table must refresh by pulling down. Operational lists get
this from **`ListTable`** via `onRefresh` (usually `setReloadKey`). Other tables
must wrap their scroll container with **`PullToRefresh`**.

- Only activate the gesture at the top of the table scroller.
- Keep the existing table chrome (sticky header, pagination) while refreshing.
- Do not add a separate floating refresh button as a substitute on mobile.

## Loading state (skeleton)

While list data is loading, keep the **table chrome** (toolbar, sticky header,
pagination shell) and replace only the **tbody content** with skeleton rows
(`.table-skeleton-row` / `.table-skeleton-bone`). Paginated operational lists
must use `ListTable`, which owns this shell and delegates rows to
`TableSkeletonRows`.

- Do **not** replace the whole panel with a centered spinner for first load or
  refetch of operational tables.
- Match column count and approximate widths (text / badge / action variants).
- Default to the page size (15) skeleton rows.
- Expose an accessible status (`role="status"` / `aria-busy`) with sr-only copy.
- Empty and error states may still use the centered panel message.

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
- Orders, quotes, payments, products, packages, users, login logs, attachments:
  shared table shell, table-body skeleton, and mobile pull-to-refresh via
  `ListTable`.
- The same pages use toolbar search via `ListSearchBar` (inline on desktop,
  side drawer on mobile).
- Reports, dashboard jobs, role permissions, and detail inline tables wrap
  `PullToRefresh` around the same table scroller.
