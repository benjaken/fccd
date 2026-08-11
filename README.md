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

## Checks

```bash
npm run lint
npm run build
```

The initial layout includes Food Channel Catering branding, responsive navigation,
Traditional Chinese and English localization, dark mode, and reduced-motion
support.

## Bubble migration scanner

The public `/migration` page invokes the read-only `bubble-scan` Supabase Edge
Function. Bubble credentials are never accepted by or exposed to the browser.
The proxy only accepts the FCCD production and version-test Bubble Data API
hosts and only returns record counts.

Research imports use the `bubble-migrate` Edge Function and the RLS-protected
`migration_*` staging tables. The destructive reset is limited to staged
Bubble records; it does not clear Supabase Auth or operational tables. See
[the entity inventory and migration design](docs/BUBBLE_ENTITY_MIGRATION.md).

## Development workflow

All new development must branch from the latest `main` and return through a
reviewed integration. See [CONTRIBUTING.md](CONTRIBUTING.md).
