-- Give existing Bubble/imported purchase rows the same record identity that
-- new web submissions use. Legacy rows have no invoice-level identifier, so
-- each historical Hong Kong date / restaurant / supplier tuple is treated as
-- one legacy purchase record.
with legacy_groups as (
  select
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date as record_date,
    purchase.restaurant_id,
    purchase.supplier_id,
    gen_random_uuid() as purchase_record_id
  from public.restaurant_supplier_purchases purchase
  where purchase.purchase_record_id is null
  group by
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date,
    purchase.restaurant_id,
    purchase.supplier_id
)
update public.restaurant_supplier_purchases purchase
set purchase_record_id = legacy_groups.purchase_record_id
from legacy_groups
where purchase.purchase_record_id is null
  and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date is not distinct from legacy_groups.record_date
  and purchase.restaurant_id is not distinct from legacy_groups.restaurant_id
  and purchase.supplier_id is not distinct from legacy_groups.supplier_id;
