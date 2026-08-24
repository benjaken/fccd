# Custom Product Modal Focus-State QA

**Evidence**

- Source visual truth: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-a7f37f55-06c0-47cd-8a8d-3d268d601083.png`
- Browser-rendered implementation: `E:\fccd\artifacts\custom-product-modal-no-focus-glow.png`
- Normalized comparison: `E:\fccd\artifacts\custom-product-modal-focus-comparison.png`
- Browser route: existing quote edit page on the local Vite preview
- CSS viewport: 1280 x 720 at device scale factor 1
- Source pixels: 421 x 267
- Implementation pixels: 1280 x 720
- Comparison pixels: 1100 x 400; both modal regions were cropped and scaled into adjacent panels.
- State: custom-product modal open with the unit-price number input focused. The implementation preserves the active dark theme; the issue reference is light theme.

**Findings**

- No actionable P0, P1, or P2 issue remains.
- Fonts and typography: unchanged from the shared component implementation.
- Spacing and layout rhythm: unchanged; the compact single-column form and shared footer remain aligned.
- Colors and visual tokens: the shadcn Input focus ring and focus border are overridden only for these two modal fields. Computed focus state has a zero-width ring and the normal input border color, so the green glow is gone.
- Image quality and asset fidelity: no raster or decorative assets are involved; the shared close icon remains sharp.
- Copy and content: all Traditional Chinese labels and actions are unchanged.
- Accessibility: labels and keyboard focus behavior remain functional. The text caret and native number-input controls still identify the active field without an outer glow.

**Full-view comparison evidence**

- The combined before/after image clearly shows the original green focus glow and the revised neutral focused field.

**Focused region comparison**

- No additional crop was needed because the normalized comparison makes the complete focused input border readable.

**Comparison history**

- Pass 1 found the visible green shadcn focus ring reported by the user.
- Fix: added component-level `focus-visible:ring-0` and restored the normal input border token for both custom-product inputs.
- Pass 2: browser screenshot and computed styles confirm no visible outer focus ring; no P0/P1/P2 finding remains.

**Primary interactions tested**

- Opened the custom-product modal from an existing quote.
- Focused the unit-price field and visually checked the focused state.
- Confirmed the computed ring width is zero and the browser console has no errors.
- Targeted quote-editor tests and TypeScript checks pass.

**Implementation checklist**

- [x] Removed the visible focus glow from both custom-product inputs.
- [x] Kept the shared shadcn Input component.
- [x] Preserved validation, labels, number controls, and form behavior.
- [x] Verified the focused state in the browser.

**Follow-up polish**

- None required for this scope.

final result: passed

---

# Lunch Box Product Side-Panel QA

**Evidence**

- Source visual truth: `C:\Users\neroc\AppData\Local\Temp\codex-clipboard-ea7d5081-f39f-4ca0-a607-07a9e8acb5b8.png`
- Browser-rendered desktop implementation: `E:\fccd\artifacts\lunchbox-picker-sidebar-selected.png`
- Browser-rendered mobile implementation: `E:\fccd\artifacts\lunchbox-picker-sidebar-mobile.png`
- Independent-scroll implementation: `E:\fccd\artifacts\lunchbox-picker-independent-scroll.png`
- Normalized side-by-side comparison: `E:\fccd\artifacts\lunchbox-picker-comparison.png`
- Browser route: local order `#6951` edit page with the lunch-box picker open
- Desktop viewport: 1440 x 900 CSS pixels at device scale factor 1
- Mobile viewport: 390 x 844 CSS pixels at device scale factor 1
- Source pixels: 1928 x 1048; desktop implementation pixels: 1440 x 900; mobile implementation pixels: 390 x 844
- Comparison pixels: 3096 x 900. The source was proportionally scaled to 1656 x 900 and placed beside the unchanged 1440 x 900 implementation.
- State: one recommended lunch-box product selected, sticky footer enabled, product results loaded.

**Findings**

- No actionable P0, P1, or P2 issue remains.
- Fonts and typography: the side panel uses the application's existing type scale and weights; headings, SKU labels, tags, prices, and actions retain readable hierarchy in desktop and mobile layouts.
- Spacing and layout rhythm: the desktop panel is exactly 80% of the viewport. The selected tray occupies the left column, while recommended and more products occupy the right column; the 390 px layout collapses to one column without horizontal overflow. Search and confirmation controls remain visible.
- Colors and visual tokens: selection uses the existing primary and selection tokens, recommended items use a restrained amber accent, and surfaces inherit the active light or dark theme without gradients.
- Image quality and asset fidelity: the picker contains no raster product imagery or decorative assets. Existing Lucide icons remain sharp at both checked sizes.
- Copy and content: the final panel preserves the requested `已選取`, `推介`, and `更多產品` sections. It intentionally replaces the legacy modal/table treatment with the user-approved side panel and removes edit and row-arrow controls.
- Accessibility and interaction: product rows expose selected state through `aria-pressed`; the confirmation action is disabled at zero selections and enabled after selection. No edit buttons or chevron row controls are present.

**Full-view comparison evidence**

- The normalized comparison shows the legacy table's dense horizontal structure on the left and the approved side-panel hierarchy on the right. The new layout preserves the product metadata while making selection, selected state, and confirmation visually dominant.

**Focused region comparison**

- The desktop implementation screenshot keeps the complete side panel readable at 1440 x 900, including search, selected tray, recommended list, more-products list, and sticky footer, so no additional focused crop was needed.

**Comparison history**

- Pass 1 found that the Catering order brand allowed unrelated catalog items into `更多產品`.
- Fix: the picker now queries products with an assigned lunch-box staple category independently of the order's current brand.
- Pass 2: browser evidence shows 6 recommended and 96 more lunch-box products with CBE SKUs and bento attributes. Desktop and 390 px mobile states have no overflow, missing persistent controls, console errors, edit buttons, or row-arrow icons.
- Pass 3: changed the panel to exactly 80% viewport width and moved the selected tray into a persistent left column. Browser measurements confirm a 0.80 panel-to-viewport ratio, separated left/right columns, and no horizontal overflow; mobile remains a single column.
- Pass 4: moved the selected title above its full-height box and aligned it exactly with the recommended title. Browser measurements report a 0 px heading offset; the selected box and product catalog both use independent `overflow: auto` regions while search and footer remain fixed.

**Primary interactions tested**

- Opened the picker from the local `#6951` order edit page.
- Loaded recommended and more-product sections from live local-app data.
- Selected a recommended item and confirmed the selected tray/count and enabled footer action.
- Verified desktop and mobile responsive layouts.
- Checked the browser console for errors; none were present.

**Implementation checklist**

- [x] Use a right-side panel instead of a centered modal.
- [x] Keep `已選取`, `推介`, and `更多產品` sections.
- [x] Add search and expandable filters.
- [x] Make the whole product row selectable.
- [x] Remove edit and table-arrow controls.
- [x] Add every confirmed product as a separate pending order line.
- [x] Restrict results to lunch-box products.
- [x] Verify desktop and mobile layouts in the browser.

**Follow-up polish**

- None required for this scope.

final result: passed
