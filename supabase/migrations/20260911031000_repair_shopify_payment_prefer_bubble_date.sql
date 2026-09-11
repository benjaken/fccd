-- Prefer Bubble/legacy payment_at over the Shopify transaction calendar day.
-- Same order + amount + currency is enough to identify the twin; dates may
-- differ (B-1515: Bubble 2026-08-20 vs Shopify txn 2026-08-24).

with shopify_active as (
  select p.id, p.order_id, p.amount, p.currency, p.payment_at
  from public.payments p
  where p.legacy_id like 'shopify:%'
    and p.voided_at is null
), twins as (
  select distinct on (s.id)
    s.id as shopify_payment_id,
    b.payment_at as bubble_payment_at
  from shopify_active s
  join public.payments b
    on b.order_id = s.order_id
   and b.legacy_id not like 'shopify:%'
   and b.amount = s.amount
   and b.currency = s.currency
  order by
    s.id,
    (b.voided_at is null) desc,
    b.created_at nulls last,
    b.id
)
update public.payments p
set
  payment_at = t.bubble_payment_at,
  updated_at = now()
from twins t
where p.id = t.shopify_payment_id
  and p.payment_at is distinct from t.bubble_payment_at;
