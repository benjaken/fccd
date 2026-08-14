# Hybrid Bubble file migration runbook

## Current gate

Baseline file migration is complete as of 2026-08-14. Live aggregates:

- `attachments` rows: 4,201
- verified: 4,147 (6 of these have `source_size_corrected`)
- excluded unavailable CSV: 54 (`accepted_unavailable_csv`)
- unique Storage objects / SHA-256 blobs: 4,038

The 2026-08-12 snapshot still contains exactly 2,711 protocol-relative
field references. The File Manager inventory (about 4,200 items) was the
baseline that was actually uploaded. Details:
[`2026-08-14-migration-report.md`](./2026-08-14-migration-report.md).

Historical snapshot field references (not the File Manager inventory):

The fixed snapshot contains exactly 2,711 valid protocol-relative references:

| Bubble field | References |
|---|---:|
| `shop_dailysales.POS sheet` | 1,770 |
| `quote_file.file` | 722 |
| `b_deliveryschedule.image` | 203 |
| `ds_channel.Logo_SVG` | 8 |
| `ds_channel.Logo_png` | 8 |
| **Total** | **2,711** |

Those 2,711 references are a subset of the File Manager inventory. The
inventory gap versus the old 4,198 screenshot no longer blocks upload.

## Required baseline inputs

Provide all of the following to the migration operator:

1. The unchanged fixed snapshot at `.migration-data/full-snapshot/`, including
   `export-manifest.json` and all referenced JSONL object exports.
2. A current Bubble File Manager CSV or JSON export covering all 4,198 items.
   It must include file URL and Modified Date. File name, source row/type/field,
   owner type, owner UUID or legacy ID, and attachment target should be included
   when Bubble provides them.
3. `SUPABASE_URL` and one server-only
   `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`.
4. The `20260812090637_create_attachments` migration reviewed and applied to
   the intended Supabase project, creating the private
   `attachments` bucket. This repository does not apply it
   remotely.
5. A written reconciliation confirming that the combined, deduplicated
   discovery count is 4,198 and explaining any duplicate File Manager entries.

Never commit the export, manifests, cache, secrets, raw URLs, IDs, or file
names. `.migration-data/` and `.env*` are ignored.

Bubble File Manager links may include Google Analytics parameters such as
`_gl`, `_gcl_au`, `_ga`, and `_ga_*`. The CLI strips these parameters before
hashing or deduplication. The stable CDN path identifies the source object;
downloaded SHA-256 identifies the content version.

## Baseline

Run from a trusted server shell:

```sh
npm run migrate:bubble-files -- discover \
  --inventory /secure/path/bubble-file-manager.csv
npm run migrate:bubble-files -- enrich --concurrency 6
npm run migrate:bubble-files -- upload --concurrency 6
npm run migrate:bubble-files -- verify --concurrency 6
```

`upload` refuses an incomplete inventory by default. `--allow-partial` exists
only for an explicitly approved recovery exercise and must not be used for the
production baseline. Files up to 6 MB use the standard Storage upload. Larger
files use resumable TUS uploads. The runner uses deterministic, filename-free
private object paths and stores only the SHA-256 source URL digest in
`public.attachments`.

The manifest is atomically checkpointed throughout enrichment, upload, and
verification. Failed entries retain a non-sensitive error code and can be
retried. Verification streams the private object back and checks both byte size
and SHA-256. The baseline checkpoint advances only after at least 4,198
baseline entries are verified. The framework never deletes source or target
files automatically.

## Incremental

Export a fresh File Manager inventory, then run:

```sh
npm run migrate:bubble-files -- incremental \
  --inventory /secure/path/bubble-file-manager-latest.json \
  --concurrency 6
```

The command takes an exclusive local lock, selects only records whose Modified
Date is later than the last successful checkpoint, and runs discover, enrich,
upload, and verify. It advances the checkpoint only when every selected item is
verified. A missing baseline checkpoint, concurrent run, incomplete inventory,
or failed file leaves the checkpoint unchanged.

## Privacy and operational controls

- Run only on a trusted server; browser-prefixed secret variables are rejected.
- Raw source URLs exist only in the git-ignored local manifest.
- Public frontend status is generated as counts and redacted field aggregates.
- `attachments` enables RLS with no browser policy and revokes `anon` and
  `authenticated`; `service_role` is the only granted role.
- The Storage bucket is private. No public URL is generated or stored.
- The dedupe comparison is source URL hash + private path + checksum.
- Concurrency is constrained to 4–8 and transient requests use bounded
  exponential backoff.
