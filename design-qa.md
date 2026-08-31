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
