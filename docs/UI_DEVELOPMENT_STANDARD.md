# UI Development Standard

Approved UI hard rules for **FCCD** (*Food Channel Catering Delivery*) —
layout, theme, status colors, and preview sign-in.

**Canonical design system** (shadcn + Ant Design → FCCD):
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

## 0. Product name

個人客戶 `/customer/personal` 使用主頁、最新餐牌、即時訂購、付款單據、訂單、積分、地址、個人資料的路由選單。主頁優先呈現下一張訂單、再訂購及品牌餐牌；資料頁不提供密碼，聯絡電話不觸發訂單配對。PC 使用最高 820px 的置中 shell，768px 起啟用，頂部為綠色標題列與置中頁名；手機維持既有 Logo 頁首與抽屜選單。載入採用 `PageSkeleton`，未接通 Shopify 地址及個人積分顯示明確未開通狀態。Logo 沿用 `/assets/fc-catering-logo.svg`，不另做標誌。

客戶公開登入頁使用同一個 480px 內容區：Logo 與兩行標題並排於頂部，其下是個人／機構切換、登入說明及獨立白色表單卡片。兩種身份均使用電郵及 8 位 OTP；訊息顯示於表單內。舊電話／電郵查單只保留在相容入口，內部員工登入不變。

`/customer` 的模式連結以 `aria-current="page"` 標示目前身份，操作區最少 44px 高並支援鍵盤焦點。登入使用同一 Auth 身份；工作區資料及購物車按個人／機構隔離，機構授權由服務端核實。

未登入頁面不顯示身份切換；登入後僅在服務端確認兩種身份均可用時顯示。個人頁面與機構頁面共用 Logo 頁首、右上角操作區及載入／錯誤卡片，既有訂單內容按身份保留各自權限。

機構頁首使用現有 `/assets/fc-catering-logo.svg`，左側為 Logo 及身份／機構名稱，右上角為身份切換及登出；不再顯示下方切換列。手機容許右側操作區換行並保持靠右。載入／錯誤狀態使用獨立卡片，錯誤訊息保留 `role="alert"`，重試及登出操作保持原有授權。

- Short name: **FCCD**
- Full name: **Food Channel Catering Delivery**
- UI brand tokens live under `brand.name` / `brand.system` / `brand.fullName` in
  `src/i18n.ts`. Do not hard-code the old “Food Channel Catering / Operations”
  product title in new screens.

Pair this file with [`UI_TABLE_STANDARD.md`](UI_TABLE_STANDARD.md) for paginated
operational lists. When a visual rule changes, update `DESIGN_SYSTEM.md` and
this file in the same change set.

## 1. Page layout (all authenticated pages)

客戶訂購營運、公司 BR 申請、訂餐日曆、活動飯盒與積分兌換採列表與操作優先：頁名與說明由導航提供，頁面不另設標題區，搜尋、篩選及主要操作緊接列表。訂餐日曆的團體客戶選擇與月份導覽放在同一工具列，窄螢幕篩選獨佔一行。活動飯盒 VIP 週期設定透過既有 SidePanel 開啟；客戶積分規則的佈局保持原有安排。這些頁面使用既有 Input、Button、ListTable、TablePagination 及 SidePanel，不新增替代控制組件。

客戶積分規則頁保留全寬 shell；內容採規則橫額與版本紀錄。此頁不放假期或營業日設定。
積分規則資料載入期間，使用對應規則橫額、三項說明、版本表格的整頁骨架屏；沿用共享骨架樣式及減少動態偏好，以 `aria-busy` 和本地化狀態文字標示載入，資料就緒後才顯示版本數及操作。
綠色橫額內的骨架使用主色混合 18% 卡片色，保持柔和綠色；其他區域沿用共享骨架顏色。
所有規則編輯操作使用共享 SidePanel；退款統一於訂單功能處理，此頁不提供記錄退款入口。手機改單欄。時間明示 Asia/Hong_Kong，零門檻顯示暫停賺分；
缺少門檻或未開通的 API 顯示可恢復的狀態，不得呈現 NaN 或猜測賺分門檻。

Main content must use the full available width inside the shell. Do **not**
reintroduce a centered `max-width` (for example `1600px`) on page shells.

User-approved exception (2026-10-13): the personal customer Portal uses the original desktop shell from 768px: a centered column up to 820px, a 76px green title bar with the menu on the left and the current page title centered. Mobile keeps the existing logo header and drawer. This exception applies only to `.personal-workspace`; organization and operational pages retain the full-width rule.

| Shell | Rule |
|---|---|
| `.main-content` | Uniform padding `28px` on all sides |
| `.page-transition` | `width: 100%`; no max-width clamp |
| `.public-migration-shell` | Same `28px` padding as main content |
| Migration page / workspace wrappers | Full width; no `1600px` max-width |

Horizontal and vertical page margins must stay aligned. Narrow the side gutters
by removing width clamps, not by inventing a second container system per page.

Mobile breakpoints may reduce padding (for example `22px 14px 40px`); keep the
full-width rule.

## 2. Brand theme color

### Primary

- Brand / primary actions use a **clear medium-saturation green**, not red or
  blue.
- Canonical light token: `--primary: oklch(0.52 0.14 150)` in `src/index.css`.
- Dark mode uses a mid green primary (not pale) so **white** label text still
  meets contrast: `--primary: oklch(0.58 0.13 150)`.
- `--primary-foreground` is **white / near-white** in both light and dark mode.
  Filled primary buttons (for example「建立新訂單」) must show white label and
  icon text — never dark body text on the green fill.
- Active navigation (sidebar, workspace soft links, migration tabs) uses
  **`--nav-active-bg` / `--nav-active-fg`** — an explicit pale green wash +
  green label (about hue `150`). Do not leave residual pink/red from the old
  brand, and never the old brand blue.
- Light `--card` / `--popover` stay **white with hue `150`** (`oklch(1 0 150)`).
  Chroma `0` white with hue `0` looks identical until mixed in OKLCH, then it
  drifts toward pink/red. Keep the green hue even at zero chroma.
- Selected / active surfaces outside nav (report tabs, product pickers, filter
  chips) use **`--selection-bg` / `--selection-bg-strong`** (same green hue).
  Do **not** use `color-mix(... var(--primary) ..., var(--card))` for these
  washes — it can read as pink/red on some displays. Ranking cards and other
  quiet surfaces should use `--secondary` / `--muted` instead of mixing a
  chromatic token with `--card`.
- Classes named `red` (`.status-badge.red`, `.metric-icon.red`) map to
  `--destructive` only. Do not reuse them as a stand-in for the old brand
  primary; use `--primary` (green) for brand emphasis. Keep `.status-badge.blue`
  / `.metric-icon.blue` as **informational** blue, not brand color.
- `.price-up` / `.stock-negative` stay **semantic red** for rises / shortages;
  they are not brand chrome.
- Keep chroma in a readable mid range (roughly `0.12`–`0.16`). Avoid returning
  to high-chroma red, and avoid overly desaturated “muddy” primaries.
- Manage color through semantic tokens (`--primary`, `--accent`, `--ring`,
  `--destructive`, etc.). Do not hard-code brand greens/blues/reds in random
  components when a token already exists.
- When a primary `Button` uses `asChild` with a `<Link>`, ensure the link keeps
  `bg-primary` + white foreground. Global `a { color: inherit }` must not darken
  primary button labels (see the `a.bg-primary` / `button.bg-primary` override
  in `src/index.css`).

### Destructive and alerts

- `--destructive` stays **red** for errors, danger actions, and failure states.
- Do not repaint destructive UI with the brand green.

### Surfaces that follow primary

Login brand panel, brand mark, primary buttons, focus rings, active nav, and
primary links must follow the green tokens (and their dark-mode variants).
Primary button labels/icons stay white.

## 3. Multi-status progress colors

Dashboard **訂單進度 / Order progress** rows must use **distinct hues**, not
five shades of the brand green.

| Status | Tone class | Intent |
|---|---|---|
| 已確認 / Confirmed | `tone-indigo` | Indigo |
| 製作中 / Preparing | `tone-amber` | Amber / orange |
| 待出貨 / Ready | `tone-violet` | Violet |
| 配送中 / Shipping | `tone-cyan` | Cyan |
| 已完成 / Completed | `tone-green` | Green |

Implementation rules:

- Assign `tone` in the progress data and apply `progress-row tone-<name>`.
- Drive bar fill and count color with `--progress-tone`.
- Track background may use a light mix of the tone; do not force every bar to
  `--primary`.
- When adding new multi-step status charts, prefer clearly separated hues over
  a single brand-color family.
- Keep automated coverage that asserts each progress status keeps a distinct
  tone class (see `test/dashboard-navigation.test.tsx`).

Related badge / job status tones may reuse amber, green, blue, etc., but
progress rows specifically must stay multi-hue as above unless product
explicitly revises the mapping.

## 4. Preview one-click sign-in

Vercel preview URLs are unique origins, so auth sessions do not carry across
deployments. Optional preview / local quick login is allowed under these rules:

- Enable only with `VITE_ENABLE_QUICK_LOGIN=true` plus
  `VITE_QUICK_LOGIN_EMAIL` and `VITE_QUICK_LOGIN_PASSWORD`.
- Show **一鍵登入（預覽）** only when that flag and credentials are present.
- Optional deep link: `?autologin=1` (strip the query after starting sign-in).
- Configure Preview env vars in Vercel (or `.env.local` locally).
- **Never enable on Production.** `VITE_*` values are embedded in the client
  bundle.
- Never commit real passwords to git. Keep secrets in ignored env files or
  managed Preview secrets.

Helpers live in `src/lib/quick-login.ts`. See also the README section
“One-click preview sign-in”.

## 5. Shared UI components (hard rule)

Reusable controls that appear on multiple pages **must** be encapsulated under
`src/components/ui/` (or a clear shared domain folder). Do **not** copy-paste
the same input / search / skeleton / pagination markup across list pages.

| Pattern | Required component |
|---|---|
| Toolbar search (icon inside field + submit) | `ListSearchBar` → `SearchField` |
| Mobile list filters (hidden until icon tap) | `ListSearchBar` `filters` → `SidePanel` (確定套用後關閉) |
| Start–end date filters | `DateRangePicker` (one labeled range field) |
| Paginated operational table + loading rows | `ListTable` → `TableSkeletonRows` |
| Mobile table pull-to-refresh | `ListTable` / `PullToRefresh` |
| All page-level loading layouts | `PageSkeleton` with the appropriate `variant` |
| List pagination footer | `TablePagination` |
| Panel empty / error / permission | Prefer `OperationalListState` |

Rules:

- If the same (or functionally similar) UI is used on **two or more pages**,
  extract it before merging — do not leave divergent copies.
- Page files own data fetching and filter state; shared components own the
  repeated chrome and interaction shell.
- Page-level loading must preserve layout with a skeleton. Do not show visible
  spinner or plain “loading” text; keep the label as an sr-only status.
- Paginated operational list pages must use `ListTable`; do not hand-write a
  separate `<table>` and full-panel loading-spinner branch.
- Prefer extending an existing ui component (props / variants) over a one-off
  duplicate in a feature page.
- When you introduce a new shared control, document it in
  [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) §4 and update this table.

Canonical design-system wording (Chinese + checklist): see
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) §4.0.

## 6. Token and CSS ownership

| Concern | Source of truth |
|---|---|
| Theme tokens | `src/index.css` `:root` / `.dark` |
| Progress tone classes | `src/index.css` `.progress-row.tone-*` |
| Progress tone assignment | Dashboard progress data in `src/App.tsx` |
| Table row actions | `.table-actions-cell` + `.table-row-actions`; icon-only common actions |
| List search chrome | `SearchField` / `ListSearchBar` + `.search-field` / `.list-search` |
| Mobile filter drawer | `SidePanel` + `.side-panel` / `.list-search-filter-trigger` |
| Mobile table refresh | `PullToRefresh` + `.pull-to-refresh` |
| Quick-login gate | `src/lib/quick-login.ts` + env vars |
| Copy | `src/i18n.ts` |

New screens should reuse these tokens, classes, **and shared components**. If a
visual rule here changes, update this document in the same change set.

## 8. Copy / i18n placeholders (hard rule)

All user-visible copy goes through `src/i18n.ts` (`t(...)`). This includes
**input placeholders**. Never put English (or any) placeholder copy in JSX.

| Rule | Detail |
|---|---|
| Dedicated `*Placeholder` keys | Use `t("module.fields.namePlaceholder")`, not a field label such as `t("module.fields.name")`. Shared controls may take a `placeholder` prop, but callers still pass `t("…Placeholder")`. |
| No hard-coded placeholders | Do not write `placeholder="Product Name"`, `placeholder="0"`, or `placeholder="選擇生肉"` in JSX. |
| zh-HK is Chinese | Default locale placeholders must contain Traditional Chinese, or be a numeric / email / phone example (`例如：0.5`, `name@foodchannels.com`). |
| Do not paste Bubble English | Never copy English Bubble labels (`Product Name`, `Product Code`, `Choose some options...`, `Remark`) into the `zh-HK` catalog. |
| en-GB may be English | The English locale is the only place for English placeholder sentences (`e.g. 1`, `Enter remarks`). Even there, use instructional copy, not Bubble leftovers. |
| Examples | zh-HK uses `例如：…`. Do not use `e.g.` in `zh-HK`. |

Automated coverage: `test/i18n-placeholders.test.ts` rejects English-prose
`*Placeholder` strings in `zh-HK`, hard-coded `placeholder="…"`, and
`placeholder={t("…")}` keys that do not end in `Placeholder`.

## 9. Related standards

- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — FCCD design system (shadcn + Ant Design)
- [`UI_TABLE_STANDARD.md`](UI_TABLE_STANDARD.md) — paginated operational tables
- [`RLS_PAGE_COMPLETION_STANDARD.md`](RLS_PAGE_COMPLETION_STANDARD.md) — page
  access / RLS completion
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — branch, test, and merge workflow
- [`../README.md`](../README.md) — local setup and preview env vars

積分兌換管理頁使用有標籤的雙欄表單及獨立目錄，窄螢幕改為單欄；Shopify 客戶對應以可展開區域呈現。載入失敗保留重試，不能顯示成空目錄；提交及處理兌換期間鎖定相應操作，編輯可以取消。


機構詳情頁以機構識別與操作工具列開頭，餐單為主欄、成員為輔欄；1440px 以下改單欄。列表採既有 ListTable 並與 panel header 共用單一外框，不嵌套卡片。指定管理員透過共享 SidePanel 編輯，成功後關閉，失敗保留輸入。此頁不新增泛用頁面標題或說明。


機構與餐單編輯沿用 SidePanel；表單以 fieldset/legend 分組，基本資料、供餐安排、設定與餐點分區，手機單欄。供餐範圍使用 DateRangePicker，時間使用 TimePicker/DateTimePicker，品牌與產品使用 FilterableSelect。底部提供關閉及儲存；儲存時禁止關閉，失敗在面板內顯示錯誤。


機構與餐單編輯面板使用共享 SidePanel 的 half variant：桌面 50vw，手機全寬。表單雙欄對齊並統一控制高度為 40px；截單日期與時間可收縮，餐點列保留名稱、單價、數量與刪除操作，手機將名稱獨佔一行。


客戶介紹內容使用共享 RichTextEditor（粗體、斜體、底線、項目與編號清單），編輯面板桌面半寬、手機全寬。內容儲存為清理過的 HTML，客戶端使用相同 allowlist 顯示；舊純文字仍保留換行。

飯盒餐單頁（`CustomerPortalLunchboxPage`）建立／編輯須使用 `SidePanel half`，桌面 50vw、`max-width: 767px` 時 100vw。餐單資料、配送設定及餐點以 `fieldset`／`legend` 分組；產品、單價、數量須有可見標籤，手機單欄。空列表為具編輯權限者提供建立餐單 CTA；VIP 週期與餐單勾選器使用獨立 SidePanel。頁面特例樣式放在 `src/components/settings/customer-lunchbox.css`，沿用既有 tokens、Button、Input 與 ListTable。
