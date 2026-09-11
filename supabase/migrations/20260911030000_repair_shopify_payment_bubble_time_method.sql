-- Repair active Shopify-synced payments to follow Bubble bookkeeping:
-- 1) payment_at = matching Bubble/legacy twin payment_at when present,
--    otherwise Hong Kong calendar midnight of the Shopify transaction time
-- 2) fill payment_method_id/legacy_id from the Bubble twin when Shopify left them null
--
-- Pure Bubble-only rows are intentionally left untouched.

with shopify_active as (
  select
    p.id,
    p.order_id,
    p.amount,
    p.currency,
    p.payment_at,
    p.bubble_created_at,
    p.payment_method_id,
    p.payment_method_legacy_id,
    coalesce(p.bubble_created_at, p.payment_at) as txn_at
  from public.payments p
  where p.legacy_id like 'shopify:%'
    and p.voided_at is null
), twins as (
  select distinct on (s.id)
    s.id as shopify_payment_id,
    b.payment_at as bubble_payment_at,
    b.payment_method_id as bubble_payment_method_id,
    b.payment_method_legacy_id as bubble_payment_method_legacy_id
  from shopify_active s
  join public.payments b
    on b.order_id = s.order_id
   and b.legacy_id not like 'shopify:%'
   and b.amount = s.amount
   and b.currency = s.currency
   and (
     (b.payment_at at time zone 'Asia/Hong_Kong')::date
       = (s.txn_at at time zone 'Asia/Hong_Kong')::date
     or (b.payment_at at time zone 'Asia/Hong_Kong')::date
       = (s.payment_at at time zone 'Asia/Hong_Kong')::date
   )
  order by
    s.id,
    (b.voided_at is null) desc,
    b.created_at nulls last,
    b.id
), repaired as (
  select
    s.id,
    coalesce(
      t.bubble_payment_at,
      (
        ((s.txn_at at time zone 'Asia/Hong_Kong')::date::timestamp)
        at time zone 'Asia/Hong_Kong'
      )
    ) as next_payment_at,
    coalesce(s.payment_method_id, t.bubble_payment_method_id) as next_payment_method_id,
    coalesce(
      s.payment_method_legacy_id,
      t.bubble_payment_method_legacy_id
    ) as next_payment_method_legacy_id
  from shopify_active s
  left join twins t on t.shopify_payment_id = s.id
)
update public.payments p
set
  payment_at = r.next_payment_at,
  payment_method_id = r.next_payment_method_id,
  payment_method_legacy_id = r.next_payment_method_legacy_id,
  updated_at = now()
from repaired r
where p.id = r.id
  and (
    p.payment_at is distinct from r.next_payment_at
    or p.payment_method_id is distinct from r.next_payment_method_id
    or p.payment_method_legacy_id is distinct from r.next_payment_method_legacy_id
  );
