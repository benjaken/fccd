# Food Channel Catering

React/Vite operations interface for Food Channel Catering.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
Only use a publishable key in the browser; never expose a Supabase secret or
`service_role` key.

Vercel preview deployments also accept the Supabase integration's
`NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the
legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`). This allows a Git `develop` deployment
to follow the matching Supabase `develop` preview branch automatically.

### One-click preview sign-in

Each Vercel preview URL is a new origin, so the browser session does not carry
over. For preview/local testing only, set these Preview environment variables in
Vercel (or in `.env.local`):

```bash
VITE_ENABLE_QUICK_LOGIN=true
VITE_QUICK_LOGIN_EMAIL=you@example.com
VITE_QUICK_LOGIN_PASSWORD=your-password
```

The login page then shows **一鍵登入（預覽）**. You can also open
`https://your-preview.vercel.app/?autologin=1` for automatic sign-in.

Do not enable these on Production — the values are embedded in the client
bundle.

UI layout, theme, and status-color conventions are documented in
[`docs/UI_DEVELOPMENT_STANDARD.md`](docs/UI_DEVELOPMENT_STANDARD.md).
The full design system (shadcn + Ant Design → FCCD) is in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Checks

```bash
npm run lint
npm run test
npm run build
```

UI test cases are stored in [`test/`](test/). The production build runs the
full test suite automatically.

The initial layout includes Food Channel Catering branding, responsive navigation,
Traditional Chinese and English localization, dark mode, and reduced-motion
support.

## Bubble migration scanner

The public `/migration` page invokes the read-only `bubble-scan` Supabase Edge
Function. Bubble credentials are never accepted by or exposed to the browser.
The proxy only accepts the FCCD production Bubble Data API and only returns
record counts. See [migration.md](migration.md) for the confirmed inventory
page rules and migration constraints.

Regenerate the checked-in production Swagger inventory with
`npm run generate:bubble-schema`. Relationship validation runs server-side and
returns aggregate cardinality, confidence, and sampled orphan-reference data
without exposing raw Bubble records to the browser.

The unified develop branch also retains the resumable production export CLI
from the legacy migration branch:

```bash
python3 scripts/export_bubble.py discover
python3 scripts/export_bubble.py export --resume
```

Exports are written to the Git-ignored `.migration-data/` directory and may
contain sensitive raw records. If authentication becomes necessary, provide
`BUBBLE_API_TOKEN` through the environment; never pass it in chat or commit it.
Collections above Bubble's 50,000-cursor boundary are automatically partitioned
by `Created Date`. Use `--force <type>` together with `--resume` to rebuild one
previously completed export.

For a stable full-system report, use one fixed UTC snapshot across all types:

```bash
python3 scripts/export_bubble.py \
  --output .migration-data/full-snapshot \
  --snapshot-at 2026-08-12T02:39:34.000Z \
  export --resume
```

The fixed five-year migration policy is stored in
`config/migration-policy.json`. Export the historical baseline once with
`--window historical`; use `--window active` for the initial active set and
`--modified-after <last-checkpoint>` for later deltas.

## Development workflow

All new development must branch from the latest `main` and return through a
reviewed integration. See [CONTRIBUTING.md](CONTRIBUTING.md).
