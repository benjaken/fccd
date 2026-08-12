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

## Development workflow

All new development must branch from the latest `main` and return through a
reviewed integration. See [CONTRIBUTING.md](CONTRIBUTING.md).
