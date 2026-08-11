# FCCD

Food Channel Catering system migration.

## Migration console

The Next.js console scans record and field counts for the 101 configured Bubble
Data API types. It defaults to the production API and also accepts the FCCD
`version-test` URL. Type suffixes are URL-encoded by the server.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. A Bubble admin token can be entered for the
current browser session or configured server-side:

```bash
BUBBLE_API_TOKEN='...' npm run dev
```

The scan endpoint validates the Bubble host and API path and never returns
record contents to the browser.

## Bubble Data API export

The migration utility discovers all exposed Bubble Data API types from the
OpenAPI document and exports records as newline-delimited JSON (NDJSON).

```bash
# Download the schema and create a field inventory
python3 scripts/export_bubble.py discover

# Export every exposed type
python3 scripts/export_bubble.py export

# Continue an interrupted export without downloading completed types again
python3 scripts/export_bubble.py export --resume

# Export selected types
python3 scripts/export_bubble.py export \
  --type A_Order \
  --type A_Customers
```

If public privacy rules do not grant access, provide an admin API token through
the environment. Never put the token in a command argument or commit it.

```bash
export BUBBLE_API_TOKEN='...'
python3 scripts/export_bubble.py export
unset BUBBLE_API_TOKEN
```

Raw schemas, records, and export manifests are written to `.migration-data/`.
That directory is intentionally ignored by Git because records may contain
personal and commercially sensitive information.

The Data API exposes database fields and records, but it does not expose Bubble
Privacy Rule definitions or frontend/backend workflow steps. Those must still
be captured from the Bubble editor.
