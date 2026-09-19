# WATI historical conversation import (learning)

`wati-customer-service-backfill` pulls past WhatsApp conversations from the
WATI API into FCCD so the daily customer-service learning report can propose FAQ
answers from real human operator replies. The live bot never sees this data.

## Why a separate table

The live bot builds its 30-day context from `public.customer_service_messages`
(`wati-customer-service/index.ts`, `loadCustomerServiceContextMessages`).
Imported history therefore goes to
`public.customer_service_learning_import_messages` instead. The daily report
(`customer-service-daily-report`) reads both tables and merges them with
`mergeLearningMessages`, deduplicating by `(source_message_id, role)` so a
message captured live and backfilled later is only counted once.

Both import tables are service-role only.

## Tables

| Table | Purpose |
| --- | --- |
| `customer_service_learning_import_messages` | Sanitized historical messages, unique on `(environment, source_message_id, role)` |
| `customer_service_learning_import_runs` | One row per invocation with status, counts, and per-phone errors |

Message rows store the original WATI timestamp in `created_at`, so re-running the
daily report for a past `report_date` processes that day's imported history.

## WATI endpoints used

1. History import uses `GET /api/v1/getMessages/{phone}` only. The v3-by-phone
   messages endpoint returns the latest *open* conversation, so a 200 from v3
   would silently drop older chats.
2. Contact enumeration: `GET /api/ext/v3/contacts`, falling back to
   `GET /api/v1/getContacts`.
3. The settings-page **診斷** button still probes v3-by-phone, v1 events, and
   v3-by-conversation so operators can see which feed actually has data.

Credentials are the existing `WATI_API_ENDPOINT` plus `WATI_ACCESS_TOKEN`
(preferred) and `WATI_API_TOKEN` (fallback), tried in that order — the same
order the live bot uses. A token rejected with `401` is skipped in favour of the
next one, and if every token is rejected the adapter falls back from the v3 to
the v1 endpoints. An optional `WATI_TENANT_ID` overrides the tenant inferred
from the endpoint.

Role mapping: inbound messages become `customer`; outbound messages whose local
id starts with `fcc-bot-` become `assistant`; other outbound messages with an
operator email or a non-bot operator name become `human`. Text is redacted by
`sanitizeCustomerServiceContextText`, so emails, phone numbers, and addresses are
never stored.

## Triggering a backfill

The function authorizes with the `x-cron-secret` header matching
`CUSTOMER_SERVICE_IMPORT_CRON_SECRET` (falling back to
`CUSTOMER_SERVICE_REPORT_CRON_SECRET` / `WATI_ORDER_CRON_SECRET`), or with an
authenticated user who has customer-service page access.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/wati-customer-service-backfill" \
  -H "x-cron-secret: $CUSTOMER_SERVICE_IMPORT_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"since":"2025-01-01T00:00:00Z","max_phones":25,"max_runtime_ms":100000}'
```

Request fields:

| Field | Meaning |
| --- | --- |
| `phones` | Optional explicit list; when omitted the WATI contact list is enumerated |
| `since` / `until` | Optional ISO window; messages outside it are skipped |
| `max_phones` | Optional cap for enumerated contacts; omitted means the full contact list |
| `max_runtime_ms` | Wall-clock budget before returning `done: false` (default 100s, max 150s) |
| `concurrency` | Phones fetched in parallel per wave (default 4, max 8) |
| `cursor` | Resume payload: `{ phone_index, phones }`. Echo `next_cursor` unchanged. |

Requests are retried twice with exponential backoff on `429`/`5xx`, honouring
`Retry-After`. A wave of `concurrency` phones always runs to completion before
the cursor advances, so slow phones cannot cause skipped contacts.

When the response returns `done: false`, call it again with the same `since` /
`until` and `cursor` set to the returned `next_cursor` (it includes the phone
list so resume does not re-enumerate or skip the cap) until `done: true`.

## From the settings page

The customer FAQ page (`src/components/settings/CustomerFaqPage.tsx`) contains
an **AI 成效報告** side panel. Its **歷史對話學習** section lets an operator:

1. Pick a start and end date.
2. Click **匯入歷史對話** to backfill that window (the client follows the
   function's `next_cursor` until it reports `done`).
3. Review the imported days (message and human-reply counts from
   `customer_service_learning_import_summary`).
4. Click **產生學習建議** for a single day, or **一鍵學習最近日期** to run the
   daily report for up to the 14 most recent days that have human replies.

## After import (curl)

Run the daily learning report for each historical date you want analysed:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/customer-service-daily-report" \
  -H "x-cron-secret: $CUSTOMER_SERVICE_REPORT_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"report_date":"2025-06-01"}'
```

The report generates `customer_service_learning_suggestions`, which still
require the normal reviewed approval flow before any FAQ alias is published.
Historical human replies are learning evidence only; they are not treated as
approved policy.
