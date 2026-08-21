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
