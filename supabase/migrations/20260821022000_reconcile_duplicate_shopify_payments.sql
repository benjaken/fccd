-- Reconcile receipts that were imported once from Bubble and then again from
-- Shopify. A receipt is the same only when order, amount, currency, and Hong
-- Kong payment date match. row_number pairs equal instalments one-to-one.
with ranked_shopify as (
  select
    p.id,
    p.order_id,
    p.amount,
    p.currency,
    (p.payment_at at time zone 'Asia/Hong_Kong')::date as payment_date,
    row_number() over (
      partition by p.order_id, p.amount, p.currency,
        (p.payment_at at time zone 'Asia/Hong_Kong')::date
      order by p.created_at, p.id
    ) as pair_number
  from public.payments p
  where p.voided_at is null
    and p.payment_at is not null
    and p.legacy_id like 'shopify:%'
), ranked_legacy as (
  select
    p.id,
    p.order_id,
    p.amount,
    p.currency,
    (p.payment_at at time zone 'Asia/Hong_Kong')::date as payment_date,
    row_number() over (
      partition by p.order_id, p.amount, p.currency,
        (p.payment_at at time zone 'Asia/Hong_Kong')::date
      order by p.created_at, p.id
    ) as pair_number
  from public.payments p
  where p.voided_at is null
    and p.payment_at is not null
    and p.legacy_id not like 'shopify:%'
), duplicate_pairs as (
  select
    s.id as shopify_id,
    l.id as legacy_id,
    exists (
      select 1 from public.payment_settlement_payments link
      where link.payment_id = s.id
    ) as shopify_is_reconciled,
    exists (
      select 1 from public.payment_settlement_payments link
      where link.payment_id = l.id
    ) as legacy_is_reconciled
  from ranked_shopify s
  join ranked_legacy l
    on l.order_id = s.order_id
   and l.amount = s.amount
   and l.currency = s.currency
   and l.payment_date = s.payment_date
   and l.pair_number = s.pair_number
), losers as (
  select case
    -- Never detach a receipt that is already part of a settlement.
    when shopify_is_reconciled and not legacy_is_reconciled then legacy_id
    when legacy_is_reconciled and not shopify_is_reconciled then shopify_id
    -- With neither reconciled, retain Shopify's transaction reference.
    when not shopify_is_reconciled and not legacy_is_reconciled then legacy_id
    else null
  end as payment_id
  from duplicate_pairs
)
update public.payments p
set voided_at = now(), updated_at = now()
from losers
where losers.payment_id = p.id;

-- B-1524's Bubble line total omitted 40 x HK$88 even though its unit price and
-- the single real HK$7,440 receipt both show the full order value.
update public.order_lines
set total_price = 3520, updated_at = now()
where legacy_id = '1785834546465x597395739966395400'
  and total_price is null
  and quantity = 40
  and unit_price = 88;

update public.orders
set grand_total = 7440, outstanding = 0, updated_at = now()
where legacy_id = '1785812313683x496082184211897400'
  and order_number = 'B-1524'
  and grand_total = 3920;
