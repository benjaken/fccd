-- Repair FAQ seeds duplicated by a partial customer-service migration deploy.
-- Keep the first row for each localized question, then enforce idempotency.

with ranked as (
  select
    id,
    row_number() over (
      partition by locale, question
      order by created_at, id
    ) as duplicate_number
  from public.customer_faqs
)
delete from public.customer_faqs faq
using ranked
where faq.id = ranked.id
  and ranked.duplicate_number > 1;

create unique index if not exists customer_faqs_locale_question_uidx
  on public.customer_faqs (locale, question);
