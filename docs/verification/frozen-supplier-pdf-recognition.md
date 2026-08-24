# Frozen supplier PDF recognition verification

Date: 2026-08-23
Change: `improve-frozen-supplier-pdf-recognition`

## Reproducible fixture results

| Redacted fixture | Layout | Expected candidates | Conditions | Key checks |
| --- | --- | ---: | ---: | --- |
| A-Mart | multi-column catalogue | 2 | 1 | code, bilingual name, multi-pack, quoted price, TBA |
| Euro Foodstuff | mixed tables across pages | 2 | 1 | page evidence, sliced spec, kg/case, delivery condition |
| Tai Fung | double-column list | 3 | 1 | left/right rows remain separate, Chinese names, unavailable status, surcharge |

The Vitest fixture runner rebuilds extraction and layout IR, validates each
candidate, checks variant fingerprints, and exercises AI-disabled and mocked
AI-enabled modes. It does not contain original supplier PDFs or supplier prices.

## Local verification completed

- supplier quote Vitest files: 5 files, 36 tests passed;
- affected frontend TypeScript check: passed;
- Edge Function isolated TypeScript check: passed;
- production frontend bundle: built in an isolated temporary directory;
- bundle scan: no `SUPPLIER_QUOTE_AI_API_KEY`, provider endpoint, private bucket,
  or storage-path marker found;
- full repository regression: intentionally not run because the development
  window is still open.

## Supabase test-project verification completed

- applied migrations `20260822230000` and `20260822231000` transactionally;
- confirmed the two pre-existing documents and confirmed-line count were not
  changed, and verified the new columns, indexes, constraints, policies, and
  RPCs;
- verified an unauthorized authenticated role cannot read parse-run evidence or
  invoke retry/confirmation operations;
- exercised confirmation in a rolled-back transaction: an incomplete mapping
  was rejected, a valid human-reviewed mapping saved audit/alias/profile
  suggestion data, and neither raw-meat items nor stock movements changed;
- deployed `supplier-quote-ingest` version 7 after a bundle-only check;
- verified anonymous upload returns 401, non-PDF upload returns 400, a valid PDF
  creates one parse run, and an identical SHA-256 returns the same document
  without another run. The 50 MB boundary remains covered by the deterministic
  function test rather than sending a large test object;
- verified two consecutive atomic publications replace only unconfirmed
  candidates and preserve the confirmed line and confirmed document status;
- verified a malformed PDF enters `parse_failed`, returns a sanitized retryable
  diagnostic, recovers on the next attempt after the test object is repaired,
  and reusing its idempotency key does not add another run;
- verified AI fallback disabled reports `disabled`; enabled without provider
  configuration reports `unconfigured` while deterministic candidates and the
  review flow remain available; restored the remote flag to `false`;
- removed all three smoke-test documents and storage objects, then confirmed the
  project returned to two documents, zero smoke objects, and zero confirmed
  lines.

During the original smoke check, no provider call was made because the project
did not yet have a supplier-quote AI endpoint, key, or model configured.

## OpenAI configuration follow-up

On 2026-08-23, the OpenAI Responses adapter was updated to use strict structured
outputs through `text.format`, validate returned block/cell evidence, and read
the resulting JSON from `output_text`. At that point, server-side Supabase
secrets selected the OpenAI Responses endpoint and `gpt-5.6-luna`; the key was
stored only as an Edge Function secret.

The minimal connectivity request reached OpenAI but returned
`insufficient_quota`. Consequently `SUPPLIER_QUOTE_AI_ENABLED` remains `false`;
deterministic recognition and manual review are unaffected. After API billing or
credits are available, rerun the enabled smoke check before changing the flag to
`true`.

## DeepSeek configuration follow-up

On 2026-08-23, the provider-neutral adapter added DeepSeek Chat Completions JSON
Output support using `deepseek-v4-flash`, disabled thinking mode and bounded
retry. The local key passed a minimal 42-token connectivity request. Supabase
server-side secrets were then switched to DeepSeek. The deployed code completed
a live isolated PDF smoke test with HTTP 200, `aiStatus=ok`, one review candidate
and document status `review`; the current Edge Function is version 25 and ACTIVE.
The exact test document, parse data and private Storage object were removed after
the check. Empty, malformed or unverifiable model output still fails closed and
leaves deterministic recognition available.
