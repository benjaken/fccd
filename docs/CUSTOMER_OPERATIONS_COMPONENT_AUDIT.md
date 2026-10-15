# Customer operations component audit

Scope: customer ordering operations, company BR applications, reward rules, meal calendar, lunchbox management, reward redemption, and their sidebar.

| Surface | Existing components reused | Change |
| --- | --- | --- |
| Sidebar | `OperationsShell` and `renderSidebarItem` in `App.tsx` | Scoped spacing, active state and keyboard focus; no second navigation implementation |
| Ordering operations | Button, ListSearchBar, ListTable, SidePanel, Switch | Use Input and TablePagination; keep list hierarchy without a repeated page title |
| Company BR | Button, ListSearchBar, ListTable, SidePanel, Switch | Use Input and TablePagination; make policy a secondary strip beside the primary list workflow |
| Reward rules | Existing rule/history/refund layout and components | Preserve layout; concurrent rule changes remain outside this redesign |
| Meal calendar | Existing kitchen calendar date helpers/styles, Button, FilterableSelect, SidePanel | Customer filter joins month toolbar; use Input in holiday editor; narrow screens wrap the filter |
| Lunchbox | Button, ListTable, SidePanel, Switch | Use Input; VIP cycle configuration moves into the existing SidePanel |
| Reward redemption | Button, PageSkeleton, ListTable, TablePagination, SidePanel | Use Input; use an aligned action toolbar above redemption records |

No replacement UI primitives or parallel sidebar components were created. Page-specific calendar cells and BR attachment drop behavior remain domain markup. Native select, checkbox, file and textarea elements remain where their existing form contracts apply; this audit does not claim every DOM control is a shared React component.

Validation: type check, lint, and 22 focused UI tests passed. Edge-function check and Vite production compilation also passed before returning to develop. The full `npm run build` gate stops on existing placeholder policy failures in EnquiryFormEditorPage and CustomerPortalPage. Browser review verified the calendar toolbar at desktop and 390px widths and the reward redemption layout; live operational RPC failures are presented with retry rather than empty success states.
