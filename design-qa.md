# Design QA: Order status modal and floating multi-select

## Source visual truth

- Defect screenshot: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-cae56bd0-9c7f-4202-9e74-d9d06d8eb787.png`
- Source pixels: 531 x 480 at 1x density.
- Intended behavior clarified by the user: the modal must stay compact and the dropdown options must float over surrounding content.

## Rendered implementation

- Compact closed state: `E:\fccd\artifacts\order-status-modal-compact-light.png`
- Floating open state: `E:\fccd\artifacts\order-status-modal-floating-light.png`
- Before/after focused comparison: `E:\fccd\artifacts\order-status-modal-before-after.png`
- Browser viewport and implementation pixels: 1265 x 710 CSS px at 1x density.
- Route/state: `/orders`, authenticated preview account, light theme, status modal closed and multi-select expanded.

## Evidence and findings

- Fonts and typography: label, placeholder, and button text no longer inherit the table action icon sizing; all remain readable with the existing application type scale.
- Spacing and layout rhythm: the closed modal is 420 x 227 px and now fits its content without the previous empty 18rem body area.
- Colors and tokens: the modal, controls, focus ring, backdrop, and actions continue to use the existing light-theme tokens.
- Image and icon fidelity: the existing close and chevron library icons remain sharp and correctly aligned; no replacement assets were needed.
- Copy and content: title, field label, placeholder, Cancel, and Save remain unchanged.
- Floating behavior: when expanded, the modal remains 420 x 227 px. The 374 x 280 px options menu is independently positioned at z-index 60 and overlays the footer/background instead of changing modal height.

## Comparison history

1. P1: table action descendant styles leaked into the nested modal, producing 32px boxed text fragments and undersized footer buttons. Fixed by rendering the shared modal at `document.body` through a portal. Post-fix evidence: `order-status-modal-compact-light.png`.
2. P1: the modal body had a forced 18rem minimum height, leaving a large blank area. Removed the forced height. Post-fix evidence: the compact modal measures 420 x 227 px.
3. P1: an intermediate rule expanded the modal when the dropdown opened. Removed that rule and retained an independent floating menu. Post-fix evidence: `order-status-modal-floating-light.png` shows the list floating while the modal height remains 227 px.

## Primary interactions tested

- Open status modal.
- Open the searchable multi-select.
- Confirm the listbox appears as an overlay without resizing the modal.
- Confirm close/cancel/save controls retain normal sizing.

## Console and automated checks

- Browser console checked after the open-state interaction: no errors.
- `test/orders-list.test.tsx`: 39 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Restaurant stocktake monthly-expense color alignment

## Source visual truth

- Reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-c1d873d2-661a-472c-a044-de5a60e84205.png`.
- Source pixels: 1920 x 1080 at 1x density, including browser chrome.
- State: authenticated light-theme monthly-expense page with a selected history record, white panels, pale-green application canvas, green emphasis, neutral table header, and destructive red record action.

## Rendered implementation

- Browser-rendered implementation: `E:\fccd\artifacts\restaurant-stocktake-monthly-expense-colors.png`.
- Browser viewport and implementation pixels: 1920 x 985 CSS px at 1x density.
- Route/state: `/restaurant/inventory`, authenticated light theme, July 2026 TKO water-bar record selected in view mode.
- Density normalization: the implementation viewport matches the source width and the source's approximately 985px app-content area below browser chrome. Browser chrome was excluded from visual findings.

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the existing application font stack and stocktake information hierarchy remain unchanged, matching the reference product shell rather than introducing page-specific typography.
- Spacing and layout rhythm: the stocktake master-detail layout is intentionally preserved per the request; panel radii, border weight, selected-row inset marker, and internal spacing now use the same surface rhythm as the monthly-expense history and editor.
- Colors and visual tokens: the selected stocktake changed from a solid primary fill to `--selection-bg` with `--nav-active-fg`, a primary inset marker, a mixed primary border, and a pale destructive delete surface. Panel shadows, table header, search field, and hover state use the monthly-expense green/neutral token family.
- Image quality and asset fidelity: no new image assets were required. The existing FCCD logo and project icon library remain unchanged and sharp.
- Copy and content: stocktake labels and operational values remain unchanged. The department picker exposes only `餐廳` and `水吧` in addition to its placeholder.
- Focused-region comparison was not required because the requested change is limited to color, both original-resolution full views keep the selected history row, search field, header, table, and actions legible, and computed browser styles were inspected for the key color surfaces.

## Comparison history

1. P2: the stocktake's selected history record used a solid dark-green fill with white text, while the monthly-expense reference used a pale-green surface with dark-green text and a left accent. Replaced the solid fill with the shared selection tokens and inset primary marker.
2. P2: the selected delete action inherited the active record foreground and did not read as destructive. Added the reference's pale-red destructive surface and red icon color.
3. Post-fix evidence shows a pale-green selected record, green title/add/search accents, a near-white neutral-green table header, white panels, and unchanged red destructive semantics.

## Primary interactions tested

- Enter edit mode and confirm quantity inputs become enabled.
- Open the add-record panel and confirm the department list contains only the placeholder, `餐廳`, and `水吧`.
- Close the panel and reload the production route back into view mode.
- Browser console checked after these interactions: no errors.

## Automated checks

- Targeted restaurant stocktake component tests: 2 passed.
- Full regression was intentionally not run per the user's request.

## Final result

passed

---

# Design QA: Restaurant stocktake records

## Source visual truth

- Reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-836dc944-ccb3-4776-ae0f-1e399cd2d6d5.png`.
- Source pixels and viewport: 1639 x 929 at 1x density.
- State: July 2026 TKO water-bar stocktake selected, view mode, record list and grouped supplier rows visible.

## Rendered implementation

- Browser-rendered desktop screenshot: `E:\fccd\artifacts\restaurant-stocktakes-implementation-final.png` (1639 x 929 CSS px at 1x density).
- Browser-rendered narrow screenshot: `E:\fccd\artifacts\restaurant-stocktakes-narrow-final.png` (720 x 900 CSS px at 1x density).
- Full-view comparison: `E:\fccd\artifacts\restaurant-stocktakes-comparison-final.png`.
- Local preview: `http://127.0.0.1:4173/artifacts/restaurant-stocktakes-preview.html`.
- Density normalization: source and desktop implementation were compared unscaled at equal pixel dimensions in one side-by-side canvas.

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the implementation uses the application's Inter, Noto Sans TC, PingFang TC, and Microsoft JhengHei stack. Month, restaurant, department, value summary, table labels, and muted last-edited text preserve the reference hierarchy without truncating critical data.
- Spacing and layout rhythm: the reference's record rail, summary/search area, supplier-grouped table, and edit/save actions are retained inside the current application's established master-detail panels. The page heading and green selection treatment are intentional existing-product conventions.
- Colors and visual tokens: panels, borders, selected record, fields, buttons, muted copy, and disabled state use the current application tokens instead of importing the legacy blue shell.
- Image quality and asset fidelity: the screen contains no photographic or custom raster assets. All visible action icons come from the project's existing icon library; no CSS drawings, emoji, or placeholder assets were introduced.
- Copy and content: visible labels cover month, restaurant, department, supplier, item, unit, unit price, quantity, total value, not-counted state, and last-edited time. The desktop preview uses the same representative values as the reference.
- Focused-region evidence: the add-record dialog was inspected in the browser at desktop size. A month whose restaurant has records for every department disables that restaurant; component tests additionally confirm an individual recorded department option is disabled while an unrecorded department remains selectable.

## Comparison history

1. P1: at 720 px, the edit/save row initially shrank into and overlapped the search toolbar. Fixed by preventing the record summary from flex-shrinking. Post-fix evidence: `restaurant-stocktakes-narrow-final.png`.
2. P2: the first pagination label used interpolation placeholders incompatible with the shared pagination component. Replaced it with the component's expected connective label. Post-fix browser inspection reads `頁，共 1` with no raw placeholder text.
3. Post-fix desktop comparison preserves the source's major proportions and information density while intentionally adopting the current application's type, green palette, panel radii, and page heading.

## Primary interactions tested

- Open the add-record dialog and verify recorded combinations are disabled.
- Enter edit mode, change the POS paper quantity from 75 to 76, save, and verify view mode returns with 76 displayed.
- Search and table controls remain visible at desktop size.
- Check the 720 px layout for horizontal page overflow and persistent edit/save controls.
- Browser console was checked after the primary interactions; no warnings or errors were present.

## Automated checks

- TypeScript build/lint check: passed.
- Restaurant stocktake component tests: 2 passed.
- Navigation and page-access tests covering the new destination: passed after updating the previously intentional route exclusion.
- The full repository run has four unrelated failures in other in-progress areas: a dashboard color-mix assertion, hard-coded receipt-editor placeholders, receipt address row sizing, and a duplicate daily-sales validation message. This stocktake implementation does not touch those behaviors; all stocktake, navigation, and type checks pass.

## Final result

passed

---

# Design QA: standalone INV editor and grouped lower-content pagination

## Source visual truth

- Reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-12576760-c7a2-4be5-aaf2-1d5858164a96.png` (1928 x 1048 px).
- State: standalone invoice editor with Terms and Conditions, Payment Methods, optional customer signature, and issuer signature beneath the invoice table.

## Rendered implementation

- Browser-rendered implementation: `E:\fccd\artifacts\invoice-pdf-group-pagination-final.png` (1265 x 2405 px full-page capture, 1x browser density).
- Combined full-view comparison: `E:\fccd\artifacts\invoice-pdf-group-comparison-final.png` (2560 x 2450 px).
- Local preview: `http://127.0.0.1:4173/artifacts/invoice-pdf-preview.html`.
- Viewport/state: desktop editor at 1265 CSS px wide; ten invoice lines keep the table on page one and automatically place the complete lower-content group on page two.
- Density normalization: both images were placed in one 2560 x 2450 comparison canvas and proportionally scaled without changing aspect ratio. The source includes browser chrome while the implementation capture contains the editor surface, so chrome and outer-canvas differences were excluded from findings.

## Fidelity review and findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: invoice headings, clause headings, numbered clauses, signature labels, and move controls retain the established quote/receipt document hierarchy; long values wrap without truncation.
- Spacing and layout rhythm: Terms, Payment Methods, the customer-signature option, and issuer signature form one lower-content group. The group moves to the next or previous PDF page as a unit, matching the quote editor's pagination model.
- Colors and visual tokens: the page controls reuse the quote editor's pale-blue control strip, blue enabled button, disabled state, and monochrome PDF content.
- Image quality and asset fidelity: the existing brand-selected logo and company stamp remain sharp and unchanged; no visible assets were approximated.
- Copy and content: invoice-specific labels remain intact. Empty Terms or Payment Methods stay available as add controls in the editor but are removed from print/PDF output, so they do not reserve blank space.
- Focused-region comparison was not required because the full-page implementation capture keeps the complete second-page control, clauses, and signature group legible. Earlier focused REC comparisons already covered the shared address, table-rule, and numeric-alignment components.

## Comparison history

1. P1: a long invoice originally kept the lower-content group on page one, clipping the signature area below the visible PDF boundary. Fixed by starting the entire group on page two for dense invoices while preserving manual up/down movement.
2. P1: independently positioned Terms, Payment Methods, and signatures could separate across pages. Fixed by giving the shared group one page-placement state and one pair of quote-style page controls.
3. P2: empty clause sections could still occupy printed space. Fixed with print-only empty-state removal while retaining editor add controls; an empty group does not create a second page by itself.
4. Post-fix comparison shows the complete group on page two with no clipping and no blank generated page.

## Primary interactions tested

- Open the standalone INV editor route in a new tab.
- Move the complete Terms, Payment Methods, and signature group down one page and back up one page.
- Enable the optional customer signature and confirm both signature areas remain inside the same movable group.
- Add and remove Terms and Payment Methods clauses; confirm empty sections gain the print-hidden state.
- Load a ten-line invoice and confirm the automatically created second page contains visible lower content rather than being blank.

## Console and automated checks

- Browser-rendered editor loaded without visible runtime errors.
- Targeted receipt/invoice editor and order-list tests: 48 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Restaurant daily purchase input

## Source visual truth

- Reference screenshot: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-bbd4f6bc-112d-4b50-b3d1-dded67dfe66b.png`
- Source pixels: 1594 x 863 at 1x density.
- State: multi-day supplier purchase summary with five restaurant and supplier combinations, three purchase categories, and grouped totals.

## Rendered implementation

- Browser-rendered desktop screenshot: `E:\fccd\artifacts\restaurant-daily-purchases-implementation-final.png`
- New-record focused screenshot: `E:\fccd\artifacts\restaurant-daily-purchases-new-panel.png`
- Narrow main-page screenshot: `E:\fccd\artifacts\restaurant-daily-purchases-narrow-main.png`
- Full-view comparison: `E:\fccd\artifacts\restaurant-daily-purchases-comparison-final.png`
- Viewport and CSS size: 1598 x 863 at 1x density for desktop; 800 x 900 at 1x density for the narrow check.
- Density normalization: the 1594 x 863 reference is centered with a 2px horizontal inset above the unscaled 1598 x 863 implementation. No content was resampled.
- State: controlled preview data reproduces the reference supplier, restaurant, category, and total values while exercising the production component.

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the implementation uses the product's existing CJK-capable UI stack, strong row labels, muted category labels, and tabular currency amounts. The visual hierarchy is equivalent to the reference while remaining consistent with the current application shell.
- Spacing and layout rhythm: filters, actions, five data columns, three-line category groups, and row totals align in one dense operations panel. The side-panel entry form is an intentional existing-product adaptation of the reference's fixed left form.
- Colors and visual tokens: green primary actions, neutral borders, and the pale application canvas use the current FCCD design tokens. The reference's legacy amber table header and striped rows were intentionally not copied.
- Image quality and asset fidelity: the source and implementation contain no custom raster illustrations or logos inside this screen. Existing Lucide action icons are used for edit, add, retry, and delete controls.
- Copy and content: title, date mode, date range, supplier, restaurant, category, and total labels are present. Supplier and restaurant ordering now matches the reference.

## Full-view and focused comparison evidence

- The combined full-view comparison confirms matching information order, supplier and restaurant pairings, three-category breakdowns, and totals at the same desktop height.
- The focused new-record screenshot confirms the date, supplier, restaurant, category amount, computed total, cancel, and confirm controls are visible and correctly grouped.
- The 800 x 900 screenshot confirms filters and actions wrap without clipping; the dense table remains available through intentional horizontal scrolling.

## Comparison history

1. P2: the first implementation placed restaurant before supplier in filters, forms, and tables, contrary to the reference workflow. Fixed by standardizing the order as date, supplier, restaurant, category, and total across the main list and both editor panels.
2. Post-fix full-view comparison found no remaining P0, P1, or P2 issues. The legacy amber styling and fixed left form are acceptable product-system differences because the current central-kitchen equivalent uses the same green token set and side-panel interaction.

## Primary interactions tested

- Open the production route and confirm the new restaurant navigation item and page access gate.
- Open the new-record side panel, choose a date, supplier, and restaurant, enter a category amount, and verify the total updates to HK$1,280.50.
- Open the purchase-entry editor and confirm date, supplier, restaurant, category, amount, deletion actions, and pagination are available.
- Resize to 800 x 900 and confirm filters, actions, table scrolling, and editor layout remain usable.
- Browser console after desktop, form, editor, and narrow checks: no errors or warnings in the controlled preview.

## Automated checks

- Targeted navigation and daily-purchase tests: 74 passed.
- Full automated suite: 103 files and 832 tests passed.
- TypeScript check and production Vite build: passed.
- Build retains the existing non-blocking bundle-size and mixed dynamic-import warnings.

## Final result

passed

---

# Design QA: REC reference, delivery-fee option, and trailing-page controls

## Source visual truth

- Right-aligned receipt heading reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-f17ad395-b932-4e87-bf79-328d032abf89.png`
- REC reference-only crop: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-130c2040-9369-44ec-9649-4f9173f12fea.png`
- Payment and issuer-stamp crop: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-1ffda98f-70b6-462b-811b-779e68ff4a9a.png`
- Product direction: the heading belongs on the right, the value after `REC/` must come only from a real receipt reference, the delivery fee must be selectable, and the payment/stamp group can be moved between pages.

## Rendered implementation

- Final first-page state: `E:\fccd\artifacts\receipt-pdf-rec-fee-pagination-final.png`
- Second-page placement evidence: `E:\fccd\artifacts\receipt-pdf-page-controls-final.png`
- Full receipt comparison: `E:\fccd\artifacts\receipt-pdf-comparison-final.png`
- Local preview: `http://127.0.0.1:4173/artifacts/receipt-pdf-preview.html`

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- The `RECEIPT` heading and `REC/` value are centered in the right letterhead column, matching the focused reference placement.
- The suffix is populated only from `payments.receipt_reference`; orders without that value render exactly `REC/` and never reuse the order number.
- The delivery-fee row exposes configured shipping-fee options. Selecting an option updates its amount and the grand total while retaining a clean, non-interactive print rendering.
- Previous/next page controls move Payment information and the company-stamp block together between page one and page two. The controls are excluded from print output.

## Primary interactions tested

- Load an order with receipt reference `#6939` and confirm `REC/#6939`.
- Load an order without a receipt reference and confirm the header stays `REC/`.
- Select a configured delivery-fee option and confirm the fee and grand total recalculate.
- Move the trailing group to the next page, then restore it to the previous page.
- Confirm the browser console remains free of errors during the interaction path.

## Console and automated checks

- Browser console after receipt, fee, and page-control interactions: no errors or warnings.
- Full automated suite: 102 files and 827 tests passed.
- Production build: passed.
- `git diff --check`: passed; only existing LF-to-CRLF working-copy notices were reported.

## Final result

passed

---

# Design QA: Daily-sales inline loading and restored legacy values

## Source visual truth

- Loading-gap reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-c1f1d245-3db7-4a53-a240-1440e3c39634.png`
- Empty-hours reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-9baa126c-45cf-4344-87d6-6f1392df0bce.png`
- Product direction: remove the large blank area above the inline record skeleton and restore delivery-platform and department-hour values from imported records.

## Rendered implementation

- Loading state at reference dimensions: `E:\fccd\artifacts\daily-sales-skeleton-gap-fixed-1468x617.png`
- Before/after comparison: `E:\fccd\artifacts\daily-sales-skeleton-gap-comparison.png`
- Loaded data state: `E:\fccd\artifacts\daily-sales-platform-hours-fixed.png`
- Focused platform/hour evidence: `E:\fccd\artifacts\daily-sales-hours-fixed-focused.png`
- Live existing-receipt evidence: `E:\fccd\artifacts\daily-sales-existing-receipt-fixed.png`
- Inline total-help evidence: `E:\fccd\artifacts\daily-sales-total-help-inline.png`
- Viewport: 1468 x 617 CSS px at 1x density for the normalized loading-state comparison.

## Findings and fidelity surfaces

- P2 fixed: the shared detail skeleton rendered its own hidden heading block inside the already-rendered daily-sales editor, creating a large empty band. The inline instance now hides that duplicate heading and begins immediately below the sales summary.
- P1 fixed: imported platform rows can have no current foreign key. The reader now restores them by legacy ID and, for older unlinked rows, by the configured platform sort order.
- P1 fixed: imported working-hour rows use legacy department names. The editor now uses the canonical `樓面`, `廚房`, and `水吧` hour fields, normalizes simplified/traditional variants, and preserves unexpected extra department keys.
- P1 fixed: imported machine-receipt images may be stored in the legacy `POS sheet` field rather than the generic image field. The reader now prioritizes `POS sheet`, falls back to the generic image, and supports protocol-relative URLs and storage paths.
- The red matching instruction now sits directly after `總營業額` on one line, as requested.
- Typography, colors, cards, skeleton animation, and existing copy remain unchanged; this iteration only corrects layout rhythm and data visibility.
- No visible image assets were introduced or replaced.

## Full-view and focused comparison evidence

- The combined 1468 x 617 comparison shows the original blank band on the left and the revised skeleton cards directly below the summary on the right.
- The focused loaded-state capture shows Foodpanda `$5,652`, hours `36`, `12`, and `8`, and the calculated total `56.00` in their editable fields.
- The live authenticated 2026-08-20 capture shows the imported machine-receipt photograph rendered inside the `機紙` card.

## Primary interactions tested

- Select the 2026-08-21 history record and inspect the delayed loading state.
- Wait for the record to resolve and verify the Foodpanda and all three department-hour inputs.
- Focus the `樓面` hour input and confirm the editor remains interactive.
- Select the live 2026-08-20 record and confirm its imported machine-receipt image loads.

## Console and automated checks

- Browser console after loading and focused-field interactions: no errors or warnings.
- `test/restaurant-daily-sales.test.tsx`: 9 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Daily-sales date filter sizing

## Source visual truth

- Reference screenshot: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-b81c8e74-3aa5-418d-80a5-73e3570e98c4.png`
- Product direction: keep the existing single-day and `DatePickerRange` filtering behavior while making the filter mode and date controls visually consistent.

## Rendered implementation

- Multiple-day state: `E:\fccd\artifacts\daily-sales-date-filter-final.png`
- Single-day state: `E:\fccd\artifacts\daily-sales-single-date-filter-final.png`

## Findings and fidelity surfaces

- The filter mode select, single-day picker, and multiple-day range now share a 42px control height, 9px radius, and 7px label-to-control spacing.
- The filter labels use the same 14px weight and color treatment, so the two columns align on both their labels and controls.
- Existing responsive behavior is preserved: below 900px the controls stack and expand without horizontal clipping.
- The recent-record list continues to display Hong Kong business dates, including the existing 2026-08-21 record.

## Primary interactions tested

- Switch between multiple-day and single-day modes.
- Confirm both modes keep equal control height and aligned labels.
- Confirm the recent-record list remains visible and no record is selected by default.

## Console and automated checks

- Browser console after both filter states: no errors or warnings.
- `test/restaurant-daily-sales.test.tsx`: 7 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Restaurant daily-sales feedback iteration

## Source visual truth

- Reference screenshot: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-b28a7e7e-a3fc-4bda-ae61-645953920927.png`
- Source pixels: 1624 x 897 at 1x density.
- Product direction: keep the existing daily-sales layout while adding an initially empty editor, a guarded new-record flow, signed Other rows, required-field feedback, and existing machine-receipt binding.

## Rendered implementation

- Default empty state: `E:\fccd\artifacts\daily-sales-empty-state-final.png`
- New-record modal: `E:\fccd\artifacts\daily-sales-new-modal-final.png`
- Selected 2026-08-20 record: `E:\fccd\artifacts\daily-sales-record-viewport-final.png`
- Narrow empty state: `E:\fccd\artifacts\daily-sales-empty-narrow-final.png`
- Same-size comparison: `E:\fccd\artifacts\daily-sales-feedback-comparison-final.png`
- Desktop viewport and screenshot: 1624 x 897 CSS px at 1x density.

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain for the requested feedback scope.
- Default state: Tseung Kwan O remains selected, no history row is active, and the editor stays blank until the user selects a record or confirms a new restaurant/date pair.
- New-record flow: the modal preserves the product's existing modal shell, defaults to Tseung Kwan O, and disables submission with a clear message when the restaurant/date combination already exists.
- Copy and validation: the red total-matching instruction is visible beside Total Revenue. Empty save attempts show the four requested messages for total, department, period, and POS machine receipt.
- Signed Other rows: department and period Other rows show the requested `$0` hint and an Add/Subtract selector; negative stored values render as Subtract with a positive magnitude.
- 2026-08-20 fixture (superseded by the next feedback iteration): delivery-platform and department-hour values were temporarily blank in this capture.
- Existing receipt binding: data loading now finds the first image on any row for the selected restaurant/date, supports direct and protocol-relative legacy image URLs, and otherwise creates a private-storage signed URL. The visual fixture intentionally has no private production receipt, while automated interaction coverage verifies that a loaded receipt URL renders in the Machine Receipt card.
- Responsive layout: the 820 x 900 capture keeps the toolbar, horizontally scrollable history strip, and empty editor readable without page-level horizontal clipping.

## Primary interactions tested

- Load the page and verify no history record is selected.
- Open the new-record modal and confirm its restaurant/date controls.
- Block a restaurant/date pair that already has a record.
- Select 2026-08-20 and verify totals, signed Other rows, blank delivery platform, blank working hours, and Machine Receipt copy.
- Start a blank record and trigger all four required-field messages without saving.

## Console and automated checks

- Browser console after the interactions: no errors or warnings.
- `test/restaurant-daily-sales.test.tsx`: 5 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Restaurant daily sales input

## Source visual truth

- Reference screenshot: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-b28a7e7e-a3fc-4bda-ae61-645953920927.png`
- Source pixels: 1624 x 897 at 1x density.
- Intended outcome: add a production daily-sales input page under Restaurant Operations and default the restaurant picker to Tseung Kwan O.

## Rendered implementation

- Desktop implementation: `E:\fccd\artifacts\daily-sales-implementation-viewport-final.png`
- Narrow implementation: `E:\fccd\artifacts\daily-sales-implementation-narrow.png`
- Same-size side-by-side comparison: `E:\fccd\artifacts\daily-sales-comparison-final.png`
- Browser viewport and implementation pixels: 1624 x 897 CSS px at 1x density; responsive check at 820 x 900 CSS px.
- State: light theme, TKO 桂花小幸 將軍澳 selected, 2026-08-22 record populated and balanced.

## Evidence and findings

- Fonts and typography: the implementation keeps the existing FCCD Inter/Noto Sans TC stack and application heading scale. The source's denser legacy type is intentionally modernized to the current product system; hierarchy, input labels, figures, and totals remain readable without clipping.
- Spacing and layout rhythm: the source's history rail, summary total, payment, department, period, product, working-hour, and receipt regions remain represented in the same left-to-right workflow. At 820 px the layout becomes one column and measured `scrollWidth` equals `clientWidth` (805 px), so there is no page-level horizontal overflow.
- Colors and visual tokens: source blue table headers are mapped to the existing FCCD green primary, pale active wash, card, border, destructive, and focus tokens. Reconciliation states use semantic green/red styling.
- Image quality and asset fidelity: the source image is a user-uploaded receipt, not a reusable product asset. The implementation provides a real JPEG/PNG/WebP upload and preview region backed by private receipt storage; it does not substitute a fake receipt image.
- Copy and content: restaurant selection, business date, total revenue, payment/platform, department, service period, product quantity, working hours, remarks, recent history, and save actions are all present. The default selected restaurant is TKO/將軍澳.

## Full-view and focused comparison evidence

- The native-size combined comparison shows the same high-density operational workflow and keeps all primary sections above the fold at desktop width.
- A separate focused crop was not needed because the 1624 x 897 native capture keeps labels, amounts, restaurant state, receipt affordance, and section totals legible. The 820 x 900 capture supplies responsive evidence.

## Comparison history

1. P2: the first implementation omitted the receipt image region visible in the source. Added a real receipt upload/preview card and private storage support.
2. P2: the first receipt placement appeared below product rows and was not visible above the fold. Moved it into a dedicated fourth desktop column matching the source's right-side receipt placement.
3. Post-fix comparison found no remaining P0, P1, or P2 issues. The green palette and softer card treatment are intentional mappings to the existing FCCD design system rather than source drift.

## Primary interactions tested

- Confirm TKO/將軍澳 is selected on initial load.
- Switch to YLP and back to TKO.
- Save a balanced record and confirm the saved state.
- Verify the save button is enabled for a balanced record.
- Verify responsive stacking at 820 px without horizontal page overflow.
- Browser console checked after interactions: no errors or warnings.

## Automated checks

- Full automated suite: 817 passed across 101 test files.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Order delivery note preview and print layout

## Source visual truth

- Reference print preview: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-30f1b9c9-fd05-4c47-aada-d250caf935ca.png`
- Secondary A4 reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-09e915e7-1f57-4e4c-a17c-f53af9dc866b.png`
- Reference pixels: 1920 x 1080 at 1x density.
- Target state: order B-1546, HK Lunch Box branding, full delivery details and item table.

## Rendered implementation

- Browser-rendered preview: `E:\fccd\artifacts\delivery-note-preview-b1546-1920.png`
- Side-by-side comparison: `E:\fccd\artifacts\delivery-note-qa-comparison.png`
- Browser viewport and implementation pixels: 1920 x 1080 CSS px at 1x density.
- Route/state: `/orders`, authenticated preview account, dark theme, searched B-1546 and opened 送貨單.

## Full-view and focused comparison evidence

- The combined comparison shows the source and implementation at the same viewport and density.
- The A4 content hierarchy matches: dynamic logo, 送貨單 title, carton blank, order/district heading, customer and delivery details, delivery date/time/day, six item rows, and three-part footer.
- Important text and borders are legible in the full-view comparison, so no additional crop was required.
- The source includes the browser's native print controls while the implementation screenshot shows the controlled in-app preview; clicking Print invokes the native print dialog with the same shared A4 document.

## Required fidelity surfaces

- Fonts and typography: Chinese headings, labels, order number, detail text, table rows, and footer use a compact print scale consistent with the factory reference.
- Spacing and layout rhythm: the document keeps the reference's wide top margin, two-column detail block, compact item table, and footer anchored to the bottom of the A4 sheet.
- Colors and visual tokens: the paper, table cells, and headers are explicitly white with black print text and borders; the surrounding preview uses the existing application modal and backdrop tokens.
- Image quality and asset fidelity: the real centralized HK Lunch Box brand asset is used. The same component resolves Catering, Kitchen, and HK Lunch Box logos from order brand/store data.
- Copy and content: B-1546 displays the reference customer, address, curbside note, contact, 2026-08-24 date, 12:00 - 13:00 delivery window, Monday label, all six lines, brand website, order footer, and 1 / 1 page marker.

## Comparison history

1. P1: the first list preview contained only a simplified order summary and omitted factory line-item data. Fixed by loading the factory job on demand and rendering the shared delivery-note document used by the factory view.
2. P1: the order-level delivery time was blank for B-1546 although its delivery record contained 12:00 - 13:00. Fixed by selecting delivery and ship-out times from the embedded delivery record as a fallback.
3. P2: the first visual pass inherited a dark table-header background from the application theme. Fixed by explicitly setting delivery-note table cells and headers to white. Post-fix evidence is in the browser screenshot and combined comparison.
4. Post-fix comparison found no remaining P0, P1, or P2 content or print-layout defects. The native-print-controls versus in-app-modal shell is an intentional preview-state difference.

## Primary interactions tested

- Search for B-1546.
- Open 送貨單 from the order row.
- Load complete factory line items and brand metadata asynchronously.
- Verify the Print action remains disabled only during loading/error and calls the browser print flow when ready.
- Confirm the preview does not expose order finance fields.

## Console and automated checks

- Browser console checked after search and preview interaction: no errors or warnings.
- Targeted order-list, factory-board, and brand-logo tests: passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Order list customer messages side panel

## Source visual truth

- Reference structure: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-9726b6cc-7bdf-4758-ac5a-fafa3a83120d.png`
- Source pixels: 571 x 880 at 1x density.
- Intentional product constraint: the user requested the existing right-side panel interaction, so the reference modal placement is not copied; its message structure is the visual target.

## Rendered implementation

- Browser-rendered state: `C:\Users\neroc\AppData\Local\Temp\orders-chat-panel.png`
- Side-by-side comparison: `C:\Users\neroc\AppData\Local\Temp\orders-chat-comparison-final.png`
- Browser viewport and implementation pixels: 1265 x 712 CSS px at 1x density.
- Route/state: `/orders`, authenticated preview account, dark theme, second row chat action opened for order K-2128.

## Full-view and focused comparison evidence

- The full-view comparison confirms the intended right-side panel overlays and dims the order list without shifting table content.
- The focused message region preserves the reference hierarchy: title, order context, three equal tabs with counts, empty/feed body, persistent composer, and icon send action.
- No separate crop was required because all important message controls are legible at native density in the combined comparison.

## Required fidelity surfaces

- Fonts and typography: existing FCCD heading, tab, empty-state, and input typography is used consistently; labels remain legible in the active dark theme.
- Spacing and layout rhythm: the existing message-panel width, header, tab row, scrollable feed, and fixed footer are preserved; no overflow hides the composer or close action.
- Colors and visual tokens: backdrop, surface, border, active-tab underline, text, input, and action colors use current theme tokens. The dark appearance is an intentional current-theme difference from the light reference.
- Image quality and asset fidelity: the reference contains no raster content that needs recreation. Message, close, and send controls use the project's existing Lucide icon set and render sharply.
- Copy and content: 留言, 訂單投訴, 訂單讚好, 客戶備註, counts, order/email context, empty state, and composer are present.

## Comparison history

1. P2: the first implementation showed only the customer email, which lost the order context visible in the reference. Fixed by showing `K-2128 · joannebuddy@gmail.com` in the panel header. Post-fix evidence: `orders-chat-panel.png` and `orders-chat-comparison-final.png`.
2. Post-fix comparison found no remaining P0, P1, or P2 differences. The modal-to-side-panel placement and light-to-dark palette differences are intentional requirements, not drift.

## Primary interactions tested

- Click the second row chat action.
- Open the message side panel for that row's customer and order.
- Load all three message categories and their counts.
- Keep the customer-note composer available at the bottom.
- Close control, overlay, and table state remain usable.

## Console and automated checks

- Browser console checked after opening the second row panel: no errors.
- `test/orders-list.test.tsx` and `test/quote-customers.test.tsx`: 59 passed.
- Final focused `test/orders-list.test.tsx`: 40 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Delivery note right-side panel

## Source visual truth

- Existing order-message side-panel pattern: `E:\fccd\artifacts\existing-order-message-side-panel-reference.png`
- Source pixels: 1265 x 711 at 1x density.
- Product direction: replace the centered delivery-note modal with the application's established right-side panel shell while preserving the A4 document.

## Rendered implementation

- Desktop implementation: `E:\fccd\artifacts\delivery-note-side-panel-b1546.png`
- Narrow implementation: `E:\fccd\artifacts\delivery-note-side-panel-b1546-narrow.png`
- Side-by-side shell comparison: `E:\fccd\artifacts\delivery-note-side-panel-qa-comparison.png`
- Desktop viewport and screenshot: 1265 x 711 CSS px at 1x density.
- State: `/orders`, authenticated preview account, B-1546 search result, 送貨單 panel open.

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the title, description, close control, body, and footer actions use the same side-panel type hierarchy as the existing message panel; the A4 print typography is unchanged.
- Spacing and layout rhythm: the panel is right-aligned and full-height, with fixed header/footer and an independently scrolling document body. Its wider 920px desktop width is intentional so the A4 page remains readable.
- Colors and visual tokens: backdrop, header, footer, borders, buttons, and elevation reuse the existing side-panel tokens; the neutral gray preview canvas and white paper are preserved.
- Image quality and asset fidelity: the existing dynamic HK Lunch Box logo remains sharp and unchanged; no substitute assets were introduced.
- Copy and content: delivery-note title, safety description, B-1546 details, line items, Close, and Print remain present.

## Full-view and focused comparison evidence

- The combined desktop comparison confirms that the new delivery-note container follows the existing right-edge placement, full-height structure, dimmed backdrop, header close action, body scrolling, and anchored footer pattern.
- The full A4 region is legible at native density, so no additional focused crop was required.
- The narrow capture confirms the panel occupies the available width and keeps its document body scrollable. Automated visibility checks confirmed both Close and Print remain visible.

## Comparison history

1. P1: the delivery note previously opened in a centered modal, contrary to the requested side-panel interaction. Fixed by moving only the delivery-note preview to the shared SidePanel component; receipt and invoice previews remain compact modals.
2. Post-fix comparison found no remaining P0, P1, or P2 issues. The delivery panel is intentionally wider than the message panel to fit the A4 document without shrinking its print content.

## Primary interactions tested

- Search for B-1546 and open 送貨單.
- Close the delivery panel from its header action.
- Open the existing message panel to compare the established shell.
- Reopen the delivery panel and verify desktop and narrow states.
- Confirm Close and Print remain visible, with the A4 body scrolling independently.

## Console and automated checks

- Browser console after the delivery-panel interactions: no errors or warnings.
- `test/orders-list.test.tsx`: 42 passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Daily-sales cash footer and restored data

## Source visual truth

- Reference screenshot: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-4c726432-6ed4-4cb9-aa9f-0b71eab19c0d.png`
- Source pixels: 1254 x 365 at 1x density.
- Product direction: restore the 2026-08-20 delivery-platform and department-hour data, then add the legacy cash-reconciliation fields at the bottom of the modern daily-sales editor.

## Rendered implementation

- Desktop footer: `E:\fccd\artifacts\daily-sales-cash-footer-final.png`
- Narrow footer: `E:\fccd\artifacts\daily-sales-cash-footer-narrow-final.png`
- Same-height comparison: `E:\fccd\artifacts\daily-sales-cash-footer-comparison-final.png`

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- The restored 2026-08-20 record displays Foodpanda `$5,652`, department hours `36`, `12`, and `8`, and a calculated all-department total of `56.00`.
- The bottom section contains editable cash received and petty-cash values, a calculated bank-deposit amount, and a full-width difference-reason field.
- The all-department hours total uses the green summary bar visible in the reference while retaining the current product's rounded cards and spacing tokens.
- The 820 x 900 capture stacks the three cash values into readable full-width cards without horizontal clipping.

## Primary interactions tested

- Select the 2026-08-20 history record.
- Confirm restored Foodpanda and department-hour values.
- Focus the cash-received input and verify the bank-deposit calculation.
- Confirm the difference-reason field and save action remain available on desktop and narrow layouts.

## Console and automated checks

- Browser console after desktop and narrow interactions: no errors or warnings.
- `test/restaurant-daily-sales.test.tsx`: 5 passed.
- Full automated suite: 101 files and 821 tests passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: Order REC PDF editor

## Source visual truth

- Reference receipt: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-cc3a7e5c-6cf8-4f82-afc8-059edaba7d6a.png`
- Secondary paid-state reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-ddb54515-1782-4dcd-a7c8-93c458d3d357.png`
- Source pixels and CSS size: 1920 x 1040 at 1x density.
- State: HK Lunch Box order B-1547, 10 product rows, zero delivery fee, HK$6,300 outstanding.

## Rendered implementation

- Browser-rendered screenshot: `E:\fccd\artifacts\receipt-pdf-implementation-viewport-final.png`
- Side-by-side full-view comparison: `E:\fccd\artifacts\receipt-pdf-comparison-final.png`
- Requested browser viewport: 1920 x 1040 CSS pixels.
- Raw in-app-browser capture: 1928 x 1048 physical pixels; the 8px browser-edge remainder was cropped for a 1920 x 1040, 1x comparison. No content was scaled.
- Local preview: `http://127.0.0.1:4173/artifacts/receipt-pdf-preview.html`

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the receipt uses the established Poppins/Arial document stack, with the same bold RECEIPT hierarchy, compact metadata labels, tabular amounts, and small signature copy as the references.
- Spacing and layout rhythm: letterhead, 3-row metadata block, 10-row item table, payment information, and issuer stamp follow the reference order and compact vertical rhythm. The editor toolbar and visible A4 paper are intentional additions from the existing quote-PDF editing pattern.
- Colors and visual tokens: the document stays monochrome with black rules and white editable fields; the surrounding neutral canvas and green print action reuse the quote-PDF workspace.
- Image quality and asset fidelity: the real HK Lunch Box lockup and Food Channels Limited stamp assets are used directly. Logo selection is driven by channel name, Shopify store domain, and order number; no substitute artwork was introduced.
- Copy and content: only the reference receipt elements remain in the document. Quote awards, terms, activity tables, extra-information controls, and customer-signing blocks are absent.

## Full-view and focused comparison evidence

- The combined comparison confirms matching document order, column proportions, table density, payment placement, and issuer-stamp alignment at the same viewport.
- A separate focused crop was not needed because the centered receipt occupies enough of the native-resolution full view to inspect field borders, item rows, totals, and the stamp without scaling ambiguity.

## Comparison history

1. P2: the first browser render used taller item rows than the legacy REC page, pushing the payment and stamp blocks down. Fixed by removing body-row separators and reducing cell/input line height while retaining usable edit targets.
2. P3: the source uses a blank/dash delivery fee when the fee is zero. The generated draft now leaves a zero fee blank while continuing to calculate the grand total correctly.
3. Post-fix comparison found no remaining P0, P1, or P2 issues.

## Primary interactions tested

- Open the REC route for an order and load its full order lines and finance data.
- Confirm the Lunch Box logo is selected from a generic Catering channel plus the Shopify store domain.
- Edit the first unit price and verify subtotal and grand total update immediately, then restore the source value.
- Confirm the working draft auto-saves and the print action remains available.
- Confirm the paid and outstanding payment-information states are populated from order data.

## Console and automated checks

- Browser console after load and edit interactions: no errors or warnings.
- Targeted receipt, order-list, and brand-logo tests: 49 passed.
- Full automated suite: 102 files and 825 tests passed.
- TypeScript build/lint check: passed.

## Final result

passed

---

# Design QA: REC print rules and quote-style page controls

## Source visual truth

- Metadata-rule reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-beaf4d96-d0f5-4422-a449-e8c04f078802.png` (925 x 272 px, focused crop).
- Page-control reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-dabd5f9a-bb8e-4c76-8017-de7dc0cb2971.png` (833 x 126 px, focused crop).
- State: Food Channels receipt with right-side heading, bordered customer metadata, and the payment/stamp block continuing on page one.

## Rendered implementation

- Browser-rendered implementation: `E:\fccd\artifacts\receipt-pdf-lines-controls-final.png` (1265 x 1258 px full-page capture at 1x browser density).
- Page-two interaction state: `E:\fccd\artifacts\receipt-pdf-lines-controls-page2-final.png`.
- Focused combined comparison: `E:\fccd\artifacts\receipt-pdf-lines-controls-comparison-final.png` (1920 x 1320 px).
- Local preview: `http://127.0.0.1:4173/artifacts/receipt-pdf-preview.html`.

## Fidelity review and findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the metadata labels, values, status copy, and move-button labels retain the established Poppins/Arial PDF hierarchy and the quote editor's button text sizing.
- Spacing and layout rhythm: the customer grid keeps four aligned columns and uninterrupted rules; the page-control bar now uses the quote editor's button order, left grouping, right-aligned status, padding, and gap.
- Colors and visual tokens: the controls reuse the quote editor's blue outline/disabled states and pale-blue background without introducing receipt-specific variants.
- Image quality and asset fidelity: supplied Food Channels logo and company stamp remain unchanged and sharp; no image assets were replaced.
- Copy and content: controls now read `下移一頁` and `上移一頁`, with the same state-description pattern as the quote PDF editor.

## Comparison history

1. P1: print media made the metadata inputs' structural borders transparent, causing the horizontal and vertical table rules to disappear. Fixed by retaining 2px black right and bottom borders for metadata inputs and textareas in print.
2. P2: the payment/stamp controls used receipt-specific previous/next button placement and labels. Fixed by reusing the quote editor's Button component, down/up ordering, disabled states, and status-copy placement.
3. Post-fix focused comparison shows continuous metadata rules and the shared quote-editor control treatment.

## Primary interactions tested

- Load the REC preview and inspect all six metadata fields and their surrounding rules.
- Click `下移一頁` and confirm the payment/stamp group appears on page two with the moved-state message.
- Click `上移一頁` and confirm the group returns to page one.

## Automated checks

- Targeted receipt editor tests: 3 passed.
- TypeScript build/lint check: passed.
- Residual gap: the browser surface does not expose the native print-preview dialog for screenshot capture; the print-media border declarations were verified in source and covered by the rendered structural-grid comparison.

## Final result

passed

---

# Design QA: PDF address wrapping, visible delivery time, and centered prices

## Source visual truth

- Address/time crop: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-ea79e0a3-ba90-41fa-865a-14c693f37d7c.png` (499 x 101 px).
- Centered-price crop: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-80b4ff8f-0ae0-42fd-b73c-870cbc28e99e.png` (316 x 256 px).
- State: a long mixed Chinese/English delivery address, a 12-hour delivery window, and populated Unit Price, Qty, Total, subtotal, and grand-total values.

## Rendered implementation

- Browser-rendered REC editor: `E:\fccd\artifacts\receipt-pdf-address-time-centered-final.png` (1265 x 1258 px full-page capture at 1x browser density).
- Combined focused comparison: `E:\fccd\artifacts\receipt-address-time-price-comparison-final.png` (1920 x 1320 px).
- Local preview: `http://127.0.0.1:4173/artifacts/receipt-pdf-preview.html`.

## Fidelity review and findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: address and time retain the document font and weight; automatic wrapping introduces a clean second line without clipping or a native resize/scroll handle.
- Spacing and layout rhythm: the address row expands to two lines while all four metadata columns remain aligned. The right value track is wide enough for `07:00 PM - 08:00 PM`.
- Colors and visual tokens: the monochrome document rules and quote-editor workspace styling remain unchanged.
- Image quality and asset fidelity: the existing logo and stamp assets remain unchanged and sharp.
- Copy and content: the full address and delivery-time strings are visible. Unit Price, Qty, Total, subtotal, shipping fee amount, and grand total are centered within their numeric cells.

## Comparison history

1. P1: the one-row address textarea showed a scrollbar and clipped wrapped text. Fixed with a two-row content-sized textarea, hidden overflow, and anywhere wrapping in both quote and REC/INV editors.
2. P1: the REC/INV metadata grid reserved only 110px for Delivery Time. Fixed by widening the right value track to 160px while preserving a flexible address track; the quote editor now also guarantees a 140px minimum right value track.
3. P2: monetary inputs were right-aligned inside full-width flex boxes. Fixed with a centered two-column currency/value grid and centered Qty, Total, and summary amount cells.
4. Post-fix focused comparison confirms two-line address wrapping, the full delivery window, and centered numeric columns.

## Primary interactions tested

- Load a long mixed-language address and confirm `rows=2` with automatic wrapping.
- Confirm the complete `07:00 PM - 08:00 PM` value remains visible.
- Inspect Unit Price, Qty, Total, subtotal, and grand-total alignment.
- Verify paid-order REC and INV actions are links to dedicated routes with `target=_blank` and safe opener isolation.
- Load the standalone invoice editor route and confirm its right-side INVOICE heading, absence of an invoice-number placeholder, and separate draft key.

## Automated checks

- Targeted receipt, order-list, and quote PDF editor tests: 72 passed.
- TypeScript build/lint check: passed.
- Production build: passed.
- Full suite: 832 passed; one pre-existing dashboard-navigation stylesheet assertion failed because an unrelated raw-meat selection rule still uses `color-mix`.

## Final result

passed

---

# Design QA: right-aligned INV title and quote-style clause pickers

## Source visual truth

- Title reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-18505308-fa71-43ae-8734-26f43d9e1225.png` (197 x 94 px).
- Clause-trigger reference: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-9e964afd-c92f-45c0-a7a5-48d014dda789.png` (275 x 130 px).
- State: INVOICE title positioned in the right header area with no `INV/` line; Terms and Payment Methods headings act as popup triggers.

## Rendered implementation

- Full browser capture: `E:\fccd\artifacts\invoice-title-modal-pagination-final.png` (1265 x 2405 px, 1x browser density).
- Title crop: `E:\fccd\artifacts\invoice-title-right-no-number-crop.png` (245 x 100 px).
- Trigger crop: `E:\fccd\artifacts\invoice-clause-triggers-crop.png` (730 x 350 px).
- Payment popup: `E:\fccd\artifacts\invoice-payment-modal-final.png` (1265 x 712 px).
- Combined comparison: `E:\fccd\artifacts\invoice-title-popup-comparison-final.png` (1600 x 1400 px).
- Local preview: `http://127.0.0.1:4173/artifacts/invoice-pdf-preview.html`.
- Viewport/state: 1265 CSS px desktop editor at 1x density; lower-content group moved to page two and Payment Methods modal open for interaction evidence.

## Fidelity review and findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the bold INVOICE heading preserves the existing PDF weight and scale. Removing the second line leaves no blank `INV/` marker or residual line-height gap.
- Spacing and layout rhythm: the title container remains in the third/right grid column. Terms and Payment Methods retain the quote editor's bordered trigger blocks and open large clause-picker dialogs.
- Colors and visual tokens: modal overlay, white panel, green confirmation button, blue page controls, black document rules, and muted delete controls reuse existing application tokens.
- Image quality and asset fidelity: existing brand logo and company stamp remain unchanged; no new raster or improvised assets were introduced.
- Copy and content: the invoice-number placeholder is absent. Both dialogs provide the same template suggestions, free-text search/add behavior, selected-item list, and removal controls as the quote PDF editor.

## Comparison history

1. P1: the invoice header still rendered `INV/` beneath INVOICE. Fixed by conditionally omitting the number field for invoice documents while retaining REC numbering.
2. P2: the clause headings previously inserted an empty editable row directly. Fixed by reusing the quote editor's Modal, search field, suggestion templates, free-text add action, selected-item list, and removal behavior.
3. Post-fix browser comparison confirms the right-side title has no second line and both plus triggers open their respective dialogs.

## Primary interactions tested

- Open the standalone INV editor and verify there is no accessible or visible `INV/` field.
- Open Terms and Conditions, add a template clause, remove a selected clause, and close the dialog.
- Open Payment Methods and inspect the shared searchable template picker.
- Move Terms, Payment Methods, and signatures together to page two and confirm the group remains complete.

## Console and automated checks

- Browser DOM inspection after each interaction showed no visible runtime error state.
- Receipt/INV editor, quote PDF editor, and order-list tests: 65 passed.
- TypeScript build/lint check: passed.

## Final result

passed
