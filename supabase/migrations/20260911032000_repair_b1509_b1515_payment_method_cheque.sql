-- B-1509 / B-1515: Shopify gateway mapped to Bank Transfer, but Bubble recorded Cheque.
-- Prefer Bubble's payment method on the active Shopify payment row.

with targets as (
  select
    p.id as shopify_payment_id,
    b.payment_method_id,
    b.payment_method_legacy_id
  from public.payments p
  join public.orders o on o.id = p.order_id
  join public.payments b
    on b.order_id = p.order_id
   and b.legacy_id not like 'shopify:%'
   and b.amount = p.amount
   and b.currency = p.currency
  where p.legacy_id like 'shopify:%'
    and p.voided_at is null
    and o.order_number in ('B-1509', 'B-1515')
    and b.payment_method_id is not null
)
update public.payments p
set
  payment_method_id = t.payment_method_id,
  payment_method_legacy_id = t.payment_method_legacy_id,
  updated_at = now()
from targets t
where p.id = t.shopify_payment_id
  and (
    p.payment_method_id is distinct from t.payment_method_id
    or p.payment_method_legacy_id is distinct from t.payment_method_legacy_id
  );
