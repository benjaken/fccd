# Frozen supplier PDF recognition deployment

The recognition pipeline is safe with AI fallback disabled. Deterministic PDF
extraction, profile mapping, validation, matching and manual review remain
available; AI only receives low-coverage layout blocks and can only return
unconfirmed candidates.

## Deployment order

1. Apply `20260822230000_improve_frozen_supplier_pdf_recognition.sql` before
   deploying `supplier-quote-ingest`.
2. Deploy the Edge Function with `SUPPLIER_QUOTE_AI_ENABLED=false`.
3. Upload the three redacted fixtures in a test project and verify page evidence,
   TBA/null handling, date conflicts and separate variants.
4. Configure a structured-JSON provider with server-side secrets, then enable AI
   only in the test project. Never add the provider key to a `VITE_` variable.
5. Disable `SUPPLIER_QUOTE_AI_ENABLED` immediately if provider latency, cost or
   output quality is outside the configured limits. No rollback of documents or
   confirmed quote lines is required.

## Server-side settings

| Variable | Default | Purpose |
| --- | ---: | --- |
| `SUPPLIER_QUOTE_MAX_FILE_BYTES` | `52428800` | PDF upload limit (50 MB) |
| `SUPPLIER_QUOTE_MAX_EXTRACTION_BYTES` | `300000` | Maximum inline extraction IR; larger IR is stored privately |
| `SUPPLIER_QUOTE_AI_ENABLED` | `false` | Feature flag for AI fallback |
| `SUPPLIER_QUOTE_AI_PROVIDER` | unset | Provider audit label |
| `SUPPLIER_QUOTE_AI_ENDPOINT` | unset | Structured recognition endpoint |
| `SUPPLIER_QUOTE_AI_MODEL` | unset | Model/version label |
| `SUPPLIER_QUOTE_AI_API_KEY` | unset | Server-only provider secret |
| `SUPPLIER_QUOTE_AI_TIMEOUT_MS` | `12000` | Per-attempt timeout |
| `SUPPLIER_QUOTE_AI_MAX_RETRIES` | `1` | Retry ceiling |
| `SUPPLIER_QUOTE_AI_MAX_INPUT_CHARS` | `80000` | Layout-fragment input ceiling |
| `SUPPLIER_QUOTE_AI_MAX_COST_USD` | `0.25` | Per-document configured cost ceiling |

Provider failure, malformed JSON, timeout, missing configuration or a disabled
flag all fail closed. Deterministic candidates are still published for manual
review. Provider requests contain page numbers, cell text and bounding boxes;
they do not contain the original PDF, private storage paths/URLs, client secrets
or unrelated pages.

For OpenAI, use `https://api.openai.com/v1/responses`. The adapter sends the
candidate schema through Responses API `text.format`, disables response storage,
and reads the structured JSON from `output_text`. `gpt-5.6-luna` is the default
deployment choice for this cost-sensitive extraction fallback; change the model
secret independently if a higher-quality tier is required.

For DeepSeek, use `https://api.deepseek.com/chat/completions` with
`deepseek-v4-flash`. The adapter requests JSON Output, includes the complete
candidate shape in the system message, disables thinking mode, and reads
`choices[0].message.content`. DeepSeek can occasionally return empty content in
JSON mode, so keep at least one bounded retry; persistent empty or invalid output
fails closed and leaves deterministic recognition available for review.

## Targeted checks

Run the supplier quote Vitest files, the affected TypeScript check, and the Edge
Function type check in an environment with Deno or Supabase CLI. The repository
test verifies both AI-disabled and mocked-AI-enabled modes. Apply the migration
to a disposable Supabase test project before running authorization/RPC smoke
checks; do not apply an unreviewed migration directly to production.

For the test-project smoke check, confirm:

- unauthorized users cannot upload, read parse-run evidence or retry;
- duplicate SHA-256 upload returns the existing document;
- empty-text PDFs enter `ocr_required`;
- retries create a new parse run and preserve confirmed lines;
- date/supplier conflicts require an explicit user confirmation;
- disabling AI leaves deterministic parsing, manual review and historical quote
  reads operational.
