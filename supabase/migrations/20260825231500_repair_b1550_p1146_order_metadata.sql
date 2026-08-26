-- Repair Bubble metadata and product snapshots that were skipped when these
-- orders first arrived. The statements are idempotent so the migration is safe
-- after either a partial manual repair or a later successful backfill.

with affected_orders as (
  select id, legacy_id
  from public.orders
  where legacy_id in (
    '1787565014118x333879045829278400', -- B-1550
    '1787625673893x670328831329960000', -- B-1550A
    '1787627402294x569370731226071040', -- B-1550B
    '1787627698416x727309511330365400', -- B-1550C
    '1787583265129x915013714746593100'  -- P-1146
  )
), bento_tag as (
  select id
  from public.order_tags
  where legacy_id = '1696415991439x883441360245358600'
)
insert into public.order_tag_assignments (order_id, order_tag_id)
select affected.id, bento_tag.id
from affected_orders affected
cross join bento_tag
where affected.legacy_id in (
  '1787565014118x333879045829278400',
  '1787625673893x670328831329960000',
  '1787627402294x569370731226071040',
  '1787627698416x727309511330365400'
)
on conflict (order_id, order_tag_id) do nothing;

with district_source(order_legacy_id, district_legacy_id) as (
  values
    ('1787565014118x333879045829278400', '1712304371419x647897859441345800'),
    ('1787625673893x670328831329960000', '1712304371419x647897859441345800'),
    ('1787627402294x569370731226071040', '1712304371419x647897859441345800'),
    ('1787627698416x727309511330365400', '1712304371419x647897859441345800'),
    ('1787583265129x915013714746593100', '1712304371274x276162409933922140')
)
update public.deliveries delivery
set district_id = district.id,
    district_legacy_id = source.district_legacy_id,
    updated_at = now()
from district_source source
join public.orders orders on orders.legacy_id = source.order_legacy_id
join public.delivery_districts district
  on district.legacy_id = source.district_legacy_id
where delivery.order_id = orders.id
  and delivery.district_id is null;

with district_source(order_legacy_id, district_legacy_id) as (
  values
    ('1787565014118x333879045829278400', '1712304371419x647897859441345800'),
    ('1787625673893x670328831329960000', '1712304371419x647897859441345800'),
    ('1787627402294x569370731226071040', '1712304371419x647897859441345800'),
    ('1787627698416x727309511330365400', '1712304371419x647897859441345800'),
    ('1787583265129x915013714746593100', '1712304371274x276162409933922140')
)
insert into public.deliveries (
  legacy_id,
  order_id,
  order_legacy_id,
  district_id,
  district_legacy_id,
  shipping_method_id,
  shipping_method_legacy_id,
  delivery_at,
  delivery_time,
  ship_out_time,
  delivery_status,
  bubble_created_at,
  bubble_modified_at
)
select
  'bubble-order-fallback-delivery-' || orders.legacy_id,
  orders.id,
  orders.legacy_id,
  district.id,
  source.district_legacy_id,
  orders.shipping_method_id,
  orders.shipping_method_legacy_id,
  orders.delivery_at,
  orders.delivery_time,
  orders.ship_out_time,
  orders.delivery_status,
  orders.bubble_created_at,
  orders.bubble_modified_at
from district_source source
join public.orders orders on orders.legacy_id = source.order_legacy_id
join public.delivery_districts district
  on district.legacy_id = source.district_legacy_id
where orders.document_type = 'order'
  and not exists (
    select 1 from public.deliveries existing where existing.order_id = orders.id
  )
on conflict (legacy_id) do nothing;

update public.order_lines line
set sku_snapshot = coalesce(
      nullif(btrim(line.sku_snapshot), ''),
      nullif(btrim(product.sku), '')
    ),
    product_name_snapshot = coalesce(
      nullif(btrim(line.product_name_snapshot), ''),
      nullif(btrim(product.name), ''),
      nullif(btrim(product.chinese_name), '')
    ),
    updated_at = now()
from public.products product,
     public.orders orders
where line.product_id = product.id
  and orders.id = line.order_id
  and orders.legacy_id in (
    '1787565014118x333879045829278400',
    '1787625673893x670328831329960000',
    '1787627402294x569370731226071040',
    '1787627698416x727309511330365400',
    '1787583265129x915013714746593100'
  )
  and (
    nullif(btrim(line.sku_snapshot), '') is null
    or nullif(btrim(line.product_name_snapshot), '') is null
  );

-- The order list reads the planned district before a delivery is generated.
-- Backfill it from the first delivery for sent orders such as P-1146.
update public.orders orders
set delivery_district_id = (
      select current_delivery.district_id
      from public.deliveries current_delivery
      where current_delivery.order_id = orders.id
        and current_delivery.district_id is not null
      order by current_delivery.created_at, current_delivery.id
      limit 1
    ),
    updated_at = now()
where orders.delivery_district_id is null
  and exists (
    select 1
    from public.deliveries current_delivery
    where current_delivery.order_id = orders.id
      and current_delivery.district_id is not null
  );
