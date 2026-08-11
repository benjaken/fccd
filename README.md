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

## Development workflow

All new development must branch from the latest `main` and return through a
reviewed integration. See [CONTRIBUTING.md](CONTRIBUTING.md).
