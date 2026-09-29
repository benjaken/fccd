# AGENTS.md

## Validation commands

- `npx tsc --noEmit -p tsconfig.json` — type check
- `npm run lint` — lint
- `npm run test:changed` — tests for the current change scope
- `npm test` / `npm run verify` — full suite
- `npm run build` — build (runs `test:changed` first)

## Database / Supabase access

- Active token: the `SUPABASE_ACCESS_TOKEN` in `.env.local` (the tokens in
  `.env.supabase.local` are not authorized).
- Project ref: `vignxasvlxqnyvuhtjlu` (from `supabase/.temp/linked-project.json`).
- Ad-hoc SQL: `POST https://api.supabase.com/v1/projects/<ref>/database/query`
  with `Authorization: Bearer <token>` and JSON body `{ "query": "..." }`.

## Encoding: always send SQL as UTF-8 bytes

Chinese literals in SQL queries will be silently mangled when passed through
PowerShell `Invoke-RestMethod` / `ConvertTo-Json`, because the console/transport
encoding is not UTF-8. This produced wrong results (e.g. a "cancelled" filter
that failed to match `已取消`).

Do this instead — send the body as explicit UTF-8 bytes:

```powershell
$token = (Get-Content .env.local | Select-String '^SUPABASE_ACCESS_TOKEN=').Line.Split('=',2)[1].Trim()
$ref = 'vignxasvlxqnyvuhtjlu'
$body = @{ query = "select 1 where '已取消' = '已取消';" } | ConvertTo-Json -Compress
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("Authorization", "Bearer $token")
$wc.Headers.Add("Content-Type", "application/json")
$utf8 = New-Object System.Text.UTF8Encoding($false)
$resp = $wc.UploadData("https://api.supabase.com/v1/projects/$ref/database/query", "POST", $utf8.GetBytes($body))
[System.Text.Encoding]::UTF8.GetString($resp) | ConvertFrom-Json
```

Alternatives that avoid the problem entirely:

- Prefer ASCII-only predicates: compare `encode(convert_to(col,'UTF8'),'hex')`
  or `position(chr(...)||chr(...) in col)` instead of embedding Chinese text.
- Do not trust the console rendering of query output; decode response bytes as
  UTF-8 before inspecting.

## Workflow

Follow [`CONTRIBUTING.md`](CONTRIBUTING.md): branch from latest `main`, keep
commits scoped, run the checks above, never commit secrets or build output.
