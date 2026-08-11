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

## Development workflow

All new development must branch from the latest `main` and return through a
reviewed integration. See [CONTRIBUTING.md](CONTRIBUTING.md).
