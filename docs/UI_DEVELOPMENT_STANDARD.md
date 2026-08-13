# UI Development Standard

Approved UI hard rules for Food Channel Catering (layout, theme, status colors,
preview sign-in).

**Canonical design system** (shadcn + Ant Design → FCCD):
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

Pair this file with [`UI_TABLE_STANDARD.md`](UI_TABLE_STANDARD.md) for paginated
operational lists. When a visual rule changes, update `DESIGN_SYSTEM.md` and
this file in the same change set.

## 1. Page layout (all authenticated pages)

Main content must use the full available width inside the shell. Do **not**
reintroduce a centered `max-width` (for example `1600px`) on page shells.

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

- Brand / primary actions use a **clear medium-saturation blue**, not red.
- Canonical light token: `--primary: oklch(0.52 0.145 250)` in `src/index.css`.
- Dark mode uses a mid blue primary (not pale) so **white** label text still
  meets contrast: `--primary: oklch(0.58 0.14 250)`.
- `--primary-foreground` is **white / near-white** in both light and dark mode.
  Filled primary buttons (for example「建立新訂單」) must show white label and
  icon text — never dark body text on the blue fill.
- Keep chroma in a readable mid range (roughly `0.12`–`0.16`). Avoid returning
  to high-chroma red, and avoid overly desaturated “muddy” primaries.
- Manage color through semantic tokens (`--primary`, `--accent`, `--ring`,
  `--destructive`, etc.). Do not hard-code brand blues/reds in random
  components when a token already exists.
- When a primary `Button` uses `asChild` with a `<Link>`, ensure the link keeps
  `bg-primary` + white foreground. Global `a { color: inherit }` must not darken
  primary button labels (see the `a.bg-primary` / `button.bg-primary` override
  in `src/index.css`).

### Destructive and alerts

- `--destructive` stays **red** for errors, danger actions, and failure states.
- Do not repaint destructive UI with the brand blue.

### Surfaces that follow primary

Login brand panel, brand mark, primary buttons, focus rings, and primary links
must follow the blue tokens (and their dark-mode variants). Primary button
labels/icons stay white.

## 3. Multi-status progress colors

Dashboard **訂單進度 / Order progress** rows must use **distinct hues**, not
five shades of the brand blue.

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

## 5. Token and CSS ownership

| Concern | Source of truth |
|---|---|
| Theme tokens | `src/index.css` `:root` / `.dark` |
| Progress tone classes | `src/index.css` `.progress-row.tone-*` |
| Progress tone assignment | Dashboard progress data in `src/App.tsx` |
| Quick-login gate | `src/lib/quick-login.ts` + env vars |
| Copy | `src/i18n.ts` |

New screens should reuse these tokens and classes. If a visual rule here
changes, update this document in the same change set.

## 6. Related standards

- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — FCCD design system (shadcn + Ant Design)
- [`UI_TABLE_STANDARD.md`](UI_TABLE_STANDARD.md) — paginated operational tables
- [`RLS_PAGE_COMPLETION_STANDARD.md`](RLS_PAGE_COMPLETION_STANDARD.md) — page
  access / RLS completion
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — branch, test, and merge workflow
- [`../README.md`](../README.md) — local setup and preview env vars
