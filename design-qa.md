# Design QA — Factory board top controls and independent columns

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-ab1b4f09-f7ff-49e7-8f3d-f3e6afdb9d7b.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\.design-qa\factory-board-independent-scroll-implementation.png`
- Source pixels: 1999 × 828. Implementation pixels: 1640 × 1272.
- State: Traditional Chinese factory board with three populated date columns.

## Full-view comparison evidence

The implementation retains three distinct black date columns with fixed headers and card grids. The requested top bar is also present: logo and stocktake notice remain on one line, doubled previous/next arrows surround `去今日`, and the white `出餐日曆` / `指定日期` buttons sit immediately before the green multi-day action.

## Focused region comparison evidence

At a constrained 1600 × 500 viewport, each `.factory-day-cards` region computed to `overflow-y: auto`. The middle column measured `clientHeight: 320`, `scrollHeight: 426`; scrolling it changed only its `scrollTop` to 106 while the left and right columns remained at 0. This confirms independent vertical scrolling rather than page-level scrolling.

## Required fidelity surfaces

- Fonts and typography: existing board typography and Traditional Chinese labels remain unchanged.
- Spacing and layout rhythm: all three columns fill the available viewport height; headers stay fixed while their card regions scroll independently.
- Colors and visual tokens: black canvas, white rules, green operational actions, and white black-bordered date buttons match the latest direction.
- Image quality and asset fidelity: the existing vector logo and repository icons remain crisp.
- Copy and content: `逢星期 1 盤點`, `去今日`, `出餐日曆`, `指定日期`, and `多日菜式總表` render correctly.
- Card data: all preview cards now display `shipOutTime`, matching the production card's 出車時間 field; the dispatch sheet uses the same field in its 出車時間 column.

## Findings

No actionable P0, P1, or P2 issues remain for the requested independent scrolling and top-control layout.

## Verification

- Browser console errors: none.
- Regression tests and the production build passed before deployment.

## Comparison history

- Pass 1: confirmed that only the actively scrolled date column moves; the other two retain their positions.

final result: passed

---

# Design QA - All sales and costs multi-year matrix

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-79679775-5eeb-42e1-989c-58e1b9ca351d.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\design-qa-kitchen-sales-cost-1920x1080.png`
- Combined comparison evidence: `D:\work\FCCD\design-qa-kitchen-sales-cost-comparison.png`
- Source pixels: 1904 x 951. Implementation CSS viewport: 1920 x 1080, captured at 0.666667 scale to 1280 x 720. Combined comparison normalizes both views to 720 px height.
- State: Traditional Chinese, light theme, 2025 and 2026 selected, populated monthly sales and cost data.

## Full-view comparison evidence

The implementation adopts the requested channel-sales matrix structure: months 1–12 are the only body rows, each sales or cost column contains both selected years in the same cell, and the annual totals share one footer row. The old comparison sidebar and summary cards are absent. The year selector spans the page above the table, while the AI interpretation control is anchored to the left edge of the report content. Tabs and charts remain absent in line with the earlier report-wide requirements.

## Focused region comparison evidence

The filter, header, first-month row, and annual footer were inspected at the target desktop scale. Browser DOM checks confirmed one table, 12 month rows, `2025` and `2026` in the same first-month sales cell, zero legacy comparison sidebars, zero overview cards, and zero legacy chart components. A narrower 1280 px check confirmed the table retains horizontal scrolling rather than clipping or overlapping dense values.

## Required fidelity surfaces

- Fonts and typography: the existing FCCD CJK stack, weights, tabular numerals, compact year labels, and blue report headers are preserved; the final cell typography remains readable at the 1920 x 1080 target.
- Spacing and layout rhythm: the selector is full width above the table, month rows align horizontally, values use consistent two-line stacks, and the table fills the available report width without the former left summary rail.
- Colors and visual tokens: existing pale-blue headers, white/blue striped rows, green selected years, orange earlier-year values, and dark later-year values match the reference report language.
- Image quality and asset fidelity: the existing repository logo and icon system remain crisp; no new raster assets, placeholder imagery, custom SVGs, or CSS drawings were introduced.
- Copy and content: month, category, selected-year, annual-total, and net-sales labels are preserved and adapted to the all-sales-and-costs dataset.

## Findings

No actionable P0, P1, or P2 differences remain. The absence of the reference chart sidebar and top tabs is intentional because the user explicitly requested those removals in the current report system.

## Primary interactions and runtime checks

- Verified year checkboxes remain selectable and the filter is positioned above the table.
- Verified one shared table, 12 monthly rows, and both selected years inside the same monthly cell.
- Verified no comparison sidebar, summary overview, or chart component is rendered.
- Verified the AI interpretation control is positioned on the left.
- Browser console contained no error or warning entries; only Vite connection and React development information messages were present.

## Comparison history

- Pass 1: the initial compact table width forced year/value text to visually crowd adjacent columns at the narrower desktop check.
- Fix: removed redundant per-cell percentages and rebalanced the year/value grid and table minimum width to match the channel-sales two-value pattern.
- Pass 2: the combined 1920 x 1080 comparison shows all month rows and all sales/cost/net columns aligned with no overlapping values; no P0/P1/P2 findings remain.

## Verification

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-sales-cost-report.test.ts`: 3 tests passed.
- `npm run lint`: passed.

final result: passed

---

# Design QA - Restaurant report left filter sidebar

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-ca18849c-045d-4ed4-af3a-c092c6e36670.png` and `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-3dd78dd5-5281-4c67-99a3-14f4a93a5f71.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\design-qa-restaurant-report-sidebar.png`
- Combined comparison evidence: `D:\work\FCCD\design-qa-restaurant-report-sidebar-comparison.png`
- Source pixels: navigation crop 218 x 244 and filter toolbar 1648 x 128. Implementation CSS viewport and screenshot: 1904 x 894 at device scale factor 1.
- State: Traditional Chinese, light theme, monthly restaurant sales report with two restaurants and nine months of populated detail.

## Full-view comparison evidence

The original filter toolbar used the entire report width above the table. The revised desktop layout rotates the same controls into a 280 px left panel and gives the report detail the remaining 1554 px. The browser capture confirms both regions begin at y=20, preserve a 14 px gap, and keep the report table independently scrollable without reducing its data columns.

## Focused region comparison evidence

The combined image keeps the original 1648 x 128 toolbar at native resolution above the new full-page implementation. The period, month range, category, and restaurant controls retain their original order, labels, green selected state, border treatment, and input styling. A separate 1024 px check measured both filters and detail at 968 px wide, with the detail beginning below the filters at y=312, confirming the responsive stacked fallback.

## Required fidelity surfaces

- Fonts and typography: existing FCCD CJK font stack, 14 px filter labels, weights, table typography, wrapping, and antialiasing are unchanged.
- Spacing and layout rhythm: desktop filters now use one compact 240-280 px column; the right detail uses `minmax(0, 1fr)` and receives all remaining width. At 1100 px and below, the original top-and-bottom flow is preserved.
- Colors and visual tokens: existing white cards, pale-green segmented controls, primary green selected states, blue table headers, borders, and striped rows remain unchanged.
- Image quality and asset fidelity: existing calendar, chevron, and table assets remain repository-native and crisp; no generated images, custom SVGs, or placeholder art were introduced.
- Copy and content: all existing report labels, restaurant names, month labels, monetary values, and table headings are preserved.

## Findings

No actionable P0, P1, or P2 issue remains. Multiple restaurant chips remain horizontally scrollable inside the compact selector, matching the existing MultiSelect behavior; this is an acceptable P3 density tradeoff that protects right-side report width.

## Primary interactions and console

- Switched from monthly to daily reporting and confirmed the date-range control replaced the month inputs, then restored monthly reporting.
- Confirmed the selected-period state remained synchronized after the layout change.
- Browser console errors: none.

## Comparison history

- Pass 1: identified the P1 information-density issue from the source: the full-width top toolbar consumed vertical space while dense report tables still needed maximum horizontal room.
- Fix: added a shared desktop two-column layout for Sales, Sales and Working Hours, Sales and Salary, Sales Cost, and P&L reports; converted each filter group into a compact vertical sidebar while retaining the existing responsive breakpoint.
- Pass 2: measured the final desktop grid at 280 px + 1554 px, verified the 1024 px stacked fallback, tested period switching, and found no remaining P0/P1/P2 issue.

## Verification

- Relevant Vitest suites: 6 files, 24 tests passed.
- Browser console errors: none.

final result: passed

---

# Design QA - Restaurant stocktake loading skeleton height

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-8dee997e-9cca-4018-9344-025885960af4.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\design-qa-restaurant-stocktake-skeleton.png`
- Combined comparison evidence: `D:\work\FCCD\design-qa-restaurant-stocktake-skeleton-comparison.png`
- Source pixels: 1904 x 894; normalized content crop: 1669 x 782. Implementation pixels and CSS viewport: 1669 x 782 at device scale factor 1.
- State: Traditional Chinese, light theme, restaurant stocktake initial loading state.

## Full-view comparison evidence

The source skeleton preserved an obsolete hidden heading grid row, so both master and detail panels stopped at y=768 and left 126 px of unused viewport space. The revised browser capture removes that empty row: the skeleton measures 742 px high inside the 782 px content viewport, retaining only the intended 20 px top and bottom shell padding.

## Focused region comparison evidence

A focused crop was not needed because the change is limited to the outer page grid track. The combined full-view image keeps both normalized content regions at the same 1669 x 782 dimensions and clearly shows that the sidebar width, panel gap, summary, search, six-column table, bone sizes, radii, borders, and row rhythm remain unchanged.

## Required fidelity surfaces

- Fonts and typography: no visible text or font styles were changed; the accessible loading label remains screen-reader only.
- Spacing and layout rhythm: the obsolete heading row and 20 px grid gap were removed from the loading state, allowing the master-detail panels to fill the page shell.
- Colors and visual tokens: existing card, border, background, and skeleton tokens remain unchanged.
- Image quality and asset fidelity: no image or icon assets are present in this loading state, and no placeholders or custom vector assets were introduced.
- Copy and content: the existing loading label and all skeleton content structure remain unchanged.

## Findings

No actionable P0, P1, or P2 issues remain. The corrected skeleton now matches the loaded page's full-height master-detail composition.

## Primary interactions and console

- Loading state is non-interactive by design; `aria-busy` and the status label remain present.
- Browser console errors: none.

## Comparison history

- Pass 1: identified a P2 vertical-layout mismatch: the hidden heading track shortened the panels by 106 px and left 126 px below them including shell padding.
- Fix: removed the obsolete skeleton heading markup and set the loading page grid to one `minmax(0, 1fr)` row with zero gap.
- Pass 2: the browser-rendered skeleton measured one 742 px grid row and filled the available content height with no remaining P0/P1/P2 mismatch.

## Verification

- `npm run test -- test/restaurant-stocktakes.test.tsx`: 6 tests passed.

final result: passed

---

# Design QA - Advertising performance year alignment

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-841f30f6-781c-4ee6-a3c3-3b6b3a40d374.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\design-qa-advertising-performance-1920x1080.png`
- Combined comparison evidence: `D:\work\FCCD\design-qa-advertising-comparison.png`
- Source pixels: 2560 x 1271. Implementation CSS viewport: 1920 x 1080, captured at 0.666667 scale to 1280 x 720. Combined comparison: 2560 x 754.
- State: Traditional Chinese, light theme, Mid-Autumn Festival and January non-peak sections populated.

## Full-view comparison evidence

The 1920 x 1080 implementation keeps both advertising sections fully above the viewport fold. The requested intentional changes are visible: report tabs and both chart panels are absent, the data table receives the released width, and each selected year occupies one shared horizontal row across every channel.

## Focused region comparison evidence

Each `tr[data-advertising-year]` was inspected in the browser. Every child cell in a year row reported the same top coordinate. The final 1920-wide capture shows all five non-peak channel groups without horizontal clipping, while empty channel/year intersections retain a centered dash.

## Required fidelity surfaces

- Fonts and typography: existing FCCD Traditional Chinese and report typography are preserved; compact 12 px data text remains readable at the target viewport.
- Spacing and layout rhythm: both sections fit within 905 CSS px at the narrower 1280 px check and within the 1080 px target capture; filters and annual totals were compacted without changing their order.
- Colors and visual tokens: the existing light-blue headers, white cells, green totals, and pale-green selected states remain aligned with the reference.
- Image quality and asset fidelity: existing repository logo and icons remain crisp; no new raster assets, placeholders, custom SVGs, or CSS drawings were introduced.
- Copy and content: festival, month, year, Sales, advertising channel labels, totals, and percentages are preserved.

## Findings

No actionable P0, P1, or P2 visual issues remain. The denser row-based matrix is an intentional departure from the source because it implements the requested year alignment and chart removal.

## Primary interactions and runtime checks

- Verified year checkboxes, festival/month selects, and AI trigger remain present.
- Verified six representative kitchen, frozen-meat, and restaurant report routes render zero `.report-tabs` elements.
- Verified the advertising page renders zero chart or chart-panel elements.
- No visible Vite error overlay, alert, or broken route state appeared during navigation; the in-app surface did not expose raw console-log capture.

## Comparison history

- Pass 1: the first capture used the active dark theme and could not be compared directly with the light reference.
- Fix: switched the preview to the matching light theme and recaptured the same 1920 x 1080 state.
- Pass 2: the combined light-theme comparison showed no remaining P0, P1, or P2 issues.

## Verification

- `npm run lint`: passed.
- Relevant Vitest suites: 5 tests passed.

final result: passed

---

# Design QA - Restaurant settings list pages

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-5fb379c5-a0eb-4804-915d-9701b1440a4e.png` and `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-336f70c7-6800-4116-b6a7-322115f07966.png`
- Browser-rendered implementation screenshots: `D:\work\FCCD\.design-qa\restaurant-settings-populated-final.png` and `D:\work\FCCD\.design-qa\restaurant-settings-empty-state.png`
- Combined comparison evidence: `D:\work\FCCD\.design-qa\restaurant-settings-comparison.png`
- Source pixels: 1904 x 952. Implementation pixels: 1680 x 952. CSS viewport: 1680 x 952 at device scale factor 1. The in-app browser capped the requested 1904 px viewport at 1680 px, so the comparison preserves the desktop breakpoint and identical 952 px height while evaluating proportional horizontal layout.
- State: Traditional Chinese, light theme, restaurant settings sidebar expanded; populated table and filtered empty states checked.

## Full-view comparison evidence

The implementation matches the source structure: 235 px navigation rail, content card beginning at y=132, 72 px search/action toolbar, 620 px search field, green top-right add action, independently scrolling content region, and sticky 62 px pagination footer. The combined comparison shows the reference and filtered empty implementation in one image.

## Focused region comparison evidence

The toolbar, centered empty state, row actions, and pagination were inspected at original resolution. Search filters the visible rows after the shared debounce; an unmatched query removes the table header and presents the centered icon/title/description state while preserving the footer. The add action opens and closes the existing side panel without submitting data.

## Required fidelity surfaces

- Fonts and typography: existing FCCD CJK font stack, 14 px table and toolbar copy, 16 px empty-state title, weights, wrapping, and antialiasing remain consistent with the reference.
- Spacing and layout rhythm: card offsets, toolbar height, search width, row height, border radius, table spacing, content fill, and footer placement align with the reference at the supported desktop viewport.
- Colors and visual tokens: light neutral page background, white card, pale green fields, FCCD green primary actions, subtle borders, and neutral outlined row actions use the existing product tokens.
- Image quality and asset fidelity: the existing repository logo and Lucide icon library remain crisp; no raster placeholders, custom SVGs, CSS drawings, or generated assets were introduced.
- Copy and content: all existing page-specific Traditional Chinese labels and actions are preserved; shared search and empty-state copy is available in Traditional Chinese and English.

## Findings

No actionable P0, P1, or P2 differences remain. The empty-state icon is intentionally generic for all ten settings lists instead of the employee-specific icon shown in the staff reference; this is acceptable semantic adaptation and classified as P3.

## Primary interactions and console

- Expanded the settings navigation and verified all ten setting links remain available.
- Filtered populated rows and verified the zero-result empty state and pagination summary.
- Opened and closed the Add Restaurant side panel without submitting data.
- Browser console errors and warnings: none.

## Comparison history

- Pass 1: found the legacy red destructive row action differed from the reference's neutral outlined controls.
- Fix: scoped restaurant-settings row actions to the shared neutral outline treatment without changing delete behavior.
- Pass 2: rechecked the populated and empty states; no P0/P1/P2 issues remained.

## Verification

- `npx vitest run test/restaurant-settings-list-table.test.tsx test/system-settings.test.tsx`: 21 tests passed.
- `npx tsc -b --pretty false`: passed.

final result: passed

---

# Design QA - All sales and costs card alignment

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-862416bc-41f0-4f6b-8caa-cad1df404212.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\design-qa-kitchen-sales-cost-alignment.png`
- Combined comparison evidence: `D:\work\FCCD\design-qa-kitchen-sales-cost-alignment-comparison.png`
- Source pixels: 544 x 171. Implementation pixels and CSS viewport: 1280 x 720 at device scale factor 1; focused implementation crop: 975 x 210.
- State: Traditional Chinese, light theme, 2025 and 2026 selected.

## Findings and fix

No actionable P0, P1, or P2 issue remains. The reference shows the left sticky selector displaced downward by exactly 12 px relative to the report card, matching the legacy `top: 0.75rem` inset. The inset is now zero, so a side-by-side selector and report card share the same top edge. In the current full-width report structure, browser measurements also confirm the selector and table share the same 264 px left alignment.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: removed the 12 px sticky offset responsible for the visible misalignment; card padding and internal spacing are unchanged.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: existing logo and icons remain unchanged; no new UI assets were introduced.
- Copy and content: unchanged.

## Runtime checks

- Browser console errors: 0.
- Browser console warnings: 0.
- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx`: 1 test passed.
- `npm run lint`: passed.

final result: passed
