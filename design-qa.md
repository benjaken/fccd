# Design QA — Order quote option settings

- Source visual truth:
  - `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-ee8445f4-6c67-45e0-9e49-7a443e44c1ce.png`
  - `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-6239e452-a27a-4e4e-8d8a-639f11f09642.png`
- Browser-rendered implementation screenshots:
  - `D:\work\FCCD\design-qa-quote-sources-default.png`
  - `D:\work\FCCD\design-qa-quote-terms.png`
- Combined focused comparison: `D:\work\FCCD\design-qa-comparison.png`
- Viewport: 1280 × 720 CSS px, device scale factor 1.
- Pixel dimensions: source screens 2048 × 427 and 2048 × 851; implementation screenshots 1280 × 728. The focused comparison normalizes both quote-source content regions to a shared 1200 px maximum width.
- State: authenticated Super Admin, Traditional Chinese, light theme, populated tables.

## Full-view comparison evidence

The implementation keeps the current FCCD application shell and design tokens instead of recreating the older tab strip shown in the reference. Within that established shell, the heading, top-right add action, bordered table card, option rows, active controls, and long-form content hierarchy match the requested information architecture. The five destinations are present in the Order Settings navigation.

## Focused region comparison evidence

`design-qa-comparison.png` compares the quote-source reference and the rendered main content. The option names, table hierarchy, active state column, pale canvas, white card, and add action are preserved. The current design system intentionally uses a search toolbar, roomier rows, green semantic controls, and an edit action. No raster assets are required by these settings screens; all icons use the repository's existing icon system.

## Required fidelity surfaces

- Fonts and typography: current FCCD font stack, weights, line heights, and Traditional Chinese rendering remain consistent with adjacent production settings pages. Long terms wrap without clipping.
- Spacing and layout rhythm: heading/action alignment, panel padding, table tracks, row spacing, and card radii are consistent with the current settings system. No horizontal overflow or hidden persistent controls was observed.
- Colors and visual tokens: background, borders, text, active green, and focus treatment use existing semantic tokens and pass the current light/dark theme model.
- Image quality and asset fidelity: the references contain no content imagery. Existing vector icons remain crisp at device scale factor 1.
- Copy and content: the five requested Traditional Chinese labels and existing option values render correctly. T&C content preserves punctuation and wrapping.

## Findings

No actionable P0, P1, or P2 visual differences remain. The visible differences from the old reference shell are intentional current-product constraints, not regressions in the new settings tables.

## Primary interactions and console

- Opened the quote source and quote T&C routes from the local app.
- Confirmed all five Order Settings navigation destinations are present.
- Opened and closed the add T&C panel and verified it uses a textarea plus active control.
- Filtered quote sources to `Email` and verified only one matching row remains.
- Checked captured browser console warnings/errors: none.

## Comparison history

- Pass 1: no P0/P1/P2 findings. No visual fixes were required after the browser comparison.

## Follow-up polish

- P3: the references use a denser legacy table. The roomier current table is retained for consistency and touch accessibility.

final result: passed
