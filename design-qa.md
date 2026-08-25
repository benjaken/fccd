# Shopify Pending Products Design QA

- Source visual truth: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-bf619a53-29fe-4c15-991d-000ca54c4138.png`
- Implementation screenshot: `D:/work/FCCD/.design-qa/shopify-pending-implementation.png`
- Combined comparison: `D:/work/FCCD/.design-qa/shopify-comparison.png`
- Reference pixels: 2048 x 298
- Implementation pixels: 2048 x 1024
- CSS viewport: 2048 x 1024
- Device scale factor: 1
- State: authenticated Super Admin, light theme, populated Shopify pending-product table

## Full-view comparison evidence

The implementation uses the same hierarchy as the package-list reference: compact eyebrow and title, one rounded table panel, a single search/filter toolbar, a result-count strip, sticky table header, scrollable rows, and anchored pagination. The surrounding FCCD application chrome is intentionally retained because the source is a content-region crop.

The Shopify-specific sync controls remain at the right of the toolbar. This is an intentional functional extension and does not alter the reference layout rhythm on the left.

## Focused region comparison evidence

The combined image compares the reference toolbar/table crop with the rendered implementation at the same 2048-pixel width. Search field height, button density, panel radius, separators, result metadata, header treatment, row density, and green/neutral token usage follow the existing package-list design system. No raster or decorative image assets are required by this screen.

## Required fidelity surfaces

- Fonts and typography: inherited FCCD Inter/Noto Sans TC stack, weights, table labels, and heading hierarchy match the reference design system.
- Spacing and layout rhythm: 20px page gap, 16px x 18px toolbar padding, compact result strip, fixed-height table region, and sticky pagination match the package-list composition.
- Colors and visual tokens: existing background, card, border, foreground, muted, primary, warning, and status tokens are preserved in both light and dark themes.
- Image quality and asset fidelity: no content imagery is present in the source or required in the implementation; existing application logo and Lucide control icons are reused.
- Copy and content: Shopify-specific labels, columns, status information, sync controls, and live result count are retained while following the reference hierarchy.

## Interaction and runtime checks

- Local route opened successfully after preview login.
- Search, filter trigger, filter dialog, close control, refresh control, sync selectors, table scrolling, row links, and pagination render as interactive controls.
- Filter dialog opened and closed successfully.
- Browser console errors: none.
- TypeScript lint: passed.
- Targeted Shopify integration tests: passed.
- Full production build: passed (140 test files, 1091 tests).

## Findings

No actionable P0, P1, or P2 visual differences remain. The additional sync controls and recent-sync text are accepted Shopify workflow requirements.

## Comparison history

- Pass 1: reorganized the previously separate sync and filter sections into one package-list-style panel, moved list filters into the shared filter drawer, added the result-count strip and row index, and verified the revised light/dark render. Post-fix comparison found no actionable P0/P1/P2 issues.

## Follow-up polish

- P3: long Shopify product titles and numeric IDs can be further separated typographically if the team prefers a two-line product cell.

final result: passed

---

# Product Material Three-Column Design QA

- Source visual truth: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-ea5cc29d-4a08-4339-b4bb-d7977486852b.png`
- Implementation screenshot: `D:/work/FCCD/.design-qa/product-material-three-column.png`
- Combined comparison: `D:/work/FCCD/.design-qa/product-material-comparison.png`
- Skeleton screenshot: `D:/work/FCCD/.design-qa/product-detail-skeleton.png`
- Reference pixels: 1678 x 463
- Implementation pixels: 1663 x 1253; CSS viewport 1678 x 900; device scale factor 1
- State: authenticated Super Admin, light theme, product `蒜蓉牛油多士 (12件)` with populated ingredient, packaging, and Label data

## Full-view comparison evidence

The source records the previous two-column wrap. The user-requested target is the same three cards in one row. The browser-rendered implementation places all three cards at the same y-position in three equal tracks (`446.328px 446.328px 446.344px`) with 16px gaps and equal 217px heights. Existing FCCD card borders, radii, spacing, table headers, and green section accents are unchanged.

## Focused region comparison evidence

`product-material-comparison.png` places the supplied before-state and the rendered three-column result in one image. Card order remains 名貴食材, 包裝用品, Label. Text and table values remain readable without clipping at the requested desktop width.

## Required fidelity surfaces

- Fonts and typography: existing FCCD font stack, weights, line heights, and section/table hierarchy are preserved; headings remain on one line at the tested width.
- Spacing and layout rhythm: three equal columns, 16px gaps, aligned card tops and bottoms, and consistent 18px card padding pass.
- Colors and visual tokens: background, panel, border, muted table header, foreground, and primary green tokens match the supplied screen.
- Image quality and asset fidelity: the changed region contains no raster assets or non-standard icons; no assets were substituted.
- Copy and content: all source labels and values are preserved. The empty packaging state also retains its middle column so Label never shifts position.

## Skeleton and runtime checks

- Product detail now uses a dedicated `product` skeleton rather than the generic two-card detail skeleton.
- Browser measurement confirms the material skeleton has three children and three equal columns (`446.328px 446.328px 446.344px`) at the same desktop viewport.
- Product route and populated data loaded successfully after preview login.
- Browser console errors: none.
- TypeScript lint: passed.
- Targeted tests: 31 passed.

## Findings

No actionable P0, P1, or P2 differences remain. At widths below 900px, the existing responsive behavior intentionally stacks the cards to prevent table clipping.

## Comparison history

- Pass 1: changed the content grid from two columns to three, but the generic skeleton still overrepresented the first card and did not mirror the material row closely enough.
- Pass 2: added the product-specific summary skeleton and three compact material table skeletons. Post-fix browser measurement confirmed three equal columns, aligned with the final content grid.

## Follow-up polish

- No P3 follow-up is required for the requested layout.

final result: passed
