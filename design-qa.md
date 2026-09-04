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

# Design QA - Customer FAQ stable first-load height

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-2dc9fd14-c9ec-4e67-b7f1-3ff1d79f62f0.png`
- Browser-rendered implementation screenshots: `D:\work\FCCD\.design-qa\customer-faq-height-reference-size.png` and `D:\work\FCCD\.design-qa\customer-faq-height-page6.png`
- Source and implementation pixels: 1497 x 1270 for the primary comparison; page-six verification used 1556 x 1270.
- CSS viewport: 1497 x 1270 and 1556 x 1270 at device scale factor 1.
- State: Traditional Chinese FAQ settings page, both the populated first page and the short three-row final page.

## Full-view comparison evidence

The revised first page matches the compact source composition: the auto-reply toolbar remains 70 px tall and the FAQ/chat region starts at y=218. On the three-row final page the same geometry is retained instead of distributing unused height into the toolbar.

## Focused region comparison evidence

Browser geometry measured `grid-template-rows` as `70px 1032px` on both page 1 and page 6 at 1556 x 1270. The toolbar and lower layout therefore remain stable regardless of result count. A separate crop was unnecessary because the affected toolbar and both panel boundaries are fully visible in the full-page captures.

## Required fidelity surfaces

- Fonts and typography: unchanged from the existing FCCD interface.
- Spacing and layout rhythm: the toolbar uses its content height while the FAQ/chat layout owns the remaining viewport height.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: existing logo, icons, and chat background remain unchanged and crisp.
- Copy and content: all labels, FAQ rows, status badges, and chat copy remain unchanged.

## Findings

No actionable P0, P1, or P2 issue remains. At narrower desktop widths the toolbar may wrap naturally to fit its controls; this is intentional responsive behavior rather than content-dependent stretching.

## Primary interactions and console

- Navigated from page 1 through page 6 and confirmed identical vertical geometry.
- Reloaded the route and confirmed the final layout returns to the same dimensions.
- Browser console errors: none.

## Comparison history

- Pass 1: identified that `auto auto` grid tracks stretched when the lower result set was short.
- Fix: changed the tracks to `max-content minmax(0, 1fr)` and constrained the desktop page to the available viewport.
- Pass 2: matched the compact source at 1497 x 1270 and confirmed page 1/page 6 both resolve to 70 px + 1032 px at 1556 x 1270.

final result: passed

---

# Design QA - Customer FAQ mobile chat side panel

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-8167f6ad-4259-418f-9575-eeeaf70cfade.png`
- Browser-rendered implementation screenshots: `D:\work\FCCD\.design-qa\customer-faq-mobile-chat-trigger.png` and `D:\work\FCCD\.design-qa\customer-faq-mobile-chat-panel.png`
- Source pixels: 430 x 932. Implementation pixels and CSS viewport: 430 x 932 at device scale factor 1.
- State: Traditional Chinese mobile FAQ settings page, closed trigger state and open WhatsApp-style tester state.

## Full-view comparison evidence

The inline tester that previously extended below the clipped mobile viewport is removed from the page flow. A compact tester button now sits with the other customer-service controls and opens the conversation as a full-height panel from the right.

## Focused region comparison evidence

In the open state the panel measured 430 x 932, the composer measured 62 px high with its bottom at 932 px, and the message region retained 810 px of independently scrollable height. The input received focus when opened.

## Required fidelity surfaces

- Fonts and typography: existing FCCD and conversation typography remain unchanged.
- Spacing and layout rhythm: the trigger follows the existing outlined action style; the open panel keeps the contact header at the top and composer at the viewport bottom.
- Colors and visual tokens: existing green controls, white panel chrome, and warm chat background remain unchanged.
- Image quality and asset fidelity: the FC Catering logo, Lucide controls, and existing chat pattern remain crisp.
- Copy and content: the existing tester title, reset action, empty message, and composer labels are preserved.

## Findings

No actionable P0, P1, or P2 issue remains. The mobile tester intentionally uses the full screen so the software keyboard has maximum usable conversation space.

## Primary interactions and console

- Opened the tester from the new mobile button; input automatically focused.
- Entered and sent a test message; the input cleared, two transcript messages rendered, and the transcript remained at the bottom.
- Closed the panel from its header and confirmed the underlying FAQ page returned.
- Browser console errors: none.

## Comparison history

- Pass 1: the inline 732 px tester placed its composer at y=970-1032 inside a 932 px viewport while the main content clipped overflow.
- Fix: removed the tester from mobile document flow and presented it as a fixed, full-height side panel with a dedicated trigger and close action.
- Pass 2: composer is fully visible at y=870-932 and all tested controls work.

## Verification

- `npx vitest run test/customer-faq-settings.test.tsx`: 6 tests passed.

final result: passed

---

# Design QA - AI 成效報告與學習 80% 分析側欄

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-75fdb885-44b1-460d-a431-18bbd6b4a6b2.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\customer-service-insights-80-percent.png`
- Combined comparison evidence: `D:\work\FCCD\customer-service-insights-comparison.png`
- Source pixels: 1408 x 1270. Implementation pixels: 1408 x 1270.
- CSS viewport: 1408 x 1270 at device scale factor 1.
- State: Traditional Chinese FAQ settings page with the AI effectiveness and learning panel open, zero handoffs, one daily report, zero AI suggestions, and two review turns.

## Full-view comparison evidence

The reference used a narrow 440 px text-heavy drawer. The implementation intentionally expands the analysis workspace to 1126.39 px in a 1408 px viewport, exactly 80%, while retaining the right-side drawer interaction. The information is grouped into a warning-accented handoff summary, report-date toolbar, green KPI card, blue AI suggestions card, purple two-column review queue, and a lower model-lab section.

## Focused region comparison evidence

The full-view comparison keeps both source and implementation at identical pixel dimensions, so the sidebar proportion, KPI density, title hierarchy, card spacing, controls, and review actions are all readable without a separate crop. Browser geometry confirmed the panel spans x=281.61 through x=1408 and the mobile fallback spans the full 700 px viewport in one content column.

## Required fidelity surfaces

- Fonts and typography: the existing FCCD CJK font stack is retained; section titles use stronger weight, explanatory copy is muted, and KPI figures are enlarged and colored green for fast scanning.
- Spacing and layout rhythm: the desktop panel is 80% wide, uses a 12-column dashboard grid, 18 px section gaps, compact toolbar spacing, and two-column review cards. At 1100 px sections stack; at 720 px the panel becomes full width.
- Colors and visual tokens: the existing white, muted green, border, and primary tokens remain, with restrained amber, green, blue, purple, and slate accents identifying functional sections.
- Image quality and asset fidelity: the existing FC Catering logo and repository icon system remain unchanged and crisp; no new image assets or placeholder graphics were introduced.
- Copy and content: all existing report dates, metrics, handoff guidance, AI suggestions, review questions, answers, feedback controls, and model-lab content are preserved.

## Findings

No actionable P0, P1, or P2 issue remains. The empty AI-suggestion region intentionally stays compact rather than stretching to fill the KPI card height; this is an acceptable P3 density choice that keeps empty states visually quiet.

## Primary interactions and console

- Opened the AI effectiveness panel from the FAQ page, closed it, and reopened it successfully.
- Confirmed the report-date control remains visible and the existing actions remain available.
- Verified the desktop panel width is exactly 80% and the 700 px responsive state is full width with one content column.
- Browser console errors and warnings: none.

## Comparison history

- Pass 1: widened the original narrow drawer and reorganized the same content into dashboard sections with visual accents, KPI hierarchy, and side-by-side review cards. The equal-size comparison found no remaining P0/P1/P2 issue.

## Verification

- `npx tsc -b --pretty false`: passed.
- Browser geometry, responsive fallback, open/close interaction, and console checks: passed.

final result: passed

---

# Design QA - Customer-service logic panel stacked layout

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-5135e2ea-7563-4e42-8031-0d874d1e6b67.png`
- Browser-rendered state: Traditional Chinese FAQ settings page with the intelligent reply logic panel open.
- Target change: replace the two-column editor with a vertical stack and make the desktop side panel 50% of the viewport.

## Comparison evidence

The rendered panel measured 640 px in a 1280 px viewport, exactly 50%. The logic editor resolved to one 588 px grid column. Its two sections render sequentially, with the intent section beginning at y=106 and the reply section beginning at y=813. Existing fields, switches, footer actions, colors, typography, borders, and responsive full-width mobile fallback remain unchanged.

## Findings

No actionable P0, P1, or P2 differences remain for the requested layout change. Browser console errors and warnings: none.

## Verification

- `npm run lint -- --pretty false`: passed.
- Browser geometry: panel ratio `0.5`; editor grid columns `588px`; two vertically separated sections.

final result: passed

---

# Design QA - All sales and costs monthly-by-type comparison

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-5a6e3a04-ce4d-43c6-a424-f07290c97927.png`
- Browser-rendered implementation screenshots: `D:\work\FCCD\.design-qa\kitchen-sales-cost-transposed-merged-final.png` and `D:\work\FCCD\.design-qa\kitchen-sales-cost-transposed-merged-full.png`
- Source pixels: 1064 x 894. Implementation viewport: 2048 x 894 at device scale factor 1; the full report remained horizontally contained after the type column was transposed.
- State: Traditional Chinese, light theme, populated report, 2025 and 2026 selected.

## Full-view comparison evidence

The report now follows the requested reading direction: months run across the header, categories run down the left, and the selected years remain merged inside each monthly cell. 2025 uses the orange tone and 2026 uses the dark tone. Marketing remains a visible category row.

## Focused region comparison evidence

The January Google cell contains both `2025 $74,792 13%` and `2026 $37,010 16%`. Ratio values are calculated against that year's monthly Sales; annual totals use that year's total Sales. DOM geometry checks found zero amount/ratio overlaps and no horizontal overflow at the 2048 x 894 desktop viewport.

## Required fidelity surfaces

- Fonts and typography: existing FCCD font stack retained; amounts render at 11.52 px, year labels at 10.24 px, and ratios at 9.28 px to keep the merged cells legible.
- Spacing and layout rhythm: one sticky type column, twelve month columns, one total column, alternating report stripes, and the existing left year filter are preserved.
- Colors and visual tokens: existing report header, stripe, border, primary, and year-tone tokens are used; selected-year values are visually distinguishable.
- Image quality and asset fidelity: existing logo and Lucide icons remain unchanged; no new raster assets were required.
- Copy and content: Sales, Google, Facebook, Delivery charge, Food cost, Packing, Rent, Wages, Miscellaneous, Water, Electricity, Shopify, Marketing, and 銷售淨額 remain present.

## Findings

No actionable P0, P1, or P2 differences remain for the requested report view. The source image is a compact report crop while the implementation retains the application shell and left-side year filter; this is an intentional continuation of the previous layout request and is classified as P3.

## Primary interactions and console

- Unchecked 2026: only the 2025 value remained in the merged Google/January cell.
- Rechecked 2026: both year values returned with their separate colors.
- Verified the 14 category/type rows and all 14 month/total headers, including Marketing.
- Browser console errors and warnings: none.

## Comparison history

- Pass 1: transposed the report from month rows/category columns to month columns/category rows.
- Pass 2: restored merged selected-year values inside each cell with distinct year colors and added monthly/annual ratio values.
- Pass 3: removed the legacy cell minimum width that caused a 15 px overflow and verified zero amount/ratio overlaps.

## Verification

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-sales-cost-report.test.ts test/kitchen-channel-sales-report-page.test.tsx`: 4 tests passed.
- `npm run lint`: passed.
- `npm run check:edge-functions`: passed.
- `npx vite build`: passed.
- The full `npm run build` reached the complete test suite but remains blocked by five pre-existing `quote-pdf-editor` failures; no report test failed.

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

---

# Design QA - Report AI floating trigger alignment

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-46853114-6bf8-40c9-8276-227197c38c43.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\.design-qa\kitchen-sales-cost-ai-right-final.png`
- Source pixels: 1972 x 830. Implementation CSS viewport: 1972 x 830 at device scale factor 1.
- State: Traditional Chinese, light theme, all-sales-and-costs report populated.

## Full-view comparison evidence

The source highlighted the AI trigger appearing at the lower-left edge of the report content. The revised implementation puts the trigger at the lower-right edge, matching the other report pages and avoiding overlap with the left-side year filter.

## Focused region comparison evidence

Browser geometry measured the all-sales-and-costs trigger at `right: 39px`, `bottom: 24px`, `position: fixed`. Product sales, channel sales, and advertising performance were also checked; all four report routes now resolve to the right side with no left-side override.

## Required fidelity surfaces

- Fonts and typography: AI label, button size, and close affordance remain unchanged.
- Spacing and layout rhythm: desktop and mobile safe-area offsets remain intact; only the horizontal anchor changed.
- Colors and visual tokens: existing green AI button, white close control, border, and shadow are unchanged.
- Image quality and asset fidelity: existing AI control and Lucide close icon remain unchanged; no new assets were introduced.
- Copy and content: existing AI open/close accessible labels remain unchanged.

## Findings

No actionable P0, P1, or P2 issues remain. The AI trigger is consistently right-aligned across the four central-kitchen report pages.

## Primary interactions and console

- Checked all-sales-and-costs, product-sales, channel-sales, and advertising-performance routes.
- Confirmed each route rendered the floating trigger on the right and no console errors or warnings were recorded.

## Verification

- `npm run lint`: passed.
- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-channel-sales-report-page.test.tsx`: passed.

final result: passed

---

# Design QA - Percentage readability in the merged comparison table

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-f2792ff6-0f99-4bd3-9984-35b95cf69d5c.png` and `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-88ad2e3d-b7ed-42cf-ab06-f4807ad5ff51.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\.design-qa\kitchen-sales-cost-percentage-spacing-final.png`
- Source pixels: 1244 x 700. Implementation CSS viewport: 2048 x 894 at device scale factor 1.
- State: Traditional Chinese, light theme, populated all-sales-and-costs report, 2025 and 2026 selected.

## Full-view comparison evidence

The merged year comparison remains in each monthly cell with the existing orange 2025 and dark 2026 tones. Each selected year now presents the amount first and its percentage on a dedicated line below it, with a subtle top divider so the ratio is readable at a glance.

## Focused region comparison evidence

The Google January cell visibly separates `2025 $74,792` from `13%` and `2026 $37,010` from `16%`. Browser geometry measured zero overflowing comparison values and no table horizontal overflow at the verification viewport.

## Required fidelity surfaces

- Fonts and typography: existing report typography and numeric tabular styling remain in use; percentage labels are emphasized slightly for legibility.
- Spacing and layout rhythm: comparison values use a two-line amount/percentage rhythm within the same year block; table columns and category order are unchanged.
- Colors and visual tokens: 2025/2026 color differentiation and report table backgrounds remain unchanged.
- Image quality and asset fidelity: existing logo, icons, and AI control remain unchanged; no new assets were introduced.
- Copy and content: all categories, including Marketing, remain rendered; no data or labels were removed.

## Findings

No actionable P0, P1, or P2 issues remain. The percentage is no longer visually attached to the amount or allowed to overlap it.

## Primary interactions and console

- Confirmed the 2025 and 2026 merged comparison content remains visible in the same cells.
- Browser console errors: 0.
- Browser console warnings: 0.

## Verification

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-channel-sales-report-page.test.tsx`: 2 test files and 2 tests passed.
- `npm run lint`: passed.
- `npx vite build`: passed.

final result: passed

---

# Design QA - Larger report typography and red percentages

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-72c3bf45-b468-4cbe-9030-81e9c5a4d8b0.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\.design-qa\kitchen-sales-cost-font-red-percentage-1920.png`
- Source pixels: 1904 x 951. Implementation CSS viewport: 1920 x 894 at device scale factor 1.
- State: Traditional Chinese, light theme, populated all-sales-and-costs report, 2025 and 2026 selected.

## Full-view comparison evidence

Report year labels, amounts, and percentages were increased for readability. Percentages now use the destructive red token while 2025/2026 amount colors remain orange and dark for year comparison.

## Focused region comparison evidence

The Google January cell reads `2025 $74,792 | 13%` and `2026 $37,010 | 16%`; browser geometry found zero amount/percentage overlaps and zero overflowing comparison values after the size increase.

## Required fidelity surfaces

- Fonts and typography: year labels are 11.2 px, amounts are 11.84 px, and percentages are 9.92 px at the desktop verification viewport.
- Spacing and layout rhythm: year labels occupy their own line and amount/percentage share the second line, preventing long amounts from colliding with ratios.
- Colors and visual tokens: percentages use `var(--destructive)`; existing year tones and report backgrounds remain unchanged.
- Image quality and asset fidelity: existing logo, icons, and AI control remain unchanged; no new assets were introduced.
- Copy and content: values, year selections, categories, and summary rows remain unchanged.

## Findings

No actionable P0, P1, or P2 issues remain. The typography is more legible and percentages are visually distinct through both color and spacing.

## Primary interactions and console

- Confirmed the merged 2025/2026 values remain in the same cells.
- Confirmed the table retains no horizontal overflow and the page remains viewport-contained at 1920 px.
- Browser console errors: 0.
- Browser console warnings: 0.

## Verification

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-channel-sales-report-page.test.tsx`: 2 test files and 2 tests passed.
- `npm run lint`: passed.
- `npx vite build`: passed.

final result: passed

---

# Design QA - Clean merged-cell hierarchy

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-3a802c3c-edf0-423d-a9b8-f9b1895db3df.png`
- Browser-rendered implementation screenshots: `D:\work\FCCD\.design-qa\kitchen-sales-cost-clean-layout-1920.png` and `D:\work\FCCD\.design-qa\kitchen-sales-cost-clean-layout-1920-scrolled.png`
- Source pixels: 1904 x 951. Implementation CSS viewport: 1920 x 894 at device scale factor 1.
- State: Traditional Chinese, light theme, populated all-sales-and-costs report, 2025 and 2026 selected.

## Full-view comparison evidence

The table no longer repeats `2025` and `2026` inside every cell. A single legend explains the orange 2025 row, dark 2026 row, and red percentage values, leaving each cell focused on the amount and ratio.

## Focused region comparison evidence

The Google January cell reads as two clean value lines with the red ratios separated by a vertical rule. The scrolled state shows the lower categories, including Marketing, while the sticky 銷售淨額 row remains visible at the bottom.

## Required fidelity surfaces

- Fonts and typography: amount and percentage text remain enlarged from the previous version; year labels are retained in accessible labels and the visible legend.
- Spacing and layout rhythm: removing repeated year text gives the amount and ratio a wider, calmer reading area without changing the month/category matrix.
- Colors and visual tokens: 2025 and 2026 amount colors remain unchanged; percentages use the destructive red token.
- Image quality and asset fidelity: existing logo, icons, and AI control remain unchanged; no new assets were introduced.
- Copy and content: all category rows remain present, including Marketing and 銷售淨額.

## Findings

No actionable P0, P1, or P2 issues remain. The main readability issue was caused by repeated labels competing with numeric values; the legend now provides the year mapping once per table.

## Primary interactions and console

- Captured the initial view and the inner-scrolled view.
- Confirmed no horizontal overflow at 1920 px and no page-level scroll.
- Confirmed the sticky net-sales row remains visible after inner scrolling.
- Browser console errors: 0.
- Browser console warnings: 0.

## Verification

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-channel-sales-report-page.test.tsx`: 2 test files and 2 tests passed.
- `npm run lint`: passed.
- `npx vite build`: passed.

final result: passed

---

# Design QA - Separated amount and percentage rows

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-61ec6cdb-c319-4363-8ecc-798167e578d4.png`
- Browser-rendered implementation screenshot: `D:\work\FCCD\.design-qa\kitchen-sales-cost-overlap-fix-1920.png`
- State: Traditional Chinese, light theme, populated all-sales-and-costs report, 2025 and 2026 selected.

## Finding

The amount and percentage now occupy separate rows within each year value. The red percentage no longer shares the amount's horizontal line, so long totals such as `$1,061,185` remain readable without painting over `26%`.

## Verification

- No geometric overlap between amount and percentage boxes; no amount text is clipped.
- Table `scrollWidth` equals `clientWidth` at 1920 px, and the page has no horizontal overflow.
- The net-sales footer remains sticky at the bottom of the inner table scroll area.
- Browser console errors: 0.
- Browser console warnings: 0.

## Automated checks

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-channel-sales-report-page.test.tsx`: passed.
- `npm run lint`: passed.
- `npx vite build`: passed.

final result: passed

---

# Design QA - Fixed report viewport and sticky net-sales summary

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-72c3bf45-b468-4cbe-9030-81e9c5a4d8b0.png`
- Browser-rendered implementation screenshots: `D:\work\FCCD\.design-qa\kitchen-sales-cost-sticky-net-1920.png` and `D:\work\FCCD\.design-qa\kitchen-sales-cost-sticky-net-1920-scrolled.png`
- Source pixels: 1904 x 951. Implementation CSS viewport: 1920 x 894 at device scale factor 1.
- State: Traditional Chinese, light theme, populated all-sales-and-costs report, 2025 and 2026 selected.

## Full-view comparison evidence

The report now fits the desktop viewport without page-level scrolling. The year filter is a compact 176 px side panel, the comparison table fills the remaining width, and the table owns the vertical scroll region.

## Focused region comparison evidence

The table has no horizontal overflow at 1920 px: its `scrollWidth` equals its `clientWidth` at 1424 px. After the inner table scroll reached `scrollTop: 403`, the `tfoot` net-sales cells remained sticky at the scroll viewport bottom (`top: 793.78px`, `bottom: 872.53px`, viewport bottom `873px`). The scrolled screenshot shows the lower categories, including Marketing, while the net-sales row stays visible.

## Required fidelity surfaces

- Fonts and typography: existing report font stack, numeric formatting, and percentage hierarchy remain unchanged.
- Spacing and layout rhythm: the left year filter is compressed without removing the year choices; the report uses the available desktop height and reserves the bottom summary row.
- Colors and visual tokens: existing report header, stripe, year colors, and net-summary tokens remain in use.
- Image quality and asset fidelity: existing logo, icons, and AI control remain unchanged; no new assets were introduced.
- Copy and content: all categories remain present, including Marketing and 銷售淨額.

## Findings

No actionable P0, P1, or P2 issues remain. The page-level scrollbar is removed for desktop report use, while the table retains an intentional internal vertical scrollbar and a fixed bottom summary.

## Primary interactions and console

- Scrolled the table internally and confirmed the net-sales summary remains visible.
- Confirmed the year selector remains interactive and the merged 2025/2026 values remain in the same cells.
- Browser console errors: 0.
- Browser console warnings: 0.

## Verification

- `npm run test:target -- test/kitchen-sales-cost-report-page.test.tsx test/kitchen-channel-sales-report-page.test.tsx`: 2 test files and 2 tests passed.
- `npm run lint`: passed.
- `npx vite build`: passed.

final result: passed

---

# Customer FAQ Mobile Chat Design QA

## Evidence

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-07e8f1e4-55c7-460a-9da7-09de0ef9e0f6.png`
- Implementation screenshot: `D:\work\FCCD\customer-faq-mobile-populated-final.png`
- Source pixels: 410 x 1009
- Implementation pixels: 425 x 1017
- CSS viewport: 425 x 1017
- Device scale factor: 1
- State: authenticated mobile FAQ page with a populated multi-turn conversation scrolled to its newest message

## Full View Comparison

The implementation preserves the reference hierarchy: compact Food Channels contact header, reset icon at the upper right, simulated phone control, warm patterned conversation canvas, white inbound bubbles, green outbound bubbles, delivery checks, timestamps, and a rounded composer fixed below the conversation viewport. The surrounding FCCD navigation remains visible because it belongs to the existing application shell rather than the chat component.

## Focused Region Comparison

A separate focused crop was not needed because the chat component, message typography, metadata, scrollbar, header controls, and composer are all legible in the full mobile capture.

## Fidelity Review

- Fonts and typography: existing application font stack remains readable and closely matches the compact mobile reference hierarchy.
- Spacing and layout rhythm: message gaps, bubble padding, header height, phone row, and composer proportions align with the reference. Long conversations remain inside the chat viewport.
- Colors and visual tokens: warm ivory canvas, white incoming bubbles, pale green outgoing bubbles, muted metadata, blue checks, and green send action match the intended chat language.
- Image quality and assets: the project FC Catering logo is used for the contact avatar. The generated catering doodle background is sharp, low contrast, and contains no copied WhatsApp trademark.
- Copy and content: existing testing labels and AI or rule evidence remain visible without disrupting the conversational presentation.

## Comparison History

1. Initial mobile capture showed the header moving out of view when the outer page followed the focused composer. The mobile panel height was reduced to keep its header, phone control, conversation, and composer inside the available application viewport.
2. Final populated capture shows the contact header and phone control, keeps the composer visible, and reports `atBottom: true` with a 1,555 px conversation inside a 649 px scroll viewport.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested chat component. The FCCD application header and explanatory note above the panel are intentional existing-shell content.

## Primary Interactions Tested

- Reset control remains available from the upper-right refresh icon with the accessible name and tooltip `重新開始對話`.
- Message input and send action work at mobile width.
- Emoji insertion works.
- Repeated replies grow the transcript inside the chat panel.
- New customer messages, waiting state, and completed replies automatically scroll the conversation to the bottom.
- Browser console error check returned no errors.

## Follow Up Polish

The current generated background is intentionally lighter and more catering-specific than WhatsApp's proprietary pattern.

final result: passed
